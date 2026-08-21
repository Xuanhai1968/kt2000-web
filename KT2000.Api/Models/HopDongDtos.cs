namespace KT2000.Api.Models
{
    // Một nhân sự của đơn vị — ánh xạ NHAN_SU trong database đơn vị-năm.
    // Tên thuộc tính giữ theo tên cột (lối "giữ tên cột VFP" của repo) để đối chiếu
    // tay với bảng không phải dịch tên qua lại.
    public class NhanSuDto
    {
        public int Id { get; set; }
        public string? MaNs { get; set; }
        public string HoTen { get; set; } = "";
        public DateTime? NgaySinh { get; set; }
        public string? GioiTinh { get; set; }
        public string? QuocTich { get; set; }
        public string? SoCmnd { get; set; }
        public DateTime? NgayCap { get; set; }
        public string? NoiCap { get; set; }
        public string? DiaChi { get; set; }
        public string? DienThoai { get; set; }
        public string? Email { get; set; }
        public string? SoBhxh { get; set; }
        public string? MstNs { get; set; }
        public string? NgheNghiep { get; set; }
        public string? ChucDanh { get; set; }
        public string? ChucVu { get; set; }
        public string? BoPhan { get; set; }
        public bool DangLam { get; set; } = true;
        public DateTime? NgayVao { get; set; }
        public DateTime? NgayNghi { get; set; }
        public string? GhiChu { get; set; }

        // Số hợp đồng đã ký — cột tính sẵn cho lưới danh sách, không có trong bảng.
        public int SoHopDong { get; set; }
    }

    // Một dòng trên lưới CHỌN ĐƠN VỊ của màn Hợp đồng. Đếm nhân sự và hợp đồng của
    // từng đơn vị để kế toán nhìn là biết đơn vị nào đã nhập, đơn vị nào còn trống.
    public class DonViHopDongDto
    {
        public string MaDonVi { get; set; } = "";
        public string? TenDonVi { get; set; }
        public string? Mst { get; set; }

        public int SoNhanSu { get; set; }
        public int SoHopDong { get; set; }

        /// <summary>
        /// Đơn vị chưa mở năm làm việc thì không có database để đếm. Cờ này để lưới hiện
        /// "chưa mở năm" thay vì số 0 — hai tình huống đó khác hẳn nhau: một bên là chưa
        /// nhập ai, một bên là chưa vào xem được.
        /// </summary>
        public bool ChuaMoNam { get; set; }

        /// <summary>
        /// Đã mở năm nhưng database CHƯA CÓ 4 bảng của module Hợp đồng + Lương.
        ///
        /// Từ 21/08 module này không còn dựng tự động cho mọi database (xem
        /// VaCauTrucService.CAC_BAN_VA) — phải vào Quản trị -> Mở năm làm việc, tích đơn
        /// vị rồi bấm "Tạo bảng Hợp đồng + Lương".
        ///
        /// Tách hẳn khỏi ChuaMoNam vì hai tình trạng cần hai cách chữa khác nhau; gộp
        /// làm một thì người dùng đi mở năm cho đơn vị đã mở năm rồi mà vẫn không được.
        /// </summary>
        public bool ChuaTaoBang { get; set; }
    }

    // Một hợp đồng lao động — ánh xạ HOP_DONG trong database đơn vị-năm.
    public class HopDongDto
    {
        public int Id { get; set; }
        public int NhanSuId { get; set; }

        public string? SoHd { get; set; }
        public DateTime? NgayKy { get; set; }
        public string? LoaiHd { get; set; }
        public DateTime? TuNgay { get; set; }
        public DateTime? DenNgay { get; set; }

        public string? DiaDiemLv { get; set; }
        public string? CongViec { get; set; }
        public string? ThoiGianLv { get; set; }
        public string? PhuongTien { get; set; }

        public decimal? LuongChinh { get; set; }
        public decimal? PcAnCa { get; set; }
        public decimal? PcDienThoai { get; set; }
        public decimal? PcXangXe { get; set; }
        public decimal? PcKhac { get; set; }

        public string? HinhThucTra { get; set; }
        public string? BaoHoLd { get; set; }
        public string? ThoaThuan { get; set; }

        public string? NsdldHoTen { get; set; }
        public string? NsdldChucVu { get; set; }
        public string? NsdldDaiDien { get; set; }
        public string? NsdldDiaChi { get; set; }

        public string? TrangThai { get; set; }
        public string? GhiChu { get; set; }

        // Thông tin người lao động, ghép từ NHAN_SU khi đọc — form in cần một lượt
        // là đủ dữ liệu, khỏi gọi thêm một vòng nữa chỉ để lấy tên.
        public string? HoTen { get; set; }
        public DateTime? NgaySinh { get; set; }
        public string? SoCmnd { get; set; }
        public string? QuocTich { get; set; }
        public string? NgheNghiep { get; set; }
        public string? ChucDanh { get; set; }
    }

    // ===================== NHÁP NHẬP EXCEL (đọc rồi mới lưu) =====================
    //
    // Nhập Excel trước đây GHI THẲNG vào sổ ngay lúc đọc file. Đổi thành hai nhịp:
    // `nhap-excel/doc` đọc ra nháp (KHÔNG chạm DB) -> kế toán soát trên màn -> bấm
    // Lưu thì `nhap-excel/luu` mới ghi. Cùng nhịp với đường Chấm công / Bảng lương
    // đã làm sẵn (xem ChamCongController.NhapExcelChamCong -> ccLuu).
    //
    // VÌ SAO: ghi thẳng thì file sai đơn vị / sai sheet / trùng người đã nằm trong sổ
    // rồi mới biết, mà xóa ra thì phải gỡ cả HOP_DONG trỏ vào. Soát trước rẻ hơn nhiều.

    /// <summary>Một dòng chấm công của nháp — kèm tên để hiện lưới khi CHƯA có nhân sự id.</summary>
    public class NhapChamCongThangDto
    {
        public int Thang { get; set; }
        public List<ChamCongDto> Dong { get; set; } = new();
    }

    /// <summary>Một tháng bảng lương của nháp.</summary>
    public class NhapBangLuongThangDto
    {
        public int Thang { get; set; }
        public List<BangLuongDto> Dong { get; set; } = new();
    }

    /// <summary>
    /// Nháp đọc từ MỘT file Excel. Frontend giữ nguyên vật này rồi gửi lại y hệt khi
    /// bấm Lưu — server không phải nhớ gì giữa hai lần gọi (không session, không file
    /// tạm), nên bấm Lưu sau bao lâu cũng được và nhiều người nhập song song không đụng nhau.
    /// </summary>
    public class NhapNhapDto
    {
        /// <summary>Tên file gốc — để hiện trên bảng kết quả và khi báo lỗi.</summary>
        public string TenFile { get; set; } = "";

        /// <summary>Loại file server đoán được: HopDong | DanhSachNhanSu | ChamCong | BangLuong | LuongCaNam.</summary>
        public string Loai { get; set; } = "";

        public string? Sheet { get; set; }
        public string? TenDonViFile { get; set; }
        public string? MaDonViFile { get; set; }
        public string? CanhBaoDonVi { get; set; }
        public bool DungDonVi { get; set; }

        /// <summary>Ngày công chuẩn dùng khi đọc bảng lương (BR-BL-01).</summary>
        public decimal NgayCongChuan { get; set; }

        /// <summary>Nhân sự + hợp đồng đọc từ HĐLĐ hoặc DS_NV.</summary>
        public List<NhapNguoiDto> Nguoi { get; set; } = new();

        public List<NhapChamCongThangDto> ChamCong { get; set; } = new();
        public List<NhapBangLuongThangDto> BangLuong { get; set; } = new();

        /// <summary>Dòng bỏ qua kèm lý do — hiện cảnh báo, không chặn Lưu.</summary>
        public List<DongBoDto> Bo { get; set; } = new();
    }

    /// <summary>
    /// Một người trong nháp, kèm các hợp đồng của người đó đọc được từ file.
    /// Khớp người theo TÊN đã chuẩn hóa lúc lưu — cùng luật với mọi đường nhập khác.
    /// </summary>
    public class NhapNguoiDto
    {
        public NhanSuDto NhanSu { get; set; } = new();
        public List<HopDongDto> HopDong { get; set; } = new();
    }
}
