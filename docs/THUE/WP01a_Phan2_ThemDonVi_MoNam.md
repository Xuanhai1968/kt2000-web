# WP-01a (phần 2) — Console quản trị: Thêm đơn vị + Mở năm (app tự tạo database)

Sản phẩm sau bước này: menu **QUẢN TRỊ** (chỉ phiên NỘI BỘ thấy) với 2 màn hình:
**Đơn vị khách hàng** (danh sách + thêm mới) và **Mở năm làm việc** (tick đơn vị
→ tạo năm hàng loạt). Mỗi lần thêm đơn vị / mở năm, app **tự CREATE DATABASE**
`<MA>_<NĂM>` trên SQL Server — TenantDbResolver chính thức ra mắt.

---

## 1. Backend — Services/TenantDbResolver.cs (file mới)

```csharp
using Microsoft.Data.SqlClient;
using System.Text.RegularExpressions;

namespace KT2000.Api.Services
{
    // CỬA DUY NHẤT ghép tên database đơn vị-năm (quyết định 24-07 trong Nhật ký).
    // CẤM mọi nơi khác tự ghép chuỗi tên DB — review PR thấy là trả về sửa.
    public class TenantDbResolver
    {
        private readonly IConfiguration _config;
        public TenantDbResolver(IConfiguration config) => _config = config;

        // BR-DB-01: A-Z đầu, chỉ A-Z 0-9 _, dài 3-30, không kết thúc bằng _
        public static bool IsValidCode(string? code) =>
            code != null && Regex.IsMatch(code, "^[A-Z][A-Z0-9_]{1,28}[A-Z0-9]$");

        public string BuildDbName(string code, int year)
        {
            if (!IsValidCode(code))
                throw new ArgumentException("MA_DONVI không hợp lệ (chỉ A-Z, 0-9, dấu _)");
            if (year < 2000 || year > 2100)
                throw new ArgumentException("Năm không hợp lệ");
            return $"{code}_{year}";
        }

        public string GetMasterConnection() =>
            _config.GetConnectionString("DefaultConnection")!;

        // Connection đến database của (đơn vị, năm) — dựng từ connection Master,
        // chỉ thay tên database
        public string GetTenantConnection(string code, int year)
        {
            var b = new SqlConnectionStringBuilder(GetMasterConnection())
            { InitialCatalog = BuildDbName(code, year) };
            return b.ConnectionString;
        }
    }
}
```

Vì sao BR-DB-01 kiểm tra gắt: tên này sẽ được ghép vào câu lệnh
`CREATE DATABASE [...]` — chỉ cho phép A-Z/0-9/_ là hàng rào chống mọi trò tiêm
lệnh (SQL injection) qua ô nhập mã đơn vị.

## 2. Backend — Services/AdminService.cs (file mới)

```csharp
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using KT2000.Api.Data;
using KT2000.Api.Models;

namespace KT2000.Api.Services
{
    public class AdminService
    {
        private readonly AppDbContext _db;
        private readonly TenantDbResolver _resolver;
        public AdminService(AppDbContext db, TenantDbResolver resolver)
        { _db = db; _resolver = resolver; }

        // ============ Thêm đơn vị mới ============
        public async Task<object> CreateTenant(CreateTenantRequest req, Guid currentUserId)
        {
            var code = (req.Code ?? "").Trim().ToUpperInvariant();
            if (!TenantDbResolver.IsValidCode(code))
                throw new ArgumentException("MA_DONVI không hợp lệ: chỉ chữ A-Z, số, dấu _ (3-30 ký tự)");
            if (await _db.Tenants.AnyAsync(t => t.Code == code))
                throw new ArgumentException($"Mã đơn vị {code} đã tồn tại");

            var tenant = new Tenant
            {
                Id = Guid.NewGuid(), Code = code,
                Name = req.Name.Trim(), DbName = code,
                TenantType = "headquarter",
                TaxCode = req.TaxCode?.Trim(), Address = req.Address?.Trim(),
                IsActive = true
            };
            _db.Tenants.Add(tenant);
            _db.FiscalYears.Add(new FiscalYear { TenantId = tenant.Id, Year = req.FirstYear });
            // Người tạo (kế toán trưởng) được quyền vào đơn vị mới luôn
            _db.UserTenantAccess.Add(new UserTenantAccess
            { UserId = currentUserId, TenantId = tenant.Id, Role = "admin" });
            await _db.SaveChangesAsync();

            CreateTenantDatabase(code, req.FirstYear);
            return new { tenant.Id, tenant.Code, dbCreated = _resolver.BuildDbName(code, req.FirstYear) };
        }

        // ============ Mở năm hàng loạt ============
        public async Task<List<object>> OpenYears(OpenYearsRequest req)
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
                    if (existed)
                    {
                        results.Add(new { code = tenant.Code, status = "skip",
                                          message = $"Năm {req.Year} đã mở từ trước" });
                        continue;
                    }
                    _db.FiscalYears.Add(new FiscalYear { TenantId = tenant.Id, Year = req.Year });
                    await _db.SaveChangesAsync();
                    CreateTenantDatabase(tenant.Code, req.Year);
                    results.Add(new { code = tenant.Code, status = "ok",
                                      message = $"Đã tạo {tenant.Code}_{req.Year}" });
                }
                catch (Exception ex)
                {
                    results.Add(new { code = tenant.Code, status = "error", message = ex.Message });
                }
            }
            return results;
        }

        // ============ Tạo database vật lý ============
        private void CreateTenantDatabase(string code, int year)
        {
            var dbName = _resolver.BuildDbName(code, year); // đã qua BR-DB-01
            using var conn = new SqlConnection(_resolver.GetMasterConnection());
            conn.Open();

            using (var check = new SqlCommand("SELECT DB_ID(@n)", conn))
            {
                check.Parameters.AddWithValue("@n", dbName);
                if (check.ExecuteScalar() != DBNull.Value) return; // đã có → thôi
            }
            using (var create = new SqlCommand($"CREATE DATABASE [{dbName}]", conn))
                create.ExecuteNonQuery();

            // Khuôn schema tối thiểu: bảng đánh dấu phiên bản.
            // WP-02 sẽ nâng template này lên đủ 6 bảng nghiệp vụ.
            using var init = new SqlCommand($@"
                USE [{dbName}];
                CREATE TABLE SCHEMA_VERSION (
                    Ver INT NOT NULL, AppliedAt DATETIME2 NOT NULL DEFAULT SYSDATETIME());
                INSERT INTO SCHEMA_VERSION (Ver) VALUES (1);", conn);
            init.ExecuteNonQuery();
        }
    }
}
```

## 3. Backend — thêm DTO vào Models/AuthDtos.cs (cuối file)

```csharp
    public class CreateTenantRequest
    {
        public string Code { get; set; } = "";
        public string Name { get; set; } = "";
        public string? TaxCode { get; set; }
        public string? Address { get; set; }
        public int FirstYear { get; set; }
    }

    public class OpenYearsRequest
    {
        public int Year { get; set; }
        public List<string> TenantIds { get; set; } = new();
    }
```

## 4. Backend — nâng cấp Controllers/AdminController.cs

Thay TOÀN BỘ file bằng bản dưới (bản cũ + 2 endpoint mới + helper):

```csharp
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
        public AdminController(AppDbContext db, AdminService admin)
        { _db = db; _admin = admin; }

        private bool IsInternal() =>
            User.FindFirst("tenant_type")?.Value == "internal";
        private Guid CurrentUserId() =>
            Guid.Parse(User.FindFirst(JwtRegisteredClaimNames.Sub)?.Value
                       ?? User.FindFirst("sub")!.Value);

        [HttpGet("tenants")]
        public async Task<IActionResult> GetTenants()
        {
            if (!IsInternal())
                return StatusCode(403, new { message = "Chức năng này chỉ dành cho phiên đăng nhập nội bộ" });
            var list = await _db.Tenants
                .Where(t => t.TenantType != "internal" && t.IsActive)
                .OrderBy(t => t.SortName ?? t.Name)
                .Select(t => new { id = t.Id, code = t.Code, name = t.Name, taxCode = t.TaxCode })
                .ToListAsync();
            return Ok(list);
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
    }
}
```

## 5. Backend — đăng ký 2 linh kiện mới (Program.cs)

Tìm dòng `builder.Services.AddScoped<AuthService>();` và thêm ngay dưới:

```csharp
builder.Services.AddSingleton<TenantDbResolver>();
builder.Services.AddScoped<AdminService>();
```

(`Singleton` = cả app dùng chung một resolver — nó không giữ trạng thái gì nên
một bản là đủ; `Scoped` = mỗi request một AdminService, như AuthService.)

Chạy `dotnet build` — phải 0 Error trước khi sang frontend.

## 6. Frontend — bổ sung src/api.ts (cuối file)

```typescript
export interface CreateTenantPayload {
  code: string;
  name: string;
  taxCode?: string;
  address?: string;
  firstYear: number;
}

export interface OpenYearResult {
  code: string;
  status: "ok" | "skip" | "error";
  message: string;
}

export const createTenant = (p: CreateTenantPayload) =>
  api.post("/admin/tenants", p);

export const openFiscalYears = (year: number, tenantIds: string[]) =>
  api.post<OpenYearResult[]>("/admin/fiscal-years", { year, tenantIds });
```

## 7. Frontend — MỚI src/pages/DonViKhachHang.tsx

```tsx
import { useEffect, useState } from "react";
import { Card, Table, Button, Modal, Form, Input, InputNumber, message } from "antd";
import { getAdminTenants, createTenant } from "../api";
import type { AdminTenant } from "../api";

export default function DonViKhachHang() {
  const [tenants, setTenants] = useState<AdminTenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  const reload = () => {
    setLoading(true);
    getAdminTenants()
      .then((r) => setTenants(r.data))
      .finally(() => setLoading(false));
  };
  useEffect(reload, []);

  const onCreate = async (v: any) => {
    setSaving(true);
    try {
      const r = await createTenant({
        code: v.code, name: v.name, taxCode: v.taxCode,
        address: v.address, firstYear: v.firstYear,
      });
      message.success(`Đã tạo đơn vị + database ${r.data.dbCreated}`);
      setOpen(false);
      form.resetFields();
      reload();
    } catch (e: any) {
      message.error(e?.response?.data?.message ?? "Không tạo được đơn vị");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card
      title="Đơn vị khách hàng"
      extra={<Button type="primary" onClick={() => setOpen(true)}>Thêm đơn vị</Button>}
    >
      <Table
        rowKey="id" size="small" loading={loading} dataSource={tenants}
        pagination={{ pageSize: 20 }}
        columns={[
          { title: "Mã", dataIndex: "code", width: 150 },
          { title: "Tên đơn vị", dataIndex: "name" },
          { title: "MST", dataIndex: "taxCode", width: 150 },
        ]}
      />
      <Modal
        title="Thêm đơn vị mới" open={open} onCancel={() => setOpen(false)}
        onOk={() => form.submit()} confirmLoading={saving} okText="Tạo" cancelText="Hủy"
      >
        <Form form={form} layout="vertical" onFinish={onCreate}
              initialValues={{ firstYear: 2025 }}>
          <Form.Item name="code" label="Mã đơn vị (A-Z, 0-9, dấu _)"
            rules={[{ required: true },
                    { pattern: /^[A-Za-z][A-Za-z0-9_]{1,28}[A-Za-z0-9]$/,
                      message: "Chỉ chữ, số, dấu _ ; 3-30 ký tự" }]}>
            <Input placeholder="TUAN_NGA"
                   onChange={(e) => form.setFieldValue("code", e.target.value.toUpperCase())} />
          </Form.Item>
          <Form.Item name="name" label="Tên đơn vị" rules={[{ required: true }]}>
            <Input placeholder="Công ty CP TM và Dịch vụ Tuấn Nga" />
          </Form.Item>
          <Form.Item name="taxCode" label="Mã số thuế">
            <Input />
          </Form.Item>
          <Form.Item name="address" label="Địa chỉ">
            <Input />
          </Form.Item>
          <Form.Item name="firstYear" label="Năm làm việc đầu tiên"
                     rules={[{ required: true }]}>
            <InputNumber min={2000} max={2100} style={{ width: 140 }} />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}
```

## 8. Frontend — MỚI src/pages/MoNamLamViec.tsx

```tsx
import { useEffect, useState } from "react";
import { Card, Table, Button, InputNumber, Space, Tag, message } from "antd";
import { getAdminTenants, openFiscalYears } from "../api";
import type { AdminTenant, OpenYearResult } from "../api";

export default function MoNamLamViec() {
  const [tenants, setTenants] = useState<AdminTenant[]>([]);
  const [selected, setSelected] = useState<React.Key[]>([]);
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<OpenYearResult[]>([]);

  useEffect(() => { getAdminTenants().then((r) => setTenants(r.data)); }, []);

  const run = async () => {
    setRunning(true);
    try {
      const r = await openFiscalYears(year, selected as string[]);
      setResults(r.data);
      message.success("Chạy xong — xem kết quả từng đơn vị bên dưới");
    } catch (e: any) {
      message.error(e?.response?.data?.message ?? "Lỗi khi mở năm");
    } finally {
      setRunning(false);
    }
  };

  const colorOf = (s: string) => (s === "ok" ? "green" : s === "skip" ? "orange" : "red");

  return (
    <Card title="Mở năm làm việc mới (hàng loạt)">
      <Space style={{ marginBottom: 12 }}>
        Năm cần mở:
        <InputNumber min={2000} max={2100} value={year}
                     onChange={(v) => setYear(v ?? year)} />
        <Button type="primary" loading={running}
                disabled={selected.length === 0} onClick={run}>
          Mở năm {year} cho {selected.length} đơn vị
        </Button>
      </Space>
      <Table
        rowKey="id" size="small" dataSource={tenants}
        rowSelection={{ selectedRowKeys: selected, onChange: setSelected }}
        pagination={{ pageSize: 20 }}
        columns={[
          { title: "Mã", dataIndex: "code", width: 150 },
          { title: "Tên đơn vị", dataIndex: "name" },
        ]}
      />
      {results.length > 0 && (
        <Table
          rowKey="code" size="small" dataSource={results}
          pagination={false} style={{ marginTop: 16 }}
          columns={[
            { title: "Đơn vị", dataIndex: "code", width: 150 },
            { title: "Kết quả", dataIndex: "status", width: 100,
              render: (s: string) => <Tag color={colorOf(s)}>{s}</Tag> },
            { title: "Chi tiết", dataIndex: "message" },
          ]}
        />
      )}
    </Card>
  );
}
```

## 9. Frontend — menu QUẢN TRỊ chỉ hiện với phiên nội bộ (AppShell.tsx)

Trong `AppShell.tsx`, thay dòng `items={menuItems}` của `<Menu>` bằng:

```tsx
items={[
  ...menuItems,
  ...(isInternal
    ? [{
        type: "group" as const, label: "QUẢN TRỊ",
        children: [
          { key: "/app/don-vi", label: "Đơn vị khách hàng" },
          { key: "/app/mo-nam", label: "Mở năm làm việc" },
        ],
      }]
    : []),
]}
```

## 10. Frontend — 2 route mới (App.tsx)

Thêm 2 import:

```tsx
import DonViKhachHang from "./pages/DonViKhachHang";
import MoNamLamViec from "./pages/MoNamLamViec";
```

và 2 dòng Route trong nhóm `/app`:

```tsx
<Route path="don-vi" element={<DonViKhachHang />} />
<Route path="mo-nam" element={<MoNamLamViec />} />
```

## 11. Checklist nghiệm thu

| # | Kịch bản | Phải đạt |
|---|---|---|
| 1 | Login MDN_NB | Menu có thêm nhóm QUẢN TRỊ |
| 2 | Login HA_THAI | KHÔNG thấy nhóm QUẢN TRỊ |
| 3 | Đơn vị khách hàng → Thêm: mã `TUAN_NGA`, tên thật, MST, năm đầu **2025** | Báo "Đã tạo … database TUAN_NGA_2025"; đơn vị hiện trong bảng |
| 4 | Mở SSMS refresh Databases | Thấy **TUAN_NGA_2025**, trong có bảng SCHEMA_VERSION (Ver=1) |
| 5 | Thêm đơn vị mã `tuấn nga 2` | Bị chặn ngay tại form (viền đỏ) — thử sửa hợp lệ nhưng trùng `TUAN_NGA` → báo "đã tồn tại" |
| 6 | Mở năm: tick TUAN_NGA + HA_THAI, năm 2026 | TUAN_NGA: ok (tạo TUAN_NGA_2026); HA_THAI: ok; chạy lại lần 2 → cả hai "skip" màu cam |
| 7 | Đăng xuất, login lại `admin` | Combobox đơn vị giờ có TUAN_NGA; chọn TUAN_NGA + năm 2025 → vào được AppShell |
| 8 | SSMS: `SELECT * FROM KT2000_Master.dbo.FiscalYears` join Tenants | Các dòng năm khớp đúng những gì vừa mở |

Xong checklist: commit "WP-01a phan 2: Them don vi + Mo nam, TenantDbResolver,
app tu tao database" + push. Ghi 1 dòng Nhật ký: "28-07: SCHEMA_VERSION trong
mỗi DB tenant — đánh dấu phiên bản khuôn, WP-02 nâng cấp qua script đánh số".
