using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using System.Text.RegularExpressions;
using KT2000.Api.Data;
using KT2000.Api.Models;

namespace KT2000.Api.Services
{
    public class AdminService
    {
        private readonly AppDbContext _db;
        private readonly TenantDbResolver _resolver;
        public AdminService(AppDbContext db, TenantDbResolver resolver)
        { _db = db; _resolver = resolver; }

        // ============ Thêm đơn vị mới ============
        public async Task<object> CreateTenant(CreateTenantRequest req, Guid currentUserId)
        {
            var code = (req.Code ?? "").Trim().ToUpperInvariant();
            if (!TenantDbResolver.IsValidCode(code))
                throw new ArgumentException("MA_DONVI không hợp lệ: chỉ chữ A-Z, số, dấu _ (3-30 ký tự)");
            if (await _db.Tenants.AnyAsync(t => t.Code == code))
                throw new ArgumentException($"Mã đơn vị {code} đã tồn tại");

            var tenant = new Tenant
            {
                Id = Guid.NewGuid(), Code = code,
                Name = req.Name.Trim(), DbName = code,
                TenantType = "headquarter",
                TaxCode = req.TaxCode?.Trim(), Address = req.Address?.Trim(),
                IsActive = true
            };
            _db.Tenants.Add(tenant);
            _db.FiscalYears.Add(new FiscalYear { TenantId = tenant.Id, Year = req.FirstYear });
            // Người tạo (kế toán trưởng) được quyền vào đơn vị mới luôn
            _db.UserTenantAccess.Add(new UserTenantAccess
            { UserId = currentUserId, TenantId = tenant.Id, Role = "admin" });
            await _db.SaveChangesAsync();

            CreateTenantDatabase(code, req.FirstYear);
            return new { tenant.Id, tenant.Code, dbCreated = _resolver.BuildDbName(code, req.FirstYear) };
        }

        // ============ Mở năm hàng loạt ============
        public async Task<List<object>> OpenYears(OpenYearsRequest req)
        {
            var results = new List<object>();
            foreach (var idStr in req.TenantIds)
            {
                var tenant = await _db.Tenants.FindAsync(Guid.Parse(idStr));
                if (tenant == null) continue;
                try
                {
                    bool existed = await _db.FiscalYears
                        .AnyAsync(f => f.TenantId == tenant.Id && f.Year == req.Year);
                    if (!existed)
                    {
                        _db.FiscalYears.Add(new FiscalYear { TenantId = tenant.Id, Year = req.Year });
                        await _db.SaveChangesAsync();
                    }
                    bool created = CreateTenantDatabase(tenant.Code, req.Year);

                    if (!existed)
                        results.Add(new { code = tenant.Code, status = "ok",
                                          message = $"Đã tạo {tenant.Code}_{req.Year}" });
                    else if (created)
                        results.Add(new { code = tenant.Code, status = "ok",
                                          message = $"Năm {req.Year} đã có trong sổ — đã tạo bổ sung database {tenant.Code}_{req.Year} còn thiếu" });
                    else
                        results.Add(new { code = tenant.Code, status = "skip",
                                          message = $"Năm {req.Year} đã mở, database đã có đủ" });
                }
                catch (Exception ex)
                {
                    results.Add(new { code = tenant.Code, status = "error", message = ex.Message });
                }
            }
            return results;
        }
        // ============ Sửa đơn vị (5 khóa kỷ luật) ============
        public async Task<object> UpdateTenant(Guid tenantId, UpdateTenantRequest req, string changedBy)
        {
            var t = await _db.Tenants.FindAsync(tenantId)
                ?? throw new ArgumentException("Không tìm thấy đơn vị");
            if (t.TenantType == "internal")
                throw new ArgumentException("Không sửa đơn vị nội bộ tại đây");

            // KHÓA MST một chiều: đã có thì không được đổi khác đi
            var newTax = string.IsNullOrWhiteSpace(req.TaxCode) ? null : req.TaxCode.Trim();
            if (!string.IsNullOrWhiteSpace(t.TaxCode) && newTax != t.TaxCode)
                throw new ArgumentException("MST đã có — không được phép thay đổi");
            if (string.IsNullOrWhiteSpace(req.Name))
                throw new ArgumentException("Tên đơn vị không được trống");

            // Ghi vết những gì đổi
            var changes = new List<string>();
            void Track(string field, string? oldV, string? newV)
            {
                if ((oldV ?? "") != (newV ?? ""))
                    changes.Add($"{field}: '{oldV}' -> '{newV}'");
            }
            Track("Name", t.Name, req.Name.Trim());
            Track("TaxCode", t.TaxCode, newTax);
            Track("Address", t.Address, req.Address?.Trim());
            Track("IsActive", t.IsActive.ToString(), req.IsActive.ToString());
            Track("KhaiQuy", t.KhaiQuy.ToString(), req.KhaiQuy.ToString());

            if (changes.Count == 0) return new { message = "Không có gì thay đổi" };

            t.Name = req.Name.Trim();
            t.TaxCode = newTax ?? t.TaxCode;
            t.Address = req.Address?.Trim();
            t.IsActive = req.IsActive;
            t.KhaiQuy = req.KhaiQuy;
            _db.TenantChangeLog.Add(new TenantChangeLog
            {
                TenantId = t.Id, ChangedBy = changedBy,
                Changes = string.Join("; ", changes)
            });
            await _db.SaveChangesAsync();
            return new { message = "Đã lưu", changes };
        }
        // ============ Tạo database vật lý ============
        // Trước 01/08: chỉ dựng SCHEMA_VERSION rỗng, 6 bảng nghiệp vụ phải chạy tay
        // 004/005/007/009 từng database — quên là Importer chết "Invalid object name
        // 'HOA_DON'". Nay dựng đủ khuôn ngay, từ 010_tenant_template_v6.sql nhúng trong .dll.
        private bool CreateTenantDatabase(string code, int year)
        {
            var dbName = _resolver.BuildDbName(code, year);   // đã qua BR-DB-01
            using var conn = new SqlConnection(_resolver.GetMasterConnection());
            conn.Open();

            bool existed;
            using (var check = new SqlCommand("SELECT DB_ID(@n)", conn))
            {
                check.Parameters.AddWithValue("@n", dbName);
                existed = check.ExecuteScalar() != DBNull.Value;
            }

            if (existed)
            {
                // Database có sẵn nhưng RỖNG RUỘT (di sản của bản cũ) → vá nốt khuôn.
                // Chỉ đụng database chưa có HOA_DON, nên không bao giờ chạm dữ liệu sống.
                using var probe = new SqlCommand($"SELECT OBJECT_ID('[{dbName}]..HOA_DON')", conn);
                if (probe.ExecuteScalar() != DBNull.Value) return false;   // đã đủ khuôn
            }
            else
            {
                using var create = new SqlCommand($"CREATE DATABASE [{dbName}]", conn);
                create.ExecuteNonQuery();
            }

            ApplyTenantTemplate(conn, dbName);
            return !existed;   // true = vừa tạo mới database
        }

        // Chạy khuôn schema lên đúng 1 database. SqlCommand không nuốt được "GO"
        // (đó là lệnh của SSMS, không phải của T-SQL) nên phải tự cắt từng mẻ.
        private static void ApplyTenantTemplate(SqlConnection conn, string dbName)
        {
            foreach (var batch in SplitSqlBatches(ReadTenantTemplate()))
            {
                using var cmd = new SqlCommand($"USE [{dbName}];\n{batch}", conn);
                cmd.CommandTimeout = 120;
                cmd.ExecuteNonQuery();
            }
        }

        private static string ReadTenantTemplate()
        {
            using var s = typeof(AdminService).Assembly
                .GetManifestResourceStream("KT2000.Api.tenant_template.sql")
                ?? throw new InvalidOperationException(
                    "Thiếu khuôn schema nhúng (KT2000.Api.tenant_template.sql) — build lại backend");
            using var r = new StreamReader(s);
            return r.ReadToEnd();
        }

        private static IEnumerable<string> SplitSqlBatches(string sql) =>
            Regex.Split(sql, @"^\s*GO\s*$", RegexOptions.Multiline | RegexOptions.IgnoreCase)
                 .Where(b => !string.IsNullOrWhiteSpace(b));
    }
}