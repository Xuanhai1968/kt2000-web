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

        // Ghi một dòng nhật ký. Nuốt lỗi có chủ đích: thao tác quản trị đã commit rồi,
        // ném tiếp chỉ khiến người dùng tưởng thất bại và bấm lại lần nữa.
        // Nam là int? nên phải ép DBNull đúng kiểu, không đưa null trần vào
        // ExecuteSqlRawAsync (ADO.NET sẽ đoán nvarchar và SQL Server từ chối gán vào int).
        private async Task GhiNhatKy(string nguoiDung, Guid tenantId, int? nam,
                                     string hanhDong, string chiTiet)
        {
            try
            {
                await _db.Database.ExecuteSqlRawAsync(
                    @"INSERT INTO ActivityLog (UserName, TenantId, Nam, Action, Detail)
                      VALUES ({0}, {1}, {2}, {3}, {4})",
                    nguoiDung, tenantId, (object?)nam ?? DBNull.Value, hanhDong, chiTiet);
            }
            catch { /* mất một dòng nhật ký còn hơn báo hỏng một thao tác đã xong */ }
        }

        // ============ Thêm đơn vị mới ============
        public async Task<object> CreateTenant(CreateTenantRequest req, Guid currentUserId,
                                               string nguoiDung)
        {
            var code = (req.Code ?? "").Trim().ToUpperInvariant();
            if (!TenantDbResolver.IsValidCode(code))
                throw new ArgumentException("MA_DONVI không hợp lệ: chỉ chữ A-Z, số, dấu _ (3-30 ký tự)");
            if (await _db.Tenants.AnyAsync(t => t.Code == code))
                throw new ArgumentException($"Mã đơn vị {code} đã tồn tại");

            // QT-03 + AD-NB-03: tenant nội bộ BẮT BUỘC trỏ về một tenant thuế có thật.
            // Kiểm ở đây chứ không tin frontend — sai mã liên kết thì mọi tra cứu xuyên
            // DB sau này (BR-NB-03) sẽ trỏ vào hư không.
            string loai = (req.TenantType ?? "headquarter").Trim().ToLowerInvariant();
            if (loai != "headquarter" && loai != "branch" && loai != "noibo")
                throw new ArgumentException($"Loại đơn vị không hợp lệ: {req.TenantType}");

            string? lienKet = string.IsNullOrWhiteSpace(req.LinkedTenantCode)
                ? null : req.LinkedTenantCode.Trim().ToUpperInvariant();
            if (loai == "noibo")
            {
                if (lienKet == null)
                    throw new ArgumentException("Đơn vị nội bộ phải khai đơn vị thuế liên kết");
                if (!await _db.Tenants.AnyAsync(t => t.Code == lienKet))
                    throw new ArgumentException($"Không có đơn vị thuế mã {lienKet} để liên kết");
            }
            else lienKet = null;   // tenant thuế không mang mã liên kết

            var tenant = new Tenant
            {
                Id = Guid.NewGuid(), Code = code,
                Name = req.Name.Trim(), DbName = code,
                TenantType = loai,
                LinkedTenantCode = lienKet,
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
            await GhiNhatKy(nguoiDung, tenant.Id, req.FirstYear, "TAO_DON_VI",
                $"Tạo đơn vị {code} ({loai}) — mở năm đầu {req.FirstYear}");
            return new { tenant.Id, tenant.Code, dbCreated = _resolver.BuildDbName(code, req.FirstYear) };
        }

        // ============ Mở năm hàng loạt ============
        public async Task<List<object>> OpenYears(OpenYearsRequest req, string nguoiDung)
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

                    // Ghi cả ba nhánh, kể cả "không làm gì". Nhật ký phải trả lời được
                    // câu "ai đã bấm mở năm lúc nào", chứ không chỉ "lúc nào có DB mới".
                    string ketQua;
                    if (!existed)
                    {
                        ketQua = $"Đã tạo {tenant.Code}_{req.Year}";
                        results.Add(new { code = tenant.Code, status = "ok", message = ketQua });
                    }
                    else if (created)
                    {
                        ketQua = $"Năm {req.Year} đã có trong sổ — đã tạo bổ sung database {tenant.Code}_{req.Year} còn thiếu";
                        results.Add(new { code = tenant.Code, status = "ok", message = ketQua });
                    }
                    else
                    {
                        ketQua = $"Năm {req.Year} đã mở, database đã có đủ";
                        results.Add(new { code = tenant.Code, status = "skip", message = ketQua });
                    }
                    await GhiNhatKy(nguoiDung, tenant.Id, req.Year, "MO_NAM", ketQua);
                }
                catch (Exception ex)
                {
                    results.Add(new { code = tenant.Code, status = "error", message = ex.Message });
                    await GhiNhatKy(nguoiDung, tenant.Id, req.Year, "MO_NAM_LOI",
                                    $"Mở năm {req.Year} cho {tenant.Code} thất bại: {ex.Message}");
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

            // AD-NB-03: chỉ tenant nội bộ mới mang mã liên kết, và mã đó phải có thật
            string? lienKetMoi = string.IsNullOrWhiteSpace(req.LinkedTenantCode)
                ? null : req.LinkedTenantCode.Trim().ToUpperInvariant();
            if (t.TenantType == "noibo")
            {
                if (lienKetMoi == null)
                    throw new ArgumentException("Đơn vị nội bộ phải khai đơn vị thuế liên kết");
                if (lienKetMoi == t.Code)
                    throw new ArgumentException("Đơn vị không thể liên kết với chính nó");
                if (!await _db.Tenants.AnyAsync(x => x.Code == lienKetMoi))
                    throw new ArgumentException($"Không có đơn vị thuế mã {lienKetMoi} để liên kết");
            }
            else lienKetMoi = null;
            Track("LinkedTenantCode", t.LinkedTenantCode, lienKetMoi);

            if (changes.Count == 0) return new { message = "Không có gì thay đổi" };

            t.Name = req.Name.Trim();
            t.TaxCode = newTax ?? t.TaxCode;
            t.Address = req.Address?.Trim();
            t.IsActive = req.IsActive;
            t.KhaiQuy = req.KhaiQuy;
            t.LinkedTenantCode = lienKetMoi;
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