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
        // Định khoản riêng phần THUẾ (cột ghi_no_vat / ghi_co_vat). Là SỐ HIỆU TÀI
        // KHOẢN — RA ghi Nợ 131 / Có 3331, VAO ghi Nợ 1331 / Có 331 — nên kiểu string
        // như GhiNo/GhiCo, dù cột dưới DB khai DECIMAL(18,2) theo lối VFP cũ.
        // Đơn vị chưa định khoản VAT thì null (TUAN_NGA_2025 trống toàn bộ).
        public string? GhiNoVat { get; set; }
        public string? GhiCoVat { get; set; }
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

    // ============ TỜ KHAI GÕ TAY (lưu thẳng vào bảng TOKHAI) ============
    //
    // Dùng cho đơn vị CHƯA CÓ HÓA ĐƠN trong sổ nhưng vẫn phải nộp tờ khai — kế toán
    // gõ tay chỉ tiêu rồi lưu, để kỳ sau tự lấy được ct22 (BR-TK-02).
    //
    // Khác ToKhaiGtgtDto ở chỗ đây là dữ liệu NGƯỜI DÙNG NHẬP, không kèm cảnh báo hay
    // nhóm thuế suất — những thứ đó chỉ có nghĩa khi tờ khai được TÍNH từ sổ.
    public class ToKhaiTayDto
    {
        public string MaDonVi { get; set; } = "";
        public int Nam { get; set; }
        public int Thang { get; set; }
        /// <summary>0 = tờ khai chính thức, 1+ = bổ sung lần thứ mấy.</summary>
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

        /// <summary>
        /// Bộ 26 tham số SQL của các chỉ tiêu. Gom một chỗ để câu MERGE khỏi liệt kê
        /// 26 dòng AddWithValue — thêm/bớt chỉ tiêu chỉ phải sửa đúng đây.
        /// </summary>
        public IEnumerable<(string Ten, object Gia)> ChiTieu() => new (string, object)[]
        {
            ("@ct21", Ct21), ("@ct22", Ct22), ("@ct23", Ct23), ("@ct24", Ct24),
            ("@ct25", Ct25), ("@ct26", Ct26), ("@ct27", Ct27), ("@ct28", Ct28),
            ("@ct29", Ct29), ("@ct30", Ct30), ("@ct31", Ct31), ("@ct32", Ct32),
            ("@ct33", Ct33), ("@ct32a", Ct32a), ("@ct34", Ct34), ("@ct35", Ct35),
            ("@ct36", Ct36), ("@ct37", Ct37), ("@ct38", Ct38), ("@ct39", Ct39),
            ("@ct40a", Ct40a), ("@ct40b", Ct40b), ("@ct40", Ct40), ("@ct41", Ct41),
            ("@ct42", Ct42), ("@ct43", Ct43),
        };
    }

    // ============ MỘT DÒNG TRÊN LƯỚI "BC LẤY TỜ KHAI XML" ============
    // Danh sách tờ khai ĐÃ LƯU của cả năm — mỗi kỳ của mỗi đơn vị một dòng.
    // Tiền để nullable: kỳ chưa khai chỉ tiêu nào thì ô đó TRỐNG, không hiện 0.
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

        // ----- Số gộp từ SỔ HÓA ĐƠN (khác với số trên TỜ KHAI ở trên) -----
        // null = đơn vị chưa mở sổ năm đó, hoặc kỳ đó không có hóa đơn nào.
        public decimal? GtHdVao { get; set; }
        public decimal? GtVatVao { get; set; }
        public decimal? GtHdRa { get; set; }
        public decimal? GtVatRa { get; set; }

        // ----- Lệch = TỜ KHAI − SỔ -----
        // Đây là cột đáng nhìn nhất của lưới: khác 0 nghĩa là tờ khai khai thiếu
        // hoặc thừa so với hóa đơn thật trong sổ.
        // null = kỳ đó CHƯA khai chỉ tiêu tương ứng, không phải "lệch bằng 0".
        public decimal? LechGtHdVao { get; set; }
        public decimal? LechVatVao { get; set; }
        public decimal? LechGtHdRa { get; set; }
        public decimal? LechVatRa { get; set; }

        public string? XmlName { get; set; }
        /// <summary>
        /// Đường dẫn VẬT LÝ của file cổng trả về, đúng chỗ đã ghi trong kho
        /// ScanDocRoot1. Hiện lên lưới để kế toán mở thẳng thư mục mà kiểm.
        /// </summary>
        /// <remarks>
        /// Lấy từ cột xml_path chứ KHÔNG ghép lại từ (mã, năm, tháng): file cũ do
        /// công cụ Python nạp có thể nằm ở cây phẳng, ghép lại là ra đường dẫn
        /// không tồn tại — mà đường dẫn sai còn tệ hơn đường dẫn trống.
        /// </remarks>
        public string? XmlPath { get; set; }
        /// <summary>Đã có file XML cổng trả về = đã nộp xong, không chỉ lập trong máy.</summary>
        public bool DaNop { get; set; }
        public DateTime? NgayLap { get; set; }
        public string? NguoiLap { get; set; }
        public string? GhiChu { get; set; }
    }

    // ============ MỘT DÒNG TRÊN LƯỚI RÀ SOÁT CHÉO CỦA MDN_NB ============
    // Một đơn vị một dòng. Nguồn của từng cột xem đầu BangToKhaiService (ToKhai.cs).
    //
    // Tiền để decimal? (nullable) chứ không 0: đơn vị CHƯA lập tờ khai kỳ đó thì ô
    // phải TRỐNG. Điền 0 là nói dối — "đã khai, số bằng 0" khác hẳn "chưa khai".
    public class DongRaSoatToKhaiDto
    {
        public int Stt { get; set; }
        public string MaDonVi { get; set; } = "";
        public string? TenDonVi { get; set; }
        /// <summary>MST — để màn tạo tờ khai điền sẵn ô [05], khỏi gọi lại Master.</summary>
        public string? Mst { get; set; }

        // Kiểu kỳ của đơn vị (Tenants.KhaiQuy). Quyết định lưới đếm 1 tháng hay 3
        // tháng, và tra tờ khai ở tháng nào — xem ThangToKhai/ThangDau trong ToKhai.cs.
        public bool KhaiQuy { get; set; }
        public string? KyKeKhai { get; set; }     // '07/2026' hoặc 'Q3/2026' — hiện lên lưới

        public decimal? TonDau { get; set; }      // ct22 kỳ này
        public decimal? TonDauXml { get; set; }   // ct43 kỳ TRƯỚC — phải bằng TonDau

        // Số hóa đơn vào/ra của 3 tháng trong kỳ (đơn vị khai quý dùng đủ cả ba)
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

        // Cột "Mẫu 01" trên lưới: mã tờ khai đã nộp ('842' = mẫu 01/GTGT). Chưa có tờ
        // khai thì null — bản VFP cũ hiện -1, ở đây để trống cho thống nhất với các
        // cột tiền (xem chú thích đầu lớp).
        public string? Mau01 { get; set; }

        // Số hóa đơn đếm được trong SỔ của cả kỳ. Cột "Lệch SLHĐ" so số này với số
        // hóa đơn ghi trên tờ khai — CHƯA đối chiếu được vì tờ khai 01/GTGT không khai
        // số lượng hóa đơn, phải lấy từ bảng kê. Để dành cho lượt sau.
        public int SoHdSo { get; set; }

        // Hai chỗ cần bôi đỏ trên lưới, tính ở server để FE và mọi báo cáo khác
        // dùng chung MỘT định nghĩa "thế nào là lệch".
        public bool LechTonDau => TonDau != null && TonDauXml != null
                               && TonDau != TonDauXml;
        public bool LechTonCuoi => Lech != null && Lech != 0;
    }
}
