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