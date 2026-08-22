import { useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { Navigate } from "react-router-dom";
import { Button, Select, Input, Modal, Tag, Tooltip, Typography, message } from "antd";
import { AgGridReact } from "ag-grid-react";
import type { ColDef, CellStyle } from "ag-grid-community";
import {
  getAdminTenants, dkLayTenHang, dkLayDongHoaDon, dkLayDanhMucTk,
  dkAutoNew, dkChotDung, dkSuaNhan, dkHuanLuyen, dkLayChoGiaiThich, dkGiaiThich, loiApi,
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
//   1. Tick MỘT đơn vị → Nạp dữ liệu (nạp TOÀN BỘ, nhưng lưới chỉ hiện mặt hàng máy
//      chưa đoán — xem ba tầng lọc ở dsHienThi)
//   2. Auto Accounting New → máy tự định khoản TOÀN BỘ. Sau bước này lưới TRẮNG vì mọi
//      mặt hàng đều đã có is_predict = 1; muốn soi lại thì chọn cặp ở bước 7.
//   3. Soi hai cột ĐK gốc và Định khoản để xem máy đoán có đúng không
//   4. Mark Record By Prefix — mỗi lần bấm đánh dấu một cụm tên vào cột EXP rồi nhảy
//      sang cụm kế tiếp, kéo nó lên giữa màn hình và mở luôn dòng hoá đơn của nó
//   5. Mark Is Predict OK → good_pred = 1, mặt hàng BIẾN MẤT khỏi lưới
//   6. Cái nào sai thì tích cột SỬA (hoặc Mark Record By Prefix For Update), gõ tài
//      khoản đúng vào ô "Định khoản đúng" rồi Update về Data Training (nó sửa sổ
//      TRƯỚC, đẩy Data Training SAU)
//   6.1 Mặt hàng từng xác nhận đúng mà lần này sửa khác → giữ lại bắt giải thích
//   7. Chọn cặp ĐK gốc × Máy đoán rồi bấm Lọc dữ liệu — đây CŨNG là cách duy nhất gọi
//      lại những mặt hàng máy đã đoán để soi theo từng cặp
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
//     Cùng cột good_pred đó cũng quyết định lưới hiện gì: xác nhận xong là mặt hàng
//     biến mất. Lưới luôn chỉ còn thứ CÒN PHẢI LÀM, nên trống = xong, không cần ô tích
//     nào để bật/tắt.
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
      <b>Hai cột tích tách bạch:</b> tích cột <b>Exp</b> nghĩa là máy đoán đúng — chỉ{" "}
      <b>Mark Is Predict OK</b> ăn cột đó. Tích cột <b>Sửa</b> nghĩa là sai và sẽ đổi —
      chỉ <b>Update về Data Training</b> ăn cột đó. Nút không bao giờ ăn chéo cột.
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

// ===================== GIỮ TRẠNG THÁI QUA LƯỢT RỜI MÀN HÌNH =====================
//
// Soi định khoản là việc dài: tích vài chục mặt hàng rồi phải sang màn khác tra một
// hoá đơn, quay lại thì React đã huỷ component và mọi dấu tích biến sạch (Trường
// 22/08). Mất công tích lại từ đầu, mà tích lại thì dễ bỏ sót hơn lần trước.
//
// sessionStorage chứ KHÔNG localStorage: giữ trong lượt làm việc của tab này thôi.
// localStorage thì dấu của hôm qua còn nguyên tới hôm nay — mà hôm nay dữ liệu đã
// khác, người dùng lại tưởng mình vừa tích.
//
// KHÔNG lưu dsTenHang: nó là bản chụp của SỔ, phải đọc lại cho tươi mỗi lần vào —
// giữa hai lượt có thể đã có người chốt hoặc nạp lại dữ liệu. Chỉ giữ thứ do NGƯỜI
// DÙNG tạo ra: dấu, ô ghi chú, đơn vị đang chọn, cặp lọc đang xem.
const KHOA_LUU = "dk_trang_thai_v1";

interface TrangThaiLuu {
  daDanhDau: Record<string, boolean>;
  daDanhDauSua: Record<string, boolean>;
  daSua: Record<string, string>;
  tkDung: string;
  dsChon: string[];
  locDangDung: { goc?: string; doan?: string };
}

// PHẢI đọc lúc MOUNT, không phải lúc module nạp. Bản đầu 22/08 tôi để nó là hằng
// module — sai, và sai theo kiểu tự xoá dữ liệu:
//
//   Đây là SPA, module chỉ nạp MỘT LẦN cho cả phiên. Rời màn hình rồi quay lại thì
//   component mount lại nhưng module thì không, nên hằng đó vẫn giữ giá trị đọc được
//   lúc mở trang lần đầu — tức rỗng. State khởi tạo rỗng, rồi effect lưu chạy ngay sau
//   mount và GHI ĐÈ sessionStorage bằng chính cái rỗng đó. Dấu tích mất sạch.
//
// Gọi hàm này trong lazy initializer của useState thì nó chạy lại mỗi lần mount. Sáu
// lần parse một chuỗi nhỏ trong một lần mount là cái giá không đáng bàn.
function docLuu(): Partial<TrangThaiLuu> {
  try {
    const s = sessionStorage.getItem(KHOA_LUU);
    return s ? (JSON.parse(s) as Partial<TrangThaiLuu>) : {};
  } catch {
    // Hỏng JSON, hết chỗ, trình duyệt chặn storage — mất dấu tích thì phiền, nhưng
    // ném ở đây là màn hình trắng. Coi như chưa có gì lưu.
    return {};
  }
}

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
  const [dsChon, setDsChon] = useState<string[]>(() => docLuu().dsChon ?? []);
  // Mặt hàng đang ĐÁNH DẤU, và tài khoản người dùng gõ đè. Khoá là maDonVi|huong|tenHang
  // — cùng khoá với getRowId của lưới, để hai bên không bao giờ lệch cách nhận dạng.
  //
  // HAI CỘT TÍCH, KHÔNG PHẢI MỘT (BR-CDK-02, Trường chốt 22/08 — quay lại đúng kiểu VFP):
  //   daDanhDau     → cột "Exp" → chỉ nút "Mark Is Predict OK" ăn (chốt máy đoán ĐÚNG)
  //   daDanhDauSua  → cột "Sửa" → chỉ nút "Update về Data Training" ăn (ĐỔI định khoản)
  //
  // Vì sao phải tách: lúc chạy thử người dùng nhầm khu vực giữa chốt-đúng và đổi-định-
  // khoản. Một cột tích dùng chung cho hai việc trái ngược thì bấm nhầm là ghi sai sổ —
  // mà ghi xong mặt hàng biến khỏi lưới (good_pred = 1), không còn thấy để sửa lại.
  // Mỗi nút chỉ ăn đúng cột của trục mình thì nhầm chéo không xảy ra được.
  const [daDanhDau, setDaDanhDau] =
    useState<Record<string, boolean>>(() => docLuu().daDanhDau ?? {});
  const [daDanhDauSua, setDaDanhDauSua] =
    useState<Record<string, boolean>>(() => docLuu().daDanhDauSua ?? {});
  const [daSua, setDaSua] = useState<Record<string, string>>(() => docLuu().daSua ?? {});
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
  const [tkDung, setTkDung] = useState(() => docLuu().tkDung ?? "");
  // (7) Bộ lọc chỉ ăn khi BẤM, không ăn theo từng phím gõ: lọc trên vài nghìn dòng mà
  // vẽ lại sau mỗi lần đổi ô chọn là đúng thứ làm màn hình giật.
  const [locDangDung, setLocDangDung] =
    useState<{ goc?: string; doan?: string }>(() => docLuu().locDangDung ?? {});
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

  // Quay lại màn hình thì tự đọc lại sổ cho các đơn vị đang chọn, KHÔNG đụng bộ lọc.
  // Không có bước này thì việc giữ trạng thái thành nửa vời: dấu tích còn đó nhưng lưới
  // trống, mà bấm "Nạp dữ liệu" để lưới hiện ra thì chính nút đó xoá bộ lọc vừa khôi
  // phục (xem napDuLieu) — người dùng vẫn phải chọn lại cặp ĐK gốc × Máy đoán.
  //
  // Đọc thẳng từ sessionStorage chứ không đọc state dsChon: deps [duocVao] khiến effect
  // này chạy đúng một lần lúc vào màn. Nếu bám vào dsChon thì mỗi lần người dùng tick
  // thêm một đơn vị nó lại tự nạp một lượt.
  useEffect(() => {
    const cu = docLuu().dsChon ?? [];
    if (!duocVao || cu.length === 0) return;
    void (async () => {
      try {
        const r = await dkLayTenHang(cu);
        setDsTenHang(r.data);
      } catch {
        // Im lặng CÓ CHỦ ĐÍCH, và chỉ ở đây: người dùng không hề bấm gì, họ chỉ vừa
        // quay lại màn hình. Ném một hộp lỗi đỏ vào mặt cho việc họ không yêu cầu thì
        // khó hiểu hơn là lưới trống — mà lưới trống đã có sẵn dòng chữ hướng dẫn.
      }
    })();
  }, [duocVao]);

  const bapChonDonVi = (maDonVi: string) =>
    setDsChon((cu) => cu.includes(maDonVi)
      ? cu.filter((x) => x !== maDonVi)
      : [...cu, maDonVi]);

  // (d) Ẩn bớt mặt hàng ĐÃ xác nhận đúng. Không tick thì hiện đủ để soi lại như thường
  // — đây là ẩn cho đỡ rối, KHÔNG phải bỏ qua.
  // (7) Cộng thêm bộ lọc cặp ĐK gốc / Máy đoán: soi một cặp mỗi lượt thì vừa nhẹ máy
  // vừa dễ nhìn hơn hẳn so với cuộn qua vài nghìn dòng lẫn lộn.
  // BA TẦNG, và ba tầng này khác nhau về bản chất (chốt Trường 20/08):
  //
  //   1. Nạp dữ liệu lấy TOÀN BỘ mặt hàng — không cắt gì ở tầng dữ liệu.
  //   2. Đã XÁC NHẬN (good_pred) thì biến mất HẲN. Xong là xong.
  //   3. Máy ĐÃ ĐOÁN (is_predict) thì mặc định GIẤU, nhưng chỉ giấu thôi: chọn đúng
  //      cặp ĐK gốc × Máy đoán rồi bấm Lọc dữ liệu là chúng hiện lại.
  //
  // Nhờ tầng 3 mà màn hình vừa là hàng đợi việc (mở ra chỉ thấy thứ chưa ai đụng), vừa
  // soi lại được theo từng cặp — thay vì cuộn qua vài nghìn dòng đã xử lý để tìm.
  // BA TRẠNG THÁI của phạm vi vừa nạp (chốt Trường 21/08). Nạp dữ liệu không còn để
  // ĐỔ mặt hàng ra lưới nữa — nó trả lời đúng một câu: "giờ tôi phải làm gì tiếp".
  //   chuaDoan → còn mặt hàng máy chưa đụng     → bấm Auto Accounting New
  //   choSoi   → máy đoán hết, người chưa gật   → đây mới là lúc hiện lưới ra soi
  //   xong     → gật hết rồi                    → hết việc
  type TrangThai = "trong" | "chuaDoan" | "choSoi" | "xong";
  const trangThai = useMemo<TrangThai>(() => {
    if (dsTenHang.length === 0) return "trong";
    if (dsTenHang.some((x) => !x.daDoan)) return "chuaDoan";
    if (dsTenHang.some((x) => !x.daXacNhan)) return "choSoi";
    return "xong";
  }, [dsTenHang]);

  // LỌC DỮ LIỆU là đường DUY NHẤT đưa mặt hàng ra lưới (chốt Trường 21/08). Nạp dữ liệu
  // không bao giờ hiện gì, kể cả khi máy đã đoán xong và đang chờ soi — nhiệm vụ của nó
  // chỉ là nói người dùng phải làm gì tiếp.
  //
  // Vì sao bắt buộc đi qua bộ lọc: soi định khoản là soi theo CẶP (ĐK gốc × Máy đoán),
  // mỗi lượt một cặp. Đổ cả nghìn mặt hàng đủ mọi cặp ra một lúc thì vừa nặng máy vừa
  // không ai soi nổi — đúng thứ bộ lọc sinh ra để tránh.
  const dsHienThi = useMemo(() => {
    if (!locDangDung.goc && !locDangDung.doan) return [];
    let ds = dsTenHang.filter((x) => !x.daXacNhan);
    if (locDangDung.goc) ds = ds.filter((x) => (x.dkGoc ?? "") === locDangDung.goc);
    if (locDangDung.doan) ds = ds.filter((x) => (x.dinhKhoan ?? "") === locDangDung.doan);
    return ds;
  }, [dsTenHang, locDangDung]);

  // Khoá nhận dạng một mặt hàng. DÙNG CHUNG với getRowId của lưới — hai cách nhận dạng
  // song song là chỗ chắc chắn sẽ lệch nhau.
  const khoa = (x: { maDonVi: string; huong: string; tenHang: string }) =>
    `${x.maDonVi}|${x.huong}|${x.tenHang}`;

  const danhDauRef = useRef<Record<string, boolean>>({});
  const danhDauSuaRef = useRef<Record<string, boolean>>({});
  const suaRef = useRef<Record<string, string>>({});

  const luoiTenHangRef = useRef<AgGridReact<DkTenHang> | null>(null);
  useEffect(() => {
    danhDauRef.current = daDanhDau;
    danhDauSuaRef.current = daDanhDauSua;
    suaRef.current = daSua;
    // redrawRows chứ không refreshCells: rowClassRules chỉ được đánh giá lại khi DÒNG
    // được vẽ lại. refreshCells cập nhật được ô ☑ nhưng màu nền dòng thì đứng im.
    luoiTenHangRef.current?.api?.redrawRows();
  }, [daDanhDau, daDanhDauSua, daSua]);

  // Ghi lại mỗi khi có gì đổi. Ghi ở effect chứ không ghi trong từng hàm bấm nút: có
  // sáu chỗ đụng vào các state này, nhớ gọi lưu ở cả sáu là kiểu sớm muộn cũng sót một.
  useEffect(() => {
    try {
      sessionStorage.setItem(KHOA_LUU, JSON.stringify({
        daDanhDau, daDanhDauSua, daSua, tkDung, dsChon, locDangDung,
      } satisfies TrangThaiLuu));
    } catch {
      // Hết chỗ hoặc trình duyệt chặn. Không lưu được thì thôi — mất dấu khi rời màn
      // hình là phiền, còn ném lỗi ở đây thì hỏng cả lượt soi đang làm dở.
    }
  }, [daDanhDau, daDanhDauSua, daSua, tkDung, dsChon, locDangDung]);

  const bapDanhDau = (k: string) =>
    setDaDanhDau((cu) => ({ ...cu, [k]: !cu[k] }));
  const bapDanhDauSua = (k: string) =>
    setDaDanhDauSua((cu) => ({ ...cu, [k]: !cu[k] }));

  // Dọn SẠCH cả ba (chốt Trường 22/08). Đúng ra "Bỏ đánh dấu" nằm ở trục 1 thì chỉ nên
  // ăn cột Exp, nhưng khi đó cột Sửa không còn nút nào dọn được. Nó là nút DỌN chứ không
  // phải nút thao tác, nên cho ăn hết — và tooltip nói thẳng ra như vậy.
  const boHetDanhDau = () => { setDaDanhDau({}); setDaDanhDauSua({}); setDaSua({}); };

  // ĐỔI PHẠM VI SOI THÌ DẤU TÍCH CŨ PHẢI ĐI THEO (Trường 22/08).
  //
  // Ca hỏng thật: đang soi cặp 156→156, tích một loạt, rồi chuyển sang cặp 156→154.
  // Dấu của cặp trước vẫn nằm trong daDanhDau nhưng KHÔNG hiện trên lưới nữa vì lưới
  // chỉ vẽ dsHienThi. Người dùng nhìn thấy lưới sạch mà con số bên nút vẫn đếm cả dấu
  // ẩn — không hiểu mình đang chốt cái gì.
  //
  // Nút chỉ ăn mặt hàng ĐANG HIỆN (dsDanhDauExp lọc trên dsHienThi) nên chưa từng ghi
  // nhầm xuống sổ. Nhưng quay lại đúng cặp cũ là dấu hiện lại nguyên vẹn, và lúc đó
  // người dùng không còn nhớ mình đã tích những gì. Dọn sạch là cách duy nhất khiến
  // "thấy gì chốt nấy" luôn đúng.
  const doiPhamVi = (moi: { goc?: string; doan?: string }) => {
    const con = Object.values(danhDauRef.current).filter(Boolean).length
              + Object.values(danhDauSuaRef.current).filter(Boolean).length;
    if (con > 0) message.info(`Bỏ ${con} dấu tích của phạm vi trước`);
    setDaDanhDau({}); setDaDanhDauSua({}); setDaSua({});
    setLocDangDung(moi);
  };

  const soDanhDau = useMemo(
    () => Object.values(daDanhDau).filter(Boolean).length, [daDanhDau]);
  const soDanhDauSua = useMemo(
    () => Object.values(daDanhDauSua).filter(Boolean).length, [daDanhDauSua]);
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

  // MỘT thân hàm cho HAI nút (chốt Trường 22/08): "Mark Record By Prefix" đánh cột Exp,
  // "Mark Record By Prefix For Update" đánh cột Sửa. Cách quét cụm, cách nhảy sang cụm
  // kế tiếp, cách kéo dòng lên giữa màn hình — cả ba y hệt nhau, chỉ khác nó ghi vào ô
  // tích nào. Chép thành hai bản 25 dòng thì sửa một bên quên bên kia là chuyện sớm muộn.
  const markByPrefix = (
    dangCo: Record<string, boolean>,
    dat: Dispatch<SetStateAction<Record<string, boolean>>>,
    tenCot: string,
  ) => {
    const conLai = dsHienThi.filter((x) => !dangCo[khoa(x)]);
    if (conLai.length === 0) {
      message.info(`Đã đánh dấu hết mặt hàng đang hiện ở cột ${tenCot}`);
      return;
    }
    const cum = cumTen(conLai[0].tenHang);
    // CÙNG CHIỀU mới gom (Trường phát hiện 22/08). Trước đây chỉ so cụm tên, nên
    // "Tiền chiết khấu mua hàng…" ở khối V bị gom chung với cái cùng tên ở khối R —
    // kết quả vẫn ĐÚNG, nhưng lưới xếp hết đầu vào rồi mới tới đầu ra, nên đang soi
    // từ trên xuống lại gặp một loạt dòng dưới đã tích sẵn, không hiểu ai tích.
    //
    // Về nghiệp vụ thì tách chiều cũng đúng hơn: V sửa ghi_no, R sửa ghi_co, và kho
    // học lưu hai dòng riêng theo vao_ra. Gom một lượt là chốt hai thứ khác nhau bằng
    // một lần nhìn.
    const chieu = conLai[0].huong;
    const them: Record<string, boolean> = {};
    let n = 0;
    for (const x of dsHienThi)
      if (x.huong === chieu && cumTen(x.tenHang) === cum) { them[khoa(x)] = true; n++; }
    dat((cu) => ({ ...cu, ...them }));

    // Trỏ sang cụm KẾ TIẾP và mở nó ra như vừa bấm chuột vào (chốt Trường 20/08).
    // Không có bước này thì đánh dấu xong một loạt là mất dấu vị trí, phải tự dò lại
    // xem mình đang ở đâu — mà cụm càng dài thì càng trôi xa.
    const tiep = dsHienThi.find((x) => !them[khoa(x)] && !dangCo[khoa(x)]);
    if (!tiep) {
      message.success(`Đánh dấu ${n} mặt hàng “${cum}…” [${chieu}] vào cột ${tenCot} — hết danh sách`);
      return;
    }
    setHangChon(tiep);
    void hamRef.current.xemDongHoaDon(tiep);
    // Kéo lên GIỮA màn hình, không phải chỉ "cho lọt vào khung": ở mép dưới thì bấm
    // phát nữa là nó lại trôi mất.
    const i = dsHienThi.indexOf(tiep);
    if (i >= 0) luoiTenHangRef.current?.api?.ensureIndexVisible(i, "middle");
    message.success(`Đánh dấu ${n} mặt hàng “${cum}…” [${chieu}] vào cột ${tenCot}`);
  };

  const markRecordByPrefix = () => markByPrefix(daDanhDau, setDaDanhDau, "Exp");
  const markRecordByPrefixForUpdate = () =>
    markByPrefix(daDanhDauSua, setDaDanhDauSua, "Sửa");

  // Bỏ hẳn "Đánh dấu tất cả" (chốt Trường 22/08). Với hai cột tích thì một nút quét sạch
  // cả lưới là đúng thứ gây ra nhầm chéo mà mục 5 sinh ra để chặn: bấm một phát rồi bấm
  // tiếp nút của trục kia là ghi nhầm hàng loạt, không kịp thấy gì.

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

  // Hai nguồn dấu RIÊNG BIỆT, không nhập một. Ai đổi hàm nào ăn nguồn nào thì đọc lại
  // khối comment ở state daDanhDauSua trước — đó chính là chỗ mục 5 sinh ra để chặn.
  const dsDanhDauExp = () => dsHienThi.filter((x) => daDanhDau[khoa(x)]);
  const dsDanhDauSua = () => dsHienThi.filter((x) => daDanhDauSua[khoa(x)]);

  // (5) Xác nhận: "mấy cái đang đánh dấu là ĐÚNG rồi". Chỉ đặt good_pred = 1, KHÔNG sửa
  // định khoản — tách hẳn khỏi nút sửa vì đây là hai việc khác nhau, gộp lại thì có ngày
  // bấm xác nhận mà lại đổi mất số.
  //
  // CHỈ ăn cột Exp (mục 5). Dấu ở cột Sửa nghĩa là "định khoản này SAI, tôi sẽ đổi" —
  // đem xác nhận đúng là ghi ngược hẳn ý người dùng.
  const xacNhanDung = async () => {
    const ds = dsDanhDauExp();
    if (ds.length === 0) {
      message.warning("Chưa tích mặt hàng nào ở cột Exp");
      return;
    }
    setDangXacNhan(true);
    try {
      // BR-CDK-04: backend đặt good_pred = 1, VÀ tự đẩy sang Data Training những mặt
      // hàng máy còn yếu (pred_conf < 0,85). Màn hình không quyết định gì về ngưỡng —
      // để nó ở đây thì mỗi lần đổi số lại phải sửa hai chỗ và nhớ đúng cả hai.
      const r = await dkChotDung(ds.map((x) => ({
        maDonVi: x.maDonVi, huong: x.huong, tenHang: x.tenHang,
        tkMoi: null, xacNhanDung: true,
      })));
      message.success(r.data.message, 5);
      for (const c of r.data.canhBao) message.warning(c, 8);
      setDaDanhDau({});
      await napLai();
      // Xung đột thì mở luôn ô giải thích — nằm đó = không bao giờ vào model (BR-CDK-06).
      if (r.data.soXungDot > 0) await moManGiaiThich();
    } catch (e) {
      message.error(loiApi(e, "Không xác nhận được"));
    } finally {
      setDangXacNhan(false);
    }
  };

  // (6) Update về Data Training. Hai việc trong một lần bấm, và phải theo ĐÚNG thứ tự:
  //   1. SỬA SỔ trước
  //   2. Rồi mới đẩy vào Data Training
  // Ngược thứ tự là model học một đằng còn sổ ghi một nẻo.
  //
  // Từ 22/08 cả hai bước nằm TRONG MỘT lượt gọi backend (BR-CDK-05). Trước đây màn hình
  // tự gọi cap-nhat rồi day-train: đúng thứ tự, nhưng nếu lượt thứ hai hỏng thì sổ đã
  // sửa mà kho học chưa học, và mặt hàng biến khỏi lưới (good_pred = 1) nên không ai
  // gặp lại để dạy. Backend còn đọc LẠI nhãn từ sổ trước khi dạy, nên cái vào kho học
  // luôn đúng bằng cái vừa ghi xuống — không phải cái màn hình tưởng là đã ghi.
  //
  // CHỈ ăn cột Sửa (mục 5). Trước 22/08 nút này dùng chung cột dấu với "Mark Is Predict
  // OK" — đó đúng là chỗ người dùng bấm nhầm lúc chạy thử: tích để chốt-đúng rồi lỡ tay
  // bấm nút này là sổ bị SỬA theo ô "Định khoản đúng" đang treo sẵn từ loạt trước.
  const dayVeTrain = async () => {
    const ds = dsDanhDauSua()
      .map((x) => ({ x, nhan: nhanDung(x) }))
      .filter((r) => r.nhan.length > 0);

    if (ds.length === 0) {
      message.warning("Chưa tích mặt hàng nào ở cột Sửa có định khoản để đẩy về huấn luyện");
      return;
    }
    setDangDayTrain(true);
    try {
      // Gửi TẤT CẢ, kể cả mặt hàng có nhãn trùng cái đang nằm trong sổ. Trước đây màn
      // hình tự lọc "cái nào khác thì mới sửa" — nhưng người dùng đã chủ động tích cột
      // Sửa thì đó là ý chốt, và backend cần biết để dạy máy dù sổ không đổi giá trị.
      const r = await dkSuaNhan(ds.map((r) => ({
        maDonVi: r.x.maDonVi, huong: r.x.huong, tenHang: r.x.tenHang,
        tkMoi: r.nhan, xacNhanDung: true,
      })));
      message.success(r.data.message, 5);
      for (const c of r.data.canhBao) message.warning(c, 8);

      // Dọn ĐÚNG cột của trục này. Đụng vào daDanhDau ở đây là xoá mất dấu Exp mà người
      // dùng đang tích dở cho loạt xác nhận kế tiếp.
      setDaDanhDauSua({}); setDaSua({}); setTkDung("");
      await napLai();
      // (6.1) Có xung đột thì mở luôn ô giải thích: để người dùng tự đi tìm thì nó nằm
      // đó mãi, mà nằm đó = không bao giờ vào model.
      if (r.data.soXungDot > 0) await moManGiaiThich();
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
  const optLoc = (ds: DkTenHang[], lay: (x: DkTenHang) => string | null) => {
    const co = new Set<string>();
    for (const x of ds) {
      const v = lay(x)?.trim();
      if (v) co.add(v);
    }
    return [...co].sort().map((v) => ({ value: v, label: nhanTk(v) }));
  };

  // Chỉ liệt tài khoản của mặt hàng CÒN PHẢI LÀM. Xác nhận xong cái nào thì tuỳ chọn
  // của nó tự rụng khỏi ô lọc — hết việc là ô lọc rỗng, không phải chọn rồi mới biết.
  const dsChuaXong = useMemo(() => dsTenHang.filter((x) => !x.daXacNhan), [dsTenHang]);

  const optDkGoc = useMemo(() => optLoc(dsChuaXong, (x) => x.dkGoc),
    [dsChuaXong, tenTk]);   // eslint-disable-line react-hooks/exhaustive-deps

  // Ô "Máy đoán" phụ thuộc ô "ĐK gốc" đang chọn, không phải toàn bộ dữ liệu (chốt
  // Trường 20/08): soi xong hết cặp 156 → 154 thì chọn ĐK gốc 156 sẽ KHÔNG còn thấy
  // 154 nữa. Nhờ vậy danh sách cặp tự ngắn lại theo tiến độ, thay vì cứ chọn bừa một
  // cặp rồi phát hiện lưới trống.
  const optDoan = useMemo(
    () => optLoc(
      dkGocLoc ? dsChuaXong.filter((x) => (x.dkGoc ?? "") === dkGocLoc) : dsChuaXong,
      (x) => x.dinhKhoan),
    [dsChuaXong, dkGocLoc, tenTk]);   // eslint-disable-line react-hooks/exhaustive-deps

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
    // HAI CỘT TÍCH ĐỨNG CẠNH NHAU (mục 5 — Trường chốt 22/08 cho phép, cái phải tách là
    // NHÓM NÚT chứ không phải ô tích). Cùng kiểu vẽ với cột Run bên lưới đơn vị: ba chỗ
    // cùng là "bấm để chọn" thì phải nhìn giống nhau, không thì mỗi chỗ học lại một lần.
    //
    // Exp = máy đoán ĐÚNG rồi, chỉ cần gật.   Sửa = SAI, tôi sẽ đổi định khoản.
    // Hai ý nghĩa trái ngược nên phải là hai cột, và mỗi cột chỉ một nút được đụng vào.
    { colId: "dau", headerName: "Exp", width: 58,
      valueGetter: (p) => (p.data && danhDauRef.current[khoa(p.data)] ? O_TICH : O_TRONG),
      cellStyle: STYLE_O_TICH,
      headerTooltip: "Máy đoán ĐÚNG. Chỉ nút “Mark Is Predict OK” ăn cột này." },
    { colId: "dauSua", headerName: "Sửa", width: 58,
      valueGetter: (p) => (p.data && danhDauSuaRef.current[khoa(p.data)] ? O_TICH : O_TRONG),
      cellStyle: STYLE_O_TICH,
      headerTooltip: "Định khoản SAI, sẽ đổi. Chỉ nút “Update về Data Training” ăn cột này." },
    // Cột Ghi chú: gõ tài khoản ĐÚNG cho RIÊNG dòng này. Ghi vào ghi_no (hàng vào) hay
    // ghi_co (hàng ra) là do cột V/R quyết định — backend tự chọn vế, màn hình không
    // phải biết. Trước 22/08 cột này tên "Sửa"; đổi tên vì "Sửa" nay là ô TÍCH nằm ngay
    // bên trái, hai cột cùng tên đứng cạnh nhau thì không ai biết nút ăn cái nào.
    { colId: "sua", headerName: "Ghi chú", width: 80, editable: true,
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
      headerTooltip: "Gõ tài khoản ĐÚNG cho RIÊNG dòng này. Bỏ trống thì dùng ô “Định khoản đúng” bên dưới." },
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
      // Bỏ bộ lọc VÀ dấu tích cũ: cả hai thuộc phạm vi vừa rời đi. Giữ lọc thì lưới
      // hiện ra một tập chẳng ai chủ ý chọn; giữ dấu thì tệ hơn — dấu của đơn vị cũ
      // nằm im không nhìn thấy, mà khoá có kèm mã đơn vị nên nó sống lại đúng lúc
      // người dùng quay về đơn vị đó và không còn nhớ gì.
      doiPhamVi({});
      setDkGocLoc(undefined); setDkPredictLoc(undefined);

      // Nạp xong thì NÓI người dùng phải làm gì, không đổ mặt hàng ra bắt họ tự đoán.
      const chuaDoan  = r.data.filter((x) => !x.daDoan).length;
      const choSoi    = r.data.filter((x) => x.daDoan && !x.daXacNhan).length;
      if (r.data.length === 0)
        message.info("Không có mặt hàng nào trong phạm vi đã chọn");
      else if (chuaDoan > 0)
        message.warning(
          `Còn ${chuaDoan} mặt hàng CHƯA ĐỊNH KHOẢN — bấm “Auto Accounting New” để máy đoán`, 6);
      else if (choSoi > 0)
        message.info(
          `Đã định khoản xong, còn ${choSoi} mặt hàng chờ soi — `
        + "chọn cặp ĐK gốc × Máy đoán rồi bấm “Lọc dữ liệu”", 6);
      else
        message.success(
          `Đã định khoản xong và xác nhận hết ${r.data.length} mặt hàng — không còn việc`, 6);
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
                // Bấm một trong HAI cột tích = bật/tắt đúng cột đó. Bấm cột Ghi chú =
                // để AG Grid vào chế độ gõ, không làm gì thêm. Bấm cột khác = mở lưới
                // dòng hoá đơn bên dưới.
                if (e.colDef.colId === "dau") bapDanhDau(khoa(e.data));
                else if (e.colDef.colId === "dauSua") bapDanhDauSua(khoa(e.data));
                else if (e.colDef.colId !== "sua") void hamRef.current.xemDongHoaDon(e.data);
              }}
              // Lưới trống mang HAI nghĩa trái ngược — chưa nạp, hay đã xong sạch. Phải
              // nói rõ cái nào, không thì "trắng tinh" đọc như hỏng.
              // Lưới trống mang BA nghĩa khác hẳn nhau. Nói rõ cái nào, không thì
              // "trắng tinh" đọc như hỏng.
              // Lưới trống mang BỐN nghĩa khác hẳn nhau. Nói rõ đang ở nghĩa nào, không
              // thì "trắng tinh" đọc như hỏng — và mỗi nghĩa dẫn tới một việc khác.
              overlayNoRowsTemplate={
                (locDangDung.goc || locDangDung.doan)
                  ? "Không có mặt hàng nào khớp cặp đang lọc"
                  : trangThai === "trong"
                    ? "Tick Run ở lưới trái rồi bấm “Nạp dữ liệu”"
                    : trangThai === "chuaDoan"
                      ? "Còn mặt hàng chưa định khoản — bấm “Auto Accounting New”"
                      : trangThai === "xong"
                        ? "Đã xác nhận hết — chọn cặp ĐK gốc × Máy đoán rồi bấm “Lọc dữ liệu” nếu muốn soi lại"
                        : "Chọn cặp ĐK gốc × Máy đoán rồi bấm “Lọc dữ liệu” để bắt đầu soi"} />
          </div>

          {/* BA TRỤC THAO TÁC (mục 5 docs/THUE/QUYET-DINH-DINH-KHOAN-22-08.md, Trường
              chốt 22/08). Nguyên tắc: nút chỉ ăn ĐÚNG cột tích của trục mình.

                Trục 1 — cột Exp: đánh dấu · chốt đúng · dọn
                Trục 2 — cột Sửa: đánh dấu · gõ tài khoản đúng · đẩy về Data Training
                Trục 3 — xung đột, không thuộc cột tích nào

              Vì sao xếp lại: lúc chạy thử người dùng nhầm khu vực giữa chốt-đúng và
              đổi-định-khoản, vì "Mark Is Predict OK" và "Update về Data Training" đứng
              hai nhóm khác nhau nhưng cùng ăn MỘT cột dấu. Giờ mỗi trục tự đủ: đánh dấu
              ở đâu thì bấm nút ngay bên dưới, không phải nhìn sang nhóm khác. */}
          <div className="dk-nut">
            {/* ===== TRỤC 1 — cột Exp: máy đoán đúng, chỉ cần gật ===== */}
            <div className="dk-nhom">
              {/* (4) Quét lần lượt từ trên xuống, mỗi lần một cụm tên. */}
              <Button size="small" onClick={markRecordByPrefix}
                      title="Đánh dấu cả cụm tên giống nhau vào cột Exp, rồi nhảy sang cụm kế tiếp và mở nó ra">
                Mark Record By Prefix
              </Button>
              {/* (5) Xác nhận — việc thường xuyên nhất, nên để nổi nhất. */}
              <div className="dk-hang">
                <Button size="small" type="primary" loading={dangXacNhan}
                        onClick={xacNhanDung}
                        title="Mặt hàng tích ở cột Exp là ĐÚNG rồi — ghi good_pred = 1, không đẩy Data Training">
                  Mark Is Predict OK
                </Button>
                <span className="dk-ghichu">
                  {soDanhDau > 0 ? `Exp: ${soDanhDau} mặt hàng` : "Exp: chưa tích gì"}
                </span>
              </div>
              {/* Nút DỌN, không phải nút thao tác — nên nó ăn cả hai cột tích lẫn ô gõ
                  (Trường chốt 22/08). Đứng ở trục 1 vì phải nằm đâu đó, và đây là trục
                  dùng nhiều nhất. */}
              <Button size="small" onClick={boHetDanhDau}
                      title="Bỏ HẾT: cả cột Exp, cột Sửa và ô Ghi chú chưa ghi">
                Bỏ đánh dấu
              </Button>
            </div>

            {/* ===== TRỤC 2 — cột Sửa: định khoản sai, đổi rồi dạy lại cho máy ===== */}
            <div className="dk-nhom">
              <Button size="small" onClick={markRecordByPrefixForUpdate}
                      title="Đánh dấu cả cụm tên giống nhau vào cột SỬA, rồi nhảy sang cụm kế tiếp và mở nó ra">
                Mark Record By Prefix For Update
              </Button>
              {/* (6) Sai thì gõ tài khoản đúng vào đây rồi đẩy về huấn luyện. Một ô cho
                  cả loạt tích ở cột Sửa — dòng nào cần khác thì gõ riêng ở cột Ghi chú. */}
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
              <div className="dk-hang">
                <Button size="small" className="dk-cam" loading={dangDayTrain}
                        onClick={dayVeTrain}
                        title="Đẩy mặt hàng tích ở cột SỬA vào Data Training chung, để lần sau máy đoán đúng">
                  Update về Data Training
                </Button>
                <span className="dk-ghichu">
                  {soDanhDauSua > 0 ? `Sửa: ${soDanhDauSua} mặt hàng` : "Sửa: chưa tích gì"}
                  {soSua > 0 ? ` · ${soSua} dòng gõ riêng` : ""}
                </span>
              </div>
            </div>

            {/* ===== TRỤC 3 — xung đột, không ăn cột tích nào ===== */}
            <div className="dk-nhom">
              <Button size="small" onClick={moManGiaiThich}
                      title="Xung đột đang chờ lý do — chưa có lý do thì không vào model">
                Xung đột chờ giải thích
              </Button>
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
              {/* Bỏ ô tích "Chỉ hiện mặt hàng mới": lưới nay LUÔN chỉ hiện mặt hàng
                  chưa xác nhận, nên cái tích đó không còn gì để bật/tắt. */}
              {/* Việc DUY NHẤT đưa những gì vừa dạy vào model. Auto Accounting New chỉ
                  đọc model có sẵn, không học gì — đây là chỗ hay bị hiểu nhầm nhất.
                  Để riêng dưới cùng: nó là việc hằng TUẦN, không phải việc mỗi lượt soi. */}
              <Button size="small" loading={dangHuanLuyen} onClick={huanLuyen}
                      title="Dựng lại model từ toàn bộ dữ liệu huấn luyện — mất khoảng một phút, ảnh hưởng mọi đơn vị">
                Huấn luyện dữ liệu
              </Button>
              {/* Nạp dữ liệu về cuối cột này thay vì đứng riêng một cột bên phải: nó là
                  bước MỞ ĐẦU nhưng bấm đúng một lần, để chiếm hẳn 210px thì phí chỗ. */}
              <div className="dk-hang">
                <Button size="small" type="primary" loading={dangNap} onClick={napDuLieu}
                        title="Đọc mặt hàng của các đơn vị đang tick Run">
                  Nạp dữ liệu
                </Button>
                <span className="dk-ghichu">
                  {dsChon.length > 0 ? `Đã chọn ${dsChon.length} đơn vị`
                                     : "Chưa chọn đơn vị nào"}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* THANH LỌC giữa hai lưới */}
      <div className="dk-loc">
        <span className="dk-nhan">Dòng hoá đơn của mặt hàng đang chọn</span>
        <span className="dk-nhan">ĐK gốc</span>
        <Select size="small" style={{ width: 250 }} allowClear showSearch
                optionFilterProp="label" placeholder="(tất cả)"
                value={dkGocLoc} options={optDkGoc}
                onChange={(v) => { setDkGocLoc(v); setDkPredictLoc(undefined); }} />
        <span className="dk-nhan">Máy đoán</span>
        <Select size="small" style={{ width: 250 }} allowClear showSearch
                optionFilterProp="label" placeholder="(tất cả)"
                value={dkPredictLoc} onChange={setDkPredictLoc} options={optDoan} />
        {/* Cả hai nút đi qua doiPhamVi: đổi cặp lọc là đổi tập mặt hàng đang soi, nên
            dấu tích của cặp cũ bị dọn sạch. Xem khối comment ở doiPhamVi. */}
        <Button size="small"
                onClick={() => doiPhamVi({ goc: dkGocLoc, doan: dkPredictLoc })}
                title="Chỉ hiện mặt hàng khớp cặp đã chọn — nhẹ máy và dễ nhìn hơn. Dấu tích của cặp trước sẽ bị bỏ.">
          Lọc dữ liệu
        </Button>
        <Button size="small"
                onClick={() => { setDkGocLoc(undefined); setDkPredictLoc(undefined);
                                 doiPhamVi({}); }}
                title="Về lại trạng thái chưa lọc. Dấu tích đang có sẽ bị bỏ.">
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
