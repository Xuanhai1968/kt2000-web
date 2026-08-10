import axios from "axios";

// Đường dẫn tương đối: dev thì Vite proxy sang backend (vite.config.ts),
// còn bản publish backend tự phục vụ frontend nên cùng gốc, không phải sửa gì.
const api = axios.create({ baseURL: "/api" });

export function loiApi(e: unknown, macDinh = "Thao tác không thành công"): string {
  if (axios.isAxiosError(e)) {
    const data = e.response?.data as { message?: string } | undefined;
    if (typeof data?.message === "string" && data.message.trim()) return data.message;
    if (e.message) return e.message;
  }
  if (e instanceof Error && e.message) return e.message;
  return macDinh;
}

// Gan token vao moi request sau khi login
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("kt2000_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Token sống 10 tiếng. Hết hạn mà không xử lý thì phiên cũ vẫn nằm trong localStorage:
// menu vẫn hiện, màn hình vẫn vẽ, chỉ có mọi lời gọi API chết — nhìn như app hỏng chứ
// không như hết phiên. Gặp 401 thì dọn phiên và đá thẳng về trang đăng nhập.
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err?.response?.status === 401) {
      localStorage.removeItem("kt2000_token");
      localStorage.removeItem("kt2000_session");
      if (location.pathname !== "/") {
        sessionStorage.setItem("kt2000_het_phien", "1");
        location.replace("/");
      }
    }
    return Promise.reject(err);
  }
);

export interface FiscalYearInfo { year: number; isClosed: boolean; }
export interface TenantInfo {
  id: string; code: string; name: string;
  tenantType: string; role: string; fiscalYears: FiscalYearInfo[];
}
export interface GetTenantsResponse {
  tenants: TenantInfo[];
  lastPreferences: { tenantCode: string | null; fiscalYear: number | null };
}

// Đòi cả mật khẩu: danh sách đơn vị là thông tin riêng, không cho gõ đại một cái tên
// rồi xem được. Sai tên hoặc sai mật khẩu đều trả 401 với cùng một câu.
export const getTenants = (username: string, password: string) =>
  api.post<GetTenantsResponse>("/auth/get-tenants", { username, password });

export const doiMatKhau = (matKhauCu: string, matKhauMoi: string) =>
  api.post<{ message: string }>("/auth/change-password", { matKhauCu, matKhauMoi });

export const login = (payload: {
  username: string; password: string;
  tenantId: string; fiscalYear: number; getChiNhanh: boolean;
}) => api.post("/auth/login", payload);

export default api;
export interface AdminTenant {
  id: string;
  code: string;
  name: string;
  taxCode: string | null;
  address: string | null;
  isActive: boolean;
  khaiQuy: boolean;                // false = khai THÁNG → FRM_LAY_HDDT tô đỏ
  tenantType: string;              // headquarter | branch | noibo | internal
  linkedTenantCode: string | null; // AD-NB-03: tenant NB trỏ về tenant thuế nào
  fiscalYears: number[];
}

// ===== Nhật ký hệ thống (ActivityLog — chỉ đọc) =====

export interface NhatKyDong {
  id: number;
  at: string;            // ISO, vd 2026-08-06T10:58:59
  userName: string;
  action: string;
  detail: string | null;
  nam: number | null;
  thang: number | null;
  donVi: string | null;  // mã đơn vị, null nếu hành động không gắn đơn vị nào
}

export interface NhatKyKetQua {
  tong: number;
  trang: number;
  soDong: number;
  ds: NhatKyDong[];
}

export const getActivityLog = (p: {
  tuNgay?: string; denNgay?: string; nguoiDung?: string;
  tenantId?: string; hanhDong?: string; trang?: number; soDong?: number;
}) => api.get<NhatKyKetQua>("/admin/activity-log", { params: p });

export const getActivityActions = () =>
  api.get<string[]>("/admin/activity-log/actions");

// ===== QT-01: quản lý user & phân quyền =====

export interface QuyenDonVi {
  tenantId: string;
  code: string;
  role: string;
}

export interface AdminUser {
  id: string;
  loginName: string;
  realName: string | null;
  isAdmin: boolean;
  isActive: boolean;
  mustChangePassword: boolean;
  createdAt: string;
  donVi: QuyenDonVi[];
}

export const getUsers = (tenantId?: string) =>
  api.get<AdminUser[]>("/admin/users", { params: tenantId ? { tenantId } : {} });

export const createUser = (p: {
  loginName: string; realName?: string; matKhau: string;
  isAdmin: boolean; tenantId?: string; role: string;
}) => api.post("/admin/users", p);

// Chỉ đọc được khi người dùng CHƯA tự đổi mật khẩu; đổi rồi backend trả lỗi
export const viewInitialPassword = (userId: string) =>
  api.get<{ loginName: string; matKhau: string }>(
    "/admin/users/mat-khau-ban-dau", { params: { userId } });

export const setUserActive = (userId: string, isActive: boolean) =>
  api.put("/admin/users/trang-thai", { userId, isActive });

// Xóa hẳn tài khoản. Nhật ký hoạt động cũ vẫn giữ vì ActivityLog lưu tên dạng chữ.
export const deleteUser = (userId: string) =>
  api.delete(`/admin/users/${userId}`);

export const resetUserPassword = (userId: string, matKhauMoi: string) =>
  api.put("/admin/users/reset-mat-khau", { userId, matKhauMoi });

// role = null → gỡ quyền của user khỏi đơn vị đó
export const setUserRole = (userId: string, tenantId: string, role: string | null) =>
  api.put("/admin/users/quyen", { userId, tenantId, role });

// Tự đổi mật khẩu — endpoint duy nhất sống ở cả hai instance (AD-QT-01)
export const changeOwnPassword = (matKhauCu: string, matKhauMoi: string) =>
  api.post("/auth/change-password", { matKhauCu, matKhauMoi });

export interface UpdateTenantPayload {
  name: string;
  taxCode?: string;
  address?: string;
  isActive: boolean;
  khaiQuy: boolean;
  linkedTenantCode?: string | null;   // AD-NB-03, chỉ dùng với tenant 'noibo'
}

export const updateTenant = (id: string, p: UpdateTenantPayload) =>
  api.put(`/admin/tenants/${id}`, p);

// baoGomNoiBo = true chỉ dùng ở màn Mở năm (QT-02) để thấy cả MDN_NB.
// Các màn khác giữ mặc định false — MDN_NB xuất hiện ở đó là vô nghĩa.
export const getAdminTenants = (baoGomNoiBo = false) =>
  api.get<AdminTenant[]>("/admin/tenants", { params: { baoGomNoiBo } });

export interface CreateTenantPayload {
  code: string;
  name: string;
  taxCode?: string;
  address?: string;
  firstYear: number;
  tenantType?: string;                // mặc định 'headquarter'
  linkedTenantCode?: string | null;   // bắt buộc khi tenantType = 'noibo'
}

export interface OpenYearResult {
  code: string;
  status: "ok" | "skip" | "error";
  message: string;
}

export const createTenant = (p: CreateTenantPayload) =>
  api.post("/admin/tenants", p);

export const openFiscalYears = (year: number, tenantIds: string[]) =>
  api.post<OpenYearResult[]>("/admin/fiscal-years", { year, tenantIds });
// "vao" = chỉ hóa đơn đầu vào, "all" = cả đầu vào lẫn đầu ra
export type HuongLay = "vao" | "all";

export interface ImportJobResult {
  inserted: number;
  updated: number;
  skippedYear: number;
  skippedNoDate: number;
  khongCoGoc: number;   // HĐ đặc biệt (điện, viễn thông…) — chỉ có trong Excel, không có gốc TCT
  moved: number;
  lechTong: number;     // số HĐ lệch Σ line vs master — file gốc nằm lại raw\
  errors: { maHd: string; loaiLoi: string; reason: string }[];
}

// Hiện trạng file gốc còn ở raw\ + số HĐ lỗi đã ghi nhận lúc nạp (spec 1.3.3)
export interface LeftoverInfo {
  tenantId: string;
  code: string;
  soFileConLai: number;                              // .xml còn ở raw\ (chưa nạp HOẶC lỗi)
  chiTiet: { thang: number; soFile: number }[];
  soLechTong: number;                                // riêng HĐ lệch Σ line vs master
  soLoiKhac: number;                                 // không rõ ngày / lỗi ghi / lỗi dời file
  lechTheoThang: { thang: number; soFile: number }[];
}

// ===== BƯỚC 1: tài khoản cổng TCT + chạy bộ tải =====

export interface TctCredentialInfo {
  coMatKhau: boolean;
  capNhatLuc: string | null;
  capNhatBoi: string | null;
}

export const getTctCredential = (tenantId: string) =>
  api.get<TctCredentialInfo>("/admin/tct-credential", { params: { tenantId } });

// Mật khẩu đi MỘT CHIỀU: gửi lên rồi mã hóa lưu, không có API nào đọc ngược ra
export const saveTctCredential = (tenantId: string, matKhau: string) =>
  api.put("/admin/tct-credential", { tenantId, matKhau });

export interface TienDoLay {
  tenantId: string;
  code: string;
  nam: number;
  thang: number;
  trangThai: "cho" | "dang_chay" | "xong" | "loi" | "huy";
  giaiDoan: string;      // state của status.json: LOGIN / XML / DONE_PARSE / ERROR…
  thongDiep: string;
  daTai: number;
  tong: number;
  loi: string | null;
  batDau: string | null;
  ketThuc: string | null;
}

export interface PhienLay {
  dangChay: boolean;
  nguoiChay: string | null;
  batDau: string | null;
  cac: TienDoLay[];
}

export const fetchStart = (
  tenantIds: string[], nam: number, thangBd: number, thangKt: number, huong: HuongLay
) => api.post<PhienLay>("/admin/fetch-start", { tenantIds, nam, thangBd, thangKt, huong });

export const fetchProgress = () => api.get<PhienLay>("/admin/fetch-progress");
export const fetchStop = () => api.post("/admin/fetch-stop");

// Một mặt hàng trên hóa đơn, đọc từ XML gốc của TCT
export interface MatHang {
  stt: number;
  tenHang: string;
  dvt: string;
  soLuong: number;
  donGia: number;
  thanhTien: number;
  thueSuat: string;
}

// Một hóa đơn còn nằm lại raw\ — dựng từ file XML, kèm lý do bị giữ lại
export interface HoaDonConLai {
  tenFile: string;
  huong: string;
  thang: number;
  mauSo: string;
  khHd: string;
  soHd: string;
  ngay: string;          // yyyy-MM-dd, lấy nguyên từ thẻ NLap của XML
  mstBan: string;
  tenBan: string;
  mstMua: string;
  tenMua: string;
  tienHang: number;
  tienVat: number;
  tongTien: number;
  lyDo: string;
  coTrongExcel: boolean; // false = file lạc, không có dòng nào trong Excel tổng
  matHangs: MatHang[];
}

export const getRawFiles = (
  tenantId: string, nam: number, thangBd: number, thangKt: number, huong: HuongLay
) => api.post<HoaDonConLai[]>("/admin/raw-files",
                              { tenantId, nam, thangBd, thangKt, huong });

// Nạp tay MỘT hóa đơn (đã sửa trên màn hình) vào database đơn vị-năm
export interface ImportOnePayload {
  tenantId: string;
  nam: number;
  thang: number;
  huong: string;
  tenFile: string;
  mauSo: string;
  khHd: string;
  soHd: string;
  ngay: string;
  mst: string;
  mstPhatHanh: string;   // MST người bán — dựng ma_hd theo BR-HD-01
  tenKh: string;
  diaChi: string;
  tienHang: number;
  tienVat: number;
  tienCk: number;
  matHangs: (MatHang & { tinhChat?: string })[];
}

export interface ImportOneResult {
  maHd: string;
  capNhat: boolean;
  soDongHang: number;
  moved: number;
  loiDoiFile: string | null;
}

export const importOne = (p: ImportOnePayload) =>
  api.post<ImportOneResult>("/admin/import-one", p);

// Bản HTML gốc. Phải tải qua axios chứ không mở thẳng bằng thẻ <a>: link trực tiếp
// không đi qua interceptor nên không có Bearer token, backend sẽ trả 401.
export const getRawHtml = (
  tenantId: string, nam: number, thang: number, huong: string, tenFile: string
) => api.get<string>("/admin/raw-html", {
  params: { tenantId, nam, thang, huong, tenFile },
  responseType: "text",
});

export const getLeftoverFiles = (
  tenantIds: string[], nam: number, thangBd: number, thangKt: number, huong: HuongLay
) => api.post<LeftoverInfo[]>("/admin/leftover-files",
                              { tenantIds, nam, thangBd, thangKt, huong });

export const importJob = (
  tenantId: string, nam: number, thang: number, huong: HuongLay, xoaTruocKhiGhi = false
) => api.post<ImportJobResult>("/admin/import-job",
                               { tenantId, nam, thang, huong, xoaTruocKhiGhi });
// ==================== PHẦN NỘI BỘ (NB) ====================
// Đơn vị và năm KHÔNG gửi kèm: backend đọc thẳng từ claim trong token
// (tenant_code / fiscal_year), nên frontend không có cách nào trỏ nhầm database.

export interface DmHangNb {
  maHang: string | null;
  tenHang: string;             // tên ĐÁNH ĐƠN (có ghi chú nắp/lô cho kho)
  // Tên CHUẨN đưa lên hóa đơn điện tử (Viettel). Trống = dùng luôn tenHang.
  // Hai tên vì ghi chú thực địa ("nắp trắng") không được lên hóa đơn thuế.
  tenHd: string | null;
  dvt: string | null;
  quyCach: string | null;
  giaBan: number | null;
  giaMua: number | null;
  ptVat: number | null;
  maNgan: string | null;
  maHangThue: string | null;   // BR-NB-02: vết chép từ sổ thuế
  ghiChu: string | null;
  // 014 — bổ sung theo form gốc Hoa_Sang
  tenTat: string | null;      // gõ tắt để tìm nhanh
  maVach: string | null;
  nhomHang: string | null;
  dvtLon: string | null;      // 1 dvtLon = heSoLon × dvt
  heSoLon: number | null;
  giaBanLon: number | null;
  // 018 — MỘT mặt hàng NHIỀU quy cách (bảng DM_QUY_CACH_NB).
  // Backend trả kèm ngay trong kết quả tìm hàng, không phải gọi thêm vòng nữa: gõ tên
  // hàng xong Enter là ô ĐVT xổ ra được ngay, không chờ mạng (BR-NB-05).
  // Mảng rỗng = mặt hàng chưa khai quy cách -> ô ĐVT lùi về gõ tay như trước.
  quyCach2: QuyCachNb[];
}

// Một quy cách bán được của mặt hàng (dòng DM_QUY_CACH_NB ghép DM_DVT_NB).
export interface QuyCachNb {
  maDvt: string;
  tenDvt: string | null;
  tenTat: string | null;      // "18L" — thứ người bán gõ
  heSoQd: number | null;      // 1 ĐVT này = heSoQd × dvtGoc
  dvtGoc: string | null;      // "L" / "KG"
  laDvtGoc: boolean;          // quy cách mặc định của mặt hàng
  giaBan: number | null;
  giaMua: number | null;
  maVach: string | null;
}

// KHUYẾN MÃI "mua N tặng M" (DM_KM_NB, script 018).
// KM gắn theo CẶP (mặt hàng, quy cách): H00021 có ba KM khác nhau cho thùng 18L và hộp
// 5L. Quy cách TẶNG có thể khác quy cách MUA (mua 3 thùng tặng 1 hộp 5L).
export interface DmKmNb {
  maKm: string | null;          // để trống khi thêm mới -> backend sinh KM0028...
  tenKm: string;
  maHang: string;
  maDvt: string;                // quy cách phải MUA
  maDvtTang: string;            // quy cách được TẶNG
  slMua: number;
  slTang: number;
  tuNgay: string | null;        // null = không giới hạn thời gian
  denNgay: string | null;
  ghiChu: string | null;
  // Backend đọc kèm để hiện chữ, không phải tra thêm danh mục. Chỉ có khi ĐỌC.
  tenHang?: string | null;
  tenDvt?: string | null;
  tenDvtTang?: string | null;
}

// BR-NB-01: DM_KH_NB là danh mục ĐỐI TƯỢNG CÔNG NỢ — khách VÀ nhân viên chung một
// bảng, phân biệt bằng loaiDt. Không có danh mục nhân viên riêng.
export type LoaiDoiTuong = "KH" | "NV";

export interface DmKhNb {
  maKh: string | null;
  tenKh: string;
  loaiDt: LoaiDoiTuong;
  tenGiaoDich: string | null;  // tên phục vụ NGƯỜI GIAO HÀNG
  mst: string | null;
  diaChi: string | null;
  dienThoai: string | null;
  nguoiLienHe: string | null;
  maKhHd: string | null;
  congNoDau: number | null;
  ghiChu: string | null;
  // 014
  tenTat: string | null;
  diaChiGiao: string | null;   // địa chỉ GIAO, khác địa chỉ trên hóa đơn
  // 018 — nạp từ hệ USA_Meva cũ
  maNhan: string | null;       // nhãn hàng đại lý này bán (-> DM_NHAN)
  tenNhan: string | null;      // đọc ra để hiện, không ghi xuống
  maTinh: string | null;
}

// Danh mục NHÃN HÀNG (DM_NHAN). Trên form đánh đơn, nhãn vừa để hiện vừa là BỘ LỌC
// khách: 1600+ khách, gõ tên không nhớ thì chọn nhãn cho danh sách ngắn lại.
export interface DmNhan {
  maNhan: string | null;
  tenNhan: string;
  tenCty: string | null;       // pháp nhân in trên phiếu
  mst: string | null;
  tenTat: string | null;
}

// Danh mục MÀU PHA (DM_MAU) — bảng màu của thợ pha sơn, ~1131 dòng.
export interface DmMau {
  maMau: string;               // vd "2532-P"
  nhomMau: string;             // vd "Yellow" / "Pastel"
  maHex: string | null;        // vd "#f8ebbf" — tô ô chọn màu
  thuTu: number | null;        // giữ đúng thứ tự bảng màu giấy
  ghiChu: string | null;
}

export interface DonNbLine {
  sttLine: number;
  maHang: string | null;
  tenHang: string | null;      // nguyên văn lúc lập đơn — phiếu giao hàng in cái này
  // Tên CHUẨN lên hóa đơn điện tử, backend đọc SỐNG từ DM_HANG_NB.ten_hd lúc tra đơn.
  // Trống = mặt hàng chỉ có một tên, dùng luôn tenHang.
  // KHÔNG bắt buộc: chỉ có khi ĐỌC đơn về; lúc dựng payload để LƯU thì không gửi (và
  // backend cũng bỏ qua) — tên hóa đơn sống ở danh mục, không lưu xuống dòng đơn.
  tenHd?: string | null;
  dvt: string | null;
  soLuong: number;
  donGia: number;
  thanhTien: number;
  ptVat: number;
  tienVatL: number;
  ghiChu: string | null;
  // Hệ số chốt tại thời điểm lập đơn (đổi danh mục sau không làm sai đơn cũ)
  heSoQd: number | null;
  slQuyDoi: number | null;
  laHangTang: boolean;
  quyCach: string | null;
  ngayNhL: string | null;      // BR-NB-07: mốc rời kho của riêng dòng này
  // --- 019: pha màu (ngành sơn) ---
  // Mã màu khách yêu cầu pha (-> DM_MAU.ma_mau). Trống = bán nguyên trạng.
  maMau: string | null;
  // Tiền công pha màu CỦA CẢ DÒNG — cộng thẳng vào thành tiền, KHÔNG nhân số lượng:
  //     thành tiền = soLuong × donGia + tienTinhMau
  tienTinhMau: number;
  maHex: string | null;        // đọc kèm từ DM_MAU để tô ô màu. Chỉ ĐỌC RA.
}

// Đơn hàng NB = HOA_DON (khuôn dùng chung với sổ thuế, SPEC mục 4).
//   maHd   = SỐ ĐƠN hiển thị/in, kiểu V125 / R236 (chốt 9.7)
//   ngayNh = ngày hàng THẬT SỰ rời kho (BR-NB-07) — mốc trừ tồn, KHÔNG phải ngày tạo
// soHd/khhd không có mặt: với NB chúng vô nghĩa và luôn trống.
export interface DonNb {
  maHd: string | null;
  ngay: string | null;
  ngayNh: string | null;
  maKh: string | null;
  tenKh: string | null;
  mst: string | null;
  diaChi: string | null;       // địa chỉ CỬA HÀNG của khách
  // Địa chỉ GIAO khi khách muốn chở tới chỗ khác. Trống = giao đúng địa chỉ cửa hàng.
  diaChiGiao: string | null;
  maNvkd: string | null;       // -> DM_KH_NB (loaiDt='NV')
  maNvvc: string | null;
  maGoi: string | null;        // BR-NB-08: thuộc gói nào
  ghiChu: string | null;
  tienHang: number;
  tienVat: number;
  tongTien: number;
  tthaiHd: string;
  // VAO = đơn nhập, RA = đơn giao. Cột tính của HOA_DON nên chỉ ĐỌC RA —
  // màn hình tổng hợp chứng từ dùng nó để dán nhãn từng dòng.
  huong: HuongDon | null;
  tenNvkd: string | null;      // đọc ra để hiện, không ghi xuống
  tenNvvc: string | null;
  // Nhãn hàng của KHÁCH, backend JOIN sẵn từ DM_KH_NB -> DM_NHAN. Chỉ ĐỌC RA, để in
  // lên phiếu — mỗi đơn một khách nên phải lấy theo đơn, không truyền chung từ ngoài.
  tenNhan: string | null;
  lines: DonNbLine[];
}

// BR-NB-03: kết quả tra tên hàng từ sổ THUẾ của tenant liên kết.
// Chỉ 4 trường — không có giá/số tiền/đối tác của sổ thuế (v1).
export interface TraHangThue {
  maHang: string | null;
  tenHang: string;
  dvt: string | null;
  maNgan: string | null;
  nguon: "da_co_ma" | "ten_tren_hd";   // nhãn nguồn hiện trên gợi ý
  nam: number;
}

// BR-NB-08: gói hàng
export interface GoiHdLine {
  sttLine: number;
  maHang: string | null;
  tenHang: string | null;
  dvt: string | null;
  soLuong: number;             // TỔNG gộp từ mọi đơn con
  soDonGop: number;
  ghiChu: string | null;
  // Hệ số đóng gói đọc SỐNG từ DM_HANG_NB — để tách cột Thùng / Lẻ trên phiếu gói.
  // Trống = mặt hàng chưa khai quy đổi, khi đó dồn hết vào cột Lẻ.
  heSoLon: number | null;
  dvtLon: string | null;
  // Trị giá gộp trong gói — CHỐT lúc chốt gói. Dùng tính "G.đơn" = triGia / soLuong.
  triGia: number | null;
  // Giá niêm yết hiện tại (đọc sống) — cột "G.chuẩn" để so với giá thực bán.
  giaChuan: number | null;
}

export type TrangThaiGoi = "moi" | "chot" | "xuat" | "huy";

export interface GoiHd {
  maGoi: string | null;
  tenGoi: string | null;
  khuVuc: string | null;
  ngay: string | null;
  maNvvc: string | null;
  tenNvvc: string | null;
  trangThai: TrangThaiGoi;
  soDon: number | null;
  ngayChot: string | null;
  ngayXuat: string | null;
  ghiChu: string | null;
  lines: GoiHdLine[];          // phiếu soạn hàng (có sau khi CHỐT)
  donCon: DonNb[];
}

// VAO = đơn nhập hàng, RA = đơn bán/giao hàng (cùng bộ giá trị với cột huong
// của khuôn HOA_DON)
export type HuongDon = "VAO" | "RA";

// boQua: số dòng bỏ qua từ đầu — combobox cuộn tới đáy thì gọi tiếp (cuộn vô tận).
export const nbTimHang = (tu?: string, gioiHan = 50, boQua = 0) =>
  api.get<DmHangNb[]>("/nb/hang", { params: { tu, gioiHan, boQua } });

export const nbLuuHang = (d: Partial<DmHangNb>) => api.post<DmHangNb>("/nb/hang", d);

// maNhan: lọc khách theo nhãn hàng họ bán. Bỏ trống = không lọc.
// boQua: xem nbTimHang — cùng cơ chế cuộn vô tận.
export const nbTimKh = (tu?: string, loaiDt?: LoaiDoiTuong, gioiHan = 50,
                        maNhan?: string | null, boQua = 0) =>
  api.get<DmKhNb[]>("/nb/kh",
    { params: { tu, loaiDt, gioiHan, maNhan: maNhan || undefined, boQua } });

// 43 nhãn, trả hết một lượt nên lọc tại chỗ, không cần gọi lại mỗi lần gõ.
export const nbTimNhan = (tu?: string) =>
  api.get<DmNhan[]>("/nb/nhan", { params: { tu } });

export const nbLuuKh = (d: Partial<DmKhNb>) => api.post<DmKhNb>("/nb/kh", d);

// Bảng màu ~1131 dòng nên KHÔNG trả hết như nhãn hàng: lọc + chặn số dòng, cuộn tiếp
// bằng boQua. Tìm theo mã màu, nhóm màu và ghi chú.
export const nbTimMau = (tu?: string, gioiHan = 50, boQua = 0) =>
  api.get<DmMau[]>("/nb/mau", { params: { tu, gioiHan, boQua } });

// Khuyến mãi. chiConHieuLuc = true -> chỉ KM đang chạy theo mốc hôm nay (form đánh
// đơn dùng); màn danh mục để mặc định false để còn thấy KM đã hết hạn mà sửa.
export const nbTimKm = (tu?: string, gioiHan = 200, boQua = 0, chiConHieuLuc = false) =>
  api.get<DmKmNb[]>("/nb/km", { params: { tu, gioiHan, boQua, chiConHieuLuc } });

export const nbLuuKm = (d: Partial<DmKmNb>) => api.post<DmKmNb>("/nb/km", d);

export const nbXoaKm = (maKm: string) =>
  api.delete<{ message: string }>(`/nb/km/${encodeURIComponent(maKm)}`);

// BR-NB-03: tra tên hàng bên sổ thuế. Đơn vị thuế lấy từ LinkedTenantCode của
// chính tenant đang đăng nhập — frontend không gửi mã đơn vị nào cả.
export const nbTraHangThue = (tu?: string, gioiHan = 30) =>
  api.get<TraHangThue[]>("/nb/tra-hang-thue", { params: { tu, gioiHan } });

export const nbSoTiep = (huong: HuongDon) =>
  api.get<{ maHd: string }>(`/nb/don/${huong}/so-tiep`);

export const nbDanhSachDon = (huong: HuongDon, thang?: number, tu?: string, gioiHan = 100) =>
  api.get<DonNb[]>(`/nb/don/${huong}`, { params: { thang, tu, gioiHan } });

// Tổng hợp CẢ HAI chiều trong một lượt. Gộp ở backend chứ không gọi hai lượt rồi
// trộn ở đây: trộn ngoài thì mỗi chiều tự cắt TOP N của riêng nó, đơn ở giữa bị mất.
export const nbDanhSachDonTatCa = (thang?: number, tu?: string, gioiHan = 200) =>
  api.get<DonNb[]>("/nb/don/tat-ca", { params: { thang, tu, gioiHan } });

export const nbLayDon = (maHd: string) =>
  api.get<DonNb>(`/nb/don/chi-tiet/${encodeURIComponent(maHd)}`);

// Đơn GẦN NHẤT của một khách, kèm đủ dòng hàng — cho "dùng lại đơn trước".
// Lọc theo maKh phải làm ở backend: tham số `tu` của nbDanhSachDon chỉ tìm trong
// ma_hd và ten_kh, truyền mã khách vào đó sẽ ra rỗng hoặc trúng nhầm khách khác.
// Khách chưa từng mua -> backend trả 204, axios cho data = "" -> quy về null.
export const nbDonGanNhat = async (huong: HuongDon, maKh: string) => {
  const r = await api.get<DonNb | "">(`/nb/don/gan-nhat/${huong}`, { params: { maKh } });
  return r.status === 204 || !r.data ? null : (r.data as DonNb);
};

export const nbLuuDon = (huong: HuongDon, d: Partial<DonNb>) =>
  api.post<DonNb>(`/nb/don/${huong}`, d);

export const nbXoaDon = (maHd: string) =>
  api.delete(`/nb/don/${encodeURIComponent(maHd)}`);

// ---------- Gói hàng (BR-NB-08) ----------
export const nbDanhSachGoi = (thang?: number, trangThai?: TrangThaiGoi, gioiHan = 100) =>
  api.get<GoiHd[]>("/nb/goi", { params: { thang, trangThai, gioiHan } });

export const nbLayGoi = (maGoi: string) =>
  api.get<GoiHd>(`/nb/goi/${encodeURIComponent(maGoi)}`);

export const nbLuuGoi = (d: Partial<GoiHd>) => api.post<GoiHd>("/nb/goi", d);

export const nbGhepDonVaoGoi = (maGoi: string, dsMaHd: string[]) =>
  api.post<{ message: string; soDon: number }>(
    `/nb/goi/${encodeURIComponent(maGoi)}/ghep`, dsMaHd);

export const nbRutDonKhoiGoi = (dsMaHd: string[]) =>
  api.post<{ message: string; soDon: number }>("/nb/goi/rut", dsMaHd);

// CHỐT GÓI -> sinh phiếu soạn hàng (snapshot) + khóa sửa đơn con
// KHÔNG còn nút nào gọi hàm này: phiếu gói giờ TỰ dựng lại sau mỗi lần ghép/rút đơn
// (xem DungLaiSnapshot bên NoiBoService). Giữ endpoint để gọi tay khi cần dựng lại
// snapshot của một gói cũ, hoặc lỡ có gói nào lệch.
export const nbChotGoi = (maGoi: string) =>
  api.post<GoiHd>(`/nb/goi/${encodeURIComponent(maGoi)}/chot`);

// XUẤT GÓI -> đóng dấu ngayNh hàng loạt (lúc này mới trừ kho)
export const nbXuatGoi = (maGoi: string, ngayXuat?: string) =>
  api.post<GoiHd>(`/nb/goi/${encodeURIComponent(maGoi)}/xuat`, null,
                  { params: { ngayXuat } });
