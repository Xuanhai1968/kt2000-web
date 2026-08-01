# WP-01a (phần 3) — Cột "Các năm" + Sửa đơn vị có kỷ luật

Sản phẩm: bảng Đơn vị khách hàng hiện **các năm đã mở** + **trạng thái** của từng
đơn vị; nút **Sửa** (chỉ user is_admin thấy) với 5 khóa: mã không đổi, MST khóa
một chiều, tên/địa chỉ tự do, hai lớp claim, mọi thay đổi ghi vết TenantChangeLog.

---

## 1. Database — `database/003_tenant_changelog.sql`

```sql
USE KT2000_Master;
GO
CREATE TABLE TenantChangeLog (
    Id        INT IDENTITY(1,1) PRIMARY KEY,
    TenantId  UNIQUEIDENTIFIER NOT NULL REFERENCES Tenants(Id),
    ChangedBy NVARCHAR(50)  NOT NULL,   -- login_name người sửa
    ChangedAt DATETIME2     NOT NULL DEFAULT SYSDATETIME(),
    Changes   NVARCHAR(1000) NOT NULL   -- "Name: 'A' -> 'B'; Address: ..."
);
GO
```

Chạy trong SSMS, lưu file vào repo như lệ thường.

## 2. Backend — Models/Entities.cs (thêm class cuối file)

```csharp
    public class TenantChangeLog
    {
        public int Id { get; set; }
        public Guid TenantId { get; set; }
        public string ChangedBy { get; set; } = "";
        public DateTime ChangedAt { get; set; }
        public string Changes { get; set; } = "";
    }
```

## 3. Backend — Data/AppDbContext.cs (thêm 1 DbSet)

Thêm cạnh các DbSet khác:

```csharp
        public DbSet<TenantChangeLog> TenantChangeLog => Set<TenantChangeLog>();
```

## 4. Backend — Models/AuthDtos.cs (thêm DTO cuối file)

```csharp
    public class UpdateTenantRequest
    {
        public string Name { get; set; } = "";
        public string? TaxCode { get; set; }
        public string? Address { get; set; }
        public bool IsActive { get; set; }
    }
```

## 5. Backend — Services/AdminService.cs (thêm method vào class)

```csharp
        // ============ Sửa đơn vị (5 khóa kỷ luật) ============
        public async Task<object> UpdateTenant(Guid tenantId, UpdateTenantRequest req, string changedBy)
        {
            var t = await _db.Tenants.FindAsync(tenantId)
                ?? throw new ArgumentException("Không tìm thấy đơn vị");
            if (t.TenantType == "internal")
                throw new ArgumentException("Không sửa đơn vị nội bộ tại đây");

            // KHÓA MST một chiều: đã có thì không được đổi khác đi
            var newTax = string.IsNullOrWhiteSpace(req.TaxCode) ? null : req.TaxCode.Trim();
            if (!string.IsNullOrWhiteSpace(t.TaxCode) && newTax != t.TaxCode)
                throw new ArgumentException("MST đã có — không được phép thay đổi");
            if (string.IsNullOrWhiteSpace(req.Name))
                throw new ArgumentException("Tên đơn vị không được trống");

            // Ghi vết những gì đổi
            var changes = new List<string>();
            void Track(string field, string? oldV, string? newV)
            {
                if ((oldV ?? "") != (newV ?? ""))
                    changes.Add($"{field}: '{oldV}' -> '{newV}'");
            }
            Track("Name", t.Name, req.Name.Trim());
            Track("TaxCode", t.TaxCode, newTax);
            Track("Address", t.Address, req.Address?.Trim());
            Track("IsActive", t.IsActive.ToString(), req.IsActive.ToString());

            if (changes.Count == 0) return new { message = "Không có gì thay đổi" };

            t.Name = req.Name.Trim();
            t.TaxCode = newTax ?? t.TaxCode;
            t.Address = req.Address?.Trim();
            t.IsActive = req.IsActive;
            _db.TenantChangeLog.Add(new TenantChangeLog
            {
                TenantId = t.Id, ChangedBy = changedBy,
                Changes = string.Join("; ", changes)
            });
            await _db.SaveChangesAsync();
            return new { message = "Đã lưu", changes };
        }
```

## 6. Backend — Controllers/AdminController.cs

**6a.** Thêm helper cạnh IsInternal():

```csharp
        private bool IsAdminUser() =>
            string.Equals(User.FindFirst("is_admin")?.Value, "True",
                          StringComparison.OrdinalIgnoreCase);
        private string CurrentLoginName() =>
            User.FindFirst("login_name")?.Value ?? "?";
```

**6b.** SỬA endpoint GetTenants — trả thêm năm + trạng thái (thay body cũ):

```csharp
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
                    fiscalYears = t.FiscalYears
                        .OrderByDescending(f => f.Year).Select(f => f.Year).ToList()
                })
                .ToListAsync();
            return Ok(list);
        }
```

(Bỏ lọc IsActive ở đây — trang quản trị phải thấy cả đơn vị đã ngừng.)

**6c.** Thêm endpoint mới:

```csharp
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
```

`dotnet build` → 0 Error → Ctrl+C/`dotnet run` (nhớ bài 405!). Swagger phải hiện
thêm PUT `/api/admin/tenants/{id}`.

## 7. Frontend — src/api.ts (SỬA interface + thêm hàm)

Thay interface AdminTenant cũ bằng:

```typescript
export interface AdminTenant {
  id: string;
  code: string;
  name: string;
  taxCode: string | null;
  address: string | null;
  isActive: boolean;
  fiscalYears: number[];
}

export interface UpdateTenantPayload {
  name: string;
  taxCode?: string;
  address?: string;
  isActive: boolean;
}

export const updateTenant = (id: string, p: UpdateTenantPayload) =>
  api.put(`/admin/tenants/${id}`, p);
```

## 8. Frontend — src/pages/DonViKhachHang.tsx (thay TOÀN BỘ file)

```tsx
import { useEffect, useState } from "react";
import { Card, Table, Button, Modal, Form, Input, InputNumber, Switch, Tag, message } from "antd";
import { getAdminTenants, createTenant, updateTenant } from "../api";
import type { AdminTenant } from "../api";
import { useAuth } from "../AuthContext";

export default function DonViKhachHang() {
  const { session } = useAuth();
  const isAdmin = !!session?.user.isAdmin;

  const [tenants, setTenants] = useState<AdminTenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [openNew, setOpenNew] = useState(false);
  const [editing, setEditing] = useState<AdminTenant | null>(null);
  const [saving, setSaving] = useState(false);
  const [formNew] = Form.useForm();
  const [formEdit] = Form.useForm();

  const reload = () => {
    setLoading(true);
    getAdminTenants().then((r) => setTenants(r.data)).finally(() => setLoading(false));
  };
  useEffect(reload, []);

  const onCreate = async (v: any) => {
    setSaving(true);
    try {
      const r = await createTenant({ code: v.code, name: v.name, taxCode: v.taxCode,
                                     address: v.address, firstYear: v.firstYear });
      message.success(`Đã tạo đơn vị + database ${r.data.dbCreated}`);
      setOpenNew(false); formNew.resetFields(); reload();
    } catch (e: any) {
      message.error(e?.response?.data?.message ?? "Không tạo được đơn vị");
    } finally { setSaving(false); }
  };

  const startEdit = (t: AdminTenant) => {
    setEditing(t);
    formEdit.setFieldsValue({ name: t.name, taxCode: t.taxCode,
                              address: t.address, isActive: t.isActive });
  };

  const onEdit = async (v: any) => {
    if (!editing) return;
    setSaving(true);
    try {
      await updateTenant(editing.id, { name: v.name, taxCode: v.taxCode,
                                       address: v.address, isActive: v.isActive });
      message.success("Đã lưu thay đổi");
      setEditing(null); reload();
    } catch (e: any) {
      message.error(e?.response?.data?.message ?? "Không lưu được");
    } finally { setSaving(false); }
  };

  return (
    <Card
      title="Đơn vị khách hàng"
      extra={<Button type="primary" onClick={() => setOpenNew(true)}>Thêm đơn vị</Button>}
    >
      <Table
        rowKey="id" size="small" loading={loading} dataSource={tenants}
        pagination={{ pageSize: 20 }}
        columns={[
          { title: "Mã", dataIndex: "code", width: 130 },
          { title: "Tên đơn vị", dataIndex: "name",
            render: (v: string, r) => r.isActive ? v
              : <span style={{ color: "#999" }}>{v} <Tag color="red">Ngừng</Tag></span> },
          { title: "MST", dataIndex: "taxCode", width: 130 },
          { title: "Các năm", dataIndex: "fiscalYears", width: 220,
            render: (ys: number[]) => ys.map((y) => <Tag key={y}>{y}</Tag>) },
          ...(isAdmin ? [{
            title: "", width: 70,
            render: (_: unknown, r: AdminTenant) =>
              <Button size="small" onClick={() => startEdit(r)}>Sửa</Button>,
          }] : []),
        ]}
      />

      {/* ---------- Modal THÊM MỚI (như phần 2) ---------- */}
      <Modal title="Thêm đơn vị mới" open={openNew} onCancel={() => setOpenNew(false)}
             onOk={() => formNew.submit()} confirmLoading={saving} okText="Tạo" cancelText="Hủy">
        <Form form={formNew} layout="vertical" onFinish={onCreate}
              initialValues={{ firstYear: 2025 }}>
          <Form.Item name="code" label="Mã đơn vị (A-Z, 0-9, dấu _)"
            rules={[{ required: true },
                    { pattern: /^[A-Za-z][A-Za-z0-9_]{1,28}[A-Za-z0-9]$/,
                      message: "Chỉ chữ, số, dấu _ ; 3-30 ký tự" }]}>
            <Input placeholder="TUAN_NGA"
                   onChange={(e) => formNew.setFieldValue("code", e.target.value.toUpperCase())} />
          </Form.Item>
          <Form.Item name="name" label="Tên đơn vị" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="taxCode" label="Mã số thuế"><Input /></Form.Item>
          <Form.Item name="address" label="Địa chỉ"><Input /></Form.Item>
          <Form.Item name="firstYear" label="Năm làm việc đầu tiên" rules={[{ required: true }]}>
            <InputNumber min={2000} max={2100} style={{ width: 140 }} />
          </Form.Item>
        </Form>
      </Modal>

      {/* ---------- Modal SỬA (5 khóa kỷ luật) ---------- */}
      <Modal title={`Sửa đơn vị ${editing?.code ?? ""}`} open={!!editing}
             onCancel={() => setEditing(null)} onOk={() => formEdit.submit()}
             confirmLoading={saving} okText="Lưu" cancelText="Hủy">
        <Form form={formEdit} layout="vertical" onFinish={onEdit}>
          <Form.Item label="Mã đơn vị (không thể thay đổi)">
            <Input value={editing?.code} disabled />
          </Form.Item>
          <Form.Item name="name" label="Tên đơn vị" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="taxCode"
            label={editing?.taxCode ? "Mã số thuế (đã có — không thể thay đổi)" : "Mã số thuế (bổ sung)"}>
            <Input disabled={!!editing?.taxCode} />
          </Form.Item>
          <Form.Item name="address" label="Địa chỉ"><Input /></Form.Item>
          <Form.Item name="isActive" label="Trạng thái" valuePropName="checked">
            <Switch checkedChildren="Hoạt động" unCheckedChildren="Ngừng" />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}
```

## 9. Frontend — 2 chỉnh nhỏ ở chỗ khác

- `src/pages/HoaDonDauVao.tsx` (ConsoleLayHoaDon): đổi
  `dataSource={tenants}` thành `dataSource={tenants.filter((t) => t.isActive)}`
  — console lấy HĐ chỉ hiện đơn vị đang hoạt động.
- `src/pages/MoNamLamViec.tsx`: trong mảng columns thêm cột năm để nhìn trước
  khi mở:

```tsx
          { title: "Các năm", dataIndex: "fiscalYears", width: 220,
            render: (ys: number[]) => ys.map((y) => <Tag key={y}>{y}</Tag>) },
```

  và cũng lọc `dataSource={tenants.filter((t) => t.isActive)}`.

## 10. Checklist nghiệm thu

| # | Kịch bản | Phải đạt |
|---|---|---|
| 1 | Login MDN_NB (admin) → Đơn vị khách hàng | Cột "Các năm" hiện tag: TUAN_NGA có 2025, 2026 |
| 2 | Sửa TUAN_NGA: đổi địa chỉ, Lưu | Báo "Đã lưu"; SSMS: `SELECT * FROM TenantChangeLog` có dòng ghi Address cũ → mới, đúng ChangedBy=admin |
| 3 | Sửa lần nữa, thử đổi MST | Ô MST bị khóa xám (đã có MST); nếu gọi thẳng API bằng Swagger đổi MST → 400 "MST đã có — không được phép thay đổi" |
| 4 | Ô Mã đơn vị trong form Sửa | Luôn khóa xám |
| 5 | Gạt HA_THAI_CN1 (hoặc 1 đơn vị test) sang Ngừng | Bảng hiện tag đỏ Ngừng; console Lấy HĐ không còn đơn vị đó; đăng xuất → login: combobox cũng không còn (AuthService vốn lọc IsActive) |
| 6 | Gạt lại Hoạt động | Mọi thứ trở lại |
| 7 | Login ketoan01 vào HA_THAI | (User thường) — không có menu QUẢN TRỊ, không liên quan trang này |
| 8 | Nếu tạo thêm 1 user nội-bộ-không-admin sau này | Sẽ thấy danh sách nhưng KHÔNG có nút Sửa; gọi thẳng API → 403 |

Commit: "WP-01a phan 3: cot cac nam + sua don vi 5 khoa + TenantChangeLog".
Nhật ký: "28-07: Sửa đơn vị — Code bất biến (dính tên DB), MST khóa một chiều,
sửa cần internal+is_admin, mọi thay đổi ghi TenantChangeLog".
