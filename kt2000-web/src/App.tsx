import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./AuthContext";
import LoginPage from "./LoginPage";
import DashboardPage from "./DashboardPage";
import AppShell from "./AppShell";
import HoaDonDauVao from "./pages/HoaDonDauVao";
import ChoPhatTrien from "./pages/ChoPhatTrien";
import DonViKhachHang from "./pages/DonViKhachHang";
import MoNamLamViec from "./pages/MoNamLamViec";
// Phần nội bộ (NB)
import { PhieuXuatHang, PhieuNhapHang } from "./pages/PhieuXuatNhap";
import GoiHang from "./pages/GoiHang";
import DanhSachPhieu from "./pages/DanhSachPhieu";
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
            <Route path="bao-cao-thue" element={<ChoPhatTrien title="Báo cáo thuế" />} />
            <Route path="bao-cao-ton-kho" element={<ChoPhatTrien title="Báo cáo tồn kho" />} />
            <Route path="bao-cao-cong-no" element={<ChoPhatTrien title="Báo cáo công nợ" />} />
            <Route path="phieu-xuat" element={<PhieuXuatHang />} />
            <Route path="phieu-nhap" element={<PhieuNhapHang />} />
            <Route path="goi-hang" element={<GoiHang />} />
            <Route path="danh-sach-phieu" element={<DanhSachPhieu />} />
            <Route path="don-vi" element={<DonViKhachHang />} />
            <Route path="mo-nam" element={<MoNamLamViec />} />
            <Route path="quan-ly-user" element={<QuanLyUser />} />
            <Route path="nhat-ky" element={<NhatKyHeThong />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}