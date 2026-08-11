namespace KT2000.Api.Models
{
    // ---- Requests ----
    // Có Password vì danh sách đơn vị là thông tin RIÊNG của từng người. Trước đây
    // endpoint này ẩn danh: ai cũng gõ một tên bất kỳ để soi được đơn vị nào có thật
    // và tài khoản nào có thật. Nay phải qua cửa mật khẩu mới thấy.
    public class GetTenantsRequest
    {
        public string Username { get; set; } = "";
        public string Password { get; set; } = "";
    }

    public class LoginRequest
    {
        public string Username { get; set; } = "";
        public string Password { get; set; } = "";
        public string TenantId { get; set; } = "";
        public int FiscalYear { get; set; }
        public bool GetChiNhanh { get; set; }   // checkbox "Lay chi nhanh"
    }

    // ---- Responses ----
    public class FiscalYearInfo
    {
        public int Year { get; set; }
        public bool IsClosed { get; set; }
    }

    public class TenantInfo
    {
        public string Id { get; set; } = "";
        public string Code { get; set; } = "";
        public string Name { get; set; } = "";
        public string TenantType { get; set; } = "";
        public string Role { get; set; } = "";
        public List<FiscalYearInfo> FiscalYears { get; set; } = new();
    }

    public class LastPrefs
    {
        public string? TenantCode { get; set; }
        public int? FiscalYear { get; set; }
    }

    public class GetTenantsResponse
    {
        public List<TenantInfo> Tenants { get; set; } = new();
        public LastPrefs LastPreferences { get; set; } = new();
    }

    public class LoginResponse
    {
        public string AccessToken { get; set; } = "";
        public object User { get; set; } = new();
        public object Tenant { get; set; } = new();
        public List<object> Branches { get; set; } = new();  // khi GetChiNhanh = true
        public int FiscalYear { get; set; }
    }
    public class CreateTenantRequest
    {
        public string Code { get; set; } = "";
        public string Name { get; set; } = "";
        public string? TaxCode { get; set; }
        public string? Address { get; set; }
        public int FirstYear { get; set; }
        // QT-03: 'headquarter' (mặc định, đơn vị thuế) hoặc 'noibo' (tenant NB)
        public string TenantType { get; set; } = "headquarter";
        // AD-NB-03: bắt buộc với tenant 'noibo', bỏ trống với tenant thuế
        public string? LinkedTenantCode { get; set; }
    }

    // ===== QT-01: quản lý user & phân quyền =====

    public class TaoUserRequest
    {
        public string LoginName { get; set; } = "";
        public string? RealName { get; set; }
        public string MatKhau { get; set; } = "";   // mật khẩu ban đầu, băm ngay khi lưu
        public bool IsAdmin { get; set; }
        public Guid? TenantId { get; set; }         // gán luôn một đơn vị nếu có
        public string Role { get; set; } = "accountant";
    }

    public class DoiTrangThaiUserRequest
    {
        public Guid UserId { get; set; }
        public bool IsActive { get; set; }
    }

    public class ResetMatKhauRequest
    {
        public Guid UserId { get; set; }
        public string MatKhauMoi { get; set; } = "";
    }

    // Gán/gỡ quyền của một user trên MỘT đơn vị
    public class CapQuyenRequest
    {
        public Guid UserId { get; set; }
        public Guid TenantId { get; set; }
        public string? Role { get; set; }   // null = gỡ quyền khỏi đơn vị này
    }

    // Tự đổi mật khẩu của chính mình — AD-QT-01: endpoint DUY NHẤT sống ở cả hai instance
    public class DoiMatKhauRequest
    {
        public string MatKhauCu { get; set; } = "";
        public string MatKhauMoi { get; set; } = "";
    }

    public class OpenYearsRequest
    {
        public int Year { get; set; }
        public List<string> TenantIds { get; set; } = new();
    }
    public class UpdateTenantRequest
    {
        public string Name { get; set; } = "";
        public string? TaxCode { get; set; }
        public string? Address { get; set; }
        public bool IsActive { get; set; }
        public bool KhaiQuy { get; set; }   // true = khai QUÝ, false = khai THÁNG
        public string? LinkedTenantCode { get; set; }   // AD-NB-03, chỉ dùng với tenant 'noibo'
    }
    // Hỏi: mỗi đơn vị còn bao nhiêu file gốc nằm lại raw\ (HĐ lệch Σ line vs master)
    public class LeftoverRequest
    {
        public List<string> TenantIds { get; set; } = new();
        public int Nam { get; set; }
        public int ThangBd { get; set; } = 1;
        public int ThangKt { get; set; } = 12;
        public string Huong { get; set; } = "vao";   // vao = chỉ đầu vào, all = cả vào và ra
    }
    // Khai mật khẩu cổng Tổng cục Thuế cho một đơn vị.
    // Mật khẩu thô CHỈ tồn tại trong request này rồi được mã hóa ngay — không ghi log,
    // không lưu thô, không có API nào đọc ngược ra.
    public class LuuMatKhauTctRequest
    {
        public Guid TenantId { get; set; }
        public string MatKhau { get; set; } = "";
    }

    // Bắt đầu phiên lấy HĐ từ cổng TCT cho nhiều đơn vị × khoảng tháng
    public class BatDauLayHdRequest
    {
        public List<string> TenantIds { get; set; } = new();
        public int Nam { get; set; }
        public int ThangBd { get; set; } = 1;
        public int ThangKt { get; set; } = 1;
        public string Huong { get; set; } = "vao";
        // NT-03: lấy xong nạp luôn, nên lựa chọn của pha nạp phải gửi kèm ngay từ đầu
        public bool XoaTruocKhiGhi { get; set; } = false;
        // [ĐANG THỬ] bật cờ --tang_dan của script: bỏ tải hóa đơn đã có XML.
        // Mặc định false — nút "Lấy hóa đơn điện tử" thường vẫn chạy đầy đủ như cũ.
        public bool TangDan { get; set; } = false;
    }

    // Xem chi tiết các hóa đơn còn nằm lại raw\ của MỘT đơn vị
    public class RawFilesRequest
    {
        public Guid TenantId { get; set; }
        public int Nam { get; set; }
        public int ThangBd { get; set; } = 1;
        public int ThangKt { get; set; } = 12;
        public string Huong { get; set; } = "vao";
    }
    // Một dòng hàng do người dùng sửa tay trước khi nạp
    public class MatHangSua
    {
        public int Stt { get; set; }
        public string TenHang { get; set; } = "";
        public string Dvt { get; set; } = "";
        public decimal SoLuong { get; set; }
        public decimal DonGia { get; set; }
        public decimal ThanhTien { get; set; }
        public string ThueSuat { get; set; } = "";
        public string TinhChat { get; set; } = "1";
    }

    // Nạp TAY một hóa đơn (đã sửa) từ file XML còn nằm lại raw\ vào database đơn vị-năm
    public class ImportOneRequest
    {
        public Guid TenantId { get; set; }
        public int Nam { get; set; }
        public int Thang { get; set; }
        public string Huong { get; set; } = "VAO";
        public string TenFile { get; set; } = "";
        public string MauSo { get; set; } = "";
        public string KhHd { get; set; } = "";
        public string SoHd { get; set; } = "";
        public string Ngay { get; set; } = "";      // yyyy-MM-dd
        public string Mst { get; set; } = "";       // MST đối tác (ghi vào cột mst)
        // MST NGƯỜI BÁN trên hóa đơn — dùng dựng ma_hd theo BR-HD-01. Khác Mst ở hóa
        // đơn đầu ra: khi đó Mst là người mua, còn người bán chính là đơn vị mình.
        public string MstPhatHanh { get; set; } = "";
        public string TenKh { get; set; } = "";
        public string DiaChi { get; set; } = "";
        public decimal TienHang { get; set; }
        public decimal TienVat { get; set; }
        public decimal TienCk { get; set; }
        public List<MatHangSua> MatHangs { get; set; } = new();
    }
    public class ImportJobRequest
    {
        public Guid TenantId { get; set; }
        public int Nam { get; set; }
        public int Thang { get; set; }
        public bool XoaTruocKhiGhi { get; set; } = false;
        public string Huong { get; set; } = "vao";   // vao = chỉ đầu vào, all = cả vào và ra
    }

    // NT-03: trước đây ImportJob trả anonymous type — controller serialize thì tiện,
    // nhưng TctFetchService (gộp lấy + nạp) không đọc nổi kết quả để báo lên Diễn biến.
    // Đặt tên hẳn hoi; hình dạng JSON camelCase giữ nguyên nên frontend không phải sửa.
    public class LoiNapDto
    {
        public string MaHd { get; set; } = "";
        public string LoaiLoi { get; set; } = "";
        public string? Reason { get; set; }
    }

    // Nạp "cả vào cả ra" trong một lượt thì các số dưới là TỔNG — nhìn vào không biết
    // 27 HĐ không có gốc là của đầu vào hay đầu ra (chốt Trường 11/08).
    public class NapTheoHuong
    {
        public int Inserted { get; set; }
        public int Updated { get; set; }
        public int KhongCoGoc { get; set; }
        public int LechTong { get; set; }
    }

    public class KetQuaNapJob
    {
        public int Inserted { get; set; }
        public int Updated { get; set; }
        public int SkippedYear { get; set; }
        public int SkippedNoDate { get; set; }
        public int KhongCoGoc { get; set; }
        public int Moved { get; set; }
        public int LechTong { get; set; }
        public List<LoiNapDto> Errors { get; set; } = new();

        // Khóa là "VAO" / "RA". Chỉ nạp một hướng thì đúng một khóa — màn hình dựa vào
        // số khóa để quyết định có hiện phần tách hay không.
        public Dictionary<string, NapTheoHuong> TheoHuong { get; set; } = new();
    }
}
