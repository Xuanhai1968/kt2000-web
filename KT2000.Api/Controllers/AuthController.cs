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

        // POST api/auth/get-tenants  { "username": "admin" }
        [HttpPost("get-tenants")]
        public async Task<IActionResult> GetTenants([FromBody] GetTenantsRequest req)
            => Ok(await _auth.GetTenantsByUsername(req.Username));

        // POST api/auth/login
        // { "username","password","tenantId","fiscalYear","getChiNhanh" }
        [HttpPost("login")]
        public async Task<IActionResult> Login([FromBody] LoginRequest req)
        {
            try { return Ok(await _auth.Login(req)); }
            catch (UnauthorizedAccessException ex)
            { return Unauthorized(new { message = ex.Message }); }
        }
    }
}