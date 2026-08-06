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

        // Câu trả lời DUY NHẤT cho mọi kiểu sai ở cửa đăng nhập. Tách thành hằng số để
        // không đường nào lỡ nói khác đi: chỉ cần một thông báo riêng cho "sai mật khẩu"
        // là kẻ dò biết ngay tài khoản đó có thật.
        private const string SAI_DANG_NHAP = "Tên đăng nhập hoặc mật khẩu không đúng";

        // Bước 1: username + mật khẩu -> danh sách đơn vị + năm + lựa chọn lần trước
        // (thay: doc DM_DONVI + KT2000.INI [DONVIDAMO] trong VFP)
        //
        // Mật khẩu bị kiểm hai lần (ở đây rồi lại ở Login) — cố ý. Đổi lại là giữ nguyên
        // được luồng hai bước quen thuộc mà không phải phát sinh thêm một loại token tạm.
        public async Task<GetTenantsResponse> GetTenantsByUsername(string loginName, string password)
        {
            var user = await _db.Users
                .FirstOrDefaultAsync(u => u.LoginName == loginName && u.IsActive);

            // Không phân biệt "không có user" với "sai mật khẩu", cũng không phân biệt
            // với "đã bị khóa": mọi khác biệt ở đây đều là một cái máy dò tài khoản.
            if (user == null || !BCrypt.Net.BCrypt.Verify(password, user.PasswordHash))
                throw new UnauthorizedAccessException(SAI_DANG_NHAP);

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
            // Trước đây tách "Không có USER này!" và "Mật khẩu sai!" — đúng kiểu VFP cũ,
            // nhưng đó chính là máy dò tài khoản. Vá get-tenants mà để hở chỗ này thì
            // chẳng vá được gì.
            if (user == null || !BCrypt.Net.BCrypt.Verify(req.Password, user.PasswordHash))
                throw new UnauthorizedAccessException(SAI_DANG_NHAP);

            var tenantId = Guid.Parse(req.TenantId);
            var access = await _db.UserTenantAccess
                .Include(a => a.Tenant)
                .FirstOrDefaultAsync(a => a.UserId == user.Id && a.TenantId == tenantId);
            if (access?.Tenant == null)
                throw new UnauthorizedAccessException("Bạn không được quyền mở dữ liệu của đơn vị này");

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
                    realName = user.RealName, isAdmin = user.IsAdmin,
                    // QT-01: frontend thấy cờ này thì bắt đổi mật khẩu ngay sau đăng nhập
                    mustChangePassword = user.MustChangePassword
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

        // AD-QT-01: đây là endpoint quản trị DUY NHẤT sống ở cả hai instance — user NB
        // trên internet cũng phải tự đổi được mật khẩu. Vì vậy nó không kiểm is_admin,
        // chỉ kiểm chính chủ: phải đưa đúng mật khẩu cũ.
        public async Task<string> DoiMatKhau(Guid userId, DoiMatKhauRequest req)
        {
            var user = await _db.Users.FirstOrDefaultAsync(u => u.Id == userId && u.IsActive)
                ?? throw new UnauthorizedAccessException("Tài khoản không tồn tại hoặc đã bị khóa");

            if (!BCrypt.Net.BCrypt.Verify(req.MatKhauCu, user.PasswordHash))
                throw new UnauthorizedAccessException("Mật khẩu hiện tại không đúng");
            if (string.IsNullOrWhiteSpace(req.MatKhauMoi) || req.MatKhauMoi.Length < 8)
                throw new ArgumentException("Mật khẩu mới tối thiểu 8 ký tự");
            if (!req.MatKhauMoi.Any(char.IsDigit))
                throw new ArgumentException("Mật khẩu mới phải có ít nhất một chữ số");
            if (BCrypt.Net.BCrypt.Verify(req.MatKhauMoi, user.PasswordHash))
                throw new ArgumentException("Mật khẩu mới phải khác mật khẩu cũ");

            user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(req.MatKhauMoi);
            user.MustChangePassword = false;
            // Từ giây phút này mật khẩu là của người dùng, không phải của admin nữa —
            // xóa hẳn bản admin xem được (chốt 06/08).
            user.MatKhauBanDauMaHoa = null;
            await _db.SaveChangesAsync();

            await _db.Database.ExecuteSqlRawAsync(
                @"INSERT INTO ActivityLog (UserName, Action, Detail)
                  VALUES ({0}, N'DOI_MAT_KHAU', N'Tự đổi mật khẩu')", user.LoginName);

            return "Đã đổi mật khẩu";
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