using Microsoft.AspNetCore.Mvc;
using KT2000.Api.Models;
using KT2000.Api.Services;

namespace KT2000.Api.Controllers
{
    [Route("api/auth")]
    [ApiController]
    public class AuthController : ControllerBase
    {
        private readonly AuthService _auth;
        public AuthController(AuthService auth) => _auth = auth;

        // POST api/auth/get-tenants  { "username": "admin", "password": "..." }
        // Đòi mật khẩu: danh sách đơn vị là thông tin riêng của từng người, không phải
        // thứ để người lạ gõ đại một cái tên rồi xem được.
        [HttpPost("get-tenants")]
        public async Task<IActionResult> GetTenants([FromBody] GetTenantsRequest req)
        {
            try { return Ok(await _auth.GetTenantsByUsername(req.Username, req.Password)); }
            catch (UnauthorizedAccessException ex)
            { return Unauthorized(new { message = ex.Message }); }
        }

        // POST api/auth/login
        // { "username","password","tenantId","fiscalYear","getChiNhanh" }
        [HttpPost("login")]
        public async Task<IActionResult> Login([FromBody] LoginRequest req)
        {
            try { return Ok(await _auth.Login(req)); }
            catch (UnauthorizedAccessException ex)
            { return Unauthorized(new { message = ex.Message }); }
        }

        // POST api/auth/change-password — TỰ đổi mật khẩu của chính mình.
        // AD-QT-01: endpoint quản trị DUY NHẤT phải sống ở CẢ HAI instance, vì user NB
        // trên internet cũng cần đổi. Không kiểm is_admin — chính chủ đưa đúng mật khẩu
        // cũ là được; danh tính lấy từ claim `sub` của token, không tin body.
        [Microsoft.AspNetCore.Authorization.Authorize]
        [HttpPost("change-password")]
        public async Task<IActionResult> DoiMatKhau([FromBody] DoiMatKhauRequest req)
        {
            var v = User.FindFirst("sub")?.Value
                 ?? User.FindFirst(System.IdentityModel.Tokens.Jwt.JwtRegisteredClaimNames.Sub)?.Value
                 ?? User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
            if (v == null || !Guid.TryParse(v, out var userId))
                return Unauthorized(new { message = "Token không có thông tin người dùng" });

            try { return Ok(new { message = await _auth.DoiMatKhau(userId, req) }); }
            catch (UnauthorizedAccessException ex) { return Unauthorized(new { message = ex.Message }); }
            catch (ArgumentException ex) { return BadRequest(new { message = ex.Message }); }
        }
    }
}