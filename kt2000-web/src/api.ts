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

export const getTenants = (username: string) =>
  api.post<GetTenantsResponse>("/auth/get-tenants", { username });

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
  khaiQuy: boolean;      // false = khai THÁNG → FRM_LAY_HDDT tô đỏ
  fiscalYears: number[];
}

export interface UpdateTenantPayload {
  name: string;
  taxCode?: string;
  address?: string;
  isActive: boolean;
  khaiQuy: boolean;
}

export const updateTenant = (id: string, p: UpdateTenantPayload) =>
  api.put(`/admin/tenants/${id}`, p);

export const getAdminTenants = () => api.get<AdminTenant[]>("/admin/tenants");
export interface CreateTenantPayload {
  code: string;
  name: string;
  taxCode?: string;
  address?: string;
  firstYear: number;
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

export const getLeftoverFiles = (
  tenantIds: string[], nam: number, thangBd: number, thangKt: number, huong: HuongLay
) => api.post<LeftoverInfo[]>("/admin/leftover-files",
                              { tenantIds, nam, thangBd, thangKt, huong });

export const importJob = (
  tenantId: string, nam: number, thang: number, huong: HuongLay, xoaTruocKhiGhi = false
) => api.post<ImportJobResult>("/admin/import-job",
                               { tenantId, nam, thang, huong, xoaTruocKhiGhi });