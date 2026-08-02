import { Layout, Menu, Tag, Button, Space, Typography } from "antd";
import { Outlet, useNavigate, useLocation, Navigate } from "react-router-dom";
import { useAuth } from "./AuthContext";
import ErrorBoundary from "./ErrorBoundary";
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
            selectedKeys={[loc.pathname]}
            onClick={(e) => nav(e.key)}
          />
        </Layout.Sider>
        <Layout.Content style={{ padding: 16, background: "#f5f5f5" }}>
          <ErrorBoundary><Outlet /></ErrorBoundary>
        </Layout.Content>
      </Layout>
    </Layout>
  );
}