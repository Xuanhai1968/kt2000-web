import { useEffect, useState } from "react";
import {
  Card, Table, Button, Modal, Form, Input, InputNumber, Switch, Tag, Select, message,
} from "antd";
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
                                     address: v.address, firstYear: v.firstYear,
                                     tenantType: v.tenantType ?? "headquarter",
                                     linkedTenantCode: v.linkedTenantCode || null });
      message.success(`Đã tạo đơn vị + database ${r.data.dbCreated}`);
      setOpenNew(false); formNew.resetFields(); reload();
    } catch (e: any) {
      message.error(e?.response?.data?.message ?? "Không tạo được đơn vị");
    } finally { setSaving(false); }
  };

  const startEdit = (t: AdminTenant) => {
    setEditing(t);
    formEdit.setFieldsValue({ name: t.name, taxCode: t.taxCode,
                              address: t.address, isActive: t.isActive,
                              khaiQuy: t.khaiQuy,
                              linkedTenantCode: t.linkedTenantCode });
  };

  const onEdit = async (v: any) => {
    if (!editing) return;
    setSaving(true);
    try {
      await updateTenant(editing.id, { name: v.name, taxCode: v.taxCode,
                                       address: v.address, isActive: v.isActive,
                                       khaiQuy: !!v.khaiQuy,
                                       linkedTenantCode: v.linkedTenantCode || null });
      message.success("Đã lưu thay đổi");
      setEditing(null); reload();
    } catch (e: any) {
      message.error(e?.response?.data?.message ?? "Không lưu được");
    } finally { setSaving(false); }
  };

  return (
    <Card
      title="Đơn vị khách hàng"
      // Tạo đơn vị kéo theo CREATE DATABASE nên cùng mức quyền với Sửa và Mở năm
      extra={<Button type="primary" disabled={!isAdmin} onClick={() => setOpenNew(true)}
                     title={isAdmin ? undefined : "Chỉ quản trị viên được tạo đơn vị mới"}>
               Thêm đơn vị
             </Button>}
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
          {/* QT-03 + AD-NB-03: đơn vị nội bộ phải trỏ về một đơn vị thuế có thật */}
          <Form.Item name="tenantType" label="Loại đơn vị" initialValue="headquarter">
            <Select options={[
              { value: "headquarter", label: "Đơn vị thuế (trụ sở)" },
              { value: "branch", label: "Chi nhánh" },
              { value: "noibo", label: "Nội bộ (kt2000_nb)" },
            ]} />
          </Form.Item>
          <Form.Item noStyle shouldUpdate={(a, b) => a.tenantType !== b.tenantType}>
            {({ getFieldValue }) => getFieldValue("tenantType") === "noibo" && (
              <Form.Item name="linkedTenantCode" label="Đơn vị thuế liên kết"
                         extra="Mã đơn vị thuế tương ứng, ví dụ TUAN_NGA_NB liên kết với TUAN_NGA"
                         rules={[{ required: true, message: "Đơn vị nội bộ phải khai đơn vị liên kết" }]}>
                <Select showSearch optionFilterProp="label" placeholder="Chọn đơn vị thuế"
                        options={tenants.filter((t) => t.tenantType !== "noibo")
                          .map((t) => ({ value: t.code, label: `${t.code} — ${t.name}` }))} />
              </Form.Item>
            )}
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
          {/* FRM_LAY_HDDT tô đỏ đơn vị khai THÁNG và lọc chọn theo cờ này */}
          <Form.Item name="khaiQuy" label="Kỳ kê khai thuế" valuePropName="checked">
            <Switch checkedChildren="Quý" unCheckedChildren="Tháng" />
          </Form.Item>
          {editing?.tenantType === "noibo" && (
            <Form.Item name="linkedTenantCode" label="Đơn vị thuế liên kết"
                       rules={[{ required: true, message: "Đơn vị nội bộ phải khai đơn vị liên kết" }]}>
              <Select showSearch optionFilterProp="label"
                      options={tenants.filter((t) => t.tenantType !== "noibo" && t.id !== editing?.id)
                        .map((t) => ({ value: t.code, label: `${t.code} — ${t.name}` }))} />
            </Form.Item>
          )}
          <Form.Item name="isActive" label="Trạng thái" valuePropName="checked">
            <Switch checkedChildren="Hoạt động" unCheckedChildren="Ngừng" />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}