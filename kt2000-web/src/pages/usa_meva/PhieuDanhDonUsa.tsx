// ============================================================================
// MÀN ĐÁNH ĐƠN — bê từ USA_Meva (frontend/src/pages/SalesOrderPage.tsx, 1903 dòng)
// ============================================================================
//
// Đây là bản BÊ NGUYÊN GIAO DIỆN của USA_Meva sang kt2000, và là màn ĐANG DÙNG THẬT:
// route /app/phieu-xuat và /app/phieu-nhap trỏ thẳng vào đây.
// Bản port cũ (../PhieuXuatNhap.tsx) không còn route nào trỏ tới; giữ file lại vì
// ../GoiHang.tsx còn dùng chung CSS .pxn__ và mẫu in của nó.
//
// CHUYỂN KHUÔN DỮ LIỆU (SPEC mục 4) — chỗ khác bản gốc nhiều nhất:
//   USA_Meva                          NB (kt2000)
//   ------------------------------    ----------------------------------------
//   Delivery (GUID)                   DonNb  -> HOA_DON      (maHd là khóa)
//   DeliveryItem                      DonNbLine -> HOA_DON_LINE
//   Product/Customer (GUID)           DmHangNb/DmKhNb (maHang/maKh dạng chuỗi)
//   deliveryDate                      ngay
//   (không có)                        ngayNh  <- BR-NB-07, mốc TRỪ KHO
//   staffCode (chuỗi tên)             maNvkd  <- DM_KH_NB loaiDt='NV' (BR-NB-01)
//   shipperId (bảng shipper riêng)    maNvvc  <- cũng DM_KH_NB loaiDt='NV'
//   (không có)                        maGoi   <- BR-NB-08
//
// BỎ so với bản gốc, kèm lý do (không phải quên):
//   - Màu/tinh màu (colorId/tintAmount): DM_HANG_NB không có cột màu. USA_Meva bán sơn.
//   - Nhãn hàng (brandId/CompanyBrand): NB là nội bộ MỘT đơn vị, không có nhiều nhãn.
//   - Duyệt/trả lại phiếu (approve/reject): SPEC mục 5 chưa chốt vai trò duyệt cho NB.
//   - VAT gộp toàn phiếu + chiết khấu: NB tính VAT theo TỪNG DÒNG (ptVat trên DonNbLine).
//   - Khuyến mãi F4 (mua tặng): backend NB chưa có bảng khuyến mãi. Cột laHangTang đã
//     có sẵn trên DonNbLine nên khi backend làm tới thì chỉ phải bật lại chỗ này.
//
// GIỮ nguyên nét UX của bản gốc:
//   - Ô gợi ý gõ-tới-đâu-lọc-tới-đó, dropdown portal tự lật lên khi dưới chật
//   - Enter chạy hết một dòng rồi tự đẻ dòng mới; ô cuối mà dòng trống thì bấm Lưu
//   - Focus vào ô là bôi đen sẵn nội dung (gõ đè luôn, không phải xóa)
//   - Nháp tự động + nháp CÓ TÊN (nhiều bản)
//   - Hỏi "dùng lại đơn trước" khi chọn khách quen
//   - Thu gọn khối đầu khi cuộn trên điện thoại
// Cộng thêm luật NB: BR-NB-05 (F9 lưu, ESC bỏ dở, Ctrl+T tra sổ thuế), BR-NB-07.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Card, Row, Col, Space, Button, Tag, Typography, Input, Modal, Tooltip, message,
} from "antd";
import {
  nbTimHang, nbTimKh, nbTimNhan, nbTimMau, nbSoTiep, nbDonGanNhat, nbLayDon, nbLuuDon,
  loiApi,
} from "../../api";
import type {
  DmHangNb, DmKhNb, DmMau, DonNb, HuongDon, LoaiDoiTuong, QuyCachNb,
} from "../../api";
// Không import mẫu in ở đây nữa: form không có nút In (xem khối "IN: không làm ở màn này").
// Hai mẫu vẫn sống và được màn Danh sách phiếu dùng.
import OGoiYUsa, { type LuaChon } from "./OGoiYUsa";
import ONgayUsa from "./ONgayUsa";
import { docNgayUsa, ngayRaChuoiUsa, ngayRaIsoUsa, homNayUsa } from "./ngayThang";
import ChuGiaiPhim from "./ChuGiaiPhim";
import ModalDsNhap from "./ModalDsNhap";
import { ModalHoiDungLai, ModalXemDonTruoc } from "./ModalDonTruoc";
import { themNhap } from "./nhapCoTen";
import { useThuGonKhiCuon } from "./useThuGonKhiCuon";
// Ba modal phụ (thêm hàng / thêm khách / tra sổ thuế) thuần nghiệp vụ NB, không dính gì
// tới giao diện USA_Meva. Bước 2 (rà phần trùng) sẽ gộp chúng với bản trong
// PhieuXuatNhap.tsx thành MỘT file dùng chung — xem ghi chú đầu ModalPhu.tsx.
import ModalPhu from "./ModalPhu";
import "./usa-meva.css";

// ============================ KIỂU DỮ LIỆU TRONG FORM ============================
interface DongHang {
  id: number;              // khóa cục bộ của dòng trên lưới, không liên quan database
  maHang: string | null;
  tenHang: string;
  dvt: string;
  // Quy cách đang chọn (018). Chỉ có giá trị khi người dùng chọn từ danh sách quy cách;
  // mặt hàng chưa khai quy cách thì vẫn gõ tay vào dvt như cũ và ô này để null.
  // Lưu riêng vì dvt là CHỮ hiển thị/in ra phiếu, còn maDvt mới là thứ tra ngược được
  // sang DM_QUY_CACH_NB để lấy hệ số quy đổi.
  maDvt: string | null;
  // Các quy cách bán được của mặt hàng đang chọn. Chép vào STATE của dòng chứ không đọc
  // từ ref hangTheoMa lúc vẽ: ref đổi không kích hoạt render, chọn hàng xong ô ĐVT sẽ
  // còn rỗng tới lần vẽ sau (react-hooks bắt đúng lỗi này).
  cacQuyCach: QuyCachNb[];
  soLuong: number;
  donGia: number;
  ptVat: number;
  ghiChu: string;
  // --- Pha màu (ngành sơn) ---
  // Khách mua thùng sơn TRẮNG rồi chọn màu trong bảng màu giấy, thợ pha theo mã.
  // tienTinhMau là tiền công pha CỦA CẢ DÒNG — cộng thẳng, KHÔNG nhân số lượng.
  maMau: string | null;
  maHex: string | null;    // tô ô chọn màu, không lưu xuống dòng hàng
  tienTinhMau: number;
}

const dongTrong = (id: number): DongHang => ({
  id, maHang: null, tenHang: "", dvt: "", maDvt: null, cacQuyCach: [],
  soLuong: 0, donGia: 0, ptVat: 0, ghiChu: "",
  maMau: null, maHex: null, tienTinhMau: 0,
});

// Tên nhóm màu sang tiếng Việt — bê từ USA_Meva (utils/colorGroupVi.ts).
// DM_MAU lưu nhóm bằng tiếng Anh ("Red", "Pastel") vì nạp từ hệ cũ, nhưng ô chọn màu
// là người Việt dùng. Nhóm lạ (không có trong bảng) thì giữ nguyên, không nuốt mất.
const NHOM_MAU_VI: Record<string, string> = {
  pastel: "Pastel",
  red: "Đỏ",
  grey: "Xám",
  gray: "Xám",
  blue: "Xanh dương",
  brown: "Nâu",
  yellow: "Vàng",
  green: "Xanh lá",
  purple: "Tím",
};

// Backend ghép nhiều nhóm bằng " / " (mã nằm ở hai ngăn bảng màu) -> tách ra dịch
// từng cái rồi ghép lại, chứ tra cả chuỗi "Red / Pastel" thì không khớp khóa nào.
const nhomMauTiengViet = (nhom: string): string =>
  (nhom ?? "")
    .split("/")
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => NHOM_MAU_VI[p.toLowerCase()] ?? p)
    .join(" / ");

// Thành tiền một dòng — MỘT chỗ tính duy nhất, dùng cho cả ô "Thành tiền" trên lưới,
// thanh tổng cộng và payload lưu. Khớp công thức backend (script 019) và bản gốc
// USA_Meva: tiền pha màu cộng thẳng, không nhân số lượng.
const thanhTienDong = (d: DongHang) => d.soLuong * d.donGia + (d.tienTinhMau || 0);

// ============================ QUY CÁCH (018) ============================
// MỘT mặt hàng NHIỀU quy cách: sơn bán cả thùng 18L, hộp 5L lẫn lon 1Kg — mỗi quy cách
// một giá riêng, không suy ra nhau bằng hệ số. Ba hàm dưới là chỗ DUY NHẤT đọc mảng
// quyCach2, để đổi luật chỉ phải sửa một nơi.

// Quy cách mặc định: dòng có laDvtGoc, không có thì lấy dòng đầu (backend đã sắp xếp
// gốc trước, rồi hệ số giảm dần — thùng đứng trên lon).
const quyCachGoc = (h?: DmHangNb | null): QuyCachNb | undefined =>
  h?.quyCach2?.find((q) => q.laDvtGoc) ?? h?.quyCach2?.[0];

// Chữ hiện trong ô ĐVT và IN RA PHIẾU. Ưu tiên tên tắt ("18L") vì lưới hẹp, cột ĐVT chỉ
// rộng 80px — "Thùng 18 lít" vào đó là cụt. Không có tên tắt thì dùng tên đầy đủ.
const nhanQuyCach = (q: QuyCachNb) => q.tenTat || q.tenDvt || q.maDvt;

// Giá của một quy cách. Thứ tự lùi: giá riêng của quy cách -> giá trên danh mục mặt
// hàng -> 0. Phiếu NHẬP lấy giá mua, phiếu XUẤT lấy giá bán (theo ch.giaTuDanhMuc).
const giaTheoQuyCach = (
  h: DmHangNb | undefined | null,
  q: QuyCachNb | undefined | null,
  ch: CauHinh,
): number => {
  const giaRieng = ch.huong === "RA" ? q?.giaBan : q?.giaMua;
  if (giaRieng != null) return Number(giaRieng) || 0;
  return h ? ch.giaTuDanhMuc(h) : 0;
};

// Khuôn một bản nháp (cả tự động lẫn có tên đều dùng khuôn này)
interface BanNhap {
  maHd: string | null;
  ngay: string;
  ngayNh: string;
  maKh: string | null;
  tenKh: string;
  mst: string;
  diaChi: string;
  diaChiGiao: string;
  maNvkd: string | null;
  tenNvkd: string;
  maNvvc: string | null;
  tenNvvc: string;
  ghiChu: string;
  maNhan: string | null;   // nhãn hàng đang lọc/hiện (không lưu xuống đơn)
  dong: DongHang[];
}

// Thứ tự Enter chạy trong một dòng. Dừng ở donGia rồi nhảy dòng mới — %VAT và ghi chú
// là thứ thỉnh thoảng mới sửa, bắt đi qua mỗi dòng là chậm tay người gõ.
//
// maMau/tienTinhMau nằm SAU điểm dừng Enter (giống ptVat/ghiChu) chứ không chen vào
// nhịp gõ: phần lớn dòng hàng bán nguyên trạng, không pha màu. Bắt mọi dòng đi qua hai
// ô đó là chậm tay người gõ đơn thường. Ai cần pha màu thì Tab/chuột sang — và một khi
// đã chọn mã màu thì Enter ở ô đó tự nhảy sang ô tiền tinh màu (xem O_SAU_MAU).
const CAC_O = ["hang", "dvt", "soLuong", "donGia", "maMau", "tienTinhMau",
               "ptVat", "ghiChu"] as const;
type ONhap = typeof CAC_O[number];
const O_ENTER: readonly ONhap[] = CAC_O.slice(0, CAC_O.indexOf("donGia") + 1);

const CAO_DONG = 28;   // khớp .umv__bang td { height: 28px }

const soTien = (n: number) =>
  (Number(n) || 0).toLocaleString("vi-VN", { minimumFractionDigits: 0, maximumFractionDigits: 4 });

// ---------- Nháp TỰ ĐỘNG (một bản, ghi đè liên tục) ----------
// Khóa riêng .usa. để không giẫm lên nháp của PhieuXuatNhap.tsx: hai form khác khuôn
// dòng, đọc nhầm của nhau là ra lưới lệch cột.
const khoaNhap = (h: HuongDon) => `kt2000.nb.usa.nhap.v1.${h}`;

const docNhap = (h: HuongDon): BanNhap | null => {
  try {
    const s = localStorage.getItem(khoaNhap(h));
    return s ? (JSON.parse(s) as BanNhap) : null;
  } catch { return null; }
};
const ghiNhap = (h: HuongDon, d: BanNhap) => {
  try { localStorage.setItem(khoaNhap(h), JSON.stringify(d)); } catch { /* hết chỗ */ }
};
const xoaNhap = (h: HuongDon) => {
  try { localStorage.removeItem(khoaNhap(h)); } catch { /* ignore */ }
};

// ---------- Đọc tiền bằng chữ ----------
const CHU_SO = ["không", "một", "hai", "ba", "bốn", "năm", "sáu", "bảy", "tám", "chín"];

const docBaSo = (n: number, day: boolean): string => {
  const tr = Math.floor(n / 100), ch = Math.floor((n % 100) / 10), dv = n % 10;
  const p: string[] = [];
  if (day || tr > 0) p.push(`${CHU_SO[tr]} trăm`);
  if (ch > 1) {
    p.push(`${CHU_SO[ch]} mươi`);
    if (dv === 1) p.push("mốt"); else if (dv === 5) p.push("lăm"); else if (dv > 0) p.push(CHU_SO[dv]);
  } else if (ch === 1) {
    p.push("mười");
    if (dv === 5) p.push("lăm"); else if (dv > 0) p.push(CHU_SO[dv]);
  } else if (ch === 0 && dv > 0) {
    if (day || tr > 0) p.push("lẻ");
    p.push(CHU_SO[dv]);
  }
  return p.join(" ");
};

const docTien = (n: number): string => {
  const s = Math.floor(Math.abs(n) || 0);
  if (s === 0) return "Không đồng";
  const ty = Math.floor(s / 1_000_000_000);
  const tr = Math.floor((s % 1_000_000_000) / 1_000_000);
  const ng = Math.floor((s % 1_000_000) / 1_000);
  const dv = s % 1000;
  const p: string[] = [];
  if (ty > 0) p.push(`${docBaSo(ty, false)} tỷ`);
  if (tr > 0) p.push(`${docBaSo(tr, ty > 0)} triệu`);
  if (ng > 0) p.push(`${docBaSo(ng, ty > 0 || tr > 0)} nghìn`);
  if (dv > 0) p.push(docBaSo(dv, ty > 0 || tr > 0 || ng > 0));
  const c = p.join(" ").replace(/\s+/g, " ").trim();
  return `${c.charAt(0).toUpperCase()}${c.slice(1)} đồng`;
};

// ============================ CẤU HÌNH HAI HƯỚNG ============================
interface CauHinh {
  huong: HuongDon;                          // RA = đơn giao, VAO = đơn nhập
  tieuDe: string;
  mau: string;
  nhanDoiTac: string;
  nhanNgayNh: string;
  giaTuDanhMuc: (h: DmHangNb) => number;
}

// ============================ THÂN FORM ============================
function DanhDon({ ch }: { ch: CauHinh }) {
  const nhap0 = useMemo(() => docNhap(ch.huong), [ch.huong]);
  const { thuGon, bat: batThuGon, datThuGon, mocRef } = useThuGonKhiCuon();
  const nav = useNavigate();

  const [maHd, setMaHd] = useState<string | null>(nhap0?.maHd ?? null);
  const [soDuKien, setSoDuKien] = useState("");
  const [ngay, setNgay] = useState(nhap0?.ngay ?? homNayUsa());
  const [ngayNh, setNgayNh] = useState(nhap0?.ngayNh ?? "");
  const [maKh, setMaKh] = useState<string | null>(nhap0?.maKh ?? null);
  const [tenKh, setTenKh] = useState(nhap0?.tenKh ?? "");
  const [mst, setMst] = useState(nhap0?.mst ?? "");
  const [diaChi, setDiaChi] = useState(nhap0?.diaChi ?? "");
  const [diaChiGiao, setDiaChiGiao] = useState(nhap0?.diaChiGiao ?? "");
  const [maNvkd, setMaNvkd] = useState<string | null>(nhap0?.maNvkd ?? null);
  const [tenNvkd, setTenNvkd] = useState(nhap0?.tenNvkd ?? "");
  const [maNvvc, setMaNvvc] = useState<string | null>(nhap0?.maNvvc ?? null);
  const [tenNvvc, setTenNvvc] = useState(nhap0?.tenNvvc ?? "");
  const [ghiChu, setGhiChu] = useState(nhap0?.ghiChu ?? "");
  // Nhãn hàng: vừa hiện trên phiếu, vừa LỌC ô khách. Không lưu xuống đơn (HOA_DON chưa
  // có cột) — mở lại đơn thì suy ngược từ nhãn của khách.
  const [maNhan, setMaNhan] = useState<string | null>(nhap0?.maNhan ?? null);
  const [dsNhan, setDsNhan] = useState<LuaChon<string>[]>([]);
  const [dong, setDong] = useState<DongHang[]>(
    nhap0?.dong?.length ? nhap0.dong : [dongTrong(1)]);
  const [dangLuu, setDangLuu] = useState(false);

  const bangRef = useRef<HTMLTableElement>(null);
  const thanLuoiRef = useRef<HTMLDivElement>(null);
  const dongRef = useRef<DongHang[]>([]);
  useEffect(() => { dongRef.current = dong; }, [dong]);

  // ---------- Tự thu gọn khối đầu khi lưới đã dài ----------
  // Bê từ PurchaseOrderPage: gõ quá 8 dòng thì khối thông tin chung (số đơn, ngày,
  // khách, NVKD...) đã xem xong rồi, thu lại nhường chỗ cho lưới hàng.
  // CHỈ TỰ THU MỘT LẦN (daTuThuGon): thu xong người dùng bấm mở lại mà effect cứ đóng
  // đè thì không tài nào mở nổi — lỗi khó chịu nhất của kiểu tự động này.
  const daTuThuGon = useRef(false);
  useEffect(() => {
    if (daTuThuGon.current) return;
    if (dong.length <= 8) return;
    daTuThuGon.current = true;
    datThuGon(true);
  }, [dong.length, datThuGon]);

  // ---------- Kẻ dòng cho kín khung ----------
  // Đo Ô CHỨA chứ không đo khung cuộn: khung cuộn cao theo số dòng mình vừa vẽ ra,
  // đo nó là tự ăn đuôi mình, vẽ bao nhiêu cũng thấy "vừa khít" nên không kẻ thêm bao giờ.
  const [soDongKe, setSoDongKe] = useState(14);
  useEffect(() => {
    const el = thanLuoiRef.current;
    if (!el) return;
    const doLai = () => {
      const cao = el.parentElement?.clientHeight ?? el.clientHeight;
      const caoDau = bangRef.current?.querySelector("thead")?.clientHeight ?? 0;
      setSoDongKe(Math.max(0, Math.floor((cao - caoDau) / CAO_DONG) - 1));
    };
    doLai();
    const ro = new ResizeObserver(doLai);
    if (el.parentElement) ro.observe(el.parentElement);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ---------- Số đơn kế tiếp ----------
  // Chỉ là số DỰ KIẾN cho người dùng biết đơn sắp mang số nào. Số thật do backend cấp
  // trong transaction lúc lưu -> hai người gõ cùng lúc không đụng số nhau.
  const laySoTiep = useCallback(async () => {
    try {
      const r = await nbSoTiep(ch.huong);
      setSoDuKien(r.data.maHd);
    } catch { /* mất mạng — để trống, lưu xong backend tự sinh */ }
  }, [ch.huong]);

  const daXinSo = useRef(false);
  useEffect(() => {
    if (daXinSo.current || nhap0?.maHd) return;
    daXinSo.current = true;
    void laySoTiep();
  }, [nhap0?.maHd, laySoTiep]);

  // ---------- Gom state thành một bản nháp ----------
  const banNhapHienTai = useCallback((): BanNhap => ({
    maHd, ngay, ngayNh, maKh, tenKh, mst, diaChi, diaChiGiao,
    maNvkd, tenNvkd, maNvvc, tenNvvc, ghiChu, maNhan, dong,
  }), [maHd, ngay, ngayNh, maKh, tenKh, mst, diaChi, diaChiGiao,
       maNvkd, tenNvkd, maNvvc, tenNvvc, ghiChu, maNhan, dong]);

  // ---------- Tự lưu nháp ----------
  const napNhap = useRef(banNhapHienTai());
  useEffect(() => { napNhap.current = banNhapHienTai(); }, [banNhapHienTai]);

  useEffect(() => {
    const t = setTimeout(() => {
      if (maKh || dong.some((d) => d.maHang)) ghiNhap(ch.huong, banNhapHienTai());
    }, 400);
    return () => clearTimeout(t);
  }, [ch.huong, banNhapHienTai, maKh, dong]);

  // Đóng tab / chuyển tab: ghi ngay, không chờ hết 400ms hoãn ở trên
  useEffect(() => {
    const day = () => {
      const b = napNhap.current;
      if (b.maKh || b.dong.some((d) => d.maHang)) ghiNhap(ch.huong, b);
    };
    window.addEventListener("pagehide", day);
    document.addEventListener("visibilitychange", day);
    return () => {
      window.removeEventListener("pagehide", day);
      document.removeEventListener("visibilitychange", day);
      day();
    };
  }, [ch.huong]);

  // ---------- Tìm kiếm cho ô gợi ý ----------
  // Nhớ lại mặt hàng vừa tìm: lúc chọn cần cả dvt/giá/%VAT chứ không riêng mã,
  // giữ ở đây khỏi gọi API lần hai cho từng dòng.
  const hangTheoMa = useRef<Map<string, DmHangNb>>(new Map());
  // boQua: OGoiYUsa truyền vào khi cuộn tới đáy để nạp tiếp (cuộn vô tận).
  // 100 dòng/lượt — khớp hằng MOI_LUOT bên OGoiYUsa; lệch thì nó tưởng đã hết danh mục
  // và ngừng nạp sớm.
  const timHang = useCallback(async (tu: string, boQua = 0): Promise<LuaChon<string>[]> => {
    const r = await nbTimHang(tu, 100, boQua);
    r.data.forEach((h) => { if (h.maHang) hangTheoMa.current.set(h.maHang, h); });
    return r.data.filter((h) => h.maHang).map((h) => ({
      giaTri: h.maHang!,
      // Tìm được bằng CẢ HAI tên: người gõ đơn nhớ "nắp trắng", kế toán nhớ tên hóa đơn.
      nhan: `${h.tenHang} ${h.tenHd ?? ""} ${h.maHang ?? ""} ${h.tenTat ?? ""}`,
      nhanHien: h.tenHang,
      // Cột 1 hiện tên hóa đơn khi nó KHÁC tên đánh đơn — để người gõ biết mặt hàng này
      // lên hóa đơn sẽ mang tên gì (35/50 mặt hàng có hai tên khác nhau).
      //
      // KHÔNG hiện cột GIÁ ở đây: giá tự điền vào ô Đơn giá ngay sau khi chọn hàng,
      // nên bày thêm một cột giá trong danh sách chỉ làm dòng chật mà không thêm tin.
      // Bỏ luôn cột đó cho tên hàng rộng ra — tên dài như "Bột bả ngoại thất và nội
      // thất cao cấp" đang bị cắt cụt.
      cot: [
        h.tenHang,
        h.tenHd && h.tenHd !== h.tenHang ? `HĐ: ${h.tenHd}` : "",
        h.dvt ?? "",
      ],
    }));
  }, []);

  // ---------- Bảng màu pha ----------
  // Nhớ lại màu đã thấy để ô chọn màu hiện đúng chấm màu sau khi chọn, và để mở lại đơn
  // cũ vẫn tô được ô (dòng hàng lưu mã màu, mã hex đọc kèm từ backend).
  const mauTheoMa = useRef<Map<string, DmMau>>(new Map());
  const timMau = useCallback(async (tu: string, boQua = 0): Promise<LuaChon<string>[]> => {
    const r = await nbTimMau(tu, 100, boQua);
    r.data.forEach((m) => { if (m.maMau) mauTheoMa.current.set(m.maMau, m); });
    return r.data.filter((m) => m.maMau).map((m) => {
      const nhomVi = nhomMauTiengViet(m.nhomMau);
      return {
        giaTri: m.maMau,
        nhan: `${m.maMau} ${nhomVi} ${m.nhomMau} ${m.ghiChu ?? ""}`,
        nhanHien: m.maMau,
        mau: m.maHex ?? undefined,      // chấm màu bên trái dòng gợi ý
        cot: [m.maMau, m.ghiChu ? `${nhomVi} — ${m.ghiChu}` : nhomVi],
      };
    });
  }, []);

  // BR-NB-01: khách và nhân viên chung MỘT danh mục, lọc bằng loaiDt.
  const khTheoMa = useRef<Map<string, DmKhNb>>(new Map());
  // locNhan: chỉ áp cho ô KHÁCH. Nhân viên (NVKD/NVVC) không thuộc nhãn nào —
  // lọc họ theo nhãn thì combobox rỗng trơn.
  const timTheoLoai = useCallback(
    async (tu: string, loai: LoaiDoiTuong,
           locNhan?: string | null, boQua = 0): Promise<LuaChon<string>[]> => {
      const r = await nbTimKh(tu, loai, 100, locNhan, boQua);
      r.data.forEach((k) => { if (k.maKh) khTheoMa.current.set(k.maKh, k); });
      return r.data.filter((k) => k.maKh).map((k) => ({
        giaTri: k.maKh!,
        nhan: `${k.tenGiaoDich ?? ""} ${k.tenKh} ${k.maKh ?? ""} ${k.tenTat ?? ""} ${k.dienThoai ?? ""}`,
        nhanHien: k.tenGiaoDich || k.tenKh,
        cot: [k.tenGiaoDich || k.tenKh, k.dienThoai ?? "", k.diaChi ?? ""],
      }));
    }, []);

  const timKh = useCallback((tu: string, boQua = 0) =>
    timTheoLoai(tu, "KH", maNhan, boQua), [timTheoLoai, maNhan]);
  const timNv = useCallback((tu: string, boQua = 0) =>
    timTheoLoai(tu, "NV", null, boQua), [timTheoLoai]);

  // ---------- Danh mục nhãn hàng ----------
  // 43 dòng, nạp MỘT lần lúc mở form rồi lọc tại chỗ — gọi lại mỗi lần gõ là phí.
  useEffect(() => {
    let huy = false;
    nbTimNhan()
      .then((r) => {
        if (huy) return;
        setDsNhan([
          // Dòng bỏ lọc, luôn đứng đầu. Mã "" -> onChon nhận chuỗi rỗng, quy về null.
          { giaTri: "", nhan: "tất cả nhãn", nhanHien: "", cot: ["(Tất cả nhãn)", ""], dam: true },
          ...r.data.filter((n) => n.maNhan).map((n) => ({
            giaTri: n.maNhan!,
            nhan: `${n.tenNhan} ${n.maNhan ?? ""} ${n.tenTat ?? ""} ${n.tenCty ?? ""}`,
            nhanHien: n.tenNhan,
            cot: [n.tenNhan, n.tenCty ?? ""],
          })),
        ]);
      })
      .catch(() => { /* chưa có bảng DM_NHAN -> để ô trống, không chặn việc gõ đơn */ });
    return () => { huy = true; };
  }, []);

  // ---------- Điều khiển lưới ----------
  const nhayO = useCallback((idDong: number, o: string) => {
    requestAnimationFrame(() => {
      const oDom = bangRef.current?.querySelector<HTMLElement>(
        `[data-dong="${idDong}"][data-o="${o}"]`);
      const inp = oDom?.querySelector<HTMLInputElement>("input");
      if (!inp) return;

      inp.focus({ preventScroll: true });
      inp.select?.();

      const khung = thanLuoiRef.current;
      if (!khung) return;
      const caoDau = bangRef.current?.querySelector("thead")?.clientHeight ?? 0;
      const oR = oDom!.getBoundingClientRect();
      const kR = khung.getBoundingClientRect();
      if (oR.top < kR.top + caoDau) khung.scrollTop -= (kR.top + caoDau) - oR.top;
      else if (oR.bottom > kR.bottom) khung.scrollTop += oR.bottom - kR.bottom;
    });
  }, []);

  const suaDong = useCallback((id: number, vas: Partial<DongHang>) => {
    setDong((ds) => ds.map((d) => (d.id === id ? { ...d, ...vas } : d)));
  }, []);

  const themDong = useCallback((): number => {
    const idMoi = (dongRef.current.at(-1)?.id ?? 0) + 1;
    setDong((ds) => [...ds, dongTrong((ds.at(-1)?.id ?? 0) + 1)]);
    return idMoi;
  }, []);

  const xoaDong = useCallback((id: number) => {
    setDong((ds) => (ds.length <= 1 ? ds : ds.filter((d) => d.id !== id)));
  }, []);

  // Dòng cuối vừa được điền thì đẻ sẵn dòng trắng phía dưới
  const deSanDongCuoi = useCallback((id: number) => {
    setDong((ds) => (ds.at(-1)?.id !== id ? ds : [...ds, dongTrong((ds.at(-1)?.id ?? 0) + 1)]));
  }, []);

  const luuPhieuRef = useRef<() => void>(() => {});

  const enterQuaO = useCallback((id: number, o: ONhap) => {
    const i = O_ENTER.indexOf(o);
    if (i !== -1 && i < O_ENTER.length - 1) { nhayO(id, O_ENTER[i + 1]); return; }
    setDong((ds) => {
      const cuoi = ds.at(-1)?.id === id;
      const dongNay = ds.find((x) => x.id === id);
      if (cuoi && !dongNay?.maHang) {
        setTimeout(() => luuPhieuRef.current(), 0);
        return ds;
      }
      const kt = cuoi ? [...ds, dongTrong((ds.at(-1)?.id ?? 0) + 1)] : ds;
      const idKe = cuoi
        ? kt.at(-1)!.id
        : ds[ds.findIndex((x) => x.id === id) + 1]?.id ?? id;
      setTimeout(() => nhayO(idKe, "hang"), 0);
      return kt;
    });
  }, [nhayO]);

  // ---------- Tổng tiền ----------
  // Cả hai dòng dưới đi qua thanhTienDong() để tiền pha màu được cộng vào — và để
  // VAT tính trên thành tiền ĐÃ có tiền pha, khớp backend (LuuDon: TienVatL tính từ
  // ThanhTien đã cộng tinh màu). Tính VAT trên phần chưa cộng là lệch thuế.
  const tienHang = useMemo(() => dong.reduce((s, d) => s + thanhTienDong(d), 0), [dong]);
  const tienVat = useMemo(
    () => dong.reduce((s, d) => s + (thanhTienDong(d) * (d.ptVat || 0)) / 100, 0), [dong]);
  const tongTien = tienHang + tienVat;

  // ---------- Đơn trắng ----------
  // NVKD và NHÃN HÀNG giữ nguyên qua các đơn: cả buổi thường là một người gõ và giao
  // một nhãn, xóa đi thì đơn nào cũng phải chọn lại hai ô đó.
  const phieuMoi = useCallback(async () => {
    xoaNhap(ch.huong);
    setMaHd(null);
    setDong([dongTrong(1)]);
    setMaKh(null); setTenKh(""); setMst(""); setDiaChi(""); setDiaChiGiao("");
    setNgay(homNayUsa()); setNgayNh(""); setGhiChu("");
    setMaNvvc(null); setTenNvvc("");
    daHoiDungLai.current.clear();
    await laySoTiep();
    setTimeout(() => {
      document.querySelector<HTMLInputElement>("[data-o-khach] input")?.focus();
    }, 0);
  }, [ch.huong, laySoTiep]);

  const hoiPhieuMoi = useCallback(() => {
    if (!dongRef.current.some((d) => d.maHang) && !maKh) { void phieuMoi(); return; }
    Modal.confirm({
      title: "Lập đơn mới?",
      content: "Nội dung đang nhập sẽ bị xóa.",
      okText: "Tạo mới", cancelText: "Thôi",
      onOk: () => { void phieuMoi(); },
    });
  }, [maKh, phieuMoi]);

  // ---------- Lưu ----------
  const luuPhieu = useCallback(async () => {
    if (!maKh) { message.warning(`Chưa chọn ${ch.nhanDoiTac.toLowerCase()}`); return; }
    const hopLe = dong.filter((d) => d.maHang && d.soLuong > 0);
    if (hopLe.length === 0) { message.warning("Phiếu chưa có dòng hàng nào hợp lệ"); return; }
    const thieuSl = dong.find((d) => d.maHang && !(d.soLuong > 0));
    if (thieuSl) {
      message.error(`Dòng "${thieuSl.tenHang}" chưa nhập số lượng`);
      nhayO(thieuSl.id, "soLuong");
      return;
    }

    const lechMau = hopLe.find((d) => !!d.maMau !== (d.tienTinhMau > 0));
    if (lechMau) {
      message.error(lechMau.maMau
        ? `Dòng "${lechMau.tenHang}": đã chọn mã màu thì phải nhập tiền tinh màu`
        : `Dòng "${lechMau.tenHang}": đã nhập tiền tinh màu thì phải chọn mã màu`);
      nhayO(lechMau.id, lechMau.maMau ? "tienTinhMau" : "maMau");
      return;
    }

    setDangLuu(true);
    try {
      const r = await nbLuuDon(ch.huong, {
        maHd,
        ngay: ngayRaIsoUsa(docNgayUsa(ngay)),
        // BR-NB-07: để trống = hàng CHƯA rời kho, engine chưa trừ tồn.
        // Đơn giao theo gói thì ô này do thao tác XUẤT GÓI đóng dấu hàng loạt (BR-NB-08).
        ngayNh: ngayRaIsoUsa(docNgayUsa(ngayNh)),
        maKh, tenKh, mst, diaChi, diaChiGiao,
        maNvkd, maNvvc, ghiChu,
        lines: hopLe.map((d, i) => ({
          sttLine: i + 1,
          maHang: d.maHang,
          tenHang: d.tenHang,
          dvt: d.dvt,
          soLuong: d.soLuong,
          donGia: d.donGia,
          thanhTien: thanhTienDong(d),
          ptVat: d.ptVat,
          tienVatL: (thanhTienDong(d) * d.ptVat) / 100,
          ghiChu: d.ghiChu || null,
          maMau: d.maMau,
          tienTinhMau: d.tienTinhMau || 0,
          maHex: null,             // chỉ ĐỌC RA, backend không ghi xuống

          // v1 chưa quy đổi đơn vị (ngoài phạm vi, SPEC mục 1) -> hệ số luôn 1
          heSoQd: 1,
          slQuyDoi: d.soLuong,
          laHangTang: false,
          quyCach: null,
          ngayNhL: null,
        })),
      });
      const dangSua = !!maHd;
      message.success(`${dangSua ? "Đã cập nhật" : "Đã lưu"} đơn ${r.data.maHd}`);
      await phieuMoi();
      // SỬA đơn cũ (mở từ Danh sách phiếu) -> trả người dùng về chỗ họ đi ra, tô sáng
      // đơn vừa sửa. TẠO MỚI thì ở lại form: cả buổi gõ hết đơn này tới đơn khác,
      // đá về danh sách sau mỗi lần lưu là phá nhịp gõ liên tục (BR-NB-05).
      if (dangSua) {
        nav("/app/danh-sach-phieu", { state: { maHdVuaLuu: r.data.maHd } });
      }
    } catch (e) {
      message.error(loiApi(e, "Không lưu được đơn"));
    } finally {
      setDangLuu(false);
    }
  }, [ch, maHd, ngay, ngayNh, maKh, tenKh, mst, diaChi, diaChiGiao, maNvkd, maNvvc,
      ghiChu, dong, nhayO, phieuMoi, nav]);

  useEffect(() => { luuPhieuRef.current = () => { if (!dangLuu) void luuPhieu(); }; },
            [luuPhieu, dangLuu]);

  // ---------- Mở lại một đơn đã lưu ----------
  const dungLaiDong = (d: DonNb): DongHang[] =>
    d.lines.length
      ? d.lines.map((l, i) => ({
          id: i + 1,
          maHang: l.maHang,
          tenHang: l.tenHang ?? "",
          dvt: l.dvt ?? "",
          // Đơn đã lưu chỉ mang dvt dạng CHỮ (HOA_DON_LINE không có cột mã ĐVT), nên mở
          // lại thì chưa biết nó ứng với quy cách nào. Để null: dòng vẫn sửa/lưu bình
          // thường, chỉ là chưa gắn quy cách cho tới khi người dùng chọn lại ô ĐVT.
          maDvt: null,
          // Đơn cũ mở lên chưa biết mặt hàng có những quy cách nào (chưa gọi tìm hàng).
          // Để rỗng -> ô ĐVT hiện dạng gõ tay, giữ nguyên chữ đã lưu; muốn đổi quy cách
          // thì chọn lại mặt hàng, lúc đó danh sách mới nạp về.
          cacQuyCach: [],
          soLuong: Number(l.soLuong) || 0,
          donGia: Number(l.donGia) || 0,
          ptVat: Number(l.ptVat) || 0,
          ghiChu: l.ghiChu ?? "",
          maMau: l.maMau,
          maHex: l.maHex,
          tienTinhMau: Number(l.tienTinhMau) || 0,
        }))
      : [dongTrong(1)];

  const moPhieu = useCallback(async (ma: string) => {
    try {
      const r = await nbLayDon(ma);
      const d = r.data;
      setMaHd(d.maHd);
      setNgay(d.ngay ? ngayRaChuoiUsa(new Date(d.ngay)) : homNayUsa());
      setNgayNh(d.ngayNh ? ngayRaChuoiUsa(new Date(d.ngayNh)) : "");
      setMaKh(d.maKh); setTenKh(d.tenKh ?? "");
      setMst(d.mst ?? ""); setDiaChi(d.diaChi ?? "");
      setDiaChiGiao(d.diaChiGiao ?? "");
      setMaNvkd(d.maNvkd); setTenNvkd(d.tenNvkd ?? "");
      setMaNvvc(d.maNvvc); setTenNvvc(d.tenNvvc ?? "");
      setGhiChu(d.ghiChu ?? "");
      setDong(dungLaiDong(d));
      // Nhãn KHÔNG lưu xuống đơn (HOA_DON chưa có cột) -> suy ngược từ nhãn của khách.
      // Hệ quả phải biết: khách đổi nhãn về sau thì đơn CŨ mở ra mang nhãn MỚI.
      // Muốn tờ in luôn đúng nhãn lúc bán thì phải thêm cột ma_nhan vào HOA_DON.
      if (d.maKh) {
        const k = khTheoMa.current.get(d.maKh);
        if (k?.maNhan) setMaNhan(k.maNhan);
        else {
          // Chưa có trong bộ nhớ (mở thẳng bằng ?maHd= chứ không qua combobox)
          // -> hỏi backend đúng một khách này.
          nbTimKh(d.maKh, "KH", 1)
            .then((r) => {
              const kh = r.data.find((x) => x.maKh === d.maKh);
              if (kh?.maKh) khTheoMa.current.set(kh.maKh, kh);
              if (kh?.maNhan) setMaNhan(kh.maNhan);
            })
            .catch(() => { /* không tra được thì để trống ô nhãn */ });
        }
      }
      // BR-NB-08: đơn đã vào gói chốt thì backend chặn lưu — báo trước để người dùng
      // khỏi gõ xong mới biết; muốn sửa phải ra màn Gói rút đơn ra.
      if (d.maGoi) message.warning(`Đơn ${ma} đang thuộc gói ${d.maGoi}`);
      else message.success(`Đã mở đơn ${ma}`);
    } catch (e) {
      message.error(loiApi(e, "Không mở được đơn"));
    }
  }, []);

  // Màn Danh sách phiếu bấm "Mở" thì nhảy sang đây kèm ?maHd=R125.
  // Chỉ nạp MỘT lần cho mỗi mã: nạp lại sau khi người dùng đã gõ dở là xóa mất công họ.
  const [thamSo, datThamSo] = useSearchParams();
  const daMoUrl = useRef<string | null>(null);
  useEffect(() => {
    const ma = thamSo.get("maHd");
    if (!ma || daMoUrl.current === ma) return;
    daMoUrl.current = ma;
    void moPhieu(ma);
    // Dọn tham số: để nguyên thì bấm "Tạo mới" xong F5 lại lôi đơn cũ lên
    datThamSo({}, { replace: true });
  }, [thamSo, datThamSo, moPhieu]);

  // ---------- Gợi ý DÙNG LẠI ĐƠN TRƯỚC ----------
  // Chọn khách quen -> hỏi có chép lại đơn lần trước không. Khách tuần nào cũng lấy gần
  // đúng một giỏ hàng, gõ lại 15 dòng mỗi lần là việc thừa.
  // Chỉ hỏi khi phiếu còn TRẮNG và mỗi khách hỏi một lần trong phiên — hỏi lại giữa lúc
  // đang gõ dở thì phiền hơn là giúp.
  const [donTruoc, setDonTruoc] = useState<DonNb | null>(null);
  const [hoiMo, setHoiMo] = useState(false);
  const [xemMo, setXemMo] = useState(false);
  const daHoiDungLai = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!maKh || maHd) return;
    if (daHoiDungLai.current.has(maKh)) return;
    if (dong.some((d) => d.maHang)) return;
    daHoiDungLai.current.add(maKh);
    let huy = false;
    // Lọc theo maKh làm ở BACKEND (endpoint riêng, trả kèm dòng hàng): tham số `tu`
    // của nbDanhSachDon chỉ tìm trong ma_hd và ten_kh, gửi mã khách vào đó sẽ ra rỗng
    // hoặc trúng nhầm đơn của khách khác có tên chứa đúng chuỗi đó.
    nbDonGanNhat(ch.huong, maKh)
      .then((d) => {
        if (huy || !d) return;   // khách mới chưa mua bao giờ -> im lặng, không hỏi
        setDonTruoc(d);
        setHoiMo(true);
      })
      .catch(() => { /* mất mạng -> bỏ qua, không chặn việc gõ đơn */ });
    return () => { huy = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maKh, maHd, ch.huong]);

  const chepDonTruoc = useCallback(() => {
    setHoiMo(false); setXemMo(false);
    const d = donTruoc;
    if (!d) return;
    const ds = dungLaiDong(d);
    // Chỉ chép RUỘT. Số đơn và ngày vẫn của phiếu mới — chép cả số đơn thì thành sửa
    // đè lên đơn cũ. ngayNh cũng không chép: mốc rời kho chuyến trước không nói gì về
    // chuyến này (BR-NB-07).
    setDong([...ds, dongTrong((ds.at(-1)?.id ?? 0) + 1)]);
    if (d.maNvvc) { setMaNvvc(d.maNvvc); setTenNvvc(d.tenNvvc ?? ""); }
    setTimeout(() => nhayO(ds.at(-1)!.id + 1, "hang"), 0);
    message.success(`Đã chép ${ds.length} dòng từ đơn ${d.maHd} — số đơn và ngày vẫn là của phiếu mới`);
  }, [donTruoc, nhayO]);

  // ---------- Nháp có tên ----------
  const [dsNhapMo, setDsNhapMo] = useState(false);

  const luuNhapCoTen = useCallback(() => {
    const b = napNhap.current;
    if (!b.maKh && !b.dong.some((d) => d.maHang)) {
      message.info("Phiếu còn trắng, chưa có gì để lưu nháp");
      return;
    }
    const nay = new Date();
    const p = (n: number) => String(n).padStart(2, "0");
    const goiY = [
      b.tenKh || "Chưa chọn khách",
      `${b.dong.filter((d) => d.maHang).length} mặt hàng`,
      `${p(nay.getHours())}:${p(nay.getMinutes())} ${p(nay.getDate())}/${p(nay.getMonth() + 1)}`,
    ].join(" · ");
    let ten = goiY;
    Modal.confirm({
      title: "Lưu nháp",
      content: (
        <Input defaultValue={goiY} autoFocus placeholder="Tên bản nháp"
               onChange={(e) => { ten = e.target.value; }} />
      ),
      okText: "Lưu nháp", cancelText: "Thôi",
      onOk: async () => {
        themNhap<BanNhap>(ch.huong, ten, b, nay.getTime());
        message.success("Đã lưu bản nháp, mở phiếu mới");
        await phieuMoi();
      },
    });
  }, [ch.huong, phieuMoi]);

  const moBanNhap = useCallback((b: BanNhap) => {
    setMaHd(null);              // nháp luôn là phiếu MỚI, không phải sửa đơn cũ
    setNgay(b.ngay || homNayUsa());
    setNgayNh(b.ngayNh ?? "");
    setMaKh(b.maKh ?? null); setTenKh(b.tenKh ?? "");
    setMst(b.mst ?? ""); setDiaChi(b.diaChi ?? "");
    setDiaChiGiao(b.diaChiGiao ?? "");
    setMaNvkd(b.maNvkd ?? null); setTenNvkd(b.tenNvkd ?? "");
    setMaNvvc(b.maNvvc ?? null); setTenNvvc(b.tenNvvc ?? "");
    setGhiChu(b.ghiChu ?? "");
    setMaNhan(b.maNhan ?? null);
    setDong(b.dong?.length ? b.dong : [dongTrong(1)]);
    // Nháp mở lên là phiếu mới -> đừng hỏi "dùng lại đơn trước" đè lên nội dung vừa mở
    if (b.maKh) daHoiDungLai.current.add(b.maKh);
    message.success("Đã mở bản nháp");
  }, []);

  // ---------- IN: không làm ở màn này ----------
  // Bỏ hai nút In khỏi form (08/08). Lý do: form chỉ có đơn ĐANG GÕ, mà đơn chưa lưu
  // thì chưa có số chính thức (backend cấp số trong transaction lúc lưu) — nên hai nút
  // luôn mờ, chiếm chỗ mà gần như không bấm được.
  // In nay làm ở màn DANH SÁCH PHIẾU: mọi đơn ở đó đều đã lưu, lại in được hàng loạt
  // cho cả chuyến xe. Hai mẫu in vẫn còn nguyên (../mauInPhieu.ts và ./mauInHaiLien.ts).

  // ---------- Focus vào ô là bôi đen sẵn ----------
  // Nét của bản gốc: nhảy tới ô nào thì gõ đè luôn, không phải xóa nội dung cũ trước.
  useEffect(() => {
    const boiDen = (e: FocusEvent) => {
      const el = e.target as HTMLElement;
      if (el instanceof HTMLInputElement && el.type !== "checkbox" && el.type !== "radio"
          && !el.readOnly && !el.disabled) el.select();
    };
    document.addEventListener("focusin", boiDen);
    return () => document.removeEventListener("focusin", boiDen);
  }, []);

  // ---------- Phím tắt toàn form (BR-NB-05) ----------
  const [themHang, setThemHang] = useState<{ dongId: number; ten: string } | null>(null);
  const [themKh, setThemKh] = useState<{ ten: string } | null>(null);
  const [traThue, setTraThue] = useState<{ dongId: number; ten: string } | null>(null);

  useEffect(() => {
    const bat = (e: KeyboardEvent) => {
      // F9 / Ctrl+S — lưu
      if (e.key === "F9" || (e.ctrlKey && e.key.toLowerCase() === "s")) {
        e.preventDefault();
        if (!dangLuu) void luuPhieu();
        return;
      }
      if (e.key === "Insert") {
        e.preventDefault();
        const id = themDong();
        setTimeout(() => nhayO(id, "hang"), 0);
        return;
      }
      if (e.key === "F2") {
        const el = document.activeElement as HTMLElement | null;
        if (!el) return;
        const oDong = el.closest<HTMLElement>("[data-dong][data-o]");
        if (oDong?.getAttribute("data-o") === "hang") {
          e.preventDefault();
          setThemHang({ dongId: Number(oDong.getAttribute("data-dong")),
                        ten: (el as HTMLInputElement).value ?? "" });
          return;
        }
        if (el.closest("[data-o-khach]")) {
          e.preventDefault();
          setThemKh({ ten: (el as HTMLInputElement).value ?? "" });
        }
        return;
      }
      // F6 — TRẢ DÒNG VỀ ĐƠN VỊ & GIÁ GỐC TRONG DANH MỤC.
      // Bê từ PurchaseOrderPage (phím riêng của phiếu nhập, không có bên phiếu bán).
      // Dùng khi gõ nhầm ĐVT hoặc sửa giá lung tung rồi muốn quay về mốc chuẩn.
      //
      // Nay một mặt hàng CÓ THỂ có nhiều quy cách (018 — DM_QUY_CACH_NB), nên F6 trả
      // dòng về QUY CÁCH GỐC + giá của quy cách đó, không còn về cột dvt phẳng.
      if (e.key === "F6") {
        const el = document.activeElement as HTMLElement | null;
        const oDong = el?.closest<HTMLElement>("[data-dong][data-o]");
        if (!oDong) return;
        e.preventDefault();
        const idDong = Number(oDong.getAttribute("data-dong"));
        const d = dongRef.current.find((x) => x.id === idDong);
        if (!d?.maHang) { message.info("Dòng này chưa chọn mặt hàng"); return; }
        const h = hangTheoMa.current.get(d.maHang);
        if (!h) { message.info("Chưa có thông tin mặt hàng để lấy lại"); return; }
        // Trả về QUY CÁCH GỐC (018) chứ không còn về dvt phẳng: nay một mặt hàng có thể
        // có ba quy cách, "giá gốc" phải là giá của quy cách mặc định.
        const qcGoc = quyCachGoc(h);
        const dvtVe = qcGoc ? nhanQuyCach(qcGoc) : (h.dvt ?? "");
        const giaVe = giaTheoQuyCach(h, qcGoc, ch);
        suaDong(idDong, {
          dvt: dvtVe,
          maDvt: qcGoc?.maDvt ?? null,
          cacQuyCach: h.quyCach2 ?? [],
          donGia: giaVe,
          ptVat: h.ptVat != null ? Number(h.ptVat) : d.ptVat,
        });
        message.success(`Đã lấy lại đơn vị & giá gốc: ${dvtVe || "-"} — ${soTien(giaVe)}`);
        return;
      }
      // Ctrl+T — tra tên hàng bên sổ thuế (BR-NB-03). Chỉ có nghĩa khi con trỏ ở ô hàng:
      // đây là cách tìm hàng CHƯA có trong danh mục NB; chọn xong sẽ CHÉP về (BR-NB-02).
      if (e.ctrlKey && e.key.toLowerCase() === "t") {
        const el = document.activeElement as HTMLElement | null;
        const oDong = el?.closest<HTMLElement>("[data-dong][data-o]");
        if (oDong?.getAttribute("data-o") === "hang") {
          e.preventDefault();
          setTraThue({ dongId: Number(oDong.getAttribute("data-dong")),
                       ten: (el as HTMLInputElement).value ?? "" });
        }
        return;
      }
      if (e.key === "Escape") {
        // ESC khi đang có danh sách gợi ý / modal mở = việc của chúng, không phải bỏ phiếu
        if (document.querySelector(".umv-drop")) return;
        if (document.querySelector(".ant-modal-wrap")) return;
        e.preventDefault();
        hoiPhieuMoi();
      }
    };
    document.addEventListener("keydown", bat, true);
    return () => document.removeEventListener("keydown", bat, true);
    // suaDong + ch cho F6. Đọc dòng qua dongRef nên không cần `dong` trong deps —
    // để `dong` vào đây là gỡ/gắn lại listener sau MỖI ký tự gõ vào lưới.
  }, [dangLuu, luuPhieu, themDong, nhayO, hoiPhieuMoi, suaDong, ch]);

  // ============================ GIAO DIỆN ============================
  return (
    <div className={`umv${thuGon ? " umv--thu-gon" : ""}`}>
      <div ref={mocRef} aria-hidden />

      {/* ---------- Khối thông tin chung ---------- */}
      <Card
        size="small"
        className="umv__info"
        style={{ borderTop: `4px solid ${ch.mau}` }}
        title={
          <Space size={8} className="umv__info-tieu-de" onClick={batThuGon}>
            <Typography.Text strong style={{ fontSize: 19, color: ch.mau, letterSpacing: 0.4 }}>
              {ch.tieuDe}
            </Typography.Text>
            {maHd && <Tag color="warning">ĐANG SỬA {maHd}</Tag>}
          </Space>
        }
        extra={
          <Space size={8} wrap>
            {/* moTa KHÔNG lặp lại tên phím: nó đã hiện trong ô kbd bên trái rồi */}
            <ChuGiaiPhim cac={[
              { phim: "Enter",  nhan: "Ô kế",        moTa: "Sang ô kế tiếp; ở cuối dòng thì thêm dòng mới" },
              { phim: "Insert", nhan: "Thêm dòng",   moTa: "Thêm một dòng hàng" },
              { phim: "F2",     nhan: "Thêm mới",    moTa: "Thêm nhanh mặt hàng / khách theo ô đang đứng" },
              { phim: "F6",     nhan: "Giá gốc",     moTa: "Trả dòng hiện tại về đơn vị & giá gốc trong danh mục" },
              { phim: "Ctrl+T", nhan: "Tra sổ thuế", moTa: "Tra tên hàng bên sổ thuế (khi con trỏ ở ô hàng)" },
              { phim: "F9",     nhan: "Lưu",         moTa: "Lưu đơn (hoặc Ctrl+S)" },
              { phim: "ESC",    nhan: "Bỏ dở",       moTa: "Bỏ dở, lập đơn trắng" },
            ]} />
            <Button size="small" onClick={() => setDsNhapMo(true)}>Mở nháp</Button>
          </Space>
        }
        styles={{ body: { padding: "10px 14px 12px" } }}
      >
        <div className="umv__info-than">
          <Row gutter={[10, 6]}>
            <Col xs={24} sm={8} md={4}>
              {/* Số đơn do backend cấp (chốt 9.7) — hiện để biết, không gõ tay được:
                  sửa tay sẽ đụng khóa chính của HOA_DON. */}
              <div className="umv__nhan">Mã đơn{maHd ? "" : " (dự kiến)"}</div>
              <Input size="small" readOnly value={maHd ?? soDuKien}
                     style={{ fontFamily: "ui-monospace, Consolas, monospace",
                              fontWeight: 600, color: maHd ? undefined : "#8c8c8c" }} />
            </Col>
            <Col xs={12} sm={8} md={3}>
              <div className="umv__nhan">Ngày</div>
              <ONgayUsa giaTri={ngay} onDoi={setNgay} />
            </Col>
            <Col xs={12} sm={8} md={4}>
              {/* BR-NB-07: mốc TRỪ KHO. Để trống = hàng chưa rời kho. */}
              <div className="umv__nhan">
                <Tooltip title="Ngày hàng thật sự rời kho. Để trống nếu chưa giao — kho chưa bị trừ.">
                  <span style={{ cursor: "help" }}>{ch.nhanNgayNh}</span>
                </Tooltip>
              </div>
              <ONgayUsa giaTri={ngayNh} onDoi={setNgayNh} />
            </Col>
            <Col xs={12} sm={12} md={6}>
              <div className="umv__nhan">NV kinh doanh</div>
              <OGoiYUsa
                giaTri={maNvkd}
                layNhan={() => tenNvkd}
                timKiem={timNv}
                kieuCot="kh"
                goiY="Chọn nhân viên"
                onChon={(v) => {
                  if (!v) { setMaNvkd(null); setTenNvkd(""); return; }
                  setMaNvkd(v);
                  setTenNvkd(khTheoMa.current.get(v)?.tenKh ?? "");
                }}
              />
            </Col>
            <Col xs={12} sm={12} md={7}>
              <div className="umv__nhan">NV vận chuyển</div>
              <OGoiYUsa
                giaTri={maNvvc}
                layNhan={() => tenNvvc}
                timKiem={timNv}
                kieuCot="kh"
                goiY="Chọn người giao hàng"
                onChon={(v) => {
                  if (!v) { setMaNvvc(null); setTenNvvc(""); return; }
                  setMaNvvc(v);
                  setTenNvvc(khTheoMa.current.get(v)?.tenKh ?? "");
                }}
              />
            </Col>
          </Row>

          <div className="umv__gach" />

          <Row gutter={[10, 6]}>
            {/* Nhãn hàng đứng TRƯỚC ô khách vì nó LỌC ô khách: 1600+ đại lý, chọn nhãn
                trước thì danh sách còn vài chục dòng. Bỏ trống = tìm trong tất cả. */}
            <Col xs={12} md={3}>
              <div className="umv__nhan">Nhãn hàng</div>
              <OGoiYUsa
                giaTri={maNhan}
                // Ô hẹp cho gọn hàng, nhưng danh sách xổ xuống vẫn rộng để đọc được
                // cả tên nhãn lẫn tên công ty (rongToiThieu ghi đè bề rộng ô).
                rongToiThieu={420}
                // Thêm dòng "(Tất cả nhãn)" ở ĐẦU để bỏ lọc quay về xem hết khách.
                // Không có nó thì lỡ chọn nhãn là kẹt: xóa chữ trong ô chỉ mở lại
                // danh sách chứ không bỏ được lọc.
                cac={dsNhan}
                layNhan={(v) => dsNhan.find((x) => x.giaTri === v)?.nhanHien}
                goiY="Tất cả nhãn"
                onChon={(vRaw) => {
                  // Dòng "(Tất cả nhãn)" mang mã rỗng -> quy về null = không lọc
                  const v = vRaw || null;
                  setMaNhan(v);
                  // Đổi nhãn mà khách đang chọn không thuộc nhãn mới -> bỏ chọn khách,
                  // không thì phiếu mang khách của nhãn cũ mà ô nhãn ghi nhãn mới.
                  if (v && maKh && khTheoMa.current.get(maKh)?.maNhan !== v) {
                    setMaKh(null); setTenKh(""); setMst(""); setDiaChi(""); setDiaChiGiao("");
                  }
                }}
              />
            </Col>
            <Col xs={24} md={5} data-o-khach>
              <div className="umv__nhan">{ch.nhanDoiTac}</div>
              <OGoiYUsa
                giaTri={maKh}
                layNhan={() => tenKh}
                timKiem={timKh}
                kieuCot="kh"
                // Ô hẹp nhưng dropdown rộng 640px: phải đủ chỗ cho 3 cột
                // (tên | điện thoại | địa chỉ) mới phân biệt được khách trùng tên.
                rongToiThieu={640}
                goiY={`Gõ tên ${ch.nhanDoiTac.toLowerCase()} để tìm — F2 thêm mới`}
                onChon={(v) => {
                  if (!v) {
                    setMaKh(null); setTenKh(""); setMst("");
                    setDiaChi(""); setDiaChiGiao("");
                    return;
                  }
                  const k = khTheoMa.current.get(v);
                  setMaKh(v);
                  setTenKh(k?.tenGiaoDich || k?.tenKh || "");
                  setMst(k?.mst ?? "");
                  // HAI địa chỉ tách bạch, không dồn vào một ô: cửa hàng là nơi khách
                  // đặt hàng (lên giấy tờ), địa chỉ giao là nơi xe chở tới.
                  setDiaChi(k?.diaChi ?? "");
                  setDiaChiGiao(k?.diaChiGiao ?? "");
                  // Chọn khách khi CHƯA lọc nhãn -> điền nhãn của khách đó vào ô,
                  // để tờ in có nhãn mà người dùng không phải chọn hai lần.
                  if (!maNhan && k?.maNhan) setMaNhan(k.maNhan);
                }}
                onGoTuDo={(chu) => setThemKh({ ten: chu })}
                onXong={() => {
                  const id = dongRef.current[0]?.id;
                  if (id != null) nhayO(id, "hang");
                }}
              />
            </Col>
            <Col xs={12} md={2}>
              <div className="umv__nhan">MST</div>
              <Input size="small" value={mst} onChange={(e) => setMst(e.target.value)} />
            </Col>
            {/* HAI địa chỉ như form gốc: cửa hàng là nơi khách đặt hàng (lên giấy tờ),
                địa chỉ giao là nơi xe chở tới — hai chỗ này được phép khác nhau. */}
            <Col xs={12} md={5}>
              <div className="umv__nhan">Địa chỉ cửa hàng</div>
              <Input size="small" value={diaChi} onChange={(e) => setDiaChi(e.target.value)} />
            </Col>
            <Col xs={12} md={5}>
              <div className="umv__nhan">
                <Tooltip title="Nơi xe chở hàng tới. Để trống = giao đúng địa chỉ cửa hàng.">
                  <span style={{ cursor: "help" }}>Địa chỉ giao hàng</span>
                </Tooltip>
              </div>
              <Input size="small" value={diaChiGiao}
                     onChange={(e) => setDiaChiGiao(e.target.value)} />
            </Col>
            <Col xs={24} md={4}>
              <div className="umv__nhan">Ghi chú</div>
              <Input size="small" value={ghiChu} onChange={(e) => setGhiChu(e.target.value)} />
            </Col>
          </Row>
        </div>
      </Card>

      {/* ---------- Lưới hàng hóa ---------- */}
      <Card
        type="inner"
        size="small"
        className="umv__luoi-card"
        title="Chi tiết hàng hóa"
        extra={
          <Button size="small"
                  onClick={() => { const id = themDong(); setTimeout(() => nhayO(id, "hang"), 0); }}>
            Thêm dòng (Insert)
          </Button>
        }
        styles={{ body: { padding: 0 } }}
      >
        <div className="umv__luoi-body" ref={thanLuoiRef}>
          <table className="umv__bang" ref={bangRef}>
            <thead>
              <tr>
                <th style={{ width: 42 }} className="umv__cot-stt">STT</th>
                <th>Tên hàng hóa</th>
                <th style={{ width: 80 }}>ĐVT</th>
                <th style={{ width: 90 }}>Số lượng</th>
                <th style={{ width: 110 }}>Đơn giá</th>
                <th style={{ width: 120 }}>Mã màu</th>
                <th style={{ width: 110 }}>Tiền tinh màu</th>
                <th style={{ width: 120 }}>Thành tiền</th>
                <th style={{ width: 70 }}>%VAT</th>
                <th style={{ width: 150 }}>Ghi chú</th>
                <th style={{ width: 44 }} className="umv__cot-xoa" />
              </tr>
            </thead>
            <tbody>
              {dong.map((d, i) => (
                <tr key={d.id}>
                  <td className="umv__c umv__cot-stt"><b>{i + 1}</b></td>
                  <td data-dong={d.id} data-o="hang">
                    <OGoiYUsa
                      giaTri={d.maHang}
                      layNhan={() => d.tenHang}
                      timKiem={timHang}
                      goiY="Gõ tên hàng — F2 thêm mới, Ctrl+T tra sổ thuế"
                      kieuCot="hh3"
                      rongToiThieu={620}
                      onChon={(v) => {
                        if (!v) {
                          suaDong(d.id, {
                            maHang: null, tenHang: "", dvt: "", maDvt: null, cacQuyCach: [],
                          });
                          return;
                        }
                        const h = hangTheoMa.current.get(v);
                        // Điền sẵn theo QUY CÁCH GỐC của mặt hàng (018) — giống USA_Meva:
                        // chọn hàng xong là ĐVT + giá của quy cách mặc định đã nằm sẵn,
                        // người bán chỉ đổi khi khách lấy quy cách khác.
                        // Mặt hàng chưa khai quy cách thì lùi về dvt/giá trên danh mục.
                        const qcGoc = quyCachGoc(h);
                        suaDong(d.id, {
                          maHang: v,
                          tenHang: h?.tenHang ?? "",
                          dvt: qcGoc ? nhanQuyCach(qcGoc) : (h?.dvt ?? ""),
                          maDvt: qcGoc?.maDvt ?? null,
                          cacQuyCach: h?.quyCach2 ?? [],
                          donGia: giaTheoQuyCach(h, qcGoc, ch),
                          ptVat: h?.ptVat != null ? Number(h.ptVat) : d.ptVat,
                        });
                        deSanDongCuoi(d.id);
                        nhayO(d.id, "dvt");
                      }}
                      onGoTuDo={(chu) => setThemHang({ dongId: d.id, ten: chu })}
                      onXong={() => enterQuaO(d.id, "hang")}
                    />
                  </td>
                  {/* Ô ĐVT = CHỌN QUY CÁCH (018), theo đúng lối USA_Meva.
                      Mặt hàng có khai quy cách thì xổ danh sách (thùng 18L / hộp 5L /
                      lon 1Kg), đổi quy cách là ĐƠN GIÁ TỰ NHẢY theo bảng giá của quy
                      cách đó — trước đây ô này gõ chữ tự do nên giá phải sửa tay, quên
                      là xuất thùng mà tính tiền lon.
                      Mặt hàng CHƯA khai quy cách vẫn giữ ô gõ tay như cũ, không ép
                      người dùng phải khai danh mục mới đánh được đơn. */}
                  <td data-dong={d.id} data-o="dvt">
                    {d.cacQuyCach.length === 0 ? (
                      <input className="umv__o" value={d.dvt}
                             onChange={(e) => suaDong(d.id, { dvt: e.target.value })}
                             onKeyDown={(e) => {
                               if (e.key === "Enter") { e.preventDefault(); enterQuaO(d.id, "dvt"); }
                             }} />
                    ) : (
                        <OGoiYUsa
                          giaTri={d.maDvt}
                          cac={d.cacQuyCach.map((q) => ({
                            giaTri: q.maDvt,
                            // Tìm được bằng cả tên tắt lẫn tên đầy đủ: người bán gõ "18L",
                            // người mới gõ "thùng".
                            nhan: `${q.tenTat ?? ""} ${q.tenDvt ?? ""} ${q.maDvt}`,
                            nhanHien: nhanQuyCach(q),
                            // Hiện kèm giá để chọn đúng quy cách khách hỏi mà không phải
                            // chọn thử rồi nhìn ô Đơn giá.
                            cot: [
                              nhanQuyCach(q),
                              q.tenDvt && q.tenDvt !== nhanQuyCach(q) ? q.tenDvt : "",
                              // Giá RIÊNG của quy cách; chưa khai thì lùi về giá danh mục
                              // (giaTheoQuyCach lo phần đó, ở đây không cần bản ghi hàng).
                              soTien(giaTheoQuyCach(null, q, ch)),
                            ],
                          }))}
                          layNhan={() => d.dvt}
                          goiY="ĐVT"
                          rongToiThieu={320}
                          onChon={(v) => {
                            if (!v) { suaDong(d.id, { maDvt: null }); return; }
                            const q = d.cacQuyCach.find((x) => x.maDvt === v);
                            if (!q) return;
                            suaDong(d.id, {
                              maDvt: q.maDvt,
                              dvt: nhanQuyCach(q),
                              // Đổi quy cách -> ĐƠN GIÁ TỰ NHẢY. Đây là điểm chính của
                              // cả thay đổi này: trước kia đổi ĐVT mà quên sửa giá là
                              // xuất thùng 18L nhưng tính tiền lon 1Kg.
                              donGia: giaTheoQuyCach(null, q, ch),
                            });
                          }}
                          onXong={() => enterQuaO(d.id, "dvt")}
                        />
                    )}
                  </td>
                  <td data-dong={d.id} data-o="soLuong">
                    <input className="umv__o umv__o--so" inputMode="decimal"
                           value={d.soLuong || ""}
                           onChange={(e) => suaDong(d.id, {
                             soLuong: Number(e.target.value.replace(/[^\d.,]/g, "").replace(",", ".")) || 0,
                           })}
                           onKeyDown={(e) => {
                             if (e.key === "Enter") { e.preventDefault(); enterQuaO(d.id, "soLuong"); }
                           }} />
                  </td>
                  <td data-dong={d.id} data-o="donGia">
                    <input className="umv__o umv__o--so" inputMode="decimal"
                           value={d.donGia ? soTien(d.donGia) : ""}
                           onChange={(e) => suaDong(d.id, {
                             donGia: Number(e.target.value.replace(/[^\d]/g, "")) || 0,
                           })}
                           onKeyDown={(e) => {
                             if (e.key === "Enter") { e.preventDefault(); enterQuaO(d.id, "donGia"); }
                           }} />
                  </td>
                  <td data-dong={d.id} data-o="maMau">
                    <OGoiYUsa
                      giaTri={d.maMau}
                      layNhan={(v) => v}
                      layMau={(v) => mauTheoMa.current.get(v)?.maHex ?? d.maHex ?? undefined}
                      timKiem={timMau}
                      goiY="Mã màu pha"
                      kieuCot="mau"
                      rongToiThieu={320}
                      onChon={(v) => {
                        if (!v) { suaDong(d.id, { maMau: null, maHex: null, tienTinhMau: 0 }); return; }
                        suaDong(d.id, {
                          maMau: v,
                          maHex: mauTheoMa.current.get(v)?.maHex ?? null,
                        });
                        // Chọn xong màu thì sang ngay ô tiền pha: hai ô này luôn đi cùng
                        // nhau (luật chặn lúc lưu), tách ra là người dùng quên ô thứ hai.
                        nhayO(d.id, "tienTinhMau");
                      }}
                      onXong={() => nhayO(d.id, "tienTinhMau")}
                    />
                  </td>
                  <td data-dong={d.id} data-o="tienTinhMau">
                    <input className="umv__o umv__o--so" inputMode="decimal"
                           value={d.tienTinhMau ? soTien(d.tienTinhMau) : ""}
                           onChange={(e) => suaDong(d.id, {
                             tienTinhMau: Number(e.target.value.replace(/[^\d]/g, "")) || 0,
                           })}
                           onKeyDown={(e) => {
                             if (e.key === "Enter") { e.preventDefault(); enterQuaO(d.id, "tienTinhMau"); }
                           }} />
                  </td>
                  <td className="umv__so-tt">{soTien(thanhTienDong(d))}</td>
                  <td data-dong={d.id} data-o="ptVat">
                    <input className="umv__o umv__o--so" inputMode="decimal"
                           value={d.ptVat || ""}
                           onChange={(e) => suaDong(d.id, {
                             ptVat: Math.min(Math.max(Number(e.target.value.replace(/[^\d.]/g, "")) || 0, 0), 100),
                           })}
                           onKeyDown={(e) => {
                             if (e.key === "Enter") { e.preventDefault(); enterQuaO(d.id, "ptVat"); }
                           }} />
                  </td>
                  <td data-dong={d.id} data-o="ghiChu">
                    <input className="umv__o" value={d.ghiChu}
                           onChange={(e) => suaDong(d.id, { ghiChu: e.target.value })}
                           onKeyDown={(e) => {
                             if (e.key === "Enter") { e.preventDefault(); enterQuaO(d.id, "ghiChu"); }
                           }} />
                  </td>
                  <td className="umv__c umv__cot-xoa">
                    <Button size="small" danger type="text" className="umv__nut-xoa"
                            onClick={() => xoaDong(d.id)} title="Xóa dòng">✕</Button>
                  </td>
                </tr>
              ))}
              {/* Dòng kẻ sẵn cho kín khung — bấm vào là thêm dòng nhập thật */}
              {Array.from({ length: Math.max(0, soDongKe - dong.length) }, (_, i) => (
                <tr key={`ke-${i}`} className="umv__dong-ke"
                    onClick={() => { const id = themDong(); setTimeout(() => nhayO(id, "hang"), 0); }}
                    title="Bấm để thêm dòng">
                  <td className="umv__c umv__cot-stt">{dong.length + i + 1}</td>
                  <td /><td /><td /><td /><td /><td /><td /><td /><td />
                  <td className="umv__cot-xoa" />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* ---------- Thanh tổng cộng ---------- */}
      <Card size="small" className="umv__tong" styles={{ body: { padding: "6px 14px" } }}>
        <div className="umv__tong-wrap">
          <Typography.Text type="secondary" className="umv__doc-tien" style={{ fontSize: 12 }}>
            {docTien(tongTien)}
          </Typography.Text>
          <div className="umv__tong-phai">
            <span className="umv__tong-o">
              <span className="umv__tong-nhan">Tiền hàng</span>
              <span className="umv__tong-so">{soTien(tienHang)}</span>
            </span>
            <span className="umv__tong-o">
              <span className="umv__tong-nhan">Thuế GTGT</span>
              <span className="umv__tong-so">{soTien(tienVat)}</span>
            </span>
            <span className="umv__tong-o">
              <span className="umv__tong-nhan">Tổng cộng</span>
              <span className="umv__tong-so umv__tong-so--lon" style={{ color: ch.mau }}>
                {soTien(tongTien)}
              </span>
            </span>
            <Space className="umv__tong-nut">
              <Button onClick={hoiPhieuMoi}>Tạo mới</Button>
              <Button onClick={luuNhapCoTen}>Lưu nháp</Button>
              {/* KHÔNG có nút In ở đây (bỏ 08/08). Lý do: đơn chưa lưu thì chưa có số
                  đơn chính thức nên hai nút luôn mờ, chiếm chỗ mà gần như không bấm được.
                  In làm ở màn Danh sách phiếu — nơi mọi đơn đều đã lưu, lại in được
                  hàng loạt cho cả chuyến xe. */}
              <Button type="primary" loading={dangLuu} onClick={luuPhieu}>
                {maHd ? "Cập nhật (F9)" : "Lưu (F9)"}
              </Button>
            </Space>
          </div>
        </div>
      </Card>

      {/* ---------- Các modal ---------- */}
      <ModalDsNhap<BanNhap>
        mo={dsNhapMo}
        huong={ch.huong}
        onDong={() => setDsNhapMo(false)}
        onMoNhap={moBanNhap}
      />

      <ModalHoiDungLai
        mo={hoiMo}
        tenKh={tenKh}
        don={donTruoc}
        onDong={() => setHoiMo(false)}
        onDungLai={chepDonTruoc}
        onXem={() => { setHoiMo(false); setXemMo(true); }}
      />

      <ModalXemDonTruoc
        mo={xemMo}
        don={donTruoc}
        onDong={() => setXemMo(false)}
        onDungLai={chepDonTruoc}
      />

      {/* Ba modal dùng lại nguyên của PhieuXuatNhap.tsx — xem ghi chú ở cuối file */}
      <ModalPhu
        themHang={themHang} setThemHang={setThemHang}
        themKh={themKh} setThemKh={setThemKh}
        traThue={traThue} setTraThue={setTraThue}
        truongGia={ch.huong === "RA" ? "giaBan" : "giaMua"}
        nhanDoiTac={ch.nhanDoiTac}
        giaTuDanhMuc={ch.giaTuDanhMuc}
        onChonHang={(dongId, h) => {
          if (h.maHang) hangTheoMa.current.set(h.maHang, h);
          // Mặt hàng vừa thêm nhanh (F2) hoặc chép từ sổ thuế thường CHƯA có quy cách —
          // khi đó qcGoc rỗng và ô ĐVT giữ dạng gõ tay. Vẫn xử lý theo quy cách để
          // trường hợp chọn lại mặt hàng đã khai đủ cũng chạy đúng một đường.
          const qcGoc = quyCachGoc(h);
          suaDong(dongId, {
            maHang: h.maHang,
            tenHang: h.tenHang,
            dvt: qcGoc ? nhanQuyCach(qcGoc) : (h.dvt ?? ""),
            maDvt: qcGoc?.maDvt ?? null,
            cacQuyCach: h.quyCach2 ?? [],
            donGia: giaTheoQuyCach(h, qcGoc, ch),
            ptVat: h.ptVat != null ? Number(h.ptVat) : 0,
          });
          deSanDongCuoi(dongId);
          setTimeout(() => nhayO(dongId, "soLuong"), 0);
        }}
        onChonKh={(k) => {
          if (k.maKh) khTheoMa.current.set(k.maKh, k);
          setMaKh(k.maKh);
          setTenKh(k.tenGiaoDich || k.tenKh);
          setMst(k.mst ?? "");
          setDiaChi(k.diaChi ?? "");
          setDiaChiGiao(k.diaChiGiao ?? "");
        }}
      />
    </div>
  );
}

// ============================ HAI MÀN HÌNH XUẤT RA ============================
const CH_GIAO: CauHinh = {
  huong: "RA",
  tieuDe: "PHIẾU XUẤT HÀNG",
  mau: "#b91c1c",
  nhanDoiTac: "Khách hàng",
  nhanNgayNh: "Ngày xuất kho",
  giaTuDanhMuc: (h) => Number(h.giaBan ?? 0) || 0,
};

const CH_NHAP: CauHinh = {
  huong: "VAO",
  tieuDe: "PHIẾU NHẬP HÀNG",
  mau: "#2563eb",
  nhanDoiTac: "Nhà cung cấp",
  nhanNgayNh: "Ngày nhập kho",
  // Phiếu NHẬP lấy giá mua — đúng nghiệp vụ. Hiện gia_mua chưa khai (NULL cả 85 dòng,
  // bên nguồn USA_Meva PurchasePrice cũng NULL cả 85) nên ô Đơn giá để trống, người
  // nhập gõ tay. Khai giá mua vào danh mục là ô này tự điền, không phải sửa code.
  giaTuDanhMuc: (h) => Number(h.giaMua ?? 0) || 0,
};

export function PhieuXuatHangUsa() { return <DanhDon ch={CH_GIAO} />; }
export function PhieuNhapHangUsa() { return <DanhDon ch={CH_NHAP} />; }
export default PhieuXuatHangUsa;
