namespace KT2000.Api.Models
{
    // Một dòng chấm công = (nhân sự, tháng) — BR-CC-01. 31 ô ngày nằm ngang.
    //
    // Ngay là MẢNG 31 phần tử chứ không 31 thuộc tính rời như bảng DB: JSON gửi lên
    // lưới sẽ gọn hơn hẳn, và frontend duyệt bằng index thay vì gõ ngay01..ngay31.
    // Service tự trải ra 31 cột khi ghi xuống DB.
    public class ChamCongDto
    {
        public int Id { get; set; }
        public int NhanSuId { get; set; }
        public int Thang { get; set; }

        /// <summary>31 ký hiệu, index 0 = ngày 1. Null/rỗng = chưa chấm.</summary>
        public string?[] Ngay { get; set; } = new string?[31];

        public decimal? TongCong { get; set; }
        public decimal? CongThemGio { get; set; }
        public string? GhiChu { get; set; }

        // Ghép từ NHAN_SU khi đọc — lưới cần tên và chức vụ ngay, khỏi gọi thêm vòng nữa
        public string? HoTen { get; set; }
        public string? ChucDanh { get; set; }
        public string? BoPhan { get; set; }
    }

    // Một dòng bảng thanh toán lương = (nhân sự, tháng).
    public class BangLuongDto
    {
        public int Id { get; set; }
        public int NhanSuId { get; set; }
        public int Thang { get; set; }
        public string? BoPhan { get; set; }

        // BR-BL-01 — tham số của TỪNG bảng, không phải hằng số
        public decimal NgayCongChuan { get; set; }
        public decimal? NgayCongTt { get; set; }

        public decimal? LuongChinh { get; set; }
        public decimal? LuongThucTe { get; set; }

        public decimal? PcAnCa { get; set; }
        public decimal? PcDienThoai { get; set; }
        public decimal? PcXangXe { get; set; }
        public decimal? PcChuyenCan { get; set; }
        public decimal? PcHieuQua { get; set; }
        public decimal? TienThuong { get; set; }
        public decimal? TongPhuCap { get; set; }

        public decimal? TongLuong { get; set; }

        public decimal? TamUng { get; set; }
        public decimal? KhauTruBh { get; set; }
        public decimal? ThueTncn { get; set; }
        public decimal? TongKhauTru { get; set; }
        public decimal? ThucLinh { get; set; }

        public string? GhiChu { get; set; }

        // Ghép từ NHAN_SU khi đọc
        public string? HoTen { get; set; }
        public string? ChucDanh { get; set; }
    }

    // ===================== NHẬP TỪ FILE EXCEL =====================
    // Kết quả đọc file: dòng khớp được nhân sự thì vào Dong, còn lại vào Bo kèm lý do.
    // Trả CẢ HAI về frontend chứ không im lặng bỏ dòng lỗi: kế toán phải thấy ngay
    // "file 12 dòng, nhận 10, bỏ 2 vì không có ai tên đó" thay vì lưới thiếu người mà
    // không biết vì sao.
    public class KetQuaNhapDto<T>
    {
        /// <summary>Dòng đọc được và khớp nhân sự trong sổ.</summary>
        public List<T> Dong { get; set; } = new();

        /// <summary>Dòng bỏ qua, kèm lý do — hiện thành cảnh báo trên màn.</summary>
        public List<DongBoDto> Bo { get; set; } = new();

        /// <summary>Tên sheet đã đọc — file lương có 26 sheet, phải nói rõ lấy sheet nào.</summary>
        public string? Sheet { get; set; }

        /// <summary>Tên đơn vị đọc được ở đầu file (ô A1), null nếu không thấy.</summary>
        public string? TenDonViFile { get; set; }

        /// <summary>
        /// Mã đơn vị suy ra từ tên trong file. Null khi không suy được — KHÔNG dùng để
        /// mở database (luật #1: chỉ TenantDbResolver sinh tên DB), chỉ để đối chiếu.
        /// </summary>
        public string? MaDonViFile { get; set; }

        /// <summary>
        /// Cảnh báo về đơn vị: file của đơn vị khác, không đọc được tên, hoặc tên khớp
        /// nhiều đơn vị. Null = khớp đúng đơn vị đang mở.
        /// </summary>
        public string? CanhBaoDonVi { get; set; }

        /// <summary>
        /// File có phải của ĐÚNG đơn vị đang mở không. False thì frontend chặn nút Lưu:
        /// ghi lương của đơn vị khác vào sổ này là sai không cứu được.
        /// </summary>
        public bool DungDonVi { get; set; }

        /// <summary>File gốc là .xls đã tự chuyển sang .xlsx để đọc — chỉ để báo cho vui.</summary>
        public bool DaChuyenXls { get; set; }

        /// <summary>Số nhân sự đã ghi vào sổ (chỉ đường nhập HĐLĐ, đường khác để 0).</summary>
        public int SoNhanSu { get; set; }

        /// <summary>Số hợp đồng đã ghi vào sổ.</summary>
        public int SoHopDong { get; set; }

        /// <summary>Gắn số đã ghi rồi trả về chính nó — cho controller viết gọn một dòng.</summary>
        public KetQuaNhapDto<T> KemSo(int soNhanSu, int soHopDong)
        {
            SoNhanSu = soNhanSu;
            SoHopDong = soHopDong;
            return this;
        }
    }

    public class DongBoDto
    {
        /// <summary>Số dòng trong file Excel — kế toán mở file dò đúng chỗ.</summary>
        public int Dong { get; set; }
        public string? HoTen { get; set; }
        public string LyDo { get; set; } = "";
    }
}
