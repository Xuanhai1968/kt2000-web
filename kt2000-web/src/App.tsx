import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./AuthContext";
import LoginPage from "./LoginPage";
import DashboardPage from "./DashboardPage";
import AppShell from "./AppShell";
import HoaDonDauVao from "./pages/HoaDonDauVao";
import BaoCaoThue from "./pages/BaoCaoThue";
import ChoPhatTrien from "./pages/ChoPhatTrien";
import DonViKhachHang from "./pages/DonViKhachHang";
import MoNamLamViec from "./pages/MoNamLamViec";
// Phần nội bộ (NB) — giao diện bê từ USA_Meva, xem pages/usa_meva/.
//
// Hai file cũ KHÔNG còn route nào trỏ tới: pages/PhieuXuatNhap.tsx và
// pages/DanhSachPhieu.tsx — đã thay bằng bản usa_meva/. Chưa xóa để còn đối chiếu
// lúc nghiệm thu; xóa hẳn sau khi Leader duyệt.
import { PhieuXuatHangUsa, PhieuNhapHangUsa } from "./pages/usa_meva/PhieuDanhDonUsa";
import DanhSachPhieuUsa from "./pages/usa_meva/DanhSachPhieuUsa";
import KhuyenMaiUsa from "./pages/usa_meva/KhuyenMaiUsa";
import GoiHang from "./pages/GoiHang";
// Phần quản trị
import QuanLyUser from "./pages/QuanLyUser";
import NhatKyHeThong from "./pages/NhatKyHeThong";
export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LoginPage />} />
          <Route path="/app" element={<AppShell />}>
            <Route index element={<DashboardPage />} />
            {/* Cùng MỘT màn hình, chỉ khác hướng — sửa nghiệp vụ một chỗ là xong,
                không có chuyện vá bên vào mà quên bên ra */}
            <Route path="hoa-don-vao" element={<HoaDonDauVao huongMacDinh="vao" />} />
            <Route path="hoa-don-ra" element={<HoaDonDauVao huongMacDinh="ra" />} />
            <Route path="phieu-thu" element={<ChoPhatTrien title="Phiếu thu" />} />
            <Route path="phieu-chi" element={<ChoPhatTrien title="Phiếu chi" />} />
            <Route path="bao-cao-thue" element={<BaoCaoThue />} />
            <Route path="bao-cao-ton-kho" element={<ChoPhatTrien title="Báo cáo tồn kho" />} />
            <Route path="bao-cao-cong-no" element={<ChoPhatTrien title="Báo cáo công nợ" />} />
            {/* Đường dẫn giữ nguyên như cũ, chỉ đổi màn hình bên trong sang bản
                USA_Meva. Nhờ vậy link/bookmark cũ và mọi chỗ navigate() sẵn có
                không gãy. */}
            <Route path="phieu-xuat" element={<PhieuXuatHangUsa />} />
            <Route path="phieu-nhap" element={<PhieuNhapHangUsa />} />
            <Route path="danh-sach-phieu" element={<DanhSachPhieuUsa />} />
            {/* Danh mục khuyến mãi "mua N tặng M" (DM_KM_NB, script 018) */}
            <Route path="khuyen-mai" element={<KhuyenMaiUsa />} />
            {/* Gói hàng vẫn sống: chỉ ẩn khỏi MENU của đơn vị không dùng gói
                (xem KHONG_DUNG_GOI trong AppShell.tsx), route giữ nguyên cho các
                đơn vị NB khác — TUAN_NGA_NB vẫn gom đơn theo chuyến xe. */}
            <Route path="goi-hang" element={<GoiHang />} />
            {/* Địa chỉ /app/usa-* của giai đoạn chạy song song -> đá về đường chính,
                để ai đã lưu bookmark không rơi vào trang trắng. */}
            <Route path="usa-phieu-xuat" element={<Navigate to="/app/phieu-xuat" replace />} />
            <Route path="usa-phieu-nhap" element={<Navigate to="/app/phieu-nhap" replace />} />
            <Route path="usa-danh-sach-phieu" element={<Navigate to="/app/danh-sach-phieu" replace />} />
            <Route path="don-vi" element={<DonViKhachHang />} />
            <Route path="mo-nam" element={<MoNamLamViec />} />
            <Route path="quan-ly-user" element={<QuanLyUser />} />
            <Route path="nhat-ky" element={<NhatKyHeThong />} />
          </Route>
          {/* URL không khớp route nào -> đá về trang đăng nhập.
              Không có dòng này thì gõ nhầm (vd /login — app không có route đó) sẽ ra
              TRANG TRẮNG im lặng: không lỗi, không chữ nào, nhìn y như app hỏng.
              replace để nút Back không quay lại đúng cái URL sai vừa gõ. */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}