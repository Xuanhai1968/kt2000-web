using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using System.IdentityModel.Tokens.Jwt;
using KT2000.Api.Data;
using KT2000.Api.Models;
using KT2000.Api.Services;

namespace KT2000.Api.Controllers
{
    [Route("api/admin")]
    [ApiController]
    [Authorize]
    public class AdminController : ControllerBase
    {
        private readonly AppDbContext _db;
        private readonly AdminService _admin;
        private readonly ImportService _import;
        private readonly TctFetchService _tct;
        // Bộ mã hóa RIÊNG cho mật khẩu ban đầu — không dùng chung purpose với mật khẩu
        // cổng TCT, để lộ khóa của một loại không kéo theo loại kia.
        private readonly Microsoft.AspNetCore.DataProtection.IDataProtector _bvMatKhau;
        public AdminController(AppDbContext db, AdminService admin, ImportService import,
                               TctFetchService tct,
                               Microsoft.AspNetCore.DataProtection.IDataProtectionProvider dp)
        {
            _db = db; _admin = admin; _import = import; _tct = tct;
            _bvMatKhau = dp.CreateProtector("KT2000.MatKhauBanDau.v1");
        }
        private bool IsInternal() =>
            User.FindFirst("tenant_type")?.Value == "internal";
        private bool IsAdminUser() =>
            string.Equals(User.FindFirst("is_admin")?.Value, "True",
                          StringComparison.OrdinalIgnoreCase);
        private string CurrentLoginName() =>
            User.FindFirst("login_name")?.Value ?? "?";
        private Guid CurrentUserId()
        {
            // Tùy cấu hình, claim 'sub' có thể xuất hiện dưới 1 trong 3 tên này
            var v = User.FindFirst("sub")?.Value
                 ?? User.FindFirst(JwtRegisteredClaimNames.Sub)?.Value
                 ?? User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
            if (v == null)
                throw new UnauthorizedAccessException("Token không có thông tin người dùng (sub)");
            return Guid.Parse(v);
        }
        [HttpGet("tenants")]
        // baoGomNoiBo: QT-02 muốn mở năm cho CHÍNH MDN_NB nên cần thấy tenant 'internal'.
        // Mặc định false vì cùng endpoint này còn nuôi màn Đơn vị khách hàng và
        // FRM_LAY_HDDT — nơi MDN_NB xuất hiện là vô nghĩa (không có hóa đơn để lấy).
        public async Task<IActionResult> GetTenants(bool baoGomNoiBo = false)
        {
            if (!IsInternal())
                return StatusCode(403, new { message = "Chức năng này chỉ dành cho phiên đăng nhập nội bộ" });
            var list = await _db.Tenants
                .Where(t => baoGomNoiBo || t.TenantType != "internal")
                .OrderBy(t => t.SortName ?? t.Name)
                .Select(t => new
                {
                    id = t.Id, code = t.Code, name = t.Name,
                    taxCode = t.TaxCode, address = t.Address, isActive = t.IsActive,
                    khaiQuy = t.KhaiQuy,   // false = khai THÁNG → FRM_LAY_HDDT tô đỏ
                    tenantType = t.TenantType,
                    linkedTenantCode = t.LinkedTenantCode,
                    fiscalYears = t.FiscalYears
                        .OrderByDescending(f => f.Year).Select(f => f.Year).ToList()
                })
                .ToListAsync();
            return Ok(list);
        }
        // PUT api/admin/tenants/{id} — Sửa đơn vị (cần is_admin)
        [HttpPut("tenants/{id}")]
        public async Task<IActionResult> UpdateTenant(Guid id, [FromBody] UpdateTenantRequest req)
        {
            if (!IsInternal())
                return StatusCode(403, new { message = "Chức năng này chỉ dành cho phiên đăng nhập nội bộ" });
            if (!IsAdminUser())
                return StatusCode(403, new { message = "Chỉ quản trị viên được sửa thông tin đơn vị" });
            try { return Ok(await _admin.UpdateTenant(id, req, CurrentLoginName())); }
            catch (ArgumentException ex)
            { return BadRequest(new { message = ex.Message }); }
        }
        // POST api/admin/tenants — Thêm đơn vị mới
        [HttpPost("tenants")]
        public async Task<IActionResult> CreateTenant([FromBody] CreateTenantRequest req)
        {
            if (!IsInternal())
                return StatusCode(403, new { message = "Chức năng này chỉ dành cho phiên đăng nhập nội bộ" });
            // Tạo đơn vị kéo theo mở năm đầu + CREATE DATABASE. Chặn mỗi "Mở năm" mà để
            // hở chỗ này thì người không phải admin vẫn tạo được database mới bằng đường
            // tạo đơn vị — cửa sau y hệt.
            if (!IsAdminUser())
                return StatusCode(403, new { message = "Chỉ quản trị viên được tạo đơn vị mới" });
            try { return Ok(await _admin.CreateTenant(req, CurrentUserId(), CurrentLoginName())); }
            catch (ArgumentException ex)
            { return BadRequest(new { message = ex.Message }); }
        }

        // POST api/admin/fiscal-years — Mở năm hàng loạt
        [HttpPost("fiscal-years")]
        public async Task<IActionResult> OpenYears([FromBody] OpenYearsRequest req)
        {
            if (!IsInternal())
                return StatusCode(403, new { message = "Chức năng này chỉ dành cho phiên đăng nhập nội bộ" });
            // Mở năm = CREATE DATABASE. Ai cũng thấy được màn hình, nhưng chỉ quản trị
            // viên mới bấm được nút (chốt với Trường 06/08).
            if (!IsAdminUser())
                return StatusCode(403, new { message = "Chỉ quản trị viên được mở năm làm việc mới" });
            return Ok(await _admin.OpenYears(req, CurrentLoginName()));
        }
        // POST api/admin/leftover-files — Mỗi đơn vị còn bao nhiêu file gốc nằm lại raw\
        // (HĐ lệch Σ line vs master, phải xử lý tay) — spec 1.3.3
        [HttpPost("leftover-files")]
        public async Task<IActionResult> LeftoverFiles([FromBody] LeftoverRequest req)
        {
            if (!IsInternal())
                return StatusCode(403, new { message = "Chức năng này chỉ dành cho phiên đăng nhập nội bộ" });
            var ids = req.TenantIds.Select(Guid.Parse).ToList();
            var ds = await _db.Tenants.Where(t => ids.Contains(t.Id)).ToListAsync();
            try { return Ok(await _import.DemFileConLai(ds, req.Nam, req.ThangBd, req.ThangKt, req.Huong)); }
            catch (ArgumentException ex)
            { return BadRequest(new { message = ex.Message }); }
        }

        // ========== Nhật ký hệ thống ==========
        // ActivityLog là bảng CHỈ THÊM (008). Ở đây chỉ đọc — không có và sẽ không có
        // endpoint sửa/xóa, vì nhật ký sửa được thì không còn là bằng chứng.

        [HttpGet("activity-log")]
        public async Task<IActionResult> NhatKyHeThong(
            DateTime? tuNgay = null, DateTime? denNgay = null,
            string? nguoiDung = null, Guid? tenantId = null, string? hanhDong = null,
            int trang = 1, int soDong = 50)
        {
            if (!IsInternal())
                return StatusCode(403, new { message = "Chức năng này chỉ dành cho phiên đăng nhập nội bộ" });
            if (!IsAdminUser())
                return StatusCode(403, new { message = "Chỉ quản trị viên được xem nhật ký hệ thống" });

            soDong = Math.Clamp(soDong, 10, 500);
            trang = Math.Max(1, trang);

            var q = _db.ActivityLogs.AsQueryable();
            if (tuNgay != null) q = q.Where(a => a.At >= tuNgay.Value.Date);
            // "Đến ngày" hiểu là HẾT ngày đó, không phải 00:00 — người dùng chọn cùng
            // một ngày cho cả hai ô thì phải ra kết quả của ngày đó.
            if (denNgay != null) q = q.Where(a => a.At < denNgay.Value.Date.AddDays(1));
            if (!string.IsNullOrWhiteSpace(nguoiDung)) q = q.Where(a => a.UserName.Contains(nguoiDung));
            if (tenantId != null) q = q.Where(a => a.TenantId == tenantId);
            if (!string.IsNullOrWhiteSpace(hanhDong)) q = q.Where(a => a.Action == hanhDong);

            int tong = await q.CountAsync();
            var ds = await q.OrderByDescending(a => a.At).ThenByDescending(a => a.Id)
                .Skip((trang - 1) * soDong).Take(soDong)
                .Select(a => new
                {
                    id = a.Id, at = a.At, userName = a.UserName,
                    action = a.Action, detail = a.Detail,
                    nam = a.Nam, thang = a.Thang,
                    donVi = _db.Tenants.Where(t => t.Id == a.TenantId)
                                .Select(t => t.Code).FirstOrDefault(),
                })
                .ToListAsync();
            return Ok(new { tong, trang, soDong, ds });
        }

        // Danh sách hành động có thật trong nhật ký — để ô lọc không phải gõ tay
        [HttpGet("activity-log/actions")]
        public async Task<IActionResult> DanhSachHanhDong()
        {
            if (!IsInternal())
                return StatusCode(403, new { message = "Chức năng này chỉ dành cho phiên đăng nhập nội bộ" });
            if (!IsAdminUser())
                return StatusCode(403, new { message = "Chỉ quản trị viên được xem nhật ký hệ thống" });
            return Ok(await _db.ActivityLogs.Select(a => a.Action).Distinct()
                        .OrderBy(x => x).ToListAsync());
        }

        // ========== QT-01: quản lý user & phân quyền ==========
        // AD-QT-02: mọi thao tác ở nhóm này ghi ActivityLog — có chuyện là tra được.

        // Hai câu lệnh riêng thay vì truyền DBNull cho TenantId: ADO.NET không đoán được
        // kiểu của DBNull nên mặc định nvarchar, và SQL Server từ chối gán nvarchar vào
        // cột uniqueidentifier — chính lỗi đã làm nút Khóa báo hỏng dù đã khóa xong.
        //
        // Trả về null nếu ghi được, câu cảnh báo nếu không. KHÔNG ném lỗi: thao tác quản
        // trị đã commit rồi, ném tiếp chỉ khiến người dùng tưởng thất bại và làm lại.
        private async Task<string?> GhiNhatKy(string hanhDong, string chiTiet, Guid? tenantId = null)
        {
            try
            {
                if (tenantId is Guid id)
                    await _db.Database.ExecuteSqlRawAsync(
                        @"INSERT INTO ActivityLog (UserName, TenantId, Action, Detail)
                          VALUES ({0}, {1}, {2}, {3})",
                        CurrentLoginName(), id, hanhDong, chiTiet);
                else
                    await _db.Database.ExecuteSqlRawAsync(
                        @"INSERT INTO ActivityLog (UserName, Action, Detail)
                          VALUES ({0}, {1}, {2})",
                        CurrentLoginName(), hanhDong, chiTiet);
                return null;
            }
            catch (Exception ex)
            {
                // AD-QT-02 đòi mọi thao tác phải có vết. Ghi hỏng thì phải nói ra,
                // không được nuốt im lặng.
                return "Thao tác đã thực hiện nhưng KHÔNG ghi được nhật ký: " + ex.Message;
            }
        }

        [HttpGet("users")]
        public async Task<IActionResult> DanhSachUser(Guid? tenantId = null)
        {
            if (!IsInternal())
                return StatusCode(403, new { message = "Chức năng này chỉ dành cho phiên đăng nhập nội bộ" });
            if (!IsAdminUser())
                return StatusCode(403, new { message = "Chỉ quản trị viên được xem danh sách người dùng" });

            var q = _db.Users.AsQueryable();
            if (tenantId != null)
                q = q.Where(u => _db.UserTenantAccess.Any(a => a.UserId == u.Id && a.TenantId == tenantId));

            // KHÔNG bao giờ chiếu PasswordHash ra ngoài
            var ds = await q.OrderBy(u => u.LoginName).Select(u => new
            {
                id = u.Id, loginName = u.LoginName, realName = u.RealName,
                isAdmin = u.IsAdmin, isActive = u.IsActive,
                mustChangePassword = u.MustChangePassword, createdAt = u.CreatedAt,
                donVi = _db.UserTenantAccess.Where(a => a.UserId == u.Id)
                    .Join(_db.Tenants, a => a.TenantId, t => t.Id,
                          (a, t) => new { tenantId = t.Id, code = t.Code, role = a.Role })
                    .OrderBy(x => x.code).ToList(),
            }).ToListAsync();
            return Ok(ds);
        }

        [HttpPost("users")]
        public async Task<IActionResult> TaoUser([FromBody] TaoUserRequest req)
        {
            if (!IsInternal())
                return StatusCode(403, new { message = "Chức năng này chỉ dành cho phiên đăng nhập nội bộ" });
            if (!IsAdminUser())
                return StatusCode(403, new { message = "Chỉ quản trị viên được tạo người dùng" });

            string ten = (req.LoginName ?? "").Trim();
            if (ten.Length < 3)
                return BadRequest(new { message = "Tên đăng nhập tối thiểu 3 ký tự" });
            if (await _db.Users.AnyAsync(u => u.LoginName == ten))
                return BadRequest(new { message = $"Tên đăng nhập {ten} đã tồn tại" });
            var loiMk = KiemTraMatKhau(req.MatKhau);
            if (loiMk != null) return BadRequest(new { message = loiMk });

            // Gán đơn vị thì đơn vị đó phải có thật và vai trò phải nằm trong bộ đã biết.
            // Không kiểm ở đây thì UserTenantAccess ôm một TenantId trỏ vào hư không —
            // user đăng nhập được nhưng combobox chọn đơn vị rỗng, rất khó lần ra vì sao.
            string vaiTro = "accountant";
            if (req.TenantId != null)
            {
                var tenant = await _db.Tenants.FirstOrDefaultAsync(t => t.Id == req.TenantId.Value);
                if (tenant == null)
                    return BadRequest(new { message = "Không tìm thấy đơn vị để gán quyền" });
                var v = ChuanHoaVaiTro(req.Role);
                if (v == null) return BadRequest(new { message = LoiVaiTro(req.Role) });
                vaiTro = v;
            }

            var u = new User
            {
                Id = Guid.NewGuid(), LoginName = ten, RealName = req.RealName?.Trim(),
                PasswordHash = BCrypt.Net.BCrypt.HashPassword(req.MatKhau),
                IsAdmin = req.IsAdmin, IsActive = true,
                MustChangePassword = true,      // mật khẩu ban đầu không được sống lâu
                MatKhauBanDauMaHoa = _bvMatKhau.Protect(req.MatKhau),
                CreatedAt = DateTime.Now,
            };
            _db.Users.Add(u);
            if (req.TenantId != null)
                _db.UserTenantAccess.Add(new UserTenantAccess
                { UserId = u.Id, TenantId = req.TenantId.Value, Role = vaiTro });
            await _db.SaveChangesAsync();
            await GhiNhatKy("TAO_USER", $"Tạo user {ten}"
                + (req.IsAdmin ? " (quản trị viên)" : ""), req.TenantId);
            return Ok(new { id = u.Id, message = $"Đã tạo user {ten} — lần đăng nhập đầu sẽ bắt đổi mật khẩu" });
        }

        [HttpPut("users/trang-thai")]
        public async Task<IActionResult> DoiTrangThaiUser([FromBody] DoiTrangThaiUserRequest req)
        {
            if (!IsInternal())
                return StatusCode(403, new { message = "Chức năng này chỉ dành cho phiên đăng nhập nội bộ" });
            if (!IsAdminUser())
                return StatusCode(403, new { message = "Chỉ quản trị viên được khóa/mở khóa người dùng" });

            var u = await _db.Users.FindAsync(req.UserId);
            if (u == null) return BadRequest(new { message = "Không tìm thấy người dùng" });
            if (u.Id == CurrentUserId() && !req.IsActive)
                return BadRequest(new { message = "Không thể tự khóa tài khoản của chính mình" });

            u.IsActive = req.IsActive;
            await _db.SaveChangesAsync();
            var canhBao = await GhiNhatKy(req.IsActive ? "MO_KHOA_USER" : "KHOA_USER",
                            $"{(req.IsActive ? "Mở khóa" : "Khóa")} user {u.LoginName}");
            // Nói thật về giới hạn: JWT sống 10 giờ và hệ thống chưa có cơ chế thu hồi,
            // nên người đang đăng nhập vẫn thao tác được tới khi token hết hạn.
            return Ok(new
            {
                message = (req.IsActive
                    ? $"Đã mở khóa {u.LoginName}"
                    : $"Đã khóa {u.LoginName} — không đăng nhập mới được nữa. "
                      + "Phiên đang mở vẫn dùng được tối đa 10 giờ tới khi token hết hạn.")
                    + (canhBao == null ? "" : " ⚠ " + canhBao),
            });
        }

        // DELETE api/admin/users/{id} — xóa hẳn tài khoản.
        // Nhật ký KHÔNG mất: ActivityLog lưu UserName dạng chữ chứ không phải khóa ngoại,
        // nên mọi việc người này từng làm vẫn tra được sau khi xóa.
        [HttpDelete("users/{id}")]
        public async Task<IActionResult> XoaUser(Guid id)
        {
            if (!IsInternal())
                return StatusCode(403, new { message = "Chức năng này chỉ dành cho phiên đăng nhập nội bộ" });
            if (!IsAdminUser())
                return StatusCode(403, new { message = "Chỉ quản trị viên được xóa người dùng" });

            var u = await _db.Users.FindAsync(id);
            if (u == null) return BadRequest(new { message = "Không tìm thấy người dùng" });
            if (u.Id == CurrentUserId())
                return BadRequest(new { message = "Không thể tự xóa tài khoản của chính mình" });

            // Xóa admin cuối cùng là tự khóa mình ra khỏi hệ thống — chặn ở đây,
            // vì không có đường nào khôi phục ngoài sửa thẳng database.
            if (u.IsAdmin)
            {
                int conLai = await _db.Users.CountAsync(x => x.IsAdmin && x.IsActive && x.Id != id);
                if (conLai == 0)
                    return BadRequest(new { message = "Đây là quản trị viên duy nhất còn hoạt động — không xóa được" });
            }

            var quyen = await _db.UserTenantAccess.Where(a => a.UserId == id).ToListAsync();
            var prefs = await _db.UserPreferences.Where(p => p.UserId == id).ToListAsync();
            _db.UserTenantAccess.RemoveRange(quyen);
            _db.UserPreferences.RemoveRange(prefs);
            _db.Users.Remove(u);
            await _db.SaveChangesAsync();

            var canhBao = await GhiNhatKy("XOA_USER",
                $"Xóa user {u.LoginName}" + (quyen.Count > 0 ? $" (gỡ {quyen.Count} quyền đơn vị)" : ""));
            return Ok(new
            {
                message = $"Đã xóa tài khoản {u.LoginName}. Nhật ký hoạt động cũ vẫn giữ nguyên."
                        + (canhBao == null ? "" : " ⚠ " + canhBao),
            });
        }

        [HttpPut("users/reset-mat-khau")]
        public async Task<IActionResult> ResetMatKhau([FromBody] ResetMatKhauRequest req)
        {
            if (!IsInternal())
                return StatusCode(403, new { message = "Chức năng này chỉ dành cho phiên đăng nhập nội bộ" });
            if (!IsAdminUser())
                return StatusCode(403, new { message = "Chỉ quản trị viên được đặt lại mật khẩu" });

            var u = await _db.Users.FindAsync(req.UserId);
            if (u == null) return BadRequest(new { message = "Không tìm thấy người dùng" });
            var loi = KiemTraMatKhau(req.MatKhauMoi);
            if (loi != null) return BadRequest(new { message = loi });

            u.PasswordHash = BCrypt.Net.BCrypt.HashPassword(req.MatKhauMoi);
            u.MustChangePassword = true;
            u.MatKhauBanDauMaHoa = _bvMatKhau.Protect(req.MatKhauMoi);
            await _db.SaveChangesAsync();
            await GhiNhatKy("RESET_MAT_KHAU", $"Đặt lại mật khẩu cho user {u.LoginName}");
            return Ok(new { message = $"Đã đặt lại mật khẩu cho {u.LoginName} — người dùng phải đổi ở lần đăng nhập tới" });
        }

        // GET api/admin/users/mat-khau-ban-dau?userId= — admin xem lại mật khẩu MÌNH ĐÃ CẤP.
        // Chỉ trả khi người dùng CHƯA tự đổi (MustChangePassword = 1). Đổi rồi là mất
        // hẳn, vì lúc đó mật khẩu là của họ chứ không phải của admin nữa.
        [HttpGet("users/mat-khau-ban-dau")]
        public async Task<IActionResult> XemMatKhauBanDau(Guid userId)
        {
            if (!IsInternal())
                return StatusCode(403, new { message = "Chức năng này chỉ dành cho phiên đăng nhập nội bộ" });
            if (!IsAdminUser())
                return StatusCode(403, new { message = "Chỉ quản trị viên được xem mật khẩu đã cấp" });

            var u = await _db.Users.FindAsync(userId);
            if (u == null) return BadRequest(new { message = "Không tìm thấy người dùng" });
            // Hai tình huống khác hẳn nhau, trước đây bị gộp thành một câu sai:
            if (!u.MustChangePassword)
                return BadRequest(new
                {
                    message = $"{u.LoginName} đã tự đổi mật khẩu — không xem lại được nữa. "
                            + "Cần thì bấm Đặt lại để cấp mật khẩu mới.",
                });
            if (string.IsNullOrEmpty(u.MatKhauBanDauMaHoa))
                return BadRequest(new
                {
                    message = $"Không có bản lưu mật khẩu của {u.LoginName} — tài khoản này "
                            + "được cấp trước khi hệ thống bắt đầu giữ lại mật khẩu ban đầu. "
                            + "Bấm Đặt lại để cấp mật khẩu mới, lần sau sẽ xem được.",
                });

            string mk;
            try { mk = _bvMatKhau.Unprotect(u.MatKhauBanDauMaHoa); }
            catch { return BadRequest(new { message = "Không giải mã được — khóa dp-keys có thể đã đổi. Hãy đặt lại mật khẩu." }); }

            // Xem mật khẩu của người khác là việc đáng ghi vết, kể cả khi hợp lệ
            await GhiNhatKy("XEM_MAT_KHAU", $"Xem mật khẩu ban đầu của {u.LoginName}");
            return Ok(new { loginName = u.LoginName, matKhau = mk });
        }

        [HttpPut("users/quyen")]
        public async Task<IActionResult> CapQuyen([FromBody] CapQuyenRequest req)
        {
            if (!IsInternal())
                return StatusCode(403, new { message = "Chức năng này chỉ dành cho phiên đăng nhập nội bộ" });
            if (!IsAdminUser())
                return StatusCode(403, new { message = "Chỉ quản trị viên được cấp quyền" });

            var u = await _db.Users.FindAsync(req.UserId);
            var t = await _db.Tenants.FindAsync(req.TenantId);
            if (u == null || t == null) return BadRequest(new { message = "Không tìm thấy người dùng hoặc đơn vị" });

            var q = await _db.UserTenantAccess
                .FirstOrDefaultAsync(a => a.UserId == req.UserId && a.TenantId == req.TenantId);

            if (string.IsNullOrWhiteSpace(req.Role))
            {
                if (q == null) return Ok(new { message = "Người dùng vốn không có quyền ở đơn vị này" });
                _db.UserTenantAccess.Remove(q);
                await _db.SaveChangesAsync();
                await GhiNhatKy("GO_QUYEN", $"Gỡ quyền của {u.LoginName} khỏi {t.Code}", t.Id);
                return Ok(new { message = $"Đã gỡ quyền của {u.LoginName} khỏi {t.Code}" });
            }

            // Chuỗi tự do đi thẳng vào claim `role` của JWT — phải chặn ở đây (xem
            // ghi chú ở ChuanHoaVaiTro). Role rỗng đã được xử lý phía trên = gỡ quyền.
            var vaiTro = ChuanHoaVaiTro(req.Role);
            if (vaiTro == null) return BadRequest(new { message = LoiVaiTro(req.Role) });

            if (q == null)
                _db.UserTenantAccess.Add(new UserTenantAccess
                { UserId = req.UserId, TenantId = req.TenantId, Role = vaiTro });
            else q.Role = vaiTro;
            await _db.SaveChangesAsync();
            await GhiNhatKy("CAP_QUYEN", $"Cấp quyền '{vaiTro}' cho {u.LoginName} tại {t.Code}", t.Id);
            return Ok(new { message = $"Đã cấp quyền '{vaiTro}' cho {u.LoginName} tại {t.Code}" });
        }

        // Câu hỏi mở 8.1 của spec: tạm chốt ≥8 ký tự và phải có số — đủ dùng,
        // đổi sau chỉ cần sửa một chỗ này.
        private static string? KiemTraMatKhau(string? mk)
        {
            if (string.IsNullOrWhiteSpace(mk) || mk.Length < 8)
                return "Mật khẩu tối thiểu 8 ký tự";
            if (!mk.Any(char.IsDigit)) return "Mật khẩu phải có ít nhất một chữ số";
            return null;
        }

        // Vai trò trong một đơn vị. Giá trị này đi thẳng vào claim `role` của JWT
        // (AuthService) rồi được dùng để phân quyền, nên KHÔNG được nhận chuỗi tự do:
        // gõ nhầm "acountant" sẽ tạo ra tài khoản mang vai trò không khớp bất kỳ luật
        // nào — không lỗi, không cảnh báo, chỉ lặng lẽ không có quyền gì.
        // Bộ giá trị lấy theo 001_create_master.sql (admin | accountant | viewer).
        private static readonly string[] VaiTroHopLe = { "admin", "accountant", "viewer" };

        // Trả về vai trò đã chuẩn hóa, hoặc null nếu không hợp lệ
        private static string? ChuanHoaVaiTro(string? role)
        {
            var r = (role ?? "").Trim().ToLowerInvariant();
            return VaiTroHopLe.Contains(r) ? r : null;
        }

        private static string LoiVaiTro(string? role) =>
            $"Vai trò không hợp lệ: '{role}'. Chỉ nhận {string.Join(" | ", VaiTroHopLe)}";

        // ========== BƯỚC 1: tài khoản cổng TCT + chạy bộ tải ==========

        // GET api/admin/tct-credential?tenantId= — CHỈ cho biết đã khai mật khẩu chưa.
        // Không có và sẽ không bao giờ có API đọc ngược mật khẩu ra.
        [HttpGet("tct-credential")]
        public async Task<IActionResult> TrangThaiMatKhauTct(Guid tenantId)
        {
            if (!IsInternal())
                return StatusCode(403, new { message = "Chức năng này chỉ dành cho phiên đăng nhập nội bộ" });
            // Chiếu ra ĐÚNG ba trường cần biết — không bao giờ chạm tới chuỗi mã hóa
            var t = await _db.Tenants.Where(x => x.Id == tenantId)
                .Select(x => new
                {
                    coMatKhau = x.MatKhauHddt != null,
                    capNhatLuc = x.MkHddtCapNhatLuc,
                    capNhatBoi = x.MkHddtCapNhatBoi,
                }).FirstOrDefaultAsync();
            if (t == null) return BadRequest(new { message = "Không tìm thấy đơn vị" });
            return Ok(t);
        }

        // PUT api/admin/tct-credential — khai/đổi mật khẩu (nhập đè, không sửa từng phần)
        [HttpPut("tct-credential")]
        public async Task<IActionResult> LuuMatKhauTct([FromBody] LuuMatKhauTctRequest req)
        {
            if (!IsInternal())
                return StatusCode(403, new { message = "Chức năng này chỉ dành cho phiên đăng nhập nội bộ" });
            if (!IsAdminUser())
                return StatusCode(403, new { message = "Chỉ quản trị viên được khai mật khẩu cổng thuế" });
            if (string.IsNullOrWhiteSpace(req.MatKhau))
                return BadRequest(new { message = "Mật khẩu trống" });

            var t = await _db.Tenants.FindAsync(req.TenantId);
            if (t == null) return BadRequest(new { message = "Không tìm thấy đơn vị" });
            if (string.IsNullOrWhiteSpace(t.TaxCode))
                return BadRequest(new { message = $"Đơn vị {t.Code} chưa có MST — bổ sung trước khi khai mật khẩu" });

            t.MatKhauHddt = _tct.MaHoa(req.MatKhau);
            t.MkHddtCapNhatLuc = DateTime.Now;
            t.MkHddtCapNhatBoi = CurrentLoginName();
            await _db.SaveChangesAsync();

            // Ghi vết việc ĐÃ ĐỔI, tuyệt đối không ghi nội dung mật khẩu
            await _db.Database.ExecuteSqlRawAsync(
                @"INSERT INTO ActivityLog (UserName, TenantId, Action, Detail)
                  VALUES ({0}, {1}, N'DOI_MK_TCT', N'Cập nhật mật khẩu cổng TCT')",
                CurrentLoginName(), req.TenantId);

            return Ok(new { message = $"Đã lưu mật khẩu cổng TCT cho {t.Code}" });
        }

        // POST api/admin/fetch-start — bắt đầu phiên lấy HĐ (chạy tuần tự từng đơn vị-tháng)
        [HttpPost("fetch-start")]
        public async Task<IActionResult> BatDauLayHd([FromBody] BatDauLayHdRequest req)
        {
            if (!IsInternal())
                return StatusCode(403, new { message = "Chức năng này chỉ dành cho phiên đăng nhập nội bộ" });
            if (req.TenantIds.Count == 0)
                return BadRequest(new { message = "Chưa chọn đơn vị nào" });
            if (req.ThangKt < req.ThangBd)
                return BadRequest(new { message = "Đến tháng phải ≥ Từ tháng" });

            var ids = req.TenantIds.Select(Guid.Parse).ToList();
            var ds = await _db.Tenants.Where(t => ids.Contains(t.Id))
                        .OrderBy(t => t.Code)
                        .Select(t => new { t.Id, t.Code }).ToListAsync();
            try
            {
                var phien = _tct.BatDauPhien(
                    ds.Select(x => (x.Id, x.Code)).ToList(),
                    req.Nam, req.ThangBd, req.ThangKt, req.Huong, CurrentLoginName());
                return Ok(phien);
            }
            catch (ArgumentException ex) { return BadRequest(new { message = ex.Message }); }
        }

        // GET api/admin/fetch-progress — giao diện hỏi tiến độ mỗi vài giây
        [HttpGet("fetch-progress")]
        public IActionResult TienDoLayHd()
        {
            if (!IsInternal())
                return StatusCode(403, new { message = "Chức năng này chỉ dành cho phiên đăng nhập nội bộ" });
            return Ok(_tct.LayTienDo());
        }

        // POST api/admin/fetch-stop — dừng phiên đang chạy
        [HttpPost("fetch-stop")]
        public IActionResult DungLayHd()
        {
            if (!IsInternal())
                return StatusCode(403, new { message = "Chức năng này chỉ dành cho phiên đăng nhập nội bộ" });
            _tct.DungPhien();
            return Ok(new { message = "Đã yêu cầu dừng — lượt đang chạy sẽ kết thúc ngay" });
        }

        // POST api/admin/raw-files — Chi tiết các hóa đơn còn nằm lại raw\ của 1 đơn vị,
        // đọc thẳng từ XML gốc kèm mặt hàng, để soi "nó bị làm sao"
        [HttpPost("raw-files")]
        public async Task<IActionResult> RawFiles([FromBody] RawFilesRequest req)
        {
            if (!IsInternal())
                return StatusCode(403, new { message = "Chức năng này chỉ dành cho phiên đăng nhập nội bộ" });
            var t = await _db.Tenants.FindAsync(req.TenantId);
            if (t == null) return BadRequest(new { message = "Không tìm thấy đơn vị" });
            try { return Ok(await _import.DocHoaDonConLai(t, req.Nam, req.ThangBd, req.ThangKt, req.Huong)); }
            catch (ArgumentException ex)
            { return BadRequest(new { message = ex.Message }); }
        }

        // GET api/admin/raw-html — Trả bản HTML gốc của hóa đơn còn nằm ở raw\ để xem tại chỗ
        [HttpGet("raw-html")]
        public async Task<IActionResult> RawHtml(Guid tenantId, int nam, int thang,
                                                 string huong, string tenFile)
        {
            if (!IsInternal())
                return StatusCode(403, new { message = "Chức năng này chỉ dành cho phiên đăng nhập nội bộ" });
            var t = await _db.Tenants.FindAsync(tenantId);
            if (t == null) return BadRequest(new { message = "Không tìm thấy đơn vị" });
            try
            {
                var path = _import.DuongDanFileRaw(t, nam, thang, huong, tenFile, ".html");
                if (!System.IO.File.Exists(path))
                    return NotFound(new { message = "Hóa đơn này không có bản HTML kèm theo" });
                return PhysicalFile(path, "text/html; charset=utf-8");
            }
            catch (ArgumentException ex) { return BadRequest(new { message = ex.Message }); }
        }

        // POST api/admin/import-one — Nạp TAY một hóa đơn (đã sửa) vào database đơn vị-năm
        [HttpPost("import-one")]
        public async Task<IActionResult> ImportOne([FromBody] ImportOneRequest req)
        {
            if (!IsInternal())
                return StatusCode(403, new { message = "Chức năng này chỉ dành cho phiên đăng nhập nội bộ" });
            try { return Ok(await _import.NapMotHoaDon(req, CurrentLoginName())); }
            catch (ArgumentException ex) { return BadRequest(new { message = ex.Message }); }
            catch (SqlException ex) { return BadRequest(new { message = "Lỗi ghi database: " + ex.Message }); }
        }

        // POST api/admin/import-job — Nạp Excel tổng của 1 job vào database đơn vị-năm
        [HttpPost("import-job")]
        public async Task<IActionResult> ImportJob([FromBody] ImportJobRequest req)
        {
            if (!IsInternal())
                return StatusCode(403, new { message = "Chức năng này chỉ dành cho phiên đăng nhập nội bộ" });
            try { return Ok(await _import.ImportJob(req, CurrentLoginName())); }
            catch (ArgumentException ex)
            { return BadRequest(new { message = ex.Message }); }
        }
    }
}