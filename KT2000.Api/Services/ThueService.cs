using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Configuration;
using KT2000.Api.Models;

namespace KT2000.Api.Services
{
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

        private async Task<SqlConnection> OpenAsync(string code, int year)
        {
            var conn = new SqlConnection(_resolver.GetTenantConnection(code, year));
            await conn.OpenAsync();
            return conn;
        }

        // ===================== CHỈ ĐỌC CỘT CỦA SỔ THUẾ =====================
        // HOA_DON "chuẩn" của sổ thuế kết thúc ở cột huong (41 cột). Các cột ma_nvkd /
        // ma_nvvc / ma_goi trên HOA_DON và he_so_qd / sl_quy_doi / la_hang_tang / ngay_nh_l
        // trên HOA_DON_LINE là của NỘI BỘ, do script 015 gắn thêm vào bảng dùng chung.
        //
        // Màn này là màn THUẾ nên KHÔNG đọc mấy cột đó: vừa sai ranh giới hai sổ, vừa nổ
        // "Invalid column name" trên DB thuần thuế (TUAN_NGA_2025, HUY_THANH_2025/2026 chưa
        // chạy 015). Giữ SELECT trong phạm vi cột chuẩn thì mọi DB đơn vị đều chạy được.

        // Tiền hàng và số dòng KHÔNG có cột sẵn trên HOA_DON — gộp từ HOA_DON_LINE.
        // Gom bằng subquery thay vì JOIN + GROUP BY để không phải nhóm lại toàn bộ
        // ~40 cột của HOA_DON chỉ để cộng hai con số.
        private const string SqlChonHoaDon = @"
            SELECT h.ma_hd, h.huong, h.ngay, h.ngay_nh, h.thang, h.khhd, h.so_hd,
                   h.mst, h.ten_kh, h.dia_chi, h.nguoi_giao_dich, h.so_ptc,
                   h.ma_tv, h.ten_tv,
                   ISNULL(l.tien_hang, 0)  AS tien_hang,
                   ISNULL(h.tien_vat, 0)   AS tien_vat,
                   ISNULL(h.tien_ck, 0)    AS tien_ck,
                   ISNULL(l.so_dong, 0)    AS so_dong,
                   h.ghi_no, h.ghi_co, h.ma_ct_no, h.ma_ct_co, h.ghi_chu, h.tthai_hd,
                   h.tich_chat_hd_lienquan, h.loai_hd_lienquan, h.mau_so_hd_lienquan,
                   h.khhd_lienquan, h.sohd_lienquan, h.ngay_lienquan,
                   -- Cột cuối của khối HĐ liên quan, trước đây chưa trả về nên lưới
                   -- không có gì để hiện ở cột TT HĐLQ.
                   h.trang_thai_hd_lien_quan,
                   -- %VAT của cả hóa đơn. HAI ĐƠN VỊ GHI HAI CHỖ KHÁC NHAU — đã đối
                   -- chiếu dữ liệu thật 12/08/2026:
                   --   THAI_TUAN_2026 : h.vat có 60/65,  line.pt_vat rỗng  0/104
                   --   HOA_SANG_2026  : h.vat có 134/170, line.pt_vat rỗng 0/461
                   --   TUAN_NGA_2025  : h.vat RỖNG 0/60,  line.pt_vat có   187/196
                   -- Nên phải trả cả hai và để FE ưu tiên header rồi lùi về dòng; chỉ
                   -- đọc một chỗ thì luôn có đơn vị bị trắng ô Thuế suất.
                   h.vat
              FROM HOA_DON h
              OUTER APPLY (
                    SELECT SUM(ISNULL(x.so_luong, 0) * ISNULL(x.don_gia, 0)) AS tien_hang,
                           COUNT(*) AS so_dong
                      FROM HOA_DON_LINE x
                     WHERE x.ma_hd = h.ma_hd
              ) l";

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
            Vat                = r.IsDBNull(31) ? null : r.GetInt32(31),
        };

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
                hd.TongTien = hd.TienHang - hd.TienCk + hd.TienVat;
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
            hd.TongTien = hd.TienHang - hd.TienCk + hd.TienVat;

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
                   ISNULL(pt_vat, 0), ISNULL(tien_ck, 0),
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

        public async Task<(string? Html, string? TenFile)> LayHtmlGoc(
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
                    return (await File.ReadAllTextAsync(duongDanChuan), ten);
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
    }
}
