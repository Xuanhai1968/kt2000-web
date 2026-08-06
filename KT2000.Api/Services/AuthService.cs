using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using KT2000.Api.Data;
using KT2000.Api.Models;

namespace KT2000.Api.Services
{
    public class AuthService
    {
        private readonly AppDbContext _db;
        private readonly IConfiguration _config;

        public AuthService(AppDbContext db, IConfiguration config)
        {
            _db = db;
            _config = config;
        }

        // Buoc 1: go username -> tra danh sach don vi + nam + lua chon lan truoc
        // (thay: doc DM_DONVI + KT2000.INI [DONVIDAMO] trong VFP)
        public async Task<GetTenantsResponse> GetTenantsByUsername(string loginName)
        {
            var user = await _db.Users
                .FirstOrDefaultAsync(u => u.LoginName == loginName && u.IsActive);

            // Khong bao "user khong ton tai" de tranh do username
            if (user == null) return new GetTenantsResponse();

            var access = await _db.UserTenantAccess
                .Where(a => a.UserId == user.Id)
                .Include(a => a.Tenant)!.ThenInclude(t => t!.FiscalYears)
                .ToListAsync();

            var prefs = await _db.UserPreferences
                .Where(p => p.UserId == user.Id).ToListAsync();

            var lastTenant = prefs.FirstOrDefault(p => p.Key == "last_tenant_code")?.Value;
            var lastYear   = prefs.FirstOrDefault(p => p.Key == "last_fiscal_year")?.Value;

            return new GetTenantsResponse
            {
                Tenants = access
                    .Where(a => a.Tenant != null && a.Tenant.IsActive)
                    .OrderBy(a => a.Tenant!.SortName ?? a.Tenant!.Name)
                    .Select(a => new TenantInfo
                    {
                        Id = a.Tenant!.Id.ToString(),
                        Code = a.Tenant.Code,
                        Name = a.Tenant.Name,
                        TenantType = a.Tenant.TenantType,
                        Role = a.Role,
                        FiscalYears = a.Tenant.FiscalYears
                            .OrderByDescending(f => f.Year)
                            .Select(f => new FiscalYearInfo { Year = f.Year, IsClosed = f.IsClosed })
                            .ToList()
                    }).ToList(),
                LastPreferences = new LastPrefs
                {
                    TenantCode = lastTenant,
                    // TryParse chứ không Parse: prefs bẩn (sửa tay, dữ liệu cũ) chỉ nên làm
                    // mất gợi ý "năm lần trước", không được làm sập cả màn hình đăng nhập
                    FiscalYear = int.TryParse(lastYear, out var y) ? y : null
                }
            };
        }

        // Buoc 2: verify password + kiem tra quyen + kiem tra nam + luu prefs + tao JWT
        // (thay: cmdOK.Click trong Frm_Login_vn + 26 bien PUBLIC)
        public async Task<LoginResponse> Login(LoginRequest req)
        {
            var user = await _db.Users
                .FirstOrDefaultAsync(u => u.LoginName == req.Username && u.IsActive);
            if (user == null)
                throw new UnauthorizedAccessException("Không có USER này!");

            if (!BCrypt.Net.BCrypt.Verify(req.Password, user.PasswordHash))
                throw new UnauthorizedAccessException("Mật khẩu sai!");

            var tenantId = Guid.Parse(req.TenantId);
            var access = await _db.UserTenantAccess
                .Include(a => a.Tenant)
                .FirstOrDefaultAsync(a => a.UserId == user.Id && a.TenantId == tenantId);
            if (access?.Tenant == null)
                throw new UnauthorizedAccessException("Bạn không được quyền mở dữ liệu của đơn vị này");

            // AD-NB-05: instance NB chỉ chấp nhận login của user thuộc tenant 'noibo'.
            // NbModeGuard đã chặn mọi request sau đăng nhập, nhưng chặn ngay từ cửa login
            // thì người dùng nhận đúng thông báo thay vì đăng nhập xong mới bị 403 khắp nơi.
            if (string.Equals(_config["Mode"], "NB", StringComparison.OrdinalIgnoreCase)
                && access.Tenant.TenantType != "noibo")
                throw new UnauthorizedAccessException(
                    "Đơn vị này không mở trên máy chủ nội bộ. Vui lòng dùng bản trong mạng nội bộ.");

            var fy = await _db.FiscalYears
                .FirstOrDefaultAsync(f => f.TenantId == tenantId && f.Year == req.FiscalYear);
            if (fy == null)
                throw new UnauthorizedAccessException($"Dữ liệu cho năm {req.FiscalYear} không có");

            // Neu chon "Lay chi nhanh": tra kem danh sach chi nhanh cua don vi nay
            var branches = new List<object>();
            if (req.GetChiNhanh)
            {
                branches = await _db.Tenants
                    .Where(t => t.ParentId == tenantId && t.IsActive)
                    .Select(t => (object)new { code = t.Code, name = t.Name, dbName = t.DbName })
                    .ToListAsync();
            }

            // Luu preferences (thay WritePrivStr -> KT2000.INI)
            await UpsertPref(user.Id, "last_tenant_code", access.Tenant.Code);
            await UpsertPref(user.Id, "last_fiscal_year", req.FiscalYear.ToString());
            await _db.SaveChangesAsync();

            // JWT day du — thay 26 bien PUBLIC trong VFP
            var claims = new[]
            {
                new Claim(JwtRegisteredClaimNames.Sub, user.Id.ToString()),
                new Claim("login_name",  user.LoginName),
                new Claim("real_name",   user.RealName ?? ""),
                new Claim("is_admin",    user.IsAdmin.ToString()),
                new Claim("tenant_id",   access.Tenant.Id.ToString()),
                new Claim("tenant_code", access.Tenant.Code),
                new Claim("tenant_name", access.Tenant.Name),
                new Claim("tenant_db",   access.Tenant.DbName),
                new Claim("tenant_type", access.Tenant.TenantType),
                new Claim("fiscal_year", req.FiscalYear.ToString()),
                new Claim("role",        access.Role)
            };

            var key = new SymmetricSecurityKey(
                Encoding.UTF8.GetBytes(_config["Jwt:Key"]!));
            var token = new JwtSecurityToken(
                issuer: _config["Jwt:Issuer"],
                audience: _config["Jwt:Audience"],
                claims: claims,
                expires: DateTime.UtcNow.AddHours(10),
                signingCredentials: new SigningCredentials(key, SecurityAlgorithms.HmacSha256));

            return new LoginResponse
            {
                AccessToken = new JwtSecurityTokenHandler().WriteToken(token),
                User = new
                {
                    id = user.Id, loginName = user.LoginName,
                    realName = user.RealName, isAdmin = user.IsAdmin
                },
                Tenant = new
                {
                    id = access.Tenant.Id, code = access.Tenant.Code,
                    name = access.Tenant.Name, tenantType = access.Tenant.TenantType,
                    dbName = access.Tenant.DbName
                },
                Branches = branches,
                FiscalYear = req.FiscalYear
            };
        }

        private async Task UpsertPref(Guid userId, string key, string value)
        {
            var p = await _db.UserPreferences
                .FirstOrDefaultAsync(x => x.UserId == userId && x.Key == key);
            if (p == null)
                _db.UserPreferences.Add(new UserPreference { UserId = userId, Key = key, Value = value });
            else
                p.Value = value;
        }
    }
}