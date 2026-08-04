namespace KT2000.Api.Models
{
    public class User
    {
        public Guid Id { get; set; }
        public string LoginName { get; set; } = "";
        public string PasswordHash { get; set; } = "";
        public string? RealName { get; set; }
        public bool IsAdmin { get; set; }
        public bool IsActive { get; set; }
        public DateTime CreatedAt { get; set; }
    }

    public class Tenant
    {
        public Guid Id { get; set; }
        public string Code { get; set; } = "";
        public string Name { get; set; } = "";
        public string DbName { get; set; } = "";
        public string TenantType { get; set; } = "headquarter";
        public Guid? ParentId { get; set; }
        public string? TaxCode { get; set; }
        public string? Address { get; set; }
        public bool IsActive { get; set; }
        public decimal? VonDK { get; set; }
        public string? Email { get; set; }
        public string? SortName { get; set; }
        public string? TkCongNo { get; set; }
        public int? NamQuyetToan { get; set; }
        public bool KhaiQuy { get; set; }

        // Mật khẩu cổng Tổng cục Thuế — LUÔN là chuỗi đã qua Data Protection.
        // [JsonIgnore] là lưới an toàn: Tenants bị đọc ở rất nhiều chỗ, chỉ cần một
        // nơi lỡ trả nguyên thực thể là chuỗi mã hóa đi thẳng ra trình duyệt.
        [System.Text.Json.Serialization.JsonIgnore]
        public string? MatKhauHddt { get; set; }
        public DateTime? MkHddtCapNhatLuc { get; set; }
        public string? MkHddtCapNhatBoi { get; set; }

        public List<FiscalYear> FiscalYears { get; set; } = new();
    }

    public class UserTenantAccess
    {
        public Guid UserId { get; set; }
        public Guid TenantId { get; set; }
        public string Role { get; set; } = "accountant";
        public User? User { get; set; }
        public Tenant? Tenant { get; set; }
    }

    public class FiscalYear
    {
        public Guid TenantId { get; set; }
        public int Year { get; set; }
        public bool IsClosed { get; set; }
    }

    public class UserPreference
    {
        public Guid UserId { get; set; }
        public string Key { get; set; } = "";
        public string? Value { get; set; }
    }
    // Dòng kết quả đếm lỗi nạp theo (đơn vị × tháng × loại lỗi) — không phải bảng,
    // chỉ là khuôn hứng GROUP BY của ImportError (xem 011_master_import_errors.sql)
    public class ImportErrorRow
    {
        public Guid TenantId { get; set; }
        public int Thang { get; set; }
        public string LoaiLoi { get; set; } = "";
        public int SoLuong { get; set; }
    }

    // Khuôn hứng chi tiết lỗi nạp của một hóa đơn — dùng để gắn lý do vào danh sách
    // file còn lại trong raw\ (không phải bảng, chỉ là kết quả SELECT)
    public class ImportErrorDetail
    {
        public string MaHd { get; set; } = "";
        public int Thang { get; set; }
        public string? LyDo { get; set; }
    }

    public class TenantChangeLog
    {
        public int Id { get; set; }
        public Guid TenantId { get; set; }
        public string ChangedBy { get; set; } = "";
        public DateTime ChangedAt { get; set; }
        public string Changes { get; set; } = "";
    }
}