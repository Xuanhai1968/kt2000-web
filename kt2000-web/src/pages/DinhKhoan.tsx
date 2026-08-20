import { useEffect, useMemo, useRef, useState } from "react";
import { Navigate } from "react-router-dom";
import { Button, Select, Input, Checkbox, Modal, Tag, Tooltip, Typography, message } from "antd";
import { AgGridReact } from "ag-grid-react";
import type { ColDef, CellStyle } from "ag-grid-community";
import {
  getAdminTenants, dkLayTenHang, dkLayDongHoaDon, dkCapNhat, dkLayDanhMucTk,
  dkAutoNew, dkDayTrain, dkHuanLuyen, dkLayChoGiaiThich, dkGiaiThich, loiApi,
} from "../api";
import type { DkTenHang, DkDongHoaDon, DkChoGiaiThich, DkTaiKhoan } from "../api";
import { useAuth } from "../AuthContext";
import { themeVfp, luoiVfpProps, colVfp, dinhDang4SoLe, nhoDoRongCot } from "../theme/luoiVfp";
import "./dinh-khoan.css";

// Đơn vị được phép mở màn này. PHẢI khớp CO_DINH_KHOAN trong AppShell — ẩn menu thôi
// là chưa đủ, gõ thẳng /app/dinh-khoan vào thanh địa chỉ vẫn vào được (Trường thử
// 19/08). Đây vẫn chỉ là lớp TIỆN DỤNG: chặn thật phải gate bằng claim ở backend khi
// nối API, giống mọi endpoint khác (BR-NB-06).
const CO_DINH_KHOAN = ["MDN_NB"];

// ===================== ĐỊNH KHOẢN =====================
//
// BẢY BƯỚC người dùng thật sự làm (Trường mô tả lại 20/08). Bố cục màn này bám đúng
// thứ tự đó, không phải thứ tự nào khác:
//
//   1. Tick MỘT đơn vị → Nạp dữ liệu
//   2. Auto Accounting New → máy tự định khoản TOÀN BỘ
//   3. Soi hai cột ĐK gốc và Định khoản để xem máy đoán có đúng không
//   4. Đánh dấu lần lượt — mỗi lần bấm quét tiếp một cụm tên hàng gốc
//   5. Xác nhận đúng → good_pred = 1 cho những cái đang đánh dấu
//   6. Cái nào sai thì gõ tài khoản đúng vào ô "Định khoản đúng" rồi Update về Data
//      Training (nó sửa sổ TRƯỚC, đẩy Data Training SAU)
//   6.1 Mặt hàng từng xác nhận đúng mà lần này sửa khác → giữ lại bắt giải thích
//   7. Chọn cặp ĐK gốc / Máy đoán rồi bấm Lọc dữ liệu cho nhẹ máy và dễ nhìn
//
// BỐN LUẬT NGHIỆP VỤ chi phối bố cục:
//
// (a) VÀO sửa ghi_no, RA sửa ghi_co — KHÔNG bao giờ cả hai. Backend tự chọn vế theo
//     cột V/R, màn hình không phải biết. Vế đối ứng do máy đoán đặt cứng: V → ghi_co
//     331, R → ghi_no 632.
//
// (b) Cùng một mặt hàng mà định khoản HAI kiểu khác nhau = xung đột. Bản ghi đó vẫn
//     lưu nhưng KHÔNG vào dữ liệu huấn luyện cho tới khi người dùng giải thích vì sao
//     lần này khác. Khớp với status 'CHO_GIAI_THICH' của DK_DATA_TRAIN (commit
//     127f9408) — export train chỉ lấy 'ACTIVE'.
//
// (c) Đánh dấu theo TÊN GỐC: một tên hàng ở lưới trên đẻ ra nhiều dòng hoá đơn. Sửa
//     một lần ăn cho mọi dòng mang tên đó — cách duy nhất soi nổi vài nghìn dòng.
//
// (d) Máy đoán KHÔNG đụng vào mặt hàng đã xác nhận đúng (good_pred = 1). Đó là công
//     sức của kế toán, không phải chỗ cho model thử lại. Bỏ lằn ranh này là mỗi lần
//     bấm Auto lại xoá sạch công soi của cả tuần.
//
// dk_goc: chụp giá trị định khoản ĐẦU TIÊN, chỉ ghi MỘT LẦN khi cột còn trống. Nó là
// mốc để biết máy đã đè lên cái gì — mất nó thì không truy ngược được. Cả máy đoán lẫn
// người sửa đều chụp trước khi ghi đè.
//
// Nguồn dữ liệu:
//   • KT2000_PUB.DK_DATA_TRAIN / DK_BLACKLIST / DK_AUDIT_LOG (Data Training chung)
//   • HOA_DON_LINE.is_predict / good_pred / proba / dk_goc / ghi_no / ghi_co
//   • Model: MODELS_DIR\model_v3.joblib, gọi qua tools\dinh_khoan\predict.py

interface DonVi {
  stt: number;
  maDonVi: string;
  run: boolean;
  tenDayDu: string;
}

// Ô tích tự vẽ. AG Grid Community không có cột checkbox thường, mà kéo cả bản Enterprise
// về chỉ vì hai cột này thì không đáng. Dùng CHUNG cho cột Run và cột Dấu — hai chỗ cùng
// là "bấm để chọn" nên phải nhìn giống hệt nhau.
const O_TICH = "☑";
const O_TRONG = "☐";
const STYLE_O_TICH = {
  textAlign: "center", cursor: "pointer", fontWeight: 700, fontSize: 14,
} as CellStyle;

// Toàn bộ cách màn này vận hành, gói vào tooltip của nút "i" cạnh Auto Accounting New.
// Trước đây nó nằm dưới chân màn hình và chiếm ba dòng vĩnh viễn, trong khi người cần
// đọc thì đang nhìn cái nút chứ không nhìn xuống chân trang.
//
// KHÔNG ghi cứng con số độ chính xác ở đây: nó đổi sau mỗi lần huấn luyện, mà một con
// số ghi cứng thì chỉ đúng đúng một lần rồi sai mãi mãi. Số thật hiện trong thông báo
// ngay sau khi bấm "Huấn luyện dữ liệu".
const GIAI_THICH = (
  <div style={{ fontSize: 12, lineHeight: 1.6 }}>
    <div>
      <b>Auto Accounting New</b> chạy model (<code>model_v3.joblib</code>) cho mọi mặt
      hàng chưa xác nhận, ghi thẳng <code>ghi_no</code>/<code>ghi_co</code> và chụp{" "}
      <code>dk_goc</code> trước khi đè. Mặt hàng đã xác nhận đúng thì không đụng tới.
    </div>
    <div style={{ marginTop: 6 }}>
      <b>Mark Is Predict OK</b> đặt <code>good_pred = 1</code>, không đẩy về Data Training.
    </div>
    <div style={{ marginTop: 6 }}>
      <b>Update về Data Training</b> sửa sổ trước rồi đẩy vào{" "}
      <code>KT2000_PUB.DK_DATA_TRAIN</code>, lọc qua <code>DK_BLACKLIST</code>, để vết ở{" "}
      <code>DK_AUDIT_LOG</code>. Mặt hàng đổi định khoản so với lần trước bị giữ lại ở{" "}
      <code>CHO_GIAI_THICH</code> cho tới khi có lý do. Dòng ghi chú dính danh sách đen
      được đóng vào <code>154</code> và đánh dấu xong luôn, không vào Data Training.
    </div>
    <div style={{ marginTop: 6 }}>
      <b>Auto Accounting New KHÔNG huấn luyện lại</b> — nó chỉ đọc model có sẵn. Muốn
      model học cái vừa dạy thì bấm <b>Huấn luyện dữ liệu</b>.
    </div>
  </div>
);

export default function DinhKhoan() {
  const { session } = useAuth();
  const [dsDonVi, setDsDonVi] = useState<DonVi[]>([]);
  const [dangTaiDonVi, setDangTaiDonVi] = useState(false);
  const [dsTenHang, setDsTenHang] = useState<DkTenHang[]>([]);
  const [dsHoaDon, setDsHoaDon] = useState<DkDongHoaDon[]>([]);
  const [dangNap, setDangNap] = useState(false);
  const [dangTaiDong, setDangTaiDong] = useState(false);
  const [hangChon, setHangChon] = useState<DkTenHang | null>(null);
  // Đơn vị đang tick Run. Giữ ở state riêng thay vì đọc ngược từ lưới: AG Grid
  // Community không có API chọn dòng kiểu checkbox, mà đọc ngược thì lúc nào cũng
  // phải nhớ đồng bộ hai chiều.
  const [dsChon, setDsChon] = useState<string[]>([]);
  // Mặt hàng đang ĐÁNH DẤU, và tài khoản người dùng gõ đè. Khoá là maDonVi|huong|tenHang
  // — cùng khoá với getRowId của lưới, để hai bên không bao giờ lệch cách nhận dạng.
  const [daDanhDau, setDaDanhDau] = useState<Record<string, boolean>>({});
  const [daSua, setDaSua] = useState<Record<string, string>>({});
  const [chiHangMoi, setChiHangMoi] = useState(false);
  // Danh mục tài khoản (KT2000_Base.DM_TK) — để ô chọn hiện được TÊN, không chỉ con số.
  const [dsTaiKhoan, setDsTaiKhoan] = useState<DkTaiKhoan[]>([]);
  const [dkGocLoc, setDkGocLoc] = useState<string | undefined>();
  const [dkPredictLoc, setDkPredictLoc] = useState<string | undefined>();
  // Nhóm C — máy đoán + Data Training chung
  const [dangAuto, setDangAuto] = useState(false);
  const [dangDayTrain, setDangDayTrain] = useState(false);
  const [dangXacNhan, setDangXacNhan] = useState(false);
  const [dangHuanLuyen, setDangHuanLuyen] = useState(false);
  // (6) Ô nhập định khoản đúng, dùng CHUNG cho mọi mặt hàng đang đánh dấu. Gõ một lần
  // ăn cho cả loạt — đó là lý do nó nằm ngoài lưới chứ không phải trong từng dòng.
  const [tkDung, setTkDung] = useState("");
  // (7) Bộ lọc chỉ ăn khi BẤM, không ăn theo từng phím gõ: lọc trên vài nghìn dòng mà
  // vẽ lại sau mỗi lần đổi ô chọn là đúng thứ làm màn hình giật.
  const [locDangDung, setLocDangDung] =
    useState<{ goc?: string; doan?: string }>({});
  const [dsXungDot, setDsXungDot] = useState<DkChoGiaiThich[]>([]);
  const [moGiaiThich, setMoGiaiThich] = useState(false);
  const [loiGiaiThich, setLoiGiaiThich] = useState<Record<number, string>>({});
  const [dangGuiGt, setDangGuiGt] = useState(false);

  const duocVao = CO_DINH_KHOAN.includes(session?.tenant.code ?? "");

  // Cột Run đọc qua ref: columnDefs được useMemo với deps rỗng nên nếu đóng gói thẳng
  // dsChon, nó sẽ mãi thấy mảng rỗng của lượt render đầu.
  const dsChonRef = useRef<string[]>([]);
  const luoiDonViRef = useRef<AgGridReact<DonVi> | null>(null);
  useEffect(() => {
    dsChonRef.current = dsChon;
    luoiDonViRef.current?.api?.refreshCells({ columns: ["run"], force: true });
  }, [dsChon]);

  const bapChonDonVi = (maDonVi: string) =>
    setDsChon((cu) => cu.includes(maDonVi)
      ? cu.filter((x) => x !== maDonVi)
      : [...cu, maDonVi]);

  // (d) Ẩn bớt mặt hàng ĐÃ xác nhận đúng. Không tick thì hiện đủ để soi lại như thường
  // — đây là ẩn cho đỡ rối, KHÔNG phải bỏ qua.
  // (7) Cộng thêm bộ lọc cặp ĐK gốc / Máy đoán: soi một cặp mỗi lượt thì vừa nhẹ máy
  // vừa dễ nhìn hơn hẳn so với cuộn qua vài nghìn dòng lẫn lộn.
  const dsHienThi = useMemo(() => {
    let ds = chiHangMoi ? dsTenHang.filter((x) => !x.daXacNhan) : dsTenHang;
    if (locDangDung.goc) ds = ds.filter((x) => (x.dkGoc ?? "") === locDangDung.goc);
    if (locDangDung.doan) ds = ds.filter((x) => (x.dinhKhoan ?? "") === locDangDung.doan);
    return ds;
  }, [dsTenHang, chiHangMoi, locDangDung]);

  // Khoá nhận dạng một mặt hàng. DÙNG CHUNG với getRowId của lưới — hai cách nhận dạng
  // song song là chỗ chắc chắn sẽ lệch nhau.
  const khoa = (x: { maDonVi: string; huong: string; tenHang: string }) =>
    `${x.maDonVi}|${x.huong}|${x.tenHang}`;

  const danhDauRef = useRef<Record<string, boolean>>({});
  const suaRef = useRef<Record<string, string>>({});

  const luoiTenHangRef = useRef<AgGridReact<DkTenHang> | null>(null);
  useEffect(() => {
    danhDauRef.current = daDanhDau;
    suaRef.current = daSua;
    // redrawRows chứ không refreshCells: rowClassRules chỉ được đánh giá lại khi DÒNG
    // được vẽ lại. refreshCells cập nhật được ô ☑ nhưng màu nền dòng thì đứng im.
    luoiTenHangRef.current?.api?.redrawRows();
  }, [daDanhDau, daSua]);

  const bapDanhDau = (k: string) =>
    setDaDanhDau((cu) => ({ ...cu, [k]: !cu[k] }));

  const soDanhDau = useMemo(
    () => Object.values(daDanhDau).filter(Boolean).length, [daDanhDau]);
  const soSua = useMemo(
    () => Object.values(daSua).filter((v) => v.trim().length > 0).length, [daSua]);

  // (4) Đánh dấu LẦN LƯỢT. Mỗi lần bấm: nhảy tới mặt hàng chưa xử lý đầu tiên rồi đánh
  // dấu CẢ CỤM tên giống nó — nên một lần bấm thường được nhiều hơn một dòng.
  //
  // Vì sao gom theo HAI TỪ ĐẦU: lưới xếp theo tên nên các biến thể của cùng một mặt
  // hàng nằm liền nhau ("Bản mã 10 x 50", "Bản mã 180x180x10"…), và chúng gần như luôn
  // vào cùng một tài khoản. Một từ thì gom quá rộng ("Vật tư …" nuốt cả trăm dòng khác
  // loại), ba từ thì tách vụn ra thành từng dòng một, mất luôn cái lợi của việc gom.
  const CUM_SO_TU = 2;
  const cumTen = (ten: string) =>
    ten.trim().toLowerCase().split(/\s+/).filter(Boolean).slice(0, CUM_SO_TU).join(" ");

  const danhDauLanLuot = () => {
    // Bỏ qua cả cái ĐÃ xác nhận: quay lại đánh dấu thứ mình vừa gật là chạy vòng tròn.
    const conLai = dsHienThi.filter((x) => !daDanhDau[khoa(x)] && !x.daXacNhan);
    if (conLai.length === 0) {
      message.info("Đã đánh dấu hết mặt hàng đang hiện");
      return;
    }
    const cum = cumTen(conLai[0].tenHang);
    const them: Record<string, boolean> = {};
    let n = 0;
    for (const x of dsHienThi)
      if (!x.daXacNhan && cumTen(x.tenHang) === cum) { them[khoa(x)] = true; n++; }
    setDaDanhDau((cu) => ({ ...cu, ...them }));
    // Cuộn tới chỗ vừa đánh dấu — bấm mà màn hình đứng im thì không biết mình đang ở đâu.
    const i = dsHienThi.indexOf(conLai[0]);
    if (i >= 0) luoiTenHangRef.current?.api?.ensureIndexVisible(i, "middle");
    message.success(`Đánh dấu ${n} mặt hàng “${cum}…”`);
  };

  const danhDauTatCa = () => {
    const them: Record<string, boolean> = {};
    for (const x of dsHienThi) them[khoa(x)] = true;
    setDaDanhDau(them);
    message.success(`Đã đánh dấu ${dsHienThi.length} mặt hàng`);
  };

  // ===================== NHÓM C — Data Training CHUNG =====================

  // Nạp lại lưới trên từ sổ. Gọi sau MỌI lần ghi: số trên màn hình phải là số vừa ghi
  // xuống, không phải số người dùng vừa gõ.
  const napLai = async () => {
    const r = await dkLayTenHang(dsChon);
    setDsTenHang(r.data);
    if (hangChon) void hamRef.current.xemDongHoaDon(hangChon);
  };

  // (2) Auto Accounting New — máy tự định khoản TOÀN BỘ.
  // Model đoán cho mọi mặt hàng chưa ai xác nhận rồi ghi thẳng vào ghi_no/ghi_co, chụp
  // dk_goc trước. Mặt hàng đã xác nhận đúng thì KHÔNG đụng — đó là chữ "New" trong tên.
  const autoAccountingNew = async () => {
    if (dsChon.length === 0) {
      message.warning("Chưa chọn đơn vị nào — tick cột Run ở lưới bên trái");
      return;
    }
    setDangAuto(true);
    try {
      const r = await dkAutoNew(dsChon);
      message.success(r.data.message, 5);
      // Đơn vị chưa mở sổ, đơn vị ghi hỏng — phải nói ra. Im lặng thì người dùng tưởng
      // đơn vị đó không có gì để định khoản.
      for (const c of r.data.canhBao) message.warning(c, 6);
      await napLai();
    } catch (e) {
      message.error(loiApi(e, "Máy đoán không chạy được"), 8);
    } finally {
      setDangAuto(false);
    }
  };

  // Nhãn ĐÚNG của một mặt hàng theo thứ tự ưu tiên: ô Sửa của chính dòng đó → ô nhập
  // chung → định khoản máy vừa đoán. Cụ thể luôn thắng chung chung.
  const nhanDung = (x: DkTenHang) =>
    (daSua[khoa(x)] ?? "").trim() || tkDung.trim() || (x.dinhKhoan ?? "").trim();

  const dsDangDanhDau = () => dsHienThi.filter((x) => daDanhDau[khoa(x)]);

  // (5) Xác nhận: "mấy cái đang đánh dấu là ĐÚNG rồi". Chỉ đặt good_pred = 1, KHÔNG sửa
  // định khoản — tách hẳn khỏi nút sửa vì đây là hai việc khác nhau, gộp lại thì có ngày
  // bấm xác nhận mà lại đổi mất số.
  const xacNhanDung = async () => {
    const ds = dsDangDanhDau();
    if (ds.length === 0) { message.warning("Chưa đánh dấu mặt hàng nào"); return; }
    setDangXacNhan(true);
    try {
      const r = await dkCapNhat(ds.map((x) => ({
        maDonVi: x.maDonVi, huong: x.huong, tenHang: x.tenHang,
        tkMoi: null, xacNhanDung: true,
      })));
      message.success(`Đã xác nhận ${ds.length} mặt hàng — ${r.data.soDong} dòng hàng`);
      setDaDanhDau({});
      await napLai();
    } catch (e) {
      message.error(loiApi(e, "Không xác nhận được"));
    } finally {
      setDangXacNhan(false);
    }
  };

  // (6) Update về Data Training. Hai việc trong một lần bấm, và phải theo ĐÚNG thứ tự:
  //   1. Nhãn nào khác cái đang nằm trong sổ thì SỬA SỔ trước
  //   2. Rồi mới đẩy vào Data Training
  // Ngược thứ tự là model học một đằng còn sổ ghi một nẻo.
  const dayVeTrain = async () => {
    const ds = dsDangDanhDau()
      .map((x) => ({ x, nhan: nhanDung(x) }))
      .filter((r) => r.nhan.length > 0);

    if (ds.length === 0) {
      message.warning("Chưa đánh dấu mặt hàng nào có định khoản để đẩy về huấn luyện");
      return;
    }
    setDangDayTrain(true);
    try {
      const canSua = ds.filter((r) => r.nhan !== (r.x.dinhKhoan ?? "").trim());
      if (canSua.length > 0)
        await dkCapNhat(canSua.map((r) => ({
          maDonVi: r.x.maDonVi, huong: r.x.huong, tenHang: r.x.tenHang,
          tkMoi: r.nhan, xacNhanDung: true,
        })));

      const r = await dkDayTrain(ds.map((r) => ({
        maDonVi: r.x.maDonVi, huong: r.x.huong, tenHang: r.x.tenHang, label: r.nhan })));
      message.success(
        canSua.length > 0
          ? `Sửa ${canSua.length} mặt hàng trong sổ · ${r.data.message}`
          : r.data.message, 5);

      setDaDanhDau({}); setDaSua({}); setTkDung("");
      await napLai();
      // (6.1) Có xung đột thì mở luôn ô giải thích: để người dùng tự đi tìm thì nó nằm
      // đó mãi, mà nằm đó = không bao giờ vào model.
      if (r.data.xungDot > 0) await moManGiaiThich();
    } catch (e) {
      message.error(loiApi(e, "Không đẩy được về dữ liệu huấn luyện"));
    } finally {
      setDangDayTrain(false);
    }
  };

  // Huấn luyện lại model từ Data Training. Đây là việc DUY NHẤT khiến những gì bạn dạy hôm
  // nay đi vào model — Auto Accounting New chỉ ĐỌC model có sẵn, không học gì cả.
  //
  // Hỏi xác nhận trước vì hai lẽ: nó mất khoảng một phút, và nó ghi đè model dùng chung
  // cho MỌI đơn vị chứ không riêng đơn vị đang chọn.
  const huanLuyen = () => {
    Modal.confirm({
      title: "Huấn luyện lại model?",
      width: 560,
      content: (
        <div>
          <p style={{ marginTop: 0 }}>
            Đọc toàn bộ dữ liệu huấn luyện đang ở trạng thái <b>ACTIVE</b> rồi dựng lại
            model. Mất khoảng <b>một phút</b>, trong lúc đó đừng đóng trang.
          </p>
          <p style={{ marginBottom: 0 }}>
            Model là <b>của chung mọi đơn vị</b> — huấn luyện lại thì mọi đơn vị đều
            dùng bản mới, không riêng đơn vị bạn đang chọn.
          </p>
        </div>
      ),
      okText: "Huấn luyện",
      cancelText: "Thôi",
      onOk: async () => {
        setDangHuanLuyen(true);
        try {
          const r = await dkHuanLuyen();
          message.success(r.data.message, 10);
        } catch (e) {
          message.error(loiApi(e, "Không huấn luyện được"), 10);
        } finally {
          setDangHuanLuyen(false);
        }
      },
    });
  };

  const moManGiaiThich = async () => {
    try {
      const r = await dkLayChoGiaiThich();
      setDsXungDot(r.data);
      setLoiGiaiThich({});
      setMoGiaiThich(true);
      if (r.data.length === 0) message.info("Không có xung đột nào đang chờ giải thích");
    } catch (e) {
      message.error(loiApi(e, "Không đọc được danh sách xung đột"));
    }
  };

  // (b) Gửi lý do. Backend đòi tối thiểu 10 ký tự — cho gõ "ok" thì ô này thành thủ tục
  // bấm cho xong, mà nó lại là thứ duy nhất chặn dữ liệu bẩn vào model.
  const guiGiaiThich = async () => {
    const ds = dsXungDot
      .map((x) => ({ id: x.id, moTa: (loiGiaiThich[x.id] ?? "").trim() }))
      .filter((x) => x.moTa.length > 0);
    if (ds.length === 0) { message.warning("Chưa viết lý do nào"); return; }

    setDangGuiGt(true);
    try {
      let ok = 0;
      const hong: string[] = [];
      for (const x of ds) {
        try { await dkGiaiThich(x.id, x.moTa); ok++; }
        catch (e) { hong.push(loiApi(e, `Dòng ${x.id}`)); }
      }
      if (ok > 0) message.success(`Đã ghi lý do cho ${ok} dòng — chúng sẽ vào model`);
      // Báo rõ cái nào hỏng thay vì nuốt: gửi 5 dòng mà chỉ 3 dòng vào được thì người
      // dùng phải biết, không thì hai dòng kia mất tăm mà ai cũng tưởng đã xong.
      if (hong.length > 0) message.error(`${hong.length} dòng không ghi được: ${hong[0]}`);
      const r = await dkLayChoGiaiThich();
      setDsXungDot(r.data);
      if (r.data.length === 0) setMoGiaiThich(false);
    } finally {
      setDangGuiGt(false);
    }
  };

  // TỰ đọc danh sách đơn vị ngay khi mở màn (chốt Trường 19/08) — bắt người dùng bấm
  // một nút chỉ để có thứ vốn luôn cần là thừa một thao tác.
  // Lấy CẢ đơn vị nội bộ: định khoản chạy cho mọi đơn vị, không riêng đơn vị thuế.
  useEffect(() => {
    if (!duocVao) return;
    let huy = false;
    // Bọc async và await một nhịp: bật cờ "đang tải" ngay trong thân effect thì React
    // coi là render dây chuyền (react-hooks/set-state-in-effect). Cùng cách đã dùng ở
    // DanhSachHoaDon.taiDoiChieu.
    void (async () => {
      await Promise.resolve();
      if (huy) return;
      setDangTaiDonVi(true);
      try {
        // Hai thứ độc lập nhau, đi song song: danh mục tài khoản hỏng thì vẫn phải có
        // danh sách đơn vị để làm việc, và ngược lại.
        const [r, rTk] = await Promise.all([
          getAdminTenants(true),
          dkLayDanhMucTk().catch(() => ({ data: [] as DkTaiKhoan[] })),
        ]);
        if (huy) return;
        setDsDonVi(r.data
          .filter((t) => t.isActive)
          .map((t, i) => ({ stt: i + 1, maDonVi: t.code, run: false, tenDayDu: t.name })));
        setDsTaiKhoan(rTk.data);
      } catch (e) {
        if (!huy) message.error(loiApi(e, "Không đọc được danh sách đơn vị"));
      } finally {
        if (!huy) setDangTaiDonVi(false);
      }
    })();
    // Dọn khi rời màn: người dùng bấm sang trang khác giữa chừng thì đừng setState nữa.
    return () => { huy = true; };
  }, [duocVao]);

  // Mã tài khoản → tên, tra từ DM_TK.
  const tenTk = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of dsTaiKhoan) m.set(t.maTk, t.tenTk);
    return m;
  }, [dsTaiKhoan]);

  // DM_TK.displayname ĐÃ chứa sẵn mã ("156 - Hàng hoá"), nên ghép thêm mã nữa là ra
  // "156 — 156 - Hàng hoá". Chỉ ghép khi tên chưa mở đầu bằng chính mã đó.
  const ghepNhan = (ma: string, ten: string | undefined) =>
    !ten ? ma : ten.startsWith(ma) ? ten : `${ma} — ${ten}`;

  const nhanTk = (ma: string) => ghepNhan(ma, tenTk.get(ma));

  // HAI Ô LỌC — CHỈ lấy từ DỮ LIỆU THẬT, không dính dáng gì tới Data Training (chốt Trường
  // 20/08). Trước đây tôi trộn thêm bảy nhãn gán cứng lấy từ dk_core.VALID_LABELS; đó
  // chính là chỗ Data Training lẫn vào, và nó đẻ ra những lựa chọn lọc xong ra 0 dòng.
  //   ĐK gốc   → cột dk_goc của HOA_DON_LINE
  //   Máy đoán → cột ghi_no (hàng vào) / ghi_co (hàng ra)
  // Tên tài khoản vẫn tra từ DM_TK cho dễ đọc — DM_TK là danh mục thật của hệ thống,
  // không phải dữ liệu huấn luyện.
  const optLoc = (lay: (x: DkTenHang) => string | null) => {
    const co = new Set<string>();
    for (const x of dsTenHang) {
      const v = lay(x)?.trim();
      if (v) co.add(v);
    }
    return [...co].sort().map((v) => ({ value: v, label: nhanTk(v) }));
  };

  const optDkGoc = useMemo(() => optLoc((x) => x.dkGoc),
    [dsTenHang, tenTk]);   // eslint-disable-line react-hooks/exhaustive-deps
  const optDoan = useMemo(() => optLoc((x) => x.dinhKhoan),
    [dsTenHang, tenTk]);   // eslint-disable-line react-hooks/exhaustive-deps

  // Ô ĐỊNH KHOẢN ĐÚNG: liệt ĐỦ danh mục. Người dùng đang sửa cái máy đoán sai, nên tài
  // khoản đúng hoàn toàn có thể là cái chưa từng xuất hiện trong dữ liệu.
  const optTkDayDu = useMemo(
    () => dsTaiKhoan.map((t) => ({ value: t.maTk, label: ghepNhan(t.maTk, t.tenTk) })),
    [dsTaiKhoan]);    

  const cotDonVi = useMemo<ColDef<DonVi>[]>(() => [
    { colId: "stt", headerName: "STT", field: "stt", width: 56 },
    { colId: "maDonVi", headerName: "Đơn vị", field: "maDonVi", width: 130 },
    // Cột Run: bấm để chọn/bỏ đơn vị. AG Grid Community không có checkbox cột thường
    // nên tự vẽ ô tích — vừa đủ dùng, khỏi kéo thêm Enterprise.
    // Vẽ CẢ ô rỗng ☐ chứ không để trống: ô trống trơn thì không ai đoán được là bấm
    // vào được, còn ☐ thì nhìn phát biết ngay đây là chỗ tích.
    { colId: "run", headerName: "Run", field: "run", width: 54,
      valueGetter: (p) => (p.data && dsChonRef.current.includes(p.data.maDonVi) ? O_TICH : O_TRONG),
      cellStyle: STYLE_O_TICH,
      headerTooltip: "Bấm để chọn đơn vị đem chạy định khoản" },
    { colId: "tenDayDu", headerName: "Tên đầy đủ", field: "tenDayDu", width: 240,
      tooltipField: "tenDayDu" },
  ], []);

  // Bỏ cột Đơn vị: đã phải chọn đơn vị rồi mới định khoản được, nhắc lại ở mọi dòng là
  // tốn chỗ. Dữ liệu vẫn còn trong `maDonVi` — khoá dòng và câu lệnh ghi vẫn dùng nó.
  const cotTenHang = useMemo<ColDef<DkTenHang>[]>(() => [
    // Backend đã xếp VÀO trước RA nên cột này chạy thành hai khối liền mạch, không còn
    // xen kẽ. Tô màu để ranh giới hai khối đập vào mắt.
    { colId: "huong", headerName: "V/R", field: "huong", width: 56,
      cellStyle: (p) => ({
        textAlign: "center", fontWeight: 700,
        color: p.value === "V" ? "#1677ff" : "#d4380d",
      }) as CellStyle,
      headerTooltip: "V = hàng vào (sửa ghi Nợ) · R = hàng ra (sửa ghi Có)" },
    { colId: "tenHang", headerName: "Tên hàng Gốc", field: "tenHang", width: 340,
      tooltipField: "tenHang" },
    { colId: "soDong", headerName: "Số dòng", field: "soDong", width: 80,
      type: "numericColumn",
      headerTooltip: "Bao nhiêu dòng hoá đơn mang tên hàng này" },
    { colId: "dkGoc", headerName: "ĐK gốc", field: "dkGoc", width: 80,
      headerTooltip: "Định khoản ĐẦU TIÊN đã chụp. Chỉ ghi một lần, để biết máy đè lên cái gì." },
    // Đang hiển thị định khoản THẬT trong sổ (ghi_no với hàng vào, ghi_co với hàng ra).
    // Khi nối model ở nhóm C thì đây mới là "máy đoán" — hai thứ khác nhau, đừng lẫn.
    { colId: "dinhKhoan", headerName: "Định khoản", field: "dinhKhoan", width: 100,
      headerTooltip: "Đang ghi trong sổ: ghi Nợ (hàng vào) hoặc ghi Có (hàng ra)" },
    { colId: "tinCay", headerName: "Tin cậy", field: "tinCay", width: 80,
      type: "numericColumn",
      headerTooltip: "0–1. Dưới 0,70 máy không chắc — nên soi trước." },
    // Bỏ cột "Đúng" (good_pred): mặt hàng đã xác nhận thì ẩn bằng ô "Chỉ hiện mặt hàng
    // mới", không cần thêm một cột chỉ để nhắc lại điều đó.
    //
    // Cột Dấu: ô tích, cùng kiểu với cột Run bên lưới đơn vị — hai chỗ cùng là "bấm để
    // chọn" thì phải nhìn giống nhau, không thì mỗi chỗ lại phải học lại một lần.
    { colId: "dau", headerName: "Dấu", width: 58,
      valueGetter: (p) => (p.data && danhDauRef.current[khoa(p.data)] ? O_TICH : O_TRONG),
      cellStyle: STYLE_O_TICH,
      headerTooltip: "Bấm để đánh dấu. Rồi bấm “Xác nhận đúng” hoặc “Update về Data Training”." },
    // Cột Sửa: gõ tài khoản ĐÚNG. Ghi vào ghi_no (hàng vào) hay ghi_co (hàng ra) là do
    // cột V/R quyết định — backend tự chọn vế, màn hình không phải biết.
    { colId: "sua", headerName: "Sửa", width: 80, editable: true,
      valueGetter: (p) => (p.data ? suaRef.current[khoa(p.data)] ?? "" : ""),
      valueSetter: (p) => {
        if (!p.data) return false;
        const v = String(p.newValue ?? "").trim();
        setDaSua((cu) => {
          const moi = { ...cu };
          // Xoá trắng ô = bỏ sửa, KHÔNG phải "sửa thành rỗng".
          if (v.length === 0) delete moi[khoa(p.data)];
          else moi[khoa(p.data)] = v;
          return moi;
        });
        return true;
      },
      cellStyle: { backgroundColor: "#fffbe6" } as CellStyle,
      headerTooltip: "Gõ tài khoản ĐÚNG cho RIÊNG dòng này. Bỏ trống thì dùng ô nhập chung bên dưới." },
  ], []);

  const cotHoaDon = useMemo<ColDef<DkDongHoaDon>[]>(() => [
    { colId: "maHd", headerName: "Mã HĐ", field: "maHd", width: 220, tooltipField: "maHd" },
    // Bỏ cột "Dòng" (stt_line = số thứ tự dòng trong hoá đơn gốc). Nó chỉ giúp khi phải
    // dò ngược lên tờ hoá đơn giấy, mà ở màn định khoản thì không ai làm việc đó.
    { colId: "tenHang", headerName: "Tên hàng Gốc", field: "tenHang", width: 280,
      tooltipField: "tenHang" },
    { colId: "ghiNo", headerName: "Nợ", field: "ghiNo", width: 66,
      headerTooltip: "Hàng VÀO thì đây là vế được sửa" },
    { colId: "ghiCo", headerName: "Có", field: "ghiCo", width: 66,
      headerTooltip: "Hàng RA thì đây là vế được sửa" },
    { colId: "soLuong", headerName: "S.Lượng", field: "soLuong", width: 100,
      type: "numericColumn", valueFormatter: (p) => dinhDang4SoLe(p.value) },
    { colId: "donGia", headerName: "Đ.Giá", field: "donGia", width: 110,
      type: "numericColumn", valueFormatter: (p) => dinhDang4SoLe(p.value) },
    { colId: "tenKh", headerName: "NM/NB", field: "tenKh", width: 300,
      tooltipField: "tenKh" },
    { colId: "tinCay", headerName: "Tin cậy", field: "tinCay", width: 84,
      type: "numericColumn" },
  ], []);

  // Nạp mặt hàng của các đơn vị đang tick Run.
  const napDuLieu = async () => {
    if (dsChon.length === 0) {
      message.warning("Chưa chọn đơn vị nào — tick cột Run ở lưới bên trái");
      return;
    }
    setDangNap(true);
    try {
      const r = await dkLayTenHang(dsChon);
      setDsTenHang(r.data);
      // Đổi phạm vi thì mặt hàng đang mở thuộc phạm vi cũ — dọn đi, thà trống còn hơn
      // để dòng của đơn vị khác nằm dưới tên đơn vị mới.
      setHangChon(null);
      setDsHoaDon([]);
      if (r.data.length === 0) message.info("Không có mặt hàng nào trong phạm vi đã chọn");
    } catch (e) {
      message.error(loiApi(e, "Không nạp được dữ liệu định khoản"));
    } finally {
      setDangNap(false);
    }
  };

  const xemDongHoaDon = async (h: DkTenHang) => {
    setHangChon(h);
    setDangTaiDong(true);
    try {
      const r = await dkLayDongHoaDon(h.maDonVi, h.tenHang, h.huong);
      setDsHoaDon(r.data);
    } catch (e) {
      setDsHoaDon([]);
      message.error(loiApi(e, "Không đọc được dòng hoá đơn"));
    } finally {
      setDangTaiDong(false);
    }
  };

  // Giữ hàm qua ref và gán trong effect — gán thẳng lúc render là "ghi ref khi render",
  // ESLint react-hooks/refs bắt. Cùng khuôn BaoCaoTonKho.hamRef.
  const hamRef = useRef({ xemDongHoaDon });
  useEffect(() => { hamRef.current = { xemDongHoaDon }; });

  // Chặn SAU khi đã khai xong mọi hook — rẽ nhánh trước đó là vi phạm luật hook.
  // Đá về trang chủ thay vì hiện "không có quyền": đơn vị khác không cần biết màn này
  // tồn tại, mà báo lỗi thì hoá ra lại xác nhận là nó có thật.
  if (!duocVao) return <Navigate to="/app" replace />;

  return (
    <div className="dk-form">
      <div className="dk-tren">
        {/* TRÁI — chọn đơn vị đem chạy */}
        <div className="dk-donvi">
          <div className="dk-tieude">Đơn vị</div>
          <div className="dk-luoi">
            <AgGridReact<DonVi>
              ref={luoiDonViRef}
              theme={themeVfp} {...luoiVfpProps}
              rowData={dsDonVi} defaultColDef={colVfp} columnDefs={cotDonVi}
              {...nhoDoRongCot("dk_donvi")}
              loading={dangTaiDonVi}
              onCellClicked={(e) => {
                if (e.colDef.colId === "run" && e.data) bapChonDonVi(e.data.maDonVi);
              }}
              overlayNoRowsTemplate="Không có đơn vị nào đang hoạt động" />
          </div>
        </div>

        {/* GIỮA — lưới tên hàng gốc duy nhất + thao tác */}
        <div className="dk-giua">
          <div className="dk-luoi dk-luoi-train">
            <AgGridReact<DkTenHang>
              ref={luoiTenHangRef}
              theme={themeVfp} {...luoiVfpProps}
              rowData={dsHienThi} defaultColDef={colVfp} columnDefs={cotTenHang}
              {...nhoDoRongCot("dk_tenhang")}
              // refreshCells trong effect chỉ có tác dụng khi lưới có ref — thiếu nó thì
              // bấm ✓ không hiện gì, vì rowData không đổi nên AG Grid không vẽ lại.
              loading={dangNap}
              getRowId={(p) => `${p.data.maDonVi}|${p.data.huong}|${p.data.tenHang}`}
              // Hai trạng thái, hai màu, và chúng KHÁC việc: "đang chọn" là dòng bạn
              // đang xem chi tiết bên dưới (một dòng duy nhất); "đã đánh dấu" là dòng
              // sắp được ghi (có thể vài trăm dòng). Một dòng có thể vừa chọn vừa đánh
              // dấu, nên chọn tô nền còn đánh dấu kẻ vạch trái — hai kênh khác nhau thì
              // chồng lên nhau vẫn đọc được cả hai.
              rowClassRules={{
                "dk-dang-chon": (p) =>
                  !!hangChon && p.data?.maDonVi === hangChon.maDonVi
                            && p.data?.tenHang === hangChon.tenHang
                            && p.data?.huong === hangChon.huong,
                "dk-da-danh-dau": (p) => !!p.data && !!danhDauRef.current[khoa(p.data)],
              }}
              onCellClicked={(e) => {
                if (!e.data) return;
                // Bấm cột Dấu = đánh dấu. Bấm cột khác = mở lưới dòng hoá đơn bên dưới.
                if (e.colDef.colId === "dau") bapDanhDau(khoa(e.data));
                else if (e.colDef.colId !== "sua") void hamRef.current.xemDongHoaDon(e.data);
              }}
              overlayNoRowsTemplate="Tick Run ở lưới trái rồi bấm “Nạp dữ liệu”" />
          </div>

          <div className="dk-nut">
            <div className="dk-nhom">
              <Button size="small" onClick={danhDauTatCa}
                      title="Đánh dấu mọi mặt hàng đang hiện">
                Đánh dấu tất cả
              </Button>
              <Button size="small" onClick={() => { setDaDanhDau({}); setDaSua({}); }}
                      title="Bỏ hết dấu và ô sửa chưa ghi">
                Bỏ đánh dấu
              </Button>
            </div>

            <div className="dk-nhom">
              {/* (4) Quét lần lượt từ trên xuống, mỗi lần một cụm tên */}
              <Button size="small" onClick={danhDauLanLuot}
                      title="Nhảy tới mặt hàng chưa xử lý tiếp theo và đánh dấu cả cụm tên giống nó">
                Đánh dấu lần lượt
              </Button>
              <Button size="small" className="dk-cam" loading={dangDayTrain}
                      onClick={dayVeTrain}
                      title="Đẩy mặt hàng ĐANG ĐÁNH DẤU vào Data Training chung, để lần sau máy đoán đúng">
                Update về Data Training
              </Button>
              <Button size="small" onClick={moManGiaiThich}
                      title="Xung đột đang chờ lý do — chưa có lý do thì không vào model">
                Xung đột chờ giải thích
              </Button>
            </div>

            {/* (5) Xác nhận — việc thường xuyên nhất, nên để nổi nhất. */}
            <div className="dk-nhom">
              <Button size="small" type="primary" loading={dangXacNhan}
                      onClick={xacNhanDung}
                      title="Các mặt hàng đang đánh dấu là ĐÚNG rồi — ghi good_pred = 1">
                Mark Is Predict OK 
              </Button>
              <span className="dk-ghichu">
                {soDanhDau > 0 ? `Đang đánh dấu ${soDanhDau} mặt hàng`
                               : "Chưa đánh dấu gì"}
              </span>
            </div>

            {/* (6) Sai thì gõ tài khoản đúng vào đây rồi đẩy về huấn luyện. Một ô cho
                cả loạt đang đánh dấu — dòng nào cần khác thì gõ riêng ở cột Sửa. */}
            <div className="dk-nhom">
              <div className="dk-hang">
                <span className="dk-nhan">Định khoản đúng</span>
                {/* Rộng hẳn ra và kèm tên tài khoản: gõ trần "156" thì người mới vào
                    nghề không biết mình vừa chọn cái gì. optionFilterProp="label" để gõ
                    tìm được cả bằng SỐ lẫn bằng TÊN. */}
                <Select size="small" style={{ width: 300 }} allowClear showSearch
                        optionFilterProp="label"
                        placeholder="Chọn tài khoản (gõ số hoặc tên)"
                        value={tkDung || undefined}
                        onChange={(v) => setTkDung(v ?? "")} options={optTkDayDu} />
              </div>
              <span className="dk-ghichu">
                {soSua > 0 ? `${soSua} dòng gõ riêng ở cột Sửa`
                           : "Áp cho mọi mặt hàng đang đánh dấu"}
              </span>
            </div>

            <div className="dk-nhom">
              {/* (2) Máy tự định khoản toàn bộ. "New" = chỉ mặt hàng CHƯA ai xác nhận;
                  cái đã gật rồi thì model không được phép đoán đè lên. */}
              <div className="dk-hang">
                <Button size="small" className="dk-xanh" loading={dangAuto}
                        onClick={autoAccountingNew}
                        title="Máy chạy model, định khoản toàn bộ mặt hàng chưa ai xác nhận">
                  Auto Accounting New
                </Button>
                {/* Toàn bộ cách màn này vận hành, gói vào một dấu hỏi. Để dưới chân màn
                    hình như trước thì nó chiếm ba dòng vĩnh viễn, mà người cần đọc lại
                    đúng lúc đang nhìn cái nút này. */}
                <Tooltip title={GIAI_THICH} overlayStyle={{ maxWidth: 560 }}>
                  <Button size="small" shape="circle" className="dk-nut-i">i</Button>
                </Tooltip>
              </div>
              {/* Ẩn bớt cho đỡ rối, KHÔNG phải để bỏ qua: không tick thì vẫn hiện đủ.
                  Lời giải thích nằm ở tooltip, không chiếm một dòng riêng. */}
              <Checkbox checked={chiHangMoi}
                        onChange={(e) => setChiHangMoi(e.target.checked)}
                        title="Ẩn mặt hàng đã xác nhận đúng ở lần trước. Không tick thì hiện đủ để soi lại như thường.">
                Chỉ hiện mặt hàng mới
              </Checkbox>
              {/* Việc DUY NHẤT đưa những gì vừa dạy vào model. Auto Accounting New chỉ
                  đọc model có sẵn, không học gì — đây là chỗ hay bị hiểu nhầm nhất.
                  Để riêng dưới cùng: nó là việc hằng TUẦN, không phải việc mỗi lượt soi. */}
              <Button size="small" loading={dangHuanLuyen} onClick={huanLuyen}
                      title="Dựng lại model từ toàn bộ dữ liệu huấn luyện — mất khoảng một phút, ảnh hưởng mọi đơn vị">
                Huấn luyện dữ liệu
              </Button>
            </div>
          </div>
        </div>

        {/* PHẢI — thao tác toàn cục */}
        <div className="dk-phai">
          {/* Bỏ nút "Đọc danh sách đơn vị" — danh sách nay tự nạp lúc mở màn. */}
          <Button size="small" type="primary" loading={dangNap} onClick={napDuLieu}
                  title="Đọc dòng hàng của các đơn vị đang tick Run">
            Nạp dữ liệu
          </Button>
          <span className="dk-ghichu">
            {dsChon.length > 0 ? `Đã chọn ${dsChon.length} đơn vị` : "Chưa chọn đơn vị nào"}
          </span>
        </div>
      </div>

      {/* THANH LỌC giữa hai lưới */}
      <div className="dk-loc">
        <span className="dk-nhan">Dòng hoá đơn của mặt hàng đang chọn</span>
        <span className="dk-nhan">ĐK gốc</span>
        <Select size="small" style={{ width: 250 }} allowClear showSearch
                optionFilterProp="label" placeholder="(tất cả)"
                value={dkGocLoc} onChange={setDkGocLoc} options={optDkGoc} />
        <span className="dk-nhan">Máy đoán</span>
        <Select size="small" style={{ width: 250 }} allowClear showSearch
                optionFilterProp="label" placeholder="(tất cả)"
                value={dkPredictLoc} onChange={setDkPredictLoc} options={optDoan} />
        <Button size="small"
                onClick={() => setLocDangDung({ goc: dkGocLoc, doan: dkPredictLoc })}
                title="Chỉ hiện mặt hàng khớp cặp đã chọn — nhẹ máy và dễ nhìn hơn">
          Lọc dữ liệu
        </Button>
        <Button size="small"
                onClick={() => { setDkGocLoc(undefined); setDkPredictLoc(undefined);
                                 setLocDangDung({}); }}>
          Bỏ lọc
        </Button>
        <span className="dk-ghichu">
          {locDangDung.goc || locDangDung.doan
            ? `Đang lọc — ${dsHienThi.length}/${dsTenHang.length} mặt hàng`
            : `${dsTenHang.length} mặt hàng`}
        </span>
      </div>

      {/* DƯỚI — dòng hoá đơn thật của mặt hàng đang chọn */}
      <div className="dk-luoi dk-luoi-kq">
        <AgGridReact<DkDongHoaDon>
          theme={themeVfp} {...luoiVfpProps}
          rowData={dsHoaDon} defaultColDef={colVfp} columnDefs={cotHoaDon}
          {...nhoDoRongCot("dk_hoadon")}
          loading={dangTaiDong}
          overlayNoRowsTemplate="Bấm một mặt hàng ở bảng trên" />
      </div>

      {/* (b) XUNG ĐỘT — cùng tên hàng mà lần này định khoản khác lần trước.
          Dòng đó VẪN được lưu, nhưng nằm ngoài model cho tới khi có lý do. Đây là luật
          chống tự đầu độc: một lần gõ nhầm lọt vào Data Training thì máy học luôn cái nhầm
          và nhắc lại mãi mãi. */}
      <Modal open={moGiaiThich} onCancel={() => setMoGiaiThich(false)} width={880}
             title="Xung đột định khoản — cần lý do trước khi vào dữ liệu huấn luyện"
             okText="Ghi lý do" cancelText="Để sau" confirmLoading={dangGuiGt}
             onOk={guiGiaiThich}>
        <Typography.Paragraph type="secondary" style={{ marginTop: 0 }}>
          Những mặt hàng dưới đây lần trước định khoản một kiểu, lần này một kiểu khác.
          Bản ghi <b>đã được lưu</b> nhưng <b>chưa</b> vào dữ liệu huấn luyện. Viết rõ vì
          sao lần này khác (tối thiểu 10 ký tự) thì nó mới được đem đi học.
        </Typography.Paragraph>
        {dsXungDot.length === 0
          ? <Typography.Text type="secondary">Không có xung đột nào đang chờ.</Typography.Text>
          : dsXungDot.map((x) => (
              <div key={x.id} className="dk-xungdot">
                <div>
                  <Tag>{x.maDonVi}</Tag>
                  <Tag color={x.huong === "V" ? "blue" : "purple"}>{x.huong}</Tag>
                  <b>{x.tenHang}</b>
                  {x.ghiChu && <span className="dk-ghichu"> — {x.ghiChu}</span>}
                </div>
                <Input.TextArea rows={2} value={loiGiaiThich[x.id] ?? ""}
                  placeholder="Vì sao lần này định khoản khác? (tối thiểu 10 ký tự)"
                  onChange={(e) => setLoiGiaiThich(
                    (cu) => ({ ...cu, [x.id]: e.target.value }))} />
              </div>
            ))}
      </Modal>

      <Typography.Paragraph type="secondary" className="dk-chuthich">
        <Tag color="green">Đã chạy đủ</Tag>
        Chi tiết cách vận hành: rê chuột vào nút <b>i</b> cạnh Auto Accounting New.
      </Typography.Paragraph>
    </div>
  );
}
