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
    }
    public class ImportJobRequest
    {
        public Guid TenantId { get; set; }
        public int Nam { get; set; }
        public int Thang { get; set; }
        public bool XoaTruocKhiGhi { get; set; } = false;
    }
}
