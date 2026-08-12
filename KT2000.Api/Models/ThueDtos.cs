namespace KT2000.Api.Models
{
    // ============================ SỔ THUẾ: HÓA ĐƠN GTGT ============================
    // DTO của sổ THUẾ (bảng HOA_DON / HOA_DON_LINE trong DB đơn vị-năm), dùng cho màn
    // Hóa đơn GTGT đầu vào / đầu ra của đơn vị thuế thường.
    // Một dòng hàng trong hóa đơn GTGT — ánh xạ HOA_DON_LINE.
    public class HoaDonLineDto
    {
        public int SttLine { get; set; }
        public string? MaHang { get; set; }
        public string TenHang { get; set; } = "";
        public string? Dvt { get; set; }
        public decimal SoLuong { get; set; }
        public decimal DonGia { get; set; }
        public decimal ThanhTien { get; set; }
        public decimal PtVat { get; set; }
        public decimal TienCk { get; set; }
        public string? GhiNo { get; set; }
        public string? GhiCo { get; set; }
        public string? MaNgan { get; set; }
        public string? TinhChat { get; set; }
        public string? GhiChu { get; set; }
    }

    // Một hóa đơn GTGT trong sổ thuế — ánh xạ HOA_DON.
    public class HoaDonThueDto
    {
        public string MaHd { get; set; } = "";
        public string? Huong { get; set; }         // cột tính sẵn của bảng: VAO | RA
        public DateTime? Ngay { get; set; }
        public DateTime? NgayNh { get; set; }
        public int? Thang { get; set; }
        public string? Khhd { get; set; }
        public string? SoHd { get; set; }
        public string? Mst { get; set; }
        public string? TenKh { get; set; }
        public string? DiaChi { get; set; }
        public string? NguoiGiaoDich { get; set; }
        public string? SoPtc { get; set; }
        public string? MaTv { get; set; }
        public string? TenTv { get; set; }
        // Tiền hàng KHÔNG có cột riêng: cộng Σ (so_luong × don_gia) của các dòng.
        public decimal TienHang { get; set; }
        public decimal TienVat { get; set; }
        public decimal TienCk { get; set; }
        public decimal TongTien { get; set; }
        public int SoDongHang { get; set; }
        // Định khoản
        public string? GhiNo { get; set; }
        public string? GhiCo { get; set; }
        public string? MaCtNo { get; set; }
        public string? MaCtCo { get; set; }
        public string? GhiChu { get; set; }
        public string? TthaiHd { get; set; }
        // %VAT của cả hóa đơn — cột vat nằm trên HEADER. Có đơn vị để trống ở đây mà
        // ghi %VAT xuống pt_vat của dòng, nên FE phải lùi về dòng khi cái này null.
        public int? Vat { get; set; }
        // Khối HĐ Liên quan
        public string? TichChatHdLienquan { get; set; }
        public string? LoaiHdLienquan { get; set; }
        public string? MauSoHdLienquan { get; set; }
        public string? KhhdLienquan { get; set; }
        public string? SohdLienquan { get; set; }
        public DateTime? NgayLienquan { get; set; }
        public string? TrangThaiHdLienQuan { get; set; }
        public List<HoaDonLineDto> Lines { get; set; } = new();
    }
}
