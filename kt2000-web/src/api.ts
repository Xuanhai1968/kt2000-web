import axios from "axios";

// Đường dẫn tương đối: dev thì Vite proxy sang backend (vite.config.ts),
// còn bản publish backend tự phục vụ frontend nên cùng gốc, không phải sửa gì.
const api = axios.create({ baseURL: "/api" });

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