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
        // Tên CHUẨN đưa lên hóa đơn điện tử (Viettel). Trống = dùng luôn TenHang.
        // Hai tên vì tên kho mang ghi chú thực địa ("nắp trắng") không được lên hóa đơn thuế.
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
    }

    // BR-NB-01: DM_KH_NB là danh mục ĐỐI TƯỢNG CÔNG NỢ — khách VÀ nhân viên chung một
    // bảng, phân biệt bằng LoaiDt. Không có DTO nhân viên riêng vì không có bảng riêng.
    public class DmKhNbDto
    {
        public string? MaKh { get; set; }
        public string TenKh { get; set; } = "";
        public string LoaiDt { get; set; } = "KH";  // KH = khách hàng, NV = nhân viên
        public string? TenGiaoDich { get; set; }    // tên phục vụ NGƯỜI GIAO HÀNG
        public string? Mst { get; set; }
        public string? DiaChi { get; set; }
        public string? DienThoai { get; set; }
        public string? NguoiLienHe { get; set; }
        public string? MaKhHd { get; set; }         // BR-NB-01: khách tương ứng bên thuế
        public decimal? CongNoDau { get; set; }
        public string? GhiChu { get; set; }
        // --- 014 ---
        public string? TenTat { get; set; }
        public string? DiaChiGiao { get; set; }     // địa chỉ GIAO, khác địa chỉ trên HĐ
        // --- 018: nạp từ hệ USA_Meva cũ ---
        // Nhãn hàng đại lý này bán (-> DM_NHAN.ma_nhan). Vừa để HIỆN trên phiếu, vừa là
        // BỘ LỌC khách: 1677 khách mà gõ tên không nhớ thì lọc theo nhãn cho ngắn lại.
        public string? MaNhan { get; set; }
        public string? TenNhan { get; set; }        // đọc ra để hiện, không ghi xuống
        public string? MaTinh { get; set; }
    }

    // Ngành sơn: khách mua thùng sơn trắng rồi chọn màu trong bảng màu giấy, thợ pha
    // theo mã. Bảng có ~1131 dòng nên ô chọn màu phải tìm theo mã/nhóm/ghi chú.
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
        public string? TenHang { get; set; }
        public string? Dvt { get; set; }
        public decimal SoLuong { get; set; }
        public decimal DonGia { get; set; }
        // ThanhTien/TienVatL do backend tính lại lúc lưu — gửi lên cũng bị ghi đè
        public decimal ThanhTien { get; set; }
        public decimal PtVat { get; set; }
        public decimal TienVatL { get; set; }
        public string? GhiChu { get; set; }
        // Hệ số chốt tại thời điểm lập đơn: đổi hệ số trong danh mục về sau không
        // được làm sai lệch số lượng quy đổi của đơn đã lưu.
        public decimal? HeSoQd { get; set; }
        public decimal? SlQuyDoi { get; set; }
        public bool LaHangTang { get; set; }
        public string? QuyCach { get; set; }
        // Mã màu khách yêu cầu pha (-> DM_MAU.ma_mau). Trống = bán nguyên trạng.
        // Lưu chuỗi chứ không phải khóa ngoại: mã in trên phiếu là sự thật lịch sử,
        // sửa danh mục màu về sau không được làm biến hình đơn đã in (script 019).
        public string? MaMau { get; set; }
        // Tiền công pha màu CỦA CẢ DÒNG — cộng thẳng vào thành tiền, KHÔNG nhân số
        // lượng (đúng công thức bản gốc USA_Meva: sl × đơn giá + tiền tinh màu).
        public decimal TienTinhMau { get; set; }
        // Mã hex đọc kèm từ DM_MAU để tô ô chọn màu trên lưới. Chỉ ĐỌC RA.
        public string? MaHex { get; set; }
        // BR-NB-07: mốc rời kho của RIÊNG dòng này (đơn giao nhiều đợt).
        // Để trống thì engine lấy NgayNh của đơn.
        public DateTime? NgayNhL { get; set; }
    }

    // Đơn hàng = HOA_DON. Tên trường theo cột khuôn chung, KHÔNG bịa tên mới:
    //   MaHd  = SỐ ĐƠN hiển thị/in, kiểu V125 / R236 (chốt 9.7)
    //   NgayNh = ngày hàng THẬT SỰ rời kho (BR-NB-07) — mốc trừ tồn, KHÔNG phải ngày tạo
    // SoHd/Khhd cố tình KHÔNG có mặt: với NB chúng vô nghĩa và luôn trống (SPEC mục 4).
    public class DonNbDto
    {
        public string? MaHd { get; set; }          // để trống khi lập đơn mới
        public DateTime? Ngay { get; set; }        // ngày lập đơn
        public DateTime? NgayNh { get; set; }      // ngày xuất kho thật (BR-NB-07)
        public string? MaKh { get; set; }
        public string? TenKh { get; set; }         // nguyên văn lúc lập đơn
        public string? Mst { get; set; }
        public string? DiaChi { get; set; }        // địa chỉ CỬA HÀNG của khách
        // Địa chỉ GIAO khi khách muốn chở tới chỗ khác (kho, công trình).
        // Trống = giao đúng địa chỉ cửa hàng. Lưu xuống đơn chứ không đọc sống từ danh
        // mục: khách đổi địa chỉ sang năm thì đơn cũ in lại vẫn ra đúng chỗ đã giao.
        public string? DiaChiGiao { get; set; }
        public string? MaNvkd { get; set; }        // -> DM_KH_NB (loai_dt='NV')
        public string? MaNvvc { get; set; }        // -> DM_KH_NB (loai_dt='NV')
        public string? MaGoi { get; set; }         // BR-NB-08: thuộc gói nào
        public string? GhiChu { get; set; }
        public decimal TienHang { get; set; }
        public decimal TienVat { get; set; }
        public decimal TongTien { get; set; }
        public string TthaiHd { get; set; } = "nhap";
        // VAO = đơn nhập, RA = đơn giao. Cột TÍNH của HOA_DON, suy từ ma_hd nên chỉ
        // ĐỌC RA — màn hình tổng hợp chứng từ cần nó để dán nhãn từng dòng.
        public string? Huong { get; set; }
        // Tên người đọc từ DM_KH_NB để hiện lên lưới — chỉ ĐỌC RA, không ghi xuống
        public string? TenNvkd { get; set; }
        public string? TenNvvc { get; set; }
        // Nhãn hàng của KHÁCH (JOIN DM_KH_NB -> DM_NHAN), để in lên phiếu. Chỉ ĐỌC RA.
        // Đọc sống nên khách đổi nhãn thì đơn cũ in ra mang nhãn mới — chấp nhận được vì
        // nhãn là thuộc tính của đại lý, không phải của lần giao hàng. Muốn chốt cứng
        // theo thời điểm bán thì phải thêm cột ma_nhan vào HOA_DON.
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
        // Hệ số đóng gói ĐỌC SỐNG từ DM_HANG_NB (không chốt vào snapshot): dùng để tách
        // cột Thùng / Lẻ trên phiếu gói. Trống = mặt hàng chưa khai quy đổi, khi đó dồn
        // hết vào cột Lẻ (đúng cách Hoa_Sang xử lý SP một đơn vị).
        public decimal? HeSoLon { get; set; }
        public string? DvtLon { get; set; }
        // Trị giá gộp của mặt hàng trong gói — CHỐT vào snapshot lúc chốt gói (tiền của
        // chuyến này, sửa giá danh mục về sau không làm biến hình phiếu đã in).
        public decimal? TriGia { get; set; }
        // Giá niêm yết hiện tại, đọc SỐNG từ DM_HANG_NB.gia_ban. Cột "G.chuẩn" là giá
        // NÊN bán nên phải lấy giá đang niêm yết, không phải giá lúc chốt gói.
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
        // Nhãn nguồn hiện trên danh sách gợi ý:
        //   "da_co_ma"  — nguồn A: dòng HOA_DON_LINE hướng VAO đã gán ma_hang
        //   "ten_tren_hd" — nguồn B: ten_hang_goc chưa gán mã (hàng mới mua chưa làm kho)
        public string Nguon { get; set; } = "";
        public int Nam { get; set; }               // năm sổ thuế tìm thấy dòng này
    }
}
