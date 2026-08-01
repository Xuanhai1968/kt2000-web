using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
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

            if (changes.Count == 0) return new { message = "Không có gì thay đổi" };

            t.Name = req.Name.Trim();
            t.TaxCode = newTax ?? t.TaxCode;
            t.Address = req.Address?.Trim();
            t.IsActive = req.IsActive;
            _db.TenantChangeLog.Add(new TenantChangeLog
            {
                TenantId = t.Id, ChangedBy = changedBy,
                Changes = string.Join("; ", changes)
            });
            await _db.SaveChangesAsync();
            return new { message = "Đã lưu", changes };
        }
        // ============ Tạo database vật lý ============
        private bool CreateTenantDatabase(string code, int year)
        {
            var dbName = _resolver.BuildDbName(code, year);
            using var conn = new SqlConnection(_resolver.GetMasterConnection());
            conn.Open();
            using (var check = new SqlCommand("SELECT DB_ID(@n)", conn))
            {
                check.Parameters.AddWithValue("@n", dbName);
                if (check.ExecuteScalar() != DBNull.Value) return false;  // đã có
            }
            using (var create = new SqlCommand($"CREATE DATABASE [{dbName}]", conn))
                create.ExecuteNonQuery();
            using var init = new SqlCommand($@"
                USE [{dbName}];
                CREATE TABLE SCHEMA_VERSION (
                    Ver INT NOT NULL, AppliedAt DATETIME2 NOT NULL DEFAULT SYSDATETIME());
                INSERT INTO SCHEMA_VERSION (Ver) VALUES (1);", conn);
            init.ExecuteNonQuery();
            return true;  // vừa tạo mới
        }
        // private void CreateTenantDatabase(string code, int year)
        // {
        //     var dbName = _resolver.BuildDbName(code, year); // đã qua BR-DB-01
        //     using var conn = new SqlConnection(_resolver.GetMasterConnection());
        //     conn.Open();

        //     using (var check = new SqlCommand("SELECT DB_ID(@n)", conn))
        //     {
        //         check.Parameters.AddWithValue("@n", dbName);
        //         if (check.ExecuteScalar() != DBNull.Value) return; // đã có → thôi
        //     }
        //     using (var create = new SqlCommand($"CREATE DATABASE [{dbName}]", conn))
        //         create.ExecuteNonQuery();

        //     // Khuôn schema tối thiểu: bảng đánh dấu phiên bản.
        //     // WP-02 sẽ nâng template này lên đủ 6 bảng nghiệp vụ.
        //     using var init = new SqlCommand($@"
        //         USE [{dbName}];
        //         CREATE TABLE SCHEMA_VERSION (
        //             Ver INT NOT NULL, AppliedAt DATETIME2 NOT NULL DEFAULT SYSDATETIME());
        //         INSERT INTO SCHEMA_VERSION (Ver) VALUES (1);", conn);
        //     init.ExecuteNonQuery();
        // }
    }
    
}