import { useEffect, useState } from "react";
import { Card, Form, Input, Select, Checkbox, Button, message, Typography } from "antd";
import { useNavigate } from "react-router-dom";
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

  // Bị đá về đây do token hết hạn (api.ts) — nói rõ lý do, đừng để user tưởng app hỏng
  useEffect(() => {
    if (sessionStorage.getItem("kt2000_het_phien")) {
      sessionStorage.removeItem("kt2000_het_phien");
      message.warning("Phiên làm việc đã hết hạn — mời đăng nhập lại");
    }
  }, []);

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
    } catch {
      // Username sai → backend vẫn trả 200 rỗng (không rơi vào đây).
      // Rơi vào đây = KHÔNG GỌI ĐƯỢC server → phải nói cho người dùng biết.
      message.warning("Chưa kết nối được máy chủ — chờ giây lát rồi thử lại");
    }
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
      nav("/app");
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