import { useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import {
  Card, Table, Button, message, Typography, Input, Select, Space,
  Tag, Checkbox, Progress, Alert, Modal, Empty, InputNumber, Popconfirm,
} from "antd";
import {
  getAdminTenants, getLeftoverFiles, getRawFiles, getRawHtml, importOne,
  getTctCredential, saveTctCredential, xemTctCredential,
  fetchStart, fetchProgress, fetchStop,
  loiApi, thueDanhSachHoaDon, thueChiTietHoaDon, thueHtmlHoaDon,
  thueLinesNhieuHoaDon, thueLuuLinesHoaDon,
} from "../api";
import type {
  AdminTenant, LeftoverInfo, HuongLay, HoaDonConLai, MatHang, PhienLay,
  HoaDonThue, HoaDonLine,
} from "../api";
import { useAuth } from "../AuthContext";
import DanhSachHoaDon from "./DanhSachHoaDon";
import HtmlHoaDon from "./HtmlHoaDon";
import { AgGridReact } from "ag-grid-react";
import type { ColDef } from "ag-grid-community";
import { mauDonVi, damDonVi } from "../theme/donViColors";
import {
  themeVfp, luoiVfpProps, colVfp, colSua, colSo, dinhDangTien, dinhDang4SoLe,
  nhoDoRongCot,
} from "../theme/luoiVfp";
import "./luoi-gon.css";
import "./mau-huong.css";
import "./keo-cot.css";
import "./hoa-don-dau-vao.css";

// NT-06 (Q2): ghi nhớ theo MÁY chứ không theo người — đúng hành vi VFP cũ, nơi
// trạng thái nằm trong KT2000.INI của máy đó. localStorage là chỗ tương đương.
const KHOA_CA_HAI = "kt2000_lay_hd_ca_vao_va_ra";

// Hai màn Đầu vào / Đầu ra dùng CHUNG ruột này, chỉ khác hướng mặc định.
interface Props { huongMacDinh: "vao" | "ra" }

// TChat = 3 là dòng CHIẾT KHẤU thương mại. XML của TCT ghi thành tiền DƯƠNG, nhưng
// bản chất nó TRỪ vào tiền hàng. Cộng thẳng cả 12 dòng là sai đúng 2 lần chiết khấu:
// một lần do thiếu phép trừ, một lần do cộng nhầm.
//   Ca thật C26TLC/10: Σ 12 dòng = 128.929.583, TgTCThue = 120.538.935,
//   chênh 8.390.648 = 2 × 4.195.324 (đúng số TTCKTMai).
const laDongChietKhau = (m: MatHang) => m.tinhChat === "3";

// Sai số cho phép giữa Σ dòng hàng và tiền hàng của hóa đơn. Phải bằng đúng
// SAI_SO_CHO_PHEP bên ImportService — lệch nhau thì hóa đơn backend đã nhận vẫn hiện đỏ
// ở đây, đọc như còn lỗi.
const NGUONG_LECH = 10;

// getMonth() đếm từ 0. Tính một lần lúc nạp module là đủ — giá trị này chỉ dùng làm
// mặc định lúc dựng state, mở màn qua nửa đêm sang tháng mới cũng không sao.
const THANG_HIEN_TAI = new Date().getMonth() + 1;

// Hóa đơn CHỈ có dòng chiết khấu, không có dòng hàng hóa nào (chốt 12/08). Khi đó số
// tiền của dòng chính LÀ khoản chiết khấu chứ không phải giá trị hàng bán — để ở cột
// Thành tiền thì đọc như đang bán được ngần ấy, ngược hẳn bản chất.
// Hóa đơn vừa có hàng vừa có chiết khấu thì KHÔNG đụng: dòng TC=3 vẫn hiện thành tiền
// như cũ, vì ở đó nó là một dòng trong bảng kê chứ không phải toàn bộ hóa đơn.
const toanChietKhau = (mh: MatHang[]) => mh.length > 0 && mh.every(laDongChietKhau);

// Tiền hàng theo dòng = Σ (Thành tiền − Chiết khấu), CỘNG ĐỀU mọi dòng.
//
// Không còn nhánh riêng cho dòng TC=3 (chốt Trường 17/08): tiền của dòng đó nay nằm ở
// cột Chiết khấu chứ không phải Thành tiền, nên "TT − CK" của nó tự ra SỐ ÂM. Cộng một
// số âm chính là trừ — một phép tính duy nhất cho cả hai loại dòng, khỏi nhớ ngoại lệ.
//
// Đây cũng là công thức backend dùng, nên cột Lệch Σ line từ nay khớp với con số ở cột
// "Vì sao còn nằm lại". Trước kia hai bên tính hai kiểu: badge xanh báo khớp nằm ngay
// cạnh dòng chữ đỏ báo lệch 1.668.095 — cùng một hóa đơn mà màn hình tự cãi nhau.
//
// NGOẠI LỆ giữ nguyên: hóa đơn CHIẾT KHẤU THƯƠNG MẠI đứng riêng (mọi dòng đều TC=3) thì
// người bán khai tiền hàng là số DƯƠNG nên Σ cũng phải dương mới khớp — cộng đều ở đây
// sẽ ra âm và báo lệch gấp đôi. Khớp đúng ngoại lệ toanChietKhau bên ImportJob.
// Tiền hàng của MỘT dòng, tính y hệt ImportService.TongTienHangTuLine:
//   SL × ĐG, LÀM TRÒN VỀ ĐỒNG ở từng dòng, rồi trừ chiết khấu của dòng.
//
// Phải là SL × ĐG chứ KHÔNG phải Thành tiền. Người bán làm tròn khi in hóa đơn nên hai
// số này lệch nhau vài đồng, mà phép kiểm lúc nạp dùng SL × ĐG — lấy Thành tiền thì cột
// Lệch Σ line hiện 0 trong khi hóa đơn vẫn bị đá ra vì lệch.
//   Ca thật DAT_VIET_THANH T7, K26THT/2578264: 22,988 × 21.750 = 499.989 nhưng XML ghi
//   Thành tiền 500.000. Lưới trên hiện Lệch = 0, ngay cạnh dòng chữ đỏ "chênh 11".
//
// Lùi về Thành tiền khi thiếu SL/ĐG — đúng khuôn ImportService.SoLuongDonGia. Nhờ vậy
// dòng TC=3 (tiền đã chuyển sang cột Chiết khấu, Thành tiền = 0) vẫn ra đúng số âm.
const tienHangDong = (m: MatHang) => {
  let sl = m.soLuong, dg = m.donGia;
  if (m.thanhTien !== 0) {
    if (sl === 0 && dg === 0) { sl = 1; dg = m.thanhTien; }
    else if (dg === 0 && sl !== 0) { dg = m.thanhTien / sl; }
  }
  return Math.round(sl * dg) - (m.chietKhau || 0);
};

// PHẢI khớp ImportService.TongTienHangTuLine — hai bên tính hai kiểu là màn hình báo
// khớp còn backend đá hóa đơn ra, mà người dùng không có đường nào biết trước.
//   Ca thật HOA_SANG 21/08: bốn hóa đơn MORINAGA hiện thẻ xanh "Σ line khớp tiền hàng"
//   ngay cạnh dòng đỏ "chênh 18.965.006" của backend. Hai cột cạnh nhau trong cùng một
//   lưới, do hai bộ máy khác nhau tính.
//
// Hóa đơn TOÀN chiết khấu thì lấy DẤU theo số người bán khai — có hai quy ước cùng tồn
// tại: HOA_SANG khai dương, NHAT_TUAN khai âm. Cùng bản chất, cùng |giá trị|, khác dấu.
// Ép một dấu cứng là một trong hai nhóm lệch gấp đôi.
const sumLine = (hd: HoaDonConLai) => {
  const tong = hd.matHangs.reduce((s, m) => s + tienHangDong(m), 0);
  return toanChietKhau(hd.matHangs) && hd.tienHang > 0 && tong < 0 ? -tong : tong;
};

// Dời số tiền của dòng TC=3 sang cột Chiết khấu ngay lúc nhận dữ liệu, KHÔNG làm ở tầng
// hiển thị: lưới sửa thẳng vào mảng này, có hai cách đọc song song là chỗ nào cũng phải
// nhớ dịch, sót một chỗ là ra số sai.
//
// Từ 17/08 áp cho MỌI dòng TC=3, kể cả trong hóa đơn hỗn hợp (trước chỉ áp khi cả hóa
// đơn toàn dòng TC=3) — chiết khấu phải nằm ở cột Chiết khấu, không nằm ở cột Thành tiền.
// Đổi chỗ này thì sumLine và ckCuaHoaDon phải đọc theo, xem hai hàm kề bên.
const chuanHoaMatHang = (hd: HoaDonConLai): HoaDonConLai => ({
  ...hd,
  matHangs: hd.matHangs.map((m) =>
    laDongChietKhau(m) && m.thanhTien !== 0
      ? { ...m, chietKhau: m.thanhTien, thanhTien: 0 }
      : m),
});

// Phép NGƯỢC của chuanHoaMatHang, chạy ngay trước khi gửi lên server.
//
// BẮT BUỘC phải có: backend ghi thẳng ChietKhau xuống HOA_DON_LINE.tien_ck còn SoLuong
// và DonGia thì giữ nguyên. Gửi dòng TC=3 ở dạng đã dời thì nó vào sổ với CẢ SL×ĐG lẫn
// tien_ck cùng mang số chiết khấu — tự tay đẻ ra đúng ca "trừ hai lần" mà 1C26TBN/0000611
// đang mắc, cho MỌI hóa đơn ghi tay có dòng chiết khấu.
// Việc dời chỗ là chuyện của MÀN HÌNH; xuống tới sổ thì phải trả về đúng dạng của cổng.
const traVeDangGoc = (mh: MatHang[]): MatHang[] =>
  mh.map((m) =>
    laDongChietKhau(m) && m.thanhTien === 0 && (m.chietKhau || 0) !== 0
      ? { ...m, thanhTien: m.chietKhau, chietKhau: 0 }
      : m);

// Chiết khấu của cả hóa đơn.
//
// CÓ dòng TC=3 thì CHỈ cộng mấy dòng đó, không cộng thêm chiết khấu rải trên dòng hàng:
// hóa đơn khai cả hai dạng thì đó là CÙNG MỘT khoản ghi hai chỗ, cộng cả hai là gấp đôi.
//   Ca thật NHAT_TUAN 1C26TBN/0000611: dòng TC=3 ghi 1.668.096, ba dòng hàng cũng rải
//   đúng 1.668.096, mà cổng khai ở mức hóa đơn (TTCKTMai) vẫn chỉ 1.668.096.
// Không có dòng TC=3 thì Σ chiết khấu của dòng hàng chính là nó — 29 hóa đơn HOA_SANG
// và HUY_THANH thuộc loại này, đối chiếu bản gốc TCT khớp 28/28 (đo 17/08).
// Không dòng nào khai thì lùi về số cổng khai ở mức hóa đơn — thà lấy số của cổng hơn hiện 0.
const ckCuaHoaDon = (hd?: HoaDonConLai) => {
  if (!hd) return 0;
  const dongCk = hd.matHangs.filter(laDongChietKhau);
  const tong = (dongCk.length > 0 ? dongCk : hd.matHangs)
    .reduce((s, m) => s + (m.chietKhau || 0), 0);
  return tong || hd.tienCk || 0;
};


// Mảng cột phải ĐỨNG YÊN giữa các lần render. Dựng mới mỗi lần thì AG Grid coi
// là bộ cột khác và đặt lại bề rộng — triệu chứng là bấm vào ô để sửa cũng làm
// cột nhảy về như cũ. Không phụ thuộc state nào nên đặt hẳn ngoài component.
const COT_HOA_DON: ColDef<HoaDonConLai>[] = [
          { headerName: "Tháng", field: "thang", width: 70 },
          // Bỏ cột Hướng: tiêu đề modal đã ghi hướng rồi. Ký hiệu nới rộng vì độ dài
          // không đoán trước; Số HĐ và Ngày co lại vì đã có khuôn cố định.
          // CHỈ ĐỌC (chốt 12/08): ba ô này là danh tính hóa đơn — ma_hd dựng từ chính
          // ký hiệu + số HĐ (BR-HD-01), sửa ở đây là nạp vào một hóa đơn KHÁC mà không
          // ai hay. Sai thì sửa ở cổng rồi tải lại, không phải gõ đè trên lưới.
          { ...colVfp, headerName: "Ký hiệu", field: "khHd", width: 130 },
          { ...colVfp, headerName: "Số HĐ", field: "soHd", width: 95 },
          { ...colVfp, headerName: "Ngày", field: "ngay", width: 110 },
          // colId tường minh cho cột KHÔNG có field: AG Grid tự sinh id theo vị trí,
          // mà id đó chính là khóa lưu bề rộng — đổi thứ tự cột là mất hết.
          { colId: "doiTac", headerName: "Đối tác", width: 240,
            valueGetter: (p) => !p.data ? ""
              : p.data.huong === "VAO"
                ? `${p.data.tenBan} [${p.data.mstBan}]`
                : `${p.data.tenMua} [${p.data.mstMua}]` },
          // Tiền hàng và VAT là con số CỦA HÓA ĐƠN GỐC — chỉ đọc (chốt 11/08).
          // Muốn Σ line khớp thì sửa số lượng/đơn giá ở lưới dưới cho đúng hóa đơn,
          // chứ không phải bẻ con số của hóa đơn cho khớp thứ mình vừa gõ.
          { headerName: "Tiền hàng", field: "tienHang", width: 130,
            type: "numericColumn", valueFormatter: (p) => dinhDangTien(p.value) },
          { headerName: "VAT", field: "tienVat", width: 115,
            type: "numericColumn", valueFormatter: (p) => dinhDangTien(p.value) },
          // CHỈ ĐỌC, tự CỘNG từ chiết khấu của các dòng hàng (chốt 12/08). Kế toán sửa
          // ở lưới dưới, số này chạy theo — một nguồn sự thật, hai chỗ không thể lệch.
          // Cổng có khai TTCKTMai thì dùng số đó; không khai thì Σ dòng chính là nó.
          { colId: "tienCk", headerName: "Chiết khấu", width: 120, type: "numericColumn",
            valueGetter: (p) => ckCuaHoaDon(p.data),
            valueFormatter: (p) => dinhDangTien(p.value),
            cellStyle: { backgroundColor: "#f5f5f5" } },
          // Cột "Tổng" đã bỏ theo yêu cầu 12/08 — tổng tiền suy được từ Tiền hàng + VAT,
          // để thêm chỉ tổ chiếm chỗ của mấy cột phải đọc kỹ hơn.
          // Ngưỡng 10đ khớp SAI_SO_CHO_PHEP bên ImportService — không thì hóa đơn
          // backend đã nhận vẫn hiện đỏ ở đây, đọc như còn lỗi.
          // Hiện ĐÚNG số lệch, kể cả vài đồng lẻ (chốt Trường 17/08). Trước đây dưới
          // ngưỡng 10đ thì in "0" cho đỡ rối, nhưng thế là giấu mất chênh lệch thật:
          // người soát thấy 0 rồi tin là khớp tuyệt đối, trong khi có thể lệch 9đ.
          // Ngưỡng 10đ VẪN dùng — nhưng chỉ để quyết định TÔ ĐỎ hay không, xem cellStyle.
          { colId: "lechSigma", headerName: "Lệch Σ line", width: 125, type: "numericColumn",
            valueGetter: (p) => (p.data ? p.data.tienHang - sumLine(p.data) : 0),
            valueFormatter: (p) => dinhDangTien(p.value),
            // Tra ve MOT hinh dang duy nhat: hai nhanh khac khoa thi TS suy ra kieu
            // hop, va CellStyle co index signature khong nhan undefined.
            cellStyle: (p) => ({
              backgroundColor: "#f5f5f5",
              color: Math.abs(p.value) < 10 ? "inherit" : "#cf1322",
              fontWeight: Math.abs(p.value) < 10 ? 400 : 600,
            }) },
          { headerName: "Vì sao còn nằm lại", field: "lyDo", width: 300,
            tooltipField: "lyDo",
            cellStyle: (p) => ({
              backgroundColor: "#f5f5f5",
              color: p.data?.coTrongExcel ? "#cf1322" : "#d46b08",
            }) },
          { headerName: "Tên file", field: "tenFile", width: 300, tooltipField: "tenFile" },
];

const COT_MAT_HANG: ColDef<MatHang>[] = [
          { headerName: "STT", field: "stt", width: 65 },
          // Hiện nguyên mã TChat của TCT. Dịch sang chữ tắt chỉ thêm một tầng phải
          // nhớ, mà mã gốc mới là thứ tra được trong tài liệu của cổng.
          { headerName: "TC", field: "tinhChat", width: 56,
            headerTooltip: "TChat: 1 hàng hóa · 2 khuyến mại · 3 chiết khấu · 4 ghi chú",
            cellStyle: (p) => ({
              backgroundColor: "#f5f5f5",
              color: p.value === "3" ? "#cf1322" : "inherit",
              fontWeight: p.value === "3" ? 600 : 400,
            }) },
          { ...colSua, headerName: "Tên hàng", field: "tenHang", width: 300,
            tooltipField: "tenHang" },
          { ...colSua, headerName: "ĐVT", field: "dvt", width: 85 },
          // SL và ĐG giữ 4 số lẻ — chúng là THỪA SỐ, cắt bớt thì nhân ra không khớp
          // Thành tiền. Các cột tiền bên dưới vẫn 2 số như cũ.
          { ...colSo, headerName: "Số lượng", field: "soLuong", width: 110,
            valueFormatter: (p) => dinhDang4SoLe(p.value) },
          { ...colSo, headerName: "Đơn giá", field: "donGia", width: 130,
            valueFormatter: (p) => dinhDang4SoLe(p.value) },
          // Chiết khấu của RIÊNG dòng (STCKhau). SỬA ĐƯỢC (chốt 12/08) — cổng nhiều khi
          // không khai STCKhau, đây là chỗ kế toán điền tay; ô Chiết khấu ở lưới trên
          // cộng lại từ chính cột này nên sửa ở đây là trên kia đổi theo.
          { ...colSo, headerName: "Chiết khấu", field: "chietKhau", width: 115,
            headerTooltip: "STCKhau — chiết khấu của riêng dòng này. Hóa đơn chỉ toàn "
                         + "dòng TC=3 thì thành tiền đã được chuyển sang cột này.",
            valueFormatter: (p) => dinhDangTien(p.value) },
          // colId tường minh cho cột KHÔNG có field: AG Grid tự sinh id theo vị trí,
          // mà id đó chính là khóa lưu bề rộng — đổi thứ tự cột là mất hết.
          { colId: "slNhanDg", headerName: "SL × ĐG", width: 140, type: "numericColumn",
            valueGetter: (p) => (p.data ? p.data.soLuong * p.data.donGia : 0),
            valueFormatter: (p) => dinhDangTien(p.value) },
          // Thành tiền chỉ đọc — tự nhân lại từ SL × ĐG khi sửa một trong hai.
          { headerName: "Thành tiền", field: "thanhTien", width: 140,
            type: "numericColumn", valueFormatter: (p) => dinhDangTien(p.value) },
          // Tên cột nói rõ đang so với cái gì. Cột "Lệch Σ line" ở lưới TRÊN so
          // tiền hàng với Σ thành tiền — hai phép kiểm khác nhau, một cái bằng 0
          // mà cái kia khác 0 là bình thường: người bán làm tròn đơn giá thì
          // thành tiền lệch với SL×ĐG, nhưng tổng hóa đơn vẫn khớp.
          // (ca thật C26TQQ/3670: lệch SL×ĐG 409đ, còn Σ line khớp đúng 0)
          { colId: "lechTich", headerName: "Lệch SL×ĐG", width: 130, type: "numericColumn",
            headerTooltip: "Thành tiền − (SL × ĐG)",
            valueGetter: (p) => (p.data ? p.data.thanhTien - p.data.soLuong * p.data.donGia : 0),
            valueFormatter: (p) => (Math.abs(p.value) < 1 ? "0" : dinhDangTien(p.value)),
            cellStyle: (p) => ({
              backgroundColor: "#f5f5f5",
              color: Math.abs(p.value) < 1 ? "inherit" : "#cf1322",
              fontWeight: Math.abs(p.value) < 1 ? 400 : 600,
            }) },
          { ...colSua, headerName: "% VAT", field: "thueSuat", width: 85 },
];

// ============ RUỘT 1: console NỘI BỘ (MDN_NB) — FRM_LAY_HDDT ============
function ConsoleLayHoaDon({ huongMacDinh }: Props) {
  const { session } = useAuth();
  const namLamViec = session?.fiscalYear ?? new Date().getFullYear();
  const laDauRa = huongMacDinh === "ra";

  const [tenants, setTenants] = useState<AdminTenant[]>([]);
  const [selected, setSelected] = useState<React.Key[]>([]);
  const [loading, setLoading] = useState(true);

  // Mở màn là nhắm sẵn tháng đang chạy chứ không phải tháng 1 — tháng nào cũng phải
  // sửa hai ô là việc thừa (chốt Trường 13/08). Lấy tháng hiện tại KỂ CẢ khi năm làm
  // việc khác năm hiện tại: kế toán làm sổ năm cũ vẫn quen nghĩ theo tháng đang chạy.
  const [tuThang, setTuThang] = useState(THANG_HIEN_TAI);
  const [denThang, setDenThang] = useState(THANG_HIEN_TAI);
  const [xoaTruoc, setXoaTruoc] = useState(false);

  // NT-06: đọc lên từ localStorage ngay lúc dựng chứ không phải sau một vòng render —
  // để useEffect gán sau thì lần gọi API đầu tiên đã đi với hướng sai.
  const [caHaiHuong, setCaHaiHuong] = useState(
    () => localStorage.getItem(KHOA_CA_HAI) === "1");
  const doiCaHaiHuong = (bat: boolean) => {
    setCaHaiHuong(bat);
    localStorage.setItem(KHOA_CA_HAI, bat ? "1" : "0");
  };

  // Hướng thật sự gửi xuống backend: tích "cả hai" thì bỏ qua hướng của màn hình
  const huong: HuongLay = caHaiHuong ? "all" : huongMacDinh;

  // Số file gốc còn nằm lại raw\ của từng đơn vị
  const [fileLoi, setFileLoi] = useState<Record<string, LeftoverInfo>>({});

  const docFileLoi = (ds: AdminTenant[]) => {
    if (ds.length === 0) return;
    getLeftoverFiles(ds.map((t) => t.id), namLamViec, tuThang, denThang, huong)
      .then((r) => setFileLoi(Object.fromEntries(r.data.map((x) => [x.tenantId, x]))))
      // Chưa cấu hình Paths:JobsRoot hoặc chưa có thư mục job là chuyện thường ở máy dev
      // — cột để trống, không nhảy thông báo lỗi làm phiền
      .catch(() => setFileLoi({}));
  };


  // ===== Modal soi các hóa đơn còn nằm lại raw\ =====
  const [modalMo, setModalMo] = useState(false);
  const [modalTai, setModalTai] = useState(false);
  const [modalDonVi, setModalDonVi] = useState<AdminTenant | null>(null);
  const [dsConLai, setDsConLai] = useState<HoaDonConLai[]>([]);
  const [chonFile, setChonFile] = useState<string | null>(null);
  const hdDangChon = dsConLai.find((x) => x.tenFile === chonFile) ?? null;

  const donViDangChon = selected.length === 1
    ? tenants.find((t) => t.id === selected[0]) ?? null : null;
  const soFileCuaDonViChon = donViDangChon
    ? fileLoi[donViDangChon.id]?.soFileConLai ?? 0 : 0;

  const dangHoatDong = useMemo(
    () => tenants.filter((t) => t.isActive)
                 .sort((a, b) => a.code.localeCompare(b.code, "vi")),
    [tenants]);

  // NT-05: mở được từ nút, và mở được bằng cách bấm thẳng vào con số ở cột V/R
  const moModalConLai = async (dv?: AdminTenant) => {
    const t = dv ?? donViDangChon;
    if (!t) return;
    setModalDonVi(t);
    setModalMo(true);
    setModalTai(true);
    setDsConLai([]);
    setChonFile(null);
    try {
      const r = await getRawFiles(t.id, namLamViec, tuThang, denThang, huong);
      setDsConLai(r.data.map(chuanHoaMatHang));
      // Chọn sẵn dòng đầu để khung dưới có nội dung ngay, khỏi phải bấm thêm
      if (r.data.length) setChonFile(r.data[0].tenFile);
    } catch (e) {
      message.error(loiApi(e, "Không đọc được thư mục raw\\"));
    } finally {
      setModalTai(false);
    }
  };

  const suaHoaDon = (tenFile: string, thayDoi: Partial<HoaDonConLai>) =>
    setDsConLai((ds) => ds.map((x) => (x.tenFile === tenFile ? { ...x, ...thayDoi } : x)));

  // Thành tiền KHÔNG cho gõ tay: sửa số lượng hoặc đơn giá là nó tự nhân lại.
  // Người dùng gõ được cả ba thì ba số dễ chỏi nhau, mà chính cái chỏi đó là thứ
  // làm hóa đơn bị đá ra ở phép kiểm Σ line vs master.
  const suaMatHang = (tenFile: string, stt: number, thayDoi: Partial<MatHang>) =>
    setDsConLai((ds) => ds.map((x) => x.tenFile !== tenFile ? x
      : {
          ...x,
          matHangs: x.matHangs.map((m) => {
            if (m.stt !== stt) return m;
            const moi = { ...m, ...thayDoi };
            if ("soLuong" in thayDoi || "donGia" in thayDoi)
              moi.thanhTien = moi.soLuong * moi.donGia;
            return moi;
          }),
        }));

  // Xem bản HTML gốc NGAY TRONG MÀN. Tải qua axios (có token) chứ không mở link
  // thẳng; modal tự lo phần tải, ở đây chỉ chỉ định xem file nào.
  const [htmlHd, setHtmlHd] = useState<HoaDonConLai | null>(null);
  const xemHtml = (hd: HoaDonConLai) => setHtmlHd(hd);

  const taiHtmlRaw = async () => {
    if (!htmlHd || !modalDonVi) return { html: null, duongDan: null };
    try {
      // Trả nguyên object { html, duongDan } — html vẫn đọc y như cũ, duongDan chỉ
      // để hiện nhãn nguồn dưới tiêu đề.
      return await getRawHtml(modalDonVi.id, namLamViec,
                              htmlHd.thang, htmlHd.huong, htmlHd.tenFile);
    } catch (e: unknown) {
      const st = (e as { response?: { status?: number } })?.response?.status;
      // 404 = không có bản gốc kèm theo: modal hiện khung rỗng có giải thích
      if (st === 404) return { html: null, duongDan: null };
      throw new Error(loiApi(e, "Không mở được bản HTML"), { cause: e });
    }
  };

  // ===== Lấy HĐ từ cổng TCT — NT-03: lấy xong backend nạp luôn, không còn bước hai =====
  const [phien, setPhien] = useState<PhienLay | null>(null);
  const [dangBatDau, setDangBatDau] = useState(false);
  const [mkMo, setMkMo] = useState(false);
  const [mkGiaTri, setMkGiaTri] = useState("");
  const [mkDaCo, setMkDaCo] = useState<Record<string, boolean>>({});
  const [mkDangTai, setMkDangTai] = useState(false);

  // Mở hộp mật khẩu: đơn vị đã khai rồi thì đổ sẵn mật khẩu hiện tại vào ô, để người
  // trực đọc được mà đăng nhập tay khi bộ tải hỏng — kể cả mật khẩu do người khác đổi.
  // Lấy bằng lượt gọi RIÊNG (có ghi nhật ký) chứ không lấy sẵn lúc dựng màn hình.
  const moHopMatKhau = () => {
    setMkGiaTri("");
    setMkMo(true);
    if (!donViDangChon || !mkDaCo[donViDangChon.id]) return;
    setMkDangTai(true);
    xemTctCredential(donViDangChon.id)
      .then((r) => setMkGiaTri(r.data.matKhau))
      // Không đọc được thì cứ để ô trống — vẫn nhập đè được như trước, đừng chặn việc lưu
      .catch(() => {})
      .finally(() => setMkDangTai(false));
  };

  // Hỏi tiến độ mỗi 2 giây khi còn phiên chạy — nguồn là status.json của script
  useEffect(() => {
    if (!phien?.dangChay) return;
    const id = setInterval(() => {
      fetchProgress().then((r) => {
        setPhien(r.data);
        // Phiên vừa kết thúc: cột V/R và lịch sử phải phản ánh ngay kết quả
        if (!r.data.dangChay) docFileLoi(dangHoatDong);
      }).catch(() => {});
    }, 2000);
    return () => clearInterval(id);
    // CHỈ chạy theo cờ đang-chạy: đưa dangHoatDong/docFileLoi vào deps thì mỗi lượt vẽ
    // là dựng lại interval, đồng hồ 2 giây không bao giờ đủ chu kỳ để bắn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phien?.dangChay]);

  // Mở màn hình là hỏi luôn phiên trước còn chạy dở không, và đọc lịch sử
  useEffect(() => {
    fetchProgress().then((r) => { if (r.data.cac?.length) setPhien(r.data); }).catch(() => {});

  }, []);

  const docTrangThaiMk = (t: AdminTenant) =>
    getTctCredential(t.id)
      .then((r) => setMkDaCo((m) => ({ ...m, [t.id]: r.data.coMatKhau })))
      .catch(() => {});

  // Chạy theo `selected` (mảng id đang tích) chứ không theo donViDangChon: cái sau là
  // đối tượng suy ra, đổi tham chiếu mỗi lượt vẽ nên sẽ hỏi lại server liên tục.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (donViDangChon) docTrangThaiMk(donViDangChon); }, [selected]);

  const luuMatKhau = async () => {
    if (!donViDangChon || !mkGiaTri) return;
    try {
      await saveTctCredential(donViDangChon.id, mkGiaTri);
      message.success(`Đã lưu mật khẩu cổng TCT cho ${donViDangChon.code}`);
      setMkMo(false); setMkGiaTri("");
      docTrangThaiMk(donViDangChon);
    } catch (e) {
      message.error(loiApi(e, "Không lưu được mật khẩu"));
    }
  };

  // Gộp hai nút cũ ("Lấy hóa đơn điện tử" + "Lấy phần mới") làm MỘT (chốt Trường 11/08).
  // Chế độ giữ lại là TĂNG DẦN: đối chiếu Excel danh sách mới tải với Excel tổng đang
  // có, hóa đơn nào đã có đường dẫn XML thì bỏ qua, chỉ tải phần thật sự mới. Đo trên
  // 26.951 hóa đơn thật: bỏ được 97% lượt tải — cần thiết khi lên 150 đơn vị chạy hàng ngày.
  //
  // Muốn ép tải lại TOÀN BỘ thì xóa file outputs\HOA_DON_<HƯỚNG>_<MÃ>.xlsx của đơn vị
  // đó: mất căn cứ đối chiếu thì mọi hóa đơn đều tính là mới.
  const batDauLayHd = async () => {
    if (selected.length === 0) return;
    if (denThang < tuThang) { message.error("Đến tháng phải ≥ Từ tháng"); return; }
    setDangBatDau(true);
    try {
      const r = await fetchStart(
        selected as string[], namLamViec, tuThang, denThang, huong, xoaTruoc, true);
      setPhien(r.data);
      message.success(
        `Đã xếp hàng ${r.data.cac.length} lượt — chỉ tải phần mới, xong tự nạp vào database`);
    } catch (e) {
      message.error(loiApi(e, "Không bắt đầu được phiên lấy HĐ"));
    } finally {
      setDangBatDau(false);
    }
  };

  // ===== Tính lại tiền hàng cho khớp Thành tiền =====
  //
  // Người bán làm tròn khi in hóa đơn nên SL × ĐG không đúng bằng Thành tiền, và hóa đơn
  // bị đá ra vì lệch Σ dù bản thân nó chẳng sai gì.
  //   Ca thật DAT_VIET_THANH T7 K26THT/2578264: 22,988 × 21.750 = 499.989 còn cổng khai
  //   500.000 — chênh 11, quá ngưỡng 10đ.
  //
  // Chữa bằng cách tính NGƯỢC một trong hai số từ Thành tiền. Thử CẢ HAI rồi lấy cái sai
  // số nhỏ hơn, vì không hướng nào luôn thắng — nó phụ thuộc số nào tròn hơn.
  //
  // LÀM TRÒN ĐÚNG ĐỘ CHÍNH XÁC CỦA CỘT: so_luong là decimal(18,3), don_gia là
  // decimal(18,2). Đây mới là chỗ quyết định, không phải phép chia.
  //   Nếu để 4 số lẻ như lưới đang hiện: 22,9885 × 21.750 = 499.999,87 — màn hình báo
  //   khớp, nhưng SQL cắt còn 22,989 và số THẬT vào sổ là 500.010,75, lệch 10,75 → hóa
  //   đơn lại bị đá ra, mà lần này không ai hiểu vì sao vì trên màn hình vẫn xanh.
  //   Đo trên chính ba hóa đơn đang lệch: giữ đơn giá & sửa số lượng còn lệch
  //   10,75 / 0,74 / 1,60; giữ số lượng & sửa đơn giá còn 0,03 / 0,15 / 0,20.
  // Đúng bằng decimal(18,4) của cả hai cột sau bản vá 024. TRƯỚC bản vá chúng là (18,3)
  // và (18,2), nên database nào chưa nạp lại lượt nào vẫn cắt bớt số lẻ — bản vá chỉ áp
  // lúc NẠP. Nạp lại một lượt là hết.
  const SO_LE_SL = 4, SO_LE_DG = 4;
  const lamTron = (v: number, n: number) => Math.round(v * 10 ** n) / 10 ** n;

  const tinhLaiTienHang = (hd: HoaDonConLai) => {
    let daSua = 0, khongCuuDuoc = 0, boQua = 0;

    for (const m of hd.matHangs) {
      // Dòng chiết khấu không có cặp SL × ĐG để cân — tiền của nó nằm ở cột Chiết khấu.
      if (laDongChietKhau(m) || m.thanhTien === 0) { boQua++; continue; }

      // Chỉ bỏ qua dòng khớp TUYỆT ĐỐI (chốt Trường 21/08).
      //
      // Trước đây bỏ qua mọi dòng lệch dưới 10đ, nên hoá đơn lệch 9,72 bấm nút không ra
      // gì — mà màn hình lại hiện "10" do làm tròn, người dùng tưởng nút hỏng. Hoá đơn
      // loại đó vốn đã qua cửa nạp; nút này chỉ làm cho số đẹp hơn nên không có lý do
      // từ chối mài chúng.
      const saiHienTai = Math.abs(m.soLuong * m.donGia - m.thanhTien);
      if (saiHienTai === 0) { boQua++; continue; }

      const slMoi = m.donGia  !== 0 ? lamTron(m.thanhTien / m.donGia,  SO_LE_SL) : null;
      const dgMoi = m.soLuong !== 0 ? lamTron(m.thanhTien / m.soLuong, SO_LE_DG) : null;
      const saiSl = slMoi === null ? Infinity : Math.abs(slMoi * m.donGia  - m.thanhTien);
      const saiDg = dgMoi === null ? Infinity : Math.abs(m.soLuong * dgMoi - m.thanhTien);

      // So với sai số ĐANG CÓ, không so với ngưỡng cố định: mài mà không khá hơn thì để
      // NGUYÊN. Ghi đè bằng một con số vẫn sai mà lại mất số gốc là đánh đổi tồi — số gốc
      // còn thì kế toán còn đối chiếu được. Cùng luật với MaiChoKhopThanhTien bên
      // ImportService, để bấm tay và mài tự động không bao giờ ra hai kết quả khác nhau.
      if (Math.min(saiSl, saiDg) >= saiHienTai) { khongCuuDuoc++; continue; }

      // Hòa thì giữ đơn giá và sửa số lượng: đơn giá là giá niêm yết của người bán,
      // sửa số lượng dễ giải thích hơn khi thanh tra hỏi.
      if (saiSl <= saiDg) suaMatHang(hd.tenFile, m.stt, { soLuong: slMoi! });
      else                suaMatHang(hd.tenFile, m.stt, { donGia:  dgMoi! });
      daSua++;
    }

    if (daSua === 0 && khongCuuDuoc === 0)
      message.info(`Không có dòng nào cần tính lại (${boQua} dòng đã khớp hoặc là dòng chiết khấu)`);
    else if (khongCuuDuoc === 0)
      message.success(`Đã tính lại ${daSua} dòng — kiểm cột Lệch Σ line rồi mới Ghi vào Hóa đơn`);
    else
      message.warning(`Đã tính lại ${daSua} dòng, còn ${khongCuuDuoc} dòng không kéo được `
                    + `xuống dưới ${NGUONG_LECH}đ nên giữ nguyên số gốc`);
  };

  const [dangNap, setDangNap] = useState<string | null>(null);

  const napMotHoaDon = async (hd: HoaDonConLai) => {
    if (!modalDonVi) return;
    setDangNap(hd.tenFile);
    try {
      const r = await importOne({
        tenantId: modalDonVi.id, nam: namLamViec, thang: hd.thang, huong: hd.huong,
        tenFile: hd.tenFile, mauSo: hd.mauSo, khHd: hd.khHd, soHd: hd.soHd, ngay: hd.ngay,
        mst: hd.huong === "VAO" ? hd.mstBan : hd.mstMua,
        // Người phát hành luôn là NGƯỜI BÁN, kể cả hóa đơn ra (khi đó là chính mình)
        mstPhatHanh: hd.mstBan,
        tenKh: hd.huong === "VAO" ? hd.tenBan : hd.tenMua,
        // tienCk phải gửi giá trị THẬT: chiết khấu nay sửa được ở lưới dòng hàng, gửi
        // cứng 0 (hay gửi hd.tienCk không đổi theo) thì người dùng gõ vào rồi bấm Ghi
        // mà số không vào sổ — một ô giả. Lấy đúng con số đang hiện trên lưới.
        diaChi: "", tienHang: hd.tienHang, tienVat: hd.tienVat, tienCk: ckCuaHoaDon(hd),
        matHangs: traVeDangGoc(hd.matHangs),
      });
      const d = r.data;
      message.success(`${d.capNhat ? "Đã cập nhật" : "Đã thêm"} ${d.maHd}`
                    + ` — ${d.soDongHang} dòng hàng, dời ${d.moved} file`);
      if (d.loiDoiFile) message.warning(`Đã ghi DB nhưng không dời được file: ${d.loiDoiFile}`);
      // Hóa đơn đã vào sổ thì bỏ khỏi danh sách và cập nhật lại cột đếm
      setDsConLai((ds) => {
        const conLai = ds.filter((x) => x.tenFile !== hd.tenFile);
        // Nhảy sang hóa đơn kế tiếp để làm liền mạch, hết thì bỏ chọn
        setChonFile(conLai.length ? conLai[0].tenFile : null);
        return conLai;
      });
      docFileLoi(dangHoatDong);
    } catch (e) {
      message.error(loiApi(e, "Không nạp được hóa đơn này"));
    } finally {
      setDangNap(null);
    }
  };

  // NT-02: chiDonViThue = true → bỏ cả 'internal' lẫn 'noibo'. Đơn vị nội bộ không
  // có hóa đơn trên cổng TCT, hiện lên chỉ tổ chọn nhầm rồi chạy một lượt vô ích.
  const napDanhSach = (baoOnKhiXong = false) => {
    setLoading(true);
    getAdminTenants(false, true)
      .then((r) => {
        setTenants(r.data);
        docFileLoi(r.data.filter((t) => t.isActive));
        if (baoOnKhiXong) message.success("Đã đọc lại danh sách đơn vị");
      })
      // Nói rõ hỏng ở đâu: nuốt hết thành một câu chung chung thì hết phiên, mất mạng
      // và lỗi phân quyền nhìn giống hệt nhau — dò bệnh rất mất thời gian
      .catch((e) => {
        // Có response = máy chủ trả lỗi (nêu mã HTTP); không có = chưa gọi tới nơi.
        // Hai chuyện khác hẳn nhau về cách khắc phục nên không gộp một câu.
        const coPhanHoi = axios.isAxiosError(e) && !!e.response;
        message.error(loiApi(e, coPhanHoi
          ? `Không tải được danh sách đơn vị (HTTP ${
              axios.isAxiosError(e) ? e.response?.status : ""})`
          : "Không gọi được máy chủ — kiểm tra backend còn chạy không"));
      })
      .finally(() => setLoading(false));
  };
  // setTimeout 0: napDanhSach() bật cờ loading NGAY khi gọi, mà setState đồng bộ trong
  // thân effect bị React coi là render dây chuyền.
  useEffect(() => {
    const id = setTimeout(() => napDanhSach(), 0);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Đổi khoảng tháng hoặc đổi hướng thì cột đếm phải tính lại, không thì số hiện
  // đang là của lựa chọn cũ mà tiêu đề cột lại ghi lựa chọn mới
  useEffect(() => {
    if (tenants.length) docFileLoi(tenants.filter((t) => t.isActive));
    // docFileLoi dựng mới mỗi lượt vẽ nên ESLint đòi nó; phụ thuộc THẬT là bốn thứ đã
    // liệt kê — thêm hàm vào là gọi lại server sau mỗi lần vẽ.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tuThang, denThang, huong, tenants]);

  const chonTheoKyKhai = (khaiQuy: boolean) =>
    setSelected(dangHoatDong.filter((t) => t.khaiQuy === khaiQuy).map((t) => t.id));

  const cacThang = Array.from({ length: 12 }, (_, i) => i + 1);

  // NT-04: luôn hiện SỐ, không có thì 0. Bấm vào số > 0 là mở thẳng form chi tiết.
  const oDemFile = (r: AdminTenant, lay: (i: LeftoverInfo) => number) => {
    const info = fileLoi[r.id];
    const n = info ? lay(info) : 0;
    if (n === 0) return <Typography.Text type="secondary">0</Typography.Text>;
    return (
      <a onClick={(ev) => { ev.stopPropagation(); moModalConLai(r); }}
         title="Bấm để xem chi tiết từng hóa đơn còn nằm lại">
        <b style={{ color: "#cf1322" }}>{n}</b>
      </a>
    );
  };

  // LUÔN hiện cả hai cột, kể cả khi màn này chỉ lấy một hướng. Hai cột nói HIỆN
  // TRẠNG trên đĩa: file đầu ra kẹt lại vẫn phải đập vào mắt dù đang đứng ở màn
  // đầu vào — giấu đi thì tháng sau mới lòi ra, lúc đó không ai nhớ vì sao.
  const cotConLai = [
    { title: "VÀO", width: 66, align: "center" as const,
      onHeaderCell: () => ({ title: "Hóa đơn ĐẦU VÀO còn kẹt ở raw\\VAO" }),
      render: (_: unknown, r: AdminTenant) => oDemFile(r, (i) => i.soVao) },
    { title: "RA", width: 66, align: "center" as const,
      onHeaderCell: () => ({ title: "Hóa đơn ĐẦU RA còn kẹt ở raw\\RA" }),
      render: (_: unknown, r: AdminTenant) => oDemFile(r, (i) => i.soRa) },
  ];

  const tenMan = laDauRa ? "Hóa đơn GTGT đầu ra" : "Hóa đơn GTGT đầu vào";

  // Phiên lấy là của TOÀN HỆ THỐNG (mỗi lần chỉ chạy một), nên hai màn Đầu vào và
  // Đầu ra cùng hỏi một endpoint và cùng nhận về một bảng. Chỉ nhận phiên nào đúng
  // hướng của màn này; "all" thì cả hai màn cùng nhận vì nó lấy cả hai chiều.
  // Phiên cũ chưa có trường huong (backend đời trước) thì vẫn cho hiện, thà thừa
  // còn hơn giấu mất tiến độ đang chạy thật.
  const phienCuaManNay =
    !phien ? null
    : !phien.huong || phien.huong === "all" || phien.huong === huongMacDinh
      ? phien
      : null;

  // Lượt chạy "cả vào cả ra" tách thành HAI DÒNG, mỗi dòng một hướng (chốt Trường
  // 11/08). Trước đó thử nhồi "V 45 · R 52" xuống dưới con số tổng, nhưng đọc hai
  // tầng trong một ô vẫn rối, mà cột Diễn biến thì vẫn là một cục chữ gộp.
  //
  // Thuần TRÌNH BÀY: backend vẫn một lượt, một tiến trình, một status.json — chỉ là
  // nó đã trả sẵn số tách theo hướng nên màn hình bày lại được. Các cột dùng chung
  // (đơn vị, kỳ, giờ bắt đầu, trạng thái, diễn biến) gộp ô qua rowSpan để nhìn ra
  // ngay hai dòng này là MỘT lượt chứ không phải hai lần chạy.
  const dongTienDo = useMemo(() => {
    return (phienCuaManNay?.cac ?? []).flatMap((r) => {
      const goc = `${r.tenantId}-${r.thang}`;
      // Script chưa ghi số tách (mới khởi động, hoặc bản script đời cũ) thì giữ
      // nguyên một dòng gộp — thà hiện số tổng đúng còn hơn hai dòng 0/0 sai.
      const coSoTach = r.tongVao + r.taiOkVao + r.tongRa + r.taiOkRa > 0;
      if (r.huong !== "VAO+RA" || !coSoTach)
        return [{ ...r, khoa: goc, nhipGop: 1 }];
      return [
        { ...r, khoa: `${goc}-V`, nhipGop: 2, huong: "VAO",
          tong: r.tongVao, taiOk: r.taiOkVao,
          khongCoGoc: r.khongCoGocVao, loiThat: r.loiThatVao,
          napMoi: r.napMoiVao, napCapNhat: r.napSuaVao },
        // nhipGop = 0: antd bỏ hẳn ô đó đi, để ô của dòng trên phủ xuống
        { ...r, khoa: `${goc}-R`, nhipGop: 0, huong: "RA",
          tong: r.tongRa, taiOk: r.taiOkRa,
          khongCoGoc: r.khongCoGocRa, loiThat: r.loiThatRa,
          napMoi: r.napMoiRa, napCapNhat: r.napSuaRa },
      ];
    });
  }, [phienCuaManNay]);

  // Dùng cho những cột chung cả hai hướng
  const gopO = (r: { nhipGop: number }) => ({ rowSpan: r.nhipGop });

  // Nút Lấy vẫn phải khóa khi CÓ BẤT KỲ phiên nào đang chạy, kể cả phiên của màn
  // kia — backend chỉ cho một phiên, bấm nữa chỉ tổ ăn thông báo lỗi.
  const dangChay = !!phien?.dangChay;
  const dangChayManNay = !!phienCuaManNay?.dangChay;

  return (
    <div className={laDauRa ? "huong-ra" : "huong-vao"}>
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      <Card
        title={`${tenMan} — lấy từ cổng TCT, năm làm việc ${namLamViec}`}
        extra={<Button size="small" onClick={() => napDanhSach(true)} loading={loading}>
                 Đọc lại
               </Button>}
        styles={{ body: { paddingTop: 10 } }}
      >
        <div className="thanh-dieu-khien"
             style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
          <Button size="small" onClick={() => chonTheoKyKhai(false)}>
            Đánh dấu các đơn vị khai Tháng
          </Button>
          <Button size="small" onClick={() => chonTheoKyKhai(true)}>
            Đánh dấu các đơn vị khai Quý
          </Button>
          <Button size="small" onClick={() => setSelected([])}
                  disabled={selected.length === 0}>
            Bỏ đánh dấu
          </Button>

          {/* Một nút duy nhất: lấy + nạp, và luôn chạy tăng dần. Không có ô tích chọn
              chế độ — ô tích để lại trạng thái từ lần trước, người dùng dễ tưởng đang
              chạy đầy đủ trong khi nó đang bỏ qua, hoặc ngược lại. */}
          <Button size="small" type="primary" loading={dangBatDau}
                  disabled={selected.length === 0 || dangChay}
                  onClick={() => batDauLayHd()}
                  title="Chỉ tải hóa đơn chưa có, tải xong tự nạp vào database">
            Lấy hóa đơn điện tử
          </Button>
          {dangChay && (
            <Popconfirm title="Dừng phiên đang chạy?"
                        description="Lượt đang tải sẽ bị hủy giữa chừng."
                        okText="Dừng" cancelText="Thôi" onConfirm={() => fetchStop()}>
              <Button size="small" danger>Dừng</Button>
            </Popconfirm>
          )}

          <span style={{ flex: 1 }} />

          <span style={{ fontSize: 13 }}>Từ tháng</span>
          <Select size="small" style={{ width: 74 }} value={tuThang} onChange={setTuThang}
                  options={cacThang.map((m) => ({ value: m, label: `T${m}` }))} />
          <span style={{ fontSize: 13 }}>Đến tháng</span>
          <Select size="small" style={{ width: 74 }} value={denThang} onChange={setDenThang}
                  options={cacThang.map((m) => ({ value: m, label: `T${m}` }))} />
        </div>

        <div className="thanh-dieu-khien"
             style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
          <Checkbox checked={caHaiHuong} onChange={(e) => doiCaHaiHuong(e.target.checked)}>
            Cả vào và ra
          </Checkbox>
          <Checkbox checked={xoaTruoc} onChange={(e) => setXoaTruoc(e.target.checked)}>
            <span style={{ color: xoaTruoc ? "#cf1322" : undefined }}>
              Gặp HĐ trùng: XÓA hẳn rồi ghi mới
            </span>
          </Checkbox>

          <span style={{ flex: 1 }} />

          <Button size="small"
                  danger={soFileCuaDonViChon > 0}
                  disabled={!donViDangChon || soFileCuaDonViChon === 0}
                  onClick={() => moModalConLai()}
                  title={
                    !donViDangChon
                      ? "Chọn đúng một đơn vị để xem"
                      : soFileCuaDonViChon === 0
                        ? "Đơn vị này không còn file nào ở raw\\"
                        : `Xem ${soFileCuaDonViChon} hóa đơn còn lại của ${donViDangChon.code}`
                  }>
            Xem file còn lại{soFileCuaDonViChon > 0 ? ` (${soFileCuaDonViChon})` : ""}
          </Button>
          <Button size="small" disabled={!donViDangChon}
                  onClick={moHopMatKhau}>
            Mật khẩu cổng TCT
            {donViDangChon ? (mkDaCo[donViDangChon.id] ? " — đã có" : " — CHƯA có") : ""}
          </Button>
        </div>

        <Table
          className="luoi-gon luoi-don-vi"
          rowKey="id"
          size="small"
          loading={loading}
          dataSource={dangHoatDong}
          rowSelection={{ selectedRowKeys: selected, onChange: setSelected }}
          pagination={false}
          // Chiều cao CỐ ĐỊNH theo màn hình — lưới đứng yên, KHÔNG co theo số dòng.
          // Ít đơn vị hay nhiều đơn vị thì khung vẫn nguyên chỗ, nên mọi thứ bên dưới
          // (dòng đếm, khối lịch sử) không nhảy lên nhảy xuống mỗi lần lọc.
          // 290px cũ chỉ vừa ~9 dòng, để trống cả nửa dưới trang; lấy theo 100vh thì
          // dùng hết chiều cao thật của màn hình.
          scroll={{ y: "calc(100vh - 430px)" }}
          columns={[
            // STT theo thứ tự ĐANG HIỆN (đã sắp A→Z), không phải id — để đếm và gọi
            // nhau theo số dòng trên màn hình.
            { title: "STT", width: 46, align: "center",
              render: (_: unknown, __: AdminTenant, i: number) => i + 1 },
            // BR-GD-01: mã màu lấy từ theme/donViColors, không gõ hex tại chỗ
            { title: "Mã", dataIndex: "code", width: 150,
              render: (v: string, r: AdminTenant) =>
                <span style={{ color: mauDonVi(r), fontWeight: damDonVi(r) }}>{v}</span> },
            { title: "Tên đơn vị", dataIndex: "name",
              render: (v: string, r: AdminTenant) =>
                <span style={{ color: mauDonVi(r) }}>{v}</span> },
            { title: "MST", dataIndex: "taxCode", width: 130 },
            { title: "Kỳ khai", dataIndex: "khaiQuy", width: 90,
              render: (q: boolean) =>
                q ? <Tag>Quý</Tag> : <Tag color="red">Tháng</Tag> },
            ...cotConLai,
          ]}
        />

        <Typography.Text type="secondary"
                         style={{ display: "block", marginTop: 6, fontSize: 12 }}>
          {selected.length} đơn vị × {Math.max(0, denThang - tuThang + 1)} tháng —{" "}
          {huong === "all" ? "cả vào và ra" : laDauRa ? "chỉ đầu ra" : "chỉ đầu vào"}.
          Chạy tuần tự từng đơn vị-tháng; lấy xong tự nạp vào database.
        </Typography.Text>

        {donViDangChon && mkDaCo[donViDangChon.id] === false && (
          <Alert style={{ marginTop: 8 }} type="warning" showIcon
                 message={`${donViDangChon.code} chưa khai mật khẩu cổng TCT — bấm "Mật khẩu cổng TCT" để nhập`} />
        )}
      </Card>

      {phienCuaManNay && phienCuaManNay.cac.length > 0 && (
        <Card size="small" title="Tiến độ lấy và nạp hóa đơn">
          <Progress
            percent={Math.round(
              (phienCuaManNay.cac.filter((x) => x.trangThai === "xong" || x.trangThai === "loi").length
                / phienCuaManNay.cac.length) * 100)}
            status={dangChayManNay ? "active" : "normal"}
          />
          <Table
            className="luoi-gon" size="small" rowKey={(r) => r.khoa}
            dataSource={dongTienDo} pagination={false}
            scroll={{ x: 1420, y: 260 }}
            columns={[
              { title: "Đơn vị", dataIndex: "code", width: 140, fixed: "left",
                onCell: gopO },
              { title: "Kỳ", width: 80, onCell: gopO,
                render: (_: unknown, r) => `T${r.thang}/${r.nam}` },
              { title: "Hướng", dataIndex: "huong", width: 84,
                render: (v: string) => v
                  ? <Tag color={v === "RA" ? "blue" : v === "VAO" ? "red" : "purple"}>{v}</Tag>
                  : <Typography.Text type="secondary">—</Typography.Text> },
              // Giờ bấm Lấy — không có nó thì nhìn bảng không biết đây là phiên vừa
              // chạy hay phiên từ hôm kia còn treo trên màn hình
              { title: "Bắt đầu", dataIndex: "batDau", width: 160, onCell: gopO,
                render: (v: string | null) => v
                  ? <span title={new Date(v).toLocaleString("vi-VN")}>
                      {new Date(v).toLocaleString("vi-VN",
                        { day: "2-digit", month: "2-digit", year: "numeric",
                          hour: "2-digit", minute: "2-digit", second: "2-digit",
                          hour12: false })}
                    </span>
                  : <Typography.Text type="secondary">—</Typography.Text> },
              { title: "Trạng thái", dataIndex: "trangThai", width: 100, onCell: gopO,
                render: (v: string) => {
                  const mau: Record<string, string> = {
                    cho: "default", dang_chay: "blue", xong: "green", loi: "red", huy: "orange",
                  };
                  const chu: Record<string, string> = {
                    cho: "Chờ", dang_chay: "Đang chạy", xong: "Xong", loi: "Lỗi", huy: "Đã hủy",
                  };
                  return <Tag color={mau[v]}>{chu[v] ?? v}</Tag>;
                } },
              { title: "Tải được", width: 100, align: "center",
                render: (_: unknown, r) => r.tong > 0 || r.taiOk > 0
                  ? <span title={`Tổng ${r.tong || r.taiOk} hóa đơn trong danh sách`
                               + (r.nguonDs === "excel" ? " (đếm từ Excel danh sách)" : "")}>
                      <b>{r.taiOk}</b>/{r.tong || r.taiOk}
                    </span>
                  : <Typography.Text type="secondary">—</Typography.Text> },
              // Hai loại "không tải được" phải nằm riêng: 500-không-có-hồ-sơ-gốc là ca
              // BÌNH THƯỜNG của hóa đơn điện/viễn thông/ngân hàng, còn 429/504 mới là
              // thứ đáng đi tìm. Gộp chung thì lần nào cũng đỏ và không ai buồn đọc.
              { title: "Không có gốc", width: 110, align: "center",
                render: (_: unknown, r) => r.khongCoGoc > 0
                  ? <Tag color="gold"
                         title="HTTP 500 — cổng không giữ bản gốc (điện, viễn thông, ngân hàng). Hợp lệ, không phải lỗi.">
                      {r.khongCoGoc}
                    </Tag>
                  : <Typography.Text type="secondary">0</Typography.Text> },
              // 0 tô XANH chứ không để xám: đây là cột người dùng liếc vào để yên tâm.
              // Xám đọc như "chưa có số liệu", xanh mới nói rõ "đã chạy xong, sạch".
              { title: "Lỗi cần xem", width: 105, align: "center",
                render: (_: unknown, r) => r.loiThat > 0
                  ? <Tag color="red" title="429 / 504 / mạng hỏng — xem LOI_TAI_*.txt trong thư mục job">
                      {r.loiThat}
                    </Tag>
                  : <Tag color="green" title="Không có lỗi mạng hay lỗi cổng nào">0</Tag> },
              { title: "Đã nạp DB", width: 135, align: "center",
                render: (_: unknown, r) =>
                  r.phaNap === "dang_nap" ? <Tag color="blue">Đang nạp…</Tag>
                : r.phaNap === "loi"      ? <Tag color="red" title={r.napThongDiep ?? ""}>Nạp hỏng</Tag>
                : r.phaNap === "xong"     ? <span title={r.napThongDiep ?? ""}>
                                              <b>{r.napMoi}</b> mới
                                              {r.napCapNhat > 0 && ` · ${r.napCapNhat} sửa`}
                                            </span>
                : <Typography.Text type="secondary">—</Typography.Text> },
              { title: "Diễn biến", dataIndex: "thongDiep", ellipsis: true, onCell: gopO,
                render: (v: string, r) => r.loi
                  ? <Typography.Text type="danger" title={r.loi}>{r.loi}</Typography.Text>
                  : <span title={r.napThongDiep ?? v}>{r.napThongDiep || v}</span> },
            ]}
          />
        </Card>
      )}

      {/* Bảng "7 lần gần nhất" đã bỏ theo yêu cầu — chỉ giữ tiến độ. Nhật ký từng
          lượt vẫn ghi vào ActivityLog, muốn tra thì sang màn Nhật ký hệ thống lọc
          theo hành động LAY_HD. */}

      <Modal
        title={`Tài khoản cổng Tổng cục Thuế — ${donViDangChon?.code ?? ""}`}
        open={mkMo} onCancel={() => setMkMo(false)} onOk={luuMatKhau}
        okText="Lưu" cancelText="Thôi" okButtonProps={{ disabled: !mkGiaTri }}
      >
        <Typography.Paragraph type="secondary" style={{ marginBottom: 8 }}>
          MST lấy sẵn từ hồ sơ đơn vị: <b>{donViDangChon?.taxCode || "(chưa có MST)"}</b>.
          Chỉ cần nhập mật khẩu. Mật khẩu lưu nguyên văn nên xem lại được bất cứ lúc nào,
          kể cả khi người khác vừa đổi — muốn đổi thì nhập đè rồi bấm Lưu.
        </Typography.Paragraph>
        <Input.Password autoFocus placeholder={mkDangTai
                          ? "Đang lấy mật khẩu hiện tại…"
                          : "Mật khẩu cổng hoadondientu.gdt.gov.vn"}
                        value={mkGiaTri} onChange={(e) => setMkGiaTri(e.target.value)}
                        onPressEnter={luuMatKhau} />
      </Modal>

      <Modal
        title={`File còn lại trong raw\\ — ${modalDonVi?.code ?? ""} `
             + `(T${tuThang}–T${denThang}, ${huong === "all" ? "vào + ra"
                                            : laDauRa ? "đầu ra" : "đầu vào"})`}
        open={modalMo}
        onCancel={() => setModalMo(false)}
        footer={null}
        width="100vw"
        style={{ top: 0, paddingBottom: 0, maxWidth: "100vw" }}
        styles={{
          body: {
            height: "calc(100vh - 96px)",
            display: "flex", flexDirection: "column", gap: 8, overflow: "hidden",
          },
        }}
      >
        {/* ---------- KHUNG TRÊN: danh sách hóa đơn ----------
             Chia đôi cố định 50/50, mỗi khung có thanh trượt riêng. Chiều cao cuộn
             đặt bằng scroll.y để antd giữ tiêu đề cột đứng yên khi kéo. */}
        <div style={{ flex: "1 1 50%", minHeight: 0,
                      display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <Space size={8} style={{ marginBottom: 2 }}>
          <Typography.Text strong style={{ fontSize: 13 }}>
            Hóa đơn còn trong raw\ ({dsConLai.length})
          </Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 13 }}>
            — bấm một dòng để xem mặt hàng bên dưới; kéo mép tiêu đề để đổi bề rộng cột
          </Typography.Text>
        </Space>
        <div style={{ flex: 1, minHeight: 0 }}>
        <AgGridReact<HoaDonConLai>
          theme={themeVfp}
          {...luoiVfpProps}
          rowData={dsConLai}
          getRowId={(p) => p.data.tenFile}
          defaultColDef={colVfp}
          {...nhoDoRongCot("hoa_don")}
          loading={modalTai}
          overlayNoRowsTemplate="Không đọc được hóa đơn nào trong raw\"
          // Bấm ô nào thì khung mặt hàng bên dưới đổi theo dòng đó
          onCellClicked={(e) => e.data && setChonFile(e.data.tenFile)}
          rowClassRules={{ "dong-dang-chon": (p) => p.data?.tenFile === chonFile }}
          // AG Grid đã ghi giá trị mới vào e.data trước khi gọi đây; vẫn phải đi qua
          // suaHoaDon để state React đổi tham chiếu, nếu không các cột tự tính
          // (Lệch Σ line) và khung mặt hàng bên dưới không vẽ lại.
          onCellValueChanged={(e) => {
            const f = e.colDef.field as keyof HoaDonConLai | undefined;
            if (f) suaHoaDon(e.data.tenFile, { [f]: e.newValue } as Partial<HoaDonConLai>);
          }}
          columnDefs={COT_HOA_DON}
        />
        </div>
        </div>

        {/* ---------- KHUNG DƯỚI: mặt hàng — nửa dưới màn hình, thanh trượt riêng ---------- */}
        <div style={{ flex: "1 1 50%", minHeight: 0,
                      display: "flex", flexDirection: "column",
                      borderTop: "2px solid #d9d9d9", paddingTop: 4, overflow: "hidden" }}>
          {!hdDangChon ? (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE}
                   description="Chọn một hóa đơn ở trên để xem mặt hàng" />
          ) : (
            <>
              <Space wrap size={6} style={{ marginBottom: 3 }}>
                <Typography.Text strong style={{ fontSize: 13 }}>
                  Mặt hàng — {hdDangChon.khHd}/{hdDangChon.soHd} ({hdDangChon.matHangs.length} dòng)
                </Typography.Text>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  {hdDangChon.tenFile}
                </Typography.Text>
                {(() => {
                  const sum = sumLine(hdDangChon);
                  const lech = hdDangChon.tienHang - sum;
                  // Ngưỡng 10đ khớp SAI_SO_CHO_PHEP bên ImportService — không thì hóa
                  // đơn backend đã nhận vẫn hiện đỏ ở đây, đọc như còn lỗi.
                  return Math.abs(lech) < NGUONG_LECH
                    ? <Tag color="green">Σ line khớp tiền hàng</Tag>
                    : <Tag color="red">
                        Σ line {sum.toLocaleString("vi-VN")} — lệch {lech.toLocaleString("vi-VN")}
                      </Tag>;
                })()}
                {hdDangChon.tienCk > 0 && (
                  <Tag title="Dòng TChat=3 vẫn hiện trong lưới, nhưng khi tính Σ thì TRỪ chứ không cộng">
                    Chiết khấu {hdDangChon.tienCk.toLocaleString("vi-VN")} — đã trừ khi tính Σ
                  </Tag>
                )}
                <Button size="small" onClick={() => xemHtml(hdDangChon)}>Xem ảnh HĐ (HTML)</Button>
                <Button size="small" className="nut-cam"
                        onClick={() => tinhLaiTienHang(hdDangChon)}
                        title={"Người bán làm tròn nên SL × ĐG không đúng bằng Thành tiền. "
                             + "Nút này tính ngược lại một trong hai số cho khớp."}>
                  Tính lại tiền hàng
                </Button>
                <Popconfirm
                  title="Nạp hóa đơn này vào database?"
                  description={`Mã sẽ ghi: ${hdDangChon.huong}_${hdDangChon.mstBan}`
                             + `_${hdDangChon.khHd}_${hdDangChon.soHd}`}
                  okText="Nạp" cancelText="Thôi"
                  onConfirm={() => napMotHoaDon(hdDangChon)}
                >
                  <Button size="small" type="primary" loading={dangNap === hdDangChon.tenFile}>
                    Ghi vào Hóa đơn
                  </Button>
                </Popconfirm>
              </Space>
              <div style={{ flex: 1, minHeight: 0 }}>
                <AgGridReact<MatHang>
                  theme={themeVfp}
                  {...luoiVfpProps}
                  rowData={hdDangChon.matHangs}
                  getRowId={(p) => String(p.data.stt)}
                  defaultColDef={colVfp}
                  {...nhoDoRongCot("mat_hang")}
                  overlayNoRowsTemplate="Hóa đơn không có dòng hàng"
                  onCellValueChanged={(e) => {
                    const f = e.colDef.field as keyof MatHang | undefined;
                    if (f) suaMatHang(hdDangChon.tenFile, e.data.stt,
                                      { [f]: e.newValue } as Partial<MatHang>);
                  }}
                  columnDefs={COT_MAT_HANG}
                />
              </div>
            </>
          )}
        </div>
      </Modal>

      <HtmlHoaDon
        mo={htmlHd != null}
        onDong={() => setHtmlHd(null)}
        nhan={htmlHd ? `${htmlHd.khHd}/${htmlHd.soHd}` : undefined}
        tai={taiHtmlRaw}
      />
    </Space>
    </div>
  );
}

// ============ RUỘT 2: đơn vị thường (TUAN_NGA…) — FRM_NHAP_HANG ============
const TK_NO_GOI_Y = ["156", "152", "153", "211", "242", "641", "642", "627"];
const TK_CO_GOI_Y = ["331", "111", "112", "141", "331"];
const TK_VAT_GOI_Y = ["1331", "1332"];

interface DinhKhoan {
  ghiNo: string; ghiCo: string; tkVat: string; tkDuVat: string;
  maCtNo: string; maCtCo: string; dtkt: string; thuongVu: string;
  ngayNhapHang: string; khaiThang: number; soPhieuTC: string; nguoiGD: string;
  ghiChu: string;
  hoaDonHuy: boolean; daIn: boolean; printPreview: boolean; chiInMotTrang: boolean;
  // soSanhDuLieu KHÔNG nằm ở đây: xem state cùng tên trong component. Bộ này lưu THEO
  // TỪNG HÓA ĐƠN (dinhKhoanTheoFile[maHd]), nên cờ nào để nhầm vào đây sẽ bị đặt lại
  // mỗi lần chọn hóa đơn khác.
  khongKiemTraTen: boolean;
  coDuLieuGoc: boolean; dungTkNganHang: boolean; banHangQuaDienThoai: boolean;
  tenHangLaBangKe: boolean;
  suaTienCk: boolean; suaTienVat: boolean;
  // null = chưa gõ tay, ô hiện thuế suất của hóa đơn đang chọn
  thueSuat: number | null; chietKhau: number; tienVat: number;
  ghiNoCk: string; maCtNoCk: string; ghiCoCk: string; maCtCoCk: string;
  // Khối HĐ Liên quan
  tinhChatLQ: string; loaiLQ: string; maSoLQ: string;
  khhdLQ: string; soHdLQ: string; ngayLQ: string;
}

const dinhKhoanRong = (): DinhKhoan => ({
  ghiNo: "156", ghiCo: "331", tkVat: "1331", tkDuVat: "331",
  maCtNo: "", maCtCo: "", dtkt: "", thuongVu: "",
  ngayNhapHang: "", khaiThang: 0, soPhieuTC: "", nguoiGD: "", ghiChu: "XML File-",
  hoaDonHuy: false, daIn: false, printPreview: true, chiInMotTrang: false,
  khongKiemTraTen: true,
  coDuLieuGoc: false, dungTkNganHang: false, banHangQuaDienThoai: false,
  tenHangLaBangKe: false,
  suaTienCk: false, suaTienVat: true,
  thueSuat: null, chietKhau: 0, tienVat: 0,
  ghiNoCk: "", maCtNoCk: "", ghiCoCk: "", maCtCoCk: "",
  tinhChatLQ: "", loaiLQ: "", maSoLQ: "", khhdLQ: "", soHdLQ: "", ngayLQ: "",
});

function HoaDonCuaDonVi({ huongMacDinh }: Props) {
  const { session } = useAuth();
  const namLamViec = session?.fiscalYear ?? new Date().getFullYear();
  const laDauRa = huongMacDinh === "ra";
  const [dsHd, setDsHd] = useState<HoaDonThue[]>([]);
  const [tenFileChon, setTenFileChon] = useState<string | null>(null);
  const [tai, setTai] = useState(true);
  const [sttChon, setSttChon] = useState<number | null>(null);
  const [moDanhSach, setMoDanhSach] = useState(false);
  const [dinhKhoanTheoFile, setDinhKhoanTheoFile] =
    useState<Record<string, DinhKhoan>>({});

  // Chế độ ĐỐI CHIẾU của cả màn hình, KHÔNG phải thuộc tính của một hóa đơn — nên phải
  // là state riêng, không nằm trong DinhKhoan. Trước đây để trong đó: bấm chọn hóa đơn
  // khác là dk nhảy sang bộ của hóa đơn mới (mặc định tắt), lưới đang so sánh tự dựng
  // lại về bảng thường ngay dưới tay người dùng.
  const [soSanhDuLieu, setSoSanhDuLieu] = useState(false);

  const hd = dsHd.find((x) => x.maHd === tenFileChon) ?? null;
  const tenDoiTac = hd?.tenKh ?? "";
  const mstDoiTac = hd?.mst ?? "";
  const dk = (tenFileChon && dinhKhoanTheoFile[tenFileChon]) || dinhKhoanRong();

  const luoiHangRef = useRef<HTMLDivElement | null>(null);
  const phimLuoiHang = (e: React.KeyboardEvent) => {
    const ds = hd?.lines ?? [];
    if (ds.length === 0) return;
    const iHienTai = ds.findIndex((m) => m.sttLine === sttChon);
    let i: number;
    switch (e.key) {
      case "ArrowDown": i = Math.min(iHienTai + 1, ds.length - 1); break;
      case "ArrowUp":   i = Math.max(iHienTai - 1, 0); break;
      case "Home":      i = 0; break;
      case "End":       i = ds.length - 1; break;
      case "PageDown":  i = Math.min(iHienTai + 10, ds.length - 1); break;
      case "PageUp":    i = Math.max(iHienTai - 10, 0); break;
      default: return;
    }
    e.preventDefault();
    const dong = ds[i < 0 ? 0 : i];
    if (!dong) return;
    setSttChon(dong.sttLine);
    luoiHangRef.current
      ?.querySelector<HTMLElement>(`[data-row-key="${dong.sttLine}"]`)
      ?.scrollIntoView({ block: "nearest" });
  };

  const suaDk = (thayDoi: Partial<DinhKhoan>) => {
    if (!tenFileChon) return;
    setDinhKhoanTheoFile((m) => ({
      ...m, [tenFileChon]: { ...(m[tenFileChon] ?? dinhKhoanRong()), ...thayDoi },
    }));
  };

  const napHoaDon = async (baoKhiXong = false) => {
    setTai(true);
    try {
      const r = await thueDanhSachHoaDon(laDauRa ? "RA" : "VAO", undefined, undefined, 2000);
      const ds = r.data;
      setDsHd(ds);
      const dau = ds[0] ?? null;
      setTenFileChon(dau?.maHd ?? null);
      if (dau) {
        await taiChiTiet(dau.maHd);
        // Số đã có trong DB đổ sẵn vào phần định khoản để khỏi gõ lại
        setDinhKhoanTheoFile((m) => m[dau.maHd] ? m : {
          ...m,
          [dau.maHd]: {
            ...dinhKhoanRong(),
            khaiThang: dau.thang ?? 0,
            tienVat: dau.tienVat,
            chietKhau: dau.tienCk,
            ngayNhapHang: (dau.ngayNh ?? dau.ngay ?? "").slice(0, 10),
            ghiNo: dau.ghiNo || "156",
            ghiCo: dau.ghiCo || "331",
            maCtNo: dau.maCtNo ?? "",
            maCtCo: dau.maCtCo ?? "",
            thuongVu: dau.maTv ?? "",
            nguoiGD: dau.nguoiGiaoDich ?? "",
            soPhieuTC: dau.soPtc ?? "",
            ghiChu: dau.ghiChu || "XML File-",
            tinhChatLQ: dau.tichChatHdLienquan ?? "",
            loaiLQ: dau.loaiHdLienquan ?? "",
            maSoLQ: dau.mauSoHdLienquan ?? "",
            khhdLQ: dau.khhdLienquan ?? "",
            soHdLQ: dau.sohdLienquan ?? "",
            ngayLQ: (dau.ngayLienquan ?? "").slice(0, 10),
          },
        });
      }
      if (baoKhiXong) message.success(`Đã đọc ${ds.length} hóa đơn`);
      // Kéo sẵn dòng hàng của cả danh sách, CHẠY NGẦM sau khi màn hình đã có dữ
      // liệu — không await, để hóa đơn đầu tiên hiện ra ngay như trước.
      void napNenLines(ds);
    } catch (e) {
      setDsHd([]);
      setTenFileChon(null);
      message.error(loiApi(e, "Không đọc được sổ hóa đơn của đơn vị"));
    } finally {
      setTai(false);
    }
  };

  const dangTaiRef = useRef<Set<string>>(new Set());
  const yeuCauCuoiRef = useRef<string | null>(null);
  const laHdMoi = (maHd: string) => maHd.startsWith("__moi_");
  const taiChiTiet = async (maHd: string, bucTaiLai = false) => {
    if (laHdMoi(maHd)) return;
    // Đang có request cho chính mã này thì thôi — trừ khi người dùng chủ động bấm
    // Enter để gọi lại, lúc đó phải cho đi tiếp chứ không im lặng bỏ qua.
    if (!bucTaiLai && dangTaiRef.current.has(maHd)) return;
    dangTaiRef.current.add(maHd);
    yeuCauCuoiRef.current = maHd;
    try {
      const r = await thueChiTietHoaDon(maHd);
      setDsHd((ds) => ds.map((x) => (x.maHd === maHd ? r.data : x)));
      // Chỉ đổi dòng hàng đang chọn nếu đây vẫn là hóa đơn người dùng đang xem
      if (yeuCauCuoiRef.current === maHd)
        setSttChon(r.data.lines[0]?.sttLine ?? null);
    } catch (e) {
      message.error(loiApi(e, `Không đọc được chi tiết hóa đơn ${maHd}`));
    } finally {
      dangTaiRef.current.delete(maHd);
    }
  };

  // ===== Nạp nền dòng hàng =====
  // API danh sách không kèm lines cho nhẹ tải, nên lướt ↑/↓ ở modal danh sách là
  // mỗi hóa đơn một request — bảng dưới trống một nhịp rồi mới có dữ liệu. Ở đây
  // kéo sẵn lines của cả danh sách về, CHIA LÔ và chỉ chạy SAU khi màn hình đã
  // tải xong, để người dùng không phải chờ thêm gì ở lần vẽ đầu.
  //
  // Chia lô thay vì một cú 1000 dòng: có dữ liệu dùng dần ngay từ lô đầu, và
  // một lô hỏng thì các lô khác vẫn xong. 200 nằm dưới trần 500 của backend.
  const CO_LO_NAP_NEN = 200;
  const napNenRef = useRef<AbortController | null>(null);

  const napNenLines = async (ds: HoaDonThue[]) => {
    // Chỉ lấy hóa đơn CHƯA có lines; hóa đơn mới soạn chưa vào sổ thì không hỏi.
    const can = ds.filter((x) => x.lines.length === 0 && !laHdMoi(x.maHd))
                  .map((x) => x.maHd);
    if (can.length === 0) return;

    napNenRef.current?.abort();     // đổi đơn vị/năm giữa chừng thì bỏ lượt cũ
    const bo = new AbortController();
    napNenRef.current = bo;

    for (let i = 0; i < can.length; i += CO_LO_NAP_NEN) {
      if (bo.signal.aborted) return;
      const lo = can.slice(i, i + CO_LO_NAP_NEN);
      try {
        const r = await thueLinesNhieuHoaDon(lo);
        if (bo.signal.aborted) return;
        const map = r.data;
        setDsHd((cu) => cu.map((x) => {
          // Đừng đè lên hóa đơn đã có lines: trong lúc lô này chạy, người dùng có
          // thể đã bấm vào một hóa đơn và taiChiTiet đã ghi bản đầy đủ vào đó.
          if (x.lines.length > 0) return x;
          const lines = map[x.maHd];
          return lines ? { ...x, lines } : x;
        }));
      } catch {
        // Nạp nền hỏng thì im lặng — đây là tối ưu tốc độ, không phải nghiệp vụ.
        // Người dùng bấm vào hóa đơn nào thì taiChiTiet vẫn tải bình thường.
        return;
      }
    }
  };

  useEffect(() => () => napNenRef.current?.abort(), []);

  const [maHdDaSua, setMaHdDaSua] = useState<string | null>(null);
  const [dangLuu, setDangLuu] = useState(false);
  const luoiDaSua = maHdDaSua != null && maHdDaSua === tenFileChon;

  const suaDongHang = (sttLine: number, thayDoi: Partial<HoaDonLine>) => {
    if (!tenFileChon) return;
    setMaHdDaSua(tenFileChon);
    setDsHd((ds) => ds.map((x) => {
      if (x.maHd !== tenFileChon) return x;
      return {
        ...x,
        lines: x.lines.map((d) => {
          if (d.sttLine !== sttLine) return d;
          const moi = { ...d, ...thayDoi };
          moi.thanhTien = (moi.soLuong ?? 0) * (moi.donGia ?? 0);
          return moi;
        }),
      };
    }));
  };

  const themDongHang = () => {
    if (!tenFileChon) return;
    setMaHdDaSua(tenFileChon);
    setDsHd((ds) => ds.map((x) => {
      if (x.maHd !== tenFileChon) return x;
      const cuoi = x.lines[x.lines.length - 1];
      const sttMoi = x.lines.reduce((m, d) => Math.max(m, d.sttLine), 0) + 1;
      const dongMoi: HoaDonLine = {
        sttLine: sttMoi,
        maHang: null, tenHang: "", dvt: cuoi?.dvt ?? null,
        soLuong: 0, donGia: 0, thanhTien: 0,
        ptVat: cuoi?.ptVat ?? 0, tienCk: 0,
        ghiNo: cuoi?.ghiNo ?? null, ghiCo: cuoi?.ghiCo ?? null,
        maNgan: null, tinhChat: null, ghiChu: null,
      };
      return { ...x, lines: [...x.lines, dongMoi] };
    }));
  };

  const luuDongHang = async () => {
    if (!tenFileChon || !hd) return;
    if (laHdMoi(tenFileChon)) {
      message.warning("Hóa đơn mới soạn chưa có trong sổ — chưa lưu được dòng hàng");
      return;
    }
    setDangLuu(true);
    try {
      const r = await thueLuuLinesHoaDon(tenFileChon, hd.lines);
      setMaHdDaSua(null);
      message.success(r.data.message);
      await taiChiTiet(tenFileChon, true);
    } catch (e) {
      message.error(loiApi(e, "Không lưu được dòng hàng"));
    } finally {
      setDangLuu(false);
    }
  };

  const soNhapRef = useRef(0);

  const taoMoi = () => {
    soNhapRef.current += 1;
    const khoaTam = `__moi_${soNhapRef.current}`;
    const homNay = new Date().toISOString().slice(0, 10);
    const hdMoi: HoaDonThue = {
      maHd: khoaTam,
      huong: laDauRa ? "RA" : "VAO",
      ngay: homNay, ngayNh: homNay, thang: new Date().getMonth() + 1,
      khhd: "", soHd: "", mst: "", tenKh: "", diaChi: "",
      nguoiGiaoDich: "", soPtc: "", maTv: "", tenTv: "",
      tienHang: 0, tienVat: 0, tienCk: 0, tongTien: 0, soDongHang: 0,
      ghiNo: "", ghiCo: "", maCtNo: "", maCtCo: "",
      // HĐ nhập tay chưa định khoản phần thuế — để null, ImportService/kế toán gán sau.
      ghiNoVat: null, ghiCoVat: null,
      ghiChu: "", tthaiHd: null, vat: null, vatLine: null,
      tichChatHdLienquan: null, loaiHdLienquan: null, mauSoHdLienquan: null,
      khhdLienquan: null, sohdLienquan: null, ngayLienquan: null,
      trangThaiHdLienQuan: null,
      lines: [],
    };
    setDsHd((ds) => [hdMoi, ...ds]);
    setTenFileChon(khoaTam);
    setSttChon(null);
    setDinhKhoanTheoFile((m) => ({
      ...m,
      [khoaTam]: {
        ...dinhKhoanRong(),
        khaiThang: hdMoi.thang ?? 0,
        ngayNhapHang: homNay,
      },
    }));
    message.info("Đã tạo hóa đơn trống, chưa có API lưu, dữ liệu chỉ giữ trong phiên làm việc");
  };

  // Xem bản gốc NGAY TRONG MÀN — trước đây mở tab mới nên mất chỗ đang đứng, mà
  // trình duyệt hay chặn pop-up khiến bấm xong không thấy gì. Modal tự lo phần
  // tải; ở đây chỉ nói cho nó biết xem hóa đơn nào.
  const [htmlMaHd, setHtmlMaHd] = useState<string | null>(null);
  const xemHtml = (maHd: string) => { if (maHd) setHtmlMaHd(maHd); };

  const taiHtmlHoaDon = async () => {
    if (!htmlMaHd) return { html: null, duongDan: null };
    try {
      return await thueHtmlHoaDon(htmlMaHd);
    } catch (e: unknown) {
      const st = (e as { response?: { status?: number } })?.response?.status;
      // 404 = hóa đơn không kèm bản gốc: chuyện thường, để modal hiện khung rỗng
      // với lời giải thích chứ không phải lỗi đỏ.
      if (st === 404) return { html: null, duongDan: null };
      throw new Error(loiApi(e, "Không mở được bản HTML"), { cause: e });
    }
  };
  useEffect(() => {
    let huy = false;
    const id = setTimeout(() => { if (!huy) void napHoaDon(); }, 0);
    return () => { huy = true; clearTimeout(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.tenant.id, namLamViec, huongMacDinh]);

  // Thuế suất của HÓA ĐƠN — đọc thẳng cột vat của HOA_DON, KHÔNG dò xuống dòng hàng.
  // Ô này nằm trong khối cộng tiền của hóa đơn nên phải lấy số của chính bảng đó;
  // %VAT của dòng hàng là việc của lưới dòng hàng.
  //
  // HĐ có nhiều thuế suất thì con số này chỉ mang tính tham khảo (lấy mức nào cũng
  // được) — số phải chuẩn là Tiền VAT bên cạnh, vốn là h.tien_vat đã cộng sẵn cho cả
  // hóa đơn nên luôn đúng dù có mấy mức thuế.
  const thueSuatCuaHd = (x: HoaDonThue): number | null => x.vat;

  const chonHoaDon = (maHd: string, bucTaiLai = false) => {
    setTenFileChon(maHd);
    const x = dsHd.find((h) => h.maHd === maHd);
    if (!x) return;
    if (bucTaiLai || x.lines.length === 0) void taiChiTiet(maHd, bucTaiLai);
    else setSttChon(x.lines[0]?.sttLine ?? null);
    setDinhKhoanTheoFile((m) => m[maHd] ? m : {
      ...m,
      [maHd]: {
        ...dinhKhoanRong(),
        khaiThang: x.thang ?? 0,
        tienVat: x.tienVat,
        chietKhau: x.tienCk,
        ngayNhapHang: (x.ngayNh ?? x.ngay ?? "").slice(0, 10),
        ghiNo: x.ghiNo || "",
        ghiCo: x.ghiCo || "",
        maCtNo: x.maCtNo ?? "",
        maCtCo: x.maCtCo ?? "",
        thuongVu: x.maTv ?? "",
        nguoiGD: x.nguoiGiaoDich ?? "",
        soPhieuTC: x.soPtc ?? "",
        ghiChu: x.ghiChu || "XML File-",
        tinhChatLQ: x.tichChatHdLienquan ?? "",
        loaiLQ: x.loaiHdLienquan ?? "",
        maSoLQ: x.mauSoHdLienquan ?? "",
        khhdLQ: x.khhdLienquan ?? "",
        soHdLQ: x.sohdLienquan ?? "",
        ngayLQ: (x.ngayLienquan ?? "").slice(0, 10),
      },
    });
  };


  // Chưa gõ tay (null) thì bám theo hóa đơn đang chọn — bấm sang hóa đơn khác là
  // ô đổi theo. Gõ rồi thì giữ nguyên số của người dùng cho hóa đơn đó.
  const thueSuatHienThi = dk.thueSuat ?? (hd ? thueSuatCuaHd(hd) : null);

  const congTienHang = useMemo(
    () => (hd?.lines ?? []).reduce((s, x) => s + x.thanhTien, 0), [hd]);
  const congThanhToan = congTienHang - (dk.chietKhau || 0) + (dk.tienVat || 0);

  const oNhan = (t: string, rong: number, do_ = false) => (
    <span className={do_ ? "nhan nhan-do" : "nhan"} style={{ width: rong }}>{t}</span>
  );

  // Tiền trong khối cộng: dấu . ngăn hàng nghìn, dấu , ngăn phần lẻ — kiểu vi-VN
  // như bản gốc VFP. 4 chữ số lẻ vì đơn giá hóa đơn điện tử có thể lẻ tới đó.
  // Tham số khai đúng number: để union string|number thì antd suy ngược valueType
  // của InputNumber thành string|number, và onChange trả về union đó — gán vào
  // DinhKhoan (toàn number) là lỗi kiểu.
  const tienVn = (v: number | undefined) =>
    Number(v ?? 0).toLocaleString("vi-VN",
      { minimumFractionDigits: 4, maximumFractionDigits: 4 });

  // Cặp với tienVn cho các ô SỬA ĐƯỢC. Thiếu parser thì antd đọc lại chính chuỗi
  // đã định dạng: gõ 6703509 hiện "6.703.509,0000", nhưng lần nhập sau nó cắt ở
  // dấu chấm đầu và giá trị tụt về 6 — tiền VAT sai mà không có gì báo.
  const docTienVn = (s: string | undefined): number => {
    const so = Number((s ?? "").replace(/\./g, "").replace(",", "."));
    return Number.isFinite(so) ? so : 0;
  };

  const nutChuaNoi = (nhan: string, lop = "") => (
    <Button size="small" className={lop} disabled
            title="Nghiệp vụ này chưa nối backend">
      {nhan}
    </Button>
  );

  // Ba nút Tạo mới / Tìm / Đọc lại nằm CÙNG HÀNG với khung tiêu đề phiếu, dồn sang
  // phải. Trước đây chúng ở thanh title của Card, nhưng cả thanh đó chỉ để chở ba
  // nút và một dòng chữ lặp lại thứ đã có ở header ứng dụng (tên màn + tên đơn vị +
  // năm) — bỏ Card đi thì phiếu cao thêm ~46px, tiền nào cũng thấy rõ hơn.
  //
  // Ô Select chọn hóa đơn đã bỏ từ trước: danh sách xổ xuống chỉ hiện được một mẩu
  // tên khách nên tra bằng nó rất khó, trong khi nút "Tìm" mở modal danh sách đầy đủ
  // (lọc tháng, tìm nhanh, xem dòng hàng) — cùng việc nhưng làm tốt hơn hẳn.
  return (
    <div className={laDauRa ? "huong-ra" : "huong-vao"}>
        {!tai && dsHd.length === 0 && (
          <Alert type="info" showIcon style={{ marginBottom: 8 }}
                 message={`Chưa có hóa đơn ${laDauRa ? "đầu ra" : "đầu vào"} nào trong sổ năm ${namLamViec}`}
                 description="Hóa đơn hiện ở đây sau khi bộ phận kế toán chạy Lấy HĐ điện tử từ cổng TCT và nạp vào sổ." />
        )}

        <div className="phieu-nhap">
          <div className="hang hang-tieu-de">
            <div className="tieu-de-phieu">
              {laDauRa ? "HĐ GTGT ĐẦU RA" : "HĐ GTGT ĐẦU VÀO"}
            </div>
            <Space size={6}>
              <Button size="small" type="primary" onClick={taoMoi}>
                Tạo mới
              </Button>
              <Button size="small" onClick={() => setMoDanhSach(true)}>
                Tìm
              </Button>
              <Button size="small" onClick={() => napHoaDon(true)} loading={tai}>
                Đọc lại
              </Button>
            </Space>
          </div>

          <div className="hang">
            {oNhan("Mã HĐ", 52)}
            <Input size="small" style={{ width: 96 }} disabled
                   value={hd ? (laHdMoi(hd.maHd) ? "(mới)" : hd.maHd) : ""}
                   title={hd && !laHdMoi(hd.maHd) ? hd.maHd
                        : "Mã sinh tự động khi ghi vào sổ"} />
            {oNhan("Ký hiệu", 56)}
            <Input size="small" style={{ width: 96 }} value={hd?.khhd ?? ""} readOnly />
            {oNhan("Số HĐ", 50)}
            <Input size="small" style={{ width: 90 }} value={hd?.soHd ?? ""} readOnly />

            <Checkbox checked={dk.hoaDonHuy}
                      onChange={(e) => suaDk({ hoaDonHuy: e.target.checked })}>
              Hóa đơn hủy
            </Checkbox>
            {oNhan("M.Phiếu T/C", 82)}
            <Input size="small" style={{ width: 150 }} value={dk.soPhieuTC}
                   onChange={(e) => suaDk({ soPhieuTC: e.target.value })} />
            {oNhan("Ngày lập HĐ", 84)}
            <Input size="small" style={{ width: 110 }} readOnly
                   value={(hd?.ngay ?? "").slice(0, 10)} />
          </div>

          <div className="hang">
            {oNhan("Ngày HĐ", 52)}
            <Input size="small" style={{ width: 96 }} readOnly
                   value={(hd?.ngay ?? "").slice(0, 10)} />
            {oNhan("Ngày nhập hàng", 100)}
            <Input size="small" style={{ width: 96 }} value={dk.ngayNhapHang}
                   placeholder="yyyy-MM-dd"
                   onChange={(e) => suaDk({ ngayNhapHang: e.target.value })} />
            {oNhan("Khai tháng", 70)}
            <Select size="small" style={{ width: 100 }}
                    value={dk.khaiThang || undefined} placeholder="Tháng"
                    onChange={(v) => suaDk({ khaiThang: v })}
                    options={Array.from({ length: 12 }, (_, i) => ({
                      value: i + 1, label: `Tháng ${i + 1}` }))} />
            <Checkbox checked={dk.daIn} onChange={(e) => suaDk({ daIn: e.target.checked })}>
              Đã In
            </Checkbox>
            <span style={{ flex: 1 }} />
            <Checkbox checked={dk.printPreview}
                      onChange={(e) => suaDk({ printPreview: e.target.checked })}>
              Print Preview
            </Checkbox>
            <Checkbox checked={dk.chiInMotTrang}
                      onChange={(e) => suaDk({ chiInMotTrang: e.target.checked })}>
              Chỉ in một trang
            </Checkbox>
          </div>

          <div className="hang">
            {oNhan("MST KH", 52)}
            <Input size="small" style={{ width: 150 }} readOnly value={mstDoiTac} />
            {oNhan("Địa chỉ", 52)}
            <Input size="small" style={{ flex: 1, minWidth: 240 }} readOnly
                   value={hd?.diaChi ?? ""} title={hd?.diaChi ?? ""} />
            {oNhan("Người GD", 62)}
            <Input size="small" style={{ width: 240 }} value={dk.nguoiGD}
                   onChange={(e) => suaDk({ nguoiGD: e.target.value })} />
          </div>

          <div className="hang">
            {oNhan("Tên NB", 52)}
            <Input size="small" style={{ width: 110 }} readOnly value={mstDoiTac} />
            <Input size="small" style={{ flex: 1, minWidth: 240 }} readOnly
                   value={tenDoiTac} title={tenDoiTac} />
            {oNhan("Địa chỉ GH", 70)}
            <Input size="small" style={{ width: 240 }} disabled />
          </div>

          {/* Hai cột định khoản | HĐ Liên quan. Cột trái CO THEO NỘI DUNG (flex: none)
              chứ không chiếm 62% như trước: sau khi thu mấy ô Mã CT lại, 62% để dư
              một mảng trống to giữa hai cột. Khoảng trống dồn hết ra sau cột phải. */}
          <div style={{ display: "flex", gap: 12, marginTop: 4 }}>
            <div style={{ flex: "none", minWidth: 0 }}>
              <div className="hang">
                {oNhan("GHI NỢ", 52, true)}
                <Select size="small" style={{ width: 74 }} value={dk.ghiNo}
                        onChange={(v) => suaDk({ ghiNo: v })}
                        options={TK_NO_GOI_Y.map((x) => ({ value: x, label: x }))} />
                <Input size="small" style={{ width: 170 }} value="Hàng hoá" readOnly />
                {oNhan("Mã CT nợ", 66)}
                {/* Mã chứng từ chỉ vài ký tự — trước để flex:1 nên ô kéo dài hết
                    hàng, nhìn như ô nhập văn bản dài. */}
                <Input size="small" style={{ width: 150 }} value={dk.maCtNo}
                       onChange={(e) => suaDk({ maCtNo: e.target.value })} />
              </div>
              <div className="hang">
                {oNhan("GHI CÓ", 52, true)}
                <Select size="small" style={{ width: 74 }} value={dk.ghiCo}
                        onChange={(v) => suaDk({ ghiCo: v })}
                        options={TK_CO_GOI_Y.map((x) => ({ value: x, label: x }))} />
                <Input size="small" style={{ width: 170 }} value="Phải trả cho người bán"
                       readOnly />
                {oNhan("Mã CT có", 66)}
                <Input size="small" style={{ width: 150 }} value={dk.maCtCo}
                       onChange={(e) => suaDk({ maCtCo: e.target.value })}
                       placeholder={tenDoiTac} />
              </div>
              <div className="hang">
                {oNhan("TK VAT", 52, true)}
                <Select size="small" style={{ width: 74 }} value={dk.tkVat}
                        onChange={(v) => suaDk({ tkVat: v })}
                        options={TK_VAT_GOI_Y.map((x) => ({ value: x, label: x }))} />
                <Input size="small" style={{ width: 170 }} value="Thuế GTGT được khấu trừ"
                       readOnly />
                {oNhan("TK DƯ VAT", 76, true)}
                <Select size="small" style={{ width: 74 }} value={dk.tkDuVat}
                        onChange={(v) => suaDk({ tkDuVat: v })}
                        options={TK_CO_GOI_Y.map((x) => ({ value: x, label: x }))} />
                <Input size="small" style={{ width: 170 }}
                       value="Phải trả cho người bán" readOnly />
              </div>
              <div className="hang">
                {oNhan("Đ.T.K.T", 52, true)}
                <Input size="small" style={{ width: 250 }} value={dk.dtkt}
                       onChange={(e) => suaDk({ dtkt: e.target.value })} />
                {oNhan("Thương vụ", 72)}
                <Input size="small" style={{ width: 150 }} value={dk.thuongVu}
                       onChange={(e) => suaDk({ thuongVu: e.target.value })} />
              </div>
              <div className="hang">
                {oNhan("Ghi chú", 52)}
                {/* Cố định 340px chứ không %: cột trái giờ co theo nội dung nên %
                    sẽ tính trên bề rộng đã co, ra ô hẹp hơn nhiều so với ý muốn. */}
                <Input size="small" style={{ width: 340 }} value={dk.ghiChu}
                       onChange={(e) => suaDk({ ghiChu: e.target.value })} />
              </div>

              {/* Cụm nút giữa form */}
              <div className="hang" style={{ marginTop: 4, flexWrap: "wrap" }}>
                {/* KHÔNG dùng suaDk: đây là chế độ xem của màn hình, mà suaDk ghi vào bộ
                    định khoản của riêng hóa đơn đang chọn. Ô này cũng không cần chọn
                    hóa đơn trước mới bấm được — suaDk thì return sớm khi chưa chọn. */}
                <Checkbox checked={soSanhDuLieu}
                          onChange={(e) => setSoSanhDuLieu(e.target.checked)}>
                  So sánh dữ liệu
                </Checkbox>
                {nutChuaNoi("Ghi lại HĐ lỗi", "nut-cam")}
                <Button size="small" className="nut-xanh"
                        disabled={!hd || laHdMoi(hd.maHd)}
                        onClick={() => hd && xemHtml(hd.maHd)}
                        title={!hd ? "Chưa chọn hóa đơn"
                             : laHdMoi(hd.maHd) ? "Hóa đơn mới soạn — chưa có bản gốc"
                             : `Mở bản HTML gốc của ${hd.maHd}`}>
                  Xem gốc
                </Button>
                {nutChuaNoi("Lấy dòng từ Excel", "nut-xanh")}
                <Checkbox checked={dk.tenHangLaBangKe}
                          onChange={(e) => suaDk({ tenHangLaBangKe: e.target.checked })}>
                  H.Đơn T.Bảy
                </Checkbox>
              </div>
              <div className="hang">
                <Checkbox checked={dk.khongKiemTraTen}
                          onChange={(e) => suaDk({ khongKiemTraTen: e.target.checked })}>
                  Không kiểm tra tên khi thêm dòng
                </Checkbox>
              </div>
            </div>

            {/* ---- Cột phải: HĐ Liên quan ---- */}
            <div className="khoi-lquan" style={{ flex: "0 0 330px" }}>
              {([
                ["Tính chất HĐ LQuan", "tinhChatLQ"],
                ["Loại HĐ LQuan", "loaiLQ"],
                ["Mã số HĐ LQuan", "maSoLQ"],
                ["KHHD LQuan", "khhdLQ"],
                ["Số HĐ LQuan", "soHdLQ"],
                ["Ngày HĐ LQuan", "ngayLQ"],
              ] as [string, keyof DinhKhoan][]).map(([nhan, khoa]) => (
                <div className="hang" key={khoa}>
                  <span className="nhan">{nhan}</span>
                  <Input size="small" style={{ width: 150 }}
                         value={String(dk[khoa] ?? "")}
                         onChange={(e) => suaDk({ [khoa]: e.target.value } as Partial<DinhKhoan>)} />
                </div>
              ))}
            </div>
          </div>

          {/* ===== THANH CÔNG CỤ TRÊN LƯỚI =====
               Một hàng duy nhất: nhãn + số dòng + các tùy chọn, rồi hai nút bám mép
               phải. Trước đây tách làm hai hàng nên nhãn "Chi tiết hàng hoá dịch vụ"
               hiện hai lần, và ô đếm số dòng readOnly lặp lại đúng con số đã có
               trong nhãn. */}
          <div className="hang" style={{ marginTop: 6, flexWrap: "wrap" }}>
            <Typography.Text strong style={{ fontSize: 14, color: "var(--hd-dam)",
                                             marginRight: 4 }}>
              Chi tiết hàng hoá dịch vụ
            </Typography.Text>
            {hd && (
              <span className="nhan" style={{ color: "#666", marginRight: 4 }}>
                {hd.lines.length} dòng
                {luoiDaSua && <b style={{ color: "#d46b08" }}> · chưa lưu</b>}
              </span>
            )}
            <Checkbox checked={dk.tenHangLaBangKe}
                      onChange={(e) => suaDk({ tenHangLaBangKe: e.target.checked })}>
              Tên hàng là bảng kê
            </Checkbox>
            {nutChuaNoi("Đọc Excel TKHQ", "nut-xanh")}
            <Checkbox checked={dk.coDuLieuGoc}
                      onChange={(e) => suaDk({ coDuLieuGoc: e.target.checked })}>
              Có dữ liệu gốc
            </Checkbox>
            <Checkbox checked={dk.dungTkNganHang}
                      onChange={(e) => suaDk({ dungTkNganHang: e.target.checked })}>
              Dùng TK Ngân hàng
            </Checkbox>
            <Checkbox checked={dk.banHangQuaDienThoai}
                      onChange={(e) => suaDk({ banHangQuaDienThoai: e.target.checked })}>
              Bán hàng qua điện thoại
            </Checkbox>
            <span style={{ flex: 1 }} />
            <Button size="small" className="nut-xanh" disabled={!hd}
                    onClick={themDongHang}
                    title={hd ? "Thêm một dòng hàng trống vào cuối"
                              : "Chưa chọn hóa đơn"}>
              + Thêm dòng
            </Button>
            <Button size="small" type="primary"
                    disabled={!hd || !luoiDaSua || dangLuu} loading={dangLuu}
                    onClick={luuDongHang}
                    title={!hd ? "Chưa chọn hóa đơn"
                         : !luoiDaSua ? "Chưa có thay đổi nào để lưu"
                         : "Ghi dòng hàng xuống sổ"}>
              Lưu
            </Button>
          </div>

          <div ref={luoiHangRef} tabIndex={0} onKeyDown={phimLuoiHang}
               className="khung-luoi-hang">
          <Table
            className="luoi-hang"
            rowKey="sttLine" size="small" pagination={false}
            dataSource={hd?.lines ?? []}
            loading={tai}
            scroll={{ x: 1286, y: 210 }}
            locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE}
                                        description="Hóa đơn không có dòng hàng" /> }}
            onRow={(m: HoaDonLine) => ({
              onClick: () => setSttChon(m.sttLine),
              className: m.sttLine === sttChon ? "dong-dang-chon" : undefined,
              style: { cursor: "pointer" },
            })}
            columns={[
              { title: "STT", dataIndex: "sttLine", width: 36, fixed: "left" },
              { title: "Tên hàng hoá dịch vụ", dataIndex: "tenHang", width: 230,
                render: (v: string, m: HoaDonLine) => (
                  <Input size="small" value={v} title={v}
                         onChange={(e) => suaDongHang(m.sttLine, { tenHang: e.target.value })} />
                ) },
              // o-giua: căn giữa chữ TRONG ô nhập, xem hoa-don-dau-vao.css.
              { title: "ĐVT", dataIndex: "dvt", width: 54, align: "center",
                onCell: () => ({ className: "o-giua" }),
                render: (v: string | null, m: HoaDonLine) => (
                  <Input size="small" value={v ?? ""}
                         onChange={(e) => suaDongHang(m.sttLine, { dvt: e.target.value })} />
                ) },
              { title: "Số lượng", dataIndex: "soLuong", width: 72, align: "right",
                render: (v: number, m: HoaDonLine) => (
                  <InputNumber size="small" value={v} controls={false}
                               style={{ width: "100%" }}
                               formatter={tienVn} parser={docTienVn}
                               onChange={(x) => suaDongHang(m.sttLine, { soLuong: x ?? 0 })} />
                ) },
              { title: "Đơn giá", dataIndex: "donGia", width: 120, align: "right",
                render: (v: number, m: HoaDonLine) => (
                  <InputNumber size="small" value={v} controls={false}
                               style={{ width: "100%" }}
                               formatter={tienVn} parser={docTienVn}
                               onChange={(x) => suaDongHang(m.sttLine, { donGia: x ?? 0 })} />
                ) },
               // Để trống thì lấy định khoản chung của hóa đơn (dk.ghiNo/ghiCo) làm
              // giá trị gợi ý — gõ vào là ghi đè riêng cho dòng này.
              { title: "Nợ", dataIndex: "ghiNo", width: 56, align: "center",
                onCell: () => ({ className: "o-giua" }),
                render: (v: string | null, m: HoaDonLine) => (
                  <Input size="small" value={v ?? ""} placeholder={dk.ghiNo}
                         onChange={(e) => suaDongHang(m.sttLine, { ghiNo: e.target.value })} />
                ) },
              { title: "Có", dataIndex: "ghiCo", width: 56, align: "center",
                onCell: () => ({ className: "o-giua" }),
                render: (v: string | null, m: HoaDonLine) => (
                  <Input size="small" value={v ?? ""} placeholder={dk.ghiCo}
                         onChange={(e) => suaDongHang(m.sttLine, { ghiCo: e.target.value })} />
                ) },
              { title: "% VAT", dataIndex: "ptVat", width: 56, align: "center",
                onCell: () => ({ className: "o-giua" }),
                onHeaderCell: () => ({ style: { textAlign: "center" as const } }),
                render: (v: number, m: HoaDonLine) => (
                  <InputNumber size="small" controls={false}
                               style={{ width: "100%" }}
                               value={v > 0 && v <= 1 ? v * 100 : v}
                               onChange={(x) => suaDongHang(m.sttLine, { ptVat: x ?? 0 })} />
                ) },
              { title: "C.Khấu", dataIndex: "tienCk", width: 96, align: "right",
                onHeaderCell: () => ({ style: { textAlign: "center" as const } }),
                render: (v: number, m: HoaDonLine) => (
                  <InputNumber size="small" value={v} controls={false}
                               style={{ width: "100%" }}
                               formatter={tienVn} parser={docTienVn}
                               onChange={(x) => suaDongHang(m.sttLine, { tienCk: x ?? 0 })} />
                ) },  

              { title: "Thành tiền", dataIndex: "thanhTien", width: 140, align: "right",
                render: (v: number) => (
                  <b>{v.toLocaleString("vi-VN",
                      { minimumFractionDigits: 4, maximumFractionDigits: 4 })}</b>
                ) },
              { title: "Ghi chú", dataIndex: "ghiChu", width: 260,
                render: (v: string | null, m: HoaDonLine) => (
                  <Input size="small" value={v ?? ""} placeholder={m.tenHang}
                         title={v || m.tenHang}
                         onChange={(e) => suaDongHang(m.sttLine, { ghiChu: e.target.value })} />
                ) },
            ]}
          />
          </div>

          {/* ===== KHỐI CỘNG TIỀN + NÚT DƯỚI ===== */}
          <div style={{ display: "flex", gap: 12, marginTop: 6 }}>
            {/* ô ghi chú trống bên trái như bản gốc */}
            <Input.TextArea rows={4} style={{ flex: "0 0 230px" }}
                            value={dk.ghiChu}
                            onChange={(e) => suaDk({ ghiChu: e.target.value })} />

            {/* 190 (cột nhãn) + 4 (gap) + 165 (ô số) = 359 */}
            <div className="khoi-cong" style={{ flex: "0 0 359px" }}>
              <div className="hang">
                {oNhan("Cộng tiền hàng", 190)}
                <InputNumber size="small" style={{ width: 165 }} readOnly
                             value={congTienHang} controls={false}
                             formatter={tienVn} />
              </div>
              <div className="hang">
                {oNhan("Chiết khấu", 190)}
                <InputNumber size="small" style={{ width: 165 }} controls={false}
                             value={dk.chietKhau} disabled={!dk.suaTienCk}
                             formatter={tienVn} parser={docTienVn}
                             onChange={(v) => suaDk({ chietKhau: v ?? 0 })} />
                <Checkbox checked={dk.suaTienCk}
                          onChange={(e) => suaDk({ suaTienCk: e.target.checked })}>
                  Sửa tiền CK
                </Checkbox>
              </div>
              <div className="hang">
                <span className="cum-thue-suat">
                  <span className="nhan">Thuế suất</span>
                  <InputNumber size="small" style={{ width: 58 }} controls={false}
                               value={thueSuatHienThi}
                               placeholder="—"
                               // Xóa trắng ô -> null -> quay lại bám theo hóa đơn,
                               // KHÔNG gán 0 (0% là một thuế suất có thật).
                               onChange={(v) => suaDk({ thueSuat: v })} />
                  <span className="nhan">% Tiền VAT</span>
                </span>
                <InputNumber size="small" style={{ width: 165 }} controls={false}
                             value={dk.tienVat} disabled={!dk.suaTienVat}
                             formatter={tienVn} parser={docTienVn}
                             onChange={(v) => suaDk({ tienVat: v ?? 0 })} />
                <Checkbox checked={dk.suaTienVat}
                          onChange={(e) => suaDk({ suaTienVat: e.target.checked })}>
                  Sửa tiền VAT
                </Checkbox>
              </div>
              <div className="hang o-tong-tt">
                {oNhan("Cộng tiền thanh toán", 190)}
                <InputNumber size="small" style={{ width: 165 }} readOnly controls={false}
                             value={congThanhToan} formatter={tienVn} />
              </div>
            </div>

            {/* Cụm GHI NỢ/CÓ CK bên phải */}
            <div style={{ flex: "1 1 auto", minWidth: 0 }}>
              {([
                ["GHI NỢ CK", "ghiNoCk"], ["Mã CT Nợ CK", "maCtNoCk"],
                ["GHI CÓ CK", "ghiCoCk"], ["Mã CT Có CK", "maCtCoCk"],
              ] as [string, keyof DinhKhoan][]).map(([nhan, khoa]) => (
                <div className="hang" key={khoa}>
                  <span className="nhan nhan-do" style={{ width: 96, textAlign: "right" }}>
                    {nhan}
                  </span>
                  {/* Nửa hàng là đủ: bốn ô này chứa số tiền và mã chứng từ ngắn,
                      để flex:1 thì kéo dài hết cột mà phần lớn bỏ trống. */}
                  <Input size="small" style={{ flex: "0 1 50%", minWidth: 150 }}
                         value={String(dk[khoa] ?? "")}
                         onChange={(e) => suaDk({ [khoa]: e.target.value } as Partial<DinhKhoan>)} />
                </div>
              ))}
            </div>
          </div>

          {/* ===== HÀNG NÚT CUỐI ===== */}
          <div className="hang" style={{ marginTop: 8, flexWrap: "wrap", gap: 6 }}>
            {nutChuaNoi("Ghi HĐ cần sửa", "nut-cam")}
            {nutChuaNoi("Sử lý TKHQ", "nut-xanh")}
            {nutChuaNoi("Lấy KM", "nut-cam")}
            {nutChuaNoi("T.Phẩm SX Thêm")}
            {nutChuaNoi("Thành tiền có VAT")}
            {nutChuaNoi("In HĐ GTGT")}
            {nutChuaNoi("Print", "nut-hong")}
            <span style={{ flex: 1 }} />
            {nutChuaNoi("Tạo HĐ Lắp ráp")}
            {nutChuaNoi("Lấy HĐ lỗi")}
          </div>
        </div>

      <DanhSachHoaDon
        mo={moDanhSach}
        onDong={() => setMoDanhSach(false)}
        dsHd={dsHd}
        namLamViec={namLamViec}
        tenDonVi={session?.tenant.name ?? ""}
        laDauRa={laDauRa}
        onChon={chonHoaDon}
        onXemHtml={xemHtml}
        onLamMoi={() => napHoaDon(true)}
        dangTai={tai}
        // Ô tích "So sánh dữ liệu" ở form quyết định danh sách mở ra ở chế độ nào.
        // Đọc tại lúc render nên tích/bỏ tích rồi bấm Tìm lại là đổi ngay, không phải
        // đóng mở lại màn hình.
        soSanh={soSanhDuLieu}
      />

      <HtmlHoaDon
        mo={htmlMaHd != null}
        onDong={() => setHtmlMaHd(null)}
        nhan={htmlMaHd ?? undefined}
        tai={taiHtmlHoaDon}
      />
    </div>
  );
}

// ============ BỘ CHIA: nhìn claim tenant_type để chọn ruột ============
// Hai màn Đầu vào / Đầu ra là CÙNG một màn, chỉ khác hướng — nên chỉ có một chỗ
// sửa khi nghiệp vụ đổi, không có chuyện vá một bên quên bên kia.
export default function HoaDonDauVao({ huongMacDinh = "vao" }: Partial<Props> = {}) {
  const { session } = useAuth();
  return session?.tenant.tenantType === "internal"
    ? <ConsoleLayHoaDon huongMacDinh={huongMacDinh} />
    : <HoaDonCuaDonVi huongMacDinh={huongMacDinh} />;
}
