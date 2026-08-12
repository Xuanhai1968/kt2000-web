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
  // sessionStorage: phiên tách theo TAB — xem AuthContext.tsx để biết vì sao
  const token = sessionStorage.getItem("kt2000_token");
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
      sessionStorage.removeItem("kt2000_token");
      sessionStorage.removeItem("kt2000_session");
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
//
// chiDonViThue = true (NT-02): bỏ luôn cả tenant 'noibo'. Dùng cho MỌI màn hình
// nghiệp vụ thuế — form Lấy HĐĐT hôm nay, Báo cáo thuế mai sau. Một chỗ lọc dùng
// chung, không form nào tự lọc lấy.
export const getAdminTenants = (baoGomNoiBo = false, chiDonViThue = false) =>
  api.get<AdminTenant[]>("/admin/tenants", { params: { baoGomNoiBo, chiDonViThue } });

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
// "vao" = chỉ đầu vào, "ra" = chỉ đầu ra, "all" = cả hai.
// Có "ra" từ khi màn Hóa đơn đầu ra dùng lại đúng bộ máy này, chỉ khác hướng.
export type HuongLay = "vao" | "ra" | "all";

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
  // NT-04: đếm CẢ HAI hướng bất kể lần này lấy hướng nào — hai cột V/R nói hiện
  // trạng trên đĩa, không nói lựa chọn sắp tới
  soVao: number;
  soRa: number;
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

  // NT-01: hướng + số tải thực tế, đọc thẳng từ status.json
  huong: string;          // VAO | RA | VAO+RA
  taiOk: number;
  taiLoi: number;
  soFile: number;
  // Tách hai loại "không tải được": 500-không-có-hồ-sơ-gốc là ca HỢP LỆ (điện,
  // viễn thông, ngân hàng), còn 429/504 mới là thứ phải đi xem lại
  khongCoGoc: number;
  loiThat: number;
  nguonDs: string;        // excel | search

  // Chạy "cả vào cả ra" thì bốn số trên là TỔNG. Tách sẵn theo hướng để nhìn biết
  // ngay file nào của bên nào, HĐ không có gốc thuộc đầu vào hay đầu ra.
  // Script đời cũ không gửi mấy số này -> backend trả 0, màn hình tự ẩn phần tách.
  tongVao: number;
  taiOkVao: number;
  khongCoGocVao: number;
  loiThatVao: number;
  tongRa: number;
  taiOkRa: number;
  khongCoGocRa: number;
  loiThatRa: number;
  napMoiVao: number;
  napSuaVao: number;
  napMoiRa: number;
  napSuaRa: number;

  // NT-03: pha nạp chạy ngay sau pha lấy, trong cùng một lượt
  phaNap: string;         // "" | dang_nap | xong | loi
  napMoi: number;
  napCapNhat: number;
  napLoi: number;
  napThongDiep: string | null;
}

// NT-07: lịch sử các lần lấy, đọc từ ActivityLog nên theo TÀI KHOẢN, không theo máy
export interface LichSuLay {
  id: number;
  at: string;             // ISO, vd 2026-08-08T09:15:30
  nguoiChay: string;
  thanhCong: boolean;
  nam: number | null;
  thang: number | null;
  noiDung: string | null;
  donVi: string | null;
}

export const getFetchHistory = (soDong = 7) =>
  api.get<LichSuLay[]>("/admin/fetch-history", { params: { soDong } });

export interface PhienLay {
  dangChay: boolean;
  nguoiChay: string | null;
  batDau: string | null;
  // Hướng người dùng yêu cầu lúc bấm Lấy — để màn Đầu vào và Đầu ra không hiện
  // tiến độ của nhau. Cả hệ thống chỉ có MỘT phiên chạy tại một thời điểm.
  huong: HuongLay | "";
  cac: TienDoLay[];
}

// NT-03: một nút duy nhất — lấy xong backend nạp luôn, nên xoaTruocKhiGhi (lựa chọn
// của pha nạp) phải gửi kèm ngay từ lúc bắt đầu.
// tangDan: bật cờ --tang_dan của script — bỏ tải hóa đơn đã có đường dẫn XML trong
// Excel tổng. Màn hình luôn gửi true (chốt Trường 11/08, gộp hai nút làm một); tham
// số vẫn giữ mặc định false để đường gọi khác — cron, script — chủ động chọn được.
export const fetchStart = (
  tenantIds: string[], nam: number, thangBd: number, thangKt: number,
  huong: HuongLay, xoaTruocKhiGhi: boolean, tangDan = false
) => api.post<PhienLay>("/admin/fetch-start",
      { tenantIds, nam, thangBd, thangKt, huong, xoaTruocKhiGhi, tangDan });

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
  // TChat của TCT: "1" hàng hóa/dịch vụ · "2" khuyến mại · "3" CHIẾT KHẤU thương mại
  // · "4" ghi chú. Dòng "3" ghi thành tiền DƯƠNG nhưng bản chất là TRỪ.
  tinhChat: string;
  // STCKhau — chiết khấu của RIÊNG dòng này. Khác HoaDonConLai.tienCk (chiết khấu
  // của cả hóa đơn, lấy từ TTCKTMai). Hai con số khác nhau, đừng gộp.
  chietKhau: number;
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
  tienCk: number;        // TToan/TTCKTMai — chiết khấu thương mại toàn hóa đơn
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
  tenHang: string;
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
}

export interface DonNbLine {
  sttLine: number;
  maHang: string | null;
  tenHang: string | null;
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
  diaChi: string | null;
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

export const nbTimHang = (tu?: string, gioiHan = 50) =>
  api.get<DmHangNb[]>("/nb/hang", { params: { tu, gioiHan } });

export const nbLuuHang = (d: Partial<DmHangNb>) => api.post<DmHangNb>("/nb/hang", d);

export const nbTimKh = (tu?: string, loaiDt?: LoaiDoiTuong, gioiHan = 50) =>
  api.get<DmKhNb[]>("/nb/kh", { params: { tu, loaiDt, gioiHan } });

export const nbLuuKh = (d: Partial<DmKhNb>) => api.post<DmKhNb>("/nb/kh", d);

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

export const nbChotGoi = (maGoi: string) =>
  api.post<GoiHd>(`/nb/goi/${encodeURIComponent(maGoi)}/chot`);

// XUẤT GÓI -> đóng dấu ngayNh hàng loạt (lúc này mới trừ kho)
export const nbXuatGoi = (maGoi: string, ngayXuat?: string) =>
  api.post<GoiHd>(`/nb/goi/${encodeURIComponent(maGoi)}/xuat`, null,
                  { params: { ngayXuat } });

export interface HoaDonLine {
  sttLine: number;
  maHang: string | null;
  tenHang: string;
  dvt: string | null;
  soLuong: number;
  donGia: number;
  thanhTien: number;
  ptVat: number;
  tienCk: number;
  ghiNo: string | null;
  ghiCo: string | null;
  maNgan: string | null;
  tinhChat: string | null;
  ghiChu: string | null;
}

// Một hóa đơn GTGT trong sổ thuế — ánh xạ HOA_DON
export interface HoaDonThue {
  maHd: string;
  huong: string | null;          // VAO | RA (cột tính sẵn của bảng)
  ngay: string | null;           // ISO date
  ngayNh: string | null;
  thang: number | null;
  khhd: string | null;
  soHd: string | null;
  mst: string | null;
  tenKh: string | null;
  diaChi: string | null;
  nguoiGiaoDich: string | null;
  soPtc: string | null;
  maTv: string | null;
  tenTv: string | null;
  tienHang: number;
  tienVat: number;
  tienCk: number;
  tongTien: number;
  soDongHang: number;
  ghiNo: string | null;
  ghiCo: string | null;
  maCtNo: string | null;
  maCtCo: string | null;
  ghiChu: string | null;
  tthaiHd: string | null;
  tichChatHdLienquan: string | null;
  loaiHdLienquan: string | null;
  mauSoHdLienquan: string | null;
  khhdLienquan: string | null;
  sohdLienquan: string | null;
  ngayLienquan: string | null;
  lines: HoaDonLine[];
}

export const thueDanhSachHoaDon = (
  huong?: "VAO" | "RA", thang?: number, tu?: string, gioiHan = 200
) => api.get<HoaDonThue[]>("/thue/hoa-don", { params: { huong, thang, tu, gioiHan } });

export const thueChiTietHoaDon = (maHd: string) =>
  api.get<HoaDonThue>(`/thue/hoa-don/${encodeURIComponent(maHd)}`);

export const thueLinesNhieuHoaDon = (maHds: string[]) =>
  api.post<Record<string, HoaDonLine[]>>("/thue/hoa-don/lines", { maHds });

export const thueHtmlHoaDon = (maHd: string) =>
  api.get<string>(`/thue/hoa-don/${encodeURIComponent(maHd)}/html`,
                  { responseType: "text" });
