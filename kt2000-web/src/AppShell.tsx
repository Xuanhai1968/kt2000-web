import { useState } from "react";
import { Layout, Menu, Tag, Button, Space, Typography, Drawer, Grid } from "antd";
import { MenuOutlined } from "@ant-design/icons";
import { Outlet, useNavigate, useLocation, Navigate } from "react-router-dom";
import { useAuth } from "./AuthContext";
import ErrorBoundary from "./ErrorBoundary";
import DoiMatKhauBatBuoc from "./DoiMatKhauBatBuoc";
import "./app-shell.css";

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

// Đơn vị NB KHÔNG dùng gói hàng. Gói (BR-NB-08) là chứng từ gom nhiều đơn lên một
// chuyến xe — đơn vị nào giao lẻ từng đơn thì màn đó chỉ tổ rối.
// Khai theo MÃ ĐƠN VỊ chứ không xóa hẳn khỏi menu: TUAN_NGA_NB vẫn dùng gói.
// Thêm đơn vị mới không cần gói thì thêm mã vào đây.
const KHONG_DUNG_GOI = ["USA_MEVA_NB"];

const menuNoiBo = (maDonVi: string) => {
  const khoGiaoHang = [
    { key: "/app/danh-sach-phieu", label: "Danh sách phiếu" },
  ];
  if (!KHONG_DUNG_GOI.includes(maDonVi)) {
    khoGiaoHang.push({ key: "/app/goi-hang", label: "Gói hàng" });
  }
  return [
    {
      type: "group" as const, label: "PHIẾU",
      children: [
        { key: "/app/phieu-xuat", label: "Phiếu xuất hàng" },
        { key: "/app/phieu-nhap", label: "Phiếu nhập hàng" },
      ],
    },
    {
      type: "group" as const, label: "KHO / GIAO HÀNG",
      children: khoGiaoHang,
    },
    {
      type: "group" as const, label: "DANH MỤC",
      children: [
        { key: "/app/khuyen-mai", label: "Khuyến mãi" },
      ],
    },
  ];
};

export default function AppShell() {
  const { session, signOut } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  // Ngưỡng md của antd = 768px. Dưới ngưỡng: menu rút vào Drawer trượt ngang.
  // Trước đây Sider rộng cứng 260px — trên điện thoại 390px nó nuốt 2/3 màn,
  // lưới đánh đơn chỉ còn hơn trăm pixel, không dùng được.
  const manRong = Grid.useBreakpoint().md ?? true;
  const [menuMo, setMenuMo] = useState(false);

  if (!session) return <Navigate to="/" replace />;

  const isInternal = session.tenant.tenantType === "internal";
  const isNoiBo = session.tenant.tenantType === "noibo";

  // Rẽ nhánh hai lớp (BR-NB-06): đây chỉ là lớp TIỆN DỤNG. Lớp an toàn thật nằm ở
  // backend — mọi endpoint gate bằng claim. Tenant 'noibo' CHỈ thấy menu NB,
  // không thấy sổ thuế lẫn quản trị.
  const cacMuc = isNoiBo
    ? menuNoiBo(session.tenant.code)
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
      ];

  const menu = (
    <Menu
      mode="inline"
      items={cacMuc}
      selectedKeys={[loc.pathname]}
      onClick={(e) => { nav(e.key); setMenuMo(false); }}
    />
  );

  return (
    // height (KHÔNG phải minHeight) + overflow:hidden: màn hình cao đúng bằng cửa sổ,
    // KHÔNG cho cả trang trôi. Nhờ vậy lưới hàng hóa tự cuộn bên trong nó, còn thanh
    // tiêu đề / menu / thanh tổng cộng luôn đứng yên (BR-NB-05).
    <Layout style={{ height: "100vh", overflow: "hidden" }}>
      {/* QT-01: đặt ở khung ngoài nên phủ mọi trang con — vào thẳng URL nào cũng gặp */}
      <DoiMatKhauBatBuoc />
      <Layout.Header
        className="vo__dau"
        style={manRong
          ? undefined
          : { height: 48, lineHeight: "48px", paddingInline: 10 }}
      >
        <Space size={manRong ? "large" : 8}>
          {/* Nút ☰ chỉ có trên màn hẹp — màn rộng menu vẫn nằm cố định bên trái */}
          {!manRong && (
            <Button type="text" className="vo__nut-menu" icon={<MenuOutlined />}
                    onClick={() => setMenuMo(true)} aria-label="Mở menu" />
          )}
          <Typography.Text strong className="vo__ten-app">KT2000 Web</Typography.Text>
          {/* Tên đơn vị dài, trên điện thoại cắt bớt bằng "…" thay vì đẩy nút Đăng xuất
              ra khỏi màn. Thẻ Năm cũng ẩn ở màn hẹp — đã có trong Drawer. */}
          <span className="vo__don-vi">
            <span className="vo__ten-don-vi">{session.tenant.name}</span>{" "}
            {isInternal
              ? <Tag color="gold">NỘI BỘ</Tag>
              : <Tag color="blue">{session.tenant.code}</Tag>}
            <Tag className="vo__the-nam">Năm {session.fiscalYear}</Tag>
          </span>
        </Space>
        <Space>
          <span className="vo__ten-nguoi">{session.user.realName}</span>
          <Button size="small" onClick={() => { signOut(); nav("/"); }}>
            Đăng xuất
          </Button>
        </Space>
      </Layout.Header>
      <Layout style={{ minHeight: 0 }}>
        {manRong ? (
          <Layout.Sider width={260} theme="light" style={{ overflow: "auto" }}>
            {menu}
          </Layout.Sider>
        ) : (
          <Drawer
            placement="left"
            open={menuMo}
            onClose={() => setMenuMo(false)}
            width={260}
            styles={{ body: { padding: 0 } }}
            title={
              <div className="vo__dau-drawer">
                <div className="vo__dau-drawer-ten">{session.tenant.name}</div>
                <div className="vo__dau-drawer-phu">
                  {session.tenant.code} · Năm {session.fiscalYear}
                </div>
              </div>
            }
          >
            {menu}
          </Drawer>
        )}
        <Layout.Content className="vo__than">
          <ErrorBoundary><Outlet /></ErrorBoundary>
        </Layout.Content>
      </Layout>
    </Layout>
  );
}