import { useState } from "react";
import { Layout, Menu, Tag, Button, Space, Typography, Drawer, Grid } from "antd";
import { MenuOutlined } from "@ant-design/icons";
import { Outlet, useNavigate, useLocation, Navigate } from "react-router-dom";
import { useAuth } from "./AuthContext";
import ErrorBoundary from "./ErrorBoundary";
import DoiMatKhauBatBuoc from "./DoiMatKhauBatBuoc";
import "./app-shell.css";

export const MAU_HD_RA = "#0958d9";    // đầu RA  = XANH
export const MAU_HD_VAO = "#cf1322";   // đầu VÀO = ĐỎ

// Chấm tròn đứng trước nhãn menu
function ChamMau({ mau }: { mau: string }) {
  return (
    <span style={{
      display: "inline-block", width: 8, height: 8, borderRadius: "50%",
      background: mau, marginRight: 8, verticalAlign: "middle",
    }} />
  );
}

// Nhãn menu kèm chấm màu — dùng cho cả hai bộ menu thuế và MDN_NB
const nhanHd = (chu: string, mau: string) => (
  <span><ChamMau mau={mau} />{chu}</span>
);

// Bộ menu KẾ TOÁN THUẾ — dành cho tenant thường và tenant nội bộ quản trị (MDN_NB).
// Giữ tên menuThue (không phải menuItems) vì giờ có HAI bộ menu, tên chung dễ lẫn.
const menuThue = [
  {
    type: "group" as const, label: "NHẬP DỮ LIỆU",
    children: [
      { key: "/app/hoa-don-vao",
        label: nhanHd("Hóa đơn GTGT đầu vào", MAU_HD_VAO) },
      { key: "/app/hoa-don-ra",
        label: nhanHd("Hóa đơn GTGT đầu ra", MAU_HD_RA) },
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
  {
    type: "group" as const, label: "NHÂN SỰ",
    children: [
      { key: "/app/hop-dong", label: "Hợp đồng" },
    ],
  },
];

// Bộ menu MDN_NB (tenant_type = 'internal') — bàn làm việc của kế toán DỊCH VỤ.
// Đây KHÔNG phải sổ của một đơn vị, nên không có Phiếu thu/chi, Tồn kho, Công nợ:
// những sổ đó thuộc về từng khách hàng, bày ở đây thì bấm vào cũng chẳng biết đang
// xem kho của ai. Sau này màn theo dõi phí dịch vụ sẽ thay chỗ.
//
// Nhãn "Lấy HĐ…" thay vì "Hóa đơn…" vì việc ở màn này là ĐI LẤY về cho khách,
// không phải xem hóa đơn của chính mình. Đơn vị khách hàng vẫn giữ nhãn cũ.
const menuMdnNb = [
  {
    type: "group" as const, label: "LẤY DỮ LIỆU",
    children: [
      { key: "/app/hoa-don-vao",
        label: nhanHd("HĐ GTGT đầu Vào", MAU_HD_VAO) },
      { key: "/app/hoa-don-ra",
        label: nhanHd("HĐ GTGT đầu Ra", MAU_HD_RA) },
    ],
  },
  {
    type: "group" as const, label: "BÁO CÁO",
    children: [
      { key: "/app/bao-cao-thue", label: "Báo cáo thuế" },
    ],
  },
  {
    type: "group" as const, label: "CÔNG VIỆC",
    children: [
      { key: "/app/hop-dong", label: "Lương đơn vị" },
    ],
  },
];

const NHOM_QUAN_TRI = [
  { key: "/app/don-vi", label: "Đơn vị khách hàng" },
  { key: "/app/mo-nam", label: "Mở năm làm việc" },
  { key: "/app/nhat-ky", label: "Nhật ký hệ thống" },
  { key: "/app/quan-ly-user", label: "Quản lý người dùng" },
].sort((a, b) => a.label.localeCompare(b.label, "vi"));

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
  const laManHdRa = loc.pathname === "/app/hoa-don-ra";
  const laManHdVao = loc.pathname === "/app/hoa-don-vao";
  const nhanChieu = laManHdRa ? "HĐ GTGT ĐẦU RA"
                  : laManHdVao ? "HĐ GTGT ĐẦU VÀO" : null;
  const mauChieu = laManHdRa ? MAU_HD_RA : MAU_HD_VAO;

  // Rẽ nhánh hai lớp (BR-NB-06): đây chỉ là lớp TIỆN DỤNG. Lớp an toàn thật nằm ở
  // backend — mọi endpoint gate bằng claim. Tenant 'noibo' CHỈ thấy menu NB,
  // không thấy sổ thuế lẫn quản trị.
  const cacMuc = isNoiBo
    ? menuNoiBo(session.tenant.code)
    : isInternal
      // MDN_NB dùng menu RIÊNG (nhãn "Lấy HĐ…", không Phiếu thu/chi) chứ không
      // phải menuThue — xem chú thích ở menuMdnNb.
      ? [
          ...menuMdnNb,
          {
            type: "group" as const, label: "QUẢN TRỊ",
            children: NHOM_QUAN_TRI,
          },
        ]
      : menuThue;

  const menu = (
    <Menu
      className="vo__menu"
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

          {nhanChieu && (
            <span style={{
              border: `2px solid ${mauChieu}`,
              borderRadius: 14,
              color: mauChieu,
              background: "#fff",
              fontWeight: 700,
              fontSize: 13,
              padding: "1px 14px",
              letterSpacing: 0.3,
              whiteSpace: "nowrap",
            }}>
              {nhanChieu}
            </span>
          )}
        </Space>
        {!manRong && (
          <Space>
            <span className="vo__ten-nguoi">{session.user.realName}</span>
            <Button size="small" onClick={() => { signOut(); nav("/"); }}>
              Đăng xuất
            </Button>
          </Space>
        )}
      </Layout.Header>
      <Layout style={{ minHeight: 0 }}>
        {manRong ? (
          // Cột dọc: MENU cuộn ở trên, khối tài khoản GHIM ở đáy. Bỏ overflow:auto của
          // Sider và đẩy xuống riêng phần menu — để nguyên trên Sider thì khối đáy cuộn
          // theo menu, không còn "ghim" nữa.
          <Layout.Sider width={220} theme="light" className="vo__ben">
            <div className="vo__ben-menu">{menu}</div>
            <div className="vo__chan-menu">
              <div className="vo__chan-ten" title={session.user.realName}>
                {session.user.realName}
              </div>
              <Button block onClick={() => { signOut(); nav("/"); }}>
                Đăng xuất
              </Button>
            </div>
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