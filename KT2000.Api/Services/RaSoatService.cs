using ClosedXML.Excel;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;
using System.Globalization;
using System.Xml.Linq;
using KT2000.Api.Models;

namespace KT2000.Api.Services
{
    // ============ RÀ SOÁT DỮ LIỆU TRƯỚC KHI KHAI THUẾ ============
    //
    // Đối chiếu hóa đơn trong FILE (XML của cổng TCT, Excel bảng kê) với hóa đơn
    // đã có trong SỔ, để kế toán biết còn thiếu/lệch gì trước khi nộp tờ khai.
    //
    // CHỈ ĐỌC — TUYỆT ĐỐI KHÔNG GHI. Đây là điểm quan trọng nhất của service này:
    // nó soi sổ đang chạy thật ngay trước kỳ khai thuế, một câu UPDATE nhầm là
    // hỏng số của cả tờ khai. Muốn nạp thì dùng ImportService như mọi khi.
    //
    // Vì sao tách khỏi ImportService: ImportService NẠP (ghi vào sổ), service này
    // chỉ SO. Trộn hai việc vào một chỗ thì rất dễ có ngày ai đó thêm câu ghi vào
    // nhánh "rà soát" mà không ai để ý.
    public class RaSoatService
    {
        private readonly TenantDbResolver _resolver;
        private readonly IConfiguration _config;

        public RaSoatService(TenantDbResolver resolver, IConfiguration config)
        {
            _resolver = resolver;
            _config = config;
        }

        // ============ DÒ KHO DỮ LIỆU CỦA MỘT ĐƠN VỊ-KỲ ============
        //
        // Spec: docs/NB/SPEC-TO-KHAI-01-GTGT.md §4 (đối chiếu ba nguồn)
        //
        // Mọi đường dẫn SINH RA TỪ appsettings (Paths:ScanDocRoot, Paths:JobsRoot),
        // không có chuỗi cứng nào trong code — luật 4 của repo. Chuyển sang máy khác
        // chỉ cần sửa appsettings, code không đụng tới.
        //
        // Khảo sát kho thật 13/08 (D:\New folder\test), CÓ HAI GỐC KHÁC NHAU:
        //
        //   Paths:ScanDocRoot = ...\test\SCAN_DOC          ← HTML + XML đã tách
        //     <MÃ>\NAM<năm>\RA_T<t>_<năm>\*.html
        //     <MÃ>\NAM<năm>\VAO_T<t>_<năm>\*.html
        //     <MÃ>\NAM<năm>\xmls_only\ra\t<t>\*.xml
        //     <MÃ>\NAM<năm>\xmls_only\vao\t<t>\*.xml
        //
        //   Paths:JobsRoot    = ...\test                   ← kho làm việc của trình tải
        //     <MÃ>\NAM<năm>\T<t>_<năm>_<MÃ>\raw\RA\*.xlsx      ← bảng kê Excel cổng TCT
        //     <MÃ>\NAM<năm>\T<t>_<năm>_<MÃ>\raw\VAO\*.xlsx
        //
        // Vì sao dò NHIỀU dạng đường dẫn cho mỗi loại: hai kho trên do hai công cụ
        // khác nhau sinh ra, đặt tên theo hai quy ước. Thử lần lượt rồi lấy chỗ đầu
        // tiên có file, thay vì bắt người dùng khai từng đường dẫn một.

        /// <summary>Kết quả dò kho: danh sách file tìm được từng loại.</summary>
        public class KhoKy
        {
            public string MaDonVi { get; set; } = "";
            public int Nam { get; set; }
            public int Thang { get; set; }
            public List<string> XmlRa { get; set; } = new();
            public List<string> XmlVao { get; set; } = new();
            public List<string> HtmlRa { get; set; } = new();
            public List<string> HtmlVao { get; set; } = new();
            public List<string> ExcelRa { get; set; } = new();
            public List<string> ExcelVao { get; set; } = new();
            // Thư mục đã dò tới — hiện lên giao diện để người dùng biết đang đọc ở đâu
            public List<string> DaDo { get; set; } = new();
        }

        // Lấy mọi file khớp mẫu trong thư mục đầu tiên TỒN TẠI và CÓ FILE.
        private static List<string> Quet(List<string> daDo, string mau,
                                         params string?[] ungVien)
        {
            foreach (var d in ungVien)
            {
                if (string.IsNullOrWhiteSpace(d) || !Directory.Exists(d)) continue;
                daDo.Add(d);
                var ds = Directory.EnumerateFiles(d, mau, SearchOption.AllDirectories)
                                  .ToList();
                if (ds.Count > 0) return ds;
            }
            return new List<string>();
        }

        /// <summary>
        /// Dò kho trên THREAD POOL — bản bất đồng bộ của <see cref="DoKho"/>.
        /// </summary>
        /// <remarks>
        /// Directory.EnumerateFiles là I/O đồng bộ và phải duyệt đệ quy vài trăm file
        /// (chưa kể ổ mạng có độ trễ cao hơn hẳn ổ nội bộ). Gọi thẳng trong controller
        /// sẽ giữ luồng phục vụ request suốt lúc duyệt.
        /// </remarks>
        public Task<KhoKy> DoKhoAsync(string code, int nam, int thang,
                                      CancellationToken huy = default)
            => Task.Run(() => DoKho(code, nam, thang), huy);

        /// <summary>
        /// Dò toàn bộ file của một đơn vị-kỳ trong các kho đã khai ở appsettings.
        /// </summary>
        public KhoKy DoKho(string code, int nam, int thang)
        {
            var k = new KhoKy { MaDonVi = code, Nam = nam, Thang = thang };

            var scan = _config["Paths:ScanDocRoot"];
            var jobs = _config["Paths:JobsRoot"];

            string? NamCua(string? g) => string.IsNullOrWhiteSpace(g)
                ? null : Path.Combine(g, code, $"NAM{nam}");

            var sNam = NamCua(scan);
            var jNam = NamCua(jobs);
            var jKy = jNam == null ? null : Path.Combine(jNam, $"T{thang}_{nam}_{code}");

            // ----- XML -----
            k.XmlRa = Quet(k.DaDo, "*.xml",
                sNam == null ? null : Path.Combine(sNam, "xmls_only", "ra", $"t{thang}"),
                sNam == null ? null : Path.Combine(sNam, $"RA_T{thang}_{nam}"),
                jKy  == null ? null : Path.Combine(jKy, "raw", "RA"));

            k.XmlVao = Quet(k.DaDo, "*.xml",
                sNam == null ? null : Path.Combine(sNam, "xmls_only", "vao", $"t{thang}"),
                sNam == null ? null : Path.Combine(sNam, $"VAO_T{thang}_{nam}"),
                jKy  == null ? null : Path.Combine(jKy, "raw", "VAO"));

            // ----- HTML (bản hóa đơn để người dùng xem lại) -----
            k.HtmlRa = Quet(k.DaDo, "*.htm*",
                sNam == null ? null : Path.Combine(sNam, $"RA_T{thang}_{nam}"));

            k.HtmlVao = Quet(k.DaDo, "*.htm*",
                sNam == null ? null : Path.Combine(sNam, $"VAO_T{thang}_{nam}"));

            // ----- Excel bảng kê của cổng TCT -----
            k.ExcelRa = Quet(k.DaDo, "*.xlsx",
                jKy == null ? null : Path.Combine(jKy, "raw", "RA"));

            k.ExcelVao = Quet(k.DaDo, "*.xlsx",
                jKy == null ? null : Path.Combine(jKy, "raw", "VAO"));

            return k;
        }

        // Danh tính hóa đơn theo BR-HD-01: hướng + MST đối tác + ký hiệu + số HĐ.
        // KHÔNG dùng ma_hd vì file XML không có sẵn, phải tự ghép — mà ghép sai một
        // dấu gạch là ra hai danh tính khác nhau cho cùng một hóa đơn.
        private static string Khoa(string huong, string mst, string khhd, string soHd)
            => $"{huong}|{mst?.Trim()}|{khhd?.Trim()}|{ImportService.ChuanSoHd(soHd ?? "")}";

        // MST chỉ so phần SỐ: cổng TCT khai chi nhánh dạng "0100686174-634" còn hồ sơ
        // đơn vị thường chỉ ghi "0100686174". So nguyên chuỗi thì mọi hóa đơn chi
        // nhánh đều lệch hướng.
        //
        // public vì ToKhaiService cũng cần khi kiểm khuôn có đúng của đơn vị này không.
        public static string GocMst(string? mst)
        {
            var s = (mst ?? "").Trim();
            var gach = s.IndexOf('-');
            return (gach > 0 ? s[..gach] : s).Trim();
        }

        /// <summary>
        /// Suy HƯỚNG của một hóa đơn đọc từ file: MST người bán trùng MST đơn vị đang
        /// đăng nhập thì đơn vị là bên BÁN (hóa đơn RA), khác thì là bên MUA (VÀO).
        /// </summary>
        /// <remarks>
        /// Nhờ hàm này mà rà soát chạy được CẢ HAI CHIỀU trong một lượt. Trước đây bắt
        /// người dùng chọn sẵn một hướng, mà bước "có trong sổ, không có file" lại soi
        /// toàn bộ hóa đơn của kỳ — chọn "Mua vào" thì mọi hóa đơn bán ra đều bị báo
        /// thiếu oan, và ngược lại.
        ///
        /// Không biết MST đơn vị (hồ sơ bỏ trống) thì trả null: tầng gọi sẽ giữ nguyên
        /// hướng do người dùng chỉ định, thà quay lại cách cũ còn hơn đoán bừa.
        /// </remarks>
        public static string? SuyHuong(string? mstNguoiBan, string? mstDonVi)
        {
            var dv = GocMst(mstDonVi);
            if (dv.Length == 0) return null;
            return GocMst(mstNguoiBan) == dv ? "RA" : "VAO";
        }

        /// <summary>
        /// So danh sách hóa đơn đọc từ file với sổ của kỳ. Trả về các vấn đề tìm được.
        /// </summary>
        /// <param name="thang">Kỳ đang soát; null = cả năm.</param>
        public async Task<KetQuaRaSoatDto> Soat(
            string code, int year, int? thang, IReadOnlyList<HoaDonFileDto> tuFile,
            CancellationToken huy = default)
        {
            var kq = new KetQuaRaSoatDto { Nam = year, Thang = thang };

            // ---------- 1. Đọc sổ ----------
            // Sức chứa đặt sẵn theo số hóa đơn trong file: Dictionary mặc định bắt đầu
            // từ 0 rồi cấp phát lại và băm lại toàn bộ mỗi lần đầy — với vài nghìn hóa
            // đơn là cả chục lượt như vậy.
            var trongSo = new Dictionary<string, HoaDonSoDto>(
                Math.Max(tuFile.Count, 64), StringComparer.OrdinalIgnoreCase);
            using (var conn = new SqlConnection(_resolver.GetTenantConnection(code, year)))
            {
                await conn.OpenAsync(huy);
                // CAST DECIMAL: kiểu cột không đồng nhất giữa các DB đơn vị (xem chú
                // thích ở SqlHoaDonKy) — GetDecimal trên cột INT ném InvalidCastException.
                var sql = @"
                    SELECT h.ma_hd, h.huong, h.mst, h.khhd, h.so_hd, h.ngay, h.thang,
                           h.ten_kh,
                           CAST(ISNULL(l.tien_hang, 0) AS DECIMAL(18,4)) AS tien_hang,
                           CAST(ISNULL(h.tien_vat, 0)  AS DECIMAL(18,4)) AS tien_vat
                      FROM HOA_DON h
                      OUTER APPLY (
                            SELECT SUM(ISNULL(x.so_luong,0) * ISNULL(x.don_gia,0)) AS tien_hang
                              FROM HOA_DON_LINE x WHERE x.ma_hd = h.ma_hd
                      ) l"
                    + (thang is > 0 ? " WHERE h.thang = @thang" : "");

                using var cmd = new SqlCommand(sql, conn);
                if (thang is > 0) cmd.Parameters.AddWithValue("@thang", thang);

                using var r = await cmd.ExecuteReaderAsync(huy);
                while (await r.ReadAsync(huy))
                {
                    var hd = new HoaDonSoDto
                    {
                        MaHd     = r.GetString(0),
                        Huong    = r.IsDBNull(1) ? "" : r.GetString(1),
                        Mst      = r.IsDBNull(2) ? "" : r.GetString(2),
                        Khhd     = r.IsDBNull(3) ? "" : r.GetString(3),
                        SoHd     = r.IsDBNull(4) ? "" : r.GetString(4),
                        Ngay     = r.IsDBNull(5) ? null : r.GetDateTime(5),
                        Thang    = r.IsDBNull(6) ? null : r.GetInt32(6),
                        TenKh    = r.IsDBNull(7) ? "" : r.GetString(7),
                        TienHang = r.GetDecimal(8),
                        TienVat  = r.GetDecimal(9),
                    };
                    var k = Khoa(hd.Huong, hd.Mst, hd.Khhd, hd.SoHd);

                    // TRÙNG TRONG SỔ: hai dòng cùng danh tính BR-HD-01. Lẽ ra index
                    // UX_HOA_DON_BR01 chặn rồi, nhưng DB cũ có thể chưa có index đó.
                    if (trongSo.TryGetValue(k, out var daCo))
                    {
                        kq.Trung.Add(new VanDeDto
                        {
                            Loai = "trung-so",
                            MaHd = hd.MaHd,
                            Khhd = hd.Khhd, SoHd = hd.SoHd, Mst = hd.Mst,
                            TenDoiTac = hd.TenKh,
                            MoTa = $"Sổ có 2 dòng cùng danh tính (mã kia: {daCo.MaHd})",
                        });
                        continue;
                    }
                    trongSo[k] = hd;
                }
            }

            // ---------- 2. Gom file, bắt trùng NGAY TRONG FILE ----------
            var trongFile = new Dictionary<string, HoaDonFileDto>(
                Math.Max(tuFile.Count, 64), StringComparer.OrdinalIgnoreCase);
            foreach (var f in tuFile)
            {
                var k = Khoa(f.Huong, f.Mst, f.Khhd, f.SoHd);
                if (trongFile.TryGetValue(k, out var daCo))
                {
                    kq.Trung.Add(new VanDeDto
                    {
                        Loai = "trung-file",
                        Khhd = f.Khhd, SoHd = f.SoHd, Mst = f.Mst,
                        TenDoiTac = f.TenDoiTac,
                        MoTa = $"Hai file cùng một hóa đơn: {daCo.TenFile} và {f.TenFile}",
                    });
                    continue;
                }
                trongFile[k] = f;
            }

            // ---------- 3. Đối chiếu hai bên ----------
            foreach (var (k, f) in trongFile)
            {
                if (!trongSo.TryGetValue(k, out var s))
                {
                    // CÓ FILE, CHƯA VÀO SỔ — thiếu bao nhiêu HĐ thì khai thiếu bấy nhiêu
                    kq.ThieuTrongSo.Add(new VanDeDto
                    {
                        Loai = "thieu-trong-so",
                        Khhd = f.Khhd, SoHd = f.SoHd, Mst = f.Mst,
                        TenDoiTac = f.TenDoiTac,
                        Ngay = f.Ngay, Huong = f.Huong,
                        TienHangFile = f.TienHang, TienVatFile = f.TienVat,
                        TenFile = f.TenFile,
                        MoTa = "Có trong file nhưng chưa nạp vào sổ",
                    });
                    continue;
                }

                // LỆCH TIỀN. Ngưỡng 1 đồng: tiền hàng gộp từ Σ(SL × ĐG) nên sai số làm
                // tròn vài hào là bình thường, báo hết thì nhiễu không đọc nổi.
                var lechHang = Math.Abs(s.TienHang - f.TienHang);
                var lechVat  = Math.Abs(s.TienVat - f.TienVat);
                if (lechHang >= 1m || lechVat >= 1m)
                {
                    kq.LechTien.Add(new VanDeDto
                    {
                        Loai = "lech-tien",
                        MaHd = s.MaHd,
                        Khhd = f.Khhd, SoHd = f.SoHd, Mst = f.Mst,
                        TenDoiTac = f.TenDoiTac,
                        Ngay = f.Ngay, Huong = f.Huong,
                        TienHangFile = f.TienHang, TienVatFile = f.TienVat,
                        TienHangSo = s.TienHang, TienVatSo = s.TienVat,
                        MoTa = lechHang >= 1m && lechVat >= 1m ? "Lệch cả tiền hàng và VAT"
                             : lechHang >= 1m ? $"Lệch tiền hàng {lechHang:N0}"
                             : $"Lệch tiền VAT {lechVat:N0}",
                    });
                }

                // SAI KỲ KÊ KHAI: cột thang của sổ khác tháng đang soát.
                // KHÔNG so với tháng của NGÀY hóa đơn — HĐ ngày 28/6 kê khai tháng 7 là
                // chuyện thường và hoàn toàn hợp lệ. Chỉ báo khi lệch với kỳ đang soát.
                if (thang is > 0 && s.Thang != thang)
                {
                    kq.SaiKy.Add(new VanDeDto
                    {
                        Loai = "sai-ky",
                        MaHd = s.MaHd,
                        Khhd = f.Khhd, SoHd = f.SoHd, Mst = f.Mst,
                        TenDoiTac = f.TenDoiTac,
                        Ngay = f.Ngay, Huong = f.Huong,
                        MoTa = $"Sổ ghi kỳ kê khai tháng {s.Thang?.ToString() ?? "(trống)"}, "
                             + $"đang soát tháng {thang}",
                    });
                }
            }

            // ---------- 4. Có trong sổ mà không có file ----------
            // KHÔNG phải lúc nào cũng là lỗi: người dùng có thể chỉ tải lên file của
            // một phần. Vì vậy xếp riêng và ghi rõ, không gộp chung với "thiếu".
            foreach (var (k, s) in trongSo)
            {
                if (trongFile.ContainsKey(k)) continue;
                kq.ThieuTrongFile.Add(new VanDeDto
                {
                    Loai = "thieu-trong-file",
                    MaHd = s.MaHd,
                    Khhd = s.Khhd, SoHd = s.SoHd, Mst = s.Mst,
                    TenDoiTac = s.TenKh,
                    Ngay = s.Ngay?.ToString("yyyy-MM-dd"),
                    Huong = s.Huong,
                    TienHangSo = s.TienHang, TienVatSo = s.TienVat,
                    MoTa = "Có trong sổ nhưng không thấy trong file vừa tải",
                });
            }

            kq.SoHdFile = trongFile.Count;
            kq.SoHdSo = trongSo.Count;
            return kq;
        }

        // ============ ĐỌC BẢNG KÊ EXCEL CỦA CỔNG TCT ============
        //
        // File "DANH SÁCH HÓA ĐƠN" tải từ cổng hoadondientu.gdt.gov.vn. Khảo sát mẫu
        // thật HD_VAO/HD_RA_NHAT_TUAN_T6.xlsx (13/08):
        //   dòng 3   : tiêu đề "DANH SÁCH HÓA ĐƠN"
        //   dòng 4   : "Từ ngày dd/MM/yyyy đến ngày dd/MM/yyyy"
        //   dòng 6   : HEADER cột
        //   dòng 7+  : dữ liệu
        //   cột 3=ký hiệu HĐ, 4=số HĐ, 5=ngày lập, 6=MST người bán, 7=tên người bán,
        //        11=tổng tiền chưa thuế, 12=tổng tiền thuế, 13=tổng tiền chiết khấu
        //
        // KHÔNG dựa vào số dòng cứng: cổng đổi bố cục là hỏng hết. Dò dòng header theo
        // chữ "STT" rồi lấy vị trí cột theo TÊN — đổi thứ tự cột vẫn đọc đúng.
        private static readonly (string Khoa, string[] Tu)[] CotBangKe =
        {
            ("khhd",     new[] { "ký hiệu hóa đơn", "ky hieu hoa don" }),
            ("sohd",     new[] { "số hóa đơn", "so hoa don" }),
            ("ngay",     new[] { "ngày lập", "ngay lap" }),
            ("mstban",   new[] { "mst người bán", "mst nguoi ban" }),
            ("tenban",   new[] { "tên người bán", "ten nguoi ban" }),
            ("mstmua",   new[] { "mst người mua", "mst nguoi mua" }),
            ("tenmua",   new[] { "tên người mua", "ten nguoi mua" }),
            ("tienhang", new[] { "tổng tiền chưa thuế", "tong tien chua thue" }),
            ("tienvat",  new[] { "tổng tiền thuế", "tong tien thue" }),
            ("tienck",   new[] { "tổng tiền chiết khấu", "tong tien chiet khau" }),
        };

        /// <summary>
        /// Đọc bảng kê Excel của cổng TCT thành danh sách hóa đơn để đối chiếu.
        /// </summary>
        /// <param name="mstDonVi">
        /// MST đơn vị đang đăng nhập — để suy hướng từng dòng (trùng MST người bán thì
        /// là hóa đơn RA). Bỏ trống thì mọi dòng để hướng rỗng, tầng gọi tự quyết.
        /// </param>
        public static List<HoaDonFileDto> DocBangKeExcel(
            Stream noiDung, string tenFile, string? mstDonVi)
        {
            var ds = new List<HoaDonFileDto>();
            using var wb = new XLWorkbook(noiDung);
            var ws = wb.Worksheets.FirstOrDefault();
            if (ws == null) return ds;

            // --- Tìm dòng header: dòng đầu tiên có ô "STT" ---
            int dongHeader = 0;
            var cuoi = Math.Min(ws.LastRowUsed()?.RowNumber() ?? 0, 30);
            for (int r = 1; r <= cuoi && dongHeader == 0; r++)
                for (int c = 1; c <= 5; c++)
                    if (string.Equals(ws.Cell(r, c).GetString().Trim(), "STT",
                                      StringComparison.OrdinalIgnoreCase))
                    { dongHeader = r; break; }

            if (dongHeader == 0) return ds;     // không phải bảng kê của cổng

            // --- Ánh xạ tên cột → chỉ số cột ---
            var viTri = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
            var soCot = ws.LastColumnUsed()?.ColumnNumber() ?? 0;
            for (int c = 1; c <= soCot; c++)
            {
                var ten = ws.Cell(dongHeader, c).GetString().Trim().ToLowerInvariant();
                if (ten.Length == 0) continue;
                foreach (var (khoa, tu) in CotBangKe)
                    if (!viTri.ContainsKey(khoa) && tu.Any(t => ten.StartsWith(t)))
                        viTri[khoa] = c;
            }
            if (!viTri.ContainsKey("sohd")) return ds;

            string S(IXLRow r, string khoa) =>
                viTri.TryGetValue(khoa, out var c) ? r.Cell(c).GetString().Trim() : "";

            // Ô tiền có thể là chữ: mẫu thật có dòng ghi "TT HD 1004" ngay cột chiết
            // khấu. GetString + TryParse thì gặp chữ trả 0, không ném lỗi làm chết mẻ.
            decimal D(IXLRow r, string khoa)
            {
                if (!viTri.TryGetValue(khoa, out var c)) return 0m;
                var o = r.Cell(c);
                if (o.TryGetValue<double>(out var d)) return (decimal)d;
                return decimal.TryParse(o.GetString().Trim(), NumberStyles.Any,
                                        CultureInfo.InvariantCulture, out var v) ? v : 0m;
            }

            var cuoiBang = ws.LastRowUsed()?.RowNumber() ?? dongHeader;
            for (int r = dongHeader + 1; r <= cuoiBang; r++)
            {
                var dong = ws.Row(r);
                var soHd = S(dong, "sohd");
                if (soHd.Length == 0) continue;         // dòng trống hoặc dòng tổng

                var mstBan = S(dong, "mstban");
                var huong = SuyHuong(mstBan, mstDonVi) ?? "";

                // Đối tác là bên KIA của giao dịch: HĐ ra thì đối tác là người mua.
                var laRa = huong == "RA";

                ds.Add(new HoaDonFileDto
                {
                    TenFile   = tenFile,
                    Huong     = huong,
                    Mst       = laRa ? S(dong, "mstmua") : mstBan,
                    TenDoiTac = laRa ? S(dong, "tenmua") : S(dong, "tenban"),
                    Khhd      = S(dong, "khhd"),
                    SoHd      = soHd,
                    Ngay      = ChuanNgay(S(dong, "ngay")),
                    TienHang  = D(dong, "tienhang"),
                    TienVat   = D(dong, "tienvat"),
                });
            }
            return ds;
        }

        // Cổng ghi ngày dd/MM/yyyy; sổ dùng ISO. Không parse được thì trả null chứ
        // không đoán — ngày sai còn tệ hơn ngày trống.
        private static string? ChuanNgay(string s)
        {
            if (string.IsNullOrWhiteSpace(s)) return null;
            foreach (var m in new[] { "dd/MM/yyyy", "d/M/yyyy", "yyyy-MM-dd" })
                if (DateTime.TryParseExact(s.Trim(), m, CultureInfo.InvariantCulture,
                                           DateTimeStyles.None, out var d))
                    return d.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
            return DateTime.TryParse(s, CultureInfo.InvariantCulture,
                                     DateTimeStyles.None, out var v)
                ? v.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture) : null;
        }

        /// <summary>
        /// Quét một THƯ MỤC TRÊN MÁY CHỦ, đọc mọi file .xml (kể cả thư mục con) và
        /// dựng danh sách hóa đơn để đối chiếu. Dùng cho kho XML đã tải sẵn về server.
        /// </summary>
        /// <remarks>
        /// CHẶN ĐƯỜNG DẪN LẠ: chỉ cho quét trong các gốc đã khai ở appsettings
        /// (Paths:ScanDocRoot, Paths:RawRoot). Không có rào này thì ai gửi được
        /// request là đọc được C:\Windows\... — đường dẫn đến thẳng từ client.
        /// </remarks>
        public static Task<List<HoaDonFileDto>> QuetThuMuc(
            string thuMuc, IEnumerable<string> gocChoPhep,
            CancellationToken huy = default)
        {
            var duong = Path.GetFullPath(thuMuc);

            bool trongGoc = gocChoPhep
                .Where(g => !string.IsNullOrWhiteSpace(g))
                .Select(g => Path.GetFullPath(g))
                .Any(g => duong.StartsWith(g, StringComparison.OrdinalIgnoreCase));
            if (!trongGoc)
                throw new UnauthorizedAccessException(
                    "Thư mục nằm ngoài kho dữ liệu đã khai — không được phép quét");

            if (!Directory.Exists(duong))
                throw new DirectoryNotFoundException($"Không thấy thư mục {duong}");

            return DocNhieuXml(
                Directory.EnumerateFiles(duong, "*.xml", SearchOption.AllDirectories),
                huy);
        }

        /// <summary>
        /// Đọc NHIỀU bảng kê Excel của một kỳ, khử trùng rồi trả về một danh sách.
        /// </summary>
        /// <remarks>
        /// KHỬ TRÙNG theo (hướng, ký hiệu, số HĐ) là bắt buộc: kho có nhiều bản cắt của
        /// cùng một kỳ (…_MTT máy tính tiền, …_CM có mã, …_KM khuyến mại) và chúng
        /// chồng lấn nhau. Cộng thẳng là nhân đôi doanh thu, tờ khai sai ngay từ gốc.
        ///
        /// Chạy trên thread pool: ClosedXML đọc file ĐỒNG BỘ, mỗi bảng kê vài nghìn
        /// dòng. Gọi thẳng trong controller sẽ giữ luồng phục vụ request suốt lúc đó.
        ///
        /// Đọc TUẦN TỰ chứ không song song như XML: mỗi workbook ngốn nhiều bộ nhớ, mở
        /// 5 file cùng lúc dễ đội RAM hơn là tiết kiệm được thời gian; số file Excel
        /// mỗi kỳ cũng chỉ đếm trên đầu ngón tay.
        /// </remarks>
        public static Task<(List<HoaDonFileDto> HoaDon, List<string> Loi)> DocNhieuBangKe(
            IEnumerable<string> duongDan, string? mstDonVi, CancellationToken huy = default)
            => Task.Run(() =>
            {
                var daCo = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                var hoaDon = new List<HoaDonFileDto>();
                var loi = new List<string>();

                foreach (var f in duongDan)
                {
                    huy.ThrowIfCancellationRequested();
                    try
                    {
                        using var fs = File.OpenRead(f);
                        foreach (var h in DocBangKeExcel(fs, Path.GetFileName(f), mstDonVi))
                            if (daCo.Add($"{h.Huong}|{h.Khhd}|{ImportService.ChuanSoHd(h.SoHd)}"))
                                hoaDon.Add(h);
                    }
                    catch (Exception ex)
                    {
                        loi.Add($"{Path.GetFileName(f)}: {ex.Message}");
                    }
                }
                return (hoaDon, loi);
            }, huy);

        /// <summary>
        /// Đọc nhiều file XML hóa đơn SONG SONG, trả về danh sách đã lọc file hỏng.
        /// </summary>
        /// <remarks>
        /// Vì sao phải song song: một kỳ của NHAT_TUAN có 425 file XML (350 ra + 75 vào).
        /// Đọc tuần tự thì mỗi file phải chờ đĩa trả xong mới sang file sau — tổng thời
        /// gian bằng TỔNG độ trễ của 425 lượt đọc. Chạy song song thì đĩa và CPU cùng
        /// làm việc, thời gian rút xuống còn cỡ lượt chậm nhất nhân số lô.
        ///
        /// Chạy trên thread pool bằng Task.Run: XDocument.Load là I/O ĐỒNG BỘ, gọi thẳng
        /// trong action của controller sẽ giữ luôn luồng phục vụ request suốt cả quá
        /// trình — vài request cùng lúc là nghẽn cả server.
        ///
        /// Giới hạn song song theo số CPU: thả hết 425 tác vụ cùng lúc thì tranh đĩa,
        /// đổi ngữ cảnh liên tục, chậm hơn cả tuần tự.
        /// </remarks>
        private static async Task<List<HoaDonFileDto>> DocNhieuXml(
            IEnumerable<string> duongDan, CancellationToken huy = default)
        {
            var ds = duongDan.ToList();
            if (ds.Count == 0) return new List<HoaDonFileDto>();

            // Ít file thì chi phí dựng tác vụ còn đắt hơn chính việc đọc — làm thẳng.
            if (ds.Count < 8)
                return ds.Select(DocXml).OfType<HoaDonFileDto>().ToList();

            var ket = new HoaDonFileDto?[ds.Count];
            var songSong = Math.Min(Environment.ProcessorCount, 8);

            await Parallel.ForEachAsync(
                Enumerable.Range(0, ds.Count),
                new ParallelOptions
                {
                    MaxDegreeOfParallelism = songSong,
                    CancellationToken = huy,
                },
                // Ghi vào MẢNG theo chỉ số, không List.Add: List không an toàn khi
                // nhiều luồng cùng thêm — mất phần tử hoặc ném lỗi lúc mở rộng mảng.
                // Ghi theo chỉ số còn giữ nguyên thứ tự file, kết quả ổn định giữa
                // các lần chạy.
                (i, _) =>
                {
                    ket[i] = DocXml(ds[i]);   // file hỏng trả null, không chặn cả mẻ
                    return ValueTask.CompletedTask;
                });

            return ket.OfType<HoaDonFileDto>().ToList();
        }

        // Bộ đọc XML hóa đơn TCT. Rút gọn từ ImportService.DocXmlHoaDon — ở đây chỉ
        // cần đủ để ĐỊNH DANH và SO TIỀN, không cần dòng hàng.
        //
        // HƯỚNG suy từ MST: file XML không ghi "vào" hay "ra", mà cùng một file có
        // thể là HĐ ra của bên này và HĐ vào của bên kia. Ở đây chưa biết MST của
        // đơn vị đang đăng nhập nên để trống, phần gán hướng làm ở tầng gọi.
        private static HoaDonFileDto? DocXml(string path)
        {
            try
            {
                var doc = System.Xml.Linq.XDocument.Load(path);
                var dl = doc.Root?.Element("DLHDon");
                var chung = dl?.Element("TTChung");
                var nd = dl?.Element("NDHDon");
                if (chung == null || nd == null) return null;

                string V(System.Xml.Linq.XElement? e, string n) => e?.Element(n)?.Value?.Trim() ?? "";
                decimal D(System.Xml.Linq.XElement? e, string n) =>
                    decimal.TryParse(V(e, n), System.Globalization.NumberStyles.Any,
                        System.Globalization.CultureInfo.InvariantCulture, out var v) ? v : 0m;

                var ban = nd.Element("NBan");
                var tt = nd.Element("TToan");

                decimal tienVat = D(tt, "TgTThue");
                decimal tongTien = D(tt, "TgTTTBSo");
                decimal tienHang = D(tt, "TgTCThue");
                // HĐ không chịu thuế thường không khai TgTCThue — suy ngược từ tổng.
                // Cùng cách xử lý với ImportService, nếu không mọi HĐ loại này đều
                // báo lệch oan.
                if (tienHang == 0) tienHang = tongTien - tienVat;

                return new HoaDonFileDto
                {
                    TenFile = Path.GetFileName(path),
                    Huong = "",                       // tầng gọi gán
                    Mst = V(ban, "MST"),
                    Khhd = V(chung, "KHHDon"),
                    SoHd = V(chung, "SHDon"),
                    Ngay = V(chung, "NLap"),
                    TenDoiTac = V(ban, "Ten"),
                    TienHang = tienHang,
                    TienVat = tienVat,
                };
            }
            catch { return null; }
        }
    }


    // ============ LẬP TỜ KHAI THUẾ GTGT 01/GTGT (TT80) ============
    //
    // Spec: docs/NB/SPEC-TO-KHAI-01-GTGT.md
    //
    // CHỈ ĐỌC sổ. Engine này chạy ngay trước kỳ nộp tờ khai, một câu UPDATE nhầm là
    // hỏng số của cả tờ khai — cùng lý do RaSoatService không được phép ghi.
    //
    // Ba nguồn số liệu:
    //   1. HOA_DON / HOA_DON_LINE  → chỉ tiêu phát sinh trong kỳ (ct23…ct35)
    //   2. XML tờ khai kỳ TRƯỚC     → ct22 (BR-TK-02), không được đoán
    //   3. Khuôn tờ khai của đơn vị → thông tin NNT, cơ quan thuế (§6 spec)
    public class ToKhaiService
    {
        private readonly TenantDbResolver _resolver;
        private readonly IConfiguration _config;

        public ToKhaiService(TenantDbResolver resolver, IConfiguration config)
        {
            _resolver = resolver;
            _config = config;
        }

        // ---------- Đọc số liệu phát sinh trong kỳ ----------

        // Một hóa đơn kèm tổng tiền hàng gộp của nó. Gom ở SQL chứ không kéo hết dòng
        // về rồi cộng trong C#: kỳ nhiều nghìn dòng, để SQL cộng vẫn nhanh hơn hẳn.
        private sealed class HoaDonKy
        {
            public string MaHd = "";
            public string Huong = "";
            public decimal Vat;          // %VAT ghi ở header
            public decimal TienVat;      // VAT thực của hóa đơn — NGUỒN CHUẨN (BR-TK-01)
            public decimal TienCk;
            public decimal TienHangGop;  // Σ(so_luong × don_gia), CHƯA trừ chiết khấu
        }

        // Một nhóm dòng theo thuế suất trong MỘT hóa đơn — để phân bổ chiết khấu.
        private sealed class DongTheoSuat
        {
            public string MaHd = "";
            public decimal PtVat;
            public string? LoaiThue;
            public int SoDong;
            public decimal TienHang;
        }

        // ÉP KIỂU DECIMAL NGAY TRONG SQL cho MỌI cột số.
        //
        // Kiểu cột không đồng nhất giữa các bảng: HOA_DON.vat là INT còn tien_vat /
        // tien_ck / pt_vat là DECIMAL (đo thật trên NHAT_TUAN_2026). SqlDataReader
        // KHÔNG tự chuyển kiểu — GetDecimal trên cột INT ném thẳng InvalidCastException
        // lúc chạy, mà chỉ lộ ra khi có dữ liệu thật nên build vẫn xanh.
        //
        // Ép ở SQL chứ không đổi sang GetInt32 bên C#: DB đơn vị được dựng từ nhiều
        // đời script khác nhau, cùng một cột có thể INT ở đơn vị này mà DECIMAL ở đơn
        // vị kia. Ép kiểu thì đọc bằng GetDecimal luôn đúng, không cần dò từng DB.
        // BR-TK-05 — CHIẾT KHẤU NẰM NGAY TRONG DÒNG HÀNG, phải loại ra trước khi cộng.
        //
        // Đo thật NHAT_TUAN T7 (13/08): chiết khấu được ghi thành DÒNG RIÊNG với
        // tinh_chat = '3' (mã hàng TPCK.*, tên "Chiết khấu bán ra", "Chiết khấu 3%"…).
        // Hóa đơn VAO_...C26TCA_0008400 có 3 dòng hàng thật 70.944.368 và 7 dòng chiết
        // khấu 66.442.293 — tổng dòng chiết khấu ĐÚNG BẰNG h.tien_ck của header.
        //
        // Nghĩa là Σ(so_luong × don_gia) ĐÃ TRỪ chiết khấu sẵn rồi. Trừ thêm tien_ck
        // nữa là trừ HAI LẦN: sai 15.995.333 đ trên toàn kỳ mua vào.
        //
        // Lọc tinh_chat = '3' ra khỏi tiền hàng, rồi tầng C# trừ tien_ck một lần duy
        // nhất. Kiểm chứng trên T7: bán ra lệch 0 đ, mua vào lệch 3 đ (làm tròn).
        private const string SqlHoaDonKy = @"
            SELECT h.ma_hd, h.huong,
                   CAST(ISNULL(h.vat, 0)      AS DECIMAL(18,4)),
                   CAST(ISNULL(h.tien_vat, 0) AS DECIMAL(18,4)),
                   CAST(ISNULL(h.tien_ck, 0)  AS DECIMAL(18,4)),
                   CAST(ISNULL(l.tien_hang,0) AS DECIMAL(18,4))
              FROM HOA_DON h
              OUTER APPLY (
                    SELECT SUM(CASE WHEN ISNULL(x.tinh_chat, '1') = '3' THEN 0
                                    ELSE ISNULL(x.so_luong, 0) * ISNULL(x.don_gia, 0)
                               END) AS tien_hang
                      FROM HOA_DON_LINE x WHERE x.ma_hd = h.ma_hd
              ) l
             WHERE h.thang = @thang";

        // loai_thue chỉ có sau script 017. DB chưa vá thì cột không tồn tại và câu này
        // nổ — nên phải dò trước, y như ImportService làm.
        // Loại dòng chiết khấu (tinh_chat='3') y như SqlHoaDonKy — xem BR-TK-05 ở trên.
        // Không loại thì nhóm thuế suất nào có dòng chiết khấu sẽ phình tiền hàng, kéo
        // theo tỷ trọng phân bổ sai và doanh thu từng nhóm lệch hẳn.
        private static string SqlDongTheoSuat(bool coLoaiThue) => $@"
            SELECT h.ma_hd,
                   CAST(ISNULL(l.pt_vat, 0) AS DECIMAL(18,4)),
                   {(coLoaiThue ? "MAX(l.loai_thue)" : "CAST(NULL AS NVARCHAR(10))")},
                   COUNT(*),
                   CAST(SUM(ISNULL(l.so_luong, 0) * ISNULL(l.don_gia, 0))
                        AS DECIMAL(18,4))
              FROM HOA_DON h
              JOIN HOA_DON_LINE l ON l.ma_hd = h.ma_hd
             WHERE h.thang = @thang AND h.huong = @huong
               AND ISNULL(l.tinh_chat, '1') <> '3'
             GROUP BY h.ma_hd, ISNULL(l.pt_vat, 0)";

        private static async Task<bool> CoCot(SqlConnection c, string bang, string cot)
        {
            using var cmd = new SqlCommand(
                "SELECT COL_LENGTH(@b, @c)", c);
            cmd.Parameters.AddWithValue("@b", bang);
            cmd.Parameters.AddWithValue("@c", cot);
            var v = await cmd.ExecuteScalarAsync();
            return v != null && v != DBNull.Value;
        }

        /// <summary>
        /// Lập tờ khai 01/GTGT cho một kỳ. KHÔNG ghi gì vào sổ.
        /// </summary>
        /// <param name="xmlKyTruoc">
        /// Nội dung XML tờ khai kỳ TRƯỚC do người dùng tải lên. Có giá trị thì ưu tiên
        /// dùng, không cần file nằm sẵn trong SCAN_DOC — đây là đường đi CHÍNH khi kế
        /// toán làm tờ khai lần đầu, lúc kho tờ khai gốc chưa được dựng.
        /// </param>
        public async Task<ToKhaiGtgtDto> Lap(string code, int year, int thang,
                                             string mst, string tenNnt, string? diaChi,
                                             string? xmlKyTruoc = null)
        {
            var tk = new ToKhaiGtgtDto
            {
                Nam = year, Thang = thang, MaDonVi = code,
                Mst = mst, TenNnt = tenNnt, DiaChiNnt = diaChi,
                TenFileXml = TenFileXml(mst, thang, year),
            };

            using var conn = new SqlConnection(_resolver.GetTenantConnection(code, year));
            await conn.OpenAsync();

            var coLoaiThue = await CoCot(conn, "HOA_DON_LINE", "loai_thue");
            if (!coLoaiThue)
                tk.CanhBao.Add(new CanhBaoToKhaiDto
                {
                    Ma = "KT-08", Muc = "CANH_BAO",
                    MoTa = "Database chưa chạy script 017 nên chưa có cột loai_thue — "
                         + "hàng KHÔNG CHỊU THUẾ và thuế suất 0% không tách được, "
                         + "chỉ tiêu 26/32a có thể thiếu",
                });

            var hoaDon = await DocHoaDonKy(conn, thang);
            if (hoaDon.Count == 0)
                tk.CanhBao.Add(new CanhBaoToKhaiDto
                {
                    Ma = "KT-00", Muc = "CHAN",
                    MoTa = $"Kỳ tháng {thang}/{year} không có hóa đơn nào trong sổ",
                });

            var dongRa  = await DocDongTheoSuat(conn, thang, "RA", coLoaiThue);
            var dongVao = await DocDongTheoSuat(conn, thang, "VAO", coLoaiThue);

            tk.NhomBanRa  = PhanBo(hoaDon, dongRa,  "RA",  tk.CanhBao);
            tk.NhomMuaVao = PhanBo(hoaDon, dongVao, "VAO", tk.CanhBao);

            TinhChiTieu(tk, hoaDon);
            TinhPhuLucNq142(tk);
            NoiKyTruoc(tk, code, xmlKyTruoc);
            KiemTraCanDoi(tk);

            return tk;
        }

        private static async Task<List<HoaDonKy>> DocHoaDonKy(SqlConnection conn, int thang)
        {
            using var cmd = new SqlCommand(SqlHoaDonKy, conn);
            cmd.Parameters.AddWithValue("@thang", thang);
            var ds = new List<HoaDonKy>();
            using var r = await cmd.ExecuteReaderAsync();
            while (await r.ReadAsync())
                ds.Add(new HoaDonKy
                {
                    MaHd = r.GetString(0),
                    Huong = r.IsDBNull(1) ? "" : r.GetString(1),
                    Vat = r.GetDecimal(2),
                    TienVat = r.GetDecimal(3),
                    TienCk = r.GetDecimal(4),
                    TienHangGop = r.GetDecimal(5),
                });
            return ds;
        }

        private static async Task<List<DongTheoSuat>> DocDongTheoSuat(
            SqlConnection conn, int thang, string huong, bool coLoaiThue)
        {
            using var cmd = new SqlCommand(SqlDongTheoSuat(coLoaiThue), conn);
            cmd.Parameters.AddWithValue("@thang", thang);
            cmd.Parameters.AddWithValue("@huong", huong);
            var ds = new List<DongTheoSuat>();
            using var r = await cmd.ExecuteReaderAsync();
            while (await r.ReadAsync())
                ds.Add(new DongTheoSuat
                {
                    MaHd = r.GetString(0),
                    PtVat = r.GetDecimal(1),
                    LoaiThue = r.IsDBNull(2) ? null : r.GetString(2),
                    SoDong = r.GetInt32(3),
                    TienHang = r.GetDecimal(4),
                });
            return ds;
        }

        // ---------- BR-TK-03: gom theo THUẾ SUẤT CỦA HÓA ĐƠN, trừ chiết khấu ----------
        //
        // ĐỐI CHIẾU với tờ khai T7/2026 thật do HTKK sinh (test\tokhai\...M072026-L00.xml,
        private static List<NhomThueSuatDto> PhanBo(
            List<HoaDonKy> hoaDon, List<DongTheoSuat> dong, string huong,
            List<CanhBaoToKhaiDto> canhBao)
        {
            var dsHd = hoaDon.Where(h => h.Huong == huong).ToList();

            // loai_thue lấy từ dòng để phân biệt KCT / KKKNT / 0% — ba loại này cùng
            // thuế suất 0 nên chỉ nhìn con số thì không tách nổi (script 017 sinh ra
            // cột đó chính vì vậy). Lấy theo mã hóa đơn.
            var loaiTheoHd = dong
                .GroupBy(d => d.MaHd, StringComparer.OrdinalIgnoreCase)
                .ToDictionary(g => g.Key,
                              g => g.Select(x => x.LoaiThue).FirstOrDefault(x => x != null),
                              StringComparer.OrdinalIgnoreCase);

            var soDongTheoHd = dong
                .GroupBy(d => d.MaHd, StringComparer.OrdinalIgnoreCase)
                .ToDictionary(g => g.Key, g => g.Sum(x => x.SoDong),
                              StringComparer.OrdinalIgnoreCase);

            var gom = new Dictionary<decimal, NhomThueSuatDto>();

            foreach (var hd in dsHd)
            {
                if (!gom.TryGetValue(hd.Vat, out var n))
                    gom[hd.Vat] = n = new NhomThueSuatDto { ThueSuat = hd.Vat };

                n.TienHangGop += hd.TienHangGop;
                n.ChietKhau += hd.TienCk;
                n.SoDong += soDongTheoHd.TryGetValue(hd.MaHd, out var sd) ? sd : 0;
                n.LoaiThue ??= loaiTheoHd.TryGetValue(hd.MaHd, out var lt) ? lt : null;
            }

            foreach (var n in gom.Values)
            {
                n.DoanhThu = Math.Round(n.TienHangGop - n.ChietKhau, 0, MidpointRounding.AwayFromZero);
                n.ChietKhau = Math.Round(n.ChietKhau, 0, MidpointRounding.AwayFromZero);
                n.Thue = Math.Round(n.DoanhThu * n.ThueSuat / 100m, 0, MidpointRounding.AwayFromZero);
            }

            // BR-TK-03 bước 5: Σ thuế các nhóm PHẢI khớp Σ tien_vat của header.
            // Lệch nhỏ là do làm tròn từng nhóm — dồn vào nhóm doanh thu lớn nhất.
            // Lệch lớn nghĩa là dữ liệu có vấn đề, phải chặn chứ không được lặng lẽ ép.
            var thueHeader = dsHd.Sum(h => h.TienVat);
            var thueNhom = gom.Values.Sum(n => n.Thue);
            var lech = thueHeader - thueNhom;

            if (lech != 0 && gom.Count > 0)
            {
                var soHd = dsHd.Count;
                // Ngưỡng: mỗi hóa đơn lệch tối đa 5 đồng do làm tròn.
                if (Math.Abs(lech) <= Math.Max(5m * soHd, 100m))
                {
                    var lonNhat = gom.Values.OrderByDescending(n => n.DoanhThu).First();
                    lonNhat.Thue += lech;
                }
                else
                {
                    canhBao.Add(new CanhBaoToKhaiDto
                    {
                        Ma = "BR-TK-03", Muc = "CHAN",
                        MoTa = $"Thuế {(huong == "RA" ? "bán ra" : "mua vào")} cộng theo nhóm "
                             + $"({thueNhom:N0}) lệch với tổng tien_vat của hóa đơn "
                             + $"({thueHeader:N0}) — chênh {lech:N0} đ, vượt ngưỡng làm tròn",
                        ChenhLech = lech,
                    });
                }
            }

            return gom.Values.OrderBy(n => n.ThueSuat).ToList();
        }

        // ---------- Chỉ tiêu tờ khai chính (§3 spec) ----------
        private static void TinhChiTieu(ToKhaiGtgtDto tk, List<HoaDonKy> hoaDon)
        {
            var vao = hoaDon.Where(h => h.Huong == "VAO").ToList();
            var ra  = hoaDon.Where(h => h.Huong == "RA").ToList();

            // --- Mua vào ---
            // ct23 = tiền hàng SAU khi trừ chiết khấu; ct24 lấy từ HEADER (BR-TK-01)
            tk.Ct23 = Math.Round(vao.Sum(h => h.TienHangGop - h.TienCk), 0, MidpointRounding.AwayFromZero);
            tk.Ct24 = vao.Sum(h => h.TienVat);
            tk.Ct25 = tk.Ct24;      // khấu trừ toàn bộ — sổ chưa có chỗ đánh dấu HĐ loại trừ

            // --- Bán ra, tách theo nhóm thuế suất ---
            decimal Dt(Func<NhomThueSuatDto, bool> loc) =>
                tk.NhomBanRa.Where(loc).Sum(n => n.DoanhThu);
            decimal Th(Func<NhomThueSuatDto, bool> loc) =>
                tk.NhomBanRa.Where(loc).Sum(n => n.Thue);

            bool LaKkknt(NhomThueSuatDto n) =>
                string.Equals(n.LoaiThue, "KKKNT", StringComparison.OrdinalIgnoreCase);
            bool LaKct(NhomThueSuatDto n) =>
                string.Equals(n.LoaiThue, "KCT", StringComparison.OrdinalIgnoreCase);

            // ct32a: không phải kê khai nộp thuế (KKKNT) — tách trước để khỏi lẫn vào 0%
            tk.Ct32a = Dt(LaKkknt);
            // ct26: bán ra KHÔNG CHỊU THUẾ
            tk.Ct26 = Dt(LaKct);
            // ct29: thuế suất 0% — chỉ những nhóm thật sự 0%, đã trừ KCT và KKKNT
            tk.Ct29 = Dt(n => n.ThueSuat == 0 && !LaKct(n) && !LaKkknt(n));
            // ct30/31: 5%
            tk.Ct30 = Dt(n => n.ThueSuat == 5);
            tk.Ct31 = Th(n => n.ThueSuat == 5);

            // ct32/33: thuế suất 10% — GỒM CẢ hàng giảm còn 8% theo NQ142.
            // Đọc XML gốc T6 của NHAT_TUAN: ct32=3.002.937.025, ct33=240.298.016 (đúng 8%)
            // nhưng nút XML là HHDVBRaChiuTSuat10. Phần giảm 2% nằm riêng ở phụ lục.
            tk.Ct32 = Dt(n => n.ThueSuat is 8 or 10);
            tk.Ct33 = Th(n => n.ThueSuat is 8 or 10);

            // ct34/35: tổng bán ra
            tk.Ct34 = tk.Ct26 + tk.Ct29 + tk.Ct30 + tk.Ct32 + tk.Ct32a;
            tk.Ct35 = tk.Ct31 + tk.Ct33;

            // ct27/28: bán ra CHỊU THUẾ (không gồm KCT và KKKNT)
            tk.Ct27 = tk.Ct29 + tk.Ct30 + tk.Ct32;
            tk.Ct28 = tk.Ct35;

            // --- Kết quả kỳ ---
            tk.Ct36 = tk.Ct35 - tk.Ct25;
            tk.Ct42 = 0;                    // đề nghị hoàn: mặc định không
            tk.Ct21 = hoaDon.Count == 0 ? 1 : 0;

            // ct40/41/43 phụ thuộc ct22, mà ct22 chỉ biết được sau khi đọc XML kỳ
            // trước (NoiKyTruoc). Tính ở TinhLaiKetQua để CHỈ CÓ MỘT công thức, gọi
            // lại được sau khi ct22 đã có giá trị thật.
            TinhLaiKetQua(tk);
        }

        // ---------- Phụ lục NQ142 (§3.5 spec) ----------
        private static void TinhPhuLucNq142(ToKhaiGtgtDto tk)
        {
            // Nhóm ĐƯỢC GIẢM = hàng thuế suất gốc 10% đang bán ở 8%.
            var raGiam = tk.NhomBanRa.Where(n => n.ThueSuat == 8).ToList();
            if (raGiam.Count == 0) return;

            var vaoGiam = tk.NhomMuaVao.Where(n => n.ThueSuat == 8).ToList();

            var dtRa = raGiam.Sum(n => n.DoanhThu);
            var pl = new PhuLucNq142Dto
            {
                GiaTriHhdvBanRa = dtRa,
                // Giảm 2% = chênh giữa thuế suất quy định (10%) và sau giảm (8%)
                ThueGtgtDuocGiam = Math.Round(dtRa * 2m / 100m, 0, MidpointRounding.AwayFromZero),
                GiaTriHhdvMuaVao = vaoGiam.Sum(n => n.DoanhThu),
                ThueGtgtHhdvMuaVao = vaoGiam.Sum(n => n.Thue),
            };
            pl.ChenhLechCt9 = pl.GiaTriHhdvMuaVao - pl.GiaTriHhdvBanRa;
            tk.PhuLucNq142 = pl;

            // BR-TK-04: phụ lục không được vượt tờ khai chính
            if (pl.GiaTriHhdvBanRa > tk.Ct32)
                tk.CanhBao.Add(new CanhBaoToKhaiDto
                {
                    Ma = "BR-TK-04", Muc = "CHAN",
                    MoTa = $"Phụ lục NQ142 khai doanh thu {pl.GiaTriHhdvBanRa:N0} "
                         + $"vượt chỉ tiêu 32 của tờ khai chính ({tk.Ct32:N0})",
                    ChenhLech = pl.GiaTriHhdvBanRa - tk.Ct32,
                });
        }

        // ---------- BR-TK-02: nối kỳ, ct22 = ct43 kỳ trước ----------
        //
        // HAI NGUỒN, theo thứ tự ưu tiên:
        //   1. XML người dùng vừa TẢI LÊN  — đường đi chính khi kho tờ khai gốc chưa dựng
        //   2. File nằm sẵn trong SCAN_DOC — khi đã có kho tờ khai của đơn vị
        // Không nguồn nào có thì CHẶN. Tuyệt đối không đoán ct22: đoán sai một đồng là
        // lệch dây chuyền sang mọi kỳ sau, vì ct43 kỳ này thành ct22 kỳ sau.
        private void NoiKyTruoc(ToKhaiGtgtDto tk, string code, string? xmlKyTruoc)
        {
            var (thangTruoc, namTruoc) = tk.Thang == 1
                ? (12, tk.Nam - 1) : (tk.Thang - 1, tk.Nam);

            decimal? ct43 = null;
            string? nguon = null;

            // --- Nguồn 1: file tải lên ---
            if (!string.IsNullOrWhiteSpace(xmlKyTruoc))
            {
                var (so, ky) = DocCt43VaKy(xmlKyTruoc);
                if (so == null)
                    tk.CanhBao.Add(new CanhBaoToKhaiDto
                    {
                        Ma = "LK-02", Muc = "CHAN",
                        MoTa = "File XML tải lên không đọc được chỉ tiêu 43 — "
                             + "có đúng là tờ khai 01/GTGT không?",
                    });
                else
                {
                    // Kỳ trong file phải ĐÚNG là kỳ liền trước. Tải nhầm tờ khai tháng
                    // khác thì ct22 sai mà nhìn số vẫn hợp lý — phải chặn ngay tại đây.
                    var kyMong = $"{thangTruoc:00}/{namTruoc}";
                    if (ky != null && ky != kyMong)
                        tk.CanhBao.Add(new CanhBaoToKhaiDto
                        {
                            Ma = "LK-01", Muc = "CHAN",
                            MoTa = $"File tải lên là tờ khai kỳ {ky}, "
                                 + $"nhưng kỳ liền trước của tháng {tk.Thang}/{tk.Nam} "
                                 + $"phải là {kyMong}",
                        });
                    else
                    {
                        ct43 = so;
                        nguon = $"chỉ tiêu 43 trong file XML tải lên (kỳ {ky ?? kyMong})";
                    }
                }
            }

            // --- Nguồn 2: kho tờ khai gốc ---
            if (ct43 == null && !tk.CanhBao.Any(c => c.Ma is "LK-01" or "LK-02"))
            {
                var duong = TimXmlToKhai(code, thangTruoc, namTruoc);
                if (duong != null)
                {
                    var so = DocCt43(duong);
                    if (so != null)
                    {
                        ct43 = so;
                        nguon = $"chỉ tiêu 43 của tờ khai tháng {thangTruoc}/{namTruoc} "
                              + $"({Path.GetFileName(duong)})";
                    }
                }
            }

            if (ct43 == null)
            {
                if (!tk.CanhBao.Any(c => c.Ma is "LK-01" or "LK-02"))
                    tk.CanhBao.Add(new CanhBaoToKhaiDto
                    {
                        Ma = "LK-02", Muc = "CHAN",
                        MoTa = $"Chưa có tờ khai kỳ trước (tháng {thangTruoc}/{namTruoc}) — "
                             + "hãy tải file XML tờ khai kỳ đó lên để lấy chỉ tiêu 22",
                    });
                return;
            }

            tk.Ct22 = ct43.Value;
            tk.NguonCt22 = nguon;

            // ct22 đổi thì phần kết quả phải tính lại — nó là đầu vào của ct40/41.
            TinhLaiKetQua(tk);
        }

        /// <summary>
        /// Có tờ khai kỳ liền trước để làm nguồn ct22 và làm khuôn XML hay không.
        /// </summary>
        /// <remarks>
        /// Gọi TRƯỚC khi lập tờ khai. Không có thì chặn ngay, đừng lập ra một tờ khai
        /// thiếu chỉ tiêu 22 — mọi con số khác của nó vẫn trông hợp lý nên rất dễ bị
        /// tin nhầm là đúng.
        ///
        /// Chấp nhận HAI nguồn, đúng thứ tự ưu tiên như khi lập:
        ///   1. File người dùng vừa tải lên (phải đọc được ct43)
        ///   2. Kho tờ khai gốc của đơn vị trong SCAN_DOC
        /// </remarks>
        public bool CoToKhaiKyTruoc(string code, int nam, int thang, string? xmlTaiLen,
                                    out int thangTruoc, out int namTruoc)
        {
            (thangTruoc, namTruoc) = thang == 1 ? (12, nam - 1) : (thang - 1, nam);

            // Nguồn 1: file tải lên — chỉ tính là hợp lệ khi ĐỌC ĐƯỢC ct43. File hỏng
            // hoặc không phải tờ khai thì coi như chưa có, để rơi xuống nguồn 2.
            if (!string.IsNullOrWhiteSpace(xmlTaiLen)
                && DocCt43VaKy(xmlTaiLen).Ct43 != null)
                return true;

            // Nguồn 2: kho tờ khai gốc
            return TimXmlToKhai(code, thangTruoc, namTruoc) != null;
        }

        /// <summary>Đọc ct43 và kỳ kê khai từ NỘI DUNG một XML tờ khai.</summary>
        public static (decimal? Ct43, string? Ky) DocCt43VaKy(string noiDung)
        {
            try
            {
                var doc = XDocument.Parse(noiDung);
                var e = doc.Descendants().FirstOrDefault(x => x.Name.LocalName == "ct43");
                var k = doc.Descendants().FirstOrDefault(x => x.Name.LocalName == "kyKKhai");

                decimal? so = e != null
                    && decimal.TryParse(e.Value.Trim(), NumberStyles.Any,
                                        CultureInfo.InvariantCulture, out var v) ? v : null;
                return (so, k?.Value?.Trim());
            }
            catch { return (null, null); }
        }

        private static void TinhLaiKetQua(ToKhaiGtgtDto tk)
        {
            if (tk.Ct36 >= 0)
            {
                var conLai = tk.Ct36 - tk.Ct22;
                tk.Ct40 = Math.Max(0, conLai);
                tk.Ct41 = Math.Max(0, -conLai);
            }
            else
            {
                tk.Ct40 = 0;
                tk.Ct41 = tk.Ct22 + Math.Abs(tk.Ct36);
            }
            tk.Ct43 = tk.Ct41 - tk.Ct42;
        }

        /// <summary>
        /// Thư mục tờ khai gốc của đơn vị theo NĂM — ăn theo kho SCAN_DOC sẵn có:
        /// <c>&lt;ScanDocRoot&gt;\&lt;MÃ&gt;\NAM&lt;năm&gt;\TO_KHAI\TO_KHAI_GOC</c>
        /// </summary>
        /// <remarks>
        /// Nằm TRONG NAM&lt;năm&gt; chứ không để phẳng ở gốc đơn vị: tờ khai là hồ sơ
        /// của một năm tài chính, gom cùng chỗ với dữ liệu năm đó thì sang năm mới chỉ
        /// việc thêm một thư mục, không phải trộn tờ khai nhiều năm vào một rổ.
        /// </remarks>
        public static string DuongDanToKhai(string goc, string code, int nam)
            => Path.Combine(goc, code, $"NAM{nam}", "TO_KHAI", "TO_KHAI_GOC");

        private string? ThuMucToKhai(string code, int nam)
        {
            var goc = _config["Paths:ScanDocRoot"];
            if (string.IsNullOrWhiteSpace(goc)) return null;
            var d = DuongDanToKhai(goc, code, nam);
            return Directory.Exists(d) ? d : null;
        }

        // Tìm XML tờ khai của một kỳ. Thư mục con đặt tên TKG_T<tháng>_<năm>.
        //
        // Kỳ tháng 1 lấy tờ khai tháng 12 NĂM TRƯỚC, mà tờ khai năm trước nằm dưới
        // NAM<năm-1> — nên phải tra theo đúng năm của kỳ cần tìm, không dùng năm làm việc.
        private string? TimXmlToKhai(string code, int thang, int nam)
        {
            var goc = ThuMucToKhai(code, nam);
            if (goc == null) return null;

            var uuTien = Path.Combine(goc, $"TKG_T{thang}_{nam}");
            var noiTim = Directory.Exists(uuTien) ? uuTien : goc;

            // Tên file chứa M<MM><yyyy> — dấu hiệu chắc chắn nhất của kỳ.
            var dau = $"M{thang:00}{nam}";
            return Directory
                .EnumerateFiles(noiTim, "*.xml", SearchOption.AllDirectories)
                .FirstOrDefault(f => Path.GetFileName(f).Contains(dau, StringComparison.OrdinalIgnoreCase));
        }

        private static decimal? DocCt43(string duongDanXml)
        {
            try
            {
                var doc = XDocument.Load(duongDanXml);
                // Bỏ qua namespace: tờ khai HTKK khai xmlns mặc định, so LocalName thì
                // không phải mang theo namespace suốt cả hàm.
                var e = doc.Descendants()
                           .FirstOrDefault(x => x.Name.LocalName == "ct43");
                if (e == null) return null;
                return decimal.TryParse(e.Value.Trim(), NumberStyles.Any,
                                        CultureInfo.InvariantCulture, out var v) ? v : null;
            }
            catch { return null; }
        }

        // ---------- Kiểm tra cân đối trước khi cho xuất (§5.1 spec) ----------
        private static void KiemTraCanDoi(ToKhaiGtgtDto tk)
        {
            void Chan(string ma, string moTa, decimal? lech = null) =>
                tk.CanhBao.Add(new CanhBaoToKhaiDto
                { Ma = ma, Muc = "CHAN", MoTa = moTa, ChenhLech = lech });

            // LK-05: tổng bán ra phải bằng tổng các nhóm
            var tongDt = tk.Ct26 + tk.Ct29 + tk.Ct30 + tk.Ct32 + tk.Ct32a;
            if (tk.Ct34 != tongDt)
                Chan("LK-05", $"Chỉ tiêu 34 ({tk.Ct34:N0}) khác tổng các nhóm doanh thu "
                            + $"({tongDt:N0})", tk.Ct34 - tongDt);

            if (tk.Ct35 != tk.Ct31 + tk.Ct33)
                Chan("LK-05", $"Chỉ tiêu 35 ({tk.Ct35:N0}) khác ct31 + ct33 "
                            + $"({tk.Ct31 + tk.Ct33:N0})");

            // LK-04: ct43 = ct41 − ct42
            if (tk.Ct43 != tk.Ct41 - tk.Ct42)
                Chan("LK-04", $"Chỉ tiêu 43 ({tk.Ct43:N0}) khác ct41 − ct42 "
                            + $"({tk.Ct41 - tk.Ct42:N0})");

            // Không thể vừa phải nộp vừa còn được khấu trừ
            if (tk.Ct40 > 0 && tk.Ct41 > 0)
                Chan("LK-06", $"Vừa phải nộp ({tk.Ct40:N0}) vừa còn khấu trừ ({tk.Ct41:N0}) "
                            + "— hai chỉ tiêu này loại trừ nhau");
        }

        /// <summary>
        /// Tên file XML theo đúng quy ước HTKK, suy từ 6 mẫu thật của NHAT_TUAN:
        /// {MST}000-01_GTGT_TT80-M{MM}{yyyy}-L{lần}.xml
        /// </summary>
        public static string TenFileXml(string mst, int thang, int nam, int lan = 0)
            => $"{mst}000-01_GTGT_TT80-M{thang:00}{nam}-L{lan:00}.xml";

        /// <summary>
        /// Sinh XML tờ khai, dùng tờ khai kỳ TRƯỚC làm khuôn (§6 spec).
        /// Ném <see cref="InvalidOperationException"/> nếu tờ khai còn lỗi mức CHẶN —
        /// không bao giờ xuất ra file từ số liệu chưa cân.
        /// </summary>
        public XDocument SinhXml(ToKhaiGtgtDto tk, string? xmlKyTruoc = null)
        {
            if (!tk.ChoXuat)
            {
                var loi = string.Join("; ",
                    tk.CanhBao.Where(c => c.Muc == "CHAN").Select(c => $"[{c.Ma}] {c.MoTa}"));
                throw new InvalidOperationException(
                    "Tờ khai còn lỗi chặn, không xuất được: " + loi);
            }

            // ===== KHUÔN BẮT BUỘC LÀ TỜ KHAI KỲ TRƯỚC CỦA CHÍNH ĐƠN VỊ NÀY =====
            //
            // Tờ khai HTKK mang hàng chục nút thông tin đơn vị mà SỔ KHÔNG LƯU ở đâu cả:
            // maCQTNoiNop, tenCQTNoiNop, maTinhNNT, tieuMucHachToan, ttinNhaCCapDVu…
            // Chỉ tờ khai kỳ trước mới có sẵn đúng những giá trị đó.
            //
            // Vì vậy KHÔNG có đường lùi "dựng tối thiểu": file dựng tay thiếu mấy nút
            // trên vẫn mở được bằng Notepad nên trông như bình thường, nhưng nạp vào
            // HTKK là bị từ chối hoặc — tệ hơn — nhận với cơ quan thuế SAI. Thà chặn
            // ngay và bảo người dùng tải khuôn lên.
            XDocument? khuon = null;
            string? nguonKhuon = null;

            // Nguồn 1: file người dùng vừa tải lên
            if (!string.IsNullOrWhiteSpace(xmlKyTruoc))
            {
                try
                {
                    khuon = XDocument.Parse(xmlKyTruoc);
                    nguonKhuon = "file XML tải lên";
                }
                catch (Exception ex)
                {
                    throw new InvalidOperationException(
                        "File XML tờ khai kỳ trước không đọc được nên không có khuôn để "
                        + "dựng tờ khai mới: " + ex.Message);
                }
            }

            // Nguồn 2: kho tờ khai gốc của đơn vị (§6) — kỳ N−1 trước, rồi kỳ gần nhất
            if (khuon == null)
            {
                var (thangTruoc, namTruoc) = tk.Thang == 1
                    ? (12, tk.Nam - 1) : (tk.Thang - 1, tk.Nam);

                var duong = TimXmlToKhai(tk.MaDonVi, thangTruoc, namTruoc)
                         ?? TimXmlGanNhat(tk.MaDonVi, namTruoc)
                         ?? TimXmlGanNhat(tk.MaDonVi, tk.Nam);

                if (duong != null)
                {
                    try
                    {
                        khuon = XDocument.Load(duong);
                        nguonKhuon = Path.GetFileName(duong);
                    }
                    catch { khuon = null; }
                }
            }

            if (khuon == null)
                throw new InvalidOperationException(
                    $"Chưa có tờ khai kỳ trước của đơn vị {tk.MaDonVi} để làm khuôn. "
                    + "Tờ khai mang thông tin cơ quan thuế và tiểu mục hạch toán mà sổ "
                    + "không lưu — hãy tải file XML tờ khai kỳ liền trước lên.");

            KiemKhuon(khuon, tk);
            return ToKhaiXmlWriter.Dung(tk, khuon);
        }

        // Khuôn phải là tờ khai 01/GTGT CỦA CHÍNH ĐƠN VỊ NÀY và có đủ nút định danh.
        //
        // Tải nhầm tờ khai của công ty khác là lỗi rất dễ mắc khi kế toán làm cho nhiều
        // đơn vị cùng lúc — mà hậu quả thì nặng: tờ khai mới mang MST và cơ quan thuế
        // của công ty kia, nộp lên là khai thay người khác.
        private static void KiemKhuon(XDocument khuon, ToKhaiGtgtDto tk)
        {
            string? Lay(string ten) => khuon.Descendants()
                .FirstOrDefault(x => x.Name.LocalName == ten)?.Value?.Trim();

            var maTKhai = Lay("maTKhai");
            if (maTKhai != null && maTKhai != "842")
                throw new InvalidOperationException(
                    $"File khuôn có mã tờ khai {maTKhai}, không phải 01/GTGT (842)");

            var mstKhuon = Lay("mst");
            if (!string.IsNullOrWhiteSpace(mstKhuon)
                && !string.IsNullOrWhiteSpace(tk.Mst)
                && RaSoatService.GocMst(mstKhuon) != RaSoatService.GocMst(tk.Mst))
                throw new InvalidOperationException(
                    $"File khuôn là tờ khai của MST {mstKhuon}, "
                    + $"trong khi đơn vị đang làm có MST {tk.Mst} — tải nhầm tờ khai "
                    + "của công ty khác");

            // Thiếu mấy nút này thì HTKK không nhận; báo ngay tên nút để người dùng biết
            // phải tìm tờ khai đầy đủ hơn, thay vì tải về rồi mới phát hiện.
            var thieu = new[] { "maCQTNoiNop", "maTinhNNT", "tieuMucHachToan" }
                .Where(t => string.IsNullOrWhiteSpace(Lay(t)))
                .ToList();
            if (thieu.Count > 0)
                throw new InvalidOperationException(
                    "File khuôn thiếu thông tin bắt buộc: " + string.Join(", ", thieu)
                    + ". Hãy dùng tờ khai chính thức đã nộp của kỳ trước.");
        }

        // Tờ khai gần nhất bất kỳ trong CÙNG NĂM — lối lùi khi kỳ N−1 chưa có file.
        // Chỉ dùng làm KHUÔN (lấy thông tin đơn vị), không bao giờ lấy số tiền từ đây.
        private string? TimXmlGanNhat(string code, int nam)
        {
            var goc = ThuMucToKhai(code, nam);
            if (goc == null) return null;
            return Directory
                .EnumerateFiles(goc, "*.xml", SearchOption.AllDirectories)
                .OrderByDescending(f => f, StringComparer.OrdinalIgnoreCase)
                .FirstOrDefault();
        }
    }


    /// <summary>
    /// Đổi <see cref="SoChuaMoException"/> thành 409 kèm lời nhắn đọc được.
    /// </summary>
    /// <remarks>
    /// Làm bằng FILTER chứ không try/catch từng action: sổ thuế có 8 endpoint, endpoint
    /// nào cũng mở database đơn vị-năm nên endpoint nào cũng vấp được lỗi này. Bọc tay
    /// từng cái thì chỉ cần thêm một endpoint mới mà quên bọc là lại lộ stack trace 500.
    ///
    /// 409 Conflict chứ không 404: đơn vị và năm đều CÓ THẬT trong Master, chỉ là chưa
    /// mở sổ — 404 sẽ khiến frontend tưởng gõ sai đường dẫn.
    /// </remarks>
    public class SoChuaMoFilter : IExceptionFilter
    {
        public void OnException(ExceptionContext ctx)
        {
            if (ctx.Exception is not SoChuaMoException ex) return;

            ctx.Result = new ObjectResult(new { message = ex.Message })
            {
                StatusCode = StatusCodes.Status409Conflict,
            };
            ctx.ExceptionHandled = true;
        }
    }
}
