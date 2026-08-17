namespace KT2000.Api.Models
{
    // ======================== BÁO CÁO TỒN KHO (SPEC-BAO-CAO-TON-KHO) ========================
    //
    // TRẠNG THÁI DỮ LIỆU lúc viết (17/08/2026) — đọc trước khi tin vào con số nào:
    //   • gia_von TRỐNG SẠCH: 0/2.991 dòng của HOA_SANG_2026 có giá trị → mọi cột GT ra 0.
    //     Số chỉ đúng sau khi engine giá thành (SPEC riêng, chưa viết) chạy.
    //   • ma_hang mới chỉ có 'H0' (mã tạm "chi phí khác") hoặc NULL → grid gom về một dòng.
    //     Sẽ tách ra khi chức năng định khoản gán mã hàng thật.
    //   • TON_KHO thang=0 chưa có dòng nào (WP-08 Chuyển năm chưa chạy) → tồn đầu năm = 0.
    // Chốt Trường 17/08: dựng form + logic trước, kiểm đúng/sai sau khi có định khoản.

    /// <summary>
    /// Điều kiện lọc dùng chung cho MỌI hàm tồn kho (spec 3.1). Nhu cầu lọc mới về sau
    /// = thêm field vào đây, KHÔNG nối thêm tham số vào từng hàm.
    /// </summary>
    public class TonKhoQuery
    {
        /// <summary>1–12 là tháng; 13 = cả năm (BR-BC-02).</summary>
        public int Thang { get; set; } = 13;
        /// <summary>null/rỗng = mọi mặt hàng. Một phần tử = một mặt hàng (viên gạch A8).</summary>
        public List<string>? MaHang { get; set; }
        /// <summary>null = toàn tập K (mọi TK có cờ ton_kho).</summary>
        public List<string>? MaTk { get; set; }
        public bool IncludeLoLai { get; set; }
        public bool IncludePhaiSua { get; set; }
    }

    // Một dòng của grid TRÊN: một cặp (TK kho × mặt hàng).
    // KHÔNG có dòng tiêu đề nhóm, dòng cộng, cột định dạng — BR-BC-09, grid tự dựng.
    public class TonKhoTongHopRow
    {
        public string MaTk { get; set; } = "";
        public string MaHang { get; set; } = "";
        public string? TenHang { get; set; }
        public string? MaNh { get; set; }
        // Chưa có bảng DM_NH trong KT2000_Base (kiểm 17/08) nên chưa tra được tên nhóm.
        // Giữ field để hợp đồng API không phải đổi khi bảng đó ra đời.
        public string? TenNh { get; set; }
        public string? MaNgan { get; set; }
        // quy_cach lấy từ DÒNG hóa đơn chứ không từ DM_HANG: danh mục không có cột này.
        public string? QuyCach { get; set; }

        public decimal SlTd { get; set; }   // tồn đầu — BR-BC-04
        public decimal GtTd { get; set; }
        public decimal SlNo { get; set; }   // phát sinh trong kỳ — BR-BC-03
        public decimal GtNo { get; set; }
        public decimal SlCo { get; set; }
        public decimal GtCo { get; set; }
        public decimal SlTc { get; set; }   // tồn cuối — BR-BC-05
        public decimal GtTc { get; set; }

        /// <summary>Đơn giá dòng nhập mua gần nhất trong kỳ; không nhập thì gt_td / sl_td.</summary>
        public decimal GiaNhap { get; set; }
        /// <summary>BR-BC-08, chỉ tính khi IncludeLoLai.</summary>
        public decimal LoLai { get; set; }
        /// <summary>BR-BC-10. Cột HOA_DON_LINE.phai_sua CHƯA TỒN TẠI → luôn false.</summary>
        public bool PhaiSua { get; set; }
        /// <summary>Ngày nhập gần nhất của mặt hàng CÓ nhập mà KHÔNG bán trong kỳ (llNgayPS).</summary>
        public DateTime? NgayPs { get; set; }
    }

    /// <summary>
    /// Kết quả endpoint tổng hợp. Bọc thêm cờ giá vốn thay vì trả thẳng mảng — BR-BC-11.
    /// </summary>
    public class TonKhoKetQua
    {
        public List<TonKhoTongHopRow> Rows { get; set; } = new();
        /// <summary>
        /// BR-BC-11. Chưa có chỗ lưu trong DB (chốt Trường 17/08: đợt này không đụng schema),
        /// nên LUÔN false. Bật lên khi engine giá thành có bảng cờ của riêng nó.
        /// </summary>
        public bool CanTinhLaiGia { get; set; }
    }

    // Một dòng của grid DƯỚI — phát sinh của một mặt hàng (spec 3.4).
    public class TonKhoChiTietRow
    {
        public DateTime? NgayNh { get; set; }
        public string? TenKh { get; set; }
        /// <summary>Ghép theo luật VFP: rỗng SoHD → số phiếu; có SoHD → "SoHD (số phiếu)".</summary>
        public string? SoHd { get; set; }
        public string MaHd { get; set; } = "";
        public decimal SlNo { get; set; }
        public decimal GtNo { get; set; }
        public decimal SlCo { get; set; }
        public decimal GtCo { get; set; }
        public string? GhiNo { get; set; }
        public string? GhiCo { get; set; }
        public decimal DonGia { get; set; }
        public decimal GiaVon { get; set; }
        public string? Dvt { get; set; }
        public decimal SlQd { get; set; }
        public decimal DgQd { get; set; }
        public string? GhiChu { get; set; }
        public bool PhaiSua { get; set; }
    }

    // Tồn của một mặt hàng tính đến một NGÀY bất kỳ — viên gạch cho nghiệp vụ tách khuyến mại.
    public class TonDenNgayRow
    {
        public string MaHang { get; set; } = "";
        public string? TenHang { get; set; }
        public decimal SoLuong { get; set; }
    }

    // Mặt hàng có số dư lũy kế ÂM giữa chừng — nguồn cho nút "Test" của spec Chỉnh kho.
    // CHỈ ĐỌC (BR-BC-01): phần dời ngay_nh nằm hoàn toàn ở spec kia.
    public class HangAmRow
    {
        public string MaHang { get; set; } = "";
        public string? TenHang { get; set; }
        public string MaTk { get; set; } = "";
        /// <summary>Ngày ĐẦU TIÊN số dư lũy kế xuống âm.</summary>
        public DateTime? NgayAmDauTien { get; set; }
        /// <summary>Số dư tại thời điểm âm đầu tiên (số âm).</summary>
        public decimal SoDuKhiAm { get; set; }
        /// <summary>Mã hóa đơn của chính dòng làm số dư xuống âm.</summary>
        public string? MaHdGayAm { get; set; }
    }
}
