using Microsoft.AspNetCore.Authorization;
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
        public AdminController(AppDbContext db, AdminService admin, ImportService import,
                               TctFetchService tct)
        { _db = db; _admin = admin; _import = import; _tct = tct; }
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
        public async Task<IActionResult> GetTenants()
        {
            if (!IsInternal())
                return StatusCode(403, new { message = "Chức năng này chỉ dành cho phiên đăng nhập nội bộ" });
            var list = await _db.Tenants
                .Where(t => t.TenantType != "internal")
                .OrderBy(t => t.SortName ?? t.Name)
                .Select(t => new
                {
                    id = t.Id, code = t.Code, name = t.Name,
                    taxCode = t.TaxCode, address = t.Address, isActive = t.IsActive,
                    khaiQuy = t.KhaiQuy,   // false = khai THÁNG → FRM_LAY_HDDT tô đỏ
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
            try { return Ok(await _admin.CreateTenant(req, CurrentUserId())); }
            catch (ArgumentException ex)
            { return BadRequest(new { message = ex.Message }); }
        }

        // POST api/admin/fiscal-years — Mở năm hàng loạt
        [HttpPost("fiscal-years")]
        public async Task<IActionResult> OpenYears([FromBody] OpenYearsRequest req)
        {
            if (!IsInternal())
                return StatusCode(403, new { message = "Chức năng này chỉ dành cho phiên đăng nhập nội bộ" });
            return Ok(await _admin.OpenYears(req));
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