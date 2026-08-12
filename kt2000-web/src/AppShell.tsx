import { Layout, Menu, Tag, Button, Space, Typography } from "antd";
import { Outlet, useNavigate, useLocation, Navigate } from "react-router-dom";
import { useAuth } from "./AuthContext";
import ErrorBoundary from "./ErrorBoundary";
import DoiMatKhauBatBuoc from "./DoiMatKhauBatBuoc";

export const MAU_HD_RA = "#cf1322";
export const MAU_HD_VAO = "#0958d9";

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
        label: nhanHd("Lấy HĐ GTGT đầu Vào", MAU_HD_VAO) },
      { key: "/app/hoa-don-ra",
        label: nhanHd("Lấy HĐ GTGT đầu Ra", MAU_HD_RA) },
    ],
  },
  {
    type: "group" as const, label: "BÁO CÁO",
    children: [
      { key: "/app/bao-cao-thue", label: "Báo cáo thuế" },
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
  const laManHdRa = loc.pathname === "/app/hoa-don-ra";
  const laManHdVao = loc.pathname === "/app/hoa-don-vao";
  const nhanChieu = laManHdRa ? "HĐ GTGT ĐẦU RA"
                  : laManHdVao ? "HĐ GTGT ĐẦU VÀO" : null;
  const mauChieu = laManHdRa ? MAU_HD_RA : MAU_HD_VAO;

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
                : isInternal
                  ? [
                      ...menuMdnNb,
                      {
                        type: "group" as const, label: "QUẢN TRỊ",
                        children: [
                          { key: "/app/don-vi", label: "Đơn vị khách hàng" },
                          { key: "/app/mo-nam", label: "Mở năm làm việc" },
                          { key: "/app/quan-ly-user", label: "Quản lý người dùng" },
                          { key: "/app/nhat-ky", label: "Nhật ký hệ thống" },
                        ],
                      },
                    ]
                  : menuThue
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