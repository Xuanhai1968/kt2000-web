import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./AuthContext";
import LoginPage from "./LoginPage";
import DashboardPage from "./DashboardPage";
import AppShell from "./AppShell";
import HoaDonDauVao from "./pages/HoaDonDauVao";
import ChoPhatTrien from "./pages/ChoPhatTrien";
import DonViKhachHang from "./pages/DonViKhachHang";
import MoNamLamViec from "./pages/MoNamLamViec";
export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LoginPage />} />
          <Route path="/app" element={<AppShell />}>
            <Route index element={<DashboardPage />} />
            <Route path="hoa-don-vao" element={<HoaDonDauVao />} />
            <Route path="hoa-don-ra" element={<ChoPhatTrien title="Hóa đơn GTGT đầu ra" />} />
            <Route path="phieu-thu" element={<ChoPhatTrien title="Phiếu thu" />} />
            <Route path="phieu-chi" element={<ChoPhatTrien title="Phiếu chi" />} />
            <Route path="bao-cao-thue" element={<ChoPhatTrien title="Báo cáo thuế" />} />
            <Route path="bao-cao-ton-kho" element={<ChoPhatTrien title="Báo cáo tồn kho" />} />
            <Route path="bao-cao-cong-no" element={<ChoPhatTrien title="Báo cáo công nợ" />} />
            <Route path="don-vi" element={<DonViKhachHang />} />
            <Route path="mo-nam" element={<MoNamLamViec />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}