using Microsoft.Data.SqlClient;
using System.Text.RegularExpressions;

namespace KT2000.Api.Services
{
    // CỬA DUY NHẤT ghép tên database đơn vị-năm (quyết định 24-07 trong Nhật ký).
    // CẤM mọi nơi khác tự ghép chuỗi tên DB — review PR thấy là trả về sửa.
    public class TenantDbResolver
    {
        private readonly IConfiguration _config;
        public TenantDbResolver(IConfiguration config) => _config = config;

        // BR-DB-01: A-Z đầu, chỉ A-Z 0-9 _, dài 3-30, không kết thúc bằng _
        public static bool IsValidCode(string? code) =>
            code != null && Regex.IsMatch(code, "^[A-Z][A-Z0-9_]{1,28}[A-Z0-9]$");

        public string BuildDbName(string code, int year)
        {
            if (!IsValidCode(code))
                throw new ArgumentException("MA_DONVI không hợp lệ (chỉ A-Z, 0-9, dấu _)");
            if (year < 2000 || year > 2100)
                throw new ArgumentException("Năm không hợp lệ");
            return $"{code}_{year}";
        }

        public string GetMasterConnection() =>
            _config.GetConnectionString("DefaultConnection")!;

        // Connection đến database của (đơn vị, năm) — dựng từ connection Master,
        // chỉ thay tên database
        public string GetTenantConnection(string code, int year)
        {
            var b = new SqlConnectionStringBuilder(GetMasterConnection())
            { InitialCatalog = BuildDbName(code, year) };
            return b.ConnectionString;
        }
    }
}