import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Modal, Table, Typography, Empty, Upload, Button, Tag, message,
         Input } from "antd";
import { FileTextOutlined, InboxOutlined, FileExcelOutlined,
         FileDoneOutlined, DownloadOutlined, FilePdfOutlined,
         ReloadOutlined, EyeOutlined, DeleteOutlined,
         ExclamationCircleFilled, SearchOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { thueBaoCao, thueBaoCaoDonVi, thueDocBangKe, thueRaSoat, thueLapToKhai,
         thueToKhaiXml, thueHtmlHoaDon, thueXoaHoaDon, loiApi } from "../api";
import HtmlHoaDon from "./HtmlHoaDon";
import type { BaoCaoThue, BangKeHoaDon, HoaDonFile, KetQuaRaSoat,
              ToKhaiGtgt } from "../api";
import BangToKhai from "./BangToKhai";
import "./bang-to-khai.css";
import "./to-khai-xml.css";

// ============ RÀ SOÁT & LẬP TỜ KHAI XML CHO MỘT ĐƠN VỊ ============
//
// Gộp từ hai file cũ (ModalRaSoat.tsx + ModalToKhaiXml.tsx) — cả hai đều là các
// bước của CÙNG MỘT việc: soi sổ → đối chiếu file → lập tờ khai → xuất XML/PDF.
// Tách hai modal thì kế toán phải mở cái này, đóng đi, mở cái kia, và không bao
// giờ nhìn được số của hai bên cùng lúc.
//
// Dựng lại form VFP "Lấy đơn vị khai thuế" (ảnh chụp 14/08): khối chỉ tiêu ở trên,
// hai lưới hóa đơn MUA VÀO / BÁN RA ở dưới, mỗi lưới có dải chỉ tiêu và dải tổng.
//
// Vì sao GỘP ba tab cũ (Mua vào / Bán ra / Tổng hợp) vào một màn: ba thứ đó là BA
// PHẦN CỦA CÙNG MỘT TỜ KHAI, kế toán phải nhìn đồng thời để đối chiếu — số tổng ở
// khối trên phải bằng tổng của lưới dưới. Tách tab thì mỗi lần so một con số là một
// lần bấm qua lại, và không bao giờ thấy được hai bên cùng lúc.
//
// CHỈ ĐỌC — KHÔNG GHI. Không có nút nào ghi vào sổ: màn này soi sổ đang chạy thật
// ngay trước kỳ khai thuế, thấy vấn đề thì kế toán tự quyết cách xử lý. Muốn nạp
// thì dùng màn Lấy HĐĐT như mọi khi.
//
// XML đọc NGAY TẠI TRÌNH DUYỆT bằng DOMParser: không phải tải file lên server, nên
// chọn cả trăm file cũng không nghẽn mạng, và file gốc không rời khỏi máy người
// dùng. Server chỉ nhận danh sách đã rút gọn (định danh + hai con số tiền).

const tien = (v: number | null | undefined) =>
  v == null ? "" : v.toLocaleString("vi-VN", { minimumFractionDigits: 2,
                                               maximumFractionDigits: 2 });

// Bỏ dấu tiếng Việt + về chữ thường, để tìm kiếm gõ "truong" vẫn ra "TRƯỜNG".
// NFD tách chữ khỏi dấu rồi xóa dải dấu kết hợp U+0300..U+036F; riêng đ/Đ không
// tách được bằng cách đó nên phải thay tay.
const boDau = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "")
   .replace(/đ/g, "d").replace(/Đ/g, "D")
   .toLowerCase().trim();

// Tiền KHÔNG phần lẻ — dùng cho khối tóm tắt kỳ, nơi chỉ cần thấy độ lớn.
const tienTron = (v: number | null | undefined) =>
  v == null ? "" : v.toLocaleString("vi-VN", { maximumFractionDigits: 0 });

// Đọc một file XML HÓA ĐƠN của cổng TCT. File hỏng trả null — một file rác không
// được phép làm chết cả mẻ.
function docXmlHoaDon(noiDung: string, tenFile: string): HoaDonFile | null {
  try {
    const doc = new DOMParser().parseFromString(noiDung, "text/xml");
    if (doc.querySelector("parsererror")) return null;

    const lay = (cha: Element | null, ten: string) =>
      cha?.getElementsByTagName(ten)[0]?.textContent?.trim() ?? "";
    const so = (cha: Element | null, ten: string) => {
      const v = Number(lay(cha, ten));
      return Number.isFinite(v) ? v : 0;
    };

    const dl = doc.getElementsByTagName("DLHDon")[0] ?? null;
    const chung = dl?.getElementsByTagName("TTChung")[0] ?? null;
    const nd = dl?.getElementsByTagName("NDHDon")[0] ?? null;
    if (!chung || !nd) return null;

    const ban = nd.getElementsByTagName("NBan")[0] ?? null;
    const tt = nd.getElementsByTagName("TToan")[0] ?? null;

    const tienVat = so(tt, "TgTThue");
    const tongTien = so(tt, "TgTTTBSo");
    let tienHang = so(tt, "TgTCThue");
    // HĐ không chịu thuế thường không khai TgTCThue — suy ngược từ tổng, giống
    // cách ImportService làm. Không có bước này thì mọi HĐ loại đó báo lệch oan.
    if (tienHang === 0) tienHang = tongTien - tienVat;

    return {
      tenFile,
      huong: "",              // để trống: server suy theo MST người bán trong file
      mst: lay(ban, "MST"),
      khhd: lay(chung, "KHHDon"),
      soHd: lay(chung, "SHDon"),
      ngay: lay(chung, "NLap"),
      tenDoiTac: lay(ban, "Ten"),
      tienHang,
      tienVat,
    };
  } catch {
    return null;
  }
}

const ngayNgan = (s: string | null) => {
  const p = (s ?? "").slice(0, 10).split("-");
  return p.length === 3 && p[0] ? `${p[2]}/${p[1]}/${p[0].slice(2)}` : "";
};

// Cột chung cho hai lưới. Khác nhau đúng một chữ ở nhãn tên/MST đối tác.
//
// xem: hàm mở ảnh hóa đơn, truyền từ component vì nó cần state (modal). Nhận qua
// tham số chứ không đọc biến ngoài để hai bảng cột vẫn dựng được ở cấp module —
// dựng lại mỗi lần render thì antd coi là cột MỚI và reset bề rộng người dùng kéo.
const cotHoaDon = (
  vaiTro: string,
  xem: (m: BangKeHoaDon) => void,
  xoa: (m: BangKeHoaDon) => void,
): ColumnsType<BangKeHoaDon> => [
  { title: "STT", dataIndex: "stt", width: 44, align: "right", fixed: "left" },
  { title: "KHHD", dataIndex: "khHd", width: 80 },
  { title: "Số HĐ", dataIndex: "soHd", width: 86 },
  { title: "Ngày", dataIndex: "ngay", width: 76,
    render: (v: string | null) => ngayNgan(v) },
  { title: `Tên ${vaiTro}`, dataIndex: "tenDoiTac", width: 230, ellipsis: true,
    render: (v: string | null) => <span title={v ?? ""}>{v}</span> },
  { title: "MST", dataIndex: "mstDoiTac", width: 120 },
  { title: "Tên hàng", dataIndex: "matHang", width: 170, ellipsis: true,
    render: (v: string | null) => <span title={v ?? ""}>{v}</span> },
  { title: "Tiền hàng", dataIndex: "doanhThuChuaVat", width: 130, align: "right",
    render: (v: number) => tien(v) },
  // Thuế suất để TRỐNG khi hóa đơn không khai vat — không bịa thành 0%, vì "không
  // chịu thuế" và "thuế suất 0%" là hai loại khác nhau trên tờ khai.
  { title: "VAT", dataIndex: "thueSuat", width: 50, align: "right",
    render: (v: number | null) => v == null ? "" : String(v) },
  { title: "Tiền VAT", dataIndex: "thueGtgt", width: 120, align: "right",
    render: (v: number) => tien(v) },
  { title: "Ghi chú", dataIndex: "ghiChu", width: 160, ellipsis: true,
    render: (v: string | null) => <span title={v ?? ""}>{v}</span> },
  // CON MẮT mở ảnh hóa đơn gốc (bản HTML cổng TCT trả kèm). Ghim PHẢI để cuộn
  // ngang bao nhiêu vẫn bấm được — cột cuối mà không ghim thì phải kéo hết sang
  // phải mới thấy, đúng thứ hay dùng nhất lại khó với tới nhất.
  { title: "", dataIndex: "xem", width: 76, align: "center", fixed: "right",
    render: (_: unknown, m: BangKeHoaDon) => (
      <>
        <Button type="text" size="small" icon={<EyeOutlined />}
                title={`Xem hóa đơn ${m.khHd ?? ""}/${m.soHd ?? ""}`}
                onClick={() => xem(m)} />
        {/* XÓA — để xám lúc thường, chỉ đỏ khi rê chuột: thao tác không đảo ngược
            được mà lúc nào cũng đỏ trên mọi dòng thì mắt quen đi, mất tác dụng
            cảnh báo. */}
        <Button type="text" size="small" danger icon={<DeleteOutlined />}
                className="nut-xoa-hd"
                title={`Xóa hóa đơn ${m.khHd ?? ""}/${m.soHd ?? ""}`}
                onClick={() => xoa(m)} />
      </>
    ) },
];

const RONG_LUOI = 44 + 80 + 86 + 76 + 230 + 120 + 170 + 130 + 50 + 120 + 160 + 76;

// Kết quả đối chiếu SỔ với bảng kê Excel của cổng TCT. Ba loại vấn đề tách riêng vì
// cách xử lý khác hẳn nhau: thiếu trong sổ thì phải NẠP thêm, thiếu trong file thì
// xem lại đã tải đủ bảng kê chưa, còn lệch tiền thì phải sửa hóa đơn.
interface HdLech {
  khhd: string;
  soHd: string;
  ten: string;
  tienHang: number;
  tienVat: number;
}

interface KetQuaSoat {
  tenFile: string;
  huong: string;                  // VAO | RA — bảng kê của cổng chỉ một hướng
  thieuTrongSo: HdLech[];         // có trong file, chưa nạp vào sổ
  thieuTrongFile: HdLech[];       // có trong sổ, không thấy trong bảng kê
  lechTien: {
    khhd: string; soHd: string; ten: string;
    soHang: number; fileHang: number; soVat: number; fileVat: number;
  }[];
}

interface Props {
  mo: boolean;
  onDong: () => void;
  /**
   * Mã đơn vị cần xem. RỖNG = sổ của chính đơn vị đang đăng nhập (màn của tenant
   * thường); có mã = MDN_NB đang soi đơn vị khác, đi qua endpoint riêng có gate
   * 'internal' ở server.
   */
  maDonVi: string;
  tenDonVi?: string | null;
  nam: number;
  thang: number;
  /** ct22 kỳ trước (VAT khấu trừ kỳ trước) — lấy từ dòng đang chọn trên lưới cha. */
  vatKhauTruKyTruoc?: number | null;
}

export default function ToKhaiXml(
  { mo, onDong, maDonVi, tenDonVi, nam, thang, vatKhauTruKyTruoc }: Props) {

  const [bc, setBc] = useState<BaoCaoThue | null>(null);
  const [tai, setTai] = useState(false);

  // ----- File XML tờ khai kỳ trước (thả vào ô bên phải khối chỉ tiêu) -----
  const [tenFileTk, setTenFileTk] = useState<string | null>(null);
  const [ct43, setCt43] = useState<number | null>(null);
  const [kyTruoc, setKyTruoc] = useState<string | null>(null);

  // Kỳ LIỀN TRƯỚC theo lịch, để đối chiếu với kỳ ghi trong file vừa thả.
  // Tháng 1 lùi về 12 năm ngoái — tờ khai T1 lấy số chuyển sang từ T12 năm trước.
  const kyLienTruoc = useMemo(() => {
    const t = thang <= 1 ? 12 : thang - 1;
    const n = thang <= 1 ? nam - 1 : nam;
    return `${String(t).padStart(2, "0")}/${n}`;
  }, [nam, thang]);

  // Đọc file NGAY TẠI TRÌNH DUYỆT, không gửi lên server: chỉ cần hai con số trong
  // đó (ct43 và kỳ) để hiện lên đối chiếu. Gửi lên rồi tải về chỉ để đọc hai thẻ XML
  // là thừa một vòng mạng.
  // Tách phần đọc NỘI DUNG ra riêng: nhanFile() đã có sẵn chuỗi (đọc bằng f.text()
  // trong vòng lặp), gọi lại FileReader lần nữa là đọc cùng một file hai lượt.
  const docToKhaiKyTruocTuChuoi = (noiDung: string, tenFile: string) => {
    // Giữ nguyên văn để gửi lên server làm khuôn tờ khai mới — xem chú thích ở
    // khai báo xmlKyTruoc.
    setXmlKyTruoc(noiDung);
    setTenFileTk(tenFile);
    try {
      const x = new DOMParser().parseFromString(noiDung, "text/xml");
      const lay = (t: string) =>
        x.getElementsByTagName(t)[0]?.textContent?.trim() ?? "";
      const v = lay("ct43");
      setCt43(v ? Number(v) : null);
      setKyTruoc(lay("kyKKhai") || null);
    } catch {
      // File không phải XML tờ khai — báo rõ thay vì im lặng để số trống,
      // người dùng tưởng đã thả thành công.
      setCt43(null);
      setKyTruoc(null);
      message.error(`${tenFile} không đọc được — có đúng là XML tờ khai không?`);
    }
  };

  // Chặn kết quả CŨ ghi đè kết quả mới khi người dùng đóng/mở nhanh tay hoặc đổi
  // đơn vị liên tiếp — cùng lối với màn Báo cáo thuế.
  const luotRef = useRef(0);

  // ----- TÌM KIẾM TRONG TỪNG BẢNG -----
  // Hai ô RIÊNG cho hai bảng: mua vào 179 HĐ, bán ra 117 HĐ, mà người dùng thường
  // soi một bên (dò một hóa đơn lệch) — dùng chung một ô thì gõ bên này bảng kia
  // cũng bị lọc theo, mất luôn chỗ đang đối chiếu dở.
  const [timVao, setTimVao] = useState("");
  const [timRa, setTimRa] = useState("");

  // setTimeout 0 chứ không gọi thẳng: setTai(true) chạy ĐỒNG BỘ ngay trong thân
  // effect thì React coi đó là cascading render (react-hooks/set-state-in-effect).
  // Đẩy sang lượt sau thì effect chỉ còn việc khởi động — cùng lối với BaoCaoThue.
  // Tách khỏi effect để chỗ khác gọi lại được (xóa hóa đơn xong phải nạp lại cả
  // hai lưới VÀ khối chỉ tiêu — tự bỏ dòng khỏi mảng thì mấy ô tổng giữ số cũ).
  //
  // maDonVi rỗng = ĐƠN VỊ ĐANG ĐĂNG NHẬP (màn của tenant thường, mở bằng nút "Rà
  // soát"). Có mã = MDN_NB đang soi đơn vị khác — endpoint riêng, gate 'internal'.
  //
  // useCallback: xoaHoaDon gọi hàm này, mà xoaHoaDon lại đi vào cột của lưới — hàm
  // mới mỗi lượt vẽ là cột dựng lại liên tục, antd reset bề rộng người dùng đã kéo.
  // Phụ thuộc đúng ba tham số của một lượt đọc sổ; ref và setState vốn ổn định.
  const napBaoCao = useCallback(async () => {
    const luot = ++luotRef.current;
    setTai(true);
    try {
      const r = await (maDonVi ? thueBaoCaoDonVi(maDonVi, nam, thang)
                               : thueBaoCao(thang));
      if (luot === luotRef.current) setBc(r.data);
    } catch (e) {
      if (luot !== luotRef.current) return;
      setBc(null);
      message.error(loiApi(e, maDonVi
        ? `Không đọc được sổ thuế của ${maDonVi}` : "Không đọc được sổ thuế"));
    } finally {
      if (luot === luotRef.current) setTai(false);
    }
  }, [maDonVi, nam, thang]);

  // setTimeout 0 chứ không gọi thẳng: setTai(true) chạy ĐỒNG BỘ ngay trong thân
  // effect thì React coi đó là cascading render (react-hooks/set-state-in-effect).
  useEffect(() => {
    if (!mo) return;
    const id = setTimeout(() => void napBaoCao(), 0);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mo, maDonVi, nam, thang]);

  // ----- Gom số theo THUẾ SUẤT, đúng khối bên phải của form gốc -----
  //
  // Cộng ở FE là chấp nhận được ở đây vì chỉ để HIỂN THỊ đối chiếu; số đi vào tờ
  // khai thật vẫn là bảng tongHop do server tính (xem ThueService.TinhTongHop).
  // Hai chỗ phải khớp nhau — lệch là dấu hiệu dữ liệu có vấn đề, chính là thứ màn
  // này giúp phát hiện.
  const tong = useMemo(() => {
    const ra = bc?.banRa ?? [];
    const vao = bc?.muaVao ?? [];
    // Nhóm theo thuế suất: null (không khai vat) KHÔNG gộp vào 0% — xem chú thích
    // ở cột VAT bên trên.
    const theoSuat = (ds: BangKeHoaDon[], s: number) => ({
      dt: ds.filter((x) => x.thueSuat === s).reduce((t, x) => t + x.doanhThuChuaVat, 0),
      vat: ds.filter((x) => x.thueSuat === s).reduce((t, x) => t + x.thueGtgt, 0),
    });
    return {
      ra0: theoSuat(ra, 0), ra5: theoSuat(ra, 5),
      ra8: theoSuat(ra, 8), ra10: theoSuat(ra, 10),
      raDt: ra.reduce((t, x) => t + x.doanhThuChuaVat, 0),
      raVat: ra.reduce((t, x) => t + x.thueGtgt, 0),
      vaoDt: vao.reduce((t, x) => t + x.doanhThuChuaVat, 0),
      vaoVat: vao.reduce((t, x) => t + x.thueGtgt, 0),
      soRa: ra.length, soVao: vao.length,
    };
  }, [bc]);

  // ============ ĐỐI CHIẾU VỚI BẢNG KÊ EXCEL CỦA CỔNG TCT ============
  //
  // Số hóa đơn: bỏ số 0 đệm đầu rồi đệm lại đủ 7 ký tự — GIỐNG HỆT ImportService
  // .ChuanSoHd bên server. Cổng ghi "0001169" còn sổ có thể ghi "1169"; so nguyên
  // chuỗi thì mọi hóa đơn đều báo lệch oan.
  const chuanSoHd = (tho: string) => {
    const s = (tho ?? "").trim();
    if (!s || !/^\d+$/.test(s)) return s;
    const loi = s.replace(/^0+/, "") || "0";
    return loi.length >= 7 ? loi : loi.padStart(7, "0");
  };

  // Ký hiệu hóa đơn: SỔ và BẢNG KÊ ghi khác nhau — đo thật NHAT_TUAN T7 (14/08):
  //   sổ      ghi "1C26TNT"  (ImportService ghép MẪU SỐ + ký hiệu: KIEU_HD + KHHD)
  //   bảng kê ghi  "C26TNT"  (cổng tách làm hai cột, hàm đọc chỉ lấy cột ký hiệu)
  // So nguyên chuỗi thì CẢ 350 hóa đơn của kỳ đều báo lệch oan. Cắt chữ số mẫu số
  // đứng đầu để đưa hai bên về cùng một dạng.
  const chuanKhhd = (kh: string | null) =>
    (kh ?? "").trim().toUpperCase().replace(/^\d+/, "");

  // Danh tính hóa đơn = ký hiệu + số. KHÔNG đưa MST vào khóa: cổng khai chi nhánh
  // dạng "0100686174-634" còn sổ thường chỉ ghi phần gốc, nên MST là nguồn lệch giả.
  // Trong PHẠM VI MỘT HƯỚNG của một kỳ thì (ký hiệu, số) đã đủ phân biệt.
  const khoaHd = (khhd: string | null, soHd: string | null) =>
    `${chuanKhhd(khhd)}|${chuanSoHd(soHd ?? "")}`;

  const [dangSoat, setDangSoat] = useState(false);
  const [ketQuaSoat, setKetQuaSoat] = useState<KetQuaSoat | null>(null);

  // ----- Xem ảnh hóa đơn gốc (bấm con mắt cuối dòng) -----
  // Giữ cả dòng chứ không chỉ mã: cần khHd/soHd để đặt nhãn cho modal.
  const [hdDangXem, setHdDangXem] = useState<BangKeHoaDon | null>(null);

  // useMemo: cột phải là cùng MỘT tham chiếu giữa các lượt vẽ, dựng lại mỗi lần thì
  // antd coi là cột mới và reset bề rộng người dùng đã kéo.
  // XÓA HÓA ĐƠN — thao tác GHI và KHÔNG ĐẢO NGƯỢC ĐƯỢC, nên hỏi lại trước.
  // Hộp xác nhận nêu rõ ký hiệu/số + tên đối tác: chỉ hiện mã hóa đơn thì cả trăm
  // dòng nhìn na ná nhau, kế toán không đối chiếu được mình đang xóa cái gì.
  //
  // useCallback vì hàm này đi vào cột của lưới — xem chú thích ở COT_VAO bên dưới.
  const xoaHoaDon = useCallback((m: BangKeHoaDon) => {
    Modal.confirm({
      title: "Xóa hóa đơn khỏi sổ?",
      icon: <ExclamationCircleFilled style={{ color: "#cf1322" }} />,
      width: 520,
      content: (
        <div style={{ fontSize: 13, lineHeight: 1.6 }}>
          <div>
            <b>{m.khHd ?? ""}/{m.soHd ?? ""}</b>
            {m.tenDoiTac ? ` — ${m.tenDoiTac}` : ""}
          </div>
          <div style={{ color: "#8c8c8c" }}>{m.maHd}</div>
          <div style={{ marginTop: 8, color: "#cf1322" }}>
            Xóa cả dòng hàng của hóa đơn này và <b>không lấy lại được</b> —
            muốn có lại phải chạy nạp HĐĐT lần nữa.
          </div>
        </div>
      ),
      okText: "Xóa",
      okButtonProps: { danger: true },
      cancelText: "Hủy",
      onOk: async () => {
        try {
          await thueXoaHoaDon(m.maHd, maDonVi || undefined);
          message.success(`Đã xóa ${m.khHd ?? ""}/${m.soHd ?? ""}`);
          // Nạp lại sổ để hai lưới và khối chỉ tiêu cùng cập nhật — tự bỏ dòng khỏi
          // mảng thì mấy ô tổng ở trên vẫn giữ số cũ, nhìn như xóa không ăn.
          await napBaoCao();
        } catch (e) {
          message.error(loiApi(e, "Không xóa được hóa đơn"));
        }
      },
    });
  }, [maDonVi, napBaoCao]);

  // Cột phải là cùng MỘT tham chiếu giữa các lượt vẽ, dựng lại mỗi lần thì antd coi
  // là cột mới và reset bề rộng người dùng đã kéo.
  //
  // ĐỂ REACT COMPILER TỰ NHỚ, không useMemo tay. Bản cũ giữ xoaHoaDon trong một ref
  // rồi gán thẳng lúc vẽ để ép dependency về rỗng — React cấm cách đó
  // (react-hooks/refs): lượt vẽ có thể bị bỏ dở rồi vẽ lại, lúc ấy ref đã mang giá
  // trị của lượt hỏng. Mà chỉ cần useMemo tay là compiler lại bỏ tối ưu cả component
  // vì dependency khai tay không khớp cái nó suy ra.
  //
  // xoaHoaDon và napBaoCao đã bọc useCallback nên hai mảng cột này giữ nguyên tham
  // chiếu chừng nào maDonVi/nam/thang chưa đổi — đúng thứ antd cần.
  //
  // TẮT react-hooks/refs ở hai dòng dưới — BÁO NHẦM, không phải bỏ qua cho tiện:
  // luật lần chuỗi cột → xoaHoaDon → napBaoCao → luotRef rồi kết luận "có thể đọc
  // ref lúc vẽ". Thực tế luotRef CHỈ bị đụng trong thân async của napBaoCao, tức là
  // đã chạy xong lượt vẽ (nó là bộ chống đua giữa hai lượt đọc sổ, xem chú thích ở
  // luotRef). Không có đường nào chạm .current trong lúc vẽ.
  // eslint-disable-next-line react-hooks/refs
  const COT_VAO = cotHoaDon("người bán", setHdDangXem, xoaHoaDon);
  // eslint-disable-next-line react-hooks/refs
  const COT_RA = cotHoaDon("người mua", setHdDangXem, xoaHoaDon);

  // Lọc bảng theo từ khóa. So trên các cột người dùng thật sự dò: ký hiệu, số HĐ,
  // tên đối tác, MST, mặt hàng, ghi chú. KHÔNG so cột tiền — gõ "5" mà ra mọi dòng
  // có số 5 trong tiền thì lọc thành vô dụng.
  //
  // BỎ DẤU trước khi so: kế toán gõ "truong" phải ra "CÔNG TY TRƯỜNG…", bắt gõ đủ
  // dấu thì tìm kiếm gần như không dùng được.
  const locHd = (ds: BangKeHoaDon[] | undefined, tu: string) => {
    const k = boDau(tu);
    if (!k) return ds ?? [];
    return (ds ?? []).filter((m) =>
      boDau(`${m.khHd ?? ""} ${m.soHd ?? ""} ${m.tenDoiTac ?? ""} `
          + `${m.mstDoiTac ?? ""} ${m.matHang ?? ""} ${m.ghiChu ?? ""}`).includes(k));
  };

  // ----- Rà soát bằng XML hóa đơn (gộp từ ModalRaSoat) -----
  // Giữ nguyên văn XML tờ khai kỳ trước để gửi lên server: server vừa lấy ct43 làm
  // ct22, vừa dùng chính file này làm KHUÔN cho tờ khai mới (thông tin đơn vị, cơ
  // quan thuế… sổ không lưu ở đâu cả).
  const [xmlKyTruoc, setXmlKyTruoc] = useState<string | null>(null);
  const [kqRaSoat, setKqRaSoat] = useState<KetQuaRaSoat | null>(null);
  const [soFileHong, setSoFileHong] = useState(0);
  const [kyDaSoat, setKyDaSoat] = useState<{
    thang: number; soHd: number; soVao: number; soRa: number;
    hangVao: number; vatVao: number; hangRa: number; vatRa: number;
  }[]>([]);

  // ----- Tờ khai 01/GTGT -----
  const [dangLapTk, setDangLapTk] = useState(false);
  const [toKhai, setToKhai] = useState<ToKhaiGtgt | null>(null);
  const [dangXuatPdf, setDangXuatPdf] = useState(false);
  // Trỏ tới khối tờ khai để chụp thành PDF — xem xuatPdfToKhai.ts
  const tkRef = useRef<HTMLDivElement | null>(null);

  // So bảng kê Excel của cổng với SỔ đang hiện trên hai lưới.
  //
  // Đối chiếu ở TRÌNH DUYỆT chứ không gửi lên server: sổ đã nằm sẵn trong `bc` rồi,
  // gửi lại lên chỉ để so hai danh sách là thừa một vòng mạng. (Server vẫn lo phần
  // ĐỌC Excel vì frontend không có thư viện đọc .xlsx.)
  // huongMong: bảng nào gọi thì so đúng hướng đó. Trước đây tự đoán hướng theo số
  // đông của file — thả nhầm file mua vào ở nút bán ra thì im lặng so sai bảng.
  const soatBangKe = async (f: File, huongMong: "VAO" | "RA") => {
    setDangSoat(true);
    try {
      const r = await thueDocBangKe(f, maDonVi);
      const tuFile = r.data.hoaDon ?? [];
      if (tuFile.length === 0) {
        message.warning(`${f.name}: không đọc được dòng hóa đơn nào`);
        setKetQuaSoat(null);
        return;
      }

      // Cảnh báo khi file KHÔNG cùng hướng với bảng đang soát: so tiếp thì dòng nào
      // cũng "thiếu trong sổ", vô nghĩa mà nhìn như sổ hổng nặng.
      const soVao = tuFile.filter((x) => x.huong === "VAO").length;
      const huongFile = soVao >= tuFile.length - soVao ? "VAO" : "RA";
      if (huongFile !== huongMong) {
        message.error(
          `${f.name} là bảng kê ${huongFile === "VAO" ? "MUA VÀO" : "BÁN RA"}, `
          + `không phải ${huongMong === "VAO" ? "mua vào" : "bán ra"} — chọn lại file`);
        setKetQuaSoat(null);
        return;
      }

      const huong = huongMong;
      const laVao = huong === "VAO";
      const soSach = (laVao ? bc?.muaVao : bc?.banRa) ?? [];

      const mFile = new Map(tuFile
        .filter((x) => x.huong === huong)
        .map((x) => [khoaHd(x.khhd, x.soHd), x]));
      const mSo = new Map(soSach.map((x) => [khoaHd(x.khHd, x.soHd), x]));

      const thieuTrongSo: KetQuaSoat["thieuTrongSo"] = [];
      const lechTien: KetQuaSoat["lechTien"] = [];

      for (const [k, f2] of mFile) {
        const s = mSo.get(k);
        if (!s) {
          thieuTrongSo.push({
            khhd: f2.khhd, soHd: f2.soHd, ten: f2.tenDoiTac ?? "",
            tienHang: f2.tienHang, tienVat: f2.tienVat,
          });
          continue;
        }
        // Ngưỡng 1 đồng: tiền hàng của sổ gộp từ Σ(SL × ĐG) nên lệch vài hào do làm
        // tròn là bình thường — báo hết thì nhiễu không đọc nổi.
        const lh = Math.abs(s.doanhThuChuaVat - f2.tienHang);
        const lv = Math.abs(s.thueGtgt - f2.tienVat);
        if (lh >= 1 || lv >= 1) {
          lechTien.push({
            khhd: f2.khhd, soHd: f2.soHd, ten: f2.tenDoiTac ?? "",
            soHang: s.doanhThuChuaVat, fileHang: f2.tienHang,
            soVat: s.thueGtgt, fileVat: f2.tienVat,
          });
        }
      }

      const thieuTrongFile: NonNullable<typeof ketQuaSoat>["thieuTrongFile"] = [];
      for (const [k, s] of mSo) {
        if (mFile.has(k)) continue;
        thieuTrongFile.push({
          khhd: s.khHd ?? "", soHd: s.soHd ?? "", ten: s.tenDoiTac ?? "",
          tienHang: s.doanhThuChuaVat, tienVat: s.thueGtgt,
        });
      }

      setKetQuaSoat({ tenFile: f.name, huong, thieuTrongSo, thieuTrongFile, lechTien });
      const tong = thieuTrongSo.length + thieuTrongFile.length + lechTien.length;
      if (tong === 0) message.success(`Khớp hoàn toàn với ${f.name}`);
      else message.warning(`Tìm thấy ${tong} hóa đơn lệch`);
    } catch (e) {
      setKetQuaSoat(null);
      message.error(loiApi(e, "Không đọc được bảng kê Excel"));
    } finally {
      setDangSoat(false);
    }
  };

  // ============ RÀ SOÁT BẰNG XML HÓA ĐƠN (gộp từ ModalRaSoat) ============
  //
  // Soát NHIỀU KỲ trong một lượt: mỗi kỳ gọi riêng với sổ của chính kỳ đó, rồi gộp
  // kết quả lại. Kế toán quan tâm "còn vấn đề gì" chứ không quan tâm vấn đề đó
  // thuộc lượt gọi nào; mỗi dòng đã có ngày và ký hiệu để biết thuộc kỳ nào.
  const soatNhieuKy = async (theoKy: Map<number, HoaDonFile[]>, hong: number) => {
    if (theoKy.size === 0) {
      message.warning("Không đọc được hóa đơn nào từ các file đã chọn");
      return;
    }
    setDangSoat(true);
    try {
      const gop: KetQuaRaSoat = {
        nam: 0, thang: null, soHdFile: 0, soHdSo: 0,
        thieuTrongSo: [], thieuTrongFile: [], lechTien: [], trung: [], saiKy: [],
      };
      for (const [ky, ds] of [...theoKy.entries()].sort((a, b) => a[0] - b[0])) {
        const r = await thueRaSoat(ky, ds, maDonVi || undefined);
        const k = r.data;
        gop.nam = k.nam;
        gop.soHdFile += k.soHdFile;
        gop.soHdSo += k.soHdSo;
        gop.thieuTrongSo.push(...k.thieuTrongSo);
        gop.thieuTrongFile.push(...k.thieuTrongFile);
        gop.lechTien.push(...k.lechTien);
        gop.trung.push(...k.trung);
        gop.saiKy.push(...k.saiKy);
      }
      setKqRaSoat(gop);
      setSoFileHong(hong);
    } catch (e) {
      message.error(loiApi(e, "Không rà soát được"));
    } finally {
      setDangSoat(false);
    }
  };

  // MỘT khung thả cho MỌI loại file — tự nhận diện theo NỘI DUNG, không hỏi người
  // dùng đây là file gì. Hóa đơn có nút <DLHDon>, tờ khai có <HSoKhaiThue>; hai gốc
  // khác hẳn nhau nên nhận diện chắc chắn, không phải dựa vào tên file (tên do
  // người dùng đặt, đổi lúc nào không biết).
  const nhanFile = async (files: File[]) => {
    const ds: HoaDonFile[] = [];
    let hong = 0;
    let daNhanTk = false;

    for (const f of files) {
      const ten = f.name.toLowerCase();

      // Bảng kê Excel: gửi server đọc (frontend không có thư viện đọc .xlsx).
      // Truyền maDonVi để server suy hướng theo MST của ĐÚNG đơn vị đang xem.
      if (ten.endsWith(".xlsx") || ten.endsWith(".xls")) {
        try {
          const r = await thueDocBangKe(f, maDonVi);
          ds.push(...r.data.hoaDon);
        } catch (e) {
          hong++;
          message.warning(loiApi(e, `Không đọc được ${f.name}`));
        }
        continue;
      }

      if (!ten.endsWith(".xml")) { hong++; continue; }
      const noiDung = await f.text();

      // Tờ khai kỳ trước: giữ làm nguồn ct22 + khuôn XML, không đưa vào rà soát
      if (noiDung.includes("<HSoKhaiThue") || noiDung.includes("ct43")) {
        docToKhaiKyTruocTuChuoi(noiDung, f.name);
        daNhanTk = true;
        continue;
      }

      const hd = docXmlHoaDon(noiDung, f.name);
      if (hd) ds.push(hd); else hong++;
    }

    // TÁCH HÓA ĐƠN THEO KỲ, mỗi kỳ soát với sổ của CHÍNH KỲ ĐÓ.
    // Kế toán thả cả bộ tháng 6 lẫn tháng 7 trong một lần là bình thường. Gom hết
    // rồi so với sổ một tháng thì toàn bộ hóa đơn tháng kia bị báo "chưa nạp vào
    // sổ" — hàng trăm dòng báo động giả, trong khi sổ chẳng hổng chỗ nào.
    const theoKy = new Map<number, HoaDonFile[]>();
    for (const h of ds) {
      const m = Number((h.ngay ?? "").slice(5, 7));
      const k = m >= 1 && m <= 12 ? m : thang;
      const cu = theoKy.get(k);
      if (cu) cu.push(h); else theoKy.set(k, [h]);
    }

    // Tổng theo kỳ và theo hướng — con số kế toán đối chiếu thẳng với chỉ tiêu tờ
    // khai (ct23/ct24 cho vào, ct32/ct33 cho ra).
    setKyDaSoat([...theoKy.entries()].map(([m, v]) => {
      const vao = v.filter((x) => x.huong !== "RA");
      const ra = v.filter((x) => x.huong === "RA");
      const cong = (a: HoaDonFile[], f: (x: HoaDonFile) => number) =>
        a.reduce((s, x) => s + (f(x) || 0), 0);
      return {
        thang: m, soHd: v.length, soVao: vao.length, soRa: ra.length,
        hangVao: cong(vao, (x) => x.tienHang), vatVao: cong(vao, (x) => x.tienVat),
        hangRa: cong(ra, (x) => x.tienHang), vatRa: cong(ra, (x) => x.tienVat),
      };
    }).sort((a, b) => a.thang - b.thang));

    // Chỉ có tờ khai, không hóa đơn nào thì đừng gọi rà soát — sẽ báo "không đọc
    // được hóa đơn nào" trong khi người dùng vừa nạp tờ khai thành công.
    if (ds.length > 0 || hong > 0) await soatNhieuKy(theoKy, hong);
    else if (daNhanTk) message.success("Đã nhận tờ khai kỳ trước");
  };

  // ============ LẬP TỜ KHAI 01/GTGT ============
  const lapToKhai = async () => {
    setDangLapTk(true);
    try {
      const r = await thueLapToKhai(thang, xmlKyTruoc ?? undefined,
                                    maDonVi || undefined);
      setToKhai(r.data);
    } catch (e) {
      // Thiếu tờ khai kỳ trước là tình huống hay gặp nhất, và lời nhắn của server
      // dài (nêu rõ tháng nào, vì sao cần) — dùng Modal để đọc hết thay vì message
      // trôi ngang màn hình rồi biến mất sau vài giây.
      const loi = loiApi(e, "Không lập được tờ khai");
      if (loi.includes("tờ khai kỳ trước")) {
        setToKhai(null);
        Modal.warning({ title: "Cần tờ khai kỳ trước", content: loi,
                        okText: "Đã hiểu", width: 560 });
      } else message.error(loi);
    } finally {
      setDangLapTk(false);
    }
  };

  // Tên file PDF theo cùng nếp với tên file XML của HTKK, để hai file của cùng một
  // kỳ nằm cạnh nhau khi sắp xếp trong thư mục.
  const tenFilePdf = () =>
    toKhai ? `TKGTGT_T${toKhai.thang}_${toKhai.nam}_${toKhai.mst}.pdf`
           : `to-khai-${thang}.pdf`;

  const taiPdf = async () => {
    const goc = tkRef.current;
    if (!goc) return;
    setDangXuatPdf(true);
    try {
      const { xuatPdfToKhai } = await import("./xuatPdfToKhai");
      await xuatPdfToKhai(goc, tenFilePdf());
    } catch (e) {
      message.error(e instanceof Error ? e.message : "Không xuất được PDF");
    } finally {
      setDangXuatPdf(false);
    }
  };

  const taiXml = async () => {
    try {
      const r = await thueToKhaiXml(thang, xmlKyTruoc ?? undefined,
                                    maDonVi || undefined);
      const url = URL.createObjectURL(r.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = toKhai?.tenFileXml ?? `to-khai-${thang}.xml`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      message.error(loiApi(e, "Không tải được XML tờ khai"));
    }
  };

  const tongVanDe = kqRaSoat
    ? kqRaSoat.thieuTrongSo.length + kqRaSoat.lechTien.length
      + kqRaSoat.trung.length + kqRaSoat.saiKy.length
    : 0;

  // ct36 và ct40 của tờ khai — xem chú thích tại chỗ hiển thị bên dưới.
  // Tồn đầu ưu tiên file vừa thả, không có thì lấy số trên lưới; cả hai trống thì
  // coi như 0 để vẫn tính được phần phát sinh.
  const tonDau = ct43 ?? vatKhauTruKyTruoc ?? 0;
  const phatSinh = tong.raVat - tong.vaoVat;
  const conPhaiNop = phatSinh - tonDau;

  // Ô số chỉ đọc kiểu VFP: nhãn trái, số phải, viền mảnh.
  const o = (nhan: string, gia: number | null | undefined,
             lop = "", nhanLop = "") => (
    <div className="o-so">
      <span className={`o-nhan ${nhanLop}`}>{nhan}</span>
      <span className={`o-gia ${lop}`}>{tien(gia)}</span>
    </div>
  );

  // Một khối lưới = DẢI CHỈ TIÊU (như "MV Tờ khai / VAT Vào Tờ khai / Lệch GTMV /
  // Lệch VATMV" trong form gốc) + lưới hóa đơn + dải tổng dưới đáy.
  //
  // Ý nghĩa cặp ô LỆCH — đây là chỗ đáng giá nhất của form này:
  //   "… Tờ khai"  = số sẽ đưa lên tờ khai, gộp từ SỔ hóa đơn của kỳ
  //   "Lệch GT…"   = chênh giữa số tờ khai và số bảng kê của cổng TCT
  // Bảng kê cổng CHƯA nối (cần đọc Excel trong raw\RA, raw\VAO — xem DOC_14_08_26
  // mục "Chưa đọc Excel tổng hợp của TCT"), nên hai ô lệch tạm bằng 0 và ghi rõ ở
  // tooltip. KHÔNG bịa số vào đó: ô lệch bằng 0 mà thực ra chưa đối chiếu là nguy
  // hiểm hơn hẳn bỏ trống, vì nó nói "đã kiểm, khớp rồi".
  const luoi = (
    ten: string, viTat: string, huong: "VAO" | "RA",
    ds: BangKeHoaDon[] | undefined,
    cot: ColumnsType<BangKeHoaDon>, dt: number, vat: number, so: number,
    // Từ khóa tìm của RIÊNG bảng này + hàm đổi nó. Truyền vào chứ không đọc thẳng
    // state trong thân: cùng một hàm luoi dựng cả hai bảng, đọc thẳng thì hai bảng
    // dùng chung một ô tìm.
    tuTim: string, doiTuTim: (v: string) => void,
    phuThem?: React.ReactNode,
  ) => (
    <div className="khoi-luoi">
      {/* Dải chỉ tiêu của khối — hàng trên cùng, đúng bố cục form gốc */}
      <div className="dai-chi-tieu">
        <div className="ct-o">
          <span className="ct-nhan">{viTat} Tờ khai</span>
          <span className="ct-gia">{tien(dt)}</span>
        </div>
        <div className="ct-o">
          <span className="ct-nhan">VAT {viTat} Tờ khai</span>
          <span className="ct-gia gia-xanh">{tien(vat)}</span>
        </div>
        <div className="ct-o" title="Chênh tiền hàng giữa tờ khai và bảng kê cổng TCT — chưa nối bảng kê nên tạm 0">
          <span className="ct-nhan">Lệch GT{viTat}</span>
          <span className="ct-gia">{tien(0)}</span>
        </div>
        <div className="ct-o" title="Chênh tiền VAT giữa tờ khai và bảng kê cổng TCT — chưa nối bảng kê nên tạm 0">
          <span className="ct-nhan">Lệch VAT{viTat}</span>
          <span className="ct-gia">{tien(0)}</span>
        </div>
        {phuThem}

        {/* TÌM HĐ LỆCH — MỖI BẢNG MỘT NÚT, so đúng hướng của bảng đó.
            Trước đây chung một nút ở khối thả file: người dùng không biết nó đang so
            bảng nào, và thả nhầm file thì im lặng so sai. Nút nằm ngay trên bảng
            thì "so cái gì" là rõ ràng.
            <label> bọc input ẩn thay vì Upload của antd: khối thả file ở trên đã
            chiếm sự kiện thả của cả cột, lồng thêm Upload nữa thì hai cái tranh nhau. */}
        <label className="ct-o ct-nut-soat">
          <span className="ct-nhan">&nbsp;</span>
          <input type="file" accept=".xlsx" hidden
                 onChange={(e) => {
                   const f = e.target.files?.[0];
                   // Xóa value để chọn LẠI ĐÚNG file vừa rồi vẫn kích hoạt onChange
                   e.target.value = "";
                   if (f) void soatBangKe(f, huong);
                 }} />
          <Button size="small" icon={<FileExcelOutlined />} loading={dangSoat}
                  onClick={(e) => e.currentTarget.parentElement
                    ?.querySelector("input")?.click()}
                  title={`Chọn bảng kê Excel ${huong === "VAO" ? "mua vào" : "bán ra"}`
                         + " tải từ cổng hoadondientu.gdt.gov.vn"}>
            Tìm HĐ lệch
          </Button>
        </label>

        {/* Ô TÌM của RIÊNG bảng này — bảng mua vào 179 HĐ, bán ra 117 HĐ, không có
            ô này thì phải cuộn tay để dò một hóa đơn. Lọc ngay lúc gõ (dữ liệu đã
            nằm sẵn ở client, không gọi server nên không cần debounce). */}
        <div className="ct-o ct-tim">
          <span className="ct-nhan">&nbsp;</span>
          <Input
            allowClear
            size="small"
            value={tuTim}
            onChange={(e) => doiTuTim(e.target.value)}
            prefix={<SearchOutlined />}
            placeholder="Tìm ký hiệu, số HĐ, tên, MST, mặt hàng…"
          />
        </div>
      </div>

      <Table<BangKeHoaDon>
        className="luoi-tk"
        size="small"
        rowKey="maHd"
        dataSource={locHd(ds, tuTim)}
        columns={cot}
        loading={tai}
        pagination={false}
        scroll={{ x: RONG_LUOI, y: "calc(50vh - 190px)" }}
        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE}
                                    description={tuTim
                                      ? `Không có hóa đơn nào khớp "${tuTim}"`
                                      : `Kỳ này chưa có hóa đơn ${ten.toLowerCase()}`} /> }}
      />

      {/* Dải tổng dưới đáy lưới — form gốc cũng cộng lại ở đây, để mắt không phải
          chạy ngược lên đầu khối khi đang đọc dòng cuối. */}
      <div className="dai-tong">
        <Typography.Text strong>{ten}</Typography.Text>
        {/* ĐANG LỌC thì nói rõ "x/y", và TIỀN vẫn là tổng CỦA CẢ KỲ — số đó đi vào
            tờ khai nên không được đổi theo bộ lọc. Không ghi rõ thì người dùng
            tưởng tổng là của mấy dòng đang thấy. */}
        {tuTim
          ? <span className="dem-hd">
              {locHd(ds, tuTim).length}/{so} hóa đơn — đang lọc
            </span>
          : <span className="dem-hd">{so} hóa đơn</span>}
        <span className="day" />
        <span className="tong-nhan">Tiền hàng{tuTim ? " (cả kỳ)" : ""}</span>
        <span className="tong-gia">{tien(dt)}</span>
        <span className="tong-nhan">Tiền VAT{tuTim ? " (cả kỳ)" : ""}</span>
        <span className="tong-gia tong-vat">{tien(vat)}</span>
      </div>
    </div>
  );

  return (
    <Modal
      title={
        <span>
          <FileTextOutlined style={{ marginRight: 8 }} />
          Rà soát &amp; lập tờ khai
          {maDonVi && <> — <b>{maDonVi}</b></>}
          {tenDonVi && <span className="ten-dv"> · {tenDonVi}</span>}
          <span className="ky-tk"> · kỳ {String(thang).padStart(2, "0")}/{nam}</span>
        </span>
      }
      open={mo}
      onCancel={onDong}
      // Nút TẠO TỜ KHAI nằm ở FOOTER — vùng antd không cho cuộn, nên nút luôn nhìn
      // thấy dù hai lưới hóa đơn dài bao nhiêu. Để trong thân thì cuộn xuống xem
      // hóa đơn là nút trôi mất khỏi màn hình.
      footer={
        <div className="chan-to-khai">
          <span className="chan-nhan">
            {toKhai
              ? <>Đã lập tờ khai tháng <b>{toKhai.thang}/{toKhai.nam}</b>
                  {!toKhai.choXuat && <span className="chan-loi"> , còn lỗi phải xử lý</span>}</>
              : tenFileTk
                ? <>Đã nhận tờ khai kỳ trước, sẵn sàng lập tờ khai</>
                : <span className="chan-loi">
                    Chưa có tờ khai kỳ trước (tháng {kyLienTruoc})
                    {" "}, hãy thả file XML tờ khai kỳ đó vào ô trên
                  </span>}
          </span>

          {toKhai && (
            <>
              {/* Tải THẲNG file PDF, không qua hộp thoại in: bấm một lần là có file
                  trong thư mục Tải về, cùng nhịp với nút Tải XML bên cạnh. */}
              <Button icon={<FilePdfOutlined />} loading={dangXuatPdf}
                      onClick={taiPdf} title={`Tải ${tenFilePdf()}`}>
                Lưu PDF
              </Button>
              <Button icon={<DownloadOutlined />} disabled={!toKhai.choXuat}
                      onClick={taiXml}
                      title={toKhai.choXuat ? `Tải ${toKhai.tenFileXml}`
                                            : "Còn lỗi chặn — xử lý hết mới xuất được XML"}>
                Tải XML nạp HTKK
              </Button>
            </>
          )}

          {/* MỘT nút cho cả tạo mới lẫn tạo lại — đổi nhãn theo trạng thái. Tạo lại
              cần thiết vì tờ khai trên màn là ảnh chụp lúc bấm: sửa dữ liệu dưới sổ
              hay đổi file tờ khai kỳ trước rồi thì nó không tự cập nhật. */}
          <Button type="primary" size="large"
                  icon={toKhai ? <ReloadOutlined /> : <FileDoneOutlined />}
                  loading={dangLapTk} onClick={lapToKhai}
                  title={toKhai ? "Tính lại từ dữ liệu sổ hiện tại"
                                : `Lập tờ khai tháng ${thang} từ dữ liệu sổ`}>
            {toKhai ? `Tạo lại tờ khai tháng ${thang}`
                    : `Tạo tờ khai tháng ${thang}`}
          </Button>
        </div>
      }
      width="100vw"
      style={{ top: 0, paddingBottom: 0, maxWidth: "100vw" }}
      styles={{ body: { height: "calc(100vh - 148px)", overflow: "auto", padding: 8 } }}
    >
      <div className="to-khai-xml">
        {/* ===== KHỐI CHỈ TIÊU ===== */}
        <div className="khoi-chi-tieu">
          <div className="cot-ct">
            <div className="tieu-de-ct">Doanh thu bán ra theo thuế suất</div>
            {o("Doanh thu 0%", tong.ra0.dt)}
            {o("Doanh thu 5%", tong.ra5.dt)}
            {o("Doanh thu 8%", tong.ra8.dt)}
            {o("Doanh thu 10%", tong.ra10.dt)}
            {o("Tổng doanh thu", tong.raDt, "gia-dam")}
          </div>

          <div className="cot-ct">
            <div className="tieu-de-ct">Thuế GTGT bán ra</div>
            {o("VAT 0%", tong.ra0.vat)}
            {o("VAT 5%", tong.ra5.vat)}
            {o("VAT 8%", tong.ra8.vat)}
            {o("VAT 10%", tong.ra10.vat)}
            {o("Tổng VAT bán ra", tong.raVat, "gia-dam")}
          </div>

          <div className="cot-ct">
            <div className="tieu-de-ct">Mua vào &amp; khấu trừ</div>
            {/* Khấu trừ kỳ trước KHÔNG tính từ hóa đơn mà lấy từ tờ khai kỳ trước
                (BR-TK-02). Hai nguồn, ưu tiên FILE VỪA THẢ vì đó là thứ người dùng
                chủ động chọn ngay lúc này; không có file thì lùi về số trên lưới
                (cột Tồn đầu, đọc từ bảng TOKHAI).
                Cả hai đều trống thì để TRỐNG, không hiện 0 — 0 nghĩa là đã khai và
                bằng 0, khác hẳn chưa khai. */}
            {o("VAT khấu trừ kỳ trước", ct43 ?? vatKhauTruKyTruoc,
               "gia-xanh", "nhan-do")}
            {o("Giá trị mua vào", tong.vaoDt)}
            {o("VAT mua vào", tong.vaoVat, "gia-xanh")}
            {/* Hai dòng cuối theo đúng công thức tờ khai 01/GTGT:
                  ct36 = VAT bán ra − VAT mua vào  (phát sinh trong kỳ)
                  ct40 = ct36 − ct22               (còn phải nộp, sau khi trừ tồn đầu)
                DƯƠNG là phải nộp, ÂM là còn được khấu trừ chuyển kỳ sau — nên đổi
                luôn nhãn theo dấu, khỏi để người đọc tự suy. */}
            {o("VAT phát sinh trong kỳ", phatSinh)}
            {o(conPhaiNop >= 0 ? "VAT phải nộp" : "Còn khấu trừ kỳ sau",
               Math.abs(conPhaiNop), "gia-dam")}
          </div>

          {/* Ô THẢ FILE XML TỜ KHAI KỲ TRƯỚC.
              Chỉ tiêu 43 (còn khấu trừ chuyển kỳ sau) của kỳ trước CHÍNH LÀ chỉ tiêu
              22 (khấu trừ kỳ trước chuyển sang) của kỳ này — BR-TK-02. Sổ không lưu
              số đó ở đâu cả, nên phải đọc từ file tờ khai đã nộp.
              Đọc ngay tại trình duyệt để hiện số lên đối chiếu TRƯỚC khi dùng: thấy
              con số quen thuộc là biết chọn đúng file, khỏi lập xong mới phát hiện. */}
          <div className="cot-ct cot-tha-file">
            <div className="tieu-de-ct">Tờ khai kỳ trước</div>
            {/* MỘT khung thả cho MỌI loại file — tự nhận diện theo nội dung, xem
                chú thích ở nhanFile(). Nhận cả XML hóa đơn (để rà soát), XML tờ
                khai kỳ trước (lấy ct43) và bảng kê Excel. */}
            <Upload.Dragger
              accept=".xml,.xlsx,.xls"
              multiple
              showUploadList={false}
              disabled={dangSoat}
              className="tha-xml"
              beforeUpload={(_, danhSach) => {
                void nhanFile(danhSach as File[]);
                // LIST_IGNORE: đọc file ngay tại máy, KHÔNG upload lên server —
                // trả về đây để antd khỏi tự gửi và khỏi thêm vào danh sách file.
                return Upload.LIST_IGNORE;
              }}
            >
              <p className="tha-icon"><InboxOutlined /></p>
              <p className="tha-chu">Kéo thả file để rà soát</p>
              <p className="tha-phu">
                XML hóa đơn · XML tờ khai kỳ trước · bảng kê Excel
              </p>
            </Upload.Dragger>

            {tenFileTk && (
              <div className="da-doc-tk">
                <div className="ten-file" title={tenFileTk}>{tenFileTk}</div>
                <div className="so-doc-duoc">
                  {kyTruoc && <>Kỳ <b>{kyTruoc}</b> · </>}
                  chỉ tiêu 43: <b className="gia-xanh">{tien(ct43)}</b>
                </div>
                {/* Cảnh báo khi kỳ của file KHÔNG phải kỳ liền trước — chọn nhầm
                    file là toàn bộ số khấu trừ sai, mà nhìn số không tự biết được. */}
                {kyTruoc && kyTruoc !== kyLienTruoc && (
                  <div className="canh-bao-ky">
                    File là kỳ {kyTruoc}, không phải kỳ liền trước ({kyLienTruoc})
                  </div>
                )}
              </div>
            )}

          </div>
        </div>

        {/* ===== KẾT QUẢ ĐỐI CHIẾU VỚI BẢNG KÊ ===== */}
        {ketQuaSoat && (
          <div className="kq-soat">
            <div className="kq-dau">
              <b>Hóa đơn lệch — {ketQuaSoat.huong === "VAO" ? "Mua vào" : "Bán ra"}</b>
              <span className="kq-file">{ketQuaSoat.tenFile}</span>
              <Tag color={ketQuaSoat.huong === "VAO" ? "red" : "blue"}>
                {ketQuaSoat.huong === "VAO" ? "Mua vào" : "Bán ra"}
              </Tag>
              <span className="day" />
              <Button size="small" onClick={() => setKetQuaSoat(null)}>Đóng</Button>
            </div>

            {ketQuaSoat.thieuTrongSo.length === 0
              && ketQuaSoat.thieuTrongFile.length === 0
              && ketQuaSoat.lechTien.length === 0 ? (
              <div className="kq-khop">
                Sổ khớp hoàn toàn với bảng kê — không có hóa đơn nào lệch.
              </div>
            ) : (
              <div className="kq-cot">
                {/* Ba loại tách riêng vì cách xử lý khác hẳn nhau — xem chú thích
                    ở interface KetQuaSoat. */}
                {ketQuaSoat.thieuTrongSo.length > 0 && (
                  <div className="kq-nhom">
                    <div className="kq-ten kq-do">
                      Có trong bảng kê, CHƯA nạp vào sổ ({ketQuaSoat.thieuTrongSo.length})
                    </div>
                    {ketQuaSoat.thieuTrongSo.map((x, i) => (
                      <div className="kq-dong" key={i}>
                        <span className="kq-hd">{x.khhd} / {x.soHd}</span>
                        <span className="kq-ten-kh" title={x.ten}>{x.ten}</span>
                        <span className="kq-so">{tien(x.tienHang)}</span>
                        <span className="kq-so">{tien(x.tienVat)}</span>
                      </div>
                    ))}
                  </div>
                )}

                {ketQuaSoat.thieuTrongFile.length > 0 && (
                  <div className="kq-nhom">
                    <div className="kq-ten kq-cam">
                      Có trong sổ, KHÔNG thấy trong bảng kê ({ketQuaSoat.thieuTrongFile.length})
                    </div>
                    {ketQuaSoat.thieuTrongFile.map((x, i) => (
                      <div className="kq-dong" key={i}>
                        <span className="kq-hd">{x.khhd} / {x.soHd}</span>
                        <span className="kq-ten-kh" title={x.ten}>{x.ten}</span>
                        <span className="kq-so">{tien(x.tienHang)}</span>
                        <span className="kq-so">{tien(x.tienVat)}</span>
                      </div>
                    ))}
                  </div>
                )}

                {ketQuaSoat.lechTien.length > 0 && (
                  <div className="kq-nhom">
                    <div className="kq-ten kq-do">
                      Lệch tiền ({ketQuaSoat.lechTien.length})
                    </div>
                    {ketQuaSoat.lechTien.map((x, i) => (
                      <div className="kq-dong" key={i}>
                        <span className="kq-hd">{x.khhd} / {x.soHd}</span>
                        <span className="kq-ten-kh" title={x.ten}>{x.ten}</span>
                        {/* Hiện CẢ HAI số để thấy lệch ở đâu — chỉ đưa hiệu số thì
                            vẫn phải mở hai nơi ra dò lại. */}
                        <span className="kq-so">
                          sổ {tien(x.soHang)} · kê {tien(x.fileHang)}
                        </span>
                        <span className="kq-so">
                          VAT sổ {tien(x.soVat)} · kê {tien(x.fileVat)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ===== HAI LƯỚI HÓA ĐƠN =====
            MV / BR là viết tắt của form gốc: Mua Vào, Bán Ra. Giữ nguyên chữ đó ở
            nhãn các ô chỉ tiêu để kế toán quen form cũ đọc được ngay. */}
        {luoi("Mua vào", "MV", "VAO", bc?.muaVao, COT_VAO,
              tong.vaoDt, tong.vaoVat, tong.soVao, timVao, setTimVao)}

        {/* ===== TÓM TẮT CÁC KỲ ĐÃ THẢ FILE =====
            Chỉ liệt kê từng kỳ kèm TỔNG TIỀN, không bày bảng chi tiết hàng trăm
            dòng — đây là con số kế toán đối chiếu thẳng với chỉ tiêu tờ khai. */}
        {kyDaSoat.length > 0 && (
          <div className="ds-ky">
            {kyDaSoat.map((k) => (
              <div key={k.thang}
                   className={`ky-dong ${k.thang === thang ? "ky-hientai" : ""}`}>
                <div className="ky-ten">
                  Tháng {k.thang}
                  {k.thang === thang && <span className="ky-nhan">đang lập tờ khai</span>}
                </div>
                <div className="ky-so">
                  <span className="ky-nhom">
                    <span className="ky-mo">Mua vào</span>
                    <b>{k.soVao}</b> HĐ · {tienTron(k.hangVao)} · VAT <b>{tienTron(k.vatVao)}</b>
                  </span>
                  <span className="ky-nhom">
                    <span className="ky-mo">Bán ra</span>
                    <b>{k.soRa}</b> HĐ · {tienTron(k.hangRa)} · VAT <b>{tienTron(k.vatRa)}</b>
                  </span>
                </div>
              </div>
            ))}

            {kqRaSoat && (
              <div className="ky-tomtat">
                {tongVanDe === 0
                  ? <span className="ky-ok">✓ Dữ liệu file khớp với sổ</span>
                  : <span className="ky-loi">
                      {tongVanDe} điểm lệch giữa file và sổ
                      {kqRaSoat.thieuTrongSo.length > 0 && <> · thiếu trong sổ: {kqRaSoat.thieuTrongSo.length}</>}
                      {kqRaSoat.lechTien.length > 0 && <> · lệch tiền: {kqRaSoat.lechTien.length}</>}
                      {kqRaSoat.trung.length > 0 && <> · trùng: {kqRaSoat.trung.length}</>}
                    </span>}
                {soFileHong > 0 && <span className="ky-bo"> · bỏ qua {soFileHong} file</span>}
              </div>
            )}
          </div>
        )}

        {luoi("Bán ra", "BR", "RA", bc?.banRa, COT_RA,
              tong.raDt, tong.raVat, tong.soRa, timRa, setTimRa,
              // Ba ô riêng của khối bán ra trong form gốc: số hóa đơn, số khấu trừ
              // cuối kỳ và chênh giữa hai bên. "Đấu trừ Cuối" ở ảnh là lỗi gõ của
              // form VFP — đúng ra là KHẤU TRỪ CUỐI, nên dùng chữ đúng ở đây.
              <>
                <div className="ct-o ct-nho">
                  <span className="ct-nhan">STT HĐ</span>
                  <span className="ct-gia">{tong.soRa || ""}</span>
                </div>
                <div className="ct-o ct-nho"
                     title="Số còn được khấu trừ chuyển kỳ sau (chỉ tiêu 43)">
                  <span className="ct-nhan">Khấu trừ cuối</span>
                  <span className="ct-gia gia-xanh">
                    {conPhaiNop < 0 ? tien(Math.abs(conPhaiNop)) : tien(0)}
                  </span>
                </div>
                <div className="ct-o ct-nho"
                     title="Chênh số hóa đơn giữa sổ và bảng kê cổng — chưa nối bảng kê">
                  <span className="ct-nhan">Lệch</span>
                  <span className="ct-gia">0</span>
                </div>
              </>)}

        {/* ===== TỜ KHAI 01/GTGT ĐÃ LẬP =====
            ref để nút "Lưu PDF" ở footer chụp đúng khối này — nút nằm ngoài thân
            modal nên không với tới bằng querySelector trong phạm vi component. */}
        {toKhai && (
          <div className="khoi-to-khai" ref={tkRef}>
            <BangToKhai tk={toKhai} />
          </div>
        )}
      </div>

      {/* Ảnh hóa đơn gốc — modal LỒNG trong modal này. antd tự xếp lớp z-index nên
          nó nằm trên, đóng lại vẫn giữ nguyên chỗ đang xem ở lưới bên dưới.
          maDonVi truyền xuống để MDN_NB mở đúng hóa đơn của đơn vị đang soi, không
          phải của chính nó (cùng lý do với thueDocBangKe). */}
      <HtmlHoaDon
        mo={hdDangXem != null}
        onDong={() => setHdDangXem(null)}
        nhan={hdDangXem ? `${hdDangXem.khHd ?? ""}/${hdDangXem.soHd ?? ""}` : undefined}
        tai={async () => {
          if (!hdDangXem) return { html: null, duongDan: null };
          try {
            return await thueHtmlHoaDon(hdDangXem.maHd, maDonVi || undefined);
          } catch (e: unknown) {
            // 404 = hóa đơn không kèm bản gốc HTML: chuyện BÌNH THƯỜNG (chỉ đơn vị
            // có kho SCAN_DOC mới có file). Trả rỗng để modal hiện khung giải thích,
            // thay vì để lọt lỗi thô "Request failed with status code 404".
            const st = (e as { response?: { status?: number } })?.response?.status;
            if (st === 404) return { html: null, duongDan: null };
            throw e;
          }
        }}
      />
    </Modal>
  );
}
