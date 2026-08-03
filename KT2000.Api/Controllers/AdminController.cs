using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
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
        public AdminController(AppDbContext db, AdminService admin, ImportService import)
        { _db = db; _admin = admin; _import = import; }
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