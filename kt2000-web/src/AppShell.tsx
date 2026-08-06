import { Layout, Menu, Tag, Button, Space, Typography } from "antd";
import { Outlet, useNavigate, useLocation, Navigate } from "react-router-dom";
import { useAuth } from "./AuthContext";
import ErrorBoundary from "./ErrorBoundary";
import DoiMatKhauBatBuoc from "./DoiMatKhauBatBuoc";

// Bộ menu KẾ TOÁN THUẾ — dành cho tenant thường và tenant nội bộ quản trị (MDN_NB).
// Giữ tên menuThue (không phải menuItems) vì giờ có HAI bộ menu, tên chung dễ lẫn.
const menuThue = [
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

const menuNoiBo = [
  {
    type: "group" as const, label: "PHIẾU",
    children: [
      { key: "/app/phieu-xuat", label: "Phiếu xuất hàng" },
      { key: "/app/phieu-nhap", label: "Phiếu nhập hàng" },
    ],
  },
  {
    type: "group" as const, label: "KHO / GIAO HÀNG",
    children: [
      { key: "/app/danh-sach-phieu", label: "Danh sách phiếu" },
      { key: "/app/goi-hang", label: "Gói hàng" },
    ],
  },
];

export default function AppShell() {
  const { session, signOut } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();

  if (!session) return <Navigate to="/" replace />;

  const isInternal = session.tenant.tenantType === "internal";
  const isNoiBo = session.tenant.tenantType === "noibo";

  return (
    // height (KHÔNG phải minHeight) + overflow:hidden: màn hình cao đúng bằng cửa sổ,
    // KHÔNG cho cả trang trôi. Nhờ vậy lưới hàng hóa tự cuộn bên trong nó, còn thanh
    // tiêu đề / menu / thanh tổng cộng luôn đứng yên (BR-NB-05).
    <Layout style={{ height: "100vh", overflow: "hidden" }}>
      {/* QT-01: đặt ở khung ngoài nên phủ mọi trang con — vào thẳng URL nào cũng gặp */}
      <DoiMatKhauBatBuoc />
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
      <Layout style={{ minHeight: 0 }}>
        <Layout.Sider width={260} theme="light" style={{ overflow: "auto" }}>
          <Menu
            mode="inline"
            items={
              // Rẽ nhánh hai lớp (BR-NB-06): đây chỉ là lớp TIỆN DỤNG. Lớp an toàn
              // thật nằm ở backend — mọi endpoint gate bằng claim.
              // Tenant 'noibo' CHỈ thấy menu NB, không thấy sổ thuế lẫn quản trị.
              isNoiBo
                ? menuNoiBo
                : [
                    ...menuThue,
                    ...(isInternal
                      ? [{
                          type: "group" as const, label: "QUẢN TRỊ",
                          children: [
                            { key: "/app/don-vi", label: "Đơn vị khách hàng" },
                            { key: "/app/mo-nam", label: "Mở năm làm việc" },
                            { key: "/app/quan-ly-user", label: "Quản lý người dùng" },
                            { key: "/app/nhat-ky", label: "Nhật ký hệ thống" },
                          ],
                        }]
                      : []),
                  ]
            }
            selectedKeys={[loc.pathname]}
            onClick={(e) => nav(e.key)}
          />
        </Layout.Sider>
        <Layout.Content style={{ padding: 16, background: "#f5f5f5",
                                 minHeight: 0, overflow: "auto" }}>
          <ErrorBoundary><Outlet /></ErrorBoundary>
        </Layout.Content>
      </Layout>
    </Layout>
  );
}