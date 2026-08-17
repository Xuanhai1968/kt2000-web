using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Configuration;
using System.Globalization;
using KT2000.Api.Models;

namespace KT2000.Api.Services
{
    /// <summary>
    /// Đơn vị chưa có database của năm đang chọn. Là tình huống NGHIỆP VỤ bình thường
    /// (chưa mở năm làm việc), không phải lỗi hệ thống — nên controller trả 409 kèm lời
    /// nhắn đọc được, thay vì để nguyên 500 với stack trace.
    /// </summary>
    public class SoChuaMoException : Exception
    {
        public SoChuaMoException(string message) : base(message) { }
    }

    // Đọc sổ THUẾ: bảng HOA_DON / HOA_DON_LINE trong database ĐƠN VỊ-NĂM.
    //
    // Phục vụ màn Hóa đơn GTGT đầu vào / đầu ra của đơn vị thuế thường. Trước đây
    // màn này đọc XML còn nằm trong raw\ qua /admin/raw-files — sai nguồn: XML bị
    // dọn đi ngay sau khi nạp vào DB, nên đơn vị đã crawl xong thì raw\ rỗng và màn
    // hình trắng, trong khi DB có đủ dữ liệu.
    //
    // CHỈ ĐỌC. Ghi vào HOA_DON vẫn đi qua ImportService như cũ.
    //
    // Vì sao SqlClient thẳng chứ không EF: bảng nằm trong database đơn vị-năm, tên
    // chỉ biết lúc chạy qua TenantDbResolver. Cùng lý do với NoiBoService.
    //
    // MỌI câu lệnh đều tham số hóa; tên bảng/cột là hằng trong code.
    public class ThueService
    {
        private readonly TenantDbResolver _resolver;
        private readonly IConfiguration _config;

        public ThueService(TenantDbResolver resolver, IConfiguration config)
        {
            _resolver = resolver;
            _config = config;
        }

        // Database đơn vị-năm CÓ THỂ CHƯA TỒN TẠI: Master khai FiscalYears cho một năm
        // nhưng database năm đó chưa được tạo (MDN_NB có năm 2026 trong Master mà không
        // có MDN_NB_2026 — bắt gặp 13/08). Khi đó SqlClient ném lỗi 4060 kèm nguyên
        // stack trace 500, người dùng chỉ thấy màn hình vỡ mà không hiểu vì sao.
        //
        // Bắt riêng 4060 và đổi thành thông điệp nói rõ phải làm gì. Không tự tạo
        // database ở đây: tạo DB là việc của AdminService (luật 10 — vùng lõi chung),
        // và một endpoint CHỈ ĐỌC thì không được phép sinh ra database.
        private async Task<SqlConnection> OpenAsync(string code, int year)
        {
            var conn = new SqlConnection(_resolver.GetTenantConnection(code, year));
            try
            {
                await conn.OpenAsync();
                return conn;
            }
            catch (SqlException ex) when (ex.Number is 4060 or 911)
            {
                conn.Dispose();
                throw new SoChuaMoException(
                    $"Đơn vị {code} chưa có sổ của năm {year}. "
                    + "Vào Quản trị -> Đơn vị để mở năm làm việc này trước khi xem sổ thuế.");
            }
        }

        // ===================== CHỈ ĐỌC CỘT CỦA SỔ THUẾ =====================
        // HOA_DON "chuẩn" của sổ thuế kết thúc ở cột huong (41 cột). Các cột ma_nvkd /
        // ma_nvvc / ma_goi trên HOA_DON và he_so_qd / sl_quy_doi / la_hang_tang / ngay_nh_l
        // trên HOA_DON_LINE là của NỘI BỘ, do script 015 gắn thêm vào bảng dùng chung.
        //
        // Màn này là màn THUẾ nên KHÔNG đọc mấy cột đó: vừa sai ranh giới hai sổ, vừa nổ
        // "Invalid column name" trên DB thuần thuế (TUAN_NGA_2025, HUY_THANH_2025/2026 chưa
        // chạy 015). Giữ SELECT trong phạm vi cột chuẩn thì mọi DB đơn vị đều chạy được.

        // Gộp từ HOA_DON_LINE: tiền hàng, số dòng, thuế suất đại diện. Dùng OUTER APPLY
        // thay vì JOIN + GROUP BY để không phải nhóm lại toàn bộ ~40 cột của HOA_DON.
        //
        // MỘT biểu thức tiền hàng DUY NHẤT, dùng chung cho câu chọn hóa đơn và câu đối
        // chiếu. Trước đây câu chọn tính SUM(so_luong × don_gia) thuần nên CỘNG luôn dòng
        // chiết khấu thay vì trừ — cột Tiền HĐ vống lên đúng HAI LẦN số chiết khấu.
        //   Ca thật HOA_SANG 1C26THT/0002601 (15/08): hiện 19.207.500,05 trong khi đúng là
        //   18.542.500,05; kiểm chéo 1.483.400 ÷ 8% = 18.542.500 — khớp con số đúng.
        // Giữ hai công thức song song là tái lập đúng cái vênh vừa sửa, nên gom về đây.
        //
        // Đảo dấu dòng chiết khấu (tinh_chat = 3) rồi trừ tiếp chiết khấu của dòng.
        // Ngoại lệ hóa đơn TOÀN dòng chiết khấu thì KHÔNG đảo dấu — xem
        // ImportService.TongTienHangTuLine để biết vì sao từng bước.
        //
        // KHÁC ImportService một điểm, cố ý: ở đây KHÔNG làm tròn từng dòng. Bên kia làm
        // tròn vì nó KIỂM số của mình với số cổng khai, mà cổng làm tròn từng dòng khi in
        // hóa đơn. Còn đây là số ĐEM HIỆN cho kế toán, nên phải đúng bằng tổng thật.
        //   Ca 1C26THT/0002601: làm tròn ra 18.542.499, không làm tròn ra 18.542.500,05 —
        //   hóa đơn giấy ghi 18.542.500, lệch 1đ là thứ kế toán sẽ hỏi mà không ai giải
        //   thích nổi. Chênh lệch giữa hai cách luôn dưới vài đồng nên không đủ chạm
        //   ngưỡng 10đ của cột Lệch.
        //
        // Đo 15/08 trên HOA_SANG_2026 + HUY_THANH_2026: 44 hóa đơn có chiết khấu, KHÔNG
        // cái nào khai chiết khấu chỉ ở master — luôn có dòng TC=3 hoặc tien_ck ở dòng.
        // Nên chỉ cần đọc dòng là đủ, không phải đụng tới h.tien_ck.
        private const string SqlGopTuLine = @"
              OUTER APPLY (
                    SELECT SUM(ISNULL(x.so_luong, 0) * ISNULL(x.don_gia, 0))
                               AS tong_duong,
                           SUM(ISNULL(x.so_luong, 0) * ISNULL(x.don_gia, 0)
                               * CASE WHEN x.tinh_chat = 3 THEN -1 ELSE 1 END)
                               AS tong_co_dau,
                           SUM(ISNULL(x.tien_ck, 0)) AS ck,
                           SUM(CASE WHEN ISNULL(x.tinh_chat, 0) <> 3 THEN 1 ELSE 0 END)
                               AS dong_khac_ck,
                           COUNT(*) AS so_dong,
                           -- Thuế suất ĐẠI DIỆN của hóa đơn, để lùi về khi h.vat trống.
                           -- MAX chứ không phải dòng đầu: hóa đơn lẫn 8% với KCT (-2) thì
                           -- phải hiện 8, không phải -2. Hóa đơn nhiều thuế suất thật
                           -- (8 và 10) sẽ hiện số lớn hơn — cột %VAT của cả hóa đơn vốn
                           -- chỉ là số đại diện, muốn chính xác phải nhìn dòng.
                           -- CAST bắt buộc: pt_vat là INT ở database đã chạy bản vá 020,
                           -- nhưng vẫn là DECIMAL(18,3) ở database chưa nạp lần nào (bản
                           -- vá chỉ chạy lúc NẠP). Không ép kiểu thì GetInt32 ném
                           -- InvalidCastException và cả màn danh sách trả 500 — mà chỉ ở
                           -- đúng những đơn vị chưa nạp, nên rất dễ tưởng là đã hết lỗi.
                           CAST(MAX(x.pt_vat) AS INT) AS pt_vat_line
                      FROM HOA_DON_LINE x
                     WHERE x.ma_hd = h.ma_hd
              ) s";

        private const string SqlTienHang = @"
                   CASE WHEN s.dong_khac_ck = 0 THEN ISNULL(s.tong_duong, 0)
                                                ELSE ISNULL(s.tong_co_dau, 0) END
                       - ISNULL(s.ck, 0)";

        private const string SqlChonHoaDon = @"
            SELECT h.ma_hd, h.huong, h.ngay, h.ngay_nh, h.thang, h.khhd, h.so_hd,
                   h.mst, h.ten_kh, h.dia_chi, h.nguoi_giao_dich, h.so_ptc,
                   h.ma_tv, h.ten_tv,
                   " + SqlTienHang + @" AS tien_hang,
                   ISNULL(h.tien_vat, 0)   AS tien_vat,
                   ISNULL(h.tien_ck, 0)    AS tien_ck,
                   ISNULL(s.so_dong, 0)    AS so_dong,
                   h.ghi_no, h.ghi_co, h.ma_ct_no, h.ma_ct_co, h.ghi_chu, h.tthai_hd,
                   h.tich_chat_hd_lienquan, h.loai_hd_lienquan, h.mau_so_hd_lienquan,
                   h.khhd_lienquan, h.sohd_lienquan, h.ngay_lienquan,
                   h.trang_thai_hd_lien_quan,
                   -- Định khoản phần THUẾ, cho hai cột Nợ VAT / Có VAT của lưới.
                   -- Là TÀI KHOẢN chứ không phải tiền, dù cột khai DECIMAL(18,2) —
                   -- di sản VFP. Đo dữ liệu thật 14/08/2026: RA ghi 131/3331, VAO ghi
                   -- 1331/331; THAI_TUAN_2026 có 1184/1258 dòng, còn TUAN_NGA_2025
                   -- trống sạch 0/60 (sổ cũ chưa định khoản phần thuế).
                   --
                   -- Trả DECIMAL nguyên bản, KHÔNG ép sang chuỗi ở SQL: CAST ra varchar
                   -- kéo theo cả phần thập phân (3331.00) rồi lại phải cắt đuôi.
                   h.ghi_no_vat, h.ghi_co_vat,
                   h.vat,
                   -- Thuế suất lấy từ DÒNG, để màn hình lùi về khi h.vat trống. Hai đơn
                   -- vị ghi hai chỗ khác nhau (xem ghi chú h.vat ở trên), và còn một ca
                   -- nữa: hóa đơn KHUYẾT ĐƠN GIÁ thì tiền hàng = 0 nên lúc nạp không suy
                   -- ngược ra thuế suất được, h.vat để trống trong khi dòng vẫn có pt_vat.
                   --   Ca thật HOA_SANG K26TBA/0051989 (15/08): master vat = NULL,
                   --   tien_vat = 0, mà dòng có pt_vat = 8 — màn hình bỏ trống cột %VAT.
                   s.pt_vat_line
              FROM HOA_DON h" + SqlGopTuLine;

        private static HoaDonThueDto DocHoaDon(SqlDataReader r) => new()
        {
            MaHd            = r.GetString(0),
            Huong           = r.IsDBNull(1)  ? null : r.GetString(1),
            Ngay            = r.IsDBNull(2)  ? null : r.GetDateTime(2),
            NgayNh          = r.IsDBNull(3)  ? null : r.GetDateTime(3),
            Thang           = r.IsDBNull(4)  ? null : r.GetInt32(4),
            Khhd            = r.IsDBNull(5)  ? null : r.GetString(5),
            SoHd            = r.IsDBNull(6)  ? null : r.GetString(6),
            Mst             = r.IsDBNull(7)  ? null : r.GetString(7),
            TenKh           = r.IsDBNull(8)  ? null : r.GetString(8),
            DiaChi          = r.IsDBNull(9)  ? null : r.GetString(9),
            NguoiGiaoDich   = r.IsDBNull(10) ? null : r.GetString(10),
            SoPtc           = r.IsDBNull(11) ? null : r.GetString(11),
            MaTv            = r.IsDBNull(12) ? null : r.GetString(12),
            TenTv           = r.IsDBNull(13) ? null : r.GetString(13),
            TienHang        = r.GetDecimal(14),
            TienVat         = r.GetDecimal(15),
            TienCk          = r.GetDecimal(16),
            SoDongHang      = r.GetInt32(17),
            GhiNo           = r.IsDBNull(18) ? null : r.GetString(18),
            GhiCo           = r.IsDBNull(19) ? null : r.GetString(19),
            MaCtNo          = r.IsDBNull(20) ? null : r.GetString(20),
            MaCtCo          = r.IsDBNull(21) ? null : r.GetString(21),
            GhiChu          = r.IsDBNull(22) ? null : r.GetString(22),
            TthaiHd         = r.IsDBNull(23) ? null : r.GetString(23),
            TichChatHdLienquan = r.IsDBNull(24) ? null : r.GetString(24),
            LoaiHdLienquan     = r.IsDBNull(25) ? null : r.GetString(25),
            MauSoHdLienquan    = r.IsDBNull(26) ? null : r.GetString(26),
            KhhdLienquan       = r.IsDBNull(27) ? null : r.GetString(27),
            SohdLienquan       = r.IsDBNull(28) ? null : r.GetString(28),
            NgayLienquan       = r.IsDBNull(29) ? null : r.GetDateTime(29),
            TrangThaiHdLienQuan = r.IsDBNull(30) ? null : r.GetString(30),
            // Số hiệu tài khoản — cột có thể là DECIMAL (sổ cũ) hoặc NVARCHAR (sổ đã
            // chạy script 019_hoa_don_dinh_khoan_kieu). Xem TaiKhoan.
            GhiNoVat            = TaiKhoan(r, 31),
            GhiCoVat            = TaiKhoan(r, 32),
            Vat                = r.IsDBNull(33) ? null : r.GetInt32(33),
            VatLine            = r.IsDBNull(34) ? null : r.GetInt32(34),
        };

        // Tài khoản định khoản — ĐỌC ĐƯỢC CẢ HAI KIỂU CỘT.
        //
        // Cột này vốn là DECIMAL (di sản VFP), script 019_hoa_don_dinh_khoan_kieu.sql
        // đổi sang NVARCHAR(20) vì tài khoản kế toán là CHUỖI. Nhưng script chỉ chạy
        // khi VaCauTrucService nạp database đó, nên tại một thời điểm bất kỳ trong sổ
        // vẫn có DB đã vá lẫn DB chưa vá.
        //
        // Đo thật 15/08/2026: HUY_THANH_2026 đã là nvarchar, còn NHAT_TUAN_2026,
        // DAT_VIET_THANH_2026, THAI_TUAN_2026 và 4 DB khác vẫn decimal. Gọi thẳng
        // GetDecimal trên DB đã vá ném InvalidCastException làm chết cả màn Danh sách
        // hóa đơn — đúng lỗi gặp phải trên HUY_THANH.
        //
        // Dùng GetValue rồi tự phân loại thay vì dò kiểu cột trước: dò kiểu tốn thêm
        // một lượt hỏi metadata cho MỖI lần mở sổ, trong khi ở đây chỉ cần đọc giá trị.
        //
        // NULL và 0 đều coi là CHƯA định khoản: sổ cũ để trống bằng 0, mà "0" không
        // phải số hiệu tài khoản nào cả.
        private static string? TaiKhoan(SqlDataReader r, int cot)
        {
            if (r.IsDBNull(cot)) return null;

            var o = r.GetValue(cot);
            decimal v;
            if (o is decimal d) v = d;
            else if (o is string s)
            {
                // Cột đã đổi sang nvarchar. Giá trị chuyển đổi từ decimal có thể còn
                // đuôi ".00" — cắt đi, vì số hiệu tài khoản luôn là số nguyên.
                s = s.Trim();
                if (s.Length == 0) return null;
                if (!decimal.TryParse(s, NumberStyles.Any, CultureInfo.InvariantCulture, out v))
                    return s;   // có chữ (tài khoản kiểu mới) — trả nguyên văn
            }
            else if (!decimal.TryParse(Convert.ToString(o, CultureInfo.InvariantCulture),
                                       NumberStyles.Any, CultureInfo.InvariantCulture, out v))
                return null;

            v = decimal.Truncate(v);
            return v == 0 ? null : v.ToString(CultureInfo.InvariantCulture);
        }

        /// <summary>
        /// Bản gốc TCT của từng hóa đơn (IN_VALUE_LINE) để màn danh sách đối chiếu.
        /// </summary>
        /// <remarks>
        /// LƯỢT GỌI RIÊNG, cố ý KHÔNG ghép vào SqlChonHoaDon. Hai lý do:
        ///   • IN_VALUE_LINE chưa tồn tại trên mọi database — bốn DB đời đầu chỉ có bảng
        ///     này sau khi bản vá 021 chạy, mà bản vá chỉ chạy lúc NẠP. Ghép vào câu SQL
        ///     chính là cả màn sổ thuế chết bằng "Invalid object name" ở đúng bốn đơn vị
        ///     đó — cùng loại bẫy đã ghi ở đầu file với script 015.
        ///   • Chỉ chế độ so sánh mới cần, mà phần lớn thời gian người dùng không bật.
        /// Bảng chưa có thì trả danh sách RỖNG chứ không ném: màn hình hiện cột gốc trống,
        /// đúng nghĩa "chưa có bản gốc để đối chiếu".
        /// </remarks>
        public async Task<List<DoiChieuHdDto>> LayDoiChieu(string code, int nam, string? huong)
        {
            using var conn = await OpenAsync(code, nam);

            using (var doBang = new SqlCommand(
                "SELECT CASE WHEN OBJECT_ID('IN_VALUE_LINE') IS NULL THEN 0 ELSE 1 END", conn))
                if (Convert.ToInt32(await doBang.ExecuteScalarAsync()) == 0)
                    return new List<DoiChieuHdDto>();

            // Tiền hàng của SỔ tính lại bằng ĐÚNG công thức phép kiểm Σ lúc nạp:
            //   • làm tròn về đồng ở TỪNG DÒNG rồi mới cộng (chốt Trường 14/08) — giữ
            //     phần lẻ của mọi dòng rồi mới cộng là tự đẻ ra sai số bản gốc không có;
            //   • dòng CHIẾT KHẤU (tinh_chat = 3) ghi số DƯƠNG trong sổ nhưng bản chất
            //     là TRỪ, nên đảo dấu;
            //   • trừ tiếp chiết khấu của từng dòng (tien_ck).
            // NGOẠI LỆ hóa đơn chiết khấu thương mại đứng riêng — mọi dòng đều tinh_chat=3:
            // cổng khai số dương và sổ cũng vậy, đảo dấu là sai gấp đôi.
            // Đo 15/08 trên 49 hóa đơn tháng 8 HOA_SANG: công thức này lệch 0, còn lấy
            // thẳng Σ(SL×ĐG) thì 6 hóa đơn lệch giả.
            //
            // Lọc hướng qua IN_VALUE.loai_ct (V/R) — một hóa đơn chỉ nằm ở đúng một chiều.
            var ds = new List<DoiChieuHdDto>();
            using var cmd = new SqlCommand(
                @"SELECT g.ma_hd,
                         " + SqlTienHang + @"  AS tien_hang_so,
                         ISNULL(h.tien_vat, 0) AS tien_vat_so,
                         g.value1, g.tax, g.ghi_chu_m
                    FROM IN_VALUE_LINE g
                    JOIN IN_VALUE v ON v.ma_input = g.ma_input
                    JOIN HOA_DON  h ON h.ma_hd    = g.ma_hd" + SqlGopTuLine + @"
                   WHERE g.ma_hd IS NOT NULL
                     AND (@lc IS NULL OR v.loai_ct = @lc)", conn);
            cmd.Parameters.AddWithValue("@lc",
                huong == null ? DBNull.Value
              : huong.Equals("RA", StringComparison.OrdinalIgnoreCase) ? "R" : "V");

            using var r = await cmd.ExecuteReaderAsync();
            while (await r.ReadAsync())
                ds.Add(new DoiChieuHdDto
                {
                    MaHd        = r.GetString(0),
                    TienHangSo  = r.GetDecimal(1),
                    TienVatSo   = r.GetDecimal(2),
                    TienHangGoc = r.GetDecimal(3),
                    TienVatGoc  = r.GetDecimal(4),
                    TthaiGoc    = r.IsDBNull(5) ? null : r.GetString(5),
                });
            return ds;
        }

        /// <summary>
        /// Danh sách hóa đơn, mới nhất trước. Lọc theo hướng (VAO/RA), tháng và từ khóa.
        /// Không kèm dòng hàng — gọi <see cref="LayChiTiet"/> khi cần.
        /// </summary>
        public async Task<List<HoaDonThueDto>> DanhSach(
            string code, int year, string? huong, int? thang, string? tu, int gioiHan)
        {
            using var conn = await OpenAsync(code, year);

            var dieuKien = new List<string>();
            // huong là cột TÍNH SẴN từ prefix ma_hd nên lọc thẳng được, không cần LIKE
            if (huong is "VAO" or "RA") dieuKien.Add("h.huong = @huong");
            if (thang is > 0) dieuKien.Add("h.thang = @thang");
            if (!string.IsNullOrWhiteSpace(tu))
                dieuKien.Add(@"(h.so_hd LIKE @tu OR h.khhd LIKE @tu
                                OR h.mst LIKE @tu OR h.ten_kh LIKE @tu
                                OR h.ma_hd LIKE @tu)");

            var sql = SqlChonHoaDon
                    + (dieuKien.Count > 0 ? " WHERE " + string.Join(" AND ", dieuKien) : "")
                    // ngay DESC là "hóa đơn cuối cùng" theo nghĩa nghiệp vụ; thêm so_hd
                    // để hai HĐ cùng ngày vẫn ra thứ tự cố định giữa các lần gọi.
                    + " ORDER BY h.ngay DESC, h.so_hd DESC"
                    + " OFFSET 0 ROWS FETCH NEXT @gioiHan ROWS ONLY";

            using var cmd = new SqlCommand(sql, conn);
            if (huong is "VAO" or "RA") cmd.Parameters.AddWithValue("@huong", huong);
            if (thang is > 0) cmd.Parameters.AddWithValue("@thang", thang);
            if (!string.IsNullOrWhiteSpace(tu))
                cmd.Parameters.AddWithValue("@tu", $"%{tu.Trim()}%");
            cmd.Parameters.AddWithValue("@gioiHan", gioiHan);

            var ds = new List<HoaDonThueDto>();
            using var r = await cmd.ExecuteReaderAsync();
            while (await r.ReadAsync())
            {
                var hd = DocHoaDon(r);
                // KHÔNG trừ TienCk nữa: từ 15/08 TienHang tính theo SqlTienHang, vốn ĐÃ trừ chiết
            // khấu (đảo dấu dòng TC=3 và trừ tien_ck của dòng). Trừ thêm ở đây là trừ hai
            // lần — mà đo trên dữ liệu thật thì không hóa đơn nào khai chiết khấu chỉ ở
            // master, nên h.tien_ck luôn là bản sao của thứ đã tính rồi.
            hd.TongTien = hd.TienHang + hd.TienVat;
                ds.Add(hd);
            }
            return ds;
        }

        /// <summary>Một hóa đơn kèm đầy đủ dòng hàng. Trả null nếu không có mã này.</summary>
        public async Task<HoaDonThueDto?> LayChiTiet(string code, int year, string maHd)
        {
            using var conn = await OpenAsync(code, year);

            HoaDonThueDto? hd;
            using (var cmd = new SqlCommand(SqlChonHoaDon + " WHERE h.ma_hd = @id", conn))
            {
                cmd.Parameters.AddWithValue("@id", maHd);
                using var r = await cmd.ExecuteReaderAsync();
                if (!await r.ReadAsync()) return null;
                hd = DocHoaDon(r);
            }
            // KHÔNG trừ TienCk nữa: từ 15/08 TienHang tính theo SqlTienHang, vốn ĐÃ trừ chiết
            // khấu (đảo dấu dòng TC=3 và trừ tien_ck của dòng). Trừ thêm ở đây là trừ hai
            // lần — mà đo trên dữ liệu thật thì không hóa đơn nào khai chiết khấu chỉ ở
            // master, nên h.tien_ck luôn là bản sao của thứ đã tính rồi.
            hd.TongTien = hd.TienHang + hd.TienVat;

            using (var cmd = new SqlCommand(
                SqlChonLine + " WHERE ma_hd = @id ORDER BY stt_line", conn))
            {
                cmd.Parameters.AddWithValue("@id", maHd);
                using var r = await cmd.ExecuteReaderAsync();
                while (await r.ReadAsync()) hd.Lines.Add(DocLine(r));
            }
            return hd;
        }

        private const string SqlChonLine = @"
            SELECT ma_hd, stt_line, ma_hang, ten_hang_goc, dvt,
                   ISNULL(so_luong, 0), ISNULL(don_gia, 0),
                   ISNULL(so_luong, 0) * ISNULL(don_gia, 0) AS thanh_tien,
                   -- CAST bắt buộc: pt_vat là INT từ script 020, mà DocLine đọc bằng
                   -- GetDecimal — không ép thì ném InvalidCastException lúc chạy.
                   -- Ép ngay trong SQL (giống cách RaSoatService đã làm) để chỗ đọc
                   -- không phụ thuộc kiểu cột, mai kia đổi lần nữa cũng không gãy.
                   CAST(ISNULL(pt_vat, 0) AS DECIMAL(18,3)), ISNULL(tien_ck, 0),
                   ghi_no, ghi_co, ma_ngan, tinh_chat, ghi_chu
              FROM HOA_DON_LINE";

        private static HoaDonLineDto DocLine(SqlDataReader r) => new()
        {
            SttLine   = r.IsDBNull(1) ? 0 : r.GetInt32(1),
            MaHang    = r.IsDBNull(2) ? null : r.GetString(2),
            TenHang   = r.IsDBNull(3) ? "" : r.GetString(3),
            Dvt       = r.IsDBNull(4) ? null : r.GetString(4),
            SoLuong   = r.GetDecimal(5),
            DonGia    = r.GetDecimal(6),
            ThanhTien = r.GetDecimal(7),
            PtVat     = r.GetDecimal(8),
            TienCk    = r.GetDecimal(9),
            GhiNo     = r.IsDBNull(10) ? null : r.GetString(10),
            GhiCo     = r.IsDBNull(11) ? null : r.GetString(11),
            MaNgan    = r.IsDBNull(12) ? null : r.GetString(12),
            TinhChat  = r.IsDBNull(13) ? null : r.GetString(13),
            GhiChu    = r.IsDBNull(14) ? null : r.GetString(14),
        };

        public async Task<Dictionary<string, List<HoaDonLineDto>>> LayLinesNhieu(
            string code, int year, IReadOnlyList<string> dsMaHd)
        {
            var ket = new Dictionary<string, List<HoaDonLineDto>>();
            if (dsMaHd.Count == 0) return ket;

            using var conn = await OpenAsync(code, year);

            var thamSo = new string[dsMaHd.Count];
            for (int i = 0; i < dsMaHd.Count; i++) thamSo[i] = "@p" + i;

            var sql = SqlChonLine
                    + $" WHERE ma_hd IN ({string.Join(",", thamSo)})"
                    + " ORDER BY ma_hd, stt_line";

            using var cmd = new SqlCommand(sql, conn);
            for (int i = 0; i < dsMaHd.Count; i++)
                cmd.Parameters.AddWithValue(thamSo[i], dsMaHd[i]);

            using var r = await cmd.ExecuteReaderAsync();
            while (await r.ReadAsync())
            {
                var maHd = r.GetString(0);
                if (!ket.TryGetValue(maHd, out var ds))
                    ket[maHd] = ds = new List<HoaDonLineDto>();
                ds.Add(DocLine(r));
            }
            return ket;
        }

        /// <summary>
        /// Ghi lại TOÀN BỘ dòng hàng của một hóa đơn: xóa hết rồi chèn lại theo danh
        /// sách gửi lên. Trả số dòng đã ghi, hoặc null nếu không có hóa đơn đó.
        /// </summary>
        /// <remarks>
        /// XÓA-RỒI-CHÈN chứ không UPDATE từng dòng: người dùng sửa được cả thêm/bớt
        /// dòng, mà HOA_DON_LINE không có khóa chính ổn định (stt_line người dùng
        /// đánh lại được). Đối chiếu từng dòng để biết cái nào thêm/sửa/xóa sẽ phức
        /// tạp hơn nhiều mà không được gì — một hóa đơn chỉ vài chục dòng.
        ///
        /// Bọc TRANSACTION: xóa xong mà chèn hỏng giữa chừng thì hóa đơn mất sạch
        /// dòng hàng. Có transaction thì hoặc ăn cả, hoặc về nguyên trạng.
        ///
        /// KHÔNG đụng bảng HOA_DON: cột định khoản của header thuộc quyền màn khác
        /// (luật 5 — hàm nạp không được ghi đè ghi_no/ghi_co/ma_ct_*).
        /// </remarks>
        public async Task<int?> LuuLines(
            string code, int year, string maHd, IReadOnlyList<HoaDonLineDto> lines,
            string nguoiSua)
        {
            using var conn = await OpenAsync(code, year);

            // Hóa đơn phải có thật — tránh tạo dòng mồ côi khi client gửi mã sai
            using (var kt = new SqlCommand(
                "SELECT COUNT(*) FROM HOA_DON WHERE ma_hd = @id", conn))
            {
                kt.Parameters.AddWithValue("@id", maHd);
                if ((int)(await kt.ExecuteScalarAsync() ?? 0) == 0) return null;
            }

            using var tran = conn.BeginTransaction();
            try
            {
                using (var xoa = new SqlCommand(
                    "DELETE FROM HOA_DON_LINE WHERE ma_hd = @id", conn, tran))
                {
                    xoa.Parameters.AddWithValue("@id", maHd);
                    await xoa.ExecuteNonQueryAsync();
                }

                int stt = 0;
                foreach (var d in lines)
                {
                    stt++;
                    using var them = new SqlCommand(@"
                        INSERT INTO HOA_DON_LINE
                            (ma_hd, stt_line, ma_hang, ten_hang_goc, dvt,
                             so_luong, don_gia, pt_vat, tien_ck,
                             ghi_no, ghi_co, ma_ngan, tinh_chat, ghi_chu,
                             created_by, created_at, updated_by, updated_at)
                        VALUES
                            (@ma_hd, @stt, @ma_hang, @ten_hang, @dvt,
                             @so_luong, @don_gia, @pt_vat, @tien_ck,
                             @ghi_no, @ghi_co, @ma_ngan, @tinh_chat, @ghi_chu,
                             @nguoi, SYSDATETIME(), @nguoi, SYSDATETIME());",
                        conn, tran);

                    them.Parameters.AddWithValue("@ma_hd", maHd);
                    // stt_line đánh lại 1..n theo thứ tự gửi lên — client xóa dòng
                    // giữa chừng thì số vẫn liền, không thủng.
                    them.Parameters.AddWithValue("@stt", stt);
                    them.Parameters.AddWithValue("@ma_hang", (object?)d.MaHang ?? DBNull.Value);
                    them.Parameters.AddWithValue("@ten_hang", (object?)d.TenHang ?? DBNull.Value);
                    them.Parameters.AddWithValue("@dvt", (object?)d.Dvt ?? DBNull.Value);
                    them.Parameters.AddWithValue("@so_luong", d.SoLuong);
                    them.Parameters.AddWithValue("@don_gia", d.DonGia);
                    them.Parameters.AddWithValue("@pt_vat", d.PtVat);
                    them.Parameters.AddWithValue("@tien_ck", d.TienCk);
                    them.Parameters.AddWithValue("@ghi_no", (object?)d.GhiNo ?? DBNull.Value);
                    them.Parameters.AddWithValue("@ghi_co", (object?)d.GhiCo ?? DBNull.Value);
                    them.Parameters.AddWithValue("@ma_ngan", (object?)d.MaNgan ?? DBNull.Value);
                    them.Parameters.AddWithValue("@tinh_chat", (object?)d.TinhChat ?? DBNull.Value);
                    them.Parameters.AddWithValue("@ghi_chu", (object?)d.GhiChu ?? DBNull.Value);
                    them.Parameters.AddWithValue("@nguoi", nguoiSua);

                    await them.ExecuteNonQueryAsync();
                }

                tran.Commit();
                return stt;
            }
            catch
            {
                tran.Rollback();
                throw;
            }
        }

        // ==================== BÁO CÁO THUẾ GTGT (FRM_BC_THUE) ====================
        // Bảng kê hóa đơn theo hướng. Tiền hàng gộp từ HOA_DON_LINE như mọi chỗ khác;
        // ten_hang lấy dòng ĐẦU làm đại diện để nhìn ra hóa đơn nói về cái gì.
        //
        // LỌC THEO CỘT `thang` (tháng KÊ KHAI) chứ không phải MONTH(ngay): báo cáo
        // thuế là tờ khai của KỲ, hóa đơn ngày 28/6 kê khai tháng 7 phải nằm ở tờ
        // khai tháng 7. Đây cũng là lý do màn danh sách tách hai ô lọc riêng.
        private const string SqlBangKe = @"
            SELECT h.ma_hd, h.khhd, h.so_hd, h.ngay, h.ten_kh, h.mst,
                   ISNULL(l.tien_hang, 0) AS tien_hang,
                   h.vat,
                   ISNULL(h.tien_vat, 0)  AS tien_vat,
                   h.ghi_chu,
                   l.ten_hang_dau
              FROM HOA_DON h
              OUTER APPLY (
                    SELECT SUM(ISNULL(x.so_luong, 0) * ISNULL(x.don_gia, 0)) AS tien_hang,
                           MIN(x.ten_hang_goc)  AS ten_hang_dau
                      FROM HOA_DON_LINE x
                     WHERE x.ma_hd = h.ma_hd
              ) l
             WHERE h.huong = @huong";

        private static async Task<List<BangKeHoaDonDto>> DocBangKe(
            SqlConnection conn, string huong, int? thang)
        {
            var sql = SqlBangKe
                    + (thang is > 0 ? " AND h.thang = @thang" : "")
                    + " ORDER BY h.ngay, h.so_hd";

            using var cmd = new SqlCommand(sql, conn);
            cmd.Parameters.AddWithValue("@huong", huong);
            if (thang is > 0) cmd.Parameters.AddWithValue("@thang", thang);

            var ds = new List<BangKeHoaDonDto>();
            using var r = await cmd.ExecuteReaderAsync();
            int stt = 0;
            while (await r.ReadAsync())
            {
                ds.Add(new BangKeHoaDonDto
                {
                    Stt             = ++stt,
                    MaHd            = r.GetString(0),
                    KhHd            = r.IsDBNull(1) ? null : r.GetString(1),
                    SoHd            = r.IsDBNull(2) ? null : r.GetString(2),
                    Ngay            = r.IsDBNull(3) ? null : r.GetDateTime(3),
                    TenDoiTac       = r.IsDBNull(4) ? null : r.GetString(4),
                    MstDoiTac       = r.IsDBNull(5) ? null : r.GetString(5),
                    DoanhThuChuaVat = r.GetDecimal(6),
                    ThueSuat        = r.IsDBNull(7) ? null : r.GetInt32(7),
                    ThueGtgt        = r.GetDecimal(8),
                    GhiChu          = r.IsDBNull(9) ? null : r.GetString(9),
                    MatHang         = r.IsDBNull(10) ? null : r.GetString(10),
                });
            }
            return ds;
        }

        /// <summary>
        /// Báo cáo thuế GTGT của một kỳ: bảng kê mua vào, bán ra và bảng tổng hợp
        /// theo chỉ tiêu tờ khai 01/GTGT. thang = null nghĩa là cả năm.
        /// </summary>
        public async Task<BaoCaoThueDto> BaoCaoThue(string code, int year, int? thang)
        {
            using var conn = await OpenAsync(code, year);

            var kq = new BaoCaoThueDto { Nam = year, Thang = thang };
            kq.MuaVao = await DocBangKe(conn, "VAO", thang);
            kq.BanRa  = await DocBangKe(conn, "RA", thang);
            kq.TongHop = TinhTongHop(kq.MuaVao, kq.BanRa);
            return kq;
        }

        // Dựng bảng chỉ tiêu tờ khai 01/GTGT từ hai bảng kê.
        //
        // Vì sao tính ở SERVER chứ không để frontend cộng: đây là số đi vào tờ khai
        // thuế, phải có MỘT chỗ định nghĩa cách tính. Frontend cộng lại thì mai này
        // thêm màn khác (xuất Excel, in) là có hai công thức song song, lệch nhau
        // lúc nào không biết.
        //
        // Chỉ tiêu 5/6/7 (khấu trừ kỳ trước, đã nộp, được hoàn) chưa có nguồn dữ
        // liệu — sổ hiện chỉ có HOA_DON. Để 0 và ghi rõ ở đây, KHÔNG bịa số.
        private static List<ChiTieuTongHopDto> TinhTongHop(
            List<BangKeHoaDonDto> muaVao, List<BangKeHoaDonDto> banRa)
        {
            // Gom theo thuế suất. HĐ không khai vat (null) xếp vào nhóm "không chịu
            // thuế" — đúng nghĩa hơn là nhét bừa vào 0%.
            decimal DtTheo(List<BangKeHoaDonDto> ds, Func<int?, bool> loc) =>
                ds.Where(x => loc(x.ThueSuat)).Sum(x => x.DoanhThuChuaVat);
            decimal ThueTheo(List<BangKeHoaDonDto> ds, Func<int?, bool> loc) =>
                ds.Where(x => loc(x.ThueSuat)).Sum(x => x.ThueGtgt);

            var dtRa    = banRa.Sum(x => x.DoanhThuChuaVat);
            var thueRa  = banRa.Sum(x => x.ThueGtgt);
            var dtVao   = muaVao.Sum(x => x.DoanhThuChuaVat);
            var thueVao = muaVao.Sum(x => x.ThueGtgt);

            // Chỉ tiêu 4 = thuế đầu vào ĐƯỢC KHẤU TRỪ. Bản này lấy trọn thuế đầu vào:
            // luật loại trừ (HĐ không hợp lệ, dùng cho hoạt động không chịu thuế...)
            // chưa có chỗ đánh dấu trong sổ.
            var duocKhauTru = thueVao;
            var phaiNop = thueRa - duocKhauTru;

            ChiTieuTongHopDto D(string stt, string ten, decimal? dt, decimal? thue,
                                bool chinh = false) =>
                new() { Stt = stt, ChiTieu = ten, DoanhThuChuaVat = dt,
                        ThueGtgt = thue, LaDongChinh = chinh };

            return new List<ChiTieuTongHopDto>
            {
                D("1",  "Hàng hoá, dịch vụ bán ra",                     dtRa,   thueRa, true),
                D("2",  "Thuế GTGT của HHDV bán ra trong kỳ",           null,   thueRa, true),
                D("2a", "Hàng hoá, dịch vụ bán ra không chịu thuế",
                        DtTheo(banRa, v => v == null), 0),
                D("2b", "Hàng hoá, dịch vụ thuế suất 0%",
                        DtTheo(banRa, v => v == 0), ThueTheo(banRa, v => v == 0)),
                D("2c", "Hàng hoá, dịch vụ thuế suất 5%",
                        DtTheo(banRa, v => v == 5), ThueTheo(banRa, v => v == 5)),
                D("2d", "Hàng hoá, dịch vụ thuế suất 10%",
                        DtTheo(banRa, v => v == 10), ThueTheo(banRa, v => v == 10)),
                D("3",  "Hàng hoá, dịch vụ mua vào",                    dtVao,  thueVao, true),
                D("3a", "Hàng hoá, dịch vụ nhập khẩu",                  0, 0),
                D("3b", "Hàng hoá, dịch vụ mua vào là TSCĐ",            0, 0),
                D("3c", "Hàng hoá, dịch vụ mua vào chịu thuế",
                        DtTheo(muaVao, v => v != null && v > 0),
                        ThueTheo(muaVao, v => v != null && v > 0)),
                D("4",  "Thuế GTGT của HHDV mua vào được khấu trừ trong kỳ",
                        null, duocKhauTru, true),
                D("5",  "Thuế GTGT còn được khấu trừ kỳ trước chuyển sang", null, 0, true),
                D("6",  "Thuế GTGT đã nộp trong kỳ",                    null, 0, true),
                D("7",  "Thuế GTGT được hoàn trả trong kỳ",             null, 0, true),
                D("8",  "Thuế GTGT phải nộp kỳ này",                    null, phaiNop, true),
            };
        }

        public async Task<(string? Html, string? DuongDan)> LayHtmlGoc(
            string code, int year, string maHd)
        {
            var root = _config["Paths:ScanDocRoot"];
            if (string.IsNullOrWhiteSpace(root)) return (null, null);

            string huong;
            if (maHd.StartsWith("VAO_", StringComparison.OrdinalIgnoreCase)) huong = "VAO";
            else if (maHd.StartsWith("RA_", StringComparison.OrdinalIgnoreCase)) huong = "RA";
            else return (null, null);
            var duoi = maHd[(huong.Length + 1)..];

            // Thư mục file gốc đặt tên theo tháng PHÁT SINH, nên phải lấy MONTH(ngay)
            // chứ KHÔNG phải cột `thang` — từ 11/08 `thang` mang nghĩa tháng KÊ KHAI:
            // đơn vị khai quý có HĐ tháng 1 ghi thang=3, hàm này sẽ đi tìm trong
            // VAO_T3_2026 trong khi file nằm ở VAO_T1_2026.
            int? thang;
            using (var conn = await OpenAsync(code, year))
            using (var cmd = new SqlCommand(
                "SELECT MONTH(ngay) FROM HOA_DON WHERE ma_hd=@id", conn))
            {
                cmd.Parameters.AddWithValue("@id", maHd);
                var o = await cmd.ExecuteScalarAsync();
                thang = o is int t ? t : (o is null || o == DBNull.Value ? null : Convert.ToInt32(o));
            }
            if (thang is null or <= 0) return (null, null);

            var thuMuc = Path.Combine(root, code, $"NAM{year}", $"{huong}_T{thang}_{year}");
            var thuMucChuan = Path.GetFullPath(thuMuc + Path.DirectorySeparatorChar);

            // Tên file do script tải đặt, mang số hóa đơn THÔ của cổng ("..._4490"), còn
            // ma_hd trong DB đã đệm số 0 theo BR-HD-01 ("..._0004490") — ghép thẳng thì
            // không bao giờ khớp. Thử lần lượt các ứng viên.
            foreach (var ten in TenFileUngVien(code, huong, thang.Value, duoi, thuMucChuan))
            {
                var duongDanChuan = Path.GetFullPath(Path.Combine(thuMuc, ten));
                if (!duongDanChuan.StartsWith(thuMucChuan, StringComparison.OrdinalIgnoreCase))
                    continue;   // chặn ../ vượt thư mục
                if (File.Exists(duongDanChuan))
                    return (await File.ReadAllTextAsync(duongDanChuan), duongDanChuan);
            }
            return (null, null);
        }

        // Bỏ số 0 đầu của đoạn CUỐI (số hóa đơn) để so khớp: "..._C26TTB_0004490" và
        // "..._C26TTB_4490" phải coi là một.
        private static string BoSoKhongDau(string duoi)
        {
            int i = duoi.LastIndexOf('_');
            if (i < 0 || i == duoi.Length - 1) return duoi;
            string so = duoi[(i + 1)..];
            if (!so.All(char.IsAsciiDigit)) return duoi;
            string goi = so.TrimStart('0');
            return duoi[..(i + 1)] + (goi.Length == 0 ? "0" : goi);
        }

        private static IEnumerable<string> TenFileUngVien(
            string code, string huong, int thang, string duoi, string thuMucChuan)
        {
            string dau = $"{code}_{huong}_T{thang}_";
            yield return dau + duoi + ".html";

            string duoiGon = BoSoKhongDau(duoi);
            if (duoiGon != duoi) yield return dau + duoiGon + ".html";

            // File tải từ các đợt trước có thể đệm kiểu khác (đợt 11/08 từng đệm 8 chữ
            // số). Thay vì đoán từng kiểu, quét thư mục và so theo đuôi đã bỏ số 0 —
            // chậm hơn nhưng bắt được mọi cách đặt tên đã từng dùng.
            if (!Directory.Exists(thuMucChuan)) yield break;
            foreach (var f in Directory.EnumerateFiles(thuMucChuan, "*.html"))
            {
                string ten = Path.GetFileNameWithoutExtension(f);
                if (!ten.StartsWith(dau, StringComparison.OrdinalIgnoreCase)) continue;
                if (BoSoKhongDau(ten[dau.Length..]) == duoiGon)
                    yield return Path.GetFileName(f);
            }
        }

        // ============ BR-TK-06: XỬ LÝ HÓA ĐƠN THAY THẾ / ĐIỀU CHỈNH ============
        //
        // Spec: docs/THUE/TOKHAI/SPEC-TO-KHAI-01-GTGT.md §10
        //
        // HAI TRƯỜNG HỢP, xử lý khác hẳn nhau:
        //
        //   CÙNG KỲ  — engine tờ khai TỰ LOẠI hóa đơn gốc lúc tính (xem
        //              ToKhai.cs / LocHdBiThayThe). KHÔNG ghi gì ở đây.
        //
        //   KHÁC KỲ  — hóa đơn gốc thuộc kỳ khác, có thể chưa nạp vào sổ (đo thật
        //              15/08: HĐ 0001052 ngày 25/06 không có trong sổ). Không tự
        //              động sửa tờ khai kỳ cũ — kỳ đó có thể đã nộp rồi, sửa tự
        //              động là đụng vào tờ khai đã nộp, việc đó phải do người
        //              quyết định. Ở đây chỉ GHI CHÚ đủ để kế toán truy lại và
        //              sửa tay khi có dữ liệu.
        public sealed class KetQuaXuLyTtDc
        {
            public int SoCungKy { get; set; }        // engine tự loại, không ghi
            public int SoKhacKy { get; set; }        // đã ghi chú
            public List<string> ChiTiet { get; set; } = new();
        }

        /// <summary>
        /// Quét hóa đơn thay thế/điều chỉnh của một kỳ, ghi chú cho những cái KHÁC KỲ.
        /// </summary>
        /// <remarks>
        /// CHẠY LẠI NHIỀU LẦN KHÔNG ĐỔI KẾT QUẢ: trước khi nối ghi chú thì kiểm xem
        /// đã có dấu hiệu ghi rồi chưa (chuỗi mốc "[BR-TK-06]"). Kế toán bấm nhầm hai
        /// lần là chuyện thường, không được nhân đôi ghi chú.
        ///
        /// Luật 5: NỐI THÊM vào ghi_chu, không xóa nội dung cũ. Cột rộng 1000 ký tự —
        /// kiểm độ dài trước khi nối, tràn thì SQL cắt cụt âm thầm mất cả phần cũ.
        /// </remarks>
        public async Task<KetQuaXuLyTtDc> XuLyThayTheDieuChinh(
            string code, int year, int thang, string nguoiGhi)
        {
            const string sql = @"
                SELECT h.ma_hd, h.khhd, h.so_hd, h.ngay, h.tthai_hd,
                       h.khhd_lienquan, h.sohd_lienquan, h.ngay_lienquan,
                       ISNULL(h.ghi_chu, '')
                  FROM HOA_DON h
                 WHERE h.thang = @thang
                   AND ISNULL(h.tich_chat_hd_lienquan, '') <> ''";

            var kq = new KetQuaXuLyTtDc();
            var canGhi = new List<(string MaHd, string GhiChu)>();

            using var conn = await OpenAsync(code, year);
            using (var cmd = new SqlCommand(sql, conn))
            {
                cmd.Parameters.AddWithValue("@thang", thang);
                using var r = await cmd.ExecuteReaderAsync();
                while (await r.ReadAsync())
                {
                    var maHd = r.GetString(0);
                    var ngayLq = r.IsDBNull(7) ? (DateTime?)null : r.GetDateTime(7);
                    var ghiCu = r.GetString(8);

                    // Không có ngày HĐ gốc thì không biết cùng hay khác kỳ — bỏ qua,
                    // thà không xử lý còn hơn đoán sai.
                    if (ngayLq == null) continue;

                    // CÙNG KỲ: engine tờ khai đã tự loại, ở đây không làm gì.
                    if (ngayLq.Value.Month == thang && ngayLq.Value.Year == year)
                    { kq.SoCungKy++; continue; }

                    kq.SoKhacKy++;

                    // Đã ghi rồi thì bỏ qua — chạy lại không nhân đôi.
                    if (ghiCu.Contains("[BR-TK-06]")) continue;

                    var loai = (r.IsDBNull(4) ? "" : r.GetString(4))
                               .Contains("điều chỉnh", StringComparison.OrdinalIgnoreCase)
                               ? "Điều chỉnh" : "Thay thế";
                    var kyGoc = $"{ngayLq.Value.Month:00}/{ngayLq.Value.Year}";
                    var moi = $"[BR-TK-06] {loai} cho HĐ "
                            + $"{(r.IsDBNull(5) ? "?" : r.GetString(5))}/"
                            + $"{(r.IsDBNull(6) ? "?" : r.GetString(6))} "
                            + $"ngày {ngayLq.Value:dd/MM/yyyy} — KHÁC KỲ "
                            + $"(gốc thuộc kỳ {kyGoc}, xử lý tại kỳ {thang:00}/{year}) "
                            + "— chưa kê khai lại kỳ gốc, kế toán tự cập nhật khi có dữ liệu";

                    var gop = string.IsNullOrWhiteSpace(ghiCu) ? moi : ghiCu + " | " + moi;
                    // Tràn 1000 ký tự thì SQL cắt cụt âm thầm — thà giữ nguyên ghi chú
                    // cũ và báo ra ngoài còn hơn mất cả hai.
                    if (gop.Length > 1000)
                    {
                        kq.ChiTiet.Add($"{maHd}: ghi chú đã đầy, không nối thêm được");
                        continue;
                    }
                    canGhi.Add((maHd, gop));
                    kq.ChiTiet.Add($"{maHd}: {moi}");
                }
            }

            if (canGhi.Count == 0) return kq;

            // MỘT giao dịch cho cả mẻ: đứt giữa chừng thì nửa số hóa đơn có ghi chú,
            // nửa không — chạy lại lần sau không biết đã tới đâu.
            using var tran = conn.BeginTransaction();
            try
            {
                foreach (var (maHd, gc) in canGhi)
                {
                    using var up = new SqlCommand(
                        @"UPDATE HOA_DON SET ghi_chu = @gc, updated_by = @nguoi,
                                             updated_at = SYSDATETIME()
                           WHERE ma_hd = @ma", conn, tran);
                    up.Parameters.AddWithValue("@gc", gc);
                    up.Parameters.AddWithValue("@nguoi", nguoiGhi);
                    up.Parameters.AddWithValue("@ma", maHd);
                    await up.ExecuteNonQueryAsync();
                }
                tran.Commit();
            }
            catch { tran.Rollback(); throw; }

            return kq;
        }

        // ===================== XÓA HÓA ĐƠN =====================
        //
        // Đây là hàm GHI DUY NHẤT của ThueService — cả lớp còn lại chỉ đọc. Đặt ở đây
        // chứ không nhét vào ImportService vì đó là luồng NẠP theo mẻ, còn đây là thao
        // tác một hóa đơn do kế toán chủ động bấm.
        //
        // Vì sao cần: hóa đơn cổng trả về có cái sai/trùng/không thuộc kỳ (HĐ ngân
        // hàng chẳng hạn — xem DOC_14_08_26 mục "Cho phép xóa các HĐ"), phải bỏ đi
        // trước khi lên tờ khai.
        //
        // XÓA HẲN chứ không đánh dấu ẩn: bảng HOA_DON không có cột trạng thái xóa, mà
        // thêm cột đó thì mọi câu đọc trong repo (tờ khai, báo cáo, rà soát) đều phải
        // thêm điều kiện lọc — sót một chỗ là số liệu sai âm thầm.
        public async Task<bool> XoaHoaDon(string code, int year, string maHd)
        {
            using var conn = await OpenAsync(code, year);
            using var tran = conn.BeginTransaction();
            try
            {
                // HOA_DON_LINE KHÔNG có ON DELETE CASCADE (khuôn 010) — phải xóa tay
                // dòng hàng trước, nếu không khóa ngoại chặn và để lại dòng mồ côi.
                using (var d1 = new SqlCommand(
                    "DELETE FROM HOA_DON_LINE WHERE ma_hd = @ma", conn, tran))
                {
                    d1.Parameters.AddWithValue("@ma", maHd);
                    await d1.ExecuteNonQueryAsync();
                }

                using var d2 = new SqlCommand(
                    "DELETE FROM HOA_DON WHERE ma_hd = @ma", conn, tran);
                d2.Parameters.AddWithValue("@ma", maHd);
                var n = await d2.ExecuteNonQueryAsync();

                // MỘT giao dịch cho cả hai lệnh: đứt giữa chừng mà không có transaction
                // thì dòng hàng mất còn header ở lại — hóa đơn rỗng, tiền hàng bằng 0,
                // và tờ khai lặng lẽ thiếu tiền.
                tran.Commit();
                return n > 0;
            }
            catch
            {
                tran.Rollback();
                throw;
            }
        }
    }
}
