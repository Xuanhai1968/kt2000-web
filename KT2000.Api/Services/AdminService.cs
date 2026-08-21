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
        private readonly VaCauTrucService _va;
        public AdminService(AppDbContext db, TenantDbResolver resolver, VaCauTrucService va)
        { _db = db; _resolver = resolver; _va = va; }

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

            CreateTenantDatabase(code, req.FirstYear, laNoiBo: loai == "noibo");
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
                    bool created = CreateTenantDatabase(
                        tenant.Code, req.Year, laNoiBo: tenant.TenantType == "noibo");

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

        // ============ Tạo bảng module Hợp đồng + Lương ============

        /// <summary>
        /// Dựng 4 bảng NHAN_SU / HOP_DONG / CHAM_CONG / BANG_LUONG vào database đơn
        /// vị-năm đã chọn (script 025 + 026).
        ///
        /// VÌ SAO LÀ NÚT RIÊNG chứ không nằm trong bản vá tự động (chốt 21/08): đây là
        /// một MODULE, không phải sửa cấu trúc bắt buộc. Phần lớn khách chỉ thuê làm kế
        /// toán thuế, lương họ tự làm — dựng sẵn 4 bảng rỗng cho mọi đơn vị × mọi năm là
        /// rác. Xem giải thích đầy đủ ở VaCauTrucService.CAC_BAN_VA.
        ///
        /// Năm lấy từ req.Year, KHÔNG phải năm đang đăng nhập: người dùng đứng ở màn Mở
        /// năm và vừa gõ năm cần mở ngay bên cạnh — dùng năm khác đi là dựng bảng vào
        /// database họ không hề nhắm tới.
        /// </summary>
        public async Task<List<object>> TaoBangHopDongLuong(
            OpenYearsRequest req, string nguoiDung)
        {
            var ketQua = new List<object>();

            foreach (var idStr in req.TenantIds)
            {
                if (!Guid.TryParse(idStr, out var id)) continue;
                var tenant = await _db.Tenants.FindAsync(id);
                if (tenant == null) continue;

                // Đơn vị nội bộ (tạo đơn bán hàng) không có màn Hợp đồng / Lương —
                // BR-HD-02. Dựng bảng ở đó chỉ tạo ra thứ không lối nào chạm tới.
                if (tenant.TenantType == "noibo")
                {
                    ketQua.Add(new
                    {
                        code = tenant.Code, status = "skip",
                        message = "Đơn vị nội bộ không dùng module Hợp đồng / Lương",
                    });
                    continue;
                }

                try
                {
                    // Chưa mở năm thì KHÔNG tự tạo database ở đây. Mở năm là việc riêng,
                    // có nút riêng ngay trên cùng màn hình; lặng lẽ tạo hộ thì người dùng
                    // mất luôn cơ hội nhận ra mình vừa chọn nhầm năm.
                    bool coNam = await _db.FiscalYears
                        .AnyAsync(f => f.TenantId == tenant.Id && f.Year == req.Year);
                    if (!coNam)
                    {
                        ketQua.Add(new
                        {
                            code = tenant.Code, status = "error",
                            message = $"Chưa mở năm {req.Year} — bấm \"Mở năm\" trước",
                        });
                        continue;
                    }

                    bool vuaTao = _va.TaoBangHopDongLuong(tenant.Code, req.Year, nguoiDung);
                    ketQua.Add(new
                    {
                        code = tenant.Code,
                        status = vuaTao ? "ok" : "skip",
                        message = vuaTao
                            ? $"Đã tạo bảng Hợp đồng + Lương trong {tenant.Code}_{req.Year}"
                            : $"{tenant.Code}_{req.Year} đã có sẵn bảng",
                    });
                }
                catch (Exception ex)
                {
                    ketQua.Add(new
                    { code = tenant.Code, status = "error", message = ex.Message });
                    await GhiNhatKy(nguoiDung, tenant.Id, req.Year, "TAO_BANG_LUONG_LOI",
                        $"Tạo bảng Hợp đồng + Lương cho {tenant.Code}_{req.Year} "
                      + $"thất bại: {ex.Message}");
                }
            }

            return ketQua;
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
        //
        // laNoiBo QUYẾT ĐỊNH có dựng khuôn NB hay không (luật 9 — ranh giới hai sổ).
        // Trước đây hàm này gọi ApplyNbTables() cho MỌI đơn vị: đơn vị THUẾ thuần cũng
        // mọc ra GOI_HD / GOI_HD_LINE / DM_*_NB và 7 cột NB trên HOA_DON(_LINE). Hậu quả
        // thấy rõ ở màn hóa đơn: SELECT cột NB thì DB thuế cũ (chưa chạy 015) ném
        // "Invalid object name", còn DB mới thì bảng thuế phình thêm cột chẳng ai ghi.
        // Sổ thuế và sổ nội bộ là HAI khuôn khác nhau, dựng nhầm là lẫn ranh giới.
        private bool CreateTenantDatabase(string code, int year, bool laNoiBo)
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
                if (probe.ExecuteScalar() != DBNull.Value)
                {
                    if (laNoiBo) ApplyNbTables(conn, dbName);
                    return false;
                }
            }
            else
            {
                using var create = new SqlCommand($"CREATE DATABASE [{dbName}]", conn);
                create.ExecuteNonQuery();
            }

            ApplyTenantTemplate(conn, dbName);
            if (laNoiBo) ApplyNbTables(conn, dbName);
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

        // Khuôn NỘI BỘ — CHỈ gọi cho đơn vị 'noibo' (xem CreateTenantDatabase).
        // Tách khỏi ApplyTenantTemplate vì còn phải gọi riêng cho các database dựng
        // trước khi có script này.
        //
        // Trước đây đọc BỐN file rời và thứ tự chạy nằm ở chính mảng này — đọc file SQL
        // không thấy được, xếp nhầm thì lỗi câm. Nay gộp hết vào 015_tenant_nb.sql:
        // danh mục _NB -> cột bổ sung -> vá khuôn HOA_DON -> GOI_HD/GOI_HD_LINE ->
        // dọn di sản DON_HANG của bản cũ, thứ tự nằm ngay trong file.
        private static void ApplyNbTables(SqlConnection conn, string dbName)
        {
            foreach (var batch in SplitSqlBatches(ReadEmbedded("KT2000.Api.tenant_nb.sql")))
            {
                using var cmd = new SqlCommand($"USE [{dbName}];\n{batch}", conn);
                cmd.CommandTimeout = 120;
                cmd.ExecuteNonQuery();
            }
        }

        private static string ReadTenantTemplate() => ReadEmbedded("KT2000.Api.tenant_template.sql");

        private static string ReadEmbedded(string logicalName)
        {
            using var s = typeof(AdminService).Assembly
                .GetManifestResourceStream(logicalName)
                ?? throw new InvalidOperationException(
                    $"Thiếu file SQL nhúng ({logicalName}) — build lại backend");
            using var r = new StreamReader(s);
            return r.ReadToEnd();
        }

        private static IEnumerable<string> SplitSqlBatches(string sql) =>
            Regex.Split(sql, @"^\s*GO\s*$", RegexOptions.Multiline | RegexOptions.IgnoreCase)
                 .Where(b => !string.IsNullOrWhiteSpace(b));
    }
}