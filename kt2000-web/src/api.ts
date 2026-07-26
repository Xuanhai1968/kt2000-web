import axios from "axios";

const api = axios.create({ baseURL: "http://localhost:5000/api" });

// Gan token vao moi request sau khi login
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("kt2000_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

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