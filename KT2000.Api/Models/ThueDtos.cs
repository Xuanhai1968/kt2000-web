namespace KT2000.Api.Models
{
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


    public class DoiChieuHdDto
    {
        /// <summary>
        /// Khóa ghép của lưới. Hóa đơn đã lên sổ thì đây là ma_hd; hóa đơn CHỈ có ở cổng
        /// thì không có ma_hd nào để lấy, nên dùng "khhd|so_hd" — vẫn duy nhất trong một
        /// hướng, và màn hình chỉ cần một khóa ổn định để làm getRowId.
        /// </summary>
        public string MaHd { get; set; } = "";
        public decimal TienHangSo { get; set; }   // Σ(SL×ĐG có dấu) − chiết khấu
        public decimal TienVatSo { get; set; }
        public decimal TienHangGoc { get; set; }
        public decimal TienVatGoc { get; set; }
        public string? TthaiGoc { get; set; }   // 'Hóa đơn mới', 'Hóa đơn đã bị thay thế'…

        // ----- Phần dưới chỉ có nghĩa với dòng CHƯA LÊN SỔ -----
        //
        // false = cổng có liệt kê mà HOA_DON không có dòng nào. Hai nguyên nhân thật đã
        // gặp: file XML tải hỏng (không dựng nổi hóa đơn), và hóa đơn bị đá ra vì lệch Σ.
        // Cả hai đều là thứ kế toán PHẢI thấy — giấu đi thì bảng đối chiếu chỉ còn đối
        // chiếu được đúng những hóa đơn vốn đã không có vấn đề gì.
        public bool CoTrongSo { get; set; } = true;

        // Định danh lấy từ chính bản gốc, để lưới hiện được dòng chưa lên sổ mà không phải
        // tra ngược sang HOA_DON — nơi theo đúng định nghĩa là không có gì để tra.
        public string? Khhd { get; set; }
        public string? SoHd { get; set; }
        public DateTime? Ngay { get; set; }
        public string? TenKh { get; set; }
        public string? Mst { get; set; }
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
        public decimal TienHang { get; set; }
        public decimal TienVat { get; set; }
        public decimal TienCk { get; set; }
        public decimal TongTien { get; set; }
        public int SoDongHang { get; set; }
        public string? GhiNo { get; set; }
        public string? GhiCo { get; set; }
        public string? MaCtNo { get; set; }
        public string? MaCtCo { get; set; }
        public string? GhiNoVat { get; set; }
        public string? GhiCoVat { get; set; }
        public string? GhiChu { get; set; }
        public string? TthaiHd { get; set; }
        public int? Vat { get; set; }
        public int? VatLine { get; set; }
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


    /// <summary>
    /// Một dòng trong lưới "hóa đơn lệch" — GIỮ NGUYÊN khuôn cột của
    /// <see cref="BangKeHoaDonDto"/> để lưới kết quả đọc y hệt lưới gốc, kế toán không
    /// phải học lại bố cục khi soi.
    ///
    /// Khác BangKeHoaDonDto ở ba trường cuối: hóa đơn lệch phải nói rõ LỆCH Ở ĐÂU nên
    /// mang thêm số bên bảng kê để đặt cạnh số của sổ.
    /// </summary>
    public class HoaDonLechDto
    {
        public int Stt { get; set; }
        public string MaHd { get; set; } = "";
        public string? KhHd { get; set; }
        public string? SoHd { get; set; }
        public DateTime? Ngay { get; set; }
        public string? TenDoiTac { get; set; }
        public string? MstDoiTac { get; set; }
        public string? MatHang { get; set; }
        public decimal DoanhThuChuaVat { get; set; }   // số của SỔ (0 nếu sổ chưa có)
        public int? ThueSuat { get; set; }
        public decimal ThueGtgt { get; set; }          // số của SỔ
        public string? GhiChu { get; set; }

        /// thieu-trong-so | thieu-trong-file | lech-tien
        public string Loai { get; set; } = "";
        public string MoTa { get; set; } = "";
        public bool CoTrongSo { get; set; }            // false = chỉ có ở bảng kê
        public decimal? TienHangFile { get; set; }     // số bên BẢNG KÊ, để đặt cạnh số sổ
        public decimal? TienVatFile { get; set; }
        public string? TenFile { get; set; }
    }

    public class KetQuaHdLechDto
    {
        public int Nam { get; set; }
        public int Thang { get; set; }
        public string Huong { get; set; } = "";        // VAO | RA
        public string? Nhan { get; set; }              // "kho mua vào / 2 file"
        public int SoFile { get; set; }
        public int SoHdSo { get; set; }
        public int SoHdFile { get; set; }
        public int SoLech { get; set; }
        public decimal TongHangSo { get; set; }
        public decimal TongVatSo { get; set; }
        public decimal TongHangFile { get; set; }
        public decimal TongVatFile { get; set; }

        public List<HoaDonLechDto> Dong { get; set; } = new();
        public List<string> Loi { get; set; } = new();
    }


    public class ChiTieuTongHopDto
    {
        public string Stt { get; set; } = "";      // "1", "2a", "3c"... KHÔNG phải số
        public string ChiTieu { get; set; } = "";
        public decimal? DoanhThuChuaVat { get; set; }
        public decimal? ThueGtgt { get; set; }
        public bool LaDongChinh { get; set; }
    }


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

    /// Khác hẳn <see cref="BangKeHoaDonDto.ThueSuat"/>: cái kia là số ĐẠI DIỆN của cả
    public class NhomSuatDto
    {
        public decimal ThueSuat { get; set; }
        public int SoHd { get; set; }
        public decimal DoanhThu { get; set; }
        public decimal Thue { get; set; }
    }

    public class NhomSuatHdDto
    {
        public string MaHd { get; set; } = "";
        public decimal ThueSuat { get; set; }
        public decimal DoanhThu { get; set; }
    }

    public class BaoCaoThueDto
    {
        public int Nam { get; set; }
        public int? Thang { get; set; }            // null = cả năm
        public List<BangKeHoaDonDto> MuaVao { get; set; } = new();
        public List<BangKeHoaDonDto> BanRa { get; set; } = new();
        public List<ChiTieuTongHopDto> TongHop { get; set; } = new();
        /// <summary>Bán ra gom theo thuế suất của DÒNG — xem NhomSuatDto.</summary>
        public List<NhomSuatDto> NhomBanRa { get; set; } = new();
        public List<NhomSuatDto> NhomMuaVao { get; set; } = new();
        /// <summary>Phân rã (hóa đơn × thuế suất) của bán ra — xem NhomSuatHdDto.</summary>
        public List<NhomSuatHdDto> NhomBanRaTheoHd { get; set; } = new();
        public List<NhomSuatHdDto> NhomMuaVaoTheoHd { get; set; } = new();
    }

    public class NhomThueSuatDto
    {
        public decimal ThueSuat { get; set; }        // 0, 5, 8, 10
        public string? LoaiThue { get; set; }        // KCT | KKKNT | 0% | 8% | 10%…
        public int SoDong { get; set; }
        public decimal TienHangGop { get; set; }     // Σ(so_luong × don_gia), CHƯA trừ CK
        public decimal ChietKhau { get; set; }       // CK phân bổ về nhóm này
        public decimal DoanhThu { get; set; }        // TienHangGop − ChietKhau
        public decimal Thue { get; set; }            // DoanhThu × ThueSuat
        public decimal ThueTuFile { get; set; }
    }

    public class CanhBaoToKhaiDto
    {
        public string Ma { get; set; } = "";         // BR-TK-01, LK-01, KT-02…
        public string Muc { get; set; } = "";        // CHAN | CANH_BAO
        public string MoTa { get; set; } = "";
        public string? MaHd { get; set; }
        public decimal? ChenhLech { get; set; }
    }

    public class PhuLucNq142Dto
    {
        public decimal GiaTriHhdvMuaVao { get; set; }
        public decimal ThueGtgtHhdvMuaVao { get; set; }
        public decimal GiaTriHhdvBanRa { get; set; }
        public decimal ThueSuatTheoQuyDinh { get; set; } = 10;
        public decimal ThueSuatSauGiam { get; set; } = 8;
        public decimal ThueGtgtDuocGiam { get; set; }   // = GiaTriHhdvBanRa × 2%
        public decimal ChenhLechCt9 { get; set; }       // mua vào − bán ra
    }

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
        public bool LocTheoChon { get; set; }
        public int SoHdDaChon { get; set; }
        public int SoHdCaKy { get; set; }

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

        public List<NhomThueSuatDto> NhomBanRa { get; set; } = new();
        public List<NhomThueSuatDto> NhomMuaVao { get; set; } = new();
        public List<CanhBaoToKhaiDto> CanhBao { get; set; } = new();

        /// <summary>
        /// Hóa đơn thay thế/điều chỉnh cho hóa đơn của KỲ KHÁC — engine LOẠI khỏi
        /// [23]/[24] theo BR-TK-06b (gốc đã kê ở kỳ đó rồi, kê lại là tính hai lần).
        ///
        /// Trả về để kế toán NHÌN THẤY phần bị loại: đo 19/08 USA_MEVA T7 loại 3 hóa
        /// đơn trị giá 381.333.333đ VAT — số lớn như vậy mà im lặng bỏ đi thì không ai
        /// đối chiếu nổi khi tờ khai lệch.
        /// </summary>
        public List<HoaDonLoaiKhacKyDto> LoaiKhacKy { get; set; } = new();

        public string? NguonCt22 { get; set; }
        public bool ChoXuat => !CanhBao.Any(x => x.Muc == "CHAN");
        public string TenFileXml { get; set; } = "";
    }

    /// <summary>Một hóa đơn bị loại vì liên quan tới kỳ khác.</summary>
    public class HoaDonLoaiKhacKyDto
    {
        public string MaHd { get; set; } = "";
        public string Huong { get; set; } = "";        // VAO | RA
        public string? KhHd { get; set; }
        public string? SoHd { get; set; }
        public DateTime? Ngay { get; set; }
        public string? TenDoiTac { get; set; }
        public decimal TienHang { get; set; }
        public decimal TienVat { get; set; }
        public string? TrangThai { get; set; }         // tthai_hd
        public string? SoHdLienQuan { get; set; }      // hóa đơn gốc bị thay thế
        public DateTime? NgayLienQuan { get; set; }    // ngày của hóa đơn gốc
        public string LyDo { get; set; } = "";
    }

    public class ToKhaiTayDto
    {
        public string MaDonVi { get; set; } = "";
        public int Nam { get; set; }
        public int Thang { get; set; }
        public int LanNop { get; set; }

        public string? MaCct { get; set; }
        public string? TenCct { get; set; }
        public string? Mst { get; set; }
        public string? TenNnt { get; set; }
        public string? DiaChiNnt { get; set; }
        public string? GhiChu { get; set; }

        public decimal Ct21 { get; set; }
        public decimal Ct22 { get; set; }
        public decimal Ct23 { get; set; }
        public decimal Ct24 { get; set; }
        public decimal Ct23a { get; set; }
        public decimal Ct24a { get; set; }
        public decimal Ct25 { get; set; }
        public decimal Ct26 { get; set; }
        public decimal Ct27 { get; set; }
        public decimal Ct28 { get; set; }
        public decimal Ct29 { get; set; }
        public decimal Ct30 { get; set; }
        public decimal Ct31 { get; set; }
        public decimal Ct32 { get; set; }
        public decimal Ct33 { get; set; }
        public decimal Ct32a { get; set; }
        public decimal Ct34 { get; set; }
        public decimal Ct35 { get; set; }
        public decimal Ct36 { get; set; }
        public decimal Ct37 { get; set; }
        public decimal Ct38 { get; set; }
        public decimal Ct39 { get; set; }
        public decimal Ct40a { get; set; }
        public decimal Ct40b { get; set; }
        public decimal Ct40 { get; set; }
        public decimal Ct41 { get; set; }
        public decimal Ct42 { get; set; }
        public decimal Ct43 { get; set; }

        public IEnumerable<(string Ten, object Gia)> ChiTieu() => new (string, object)[]
        {
            ("@ct21", Ct21), ("@ct22", Ct22), ("@ct23", Ct23), ("@ct24", Ct24),
            ("@ct23a", Ct23a), ("@ct24a", Ct24a),
            ("@ct25", Ct25), ("@ct26", Ct26), ("@ct27", Ct27), ("@ct28", Ct28),
            ("@ct29", Ct29), ("@ct30", Ct30), ("@ct31", Ct31), ("@ct32", Ct32),
            ("@ct33", Ct33), ("@ct32a", Ct32a), ("@ct34", Ct34), ("@ct35", Ct35),
            ("@ct36", Ct36), ("@ct37", Ct37), ("@ct38", Ct38), ("@ct39", Ct39),
            ("@ct40a", Ct40a), ("@ct40b", Ct40b), ("@ct40", Ct40), ("@ct41", Ct41),
            ("@ct42", Ct42), ("@ct43", Ct43),
        };
    }

    public class DongBcToKhaiDto
    {
        public int Stt { get; set; }
        public string MaDonVi { get; set; } = "";
        public string? TenDonVi { get; set; }
        public int Nam { get; set; }
        public int Thang { get; set; }
        public string KyKeKhai { get; set; } = "";
        public int LanNop { get; set; }          // 0 = chính thức, 1+ = bổ sung
        public decimal? TonDau { get; set; }      // ct22
        public decimal? GtMuaVao { get; set; }    // ct23
        public decimal? VatVao { get; set; }      // ct24
        public decimal? VatKhauTru { get; set; }  // ct25
        public decimal? GtBanRa { get; set; }     // ct34
        public decimal? VatRa { get; set; }       // ct35
        public decimal? VatPhaiNop { get; set; }  // ct40
        public decimal? TonCuoi { get; set; }     // ct43
        public decimal? GtHdVao { get; set; }
        public decimal? GtVatVao { get; set; }
        public decimal? GtHdRa { get; set; }
        public decimal? GtVatRa { get; set; }
        public decimal? LechGtHdVao { get; set; }
        public decimal? LechVatVao { get; set; }
        public decimal? LechGtHdRa { get; set; }
        public decimal? LechVatRa { get; set; }
        public string? XmlName { get; set; }
        public string? XmlPath { get; set; }
        public bool DaNop { get; set; }
        public DateTime? NgayLap { get; set; }
        public string? NguoiLap { get; set; }
        public string? GhiChu { get; set; }
    }

    public class DongRaSoatToKhaiDto
    {
        public int Stt { get; set; }
        public string MaDonVi { get; set; } = "";
        public string? TenDonVi { get; set; }
        public string? Mst { get; set; }

        public bool KhaiQuy { get; set; }
        public string? KyKeKhai { get; set; }     // '07/2026' hoặc 'Q3/2026' — hiện lên lưới
        public decimal? TonDau { get; set; }      // ct22 kỳ này
        public decimal? TonDauXml { get; set; }   // ct43 kỳ TRƯỚC — phải bằng TonDau
        public int V1 { get; set; }
        public int R1 { get; set; }
        public int V2 { get; set; }
        public int R2 { get; set; }
        public int V3 { get; set; }
        public int R3 { get; set; }
        public decimal? TonCuoi { get; set; }     // ct43 kỳ này, từ DB
        public decimal? TonXml { get; set; }      // ct43 từ XML cổng trả — CHƯA CÓ
        public decimal? Lech { get; set; }        // TonCuoi − TonXml, null khi chưa có XML
        public bool CoToKhai { get; set; }        // kỳ này đã lập tờ khai chưa
        public string? Mau01 { get; set; }
        public int SoHdSo { get; set; }
        public bool LechTonDau => TonDau != null && TonDauXml != null
                               && TonDau != TonDauXml;
        public bool LechTonCuoi => Lech != null && Lech != 0;
    }
}
