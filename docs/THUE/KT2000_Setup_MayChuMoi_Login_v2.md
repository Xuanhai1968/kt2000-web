# KT2000 Web — Setup máy chủ mới + Module Login (v2)

**Ngày:** 24/07/2026
**Stack:** C# ASP.NET Core 8 + Entity Framework + SQL Server | React + TypeScript + Ant Design | DB-per-tenant

---

## 0. CÁCH DÙNG TÀI LIỆU NÀY — QUY TRÌNH LÀM VIỆC CỦA TEAM

> **QUAN TRỌNG — đọc trước khi bắt đầu:**
>
> Toàn bộ code trong tài liệu này là **BẢN MẪU CHUẨN (reference implementation)** do Leader
> cùng Claude xây dựng. Mục đích: Leader hiểu rõ từng dòng, biết "chuẩn" trông như thế nào.
>
> Sau khi bản mẫu chạy được, **Leader sẽ phân công lại từng phần cho 2 dev** (xem bảng
> phân công ở Phần 7). Dev KHÔNG copy nguyên bản mẫu — dev đọc spec + bản mẫu, tự code
> lại phần được giao, rồi **hợp nhất code qua Git** để Leader review từng thay đổi.
>
> Quy tắc bắt buộc:
> 1. Mọi code phải nằm trong **Git repository chung** (Phần 3). Không gửi code qua Zalo/USB.
> 2. Mỗi task = 1 **branch riêng** → xong thì tạo **Pull Request** → Leader xem diff,
>    duyệt thì mới merge vào `main`.
> 3. Nhánh `main` luôn ở trạng thái **chạy được**. Ai làm hỏng `main` phải sửa ngay.
> 4. Leader có thể mở bất kỳ file nào, xem lịch sử ai sửa gì, khi nào (`git log`, `git blame`).

---

## 1. CHUẨN BỊ MÁY CHỦ MỚI

Máy chủ chỉ chứa **database**. Backend/frontend chạy trên máy dev (giai đoạn phát triển).

### Bước S1 — Đặt IP tĩnh cho máy chủ

1. Control Panel → Network → đổi IPv4 sang **Static** (ví dụ `192.168.1.4`).
   *Bài học lần trước: server test đổi IP động làm mất kết nối cả buổi — lần này đặt tĩnh ngay từ đầu.*
2. Ghi lại IP này — dùng trong mọi connection string. Trong tài liệu, chỗ nào ghi
   `<SERVER_IP>` thì thay bằng IP thật.

### Bước S2 — Cài SQL Server 2022

1. Tải tại: https://www.microsoft.com/en-us/sql-server/sql-server-downloads
2. Chọn bản **Developer** (miễn phí, đầy đủ tính năng — khuyên dùng cho server dev)
   hoặc **Express**.
3. Chạy installer → chọn **Basic** → Accept → Install (5–10 phút).
4. Màn hình kết thúc hiện `INSTANCE NAME: SQLEXPRESS` (nếu bản Express) — **chụp lại màn hình**.
5. Nhấn nút **Install SSMS** ở cuối màn hình → tải và cài SQL Server Management Studio.

> **Lưu ý instance name:** bản Express tạo instance `SQLEXPRESS`, bản Developer cài Basic
> thường là instance mặc định `MSSQLSERVER`. Điều này quyết định connection string:
> - Instance mặc định: `Server=<SERVER_IP>,1433`
> - Instance SQLEXPRESS: `Server=<SERVER_IP>\\SQLEXPRESS,1433` (trong JSON phải 2 dấu `\\`)

### Bước S3 — Bật SQL Server Authentication + đặt password sa

1. Mở SSMS → Connect với **Windows Authentication** (Server name: `localhost` hoặc `localhost\SQLEXPRESS`).
2. Object Explorer → click phải tên server → **Properties** → trang **Security**
   → chọn **SQL Server and Windows Authentication mode** → OK.
3. Security → Logins → click phải **sa** → Properties:
   - Trang General: đặt password mạnh (ghi lại cẩn thận).
   - Trang Status: Login = **Enabled**.
4. Click phải tên server → **Restart**.

### Bước S4 — Mở TCP/IP + Firewall
## Cách mở SQL Server Configuration Manager : 
Cách 1 — Start menu: bấm Start, tìm thư mục Microsoft SQL Server 2022 → trong đó có SQL Server 2022 Configuration Manager.
Cách 2 — chạy trực tiếp (chắc ăn nhất): nhấn Win + R, gõ: SQLServerManager16.msc

1. Mở **SQL Server Configuration Manager** → SQL Server Network Configuration
   → Protocols for SQLEXPRESS (hoặc MSSQLSERVER):
   - **TCP/IP** → Enabled = Yes.
   - Click phải TCP/IP → Properties → tab IP Addresses → kéo xuống **IPAll**:
     xóa `TCP Dynamic Ports`, đặt `TCP Port = 1433`.
2. Restart service **SQL Server (SQLEXPRESS)** trong `services.msc`.
3. Mở Windows Firewall → Inbound Rules → New Rule → Port → TCP **1433** → Allow.
4. Nếu dùng bản Express: bật thêm service **SQL Server Browser** (Startup type: Automatic).

### Bước S5 — Kiểm tra từ máy dev

Trên máy Leader, mở SSMS → Connect:
- Server name: `<SERVER_IP>,1433` (hoặc `<SERVER_IP>\SQLEXPRESS,1433`)
- Authentication: SQL Server Authentication, login `sa` + password.

Kết nối được → máy chủ sẵn sàng. Không được → kiểm tra lại S3, S4 theo đúng thứ tự.

---

## 2. TẠO DATABASE KT2000_Master

Mở SSMS trên máy chủ (hoặc từ máy Leader) → New Query → chạy toàn bộ script:

```sql
CREATE DATABASE KT2000_Master;
GO
USE KT2000_Master;
GO

-- ============ 1. Users ============
CREATE TABLE Users (
    Id            UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
    LoginName     NVARCHAR(50)  NOT NULL UNIQUE,
    PasswordHash  NVARCHAR(200) NOT NULL,
    RealName      NVARCHAR(100) NULL,
    IsAdmin       BIT NOT NULL DEFAULT 0,
    IsActive      BIT NOT NULL DEFAULT 1,
    CreatedAt     DATETIME2 NOT NULL DEFAULT SYSDATETIME()
);

-- ============ 2. Tenants (DM_DONVI cũ + 6 cột mở rộng) ============
CREATE TABLE Tenants (
    Id            UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
    Code          NVARCHAR(30)  NOT NULL UNIQUE,   -- MA_DONVI
    Name          NVARCHAR(200) NOT NULL,           -- TEN_DONVI
    DbName        NVARCHAR(100) NOT NULL,           -- ten database rieng: KT_<Code>
    TenantType    NVARCHAR(20)  NOT NULL DEFAULT 'headquarter', -- headquarter | branch
    ParentId      UNIQUEIDENTIFIER NULL REFERENCES Tenants(Id), -- chi nhanh -> cong ty me
    TaxCode       NVARCHAR(20)  NULL,               -- MST
    Address       NVARCHAR(300) NULL,
    IsActive      BIT NOT NULL DEFAULT 1,
    -- 6 cot mo rong da chot (script ALTER cu):
    VonDK         DECIMAL(18,0) NULL,               -- von dieu le
    Email         NVARCHAR(100) NULL,
    SortName      NVARCHAR(50)  NULL,               -- ten viet tat de sap xep/tim
    TkCongNo      NVARCHAR(20)  NULL,               -- TK cong no mac dinh
    NamQuyetToan  INT NULL,                          -- nam da quyet toan
    KhaiQuy       BIT NOT NULL DEFAULT 0            -- khai thue theo quy
);

-- ============ 3. UserTenantAccess ============
CREATE TABLE UserTenantAccess (
    UserId    UNIQUEIDENTIFIER NOT NULL REFERENCES Users(Id),
    TenantId  UNIQUEIDENTIFIER NOT NULL REFERENCES Tenants(Id),
    Role      NVARCHAR(20) NOT NULL DEFAULT 'accountant', -- admin | accountant | viewer
    PRIMARY KEY (UserId, TenantId)
);

-- ============ 4. FiscalYears ============
CREATE TABLE FiscalYears (
    TenantId  UNIQUEIDENTIFIER NOT NULL REFERENCES Tenants(Id),
    [Year]    INT NOT NULL,
    IsClosed  BIT NOT NULL DEFAULT 0,
    PRIMARY KEY (TenantId, [Year])
);

-- ============ 5. UserPreferences (thay KT2000.INI) ============
CREATE TABLE UserPreferences (
    UserId  UNIQUEIDENTIFIER NOT NULL REFERENCES Users(Id),
    [Key]   NVARCHAR(50)  NOT NULL,
    [Value] NVARCHAR(200) NULL,
    PRIMARY KEY (UserId, [Key])
);
GO

-- ============ SEED DU LIEU TEST ============
-- Password da hash san bang BCrypt:
--   admin    / admin123
--   ketoan01 / ketoan123
DECLARE @AdminId  UNIQUEIDENTIFIER = NEWID();
DECLARE @KetoanId UNIQUEIDENTIFIER = NEWID();
DECLARE @T1 UNIQUEIDENTIFIER = NEWID();
DECLARE @T2 UNIQUEIDENTIFIER = NEWID();
DECLARE @T3 UNIQUEIDENTIFIER = NEWID();

INSERT INTO Users (Id, LoginName, PasswordHash, RealName, IsAdmin) VALUES
(@AdminId,  N'admin',    N'$2b$11$mVdKVCCx.diDYeN7x3zE0OBNNnBuzOvHXlv60TK3zyjhTHp3dW4PK', N'Quản trị viên', 1),
(@KetoanId, N'ketoan01', N'$2b$11$jNqa2AO6ENMPIMhM1mRb4O75h4rryXM0WcidJn1wqzVTAGCvVxupG', N'Kế toán 01',    0);

INSERT INTO Tenants (Id, Code, Name, DbName, TenantType) VALUES
(@T1, N'HA_THAI',     N'Công ty TNHH Hà Thái',      N'KT_HA_THAI',     N'headquarter'),
(@T2, N'HA_THAI_CN1', N'Chi nhánh 1 - Hà Thái',     N'KT_HA_THAI_CN1', N'branch'),
(@T3, N'CONG_TY_B',   N'Công ty CP Sản Xuất B',     N'KT_CONG_TY_B',   N'headquarter');
UPDATE Tenants SET ParentId = @T1 WHERE Id = @T2;

INSERT INTO UserTenantAccess (UserId, TenantId, Role) VALUES
(@AdminId, @T1, N'admin'), (@AdminId, @T2, N'admin'), (@AdminId, @T3, N'admin'),
(@KetoanId, @T1, N'accountant');

INSERT INTO FiscalYears (TenantId, [Year]) VALUES
(@T1, 2025),(@T1, 2026),(@T2, 2026),(@T3, 2025),(@T3, 2026);
GO
```

> Khi chuyển sang dữ liệu thật: chạy lại script **INSERT 151 tenants** từ DM_DONVI
> (đã có từ đợt trước — nếu thất lạc thì xuất lại DM_DONVI ra Excel, Claude tạo lại script).

---

## 3. GIT — REPO CHUNG ĐỂ HỢP NHẤT CODE VÀ LEADER REVIEW

Đây là phần bắt buộc trước khi dev bắt đầu code.

### 3.1 Cài đặt

Mọi máy (Leader + 2 dev): cài Git từ https://git-scm.com/download/win (Next hết là được).
Mỗi người cấu hình tên (để `git log` biết ai commit):

```powershell
git config --global user.name  "Ten Cua Ban"
git config --global user.email "email@congty.vn"
```

### 3.2 Tạo repo trung tâm

**Cách khuyên dùng:** tạo tài khoản GitHub (miễn phí) → New repository → `kt2000-web`
→ **Private** → mời 2 dev làm collaborator.
(Nếu không muốn code ra internet: tạo bare repo trên máy chủ nội bộ
`git init --bare D:\GitRepos\kt2000-web.git` và share thư mục qua LAN — cách này
không có giao diện Pull Request, Leader review bằng `git diff`, kém tiện hơn.)

### 3.3 Cấu trúc repo

```
kt2000-web/
├── KT2000.Api/       ← Backend C#
├── kt2000-web/       ← Frontend React
├── database/         ← Các script SQL (mỗi thay đổi DB = 1 file .sql đánh số)
│   └── 001_create_master.sql
├── docs/             ← Spec do Leader viết (spec-auth-login.md, ...)
└── README.md
```

### 3.4 Quy trình làm việc (mỗi task)

```powershell
# Dev bat dau task:
git checkout main
git pull                              # lay code moi nhat
git checkout -b feature/auth-service  # tao branch rieng cho task

# ... code ...
git add .
git commit -m "Task 12: AuthService.Login - verify bcrypt + lay tenant access"
git push -u origin feature/auth-service
```

Sau đó dev mở **Pull Request** trên GitHub → Leader vào tab *Files changed* xem từng
dòng diff, comment trực tiếp vào dòng code nếu cần sửa → dev sửa, push tiếp →
Leader nhấn **Merge** khi đạt.

**Leader theo dõi:**
- `git log --oneline --graph --all` — toàn cảnh lịch sử.
- `git blame <file>` — dòng nào do ai viết.
- Tab Pull Requests — mọi thứ đang chờ review.

---

## 4. BACKEND — KT2000.Api (ASP.NET Core 8)

> Máy dev backend cần: **Visual Studio 2022 Community** (workload "ASP.NET and web
> development") hoặc .NET 8 SDK + VS Code.

### 4.1 Tạo project + cài package

```powershell
cd D:\WebAPP\kt2000-web
dotnet new webapi -n KT2000.Api --no-openapi false
cd KT2000.Api
dotnet add package Microsoft.EntityFrameworkCore.SqlServer
dotnet add package BCrypt.Net-Next
dotnet add package Microsoft.AspNetCore.Authentication.JwtBearer
dotnet add package Swashbuckle.AspNetCore
```

Xóa file mẫu `WeatherForecast.cs` và `Controllers/WeatherForecastController.cs`.

### 4.2 Models/Entities.cs

```csharp
namespace KT2000.Api.Models
{
    public class User
    {
        public Guid Id { get; set; }
        public string LoginName { get; set; } = "";
        public string PasswordHash { get; set; } = "";
        public string? RealName { get; set; }
        public bool IsAdmin { get; set; }
        public bool IsActive { get; set; }
        public DateTime CreatedAt { get; set; }
    }

    public class Tenant
    {
        public Guid Id { get; set; }
        public string Code { get; set; } = "";
        public string Name { get; set; } = "";
        public string DbName { get; set; } = "";
        public string TenantType { get; set; } = "headquarter";
        public Guid? ParentId { get; set; }
        public string? TaxCode { get; set; }
        public string? Address { get; set; }
        public bool IsActive { get; set; }
        public decimal? VonDK { get; set; }
        public string? Email { get; set; }
        public string? SortName { get; set; }
        public string? TkCongNo { get; set; }
        public int? NamQuyetToan { get; set; }
        public bool KhaiQuy { get; set; }
        public List<FiscalYear> FiscalYears { get; set; } = new();
    }

    public class UserTenantAccess
    {
        public Guid UserId { get; set; }
        public Guid TenantId { get; set; }
        public string Role { get; set; } = "accountant";
        public User? User { get; set; }
        public Tenant? Tenant { get; set; }
    }

    public class FiscalYear
    {
        public Guid TenantId { get; set; }
        public int Year { get; set; }
        public bool IsClosed { get; set; }
    }

    public class UserPreference
    {
        public Guid UserId { get; set; }
        public string Key { get; set; } = "";
        public string? Value { get; set; }
    }
}
```

### 4.3 Models/AuthDtos.cs

```csharp
namespace KT2000.Api.Models
{
    // ---- Requests ----
    public class GetTenantsRequest
    {
        public string Username { get; set; } = "";
    }

    public class LoginRequest
    {
        public string Username { get; set; } = "";
        public string Password { get; set; } = "";
        public string TenantId { get; set; } = "";
        public int FiscalYear { get; set; }
        public bool GetChiNhanh { get; set; }   // checkbox "Lay chi nhanh"
    }

    // ---- Responses ----
    public class FiscalYearInfo
    {
        public int Year { get; set; }
        public bool IsClosed { get; set; }
    }

    public class TenantInfo
    {
        public string Id { get; set; } = "";
        public string Code { get; set; } = "";
        public string Name { get; set; } = "";
        public string TenantType { get; set; } = "";
        public string Role { get; set; } = "";
        public List<FiscalYearInfo> FiscalYears { get; set; } = new();
    }

    public class LastPrefs
    {
        public string? TenantCode { get; set; }
        public int? FiscalYear { get; set; }
    }

    public class GetTenantsResponse
    {
        public List<TenantInfo> Tenants { get; set; } = new();
        public LastPrefs LastPreferences { get; set; } = new();
    }

    public class LoginResponse
    {
        public string AccessToken { get; set; } = "";
        public object User { get; set; } = new();
        public object Tenant { get; set; } = new();
        public List<object> Branches { get; set; } = new();  // khi GetChiNhanh = true
        public int FiscalYear { get; set; }
    }
}
```

### 4.4 Data/AppDbContext.cs

```csharp
using Microsoft.EntityFrameworkCore;
using KT2000.Api.Models;

namespace KT2000.Api.Data
{
    public class AppDbContext : DbContext
    {
        public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

        public DbSet<User> Users => Set<User>();
        public DbSet<Tenant> Tenants => Set<Tenant>();
        public DbSet<UserTenantAccess> UserTenantAccess => Set<UserTenantAccess>();
        public DbSet<FiscalYear> FiscalYears => Set<FiscalYear>();
        public DbSet<UserPreference> UserPreferences => Set<UserPreference>();

        protected override void OnModelCreating(ModelBuilder mb)
        {
            mb.Entity<User>().HasIndex(u => u.LoginName).IsUnique();
            mb.Entity<Tenant>().HasIndex(t => t.Code).IsUnique();
            mb.Entity<Tenant>()
              .HasMany(t => t.FiscalYears).WithOne().HasForeignKey(f => f.TenantId);
            mb.Entity<UserTenantAccess>().HasKey(x => new { x.UserId, x.TenantId });
            mb.Entity<UserTenantAccess>()
              .HasOne(x => x.User).WithMany().HasForeignKey(x => x.UserId);
            mb.Entity<UserTenantAccess>()
              .HasOne(x => x.Tenant).WithMany().HasForeignKey(x => x.TenantId);
            mb.Entity<FiscalYear>().HasKey(x => new { x.TenantId, x.Year });
            mb.Entity<UserPreference>().HasKey(x => new { x.UserId, x.Key });
        }
    }
}
```

### 4.5 Services/AuthService.cs

```csharp
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
                    FiscalYear = lastYear != null ? int.Parse(lastYear) : null
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
```

### 4.6 Controllers/AuthController.cs

```csharp
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
```

### 4.7 appsettings.json
### Cách tạo chuỗi "Key"
Hai lưu ý thực tế: (1) chuỗi này mình sinh làm mẫu và nó đã xuất hiện trong cuộc trò chuyện, nên với môi trường dev dùng luôn không sao, nhưng khi nào chạy thật thì thay bằng chuỗi khác chỉ mình bạn có — cách tự sinh nhanh: mở PowerShell gõ [Convert]::ToBase64String((1..48 | ForEach-Object { Get-Random -Maximum 256 })). (2) Đổi Key nghĩa là mọi JWT đã phát trước đó thành vô hiệu — mọi người phải login lại, chỉ thế thôi, không mất mát gì. Đây cũng chính là "nút khẩn cấp" hữu ích: nghi ngờ lộ token thì đổi Key một phát là toàn bộ token cũ chết sạch.

Còn Issuer/Audience bên cạnh thì giữ nguyên KT2000/KT2000Web — chúng chỉ là nhãn ghi "ai phát hành, phát cho ai", không phải bí mật.

Điền xong Key + connection string (nhớ 2 dấu \\ và password sa thật) rồi Ctrl+S, bạn báo mình để sang Services/AuthService.cs — file nghiệp vụ chính nhé.




```json
{
  "ConnectionStrings": {
    "DefaultConnection": "Server=<SERVER_IP>\\SQLEXPRESS,1433;Database=KT2000_Master;User Id=sa;Password=<SA_PASSWORD>;TrustServerCertificate=True"
  },
  "Jwt": {
    "Key": "KT2000-doi-chuoi-nay-thanh-chuoi-ngau-nhien-dai-it-nhat-32-ky-tu!!",
    "Issuer": "KT2000",
    "Audience": "KT2000Web"
  },
  "Logging": { "LogLevel": { "Default": "Information" } },
  "AllowedHosts": "*"
}
```

> Instance mặc định (MSSQLSERVER) thì bỏ `\\SQLEXPRESS`: `Server=<SERVER_IP>,1433;...`

### 4.8 Program.cs

```csharp
using Microsoft.EntityFrameworkCore;
using KT2000.Api.Data;
using KT2000.Api.Services;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddDbContext<AppDbContext>(o =>
    o.UseSqlServer(builder.Configuration.GetConnectionString("DefaultConnection")));

builder.Services.AddScoped<AuthService>();
builder.Services.AddControllers();

builder.Services.AddCors(o => o.AddPolicy("AllowReact", p =>
    p.WithOrigins("http://localhost:5173").AllowAnyHeader().AllowAnyMethod()));

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

var app = builder.Build();

app.UseSwagger();
app.UseSwaggerUI();
app.UseCors("AllowReact");
app.MapControllers();

app.Run("http://localhost:5000");
```

### 4.9 Chạy và test

```powershell
dotnet run
```

Mở http://localhost:5000/swagger:
1. `POST /api/auth/get-tenants` với `{"username":"admin"}` → phải trả 3 đơn vị.
2. `POST /api/auth/login` với
   `{"username":"admin","password":"admin123","tenantId":"<id lấy từ bước 1>","fiscalYear":2026,"getChiNhanh":true}`
   → phải trả `accessToken` + tenant + branches.

---

## 5. FRONTEND — kt2000-web (React + TypeScript + Ant Design)

> Máy dev frontend cần: **Node.js LTS** + **VS Code**.

### 5.1 Tạo project

```powershell
cd D:\WebAPP\kt2000-web
npm create vite@latest kt2000-web -- --template react-ts
cd kt2000-web
npm install
npm install antd axios react-router-dom
```

### 5.2 src/api.ts

```typescript
import axios from "axios";

const api = axios.create({ baseURL: "http://localhost:5000/api" });

// Gan token vao moi request sau khi login
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("kt2000_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export interface FiscalYearInfo { year: number; isClosed: boolean; }
export interface TenantInfo {
  id: string; code: string; name: string;
  tenantType: string; role: string; fiscalYears: FiscalYearInfo[];
}
export interface GetTenantsResponse {
  tenants: TenantInfo[];
  lastPreferences: { tenantCode: string | null; fiscalYear: number | null };
}

export const getTenants = (username: string) =>
  api.post<GetTenantsResponse>("/auth/get-tenants", { username });

export const login = (payload: {
  username: string; password: string;
  tenantId: string; fiscalYear: number; getChiNhanh: boolean;
}) => api.post("/auth/login", payload);

export default api;
```

### 5.3 src/AuthContext.tsx — thay 26 biến PUBLIC

```tsx
//import { createContext, useContext, useState, ReactNode } from "react";
import { createContext, useContext, useState } from "react";
import type { ReactNode } from "react";

// Thay cho 26 bien PUBLIC trong VFP — moi thu ve phien lam viec nam o day
export interface Session {
  accessToken: string;
  user: { id: string; loginName: string; realName: string; isAdmin: boolean };
  tenant: { id: string; code: string; name: string; tenantType: string; dbName: string };
  branches: { code: string; name: string; dbName: string }[];
  fiscalYear: number;
}

interface AuthCtx {
  session: Session | null;
  signIn: (s: Session) => void;
  signOut: () => void;
}

const Ctx = createContext<AuthCtx>({ session: null, signIn: () => {}, signOut: () => {} });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(() => {
    const raw = localStorage.getItem("kt2000_session");
    return raw ? (JSON.parse(raw) as Session) : null;
  });

  const signIn = (s: Session) => {
    localStorage.setItem("kt2000_token", s.accessToken);      // thay KT2000.INI
    localStorage.setItem("kt2000_session", JSON.stringify(s));
    setSession(s);
  };

  const signOut = () => {
    localStorage.removeItem("kt2000_token");
    localStorage.removeItem("kt2000_session");
    setSession(null);
  };

  return <Ctx.Provider value={{ session, signIn, signOut }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
```

### 5.4 src/LoginPage.tsx — 1 màn hình giống VFP

```tsx
import { useState } from "react";
import { Card, Form, Input, Select, Checkbox, Button, message, Typography } from "antd";
import { useNavigate } from "react-router-dom";
//import { getTenants, login, TenantInfo } from "./api";
import { getTenants, login } from "./api";
import type { TenantInfo } from "./api";
import { useAuth } from "./AuthContext";

export default function LoginPage() {
  const [form] = Form.useForm();
  const [tenants, setTenants] = useState<TenantInfo[]>([]);
  const [years, setYears] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const { signIn } = useAuth();
  const nav = useNavigate();

  // Go username xong (blur) -> tai danh sach don vi + nho lua chon lan truoc
  // (thay: TxtUser_Name.Valid + doc [DONVIDAMO] trong KT2000.INI)
  const onUsernameBlur = async () => {
    const username = form.getFieldValue("username")?.trim();
    if (!username) return;
    try {
      const { data } = await getTenants(username);
      setTenants(data.tenants);
      const last = data.lastPreferences;
      const lastTenant = data.tenants.find(t => t.code === last.tenantCode);
      if (lastTenant) {
        form.setFieldValue("tenantId", lastTenant.id);
        onTenantChange(lastTenant.id, data.tenants);
        if (last.fiscalYear) form.setFieldValue("fiscalYear", last.fiscalYear);
      }
    } catch { /* im lang — khong lo username ton tai hay khong */ }
  };

  // Chon don vi -> nap danh sach nam cua don vi do (thay CboNam.Requery)
  const onTenantChange = (tenantId: string, list: TenantInfo[] = tenants) => {
    const t = list.find(x => x.id === tenantId);
    const ys = t ? t.fiscalYears.map(f => f.year) : [];
    setYears(ys);
    form.setFieldValue("fiscalYear", ys[0]);
  };

  // Dang nhap (thay cmdOK.Click)
  const onFinish = async (v: any) => {
    setLoading(true);
    try {
      const { data } = await login({
        username: v.username.trim(),
        password: v.password,
        tenantId: v.tenantId,
        fiscalYear: v.fiscalYear,
        getChiNhanh: !!v.getChiNhanh,
      });
      signIn(data);
      nav("/dashboard");
    } catch (e: any) {
      message.error(e?.response?.data?.message ?? "Đăng nhập thất bại");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#f0f2f5" }}>
      <Card style={{ width: 420 }}>
        <Typography.Title level={3} style={{ textAlign: "center", marginTop: 0 }}>
          KT2000 Web
        </Typography.Title>
        <Form form={form} layout="vertical" onFinish={onFinish}>
          <Form.Item name="username" label="Tên đăng nhập" rules={[{ required: true }]}>
            <Input onBlur={onUsernameBlur} autoFocus />
          </Form.Item>
          <Form.Item name="password" label="Mật khẩu" rules={[{ required: true }]}>
            <Input.Password />
          </Form.Item>
          <Form.Item name="tenantId" label="Đơn vị" rules={[{ required: true }]}>
            <Select
              showSearch
              optionFilterProp="label"
              onChange={(v) => onTenantChange(v)}
              options={tenants.map(t => ({
                value: t.id,
                label: `${t.code} — ${t.name}`,
              }))}
              placeholder="Gõ tên đăng nhập trước để hiện danh sách"
            />
          </Form.Item>
          <Form.Item name="fiscalYear" label="Năm làm việc" rules={[{ required: true }]}>
            <Select options={years.map(y => ({ value: y, label: y }))} />
          </Form.Item>
          <Form.Item name="getChiNhanh" valuePropName="checked">
            <Checkbox>Lấy chi nhánh</Checkbox>
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={loading}>
            Đăng nhập
          </Button>
        </Form>
      </Card>
    </div>
  );
}
```

### 5.5 src/DashboardPage.tsx

```tsx
import { Card, Descriptions, Button, Tag } from "antd";
import { useNavigate } from "react-router-dom";
import { useAuth } from "./AuthContext";

export default function DashboardPage() {
  const { session, signOut } = useAuth();
  const nav = useNavigate();
  if (!session) { nav("/"); return null; }

  return (
    <div style={{ maxWidth: 720, margin: "40px auto", padding: 16 }}>
      <Card
        title="Phiên làm việc"
        extra={<Button onClick={() => { signOut(); nav("/"); }}>Đăng xuất</Button>}
      >
        <Descriptions column={1} bordered size="small">
          <Descriptions.Item label="Người dùng">
            {session.user.realName} ({session.user.loginName})
            {session.user.isAdmin && <Tag color="red" style={{ marginLeft: 8 }}>Admin</Tag>}
          </Descriptions.Item>
          <Descriptions.Item label="Đơn vị">
            {session.tenant.code} — {session.tenant.name}
          </Descriptions.Item>
          <Descriptions.Item label="Database">{session.tenant.dbName}</Descriptions.Item>
          <Descriptions.Item label="Năm làm việc">{session.fiscalYear}</Descriptions.Item>
          {session.branches.length > 0 && (
            <Descriptions.Item label="Chi nhánh">
              {session.branches.map(b => <Tag key={b.code}>{b.code}</Tag>)}
            </Descriptions.Item>
          )}
        </Descriptions>
      </Card>
    </div>
  );
}
```

### 5.6 src/App.tsx + src/main.tsx

```tsx
// App.tsx
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./AuthContext";
import LoginPage from "./LoginPage";
import DashboardPage from "./DashboardPage";

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LoginPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
```

```tsx
// main.tsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "antd/dist/reset.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode><App /></React.StrictMode>
);
```

### 5.7 Chạy

```powershell
npm run dev
```

Mở http://localhost:5173 (backend phải đang chạy ở cổng 5000).

---

## 6. CHECKLIST NGHIỆM THU MODULE LOGIN

| # | Kiểm tra | Kết quả mong đợi |
|---|---|---|
| 1 | Gõ `admin` rồi tab ra | Combobox Đơn vị hiện 3 đơn vị, tự chọn lại đơn vị/năm lần trước |
| 2 | Gõ `ketoan01` | Chỉ hiện 1 đơn vị (HA_THAI) |
| 3 | Gõ username không tồn tại | Combobox rỗng, KHÔNG có thông báo lộ thông tin |
| 4 | Password sai | Báo "Mật khẩu sai!" |
| 5 | Login đúng | Chuyển sang Dashboard, hiện đủ user/đơn vị/năm |
| 6 | Tick "Lấy chi nhánh" + chọn HA_THAI | Dashboard hiện tag chi nhánh HA_THAI_CN1 |
| 7 | F5 trang Dashboard | Vẫn giữ phiên (localStorage) |
| 8 | Đăng xuất | Về trang login, token bị xóa |

---

## 7. BẢNG PHÂN CÔNG CHO 2 DEV (sau khi bản mẫu chạy)

Leader viết spec (docs/spec-auth-login.md) trước khi giao. Mỗi task = 1 branch = 1 Pull Request.

| # | Task | Ai | Sản phẩm | Ước lượng |
|---|---|---|---|---|
| 1 | Setup máy chủ + KT2000_Master + seed | Leader (theo Phần 1–2) | database/001_create_master.sql | 0.5 ngày |
| 2 | Tạo repo Git + đưa khung project lên | Leader | repo kt2000-web trên GitHub | 0.5 ngày |
| 3 | Project ASP.NET + NuGet + Entities + DbContext | Dev 1 (C#) | KT2000.Api khung | 0.5 ngày |
| 4 | AuthService.GetTenantsByUsername | Dev 1 (C#) | Services/AuthService.cs | 0.5 ngày |
| 5 | AuthService.Login (bcrypt + quyền + năm + JWT) | Dev 1 (C#) | Services/AuthService.cs | 1 ngày |
| 6 | AuthController + Program.cs + CORS + Swagger | Dev 1 (C#) | Controllers, Program.cs | 0.5 ngày |
| 7 | Project Vite + api.ts + AuthContext | Dev 2 (Python đang học TS) | src/api.ts, AuthContext.tsx | 1 ngày |
| 8 | LoginPage (1 màn hình, nhớ lựa chọn) | Dev 2 | src/LoginPage.tsx | 1 ngày |
| 9 | DashboardPage + routing + đăng xuất | Dev 2 | src/DashboardPage.tsx, App.tsx | 0.5 ngày |
| 10 | Test chéo theo checklist Phần 6 | Cả 2 dev | Ghi kết quả vào PR | 0.5 ngày |
| 11 | Review + merge từng PR | Leader | main chạy được | liên tục |

> Ghi chú: 2 dev hiện tại của mình 1 người mạnh Python, 1 người C#. Dev C# nhận backend
> là tự nhiên; dev Python nhận frontend TypeScript (cú pháp gần Python hơn C#) — Leader
> theo dõi sát PR đầu tiên của mỗi người để chỉnh hướng sớm.

---

*Tài liệu này thay thế KT2000_Setup_Step1 cũ. Khi có thay đổi, sửa trực tiếp trong repo (docs/) để cả team dùng chung một nguồn.*
