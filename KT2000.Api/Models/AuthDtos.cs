namespace KT2000.Api.Models
{
    // ---- Requests ----
    public class GetTenantsRequest
    {
        public string Username { get; set; } = "";
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
}
