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

export const saveTctCredential = (tenantId: string, matKhau: string) =>
  api.put("/admin/tct-credential", { tenantId, matKhau });

// Đọc ngược mật khẩu ra. Đường RIÊNG chứ không gộp vào getTctCredential: mỗi lượt gọi
// đây đều ghi một dòng nhật ký, mà getTctCredential thì màn hình tự gọi mỗi lần đổi đơn vị.
export interface TctCredentialXem {
  code: string;
  matKhau: string;
}
export const xemTctCredential = (tenantId: string) =>
  api.get<TctCredentialXem>("/admin/tct-credential/xem", { params: { tenantId } });

// Sổ so với bản gốc TCT (IN_VALUE_LINE — số của file Excel danh sách của cổng).
// Chỉ gọi khi bật "So sánh dữ liệu": phần lớn thời gian không ai cần, mà đơn vị nào
// chưa nạp lại thì bảng gốc còn trống nên gọi cũng chẳng ra gì.
//
// tienHangSo KHÔNG bằng cột tienHang của danh sách hóa đơn: cột kia là Σ(SL×ĐG) thuần,
// còn cái này đã trừ chiết khấu và đảo dấu dòng chiết khấu — xem DoiChieuHdDto bên
// backend. Đừng thay bằng x.tienHang cho tiện, mọi HĐ có chiết khấu sẽ báo lệch giả.
export interface DoiChieuHd {
  // Hóa đơn đã lên sổ: chính là ma_hd. Hóa đơn CHỈ có ở cổng: "khhd|so_hd" — không có
  // ma_hd nào để lấy, mà lưới vẫn cần một khóa ổn định.
  maHd: string;
  tienHangSo: number;
  tienVatSo: number;
  tienHangGoc: number;
  tienVatGoc: number;
  tthaiGoc: string | null;
  // false = cổng có liệt kê mà HOA_DON không có dòng nào (file XML tải hỏng, hoặc hóa
  // đơn bị đá ra vì lệch Σ). Hai cột "sổ" khi đó về 0 nhưng KHÔNG được hiện 0: "sổ ghi
  // bằng không" khác hẳn "sổ không có dòng nào".
  coTrongSo: boolean;
  khhd: string | null;
  soHd: string | null;
  ngay: string | null;      // ISO date
  tenKh: string | null;
  mst: string | null;
}
export const layDoiChieuHd = (huong: "vao" | "ra") =>
  api.get<DoiChieuHd[]>("/thue/hoa-don/doi-chieu", { params: { huong } });

// Dựng lại bản gốc từ file Excel danh sách đã có trên đĩa — KHÔNG vào mạng, KHÔNG đụng
// sổ. Dành cho hóa đơn nạp trước 15/08 nên chưa có dòng trong IN_VALUE_LINE.
export interface KetQuaDungGoc {
  soFile: number;
  them: number;
  sua: number;
  loi: string[];
}
export const dungBanGocTct = (huong: "vao" | "ra") =>
  api.post<KetQuaDungGoc>("/thue/hoa-don/dung-ban-goc", null, { params: { huong } });

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
// Đọc ĐƯỜNG DẪN file trên đĩa từ header X-Duong-Dan (server mã hóa URL vì header
// HTTP chỉ nhận ASCII mà đường dẫn có dấu cách và dấu tiếng Việt).
// Giải mã hỏng thì trả nguyên bản chứ KHÔNG ném lỗi — đây chỉ là thông tin THÊM,
// không được phép làm hỏng việc xem hóa đơn.
const docDuongDan = (h: unknown): string | null => {
  const tho = (h as Record<string, string> | undefined)?.["x-duong-dan"];
  if (!tho) return null;
  try { return decodeURIComponent(tho); } catch { return tho; }
};

// Trả HTML (y như cũ) KÈM đường dẫn đầy đủ trên đĩa để hiện nhãn nguồn.
export const getRawHtml = async (
  tenantId: string, nam: number, thang: number, huong: string, tenFile: string
) => {
  const r = await api.get<string>("/admin/raw-html", {
    params: { tenantId, nam, thang, huong, tenFile },
    responseType: "text",
  });
  return { html: r.data, duongDan: docDuongDan(r.headers) };
};

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
  ghiNoVat: string | null;
  ghiCoVat: string | null;
  ghiChu: string | null;
  tthaiHd: string | null;
  vat: number | null;
  // Thuế suất lấy từ DÒNG — lùi về đây khi vat trống. Hai đơn vị ghi hai chỗ khác
  // nhau, và hóa đơn khuyết đơn giá thì vat luôn trống vì lúc nạp không suy ra được.
  vatLine: number | null;
  tichChatHdLienquan: string | null;
  loaiHdLienquan: string | null;
  mauSoHdLienquan: string | null;
  khhdLienquan: string | null;
  sohdLienquan: string | null;
  ngayLienquan: string | null;
  trangThaiHdLienQuan: string | null;
  lines: HoaDonLine[];
}

export const thueDanhSachHoaDon = (
  huong?: "VAO" | "RA", thang?: number, tu?: string, gioiHan = 200
) => api.get<HoaDonThue[]>("/thue/hoa-don", { params: { huong, thang, tu, gioiHan } });

export const thueChiTietHoaDon = (maHd: string) =>
  api.get<HoaDonThue>(`/thue/hoa-don/${encodeURIComponent(maHd)}`);

export const thueLinesNhieuHoaDon = (maHds: string[]) =>
  api.post<Record<string, HoaDonLine[]>>("/thue/hoa-don/lines", { maHds });

// Ghi lại TOÀN BỘ dòng hàng của một hóa đơn (xóa hết rồi chèn lại, trong một
// transaction). Không đụng bảng HOA_DON — cột định khoản của header là việc khác.
export const thueLuuLinesHoaDon = (maHd: string, lines: HoaDonLine[]) =>
  api.put<{ message: string; soDong: number }>(
    `/thue/hoa-don/${encodeURIComponent(maHd)}/lines`, lines);

// ===== BÁO CÁO THUẾ GTGT (FRM_BC_THUE) =====

// Một dòng bảng kê hóa đơn mua vào / bán ra
export interface BangKeHoaDon {
  stt: number;
  maHd: string;
  khHd: string | null;
  soHd: string | null;
  ngay: string | null;
  tenDoiTac: string | null;
  mstDoiTac: string | null;
  matHang: string | null;
  doanhThuChuaVat: number;
  thueSuat: number | null;
  thueGtgt: number;
  ghiChu: string | null;
}

// Một chỉ tiêu trên tờ khai 01/GTGT. stt là CHUỖI ("2a", "3c") chứ không phải số.
export interface ChiTieuTongHop {
  stt: string;
  chiTieu: string;
  doanhThuChuaVat: number | null;
  thueGtgt: number | null;
  laDongChinh: boolean;
}

// Một mức thuế suất, gom từ DÒNG hàng (HOA_DON_LINE.pt_vat) — KHÁC thueSuat của
// BangKeHoaDon vốn là số đại diện ở header. Hóa đơn trộn nhiều mức thì header cho ra
// %VAT bình quân (6%, 7%…) không tồn tại trong luật thuế; nhóm này gom đúng theo dòng
// nên khớp với engine tờ khai (BR-TK-18).
export interface NhomSuat {
  thueSuat: number;      // âm = không chịu thuế / không kê khai
  soHd: number;
  doanhThu: number;
  thue: number;
}

export interface BaoCaoThue {
  nam: number;
  thang: number | null;
  muaVao: BangKeHoaDon[];
  banRa: BangKeHoaDon[];
  nhomBanRa: NhomSuat[];
  nhomMuaVao: NhomSuat[];
  tongHop: ChiTieuTongHop[];
}

// thang bỏ trống = cả năm
export const thueBaoCao = (thang?: number) =>
  api.get<BaoCaoThue>("/thue/bao-cao", { params: { thang } });

// ===== RÀ SOÁT CHÉO NHIỀU ĐƠN VỊ (chỉ MDN_NB) =====
// Một đơn vị một dòng. Nguồn từng cột xem ToKhaiRaSoatService bên server.
export interface DongRaSoatToKhai {
  stt: number;
  maDonVi: string;
  tenDonVi: string | null;
  mst: string | null;          // để màn Tạo tờ khai điền sẵn ô [05]
  khaiQuy: boolean;
  kyKeKhai: string | null;    // '07/2026' hoặc 'Q3/2026'
  tonDau: number | null;
  tonDauXml: number | null;
  v1: number; r1: number;
  v2: number; r2: number;
  v3: number; r3: number;
  tonCuoi: number | null;
  tonXml: number | null;
  lech: number | null;
  coToKhai: boolean;
  mau01: string | null;       // mã tờ khai đã nộp ('842' = mẫu 01/GTGT)
  soHdSo: number;             // số hóa đơn đếm trong SỔ cả kỳ
  lechTonDau: boolean;
  lechTonCuoi: boolean;
}

export interface BangRaSoatCheo {
  nam: number;
  thang: number;
  dong: DongRaSoatToKhai[];
}

export const thueRaSoatCheo = (nam?: number, thang?: number) =>
  api.get<BangRaSoatCheo>("/thue/ra-soat-cheo", { params: { nam, thang } });

// Báo cáo thuế của MỘT đơn vị bất kỳ — chỉ MDN_NB gọi được. Khác thueBaoCao ở chỗ
// đơn vị lấy từ tham số chứ không từ claim của phiên đăng nhập.
export const thueBaoCaoDonVi = (ma: string, nam?: number, thang?: number) =>
  api.get<BaoCaoThue>("/thue/bao-cao-don-vi", { params: { ma, nam, thang } });

// ===== RÀ SOÁT DỮ LIỆU TRƯỚC KHI KHAI THUẾ =====
// Đối chiếu hóa đơn trong FILE với hóa đơn trong SỔ. Server CHỈ ĐỌC, không ghi.

// Một hóa đơn đọc được từ file XML/Excel, gửi lên để đối chiếu
export interface HoaDonFile {
  tenFile: string;
  huong: string;          // VAO | RA
  mst: string;            // MST đối tác
  khhd: string;
  soHd: string;
  ngay?: string | null;
  tenDoiTac?: string | null;
  tienHang: number;
  tienVat: number;
}

// Một vấn đề tìm được. Dùng chung cho cả bốn loại nên trường nào không hợp với
// loại đó thì null.
export interface VanDeRaSoat {
  loai: string;           // thieu-trong-so | lech-tien | trung-so | sai-ky…
  maHd?: string | null;
  khhd?: string | null;
  soHd?: string | null;
  mst?: string | null;
  tenDoiTac?: string | null;
  ngay?: string | null;
  huong?: string | null;
  tenFile?: string | null;
  tienHangFile?: number | null;
  tienVatFile?: number | null;
  tienHangSo?: number | null;
  tienVatSo?: number | null;
  moTa: string;
}

export interface KetQuaRaSoat {
  nam: number;
  thang: number | null;
  soHdFile: number;
  soHdSo: number;
  thieuTrongSo: VanDeRaSoat[];
  thieuTrongFile: VanDeRaSoat[];
  lechTien: VanDeRaSoat[];
  trung: VanDeRaSoat[];
  saiKy: VanDeRaSoat[];
}

// Client tự đọc file rồi gửi danh sách lên
// maDonVi: chỉ MDN_NB truyền, để rà soát sổ của ĐƠN VỊ KHÁC. Bỏ trống = đơn vị
// đang đăng nhập. Server tra lại Master trước khi dùng (luật 9).
export const thueRaSoat = (thang: number | undefined, hoaDon: HoaDonFile[],
                           maDonVi?: string) =>
  api.post<KetQuaRaSoat>("/thue/ra-soat", { hoaDon }, { params: { thang, maDonVi } });

// ===================== TỜ KHAI 01/GTGT =====================
// Xem docs/NB/SPEC-TO-KHAI-01-GTGT.md

export interface NhomThueSuat {
  thueSuat: number;
  loaiThue: string | null;
  soDong: number;
  tienHangGop: number;
  chietKhau: number;
  doanhThu: number;
  thue: number;
}

export interface CanhBaoToKhai {
  ma: string;
  muc: "CHAN" | "CANH_BAO";
  moTa: string;
  maHd: string | null;
  chenhLech: number | null;
}

export interface PhuLucNq142 {
  giaTriHhdvMuaVao: number;
  thueGtgtHhdvMuaVao: number;
  giaTriHhdvBanRa: number;
  thueSuatTheoQuyDinh: number;
  thueSuatSauGiam: number;
  thueGtgtDuocGiam: number;
  chenhLechCt9: number;
}

// Tên trường giữ đúng mã chỉ tiêu HTKK (ct21, ct22…) — khi đối chiếu với tờ khai
// giấy hay XML gốc thì mã chỉ tiêu là thứ duy nhất hai bên cùng gọi tên.
export interface ToKhaiGtgt {
  nam: number;
  thang: number;
  maDonVi: string;
  mst: string;
  tenNnt: string;
  diaChiNnt: string | null;
  maCqtNoiNop: string | null;
  tenCqtNoiNop: string | null;
  ct21: number; ct22: number; ct23: number; ct24: number;
  ct23a: number; ct24a: number; ct25: number; ct26: number;
  ct27: number; ct28: number; ct29: number; ct30: number;
  ct31: number; ct32: number; ct33: number; ct32a: number;
  ct34: number; ct35: number; ct36: number; ct37: number;
  ct38: number; ct39a: number; ct40a: number; ct40b: number;
  ct40: number; ct41: number; ct42: number; ct43: number;
  phuLucNq142: PhuLucNq142 | null;
  nhomBanRa: NhomThueSuat[];
  nhomMuaVao: NhomThueSuat[];
  canhBao: CanhBaoToKhai[];
  nguonCt22: string | null;
  choXuat: boolean;
  tenFileXml: string;
}

// ===== BC LẤY TỜ KHAI XML — danh sách tờ khai đã lưu =====
export interface DongBcToKhai {
  stt: number;
  maDonVi: string;
  tenDonVi: string | null;
  nam: number;
  thang: number;
  kyKeKhai: string;
  lanNop: number;
  // null = kỳ đó chưa khai chỉ tiêu này → ô TRỐNG, không hiện 0
  tonDau: number | null;
  gtMuaVao: number | null;
  vatVao: number | null;
  vatKhauTru: number | null;
  gtBanRa: number | null;
  vatRa: number | null;
  vatPhaiNop: number | null;
  tonCuoi: number | null;
  // Số gộp từ SỔ HÓA ĐƠN (khác số trên TỜ KHAI ở trên)
  gtHdVao: number | null;
  gtVatVao: number | null;
  gtHdRa: number | null;
  gtVatRa: number | null;
  // Lệch = TỜ KHAI − SỔ. null = kỳ đó chưa khai chỉ tiêu tương ứng.
  lechGtHdVao: number | null;
  lechVatVao: number | null;
  lechGtHdRa: number | null;
  lechVatRa: number | null;
  xmlName: string | null;
  // Đường dẫn VẬT LÝ nơi file cổng trả về đã được ghi (kho ScanDocRoot1).
  // null = kỳ đó chưa nạp file nào.
  xmlPath: string | null;
  daNop: boolean;            // đã có file cổng trả về = nộp xong
  ngayLap: string | null;
  nguoiLap: string | null;
  ghiChu: string | null;
}

export const thueBcToKhai = (nam?: number, ma?: string, thang?: number) =>
  api.get<{ nam: number; dong: DongBcToKhai[] }>(
    "/thue/bc-to-khai", { params: { nam, ma, thang } });

// Đường dẫn thư mục lưu tờ khai của đơn vị-kỳ — hiện cho người dùng kiểm trước khi
// bấm Lưu. Server TỰ SUY theo khuôn kho, không bắt chọn tay.
export const thueDuongDanToKhai = (ma: string, thang: number, nam?: number) =>
  api.get<{ maDonVi: string; nam: number; thang: number;
            duongDan: string; daCo: boolean }>(
    "/thue/duong-dan-to-khai", { params: { ma, thang, nam } });

// ===== DUYỆT KHO TỜ KHAI =====
export interface MucKho {
  ten: string;
  duongDan: string;
  laThuMuc: boolean;
  kich: number;              // byte; thư mục = 0
  suaLuc: string | null;
}

export interface KetQuaDuyetKho {
  duongDan: string;
  cha: string | null;
  laGoc: boolean;
  muc: MucKho[];
  duongDanXin: string;
  thieuTang: string[];
}

export const thueDuyetKhoToKhai = (duong?: string) =>
  api.get<KetQuaDuyetKho>(
    "/thue/duyet-kho-to-khai", { params: { duong: duong || undefined } });

// ===== HÓA ĐƠN THAY THẾ / ĐIỀU CHỈNH KHÁC KỲ (BR-TK-20) =====
// Quét, đánh dấu vào HOA_DON.ghi_chu và xuất một file .txt tổng hợp ra JobsRoot.
export interface DongLienQuan {
  maDonVi: string;
  huong: string;
  khhd: string;
  soHd: string;
  ngay: string | null;
  tenKh: string;
  loaiXuLy: string;          // Thay thế / Điều chỉnh / Gốc mồ côi
  trangThai: string;         // tthai_hd nguyên văn của cổng
  khhdGoc: string;
  soHdGoc: string;
  ngayGoc: string | null;
  thangGoc: number;
  namGoc: number;
  tienHang: number;
  tienVat: number;
  ghiChuMoi: string;
  daCoGhiChu: boolean;       // đã đánh dấu từ lượt trước
}

export interface KetQuaLienQuan {
  nam: number;
  thang: number;
  chiXem: boolean;
  soDonVi: number;
  soHoaDon: number;
  soDaGhi: number;
  soBoQua: number;
  duongDanFile: string | null;
  loi: string[];
  dong: DongLienQuan[];
  message: string;
}

export const thueHdLienQuanKhacKy = (
  thang: number, nam?: number, ma?: string, chiXem = true
) => api.post<KetQuaLienQuan>("/thue/hd-lien-quan-khac-ky", null,
       { params: { thang, nam, ma: ma || undefined, chiXem } });

export const thueLuuToKhaiTct = (
  file: File, ma: string, thang: number, nam?: number, ghiChu?: string,
  // Thư mục kế toán tự duyệt và chọn. Bỏ trống thì server suy theo khuôn kho.
  thuMuc?: string
) => {
  const fd = new FormData();
  fd.append("file", file);
  return api.post<{
    duongDan: string; daNapSoLieu: boolean; soLech: number;
    lech: { ma: string; tuLap: number | null; tct: number | null; lech: number | null }[];
    canhBao: string[]; message: string;
  }>("/thue/luu-to-khai-tct", fd,
     { params: { ma, thang, nam, ghiChu: ghiChu?.trim() || undefined,
                 thuMuc: thuMuc?.trim() || undefined },
       headers: { "Content-Type": "multipart/form-data" } });
};

// Nạp file XML/zip cổng TCT trả về sau khi nộp. Khớp theo MST + kỳ ghi TRONG file.
export const thueNapXmlDaNop = (file: File) => {
  const fd = new FormData();
  fd.append("file", file);
  return api.post<{
    soFile: number; soOk: number;
    ketQua: { tenFile: string; ok: boolean; message: string }[];
  }>("/thue/bc-to-khai/nap-xml", fd,
     { headers: { "Content-Type": "multipart/form-data" } });
};

export interface ToKhaiTay {
  maDonVi: string;
  nam: number;
  thang: number;
  lanNop: number;            // 0 = chính thức, 1+ = bổ sung lần thứ mấy
  maCct?: string | null;
  tenCct?: string | null;
  mst?: string | null;
  tenNnt?: string | null;
  diaChiNnt?: string | null;
  ghiChu?: string | null;
  ct21: number; ct22: number; ct23: number; ct24: number;
  ct25: number; ct26: number; ct27: number; ct28: number;
  ct29: number; ct30: number; ct31: number; ct32: number;
  ct33: number; ct32a: number; ct34: number; ct35: number;
  ct36: number; ct37: number; ct38: number; ct39: number;
  ct40a: number; ct40b: number; ct40: number; ct41: number;
  ct42: number; ct43: number;
}

// Trả 204 (data rỗng) nếu kỳ đó chưa lưu lần nào — KHÔNG phải lỗi.
export const thueDocToKhaiTay = (ma: string, thang: number, nam?: number,
                                 lanNop = 0) =>
  api.get<ToKhaiTay | "">("/thue/to-khai-tay",
                          { params: { ma, thang, nam, lanNop } });

// ===== ĐỐI CHIẾU BA NGUỒN: tờ khai · sổ hóa đơn · bản TCT trả về =====
export interface DongDoiChieu {
  ma: string;                // '22', '32a', '43'…
  ten: string;
  toKhai: number | null;     // số trên tờ khai đã lưu
  so: number | null;         // TÍNH LẠI từ sổ; null = chỉ tiêu này sổ không suy ra được
  tct: number | null;        // bản TCT trả về; null = chưa nạp
  lechSo: number | null;
  lechTct: number | null;
  coLech: boolean;
}

export const thueDoiChieu = (ma: string, thang: number, nam?: number, lanNop = 0) =>
  api.get<{
    maDonVi: string; nam: number; thang: number; lanNop: number;
    coSo: boolean; coTct: boolean; soLech: number; dong: DongDoiChieu[];
  }>("/thue/doi-chieu", { params: { ma, thang, nam, lanNop } });

export const thueLuuToKhaiTay = (tk: ToKhaiTay) =>
  api.post<{ message: string }>("/thue/to-khai-tay", tk);


export const thueDocBangKe = (file: File, maDonVi?: string) => {
  const fd = new FormData();
  fd.append("file", file);
  return api.post<{ soDong: number; hoaDon: HoaDonFile[] }>(
    "/thue/doc-bang-ke", fd,
    { params: { maDonVi }, headers: { "Content-Type": "multipart/form-data" } });
};

export interface KhoBangKe {
  thang: number;
  nam: number;
  huong: "RA" | "VAO";
  soFile: number;
  thuMucDaDo: string[];
  tong: { soHd: number; tienHang: number; tienVat: number };
  loi: string[];
  doiChieu: KetQuaRaSoat | null;
}

export const thueKhoBangKe = (thang: number, huong: "RA" | "VAO",
                              maDonVi?: string, chiTong?: boolean) =>
  api.get<KhoBangKe>("/thue/kho/bang-ke",
                     { params: { thang, huong, maDonVi, chiTong } });


export const thueLapToKhai = (thang: number, xmlKyTruoc?: string,
                              maDonVi?: string) =>
  api.post<ToKhaiGtgt>("/thue/to-khai", { xmlKyTruoc },
                       { params: { thang, maDonVi } });

export const thueToKhaiXml = (thang: number, xmlKyTruoc?: string,
                              maDonVi?: string) =>
  api.post<Blob>("/thue/to-khai/xml", { xmlKyTruoc },
                 { params: { thang, maDonVi }, responseType: "blob" });

export const thueXuLyTtDc = (thang: number, maDonVi?: string) =>
  api.post<{
    soCungKy: number; soKhacKy: number; chiTiet: string[]; message: string;
  }>("/thue/xu-ly-tt-dc", null, { params: { thang, maDonVi } });

export const thueXoaHoaDon = (maHd: string, maDonVi?: string) =>
  api.delete<{ message: string }>(
    `/thue/hoa-don/${encodeURIComponent(maHd)}`, { params: { maDonVi } });

export const thueHtmlHoaDon = async (maHd: string, maDonVi?: string) => {
  const r = await api.get<string>(
    `/thue/hoa-don/${encodeURIComponent(maHd)}/html`,
    { params: { maDonVi }, responseType: "text" });
  return { html: r.data, duongDan: docDuongDan(r.headers) };
};

// ===== BÁO CÁO TỒN KHO (SPEC-BAO-CAO-TON-KHO) =====
//
// Đơn vị và năm KHÔNG truyền lên: backend đọc từ claim trong token (BR-BC-12).
// Mọi endpoint là GET — màn báo cáo không bao giờ tự ghi (BR-BC-01).

export interface TonKhoTongHopRow {
  maTk: string;
  maHang: string;
  tenHang: string | null;
  maNh: string | null;
  tenNh: string | null;      // chưa có bảng DM_NH ⇒ luôn null
  maNgan: string | null;
  quyCach: string | null;
  slTd: number; gtTd: number;
  slNo: number; gtNo: number;
  slCo: number; gtCo: number;
  slTc: number; gtTc: number;
  giaNhap: number;
  loLai: number;
  phaiSua: boolean;          // cột DB chưa có ⇒ luôn false
  ngayPs: string | null;
}

export interface TonKhoKetQua {
  rows: TonKhoTongHopRow[];
  canTinhLaiGia: boolean;    // BR-BC-11 — chưa có chỗ lưu ⇒ luôn false
}

export interface TonKhoChiTietRow {
  ngayNh: string | null;
  tenKh: string | null;
  soHd: string | null;
  maHd: string;
  slNo: number; gtNo: number;
  slCo: number; gtCo: number;
  ghiNo: string | null;
  ghiCo: string | null;
  donGia: number;
  giaVon: number;
  dvt: string | null;
  slQd: number; dgQd: number;
  ghiChu: string | null;
  phaiSua: boolean;
}

export interface HangAmRow {
  maHang: string;
  tenHang: string | null;
  maTk: string;
  ngayAmDauTien: string | null;
  soDuKhiAm: number;
  maHdGayAm: string | null;
}

/** thang: 1–12, hoặc 13 = cả năm. */
export const layTonKho = (thang: number, includeLoLai = false, includePhaiSua = false) =>
  api.get<TonKhoKetQua>("/bao-cao/ton-kho",
    { params: { thang, includeLoLai, includePhaiSua } });

export const layTonKhoChiTiet = (maHang: string, thang: number) =>
  api.get<TonKhoChiTietRow[]>("/bao-cao/ton-kho/chi-tiet", { params: { maHang, thang } });

export const layHangAm = (thang?: number) =>
  api.get<HangAmRow[]>("/bao-cao/ton-kho/hang-am", { params: { thang } });
