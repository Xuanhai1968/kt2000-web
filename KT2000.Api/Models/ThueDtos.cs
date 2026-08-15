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
    // Một hóa đơn, hai vế: số đang nằm trong SỔ và số của BẢN GỐC TCT (IN_VALUE_LINE —
    // chép từ file Excel danh sách của cổng lúc nạp).
    //
    // Vì sao trả cả vế SỔ dù màn hình đã có sẵn danh sách hóa đơn: tiền hàng trong sổ
    // KHÔNG phải cột tienHang của danh sách. Cột đó là Σ(SL × ĐG) thuần, chưa trừ chiết
    // khấu và chưa đảo dấu dòng chiết khấu — so thẳng với bản gốc thì mọi hóa đơn có
    // chiết khấu đều báo lệch đúng bằng số chiết khấu (đo 15/08: 6/49 hóa đơn tháng 8
    // của HOA_SANG lệch giả kiểu này, ca nặng nhất 17.901.037đ).
    // Tính đúng ở đây, một chỗ duy nhất, bằng đúng công thức phép kiểm Σ lúc nạp.
    //
    // Phần LỆCH thì để màn hình trừ: đã có cả hai vế rồi, trả thêm là hai nơi cùng
    // định nghĩa một phép trừ.
    public class DoiChieuHdDto
    {
        public string MaHd { get; set; } = "";
        public decimal TienHangSo { get; set; }   // Σ(SL×ĐG có dấu) − chiết khấu
        public decimal TienVatSo { get; set; }
        public decimal TienHangGoc { get; set; }
        public decimal TienVatGoc { get; set; }
        public string? TthaiGoc { get; set; }   // 'Hóa đơn mới', 'Hóa đơn đã bị thay thế'…
    }

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

    // ======================= TỜ KHAI 01/GTGT (TT80) =======================
    // Xem docs/NB/SPEC-TO-KHAI-01-GTGT.md. Tên trường giữ đúng mã chỉ tiêu của HTKK
    // (ct21, ct22…) chứ không đặt tên "dễ đọc": khi đối chiếu với tờ khai giấy hay
    // XML gốc, mã chỉ tiêu là thứ duy nhất hai bên cùng gọi tên.

    /// <summary>Một nhóm doanh thu theo thuế suất, sau khi đã phân bổ chiết khấu.</summary>
    public class NhomThueSuatDto
    {
        public decimal ThueSuat { get; set; }        // 0, 5, 8, 10
        public string? LoaiThue { get; set; }        // KCT | KKKNT | 0% | 8% | 10%…
        public int SoDong { get; set; }
        public decimal TienHangGop { get; set; }     // Σ(so_luong × don_gia), CHƯA trừ CK
        public decimal ChietKhau { get; set; }       // CK phân bổ về nhóm này
        public decimal DoanhThu { get; set; }        // TienHangGop − ChietKhau
        public decimal Thue { get; set; }            // DoanhThu × ThueSuat
    }

    /// <summary>Một cảnh báo/lỗi phát hiện khi lập tờ khai.</summary>
    public class CanhBaoToKhaiDto
    {
        public string Ma { get; set; } = "";         // BR-TK-01, LK-01, KT-02…
        public string Muc { get; set; } = "";        // CHAN | CANH_BAO
        public string MoTa { get; set; } = "";
        public string? MaHd { get; set; }
        public decimal? ChenhLech { get; set; }
    }

    /// <summary>Phụ lục giảm thuế GTGT theo NQ142 (10% → 8%).</summary>
    public class PhuLucNq142Dto
    {
        // Mua vào thuộc nhóm được giảm
        public decimal GiaTriHhdvMuaVao { get; set; }
        public decimal ThueGtgtHhdvMuaVao { get; set; }
        // Bán ra thuộc nhóm được giảm
        public decimal GiaTriHhdvBanRa { get; set; }
        public decimal ThueSuatTheoQuyDinh { get; set; } = 10;
        public decimal ThueSuatSauGiam { get; set; } = 8;
        public decimal ThueGtgtDuocGiam { get; set; }   // = GiaTriHhdvBanRa × 2%
        public decimal ChenhLechCt9 { get; set; }       // mua vào − bán ra
    }

    /// <summary>Tờ khai 01/GTGT đã tính xong, đủ để xem trước và sinh XML.</summary>
    public class ToKhaiGtgtDto
    {
        public int Nam { get; set; }
        public int Thang { get; set; }
        public string MaDonVi { get; set; } = "";
        public string Mst { get; set; } = "";
        public string TenNnt { get; set; } = "";
        public string? DiaChiNnt { get; set; }
        public string? MaCqtNoiNop { get; set; }
        public string? TenCqtNoiNop { get; set; }
        public string? MaTinhNnt { get; set; }
        public string? TenTinhNnt { get; set; }

        // ----- Chỉ tiêu tờ khai chính -----
        public decimal Ct21 { get; set; }   // Không phát sinh HĐ mua bán (0/1)
        public decimal Ct22 { get; set; }   // Khấu trừ kỳ trước chuyển sang = ct43 kỳ N-1
        public decimal Ct23 { get; set; }   // Giá trị HHDV mua vào
        public decimal Ct24 { get; set; }   // Thuế GTGT mua vào
        public decimal Ct23a { get; set; }  // Trong đó: hàng nhập khẩu
        public decimal Ct24a { get; set; }
        public decimal Ct25 { get; set; }   // Thuế GTGT được khấu trừ kỳ này
        public decimal Ct26 { get; set; }   // Bán ra không chịu thuế
        public decimal Ct27 { get; set; }   // Bán ra chịu thuế
        public decimal Ct28 { get; set; }
        public decimal Ct29 { get; set; }   // Thuế suất 0%
        public decimal Ct30 { get; set; }   // Thuế suất 5%
        public decimal Ct31 { get; set; }
        public decimal Ct32 { get; set; }   // Thuế suất 10% (gồm cả hàng giảm còn 8%)
        public decimal Ct33 { get; set; }
        public decimal Ct32a { get; set; }  // Không phải kê khai nộp thuế
        public decimal Ct34 { get; set; }   // Tổng doanh thu bán ra
        public decimal Ct35 { get; set; }   // Tổng thuế bán ra
        public decimal Ct36 { get; set; }   // ct35 − ct25
        public decimal Ct37 { get; set; }
        public decimal Ct38 { get; set; }
        public decimal Ct39a { get; set; }
        public decimal Ct40a { get; set; }
        public decimal Ct40b { get; set; }
        public decimal Ct40 { get; set; }   // Phải nộp trong kỳ
        public decimal Ct41 { get; set; }   // Còn được khấu trừ
        public decimal Ct42 { get; set; }   // Đề nghị hoàn
        public decimal Ct43 { get; set; }   // Chuyển kỳ sau = ct41 − ct42

        public PhuLucNq142Dto? PhuLucNq142 { get; set; }

        // ----- Phần để người dùng soi trước khi xuất -----
        public List<NhomThueSuatDto> NhomBanRa { get; set; } = new();
        public List<NhomThueSuatDto> NhomMuaVao { get; set; } = new();
        public List<CanhBaoToKhaiDto> CanhBao { get; set; } = new();

        // Nguồn của ct22 — hiện rõ để kế toán biết số ở đâu ra (BR-TK-02)
        public string? NguonCt22 { get; set; }
        // Có cảnh báo mức CHAN thì KHÔNG cho xuất XML
        public bool ChoXuat => !CanhBao.Any(x => x.Muc == "CHAN");
        public string TenFileXml { get; set; } = "";
    }
}
