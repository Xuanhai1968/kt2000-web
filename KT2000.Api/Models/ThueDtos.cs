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

    // ======================= BÁO CÁO THUẾ GTGT (FRM_BC_THUE) =======================
    // Một dòng trên tab "Hoá đơn mua Vào" / "Hoá đơn bán Ra" — bảng kê hóa đơn.
    // Đây là góc nhìn KÊ KHAI: gộp phẳng, không kèm dòng hàng, có cột tên/mã hàng
    // đại diện để nhìn ra hóa đơn nói về cái gì.
    public class BangKeHoaDonDto
    {
        public int Stt { get; set; }
        public string MaHd { get; set; } = "";
        public string? KhHd { get; set; }          // ký hiệu HĐ
        public string? SoHd { get; set; }
        public DateTime? Ngay { get; set; }
        public string? TenDoiTac { get; set; }     // người bán (vào) / người mua (ra)
        public string? MstDoiTac { get; set; }
        public string? MatHang { get; set; }       // tên hàng của dòng đầu, để nhận diện
        public decimal DoanhThuChuaVat { get; set; }
        public int? ThueSuat { get; set; }         // null = HĐ không khai vat
        public decimal ThueGtgt { get; set; }
        public string? GhiChu { get; set; }
    }

    // Một dòng trên tab "Bảng tổng Hợp" — chỉ tiêu tờ khai 01/GTGT.
    // Giữ đúng cách đánh số của tờ khai (1, 2, 2a..2d, 3, 3a..3c, 4..8) vì kế toán
    // đối chiếu thẳng sang phần mềm HTKK theo số hiệu này.
    public class ChiTieuTongHopDto
    {
        public string Stt { get; set; } = "";      // "1", "2a", "3c"... KHÔNG phải số
        public string ChiTieu { get; set; } = "";
        public decimal? DoanhThuChuaVat { get; set; }
        public decimal? ThueGtgt { get; set; }
        // Dòng tiêu đề nhóm (1, 2, 3, 4...) in đậm/màu như bản VFP; dòng con thì không
        public bool LaDongChinh { get; set; }
    }

    // ======================= RÀ SOÁT TRƯỚC KHI KHAI THUẾ =======================
    // Một hóa đơn đọc được từ FILE (XML cổng TCT hoặc Excel bảng kê) mà client gửi
    // lên để đối chiếu. Chỉ mang những trường đủ để định danh và so tiền.
    public class HoaDonFileDto
    {
        public string TenFile { get; set; } = "";
        public string Huong { get; set; } = "";      // VAO | RA
        public string Mst { get; set; } = "";        // MST đối tác
        public string Khhd { get; set; } = "";
        public string SoHd { get; set; } = "";
        public string? Ngay { get; set; }            // yyyy-MM-dd
        public string? TenDoiTac { get; set; }
        public decimal TienHang { get; set; }
        public decimal TienVat { get; set; }
    }

    // Một hóa đơn đọc từ SỔ, dùng nội bộ khi đối chiếu.
    public class HoaDonSoDto
    {
        public string MaHd { get; set; } = "";
        public string Huong { get; set; } = "";
        public string Mst { get; set; } = "";
        public string Khhd { get; set; } = "";
        public string SoHd { get; set; } = "";
        public DateTime? Ngay { get; set; }
        public int? Thang { get; set; }
        public string TenKh { get; set; } = "";
        public decimal TienHang { get; set; }
        public decimal TienVat { get; set; }
    }

    // Một vấn đề tìm được. Dùng chung cho cả bốn loại để lưới hiện được mọi nhóm
    // bằng một bộ cột — trường nào không hợp với loại đó thì để null.
    public class VanDeDto
    {
        public string Loai { get; set; } = "";       // thieu-trong-so | lech-tien | trung-so…
        public string? MaHd { get; set; }
        public string? Khhd { get; set; }
        public string? SoHd { get; set; }
        public string? Mst { get; set; }
        public string? TenDoiTac { get; set; }
        public string? Ngay { get; set; }
        public string? Huong { get; set; }
        public string? TenFile { get; set; }
        public decimal? TienHangFile { get; set; }
        public decimal? TienVatFile { get; set; }
        public decimal? TienHangSo { get; set; }
        public decimal? TienVatSo { get; set; }
        public string MoTa { get; set; } = "";
    }

    public class KetQuaRaSoatDto
    {
        public int Nam { get; set; }
        public int? Thang { get; set; }
        public int SoHdFile { get; set; }
        public int SoHdSo { get; set; }
        public List<VanDeDto> ThieuTrongSo { get; set; } = new();
        public List<VanDeDto> ThieuTrongFile { get; set; } = new();
        public List<VanDeDto> LechTien { get; set; } = new();
        public List<VanDeDto> Trung { get; set; } = new();
        public List<VanDeDto> SaiKy { get; set; } = new();
    }

    // Trả về cho MỘT kỳ kê khai: hai bảng kê + bảng tổng hợp đã tính sẵn.
    public class BaoCaoThueDto
    {
        public int Nam { get; set; }
        public int? Thang { get; set; }            // null = cả năm
        public List<BangKeHoaDonDto> MuaVao { get; set; } = new();
        public List<BangKeHoaDonDto> BanRa { get; set; } = new();
        public List<ChiTieuTongHopDto> TongHop { get; set; } = new();
    }
}
