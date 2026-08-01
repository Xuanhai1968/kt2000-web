# WP-01a (phần 1) — AppShell "2 trong 1": MDN_NB + đơn vị thường

Sản phẩm sau bước này: đăng nhập **MDN_NB** → menu chung → bấm "Hóa đơn GTGT đầu
vào" ra **console danh sách đơn vị + tick + nút Lấy HĐĐT**; đăng nhập **đơn vị
thường** → cùng menu, cùng nút → ra khung hóa đơn của đơn vị đó. Kèm hàng rào
phân quyền claim `internal` ở backend.

Làm theo thứ tự 1 → 6. Mỗi bước xong Ctrl+S (nhớ soát chấm tròn!).

---

## 1. Database — seed đơn vị MDN_NB

File mới `database/002_add_mdn_nb.sql`, chạy trong SSMS (chọn đúng database
KT2000_Master):

```sql
USE KT2000_Master;
GO
DECLARE @Mdn UNIQUEIDENTIFIER = NEWID();

INSERT INTO Tenants (Id, Code, Name, DbName, TenantType)
VALUES (@Mdn, N'MDN_NB', N'Công ty MDN Nội bộ', N'MDN_NB', N'internal');

INSERT INTO FiscalYears (TenantId, [Year]) VALUES (@Mdn, 2026);

INSERT INTO UserTenantAccess (UserId, TenantId, Role)
SELECT Id, @Mdn, N'admin' FROM Users WHERE LoginName = N'admin';
GO
```

Không phải sửa gì ở AuthService — MDN_NB chỉ là một tenant, login cũ tự thấy nó.
JWT phát ra sẽ mang `tenant_type = internal` (claim này đã có sẵn từ đầu).

## 2. Backend — bật bộ kiểm tra JWT (Program.cs)

Thay TOÀN BỘ `Program.cs` bằng bản dưới (bản cũ + khối Authentication):

```csharp
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using System.Text;
using KT2000.Api.Data;
using KT2000.Api.Services;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddDbContext<AppDbContext>(o =>
    o.UseSqlServer(builder.Configuration.GetConnectionString("DefaultConnection")));

builder.Services.AddScoped<AuthService>();
builder.Services.AddControllers();

// ---- MỚI: dạy backend cách KIỂM TRA JWT (trước giờ mới chỉ biết PHÁT) ----
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(o =>
    {
        o.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidIssuer = builder.Configuration["Jwt:Issuer"],
            ValidateAudience = true,
            ValidAudience = builder.Configuration["Jwt:Audience"],
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(
                Encoding.UTF8.GetBytes(builder.Configuration["Jwt:Key"]!)),
            ValidateLifetime = true
        };
    });
builder.Services.AddAuthorization();

builder.Services.AddCors(o => o.AddPolicy("AllowReact", p =>
    p.WithOrigins("http://localhost:5173").AllowAnyHeader().AllowAnyMethod()));

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

var app = builder.Build();

app.UseSwagger();
app.UseSwaggerUI();
app.UseCors("AllowReact");

app.UseAuthentication();   // MỚI: soát "con dấu" trên JWT của mỗi request
app.UseAuthorization();    // MỚI: đối chiếu yêu cầu [Authorize] của endpoint

app.MapControllers();

app.Run("http://localhost:5000");
```

Đọc hiểu: `AddJwtBearer` khai cách xác minh chữ ký (cùng Key/Issuer/Audience đã
dùng để phát) — từ giờ request nào kèm JWT hợp lệ thì danh tính trong token
(các claim) được gắn vào request; endpoint gắn nhãn `[Authorize]` sẽ từ chối
(mã 401) request không có token.

## 3. Backend — Controllers/AdminController.cs (file mới)

```csharp
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using KT2000.Api.Data;

namespace KT2000.Api.Controllers
{
    [Route("api/admin")]
    [ApiController]
    [Authorize]                    // phải có JWT hợp lệ mới vào được cửa này
    public class AdminController : ControllerBase
    {
        private readonly AppDbContext _db;
        public AdminController(AppDbContext db) => _db = db;

        // GET api/admin/tenants — danh sách đơn vị khách (chỉ phiên NỘI BỘ)
        [HttpGet("tenants")]
        public async Task<IActionResult> GetTenants()
        {
            // Hàng rào claim: đúng tinh thần SPEC-000 mục 2
            if (User.FindFirst("tenant_type")?.Value != "internal")
                return StatusCode(403,
                    new { message = "Chức năng này chỉ dành cho phiên đăng nhập nội bộ" });

            var list = await _db.Tenants
                .Where(t => t.TenantType != "internal" && t.IsActive)
                .OrderBy(t => t.SortName ?? t.Name)
                .Select(t => new
                {
                    id = t.Id, code = t.Code, name = t.Name, taxCode = t.TaxCode
                })
                .ToListAsync();
            return Ok(list);
        }
    }
}
```

Phân biệt 2 lớp khóa: thiếu JWT → 401 (chưa xưng danh); có JWT nhưng không phải
phiên nội bộ → 403 (xưng danh rồi nhưng không đủ quyền).

## 4. Frontend — bổ sung `src/api.ts`

Thêm vào CUỐI file api.ts:

```typescript
export interface AdminTenant {
  id: string;
  code: string;
  name: string;
  taxCode: string | null;
}

export const getAdminTenants = () => api.get<AdminTenant[]>("/admin/tenants");
```

(Interceptor gắn token đã viết sẵn từ đầu — request này tự kèm JWT, không phải
làm gì thêm. Giờ nó mới thật sự phát huy.)

## 5. Frontend — 3 file mới + 2 file sửa

### 5a. MỚI `src/AppShell.tsx` — cái vỏ chung

```tsx
import { Layout, Menu, Tag, Button, Space, Typography } from "antd";
import { Outlet, useNavigate, useLocation, Navigate } from "react-router-dom";
import { useAuth } from "./AuthContext";

const menuItems = [
  {
    type: "group" as const, label: "NHẬP DỮ LIỆU",
    children: [
      { key: "/app/hoa-don-vao", label: "Hóa đơn GTGT đầu vào" },
      { key: "/app/hoa-don-ra", label: "Hóa đơn GTGT đầu ra" },
      { key: "/app/phieu-thu", label: "Phiếu thu" },
      { key: "/app/phieu-chi", label: "Phiếu chi" },
    ],
  },
  {
    type: "group" as const, label: "BÁO CÁO",
    children: [
      { key: "/app/bao-cao-thue", label: "Báo cáo thuế" },
      { key: "/app/bao-cao-ton-kho", label: "Báo cáo tồn kho" },
      { key: "/app/bao-cao-cong-no", label: "Báo cáo công nợ" },
    ],
  },
];

export default function AppShell() {
  const { session, signOut } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();

  if (!session) return <Navigate to="/" replace />;

  const isInternal = session.tenant.tenantType === "internal";

  return (
    <Layout style={{ minHeight: "100vh" }}>
      <Layout.Header style={{ display: "flex", alignItems: "center",
                              justifyContent: "space-between", color: "#fff" }}>
        <Space size="large">
          <Typography.Text strong style={{ color: "#fff", fontSize: 16 }}>
            KT2000 Web
          </Typography.Text>
          <span>
            {session.tenant.name}{" "}
            {isInternal
              ? <Tag color="gold">NỘI BỘ</Tag>
              : <Tag color="blue">{session.tenant.code}</Tag>}
            <Tag>Năm {session.fiscalYear}</Tag>
          </span>
        </Space>
        <Space>
          <span>{session.user.realName}</span>
          <Button size="small" onClick={() => { signOut(); nav("/"); }}>
            Đăng xuất
          </Button>
        </Space>
      </Layout.Header>
      <Layout>
        <Layout.Sider width={260} theme="light">
          <Menu
            mode="inline"
            items={menuItems}
            selectedKeys={[loc.pathname]}
            onClick={(e) => nav(e.key)}
          />
        </Layout.Sider>
        <Layout.Content style={{ padding: 16, background: "#f5f5f5" }}>
          <Outlet />
        </Layout.Content>
      </Layout>
    </Layout>
  );
}
```

Điểm mới duy nhất về khái niệm: `<Outlet />` — "ổ cắm" nơi trang con hiện ra.
Vỏ đứng yên, ruột thay theo menu — một-vỏ-nhiều-ruột đúng nghĩa đen.

### 5b. MỚI `src/pages/HoaDonDauVao.tsx` — điểm phân nhánh 2-trong-1

Tạo thư mục `src/pages` rồi tạo file:

```tsx
import { useEffect, useState } from "react";
import { Card, Table, Button, message, Typography, Input } from "antd";
import { getAdminTenants } from "../api";
import type { AdminTenant } from "../api";
import { useAuth } from "../AuthContext";

// ============ RUỘT 1: console NỘI BỘ (MDN_NB) ============
function ConsoleLayHoaDon() {
  const [tenants, setTenants] = useState<AdminTenant[]>([]);
  const [selected, setSelected] = useState<React.Key[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getAdminTenants()
      .then((r) => setTenants(r.data))
      .catch(() => message.error("Không tải được danh sách đơn vị"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <Card title="Lấy hóa đơn điện tử — chọn đơn vị">
      <Table
        rowKey="id"
        size="small"
        loading={loading}
        dataSource={tenants}
        rowSelection={{ selectedRowKeys: selected, onChange: setSelected }}
        pagination={{ pageSize: 20 }}
        columns={[
          { title: "Mã", dataIndex: "code", width: 140 },
          { title: "Tên đơn vị", dataIndex: "name" },
          { title: "MST", dataIndex: "taxCode", width: 140 },
        ]}
      />
      <Button
        type="primary"
        disabled={selected.length === 0}
        onClick={() =>
          message.info(
            `Đã nhận lệnh cho ${selected.length} đơn vị — hàng đợi tải HĐĐT sẽ chạy ở gói WP-03`
          )
        }
      >
        Lấy HĐ điện tử ({selected.length} đơn vị)
      </Button>
    </Card>
  );
}

// ============ RUỘT 2: đơn vị thường (TUAN_NGA…) ============
function HoaDonCuaDonVi() {
  const { session } = useAuth();
  return (
    <Card title={`Hóa đơn GTGT đầu vào — ${session?.tenant.name}`}>
      <Input.Search placeholder="Tìm theo số HĐ, MST, tên người bán…" disabled />
      <Typography.Paragraph type="secondary" style={{ marginTop: 16 }}>
        Danh sách hóa đơn của đơn vị sẽ hiện ở đây sau khi có dữ liệu từ chức
        năng Lấy HĐ điện tử (WP-03) và màn hình làm kho (WP-04).
      </Typography.Paragraph>
    </Card>
  );
}

// ============ BỘ CHIA: nhìn claim tenant_type để chọn ruột ============
export default function HoaDonDauVao() {
  const { session } = useAuth();
  return session?.tenant.tenantType === "internal"
    ? <ConsoleLayHoaDon />
    : <HoaDonCuaDonVi />;
}
```

### 5c. MỚI `src/pages/ChoPhatTrien.tsx` — trang giữ chỗ dùng chung

```tsx
import { Card, Typography } from "antd";

export default function ChoPhatTrien({ title }: { title: string }) {
  return (
    <Card title={title}>
      <Typography.Text type="secondary">
        Chức năng thuộc gói công việc sau — xem docs/SPEC-000.
      </Typography.Text>
    </Card>
  );
}
```

### 5d. SỬA `src/App.tsx` — thay toàn bộ

```tsx
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./AuthContext";
import LoginPage from "./LoginPage";
import DashboardPage from "./DashboardPage";
import AppShell from "./AppShell";
import HoaDonDauVao from "./pages/HoaDonDauVao";
import ChoPhatTrien from "./pages/ChoPhatTrien";

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LoginPage />} />
          <Route path="/app" element={<AppShell />}>
            <Route index element={<DashboardPage />} />
            <Route path="hoa-don-vao" element={<HoaDonDauVao />} />
            <Route path="hoa-don-ra" element={<ChoPhatTrien title="Hóa đơn GTGT đầu ra" />} />
            <Route path="phieu-thu" element={<ChoPhatTrien title="Phiếu thu" />} />
            <Route path="phieu-chi" element={<ChoPhatTrien title="Phiếu chi" />} />
            <Route path="bao-cao-thue" element={<ChoPhatTrien title="Báo cáo thuế" />} />
            <Route path="bao-cao-ton-kho" element={<ChoPhatTrien title="Báo cáo tồn kho" />} />
            <Route path="bao-cao-cong-no" element={<ChoPhatTrien title="Báo cáo công nợ" />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
```

Route lồng nhau: `/app` mở vỏ AppShell, các dòng con là ruột cắm vào `<Outlet/>`.

### 5e. SỬA `src/LoginPage.tsx` — một dòng

Tìm `nav("/dashboard")` đổi thành `nav("/app")`.

## 6. Chạy + checklist nghiệm thu

Backend `dotnet run`, frontend `npm run dev`, rồi:

| # | Kịch bản | Phải đạt |
|---|---|---|
| 1 | Login `admin`, chọn **MDN Nội bộ**, năm 2026 | Vào AppShell, header có tag vàng **NỘI BỘ** |
| 2 | Menu → Hóa đơn GTGT đầu vào | Bảng danh sách đơn vị khách (KHÔNG có MDN_NB trong bảng) |
| 3 | Tick 2 đơn vị → nút Lấy HĐ điện tử | Nút hiện số lượng, bấm ra thông báo nhận lệnh |
| 4 | Đăng xuất → login lại chọn **HA_THAI** | Cùng menu; bấm Hóa đơn đầu vào ra khung tìm hóa đơn của HA_THAI |
| 5 | Login `ketoan01` (chỉ có quyền HA_THAI) → thử gọi trực tiếp API: mở tab mới `http://localhost:5000/api/admin/tenants` | Bị chặn (không có token → 401) |
| 6 | F5 giữa chừng ở console | Phiên + đúng ruột còn nguyên |

Xong checklist: commit theo nếp — `git add .` → soát `git status` → commit
"WP-01a phan 1: AppShell 2-trong-1 + hang rao claim internal" → push.
