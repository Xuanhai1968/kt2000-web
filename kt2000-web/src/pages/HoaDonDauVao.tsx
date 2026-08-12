import { useEffect, useMemo, useRef, useState } from "react";
import {
  Card, Table, Button, message, Typography, Input, Select, Space,
  Tag, Checkbox, Progress, Alert, Modal, Empty, InputNumber, Popconfirm,
} from "antd";
import {
  getAdminTenants, getLeftoverFiles, getRawFiles, getRawHtml, importOne,
  getTctCredential, saveTctCredential, fetchStart, fetchProgress, fetchStop,
  loiApi, thueDanhSachHoaDon, thueChiTietHoaDon, thueHtmlHoaDon,
  thueLinesNhieuHoaDon,
} from "../api";
import type {
  AdminTenant, LeftoverInfo, HuongLay, HoaDonConLai, MatHang, PhienLay,
  HoaDonThue, HoaDonLine,
} from "../api";
import { useAuth } from "../AuthContext";
import DanhSachHoaDon from "./DanhSachHoaDon";
import XemHtmlHoaDon from "./XemHtmlHoaDon";
import { AgGridReact } from "ag-grid-react";
import type { ColDef } from "ag-grid-community";
import { mauDonVi, damDonVi } from "../theme/donViColors";
import {
  themeVfp, luoiVfpProps, colVfp, colSua, colSo, dinhDangTien,
  dinhDangPhanTramVat, nhoDoRongCot,
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

const sumLine = (hd: HoaDonConLai) =>
  hd.matHangs.reduce((s, m) => s + (laDongChietKhau(m) ? -m.thanhTien : m.thanhTien), 0);


// Mảng cột phải ĐỨNG YÊN giữa các lần render. Dựng mới mỗi lần thì AG Grid coi
// là bộ cột khác và đặt lại bề rộng — triệu chứng là bấm vào ô để sửa cũng làm
// cột nhảy về như cũ. Không phụ thuộc state nào nên đặt hẳn ngoài component.
const COT_HOA_DON: ColDef<HoaDonConLai>[] = [
          { headerName: "Tháng", field: "thang", width: 70 },
          // Bỏ cột Hướng: tiêu đề modal đã ghi hướng rồi. Ký hiệu nới rộng vì độ dài
          // không đoán trước; Số HĐ và Ngày co lại vì đã có khuôn cố định.
          { ...colSua, headerName: "Ký hiệu", field: "khHd", width: 130 },
          { ...colSua, headerName: "Số HĐ", field: "soHd", width: 95 },
          { ...colSua, headerName: "Ngày", field: "ngay", width: 110 },
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
          // Ô DUY NHẤT được sửa ở lưới này. Cổng không phải lúc nào cũng khai
          // TTCKTMai, nên đây là chỗ kế toán điền tay khi cần.
          { ...colSo, headerName: "Chiết khấu", field: "tienCk", width: 120,
            valueFormatter: (p) => dinhDangTien(p.value) },
          { headerName: "Tổng", field: "tongTien", width: 125,
            type: "numericColumn", valueFormatter: (p) => dinhDangTien(p.value) },
          // Ngưỡng 10đ khớp SAI_SO_CHO_PHEP bên ImportService — không thì hóa đơn
          // backend đã nhận vẫn hiện đỏ ở đây, đọc như còn lỗi.
          { colId: "lechSigma", headerName: "Lệch Σ line", width: 125, type: "numericColumn",
            valueGetter: (p) => (p.data ? p.data.tienHang - sumLine(p.data) : 0),
            valueFormatter: (p) => (Math.abs(p.value) < 10 ? "0" : dinhDangTien(p.value)),
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
          { ...colSo, headerName: "Số lượng", field: "soLuong", width: 110,
            valueFormatter: (p) => dinhDangTien(p.value) },
          { ...colSo, headerName: "Đơn giá", field: "donGia", width: 130,
            valueFormatter: (p) => dinhDangTien(p.value) },
          // Chiết khấu của RIÊNG dòng (STCKhau) — khác cột "Chiết khấu" ở lưới trên,
          // vốn là chiết khấu của cả hóa đơn (TTCKTMai). Hai con số khác nhau.
          { headerName: "Chiết khấu", field: "chietKhau", width: 115,
            headerTooltip: "STCKhau — chiết khấu của riêng dòng này",
            type: "numericColumn", valueFormatter: (p) => dinhDangTien(p.value) },
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

  const [tuThang, setTuThang] = useState(1);
  const [denThang, setDenThang] = useState(1);
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

  const dangHoatDong = useMemo(() => tenants.filter((t) => t.isActive), [tenants]);

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
      setDsConLai(r.data);
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

  const taiHtmlRaw = async (): Promise<string | null> => {
    if (!htmlHd || !modalDonVi) return null;
    try {
      const r = await getRawHtml(modalDonVi.id, namLamViec,
                                 htmlHd.thang, htmlHd.huong, htmlHd.tenFile);
      return r.data;
    } catch (e: unknown) {
      const st = (e as { response?: { status?: number } })?.response?.status;
      // 404 = không có bản gốc kèm theo: modal hiện khung rỗng có giải thích
      if (st === 404) return null;
      throw new Error(loiApi(e, "Không mở được bản HTML"), { cause: e });
    }
  };

  // ===== Lấy HĐ từ cổng TCT — NT-03: lấy xong backend nạp luôn, không còn bước hai =====
  const [phien, setPhien] = useState<PhienLay | null>(null);
  const [dangBatDau, setDangBatDau] = useState(false);
  const [mkMo, setMkMo] = useState(false);
  const [mkGiaTri, setMkGiaTri] = useState("");
  const [mkDaCo, setMkDaCo] = useState<Record<string, boolean>>({});

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
  }, [phien?.dangChay]);

  // Mở màn hình là hỏi luôn phiên trước còn chạy dở không, và đọc lịch sử
  useEffect(() => {
    fetchProgress().then((r) => { if (r.data.cac?.length) setPhien(r.data); }).catch(() => {});

  }, []);

  const docTrangThaiMk = (t: AdminTenant) =>
    getTctCredential(t.id)
      .then((r) => setMkDaCo((m) => ({ ...m, [t.id]: r.data.coMatKhau })))
      .catch(() => {});

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
        // tienCk phải gửi giá trị THẬT: cột Chiết khấu nay sửa được, gửi cứng 0 thì
        // người dùng gõ vào rồi bấm Ghi mà số không vào sổ — một ô giả.
        diaChi: "", tienHang: hd.tienHang, tienVat: hd.tienVat, tienCk: hd.tienCk,
        matHangs: hd.matHangs,
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
      .catch((e: any) =>
        message.error(
          e?.response?.data?.message ??
            (e?.response
              ? `Không tải được danh sách đơn vị (HTTP ${e.response.status})`
              : "Không gọi được máy chủ — kiểm tra backend còn chạy không")
        )
      )
      .finally(() => setLoading(false));
  };
  useEffect(() => napDanhSach(), []);

  // Đổi khoảng tháng hoặc đổi hướng thì cột đếm phải tính lại, không thì số hiện
  // đang là của lựa chọn cũ mà tiêu đề cột lại ghi lựa chọn mới
  useEffect(() => {
    if (tenants.length) docFileLoi(tenants.filter((t) => t.isActive));
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
                  onClick={() => { setMkGiaTri(""); setMkMo(true); }}>
            Mật khẩu cổng TCT
            {donViDangChon ? (mkDaCo[donViDangChon.id] ? " — đã có" : " — CHƯA có") : ""}
          </Button>
        </div>

        <Table
          className="luoi-gon"
          rowKey="id"
          size="small"
          loading={loading}
          dataSource={dangHoatDong}
          rowSelection={{ selectedRowKeys: selected, onChange: setSelected }}
          pagination={false}
          scroll={{ y: 290 }}
          columns={[
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
          Chỉ cần nhập mật khẩu. Mật khẩu được mã hóa trước khi lưu và không bao giờ
          hiển thị lại — muốn đổi thì nhập đè.
        </Typography.Paragraph>
        <Input.Password autoFocus placeholder="Mật khẩu cổng hoadondientu.gdt.gov.vn"
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
                  return Math.abs(lech) < 10
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

      <XemHtmlHoaDon
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
  soSanhDuLieu: boolean; khongKiemTraTen: boolean;
  coDuLieuGoc: boolean; dungTkNganHang: boolean; banHangQuaDienThoai: boolean;
  tenHangLaBangKe: boolean;
  suaTienCk: boolean; suaTienVat: boolean;
  thueSuat: number; chietKhau: number; tienVat: number;
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
  soSanhDuLieu: false, khongKiemTraTen: true,
  coDuLieuGoc: false, dungTkNganHang: false, banHangQuaDienThoai: false,
  tenHangLaBangKe: false,
  suaTienCk: false, suaTienVat: true,
  thueSuat: 8, chietKhau: 0, tienVat: 0,
  ghiNoCk: "", maCtNoCk: "", ghiCoCk: "", maCtCoCk: "",
  tinhChatLQ: "", loaiLQ: "", maSoLQ: "", khhdLQ: "", soHdLQ: "", ngayLQ: "",
});

function HoaDonCuaDonVi({ huongMacDinh }: Props) {
  const { session } = useAuth();
  const namLamViec = session?.fiscalYear ?? new Date().getFullYear();
  const laDauRa = huongMacDinh === "ra";
  const tenMan = laDauRa ? "Hóa đơn GTGT đầu ra" : "Hóa đơn GTGT đầu vào";
  const [dsHd, setDsHd] = useState<HoaDonThue[]>([]);
  const [tenFileChon, setTenFileChon] = useState<string | null>(null);
  const [tai, setTai] = useState(true);
  const [sttChon, setSttChon] = useState<number | null>(null);
  const [moDanhSach, setMoDanhSach] = useState(false);
  const [dinhKhoanTheoFile, setDinhKhoanTheoFile] =
    useState<Record<string, DinhKhoan>>({});

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
      ghiNo: "156", ghiCo: "331", maCtNo: "", maCtCo: "",
      ghiChu: "", tthaiHd: null,
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

  const taiHtmlHoaDon = async (): Promise<string | null> => {
    if (!htmlMaHd) return null;
    try {
      const r = await thueHtmlHoaDon(htmlMaHd);
      return r.data;
    } catch (e: unknown) {
      const st = (e as { response?: { status?: number } })?.response?.status;
      // 404 = hóa đơn không kèm bản gốc: chuyện thường, để modal hiện khung rỗng
      // với lời giải thích chứ không phải lỗi đỏ.
      if (st === 404) return null;
      throw new Error(loiApi(e, "Không mở được bản HTML"), { cause: e });
    }
  };
  useEffect(() => {
    let huy = false;
    const id = setTimeout(() => { if (!huy) void napHoaDon(); }, 0);
    return () => { huy = true; clearTimeout(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.tenant.id, namLamViec, huongMacDinh]);

  const thueSuatCuaHd = (x: HoaDonThue): number | null => {
    let ptLonNhat: number | null = null;
    let tienLonNhat = -1;
    for (const d of x.lines) {
      const pt = d.ptVat ?? 0;
      if (pt === 0) continue;
      const tien = d.thanhTien ?? 0;
      if (tien > tienLonNhat) { tienLonNhat = tien; ptLonNhat = pt; }
    }
    if (ptLonNhat == null) return null;
    return ptLonNhat <= 1 ? ptLonNhat * 100 : ptLonNhat;
  };

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


  const thueSuatHienThi =
    dk.thueSuat !== dinhKhoanRong().thueSuat
      ? dk.thueSuat                                   // người dùng đã tự gõ
      : (hd ? thueSuatCuaHd(hd) : null) ?? dk.thueSuat;

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

  // Góc trên phải chỉ còn ba nút. Ô Select chọn hóa đơn đã bỏ: danh sách xổ xuống
  // chỉ hiện được một mẩu tên khách nên tra bằng nó rất khó, trong khi nút "Tìm"
  // mở modal danh sách đầy đủ (lọc tháng, tìm nhanh, xem dòng hàng) — cùng việc
  // nhưng làm tốt hơn hẳn.
  return (
    <div className={laDauRa ? "huong-ra" : "huong-vao"}>
      <Card
        title={`${tenMan} — ${session?.tenant.name ?? ""} (năm ${namLamViec})`}
        styles={{ body: { padding: 8 } }}
        extra={
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
        }
      >

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

          <div style={{ display: "flex", gap: 12, marginTop: 4 }}>
            <div style={{ flex: "1 1 62%", minWidth: 0 }}>
              <div className="hang">
                {oNhan("GHI NỢ", 52, true)}
                <Select size="small" style={{ width: 74 }} value={dk.ghiNo}
                        onChange={(v) => suaDk({ ghiNo: v })}
                        options={TK_NO_GOI_Y.map((x) => ({ value: x, label: x }))} />
                <Input size="small" style={{ width: 170 }} value="Hàng hoá" readOnly />
                {oNhan("Mã CT nợ", 66)}
                <Input size="small" style={{ flex: 1, minWidth: 150 }} value={dk.maCtNo}
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
                <Input size="small" style={{ flex: 1, minWidth: 150 }} value={dk.maCtCo}
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
                <Input size="small" style={{ flex: 1, minWidth: 120 }}
                       value="Phải trả cho người bán" readOnly />
              </div>
              <div className="hang">
                {oNhan("Đ.T.K.T", 52, true)}
                <Input size="small" style={{ width: 250 }} value={dk.dtkt}
                       onChange={(e) => suaDk({ dtkt: e.target.value })} />
                {oNhan("Thương vụ", 72)}
                <Input size="small" style={{ flex: 1, minWidth: 150 }} value={dk.thuongVu}
                       onChange={(e) => suaDk({ thuongVu: e.target.value })} />
              </div>
              <div className="hang">
                {oNhan("Ghi chú", 52)}
                <Input size="small" style={{ flex: 1 }} value={dk.ghiChu}
                       onChange={(e) => suaDk({ ghiChu: e.target.value })} />
              </div>

              {/* Cụm nút giữa form */}
              <div className="hang" style={{ marginTop: 4, flexWrap: "wrap" }}>
                <Checkbox checked={dk.soSanhDuLieu}
                          onChange={(e) => suaDk({ soSanhDuLieu: e.target.checked })}>
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

          {/* ===== THANH CÔNG CỤ TRÊN LƯỚI ===== */}
          <div className="hang" style={{ marginTop: 6, flexWrap: "wrap" }}>
            <Typography.Text strong style={{ fontSize: 13, marginRight: 8 }}>
              Chi tiết hàng hoá dịch vụ
            </Typography.Text>
            <InputNumber size="small" style={{ width: 56 }} min={1}
                         value={hd?.lines.length || 1} readOnly />
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
          </div>

          {/* ===== LƯỚI MẶT HÀNG =====
               tabIndex để div nhận được focus, nếu không onKeyDown không bao giờ
               bắn. Bấm vào lưới là focus luôn, khỏi phải Tab tới. */}
          <div ref={luoiHangRef} tabIndex={0} onKeyDown={phimLuoiHang}
               className="khung-luoi-hang">
          <Table
            className="luoi-hang"
            rowKey="sttLine" size="small" pagination={false}
            dataSource={hd?.lines ?? []}
            loading={tai}
            scroll={{ x: 1228, y: 210 }}
            locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE}
                                        description="Hóa đơn không có dòng hàng" /> }}
            onRow={(m: HoaDonLine) => ({
              onClick: () => setSttChon(m.sttLine),
              className: m.sttLine === sttChon ? "dong-dang-chon" : undefined,
              style: { cursor: "pointer" },
            })}
            columns={[
              { title: "STT", dataIndex: "sttLine", width: 46, fixed: "left" },
              { title: "Tên hàng hoá dịch vụ", dataIndex: "tenHang", width: 230,
                ellipsis: true,
                render: (v: string) => <span title={v}>{v}</span> },
              { title: "ĐVT", dataIndex: "dvt", width: 74 },
              { title: "Số lượng", dataIndex: "soLuong", width: 92, align: "right",
                render: (v: number) => v.toLocaleString("vi-VN",
                  { minimumFractionDigits: 4, maximumFractionDigits: 4 }) },
              { title: "Đơn giá", dataIndex: "donGia", width: 120, align: "right",
                render: (v: number) => v.toLocaleString("vi-VN",
                  { minimumFractionDigits: 4, maximumFractionDigits: 4 }) },
              { title: "Thành tiền", dataIndex: "thanhTien", width: 140, align: "right",
                render: (v: number) => (
                  <b>{v.toLocaleString("vi-VN",
                      { minimumFractionDigits: 4, maximumFractionDigits: 4 })}</b>
                ) },
              { title: "Ghi chú", dataIndex: "ghiChu", width: 260, ellipsis: true,
                render: (v: string | null, m: HoaDonLine) => {
                  const t = v || m.tenHang;
                  return <span title={t}>{t}</span>;
                } },
              { title: "Nợ", dataIndex: "ghiNo", width: 56, align: "center",
                render: (v: string | null) => v || dk.ghiNo },
              { title: "Có", dataIndex: "ghiCo", width: 56, align: "center",
                render: (v: string | null) => v || dk.ghiCo },

              { title: "% VAT", dataIndex: "ptVat", width: 74, align: "right",
                render: (v: number) => dinhDangPhanTramVat(v) },
              { title: "C.Khấu", dataIndex: "tienCk", width: 80, align: "right",
                render: (v: number) => v.toLocaleString("vi-VN",
                  { minimumFractionDigits: 4, maximumFractionDigits: 4 }) },
            ]}
          />
          </div>

          {/* ===== KHỐI CỘNG TIỀN + NÚT DƯỚI ===== */}
          <div style={{ display: "flex", gap: 12, marginTop: 6 }}>
            {/* ô ghi chú trống bên trái như bản gốc */}
            <Input.TextArea rows={4} style={{ flex: "0 0 230px" }}
                            value={dk.ghiChu}
                            onChange={(e) => suaDk({ ghiChu: e.target.value })} />

            <div className="khoi-cong" style={{ flex: "0 0 330px" }}>
              <div className="hang">
                {oNhan("Cộng tiền hàng", 140)}
                <InputNumber size="small" style={{ width: 165 }} readOnly
                             value={congTienHang} controls={false}
                             formatter={tienVn} />
              </div>
              <div className="hang">
                {oNhan("Chiết khấu", 140)}
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
                  <InputNumber size="small" style={{ width: 40 }} controls={false}
                               value={thueSuatHienThi}
                               title="Thuế suất đọc từ dòng hàng của chính hóa đơn này"
                               onChange={(v) => suaDk({ thueSuat: v ?? 0 })} />
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
                {oNhan("Cộng tiền thanh toán", 140)}
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
                  <Input size="small" style={{ flex: 1, minWidth: 150 }}
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
      </Card>

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
      />

      <XemHtmlHoaDon
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
