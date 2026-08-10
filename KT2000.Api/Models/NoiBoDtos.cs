namespace KT2000.Api.Models
{
    // DTO cho phần NỘI BỘ (NB). Tên thuộc tính đặt theo tên cột trong database
    // (013/014 cho danh mục, 015 cho đơn hàng + gói) để đọc code là biết đang chạm cột
    // nào — cùng lối với các DTO nạp hóa đơn sẵn có.
    //
    // ĐƠN HÀNG NB DÙNG CHUNG KHUÔN HOA_DON (SPEC mục 4, chốt v0.3) — không có bảng
    // DON_HANG riêng, nên DTO dưới đây map thẳng vào HOA_DON/HOA_DON_LINE.

    public class DmHangNbDto
    {
        public string? MaHang { get; set; }        // để trống khi thêm mới -> backend tự sinh
        public string TenHang { get; set; } = "";  // tên ĐÁNH ĐƠN (có ghi chú nắp/lô cho kho)
        public string? TenHd { get; set; }
        public string? Dvt { get; set; }
        public string? QuyCach { get; set; }
        public decimal? GiaBan { get; set; }
        public decimal? GiaMua { get; set; }
        public decimal? PtVat { get; set; }
        public string? MaNgan { get; set; }
        public string? MaHangThue { get; set; }    // BR-NB-02: vết chép từ sổ thuế
        public string? GhiChu { get; set; }
        // --- 014: bổ sung theo form gốc Hoa_Sang ---
        public string? TenTat { get; set; }        // gõ tắt để tìm nhanh (sortName)
        public string? MaVach { get; set; }
        public string? NhomHang { get; set; }
        public string? DvtLon { get; set; }        // 1 DvtLon = HeSoLon × Dvt
        public decimal? HeSoLon { get; set; }
        public decimal? GiaBanLon { get; set; }
        public List<QuyCachNbDto> QuyCach2 { get; set; } = new();
    }

    public class QuyCachNbDto
    {
        public string MaDvt { get; set; } = "";
        public string? TenDvt { get; set; }
        public string? TenTat { get; set; }
        public decimal? HeSoQd { get; set; }       // 1 ĐVT này = HeSoQd × DvtGoc
        public string? DvtGoc { get; set; }
        public bool LaDvtGoc { get; set; }         // quy cách mặc định của mặt hàng
        public decimal? GiaBan { get; set; }
        public decimal? GiaMua { get; set; }
        public string? MaVach { get; set; }
    }

    public class DmKmNbDto
    {
        public string? MaKm { get; set; }
        public string TenKm { get; set; } = "";
        public string MaHang { get; set; } = "";
        public string MaDvt { get; set; } = "";        // quy cách phải MUA
        public string MaDvtTang { get; set; } = "";    // quy cách được TẶNG
        public decimal SlMua { get; set; }
        public decimal SlTang { get; set; }
        public DateTime? TuNgay { get; set; }
        public DateTime? DenNgay { get; set; }
        public string? GhiChu { get; set; }
        public string? TenHang { get; set; }
        public string? TenDvt { get; set; }
        public string? TenDvtTang { get; set; }
    }

    public class DmKhNbDto
    {
        public string? MaKh { get; set; }
        public string TenKh { get; set; } = "";
        public string LoaiDt { get; set; } = "KH";
        public string? TenGiaoDich { get; set; }
        public string? Mst { get; set; }
        public string? DiaChi { get; set; }
        public string? DienThoai { get; set; }
        public string? NguoiLienHe { get; set; }
        public string? MaKhHd { get; set; }         // BR-NB-01: khách tương ứng bên thuế
        public decimal? CongNoDau { get; set; }
        public string? GhiChu { get; set; }
        public string? TenTat { get; set; }
        public string? DiaChiGiao { get; set; }     // địa chỉ GIAO, khác địa chỉ trên HĐ
        public string? MaNhan { get; set; }
        public string? TenNhan { get; set; }        // đọc ra để hiện, không ghi xuống
        public string? MaTinh { get; set; }
    }


    public class DmMauDto
    {
        public string MaMau { get; set; } = "";     // = ColorCode, vd "2532-P"
        public string NhomMau { get; set; } = "";   // = ColorGroup, vd "Yellow"
        public string? MaHex { get; set; }          // = HexValue, để tô ô chọn màu
        public int? ThuTu { get; set; }             // giữ đúng thứ tự bảng màu giấy
        public string? GhiChu { get; set; }
    }
    // Danh mục nhãn hàng (DM_NHAN) — nạp từ KT_Master.CompanyBrands của hệ cũ
    public class DmNhanDto
    {
        public string? MaNhan { get; set; }
        public string TenNhan { get; set; } = "";
        public string? TenCty { get; set; }         // pháp nhân in trên phiếu
        public string? Mst { get; set; }
        public string? TenTat { get; set; }
    }

    // Dòng hàng = HOA_DON_LINE
    public class DonNbLineDto
    {
        public int SttLine { get; set; }
        public string? MaHang { get; set; }
        public string? TenHang { get; set; }   // nguyên văn lúc lập đơn (BR-NB-02)
        public string? TenHd { get; set; }
        public string? Dvt { get; set; }
        public decimal SoLuong { get; set; }
        public decimal DonGia { get; set; }
        // ThanhTien/TienVatL do backend tính lại lúc lưu — gửi lên cũng bị ghi đè
        public decimal ThanhTien { get; set; }
        public decimal PtVat { get; set; }
        public decimal TienVatL { get; set; }
        public string? GhiChu { get; set; }

        public decimal? HeSoQd { get; set; }
        public decimal? SlQuyDoi { get; set; }
        public bool LaHangTang { get; set; }
        public string? QuyCach { get; set; }
        public string? MaMau { get; set; }

        public decimal TienTinhMau { get; set; }
        // Mã hex đọc kèm từ DM_MAU để tô ô chọn màu trên lưới. Chỉ ĐỌC RA.
        public string? MaHex { get; set; }
        // BR-NB-07: mốc rời kho của RIÊNG dòng này (đơn giao nhiều đợt).
        // Để trống thì engine lấy NgayNh của đơn.
        public DateTime? NgayNhL { get; set; }
    }

    public class DonNbDto
    {
        public string? MaHd { get; set; }          // để trống khi lập đơn mới
        public DateTime? Ngay { get; set; }        // ngày lập đơn
        public DateTime? NgayNh { get; set; }      // ngày xuất kho thật (BR-NB-07)
        public string? MaKh { get; set; }
        public string? TenKh { get; set; }         // nguyên văn lúc lập đơn
        public string? Mst { get; set; }
        public string? DiaChi { get; set; }        // địa chỉ CỬA HÀNG của khách
        public string? DiaChiGiao { get; set; }
        public string? MaNvkd { get; set; }        // -> DM_KH_NB (loai_dt='NV')
        public string? MaNvvc { get; set; }        // -> DM_KH_NB (loai_dt='NV')
        public string? MaGoi { get; set; }         // BR-NB-08: thuộc gói nào
        public string? GhiChu { get; set; }
        public decimal TienHang { get; set; }
        public decimal TienVat { get; set; }
        public decimal TongTien { get; set; }
        public string TthaiHd { get; set; } = "nhap";

        public string? Huong { get; set; }
        public string? TenNvkd { get; set; }
        public string? TenNvvc { get; set; }

        public string? TenNhan { get; set; }
        public List<DonNbLineDto> Lines { get; set; } = new();
    }

    // ============================ GÓI HÀNG (BR-NB-08) ============================
    public class GoiHdDto
    {
        public string? MaGoi { get; set; }
        public string? TenGoi { get; set; }        // "gói phố Đại Từ"
        public string? KhuVuc { get; set; }
        public DateTime? Ngay { get; set; }
        public string? MaNvvc { get; set; }
        public string? TenNvvc { get; set; }       // đọc từ DM_KH_NB, chỉ để hiện
        public string TrangThai { get; set; } = "moi";   // moi -> chot -> xuat -> huy
        public int? SoDon { get; set; }
        public DateTime? NgayChot { get; set; }
        public DateTime? NgayXuat { get; set; }
        public string? GhiChu { get; set; }
        public List<GoiHdLineDto> Lines { get; set; } = new();   // phiếu soạn hàng
        public List<DonNbDto> DonCon { get; set; } = new();      // đơn thành viên
    }

    // Dòng phiếu soạn hàng — SNAPSHOT sinh lúc CHỐT GÓI, không nhập tay
    public class GoiHdLineDto
    {
        public int SttLine { get; set; }
        public string? MaHang { get; set; }
        public string? TenHang { get; set; }
        public string? Dvt { get; set; }
        public decimal SoLuong { get; set; }       // TỔNG gộp từ mọi đơn con
        public int SoDonGop { get; set; }          // gộp từ bao nhiêu đơn
        public string? GhiChu { get; set; }
        public decimal? HeSoLon { get; set; }
        public string? DvtLon { get; set; }
        public decimal? TriGia { get; set; }
        public decimal? GiaChuan { get; set; }
    }

    // ============================ TRA CỨU XUYÊN DB (BR-NB-03) ============================
    // Kết quả tra tên hàng từ sổ THUẾ của tenant liên kết. CHỈ gồm 4 trường dưới đây —
    // không trả bất kỳ dữ liệu nào khác của sổ thuế (giá, số tiền, đối tác...) trong v1.
    public class TraHangThueDto
    {
        public string? MaHang { get; set; }        // có khi nguồn A (đã gán mã)
        public string TenHang { get; set; } = "";
        public string? Dvt { get; set; }
        public string? MaNgan { get; set; }
        public string Nguon { get; set; } = "";
        public int Nam { get; set; }               // năm sổ thuế tìm thấy dòng này
    }
}
