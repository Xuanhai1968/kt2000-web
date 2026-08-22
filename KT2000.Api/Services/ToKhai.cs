using ClosedXML.Excel;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Caching.Memory;
using System.Globalization;
using System.Text;
using System.Xml.Linq;
using KT2000.Api.Models;

namespace KT2000.Api.Services
{
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
        // GỐC THỨ BA, KHÔNG THUỘC hàm dò này (chốt 15/08) — nói ra để khỏi lẫn:
        //   Paths:ScanDocRoot1 = \\Server-test\scan_doc    ← kho TỜ KHAI các tháng trước
        //     <MÃ>\NAM<năm>\TO_KHAI\TO_KHAI_GOC\TKG_T<t>_<năm>\*.xml
        //   CHỈ ĐỌC, và chỉ đọc XML TỜ KHAI. Thư mục kỳ ở đó có lẫn bảng kê hóa đơn
        //   (HD_VAO_*.xlsx, HD_RA_*.xlsx) nhưng hóa đơn KHÔNG lấy từ kho này — hóa đơn
        //   là việc của ScanDocRoot/JobsRoot ở trên. Xem ThuMucToKhai / LaXmlToKhai.
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
            public List<string> DaDo { get; set; } = new();
        }

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


        public Task<KhoKy> DoKhoAsync(string code, int nam, int thang,
                                      CancellationToken huy = default)
            => Task.Run(() => DoKho(code, nam, thang), huy);

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
                jKy == null ? null : Path.Combine(jKy, "raw", "RA"));

            k.XmlVao = Quet(k.DaDo, "*.xml",
                sNam == null ? null : Path.Combine(sNam, "xmls_only", "vao", $"t{thang}"),
                sNam == null ? null : Path.Combine(sNam, $"VAO_T{thang}_{nam}"),
                jKy == null ? null : Path.Combine(jKy, "raw", "VAO"));

            k.HtmlRa = Quet(k.DaDo, "*.htm*",
                sNam == null ? null : Path.Combine(sNam, $"RA_T{thang}_{nam}"));

            k.HtmlVao = Quet(k.DaDo, "*.htm*",
                sNam == null ? null : Path.Combine(sNam, $"VAO_T{thang}_{nam}"));

            k.ExcelRa = Quet(k.DaDo, "*.xlsx",
                jKy == null ? null : Path.Combine(jKy, "raw", "RA"));

            k.ExcelVao = Quet(k.DaDo, "*.xlsx",
                jKy == null ? null : Path.Combine(jKy, "raw", "VAO"));

            return k;
        }

        private static string Khoa(string huong, string mst, string khhd, string soHd)
            => $"{huong}|{ChuanKhhd(khhd)}|{ImportService.ChuanSoHd(soHd ?? "")}";

        /// <summary>Ký hiệu HĐ bỏ mẫu số đứng đầu: '1C26TNT' → 'C26TNT'.</summary>
        internal static string ChuanKhhd(string? khhd)
        {
            var s = (khhd ?? "").Trim().ToUpperInvariant();
            var i = 0;
            while (i < s.Length && char.IsDigit(s[i])) i++;
            return s[i..];
        }

        public static string GocMst(string? mst)
        {
            var s = (mst ?? "").Trim();
            var gach = s.IndexOf('-');
            return (gach > 0 ? s[..gach] : s).Trim();
        }

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
        /// <param name="chiHuong">
        /// Chỉ soát MỘT chiều ("VAO" | "RA"); null = cả hai.
        ///

        public async Task<KetQuaRaSoatDto> Soat(
            string code, int year, int? thang, IReadOnlyList<HoaDonFileDto> tuFile,
            CancellationToken huy = default, string? chiHuong = null)
        {
            var kq = new KetQuaRaSoatDto { Nam = year, Thang = thang };

            var trongSo = new Dictionary<string, HoaDonSoDto>(
                Math.Max(tuFile.Count, 64), StringComparer.OrdinalIgnoreCase);
            using (var conn = new SqlConnection(_resolver.GetTenantConnection(code, year)))
            {
                await conn.OpenAsync(huy);
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
                    + (thang is > 0 ? " WHERE h.thang = @thang" : " WHERE 1 = 1")
                    + (chiHuong == null ? "" : " AND h.huong = @huong");

                using var cmd = new SqlCommand(sql, conn);
                if (thang is > 0) cmd.Parameters.AddWithValue("@thang", thang);
                if (chiHuong != null) cmd.Parameters.AddWithValue("@huong", chiHuong);

                using var r = await cmd.ExecuteReaderAsync(huy);
                while (await r.ReadAsync(huy))
                {
                    var hd = new HoaDonSoDto
                    {
                        MaHd = r.GetString(0),
                        Huong = r.IsDBNull(1) ? "" : r.GetString(1),
                        Mst = r.IsDBNull(2) ? "" : r.GetString(2),
                        Khhd = r.IsDBNull(3) ? "" : r.GetString(3),
                        SoHd = r.IsDBNull(4) ? "" : r.GetString(4),
                        Ngay = r.IsDBNull(5) ? null : r.GetDateTime(5),
                        Thang = r.IsDBNull(6) ? null : r.GetInt32(6),
                        TenKh = r.IsDBNull(7) ? "" : r.GetString(7),
                        TienHang = r.GetDecimal(8),
                        TienVat = r.GetDecimal(9),
                    };
                    var k = Khoa(hd.Huong, hd.Mst, hd.Khhd, hd.SoHd);

                    if (trongSo.TryGetValue(k, out var daCo))
                    {
                        kq.Trung.Add(new VanDeDto
                        {
                            Loai = "trung-so",
                            MaHd = hd.MaHd,
                            Khhd = hd.Khhd,
                            SoHd = hd.SoHd,
                            Mst = hd.Mst,
                            TenDoiTac = hd.TenKh,
                            MoTa = $"Sổ có 2 dòng cùng danh tính (mã kia: {daCo.MaHd})",
                        });
                        continue;
                    }
                    trongSo[k] = hd;
                }
            }

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
                        Khhd = f.Khhd,
                        SoHd = f.SoHd,
                        Mst = f.Mst,
                        TenDoiTac = f.TenDoiTac,
                        MoTa = $"Hai file cùng một hóa đơn: {daCo.TenFile} và {f.TenFile}",
                    });
                    continue;
                }
                trongFile[k] = f;
            }

            foreach (var (k, f) in trongFile)
            {
                if (!trongSo.TryGetValue(k, out var s))
                {
                    kq.ThieuTrongSo.Add(new VanDeDto
                    {
                        Loai = "thieu-trong-so",
                        Khhd = f.Khhd,
                        SoHd = f.SoHd,
                        Mst = f.Mst,
                        TenDoiTac = f.TenDoiTac,
                        Ngay = f.Ngay,
                        Huong = f.Huong,
                        TienHangFile = f.TienHang,
                        TienVatFile = f.TienVat,
                        TenFile = f.TenFile,
                        MoTa = "Có trong file nhưng chưa nạp vào sổ",
                    });
                    continue;
                }

                var lechHang = Math.Abs(s.TienHang - f.TienHang);
                var lechVat = Math.Abs(s.TienVat - f.TienVat);
                if (lechHang >= 1m || lechVat >= 1m)
                {
                    kq.LechTien.Add(new VanDeDto
                    {
                        Loai = "lech-tien",
                        MaHd = s.MaHd,
                        Khhd = f.Khhd,
                        SoHd = f.SoHd,
                        Mst = f.Mst,
                        TenDoiTac = f.TenDoiTac,
                        Ngay = f.Ngay,
                        Huong = f.Huong,
                        TienHangFile = f.TienHang,
                        TienVatFile = f.TienVat,
                        TienHangSo = s.TienHang,
                        TienVatSo = s.TienVat,
                        MoTa = lechHang >= 1m && lechVat >= 1m ? "Lệch cả tiền hàng và VAT"
                             : lechHang >= 1m ? $"Lệch tiền hàng {lechHang:N0}"
                             : $"Lệch tiền VAT {lechVat:N0}",
                    });
                }

                if (thang is > 0 && s.Thang != thang)
                {
                    kq.SaiKy.Add(new VanDeDto
                    {
                        Loai = "sai-ky",
                        MaHd = s.MaHd,
                        Khhd = f.Khhd,
                        SoHd = f.SoHd,
                        Mst = f.Mst,
                        TenDoiTac = f.TenDoiTac,
                        Ngay = f.Ngay,
                        Huong = f.Huong,
                        MoTa = $"Sổ ghi kỳ kê khai tháng {s.Thang?.ToString() ?? "(trống)"}, "
                             + $"đang soát tháng {thang}",
                    });
                }
            }

            foreach (var (k, s) in trongSo)
            {
                if (trongFile.ContainsKey(k)) continue;
                kq.ThieuTrongFile.Add(new VanDeDto
                {
                    Loai = "thieu-trong-file",
                    MaHd = s.MaHd,
                    Khhd = s.Khhd,
                    SoHd = s.SoHd,
                    Mst = s.Mst,
                    TenDoiTac = s.TenKh,
                    Ngay = s.Ngay?.ToString("yyyy-MM-dd"),
                    Huong = s.Huong,
                    TienHangSo = s.TienHang,
                    TienVatSo = s.TienVat,
                    MoTa = "Có trong sổ nhưng không thấy trong file vừa tải",
                });
            }

            kq.SoHdFile = trongFile.Count;
            kq.SoHdSo = trongSo.Count;
            return kq;
        }

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
            ("tientt",   new[] { "tổng tiền thanh toán", "tong tien thanh toan" }),
        };

        private static decimal TienHangDong(decimal tienHang, decimal tienVat,
                                            decimal tienTt, bool coCotTt)
            => tienHang == 0 && tienVat == 0 && coCotTt && tienTt != 0
             ? tienTt : tienHang;

        /// <param name="mstDonVi">

        public static List<HoaDonFileDto> DocBangKeExcel(
            Stream noiDung, string tenFile, string? mstDonVi)
        {
            var ds = new List<HoaDonFileDto>();
            using var wb = new XLWorkbook(noiDung);
            var ws = wb.Worksheets.FirstOrDefault();
            if (ws == null) return ds;

            int dongHeader = 0;
            var cuoi = Math.Min(ws.LastRowUsed()?.RowNumber() ?? 0, 30);
            for (int r = 1; r <= cuoi && dongHeader == 0; r++)
                for (int c = 1; c <= 5; c++)
                    if (string.Equals(ws.Cell(r, c).GetString().Trim(), "STT",
                                      StringComparison.OrdinalIgnoreCase))
                    { dongHeader = r; break; }

            if (dongHeader == 0) return ds;     // không phải bảng kê của cổng

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

                var laRa = huong == "RA";

                ds.Add(new HoaDonFileDto
                {
                    TenFile = tenFile,
                    Huong = huong,
                    Mst = laRa ? S(dong, "mstmua") : mstBan,
                    TenDoiTac = laRa ? S(dong, "tenmua") : S(dong, "tenban"),
                    Khhd = S(dong, "khhd"),
                    SoHd = soHd,
                    Ngay = ChuanNgay(S(dong, "ngay")),
                    TienHang = TienHangDong(D(dong, "tienhang"), D(dong, "tienvat"),
                                            D(dong, "tientt"), viTri.ContainsKey("tientt")),
                    TienVat = D(dong, "tienvat"),
                });
            }
            return ds;
        }

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

        private static async Task<List<HoaDonFileDto>> DocNhieuXml(
            IEnumerable<string> duongDan, CancellationToken huy = default)
        {
            var ds = duongDan.ToList();
            if (ds.Count == 0) return new List<HoaDonFileDto>();

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
                (i, _) =>
                {
                    ket[i] = DocXml(ds[i]);
                    return ValueTask.CompletedTask;
                });

            return ket.OfType<HoaDonFileDto>().ToList();
        }

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

    public class ToKhaiService
    {
        private readonly TenantDbResolver _resolver;
        private readonly IConfiguration _config;
        private readonly IMemoryCache _cache;

        public ToKhaiService(TenantDbResolver resolver, IConfiguration config,
                             IMemoryCache cache)
        {
            _resolver = resolver;
            _config = config;
            _cache = cache;
        }

        public static readonly (string The, string Cot)[] ChiTieuXml =
        {
            ("ct21","ct21_xml"), ("ct22","ct22_xml"), ("ct23","ct23_xml"),
            ("ct24","ct24_xml"), ("ct25","ct25_xml"), ("ct26","ct26_xml"),
            ("ct27","ct27_xml"), ("ct28","ct28_xml"), ("ct29","ct29_xml"),
            ("ct30","ct30_xml"), ("ct31","ct31_xml"), ("ct32","ct32_xml"),
            ("ct33","ct33_xml"), ("ct32a","ct32a_xml"), ("ct34","ct34_xml"),
            ("ct35","ct35_xml"), ("ct36","ct36_xml"), ("ct37","ct37_xml"),
            ("ct38","ct38_xml"), ("ct39a","ct39_xml"), ("ct40a","ct40a_xml"),
            ("ct40b","ct40b_xml"), ("ct40","ct40_xml"), ("ct41","ct41_xml"),
            ("ct42","ct42_xml"), ("ct43","ct43_xml"),
        };

        public static Dictionary<string, decimal?> DocChiTieuXml(string noiDung)
        {
            var kq = new Dictionary<string, decimal?>();
            try
            {
                var doc = XDocument.Parse(noiDung);
                var dau = new Dictionary<string, string>();
                foreach (var e in doc.Descendants())
                {
                    var ten = e.Name.LocalName;
                    var v = e.Value?.Trim();
                    if (!dau.ContainsKey(ten) && !string.IsNullOrEmpty(v))
                        dau[ten] = v;
                }
                foreach (var (the, cot) in ChiTieuXml)
                    kq[cot] = dau.TryGetValue(the, out var v)
                              && decimal.TryParse(v, NumberStyles.Any,
                                                  CultureInfo.InvariantCulture, out var d)
                        ? d : null;
            }
            catch { /* file hỏng — trả rỗng, tầng gọi báo rõ file nào không đọc được */ }
            return kq;
        }

        public static (string? Mst, int? Thang, int? Nam, decimal? Ct43)
            DocTomTatXmlToKhai(string noiDung)
        {
            try
            {
                var doc = XDocument.Parse(noiDung);
                string? Lay(string ten) => doc.Descendants()
                    .FirstOrDefault(e => e.Name.LocalName == ten)?.Value?.Trim();

                var mst = Lay("mst");
                var ky = Lay("kyKKhai") ?? "";
                var v43 = Lay("ct43");

                int? thang = null, nam = null;
                var manh = ky.Split('/');
                if (manh.Length == 2 && int.TryParse(manh[0], out var t)
                    && int.TryParse(manh[1], out var n) && t is >= 1 and <= 12)
                { thang = t; nam = n; }

                decimal? ct43 = decimal.TryParse(v43, NumberStyles.Any,
                    CultureInfo.InvariantCulture, out var c) ? c : null;

                return (string.IsNullOrWhiteSpace(mst) ? null : mst, thang, nam, ct43);
            }
            catch
            {
                return (null, null, null, null);
            }
        }

        private sealed class HoaDonKy
        {
            public string MaHd = "";
            public string Huong = "";
            public decimal Vat;
            public decimal TienVat;
            public decimal TienCk;
            public decimal TienHangGop;
        }

        private sealed class DongTheoSuat
        {
            public string MaHd = "";
            public decimal PtVat;
            public decimal TienVatL;   // tổng tien_vat_l của nhóm; 0 = XML không ghi
            public string? LoaiThue;
            public int SoDong;
            public decimal TienHang;
        }

        private const string LocHdBiThayThe = @"
               AND NOT EXISTS (
                     SELECT 1 FROM HOA_DON tt
                      WHERE tt.thang = h.thang
                        AND ISNULL(tt.tich_chat_hd_lienquan, '') = '1'
                        AND tt.khhd_lienquan = CASE
                              WHEN h.khhd LIKE '[0-9]%' THEN SUBSTRING(h.khhd, 2, LEN(h.khhd))
                              ELSE h.khhd END
                        AND tt.sohd_lienquan = h.so_hd
               )"
            + LocHdDaBiThayThe
            + LocHdLienQuanKhacKy;

        private const string LocHdDaBiThayThe = @"
               AND NOT (
                     ISNULL(h.tthai_hd, '') LIKE N'%bị thay thế%'
                 AND EXISTS (
                       SELECT 1 FROM HOA_DON tt2
                        WHERE ISNULL(tt2.tich_chat_hd_lienquan, '') = '1'
                          AND tt2.khhd_lienquan = CASE
                                WHEN h.khhd LIKE '[0-9]%' THEN SUBSTRING(h.khhd, 2, LEN(h.khhd))
                                ELSE h.khhd END
                          AND tt2.sohd_lienquan = h.so_hd
                          AND tt2.thang <= h.thang
                     )
               )";

        private const string LocHdLienQuanKhacKy = @"
               AND NOT (
                     ISNULL(h.tich_chat_hd_lienquan, '') <> ''
                 AND h.ngay_lienquan IS NOT NULL
                 AND (MONTH(h.ngay_lienquan) <> h.thang
                      OR YEAR(h.ngay_lienquan) <> @namKy)
               )";

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
             WHERE h.thang = @thang" + LocHdBiThayThe;

        private static string SqlDongTheoSuat(bool coLoaiThue) => $@"
            SELECT h.ma_hd,
                   CAST(ISNULL(l.pt_vat, 0) AS DECIMAL(18,4)),
                   {(coLoaiThue ? "MAX(l.loai_thue)" : "CAST(NULL AS NVARCHAR(10))")},
                   COUNT(*),
                   CAST(SUM(ISNULL(l.so_luong, 0) * ISNULL(l.don_gia, 0))
                        AS DECIMAL(18,4)),
                   CAST(SUM(ISNULL(l.tien_vat_l, 0)) AS DECIMAL(18,4))
              FROM HOA_DON h
              JOIN HOA_DON_LINE l ON l.ma_hd = h.ma_hd
             WHERE h.thang = @thang AND h.huong = @huong
               AND ISNULL(l.tinh_chat, '1') <> '3'{LocHdBiThayThe}
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
        /// <param name="xmlKyTruoc">

        /// <param name="chonHd">
        /// BR-TK-20 — LẬP TỜ KHAI TỪ MỘT PHẦN HÓA ĐƠN CỦA KỲ.
        public Task<ToKhaiGtgtDto> Lap(string code, int year, int thang,
                                       string mst, string tenNnt, string? diaChi,
                                       string? xmlKyTruoc = null,
                                       IReadOnlyCollection<string>? chonHd = null)
        {
            var dauXml = string.IsNullOrWhiteSpace(xmlKyTruoc)
                ? "0" : xmlKyTruoc.Length + "-" + xmlKyTruoc.GetHashCode();
            var dauChon = chonHd == null || chonHd.Count == 0
                ? "0"
                : chonHd.Count + "-" + string.Join("|", chonHd.OrderBy(x => x,
                      StringComparer.OrdinalIgnoreCase)).GetHashCode();
            var khoa = $"tokhai|{code}|{year}|{thang}|{mst}|{dauXml}|{dauChon}";

            return _cache.GetOrCreateAsync(khoa, muc =>
            {
                muc.AbsoluteExpirationRelativeToNow = TimeSpan.FromSeconds(60);
                muc.Size = 1;
                return LapThat(code, year, thang, mst, tenNnt, diaChi, xmlKyTruoc, chonHd);
            })!;
        }

        private async Task<ToKhaiGtgtDto> LapThat(
            string code, int year, int thang,
            string mst, string tenNnt, string? diaChi, string? xmlKyTruoc,
            IReadOnlyCollection<string>? chonHd = null)
        {
            var tk = new ToKhaiGtgtDto
            {
                Nam = year,
                Thang = thang,
                MaDonVi = code,
                Mst = mst,
                TenNnt = tenNnt,
                DiaChiNnt = diaChi,
                TenFileXml = TenFileXml(mst, thang, year),
            };

            using var conn = new SqlConnection(_resolver.GetTenantConnection(code, year));
            await conn.OpenAsync();

            var coLoaiThue = await CoCot(conn, "HOA_DON_LINE", "loai_thue");
            if (!coLoaiThue)
                tk.CanhBao.Add(new CanhBaoToKhaiDto
                {
                    Ma = "KT-08",
                    Muc = "CANH_BAO",
                    MoTa = "Database chưa chạy script 017 nên chưa có cột loai_thue — "
                         + "hàng KHÔNG CHỊU THUẾ và thuế suất 0% không tách được, "
                         + "chỉ tiêu 26/32a có thể thiếu",
                });

            var chuoiKn = _resolver.GetTenantConnection(code, year);

            async Task<T> ChayRieng<T>(Func<SqlConnection, Task<T>> viec)
            {
                using var c = new SqlConnection(chuoiKn);
                await c.OpenAsync();
                return await viec(c);
            }

            var vHoaDon = ChayRieng(c => DocHoaDonKy(c, thang, year));
            var vDongRa = ChayRieng(c => DocDongTheoSuat(c, thang, year, "RA", coLoaiThue));
            var vDongVao = ChayRieng(c => DocDongTheoSuat(c, thang, year, "VAO", coLoaiThue));
            await Task.WhenAll(vHoaDon, vDongRa, vDongVao);

            var hoaDon = await vHoaDon;
            var dongRa = await vDongRa;
            var dongVao = await vDongVao;
            var soHdCaKy = hoaDon.Count;
            if (chonHd is { Count: > 0 })
            {
                var chon = new HashSet<string>(chonHd, StringComparer.OrdinalIgnoreCase);
                hoaDon = hoaDon.Where(h => chon.Contains(h.MaHd)).ToList();
                dongRa = dongRa.Where(d => chon.Contains(d.MaHd)).ToList();
                dongVao = dongVao.Where(d => chon.Contains(d.MaHd)).ToList();

                tk.LocTheoChon = true;
                tk.SoHdDaChon = hoaDon.Count;
                tk.SoHdCaKy = soHdCaKy;
                var thieu = chon.Count - hoaDon.Count;
                if (thieu > 0)
                    tk.CanhBao.Add(new CanhBaoToKhaiDto
                    {
                        Ma = "BR-TK-20",
                        Muc = "CANH_BAO",
                        MoTa = $"Có {thieu} hóa đơn được chọn nhưng không nằm trong dữ liệu "
                             + $"kê khai của kỳ {thang}/{year} — hóa đơn đã bị thay thế/điều "
                             + "chỉnh hoặc đã xóa khỏi sổ, nên không được tính vào tờ khai",
                    });

                tk.CanhBao.Add(new CanhBaoToKhaiDto
                {
                    Ma = "BR-TK-20",
                    Muc = "CANH_BAO",
                    MoTa = $"Tờ khai lập từ {hoaDon.Count}/{soHdCaKy} hóa đơn được chọn tay, "
                         + "KHÔNG phải toàn bộ hóa đơn của kỳ",
                });
            }

            if (hoaDon.Count == 0)
                tk.CanhBao.Add(new CanhBaoToKhaiDto
                {
                    Ma = "KT-00",
                    Muc = "CHAN",
                    MoTa = chonHd is { Count: > 0 }
                        ? $"Không hóa đơn nào trong số đã chọn thuộc kỳ tháng {thang}/{year}"
                        : $"Kỳ tháng {thang}/{year} không có hóa đơn nào trong sổ",
                });

            await CanhBaoTrangThaiLa(conn, thang, tk.CanhBao);
            tk.LoaiKhacKy = await DocHdLoaiKhacKy(conn, thang, year);

            tk.NhomBanRa = PhanBo(hoaDon, dongRa, "RA", tk.CanhBao);
            tk.NhomMuaVao = PhanBo(hoaDon, dongVao, "VAO", tk.CanhBao);

            TinhChiTieu(tk, hoaDon);
            TinhPhuLucNq142(tk);
            NoiKyTruoc(tk, code, xmlKyTruoc);
            KiemTraCanDoi(tk);

            return tk;
        }

        private static async Task<List<HoaDonLoaiKhacKyDto>> DocHdLoaiKhacKy(
            SqlConnection conn, int thang, int nam)
        {
            const string sql = @"
                SELECT h.ma_hd, h.huong, h.khhd, h.so_hd, h.ngay, h.ten_kh,
                       ISNULL(l.tien_hang, 0), ISNULL(h.tien_vat, 0),
                       ISNULL(h.tthai_hd, ''), ISNULL(h.sohd_lienquan, ''),
                       h.ngay_lienquan
                  FROM HOA_DON h
                  OUTER APPLY (
                        SELECT SUM(ISNULL(x.so_luong,0) * ISNULL(x.don_gia,0)) AS tien_hang
                          FROM HOA_DON_LINE x
                         WHERE x.ma_hd = h.ma_hd AND ISNULL(x.tinh_chat,'1') <> '3'
                  ) l
                 WHERE h.thang = @thang
                   AND ISNULL(h.tich_chat_hd_lienquan, '') <> ''
                   AND h.ngay_lienquan IS NOT NULL
                   AND (MONTH(h.ngay_lienquan) <> h.thang
                        OR YEAR(h.ngay_lienquan) <> @namKy)
                 ORDER BY h.huong, h.so_hd";

            var ds = new List<HoaDonLoaiKhacKyDto>();
            using var cmd = new SqlCommand(sql, conn);
            cmd.Parameters.AddWithValue("@thang", thang);
            cmd.Parameters.AddWithValue("@namKy", nam);
            using var r = await cmd.ExecuteReaderAsync();
            while (await r.ReadAsync())
            {
                var ngayLq = r.IsDBNull(10) ? (DateTime?)null : r.GetDateTime(10);
                ds.Add(new HoaDonLoaiKhacKyDto
                {
                    MaHd = r.GetString(0),
                    Huong = r.IsDBNull(1) ? "" : r.GetString(1),
                    KhHd = r.IsDBNull(2) ? null : r.GetString(2),
                    SoHd = r.IsDBNull(3) ? null : r.GetString(3),
                    Ngay = r.IsDBNull(4) ? null : r.GetDateTime(4),
                    TenDoiTac = r.IsDBNull(5) ? null : r.GetString(5),
                    TienHang = r.GetDecimal(6),
                    TienVat = r.GetDecimal(7),
                    TrangThai = r.GetString(8),
                    SoHdLienQuan = r.GetString(9),
                    NgayLienQuan = ngayLq,
                    LyDo = ngayLq is { } d
                         ? $"Thay thế/điều chỉnh cho HĐ {r.GetString(9)} ngày "
                           + $"{d:dd/MM/yyyy} — gốc đã kê ở kỳ {d.Month:00}/{d.Year}"
                         : "Liên quan tới hóa đơn của kỳ khác",
                });
            }
            return ds;
        }

        private static async Task CanhBaoTrangThaiLa(
            SqlConnection conn, int thang, List<CanhBaoToKhaiDto> canhBao)
        {
            const string sql = @"
                SELECT tthai_hd, huong, khhd, so_hd, tien_vat,
                       ISNULL(sohd_lienquan, ''), ISNULL(tich_chat_hd_lienquan, '')
                  FROM HOA_DON
                 WHERE thang = @thang
                   AND ISNULL(tthai_hd, '') <> ''
                   AND (tthai_hd LIKE N'%thay thế%' OR tthai_hd LIKE N'%điều chỉnh%')
                   AND tthai_hd NOT IN (N'Hóa đơn mới', N'Hóa đơn thay thế',
                                        N'Hóa đơn đã bị thay thế', N'Hóa đơn điều chỉnh')
                 ORDER BY tthai_hd, huong, so_hd";

            var theoTthai = new Dictionary<string, List<string>>(StringComparer.Ordinal);
            using (var cmd = new SqlCommand(sql, conn))
            {
                cmd.Parameters.AddWithValue("@thang", thang);
                using var r = await cmd.ExecuteReaderAsync();
                while (await r.ReadAsync())
                {
                    var tthai = r.GetString(0);
                    var huong = r.IsDBNull(1) ? "" : r.GetString(1);
                    var khhd = r.IsDBNull(2) ? "" : r.GetString(2);
                    var soHd = r.IsDBNull(3) ? "" : r.GetString(3);
                    var vat = r.IsDBNull(4) ? 0m : r.GetDecimal(4);
                    var lienQuan = r.GetString(5);

                    var nhan = $"{(huong == "RA" ? "bán ra" : "mua vào")} {khhd}/{soHd}"
                             + $" (VAT {vat:N0}đ"
                             + (lienQuan.Length > 0 ? $", liên quan HĐ {lienQuan})" : ")");

                    if (!theoTthai.TryGetValue(tthai, out var ds))
                        theoTthai[tthai] = ds = new List<string>();
                    ds.Add(nhan);
                }
            }

            foreach (var (tthai, ds) in theoTthai)
            {
                var ke = string.Join("; ", ds.Take(5));
                var them = ds.Count - Math.Min(5, ds.Count);

                canhBao.Add(new CanhBaoToKhaiDto
                {
                    Ma = "KT-09",
                    Muc = "CANH_BAO",
                    MoTa = $"{ds.Count} hóa đơn ở trạng thái '{tthai}' vẫn được tính "
                         + $"vào tờ khai: {ke}"
                         + (them > 0 ? $" và {them} hóa đơn khác" : "")
                         + $". Nếu bản thay thế/điều chỉnh đã nằm ở kỳ khác thì kỳ này "
                         + "đang kê thừa — đối chiếu ở màn 'HĐ khác kỳ'.",
                });
            }
        }

        // nam: để BR-TK-06b so ngay_lienquan có thuộc kỳ này không (xem LocHdLienQuanKhacKy).
        private static async Task<List<HoaDonKy>> DocHoaDonKy(
            SqlConnection conn, int thang, int nam)
        {
            using var cmd = new SqlCommand(SqlHoaDonKy, conn);
            cmd.Parameters.AddWithValue("@thang", thang);
            cmd.Parameters.AddWithValue("@namKy", nam);
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
            SqlConnection conn, int thang, int nam, string huong, bool coLoaiThue)
        {
            using var cmd = new SqlCommand(SqlDongTheoSuat(coLoaiThue), conn);
            cmd.Parameters.AddWithValue("@thang", thang);
            cmd.Parameters.AddWithValue("@namKy", nam);
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
                    TienVatL = r.IsDBNull(5) ? 0m : r.GetDecimal(5),
                });
            return ds;
        }

        private static decimal ThueCuaNhom(NhomThueSuatDto n, decimal thueNhan)
        {
            if (n.ThueTuFile <= 0) return thueNhan;

            var lech = Math.Abs(n.ThueTuFile - thueNhan);
            if (lech <= Math.Max(5m * n.SoDong, 5m)) return thueNhan;

            var goc = n.DoanhThu + n.ThueTuFile;
            if (goc <= 0) return thueNhan;

            var tyLeNguoc = n.ThueTuFile * 100m / goc;
            return Math.Abs(tyLeNguoc - n.ThueSuat) <= 0.05m
                 ? Math.Round(n.ThueTuFile, 0, MidpointRounding.AwayFromZero)
                 : thueNhan;
        }

        private static List<NhomThueSuatDto> PhanBo(
            List<HoaDonKy> hoaDon, List<DongTheoSuat> dong, string huong,
            List<CanhBaoToKhaiDto> canhBao)
        {
            var dsHd = hoaDon.Where(h => h.Huong == huong).ToList();
            var gom = new Dictionary<decimal, NhomThueSuatDto>();
            var ckTheoHd = dsHd.ToDictionary(h => h.MaHd, h => h.TienCk,
                                             StringComparer.OrdinalIgnoreCase);
            var gopTheoHd = dong
                .GroupBy(d => d.MaHd, StringComparer.OrdinalIgnoreCase)
                .ToDictionary(g => g.Key, g => g.Sum(x => x.TienHang),
                              StringComparer.OrdinalIgnoreCase);

            foreach (var d in dong)
            {
                if (!gom.TryGetValue(d.PtVat, out var n))
                    gom[d.PtVat] = n = new NhomThueSuatDto { ThueSuat = d.PtVat };

                n.TienHangGop += d.TienHang;
                n.SoDong += d.SoDong;
                n.ThueTuFile += d.TienVatL;
                n.LoaiThue ??= d.LoaiThue;
                if (ckTheoHd.TryGetValue(d.MaHd, out var ck) && ck != 0
                    && gopTheoHd.TryGetValue(d.MaHd, out var gopHd) && gopHd != 0)
                    n.ChietKhau += ck * d.TienHang / gopHd;
            }

            foreach (var n in gom.Values)
            {
                n.DoanhThu = Math.Round(n.TienHangGop - n.ChietKhau, 0, MidpointRounding.AwayFromZero);
                n.ChietKhau = Math.Round(n.ChietKhau, 0, MidpointRounding.AwayFromZero);
                if (n.ThueSuat <= 0) { n.Thue = 0m; continue; }

                var thueNhan = Math.Round(n.DoanhThu * n.ThueSuat / 100m, 0,
                                          MidpointRounding.AwayFromZero);
                n.Thue = ThueCuaNhom(n, thueNhan);
            }

            var thueHeader = dsHd.Sum(h => h.TienVat);
            var thueNhom = gom.Values.Sum(n => n.Thue);
            var lech = thueHeader - thueNhom;
            var lechTheoNhom = ChotTheoTungHoaDon(dsHd, dong, gom, ckTheoHd);
            if (lechTheoNhom)
            {
                thueNhom = gom.Values.Sum(n => n.Thue);
                lech = thueHeader - thueNhom;
            }

            if (lech != 0 && gom.Count > 0)
            {
                var soHd = dsHd.Count;
                var thueTheoFile = gom.Values
                    .Where(x => x.ThueTuFile > 0
                             && x.Thue == Math.Round(x.ThueTuFile, 0,
                                                     MidpointRounding.AwayFromZero))
                    .Sum(x => x.Thue);
                var nguong = Math.Max(5m * soHd, 100m) + thueTheoFile / 1000m;
                if (Math.Abs(lech) <= nguong)
                {
                    var lonNhat = gom.Values.OrderByDescending(n => n.DoanhThu).First();
                    lonNhat.Thue += lech;
                }
                else
                {
                    canhBao.Add(new CanhBaoToKhaiDto
                    {
                        Ma = "BR-TK-03",
                        Muc = "CHAN",
                        MoTa = $"Thuế {(huong == "RA" ? "bán ra" : "mua vào")} cộng theo nhóm "
                             + $"({thueNhom:N0}) lệch với tổng tien_vat của hóa đơn "
                             + $"({thueHeader:N0}) — chênh {lech:N0} đ, vượt ngưỡng làm tròn"
                             + ThuPhamLech(dsHd, dong, ckTheoHd),
                        ChenhLech = lech,
                    });
                }
            }

            return gom.Values.OrderBy(n => n.ThueSuat).ToList();
        }

        /// </summary>
        /// <param name="ckTheoHd">Chiết khấu trên header, theo mã hóa đơn.</param>
        /// <returns>true nếu có ít nhất một hóa đơn được chốt lại.</returns>
        private static bool ChotTheoTungHoaDon(
            List<HoaDonKy> dsHd, List<DongTheoSuat> dong,
            Dictionary<decimal, NhomThueSuatDto> gom,
            Dictionary<string, decimal> ckTheoHd)
        {
            var dongTheoHd = dong
                .GroupBy(d => d.MaHd, StringComparer.OrdinalIgnoreCase)
                .ToDictionary(g => g.Key, g => g.ToList(), StringComparer.OrdinalIgnoreCase);
            var thueMoi = new Dictionary<decimal, decimal>();
            var chotDuoc = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            // Nhóm nhận thuế của hóa đơn KHÔNG có dòng nào dùng được.
            //
            // Ưu tiên header `vat`. Header trống thì thử suy từ tien_ck: các hóa đơn
            // ĐIỀU CHỈNH GIẢM nạp thiếu chi tiết hay để nguyên tiền hàng ở cột tien_ck
            // (NHAT_TUAN 1C26TBN, HOA_SANG 1C26TNT — |tien_vat|/tien_ck ra đúng 10%).
            // Không suy được thì trả -1 để BR-TK-03 báo, KHÔNG đoán bừa.
            decimal NhomTheoHeader(HoaDonKy h)
            {
                var suat = h.Vat > 0 ? h.Vat
                         : h.TienCk != 0 ? Math.Abs(h.TienVat * 100m / h.TienCk)
                         : 0m;
                if (suat <= 0) return -1m;
                return new[] { 5m, 8m, 10m }
                    .FirstOrDefault(s => Math.Abs(suat - s) <= 0.6m, -1m);
            }

            // Dồn trọn tien_vat của hóa đơn vào một nhóm (dựng nhóm nếu kỳ chưa có).
            void DonVaoNhom(HoaDonKy h, decimal suat)
            {
                if (!gom.ContainsKey(suat))
                    gom[suat] = new NhomThueSuatDto { ThueSuat = suat };
                thueMoi[suat] = thueMoi.GetValueOrDefault(suat) + h.TienVat;
                chotDuoc.Add(h.MaHd);
            }

            foreach (var h in dsHd)
            {
                // HÓA ĐƠN KHÔNG CÓ DÒNG NÀO trong HOA_DON_LINE nhưng header có VAT.
                //
                // Quét 15 đơn vị × mọi kỳ 2026: 15 hóa đơn dạng này, và tổng của chúng
                // đúng bằng toàn bộ phần lệch còn sót (HOA_SANG T6/T9, NHAT_TUAN T1..T6,
                // THAI_TUAN T1/T7). Phần lớn là hóa đơn điều chỉnh giảm (VAT âm) hoặc
                // hóa đơn nạp thiếu chi tiết.
                //
                // Không có dòng thì không phân bổ theo tỷ trọng được, nhưng tien_vat vẫn
                // là số cổng thuế công nhận — dồn trọn vào nhóm suy từ header `vat`.
                if (!dongTheoHd.TryGetValue(h.MaHd, out var dsDong))
                {
                    if (h.TienVat == 0) continue;
                    var suatTrong = NhomTheoHeader(h);
                    if (suatTrong > 0) DonVaoNhom(h, suatTrong);
                    continue;
                }

                var nhan = dsDong.Where(d => gom.ContainsKey(d.PtVat)).ToList();
                if (nhan.Count == 0)
                {
                    if (h.TienVat == 0) continue;
                    var suatKhongNhom = NhomTheoHeader(h);
                    if (suatKhongNhom > 0) DonVaoNhom(h, suatKhongNhom);
                    continue;
                }
                var gopHd = nhan.Sum(d => d.TienHang);
                var ckHd = ckTheoHd.GetValueOrDefault(h.MaHd);
                decimal DoanhThuDong(DongTheoSuat d) =>
                    ckHd != 0 && gopHd != 0
                        ? d.TienHang - ckHd * d.TienHang / gopHd
                        : d.TienHang;

                // ==== LUẬT CHUNG: tien_vat TRÊN HEADER LÀ SỐ ĐÚNG ====
                //
                // pt_vat của DÒNG chỉ là suất ghi kèm, hay sai vì trình nạp làm tròn
                // hoặc không tách được; còn tien_vat của HEADER là số cổng thuế đã công
                // nhận (đúng bằng cột "Tổng tiền thuế" trên bảng kê Excel). Nên tờ khai
                // phải chốt theo header, không nhân lại từ pt_vat.
                //
                // BA DẠNG HỎNG GẶP TRÊN DỮ LIỆU THẬT — cùng một cách chữa:
                //  1. pt_vat làm tròn mất phần lẻ (USA_MEVA kỳ 7, 6 hóa đơn):
                //     loai_thue='KHAC:5.26%' nhưng pt_vat ghi 5 → nhân 5% hụt 167.982đ,
                //     70.238đ, 15.263đ… đúng bằng các số BR-TK-03 đang kêu.
                //  2. MỌI dòng pt_vat=0 mà header vẫn có VAT (HUY_THANH kỳ 7, 2 hóa đơn,
                //     tổng 398.176đ): nhóm 0% luôn cho thuế 0 nên VAT rơi mất hẳn.
                //  3. Hóa đơn ĐIỀU CHỈNH: tỷ lệ ra 10/110 = 9,09% vì gốc tính trên giá
                //     đã có thuế.
                //
                // Vì thế KHÔNG đặt ngưỡng "lệch bao nhiêu thì mới chốt": ngưỡng nào cũng
                // chỉ vá được một dạng. Luôn chia tien_vat header về các nhóm của chính
                // hóa đơn theo tỷ trọng doanh thu — tổng nhóm khi đó bằng tổng header
                // theo định nghĩa, mọi đơn vị, mọi kỳ.
                var dt = nhan.Sum(DoanhThuDong);

                // Nhóm nhận thuế: mặc định là các nhóm ĐANG CÓ của hóa đơn. Trường hợp
                // (2) mọi dòng đều 0% thì phải suy suất thật rồi CHUYỂN sang nhóm đó,
                // vì nhóm 0% không được mang thuế (hàng không chịu thuế).
                if (h.TienVat != 0 && nhan.All(d => d.PtVat <= 0))
                {
                    // Suất đích: header `vat` trước; header trống thì suy từ tiền, nhận
                    // cả dạng s lẫn s/(100+s) để bắt hóa đơn điều chỉnh.
                    var suatHd = h.Vat > 0 ? h.Vat
                               : dt != 0 ? Math.Abs(h.TienVat * 100m / dt) : 0m;
                    var dich = new[] { 5m, 8m, 10m }.FirstOrDefault(
                        s => Math.Abs(suatHd - s) <= 0.6m
                          || Math.Abs(suatHd - s * 100m / (100m + s)) <= 0.6m, -1m);
                    if (dich <= 0) continue;      // không suy được suất → để BR-TK-03 chặn

                    // Kỳ có thể CHƯA có nhóm suất này thì dựng mới.
                    if (!gom.TryGetValue(dich, out var nhomDich))
                        gom[dich] = nhomDich = new NhomThueSuatDto { ThueSuat = dich };

                    // CHUYỂN doanh thu sang nhóm mới, không phải chép: các dòng này đang
                    // nằm ở nhóm 0% nên cộng thêm mà không trừ đi là [23] tính hai lần.
                    nhomDich.DoanhThu += Math.Round(dt, 0, MidpointRounding.AwayFromZero);
                    nhomDich.SoDong += nhan.Sum(d => d.SoDong);
                    foreach (var g in nhan.GroupBy(d => d.PtVat))
                    {
                        if (!gom.TryGetValue(g.Key, out var cu) || cu == nhomDich) continue;
                        cu.DoanhThu -= Math.Round(g.Sum(DoanhThuDong), 0,
                                                  MidpointRounding.AwayFromZero);
                        cu.SoDong -= g.Sum(d => d.SoDong);
                    }

                    thueMoi[dich] = thueMoi.GetValueOrDefault(dich) + h.TienVat;
                    chotDuoc.Add(h.MaHd);
                    continue;
                }

                // Chia tien_vat header về các nhóm theo tỷ trọng DOANH THU (đã trừ chiết
                // khấu). Dòng cuối ôm phần dư nên tổng chia lại đúng bằng header.
                var conLai = h.TienVat;
                for (int i = 0; i < nhan.Count; i++)
                {
                    var d = nhan[i];
                    var phan = i == nhan.Count - 1 || dt == 0
                        ? conLai
                        : Math.Round(h.TienVat * DoanhThuDong(d) / dt, 0,
                                     MidpointRounding.AwayFromZero);
                    thueMoi[d.PtVat] = thueMoi.GetValueOrDefault(d.PtVat) + phan;
                    conLai -= phan;
                }
                chotDuoc.Add(h.MaHd);
            }

            if (chotDuoc.Count == 0) return false;

            // Hóa đơn KHÔNG chốt được — chỉ còn ca mọi dòng 0% mà không suy nổi suất
            // (header `vat` trống và tỷ lệ không khớp 5/8/10). Giữ nguyên cách tính cũ
            // để phần lệch thật còn nguyên cho BR-TK-03 báo, KHÔNG lấp liếm.
            var gopMoiHd = dong
                .GroupBy(d => d.MaHd, StringComparer.OrdinalIgnoreCase)
                .ToDictionary(g => g.Key, g => g.Sum(x => x.TienHang),
                              StringComparer.OrdinalIgnoreCase);

            foreach (var d in dong)
            {
                if (chotDuoc.Contains(d.MaHd) || !gom.ContainsKey(d.PtVat)) continue;
                var ck = ckTheoHd.GetValueOrDefault(d.MaHd);
                var gopHd = gopMoiHd.GetValueOrDefault(d.MaHd);
                var doanhThu = ck != 0 && gopHd != 0
                    ? d.TienHang - ck * d.TienHang / gopHd
                    : d.TienHang;
                var thue = d.PtVat <= 0 ? 0m
                    : Math.Round(doanhThu * d.PtVat / 100m, 0, MidpointRounding.AwayFromZero);
                thueMoi[d.PtVat] = thueMoi.GetValueOrDefault(d.PtVat) + thue;
            }

            foreach (var (suat, n) in gom)
                n.Thue = thueMoi.GetValueOrDefault(suat);

            return true;
        }

        /// <param name="ckTheoHd">
        /// Chiết khấu trên header. BẮT BUỘC: tiền hàng của DÒNG là so_luong × don_gia,
        /// chưa trừ chiết khấu, nên tỷ lệ VAT/tiền hàng tính thẳng sẽ thấp hơn thuế suất
        /// thật và báo nhầm "không khớp suất nào" (C26TYY/4923 ra 7,6% thay vì 8%).
        /// </param>
        private static string ThuPhamLech(List<HoaDonKy> dsHd, List<DongTheoSuat> dong,
                                          Dictionary<string, decimal> ckTheoHd)
        {
            // Tiền hàng gộp mỗi hóa đơn — dùng cả để phân bổ chiết khấu lẫn để suy suất.
            var hangTheoHd = dong
                .GroupBy(d => d.MaHd, StringComparer.OrdinalIgnoreCase)
                .ToDictionary(g => g.Key, g => g.Sum(x => x.TienHang),
                              StringComparer.OrdinalIgnoreCase);

            // Doanh thu (đã trừ chiết khấu) của một dòng — cùng công thức với PhanBo.
            decimal DoanhThu(DongTheoSuat x)
            {
                var ck = ckTheoHd.GetValueOrDefault(x.MaHd);
                var gop = hangTheoHd.GetValueOrDefault(x.MaHd);
                return ck != 0 && gop != 0 ? x.TienHang - ck * x.TienHang / gop : x.TienHang;
            }

            var theoHd = dong
                .GroupBy(d => d.MaHd, StringComparer.OrdinalIgnoreCase)
                .ToDictionary(
                    g => g.Key,
                    g => g.Sum(x => x.PtVat <= 0 ? 0m
                                  : Math.Round(DoanhThu(x) * x.PtVat / 100m, 0,
                                               MidpointRounding.AwayFromZero)),
                    StringComparer.OrdinalIgnoreCase);

            // Doanh thu gộp mỗi hóa đơn — mẫu số để suy ra suất THỰC TẾ cổng thuế dùng.
            // Kế toán cần biết "phải sửa pt_vat thành mấy %", chứ chỉ báo lệch bao nhiêu
            // đồng thì vẫn phải tự mở từng hóa đơn ra dò.
            var dtTheoHd = dong
                .GroupBy(d => d.MaHd, StringComparer.OrdinalIgnoreCase)
                .ToDictionary(g => g.Key, g => g.Sum(DoanhThu),
                              StringComparer.OrdinalIgnoreCase);
            var suatTheoHd = dong
                .GroupBy(d => d.MaHd, StringComparer.OrdinalIgnoreCase)
                .ToDictionary(
                    g => g.Key,
                    g => g.Select(x => x.PtVat).Distinct().OrderBy(x => x).ToList(),
                    StringComparer.OrdinalIgnoreCase);

            var thuPham = dsHd
                .Select(h => new
                {
                    h.MaHd,
                    Lech = h.TienVat - theoHd.GetValueOrDefault(h.MaHd),
                    // Mẫu số phải là DOANH THU (đã trừ chiết khấu), không phải tiền hàng
                    // gộp — dùng tiền hàng gộp thì hóa đơn có chiết khấu ra tỷ lệ thấp
                    // hơn thuế suất thật và bị kết luận nhầm là "nhiều thuế suất".
                    Hang = dtTheoHd.GetValueOrDefault(h.MaHd),
                    Vat = h.TienVat,
                    Suat = suatTheoHd.GetValueOrDefault(h.MaHd) ?? new List<decimal>(),
                })
                .Where(x => Math.Abs(x.Lech) > 5m)
                .OrderByDescending(x => Math.Abs(x.Lech))
                .Take(5)
                .ToList();

            if (thuPham.Count == 0) return "";

            static string NhanHd(string maHd)
            {
                var m = maHd.Split('_');
                return m.Length >= 2 ? $"{m[^2]}/{m[^1]}" : maHd;
            }

            var ke = string.Join("; ", thuPham.Select(x =>
            {
                var mo = $"{NhanHd(x.MaHd)} lệch {x.Lech:N0}đ";
                if (x.Hang == 0) return mo;

                // Suất thực = VAT header / doanh thu. Khớp một suất chuẩn thì nói thẳng
                // "đang ghi 10% nhưng thực tế là 8%"; không khớp suất nào thì gần như
                // chắc chắn hóa đơn NHIỀU THUẾ SUẤT.
                var thuc = x.Vat * 100m / x.Hang;
                var chuan = new[] { 0m, 5m, 8m, 10m }
                    .FirstOrDefault(s => Math.Abs(thuc - s) <= 0.05m, -1m);
                var dangGhi = x.Suat.Count == 1 ? $"{x.Suat[0]:0.##}%" : "nhiều suất";

                return chuan >= 0 && x.Suat.Count == 1 && chuan != x.Suat[0]
                    ? $"{mo} (dòng ghi {dangGhi} nhưng VAT thực tế là {chuan:0.##}% — sửa pt_vat)"
                    : chuan < 0
                        ? $"{mo} (VAT/doanh thu = {thuc:0.##}%, không khớp suất nào — "
                          + "hóa đơn nhiều thuế suất, phải tách dòng)"
                        : mo;
            }));
            var them = dsHd.Count(h => Math.Abs(h.TienVat - theoHd.GetValueOrDefault(h.MaHd)) > 5m)
                     - thuPham.Count;
            return $". Hóa đơn lệch nhiều nhất: {ke}"
                 + (them > 0 ? $" (và {them} hóa đơn khác)" : "");
        }

        // ---------- Chỉ tiêu tờ khai chính (§3 spec) ----------
        private static void TinhChiTieu(ToKhaiGtgtDto tk, List<HoaDonKy> hoaDon)
        {
            var vao = hoaDon.Where(h => h.Huong == "VAO").ToList();
            var ra = hoaDon.Where(h => h.Huong == "RA").ToList();

            tk.Ct23 = Math.Round(vao.Sum(h => h.TienHangGop - h.TienCk), 0, MidpointRounding.AwayFromZero);
            tk.Ct24 = vao.Sum(h => h.TienVat);
            tk.Ct25 = tk.Ct24;
            decimal Dt(Func<NhomThueSuatDto, bool> loc) =>
                tk.NhomBanRa.Where(loc).Sum(n => n.DoanhThu);
            decimal Th(Func<NhomThueSuatDto, bool> loc) =>
                tk.NhomBanRa.Where(loc).Sum(n => n.Thue);

            bool LaKkknt(NhomThueSuatDto n) =>
                string.Equals(n.LoaiThue, "KKKNT", StringComparison.OrdinalIgnoreCase);
            bool LaKct(NhomThueSuatDto n) =>
                string.Equals(n.LoaiThue, "KCT", StringComparison.OrdinalIgnoreCase);
            tk.Ct32a = Dt(LaKkknt);
            tk.Ct26 = Dt(LaKct);
            tk.Ct29 = Dt(n => n.ThueSuat == 0 && !LaKct(n) && !LaKkknt(n));
            tk.Ct30 = Dt(n => n.ThueSuat == 5);
            tk.Ct31 = Th(n => n.ThueSuat == 5);
            tk.Ct32 = Dt(n => n.ThueSuat is 8 or 10);
            tk.Ct33 = Th(n => n.ThueSuat is 8 or 10);
            tk.Ct34 = tk.Ct26 + tk.Ct29 + tk.Ct30 + tk.Ct32 + tk.Ct32a;
            tk.Ct35 = tk.Ct31 + tk.Ct33;
            tk.Ct27 = tk.Ct29 + tk.Ct30 + tk.Ct32;
            tk.Ct28 = tk.Ct35;
            tk.Ct36 = tk.Ct35 - tk.Ct25;
            tk.Ct42 = 0;
            tk.Ct21 = hoaDon.Count == 0 ? 1 : 0;
            TinhLaiKetQua(tk);
        }

        // ---------- Phụ lục NQ142 (§3.5 spec) ----------
        private static void TinhPhuLucNq142(ToKhaiGtgtDto tk)
        {
            var raGiam = tk.NhomBanRa.Where(n => n.ThueSuat == 8).ToList();
            if (raGiam.Count == 0) return;

            var vaoGiam = tk.NhomMuaVao.Where(n => n.ThueSuat == 8).ToList();

            var dtRa = raGiam.Sum(n => n.DoanhThu);
            var pl = new PhuLucNq142Dto
            {
                GiaTriHhdvBanRa = dtRa,
                ThueGtgtDuocGiam = Math.Round(dtRa * 2m / 100m, 0, MidpointRounding.AwayFromZero),
                GiaTriHhdvMuaVao = vaoGiam.Sum(n => n.DoanhThu),
                ThueGtgtHhdvMuaVao = vaoGiam.Sum(n => n.Thue),
            };
            pl.ChenhLechCt9 = pl.ThueGtgtDuocGiam - pl.ThueGtgtHhdvMuaVao;
            tk.PhuLucNq142 = pl;

            // BR-TK-04: phụ lục không được vượt tờ khai chính
            if (pl.GiaTriHhdvBanRa > tk.Ct32)
                tk.CanhBao.Add(new CanhBaoToKhaiDto
                {
                    Ma = "BR-TK-04",
                    Muc = "CHAN",
                    MoTa = $"Phụ lục NQ142 khai doanh thu {pl.GiaTriHhdvBanRa:N0} "
                         + $"vượt chỉ tiêu 32 của tờ khai chính ({tk.Ct32:N0})",
                    ChenhLech = pl.GiaTriHhdvBanRa - tk.Ct32,
                });
        }

        private decimal? Ct43TrongSo(string code, int thangTruoc, int namTruoc)
        {
            const string sql = @"
                SELECT TOP 1 ct43_nnt
                  FROM TOKHAI
                 WHERE ma_donvi = @ma AND nam = @nam AND thang = @thang
                   AND not_use = 0 AND ct43_nnt IS NOT NULL
                 ORDER BY lan_nop DESC";
            try
            {
                using var conn = new SqlConnection(_resolver.GetPubConnection());
                conn.Open();
                using var cmd = new SqlCommand(sql, conn);
                cmd.Parameters.AddWithValue("@ma", code);
                cmd.Parameters.AddWithValue("@nam", namTruoc);
                cmd.Parameters.AddWithValue("@thang", thangTruoc);
                var v = cmd.ExecuteScalar();
                return v == null || v == DBNull.Value ? null : Convert.ToDecimal(v);
            }
            catch { return null; }
        }

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
                        Ma = "LK-02",
                        Muc = "CHAN",
                        MoTa = "File XML tải lên không đọc được chỉ tiêu 43 — "
                             + "có đúng là tờ khai 01/GTGT không?",
                    });
                else
                {
                    var kyMong = $"{thangTruoc:00}/{namTruoc}";
                    if (ky != null && ky != kyMong)
                        tk.CanhBao.Add(new CanhBaoToKhaiDto
                        {
                            Ma = "LK-01",
                            Muc = "CHAN",
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

            if (ct43 == null && !tk.CanhBao.Any(c => c.Ma is "LK-01" or "LK-02"))
            {
                var so = Ct43TrongSo(code, thangTruoc, namTruoc);
                if (so != null)
                {
                    ct43 = so;
                    nguon = $"chỉ tiêu 43 của tờ khai tháng {thangTruoc}/{namTruoc} "
                          + "đã lưu trong sổ (bảng TOKHAI)";
                }
            }

            if (ct43 == null)
            {
                if (!tk.CanhBao.Any(c => c.Ma is "LK-01" or "LK-02"))
                    tk.CanhBao.Add(new CanhBaoToKhaiDto
                    {
                        Ma = "LK-02",
                        Muc = "CHAN",
                        MoTa = $"Chưa có tờ khai kỳ trước (tháng {thangTruoc}/{namTruoc}) — "
                             + "hãy tải file XML tờ khai kỳ đó lên để lấy chỉ tiêu 22",
                    });
                return;
            }

            tk.Ct22 = ct43.Value;
            tk.NguonCt22 = nguon;

            TinhLaiKetQua(tk);
        }

        public bool CoToKhaiKyTruoc(string code, int nam, int thang, string? xmlTaiLen,
                                    out int thangTruoc, out int namTruoc)
        {
            (thangTruoc, namTruoc) = thang == 1 ? (12, nam - 1) : (thang - 1, nam);

            if (!string.IsNullOrWhiteSpace(xmlTaiLen)
                && DocCt43VaKy(xmlTaiLen).Ct43 != null)
                return true;

            if (TimXmlToKhai(code, thangTruoc, namTruoc) != null) return true;

            return Ct43TrongSo(code, thangTruoc, namTruoc) != null;
        }

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

        public static string DuongDanToKhai(string goc, string code, int nam)
            => Path.Combine(goc, code, $"NAM{nam}", "TO_KHAI", "TO_KHAI_GOC");

        public static string DuongDanToKhaiPhang(string goc, string code, int nam)
            => Path.Combine(goc, code, $"NAM{nam}", "TO_KHAI_GOC");

        private string? ThuMucToKhai(string code, int nam)
        {
            var goc = _config["Paths:ScanDocRoot1"];
            if (string.IsNullOrWhiteSpace(goc)) return null;

            // Thử khuôn đủ tầng trước, rồi tới khuôn phẳng — xem DuongDanToKhaiPhang.
            var d = DuongDanToKhai(goc, code, nam);
            if (Directory.Exists(d)) return d;

            d = DuongDanToKhaiPhang(goc, code, nam);
            return Directory.Exists(d) ? d : null;
        }

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
                .FirstOrDefault(f => LaXmlToKhai(f) &&
                    Path.GetFileName(f).Contains(dau, StringComparison.OrdinalIgnoreCase));
        }

        private static bool LaXmlToKhai(string duong)
        {
            var ten = Path.GetFileName(duong);
            return ten.EndsWith(".xml", StringComparison.OrdinalIgnoreCase)
                && !ten.StartsWith("HD_VAO", StringComparison.OrdinalIgnoreCase)
                && !ten.StartsWith("HD_RA", StringComparison.OrdinalIgnoreCase);
        }

        private static decimal? DocCt43(string duongDanXml)
        {
            try
            {
                var doc = XDocument.Load(duongDanXml);
                var e = doc.Descendants()
                           .FirstOrDefault(x => x.Name.LocalName == "ct43");
                if (e == null) return null;
                return decimal.TryParse(e.Value.Trim(), NumberStyles.Any,
                                        CultureInfo.InvariantCulture, out var v) ? v : null;
            }
            catch { return null; }
        }

        private static void KiemTraCanDoi(ToKhaiGtgtDto tk)
        {
            void Chan(string ma, string moTa, decimal? lech = null) =>
                tk.CanhBao.Add(new CanhBaoToKhaiDto
                { Ma = ma, Muc = "CHAN", MoTa = moTa, ChenhLech = lech });

            var tongDt = tk.Ct26 + tk.Ct29 + tk.Ct30 + tk.Ct32 + tk.Ct32a;
            if (tk.Ct34 != tongDt)
                Chan("LK-05", $"Chỉ tiêu 34 ({tk.Ct34:N0}) khác tổng các nhóm doanh thu "
                            + $"({tongDt:N0})", tk.Ct34 - tongDt);

            if (tk.Ct35 != tk.Ct31 + tk.Ct33)
                Chan("LK-05", $"Chỉ tiêu 35 ({tk.Ct35:N0}) khác ct31 + ct33 "
                            + $"({tk.Ct31 + tk.Ct33:N0})");

            if (tk.Ct43 != tk.Ct41 - tk.Ct42)
                Chan("LK-04", $"Chỉ tiêu 43 ({tk.Ct43:N0}) khác ct41 − ct42 "
                            + $"({tk.Ct41 - tk.Ct42:N0})");

            if (tk.Ct40 > 0 && tk.Ct41 > 0)
                Chan("LK-06", $"Vừa phải nộp ({tk.Ct40:N0}) vừa còn khấu trừ ({tk.Ct41:N0}) "
                            + "— hai chỉ tiêu này loại trừ nhau");
        }

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

            var thieu = new[] { "maCQTNoiNop", "maTinhNNT", "tieuMucHachToan" }
                .Where(t => string.IsNullOrWhiteSpace(Lay(t)))
                .ToList();
            if (thieu.Count > 0)
                throw new InvalidOperationException(
                    "File khuôn thiếu thông tin bắt buộc: " + string.Join(", ", thieu)
                    + ". Hãy dùng tờ khai chính thức đã nộp của kỳ trước.");
        }

        private string? TimXmlGanNhat(string code, int nam)
        {
            var goc = ThuMucToKhai(code, nam);
            if (goc == null) return null;
            return Directory
                .EnumerateFiles(goc, "*.xml", SearchOption.AllDirectories)
                .Where(LaXmlToKhai)
                .OrderByDescending(f => f, StringComparer.OrdinalIgnoreCase)
                .FirstOrDefault();
        }
    }

    public class BangToKhaiService
    {
        private readonly TenantDbResolver _resolver;
        private readonly IConfiguration _config;

        public BangToKhaiService(TenantDbResolver resolver, IConfiguration config)
        {
            _resolver = resolver;
            _config = config;
        }

        public async Task<List<DongRaSoatToKhaiDto>> Lap(
            IReadOnlyList<DonViKy> dsDonVi, int nam, int thang,
            CancellationToken huy = default)
        {
            var toKhai = await DocToKhai(nam, huy);
            var dem = await DemHoaDonMoiDonVi(dsDonVi, nam, thang, huy);
            var tuKho = QuetKhoToKhai(dsDonVi, nam, thang, huy);
            var ds = new List<DongRaSoatToKhaiDto>(dsDonVi.Count);
            int stt = 0;
            foreach (var dv in dsDonVi)
            {
                var ma = dv.Ma;
                var thangTk = ThangToKhai(dv, thang);
                var (namTr, thangTr) = KyTruocCuaDonVi(dv, nam, thangTk);

                toKhai.TryGetValue(Khoa(ma, nam, thangTk), out var tkNay);
                toKhai.TryGetValue(Khoa(ma, namTr, thangTr), out var tkTruoc);
                dem.TryGetValue(ma, out var d);
                tuKho.TryGetValue(Khoa(ma, nam, thangTk), out var khoNay);
                tuKho.TryGetValue(Khoa(ma, namTr, thangTr), out var khoTruoc);
                var tonCuoi = tkNay?.Ct43;
                var tonXml = tkNay?.Ct43Xml ?? khoNay?.Ct43;

                var slSo = (d?.V1 ?? 0) + (d?.R1 ?? 0) + (d?.V2 ?? 0) + (d?.R2 ?? 0)
                         + (d?.V3 ?? 0) + (d?.R3 ?? 0);

                ds.Add(new DongRaSoatToKhaiDto
                {
                    Stt = ++stt,
                    MaDonVi = ma,
                    KhaiQuy = dv.KhaiQuy,
                    KyKeKhai = dv.KhaiQuy ? $"Q{(thangTk + 2) / 3}/{nam}"
                                          : $"{thangTk:00}/{nam}",
                    TonDau = tkNay?.Ct22,
                    TonDauXml = tkTruoc?.Ct43 ?? khoTruoc?.Ct43,
                    V1 = d?.V1 ?? 0,
                    R1 = d?.R1 ?? 0,
                    V2 = d?.V2 ?? 0,
                    R2 = d?.R2 ?? 0,
                    V3 = d?.V3 ?? 0,
                    R3 = d?.R3 ?? 0,
                    TonCuoi = tonCuoi,
                    TonXml = tonXml,
                    Lech = tonCuoi != null && tonXml != null ? tonCuoi - tonXml : null,
                    CoToKhai = tkNay != null,
                    SoHdSo = slSo,
                    Mau01 = tkNay?.MaTk,
                });
            }
            return ds;
        }

        /// <summary>Một đơn vị kèm kiểu kỳ kê khai, do controller lấy từ Master.</summary>
        public sealed class DonViKy
        {
            public string Ma { get; set; } = "";
            public bool KhaiQuy { get; set; }
        }

        private static int ThangToKhai(DonViKy dv, int thang) =>
            dv.KhaiQuy ? ((thang + 2) / 3) * 3 : thang;

        private static int ThangDau(DonViKy dv, int thang) =>
            dv.KhaiQuy ? ((thang + 2) / 3) * 3 - 2 : thang;

        private static (int Nam, int Thang) KyTruocCuaDonVi(DonViKy dv, int nam, int thangTk)
        {
            var buoc = dv.KhaiQuy ? 3 : 1;
            var t = thangTk - buoc;
            return t >= 1 ? (nam, t) : (nam - 1, t + 12);
        }

        public async Task LuuToKhai(ToKhaiTayDto tk, string nguoiGhi,
                                    CancellationToken huy = default)
        {
            const string sql = @"
                MERGE TOKHAI AS t
                USING (SELECT @ma AS ma_donvi, @ky AS ky_kekhai, @lan AS lan_nop) AS s
                   ON t.ma_donvi = s.ma_donvi AND t.ky_kekhai = s.ky_kekhai
                  AND t.lan_nop = s.lan_nop
                WHEN MATCHED THEN UPDATE SET
                    nam = @nam, thang = @thang,
                    ma_tk = @maTk, ten_tk = @tenTk, xml_ver = @xmlVer, loai_tk = @loaiTk,
                    ma_cct = @maCct, ten_cct = @tenCct, ngay_lap = @ngayLap,
                    mst_nnt = @mst, ten_nnt = @tenNnt, dia_chi_nnt = @diaChi,
                    ct21_nnt=@ct21, ct22_nnt=@ct22, ct23_nnt=@ct23, ct24_nnt=@ct24,
                    ct23a_nnt=@ct23a, ct24a_nnt=@ct24a,
                    ct25_nnt=@ct25, ct26_nnt=@ct26, ct27_nnt=@ct27, ct28_nnt=@ct28,
                    ct29_nnt=@ct29, ct30_nnt=@ct30, ct31_nnt=@ct31, ct32_nnt=@ct32,
                    ct33_nnt=@ct33, ct32a_nnt=@ct32a, ct34_nnt=@ct34, ct35_nnt=@ct35,
                    ct36_nnt=@ct36, ct37_nnt=@ct37, ct38_nnt=@ct38, ct39_nnt=@ct39,
                    ct40a_nnt=@ct40a, ct40b_nnt=@ct40b, ct40_nnt=@ct40, ct41_nnt=@ct41,
                    ct42_nnt=@ct42, ct43_nnt=@ct43,
                    ghi_chu = @ghiChu, updated_by = @nguoi, updated_at = SYSDATETIME()
                WHEN NOT MATCHED THEN INSERT
                    (ma_donvi, ky_kekhai, lan_nop, nam, thang,
                     ma_tk, ten_tk, xml_ver, loai_tk, ma_cct, ten_cct, ngay_lap,
                     mst_nnt, ten_nnt, dia_chi_nnt,
                     ct21_nnt, ct22_nnt, ct23_nnt, ct24_nnt,
                     ct23a_nnt, ct24a_nnt, ct25_nnt, ct26_nnt,
                     ct27_nnt, ct28_nnt, ct29_nnt, ct30_nnt, ct31_nnt, ct32_nnt,
                     ct33_nnt, ct32a_nnt, ct34_nnt, ct35_nnt, ct36_nnt, ct37_nnt,
                     ct38_nnt, ct39_nnt, ct40a_nnt, ct40b_nnt, ct40_nnt, ct41_nnt,
                     ct42_nnt, ct43_nnt, ghi_chu, ma_nv, time_add, created_by)
                  VALUES
                    (@ma, @ky, @lan, @nam, @thang,
                     @maTk, @tenTk, @xmlVer, @loaiTk, @maCct, @tenCct, @ngayLap,
                     @mst, @tenNnt, @diaChi,
                     @ct21, @ct22, @ct23, @ct24,
                     @ct23a, @ct24a, @ct25, @ct26,
                     @ct27, @ct28, @ct29, @ct30, @ct31, @ct32,
                     @ct33, @ct32a, @ct34, @ct35, @ct36, @ct37,
                     @ct38, @ct39, @ct40a, @ct40b, @ct40, @ct41,
                     @ct42, @ct43, @ghiChu, @nguoi, SYSDATETIME(), @nguoi);";

            using var conn = new SqlConnection(_resolver.GetPubConnection());
            await conn.OpenAsync(huy);
            using var cmd = new SqlCommand(sql, conn);
            var p = cmd.Parameters;
            p.AddWithValue("@ma", tk.MaDonVi);
            p.AddWithValue("@ky", $"{tk.Thang:00}/{tk.Nam}");
            p.AddWithValue("@lan", tk.LanNop);
            p.AddWithValue("@nam", tk.Nam);
            p.AddWithValue("@thang", tk.Thang);
            p.AddWithValue("@maTk", "842");
            p.AddWithValue("@tenTk", "TỜ KHAI THUẾ GIÁ TRỊ GIA TĂNG (Mẫu số 01/GTGT)");
            p.AddWithValue("@xmlVer", "2.8.3");
            p.AddWithValue("@loaiTk", tk.LanNop == 0 ? "C" : "B");   // C=chính thức, B=bổ sung
            p.AddWithValue("@maCct", (object?)tk.MaCct ?? DBNull.Value);
            p.AddWithValue("@tenCct", (object?)tk.TenCct ?? DBNull.Value);
            p.AddWithValue("@ngayLap", DateTime.Today);
            p.AddWithValue("@mst", (object?)tk.Mst ?? DBNull.Value);
            p.AddWithValue("@tenNnt", (object?)tk.TenNnt ?? DBNull.Value);
            p.AddWithValue("@diaChi", (object?)tk.DiaChiNnt ?? DBNull.Value);
            p.AddWithValue("@ghiChu", (object?)tk.GhiChu ?? DBNull.Value);
            p.AddWithValue("@nguoi", nguoiGhi);

            foreach (var (ten, gia) in tk.ChiTieu())
                p.AddWithValue(ten, gia);

            await cmd.ExecuteNonQueryAsync(huy);
        }

        public async Task<List<DongBcToKhaiDto>> DsToKhai(
            int nam, string? maDonVi, int? thang, CancellationToken huy = default)
        {
            var sql = @"
                SELECT ma_donvi, nam, thang, ky_kekhai, lan_nop,
                       ct22_nnt, ct23_nnt, ct24_nnt, ct25_nnt,
                       ct34_nnt, ct35_nnt, ct40_nnt, ct43_nnt,
                       xml_name, xml_path, ngay_lap, ma_nv, ghi_chu
                  FROM TOKHAI
                 WHERE not_use = 0 AND nam = @nam"
                + (string.IsNullOrWhiteSpace(maDonVi) ? "" : " AND ma_donvi = @ma")
                + (thang is >= 1 and <= 12 ? " AND thang = @thang" : "")
                + " ORDER BY ma_donvi, thang, lan_nop";

            var ds = new List<DongBcToKhaiDto>();
            using var conn = new SqlConnection(_resolver.GetPubConnection());
            await conn.OpenAsync(huy);
            using var cmd = new SqlCommand(sql, conn);
            cmd.Parameters.AddWithValue("@nam", nam);
            if (!string.IsNullOrWhiteSpace(maDonVi)) cmd.Parameters.AddWithValue("@ma", maDonVi);
            if (thang is >= 1 and <= 12) cmd.Parameters.AddWithValue("@thang", thang);

            using var r = await cmd.ExecuteReaderAsync(huy);
            int stt = 0;
            while (await r.ReadAsync(huy))
            {
                decimal? D(int i) => r.IsDBNull(i) ? null : r.GetDecimal(i);
                ds.Add(new DongBcToKhaiDto
                {
                    Stt = ++stt,
                    MaDonVi = r.GetString(0),
                    Nam = r.GetInt32(1),
                    Thang = r.IsDBNull(2) ? 0 : r.GetInt32(2),
                    KyKeKhai = r.IsDBNull(3) ? "" : r.GetString(3),
                    LanNop = r.GetInt32(4),
                    TonDau = D(5),
                    GtMuaVao = D(6),
                    VatVao = D(7),
                    VatKhauTru = D(8),
                    GtBanRa = D(9),
                    VatRa = D(10),
                    VatPhaiNop = D(11),
                    TonCuoi = D(12),
                    XmlName = r.IsDBNull(13) ? null : r.GetString(13),
                    XmlPath = r.IsDBNull(14) ? null : r.GetString(14),
                    DaNop = !r.IsDBNull(14),
                    NgayLap = r.IsDBNull(15) ? null : r.GetDateTime(15),
                    NguoiLap = r.IsDBNull(16) ? null : r.GetString(16),
                    GhiChu = r.IsDBNull(17) ? null : r.GetString(17),
                });
            }
            await GopSoTuSo(ds, nam, huy);
            return ds;
        }

        private async Task GopSoTuSo(
            List<DongBcToKhaiDto> ds, int nam, CancellationToken huy)
        {
            var maDs = ds.Select(d => d.MaDonVi)
                         .Distinct(StringComparer.OrdinalIgnoreCase).ToList();
            if (maDs.Count == 0) return;
            // Đơn vị nào chưa có IN_VALUE_LINE (database đời đầu, script 021 chưa chạy)
            // thì loại khỏi câu hỏi luôn — cùng luật với DoiChieuInValue: thiếu bảng chỉ
            // là không có gì để đối chiếu, không phải lỗi.
            var dung = await LocDonViCoBang(
                maDs.Select(m => new DonViKy { Ma = m }).ToList(), nam, huy,
                "IN_VALUE_LINE");
            if (dung.Count == 0) return;

            var nhanh = new List<string>();
            var thamSo = new List<(string, object)>();
            for (int i = 0; i < dung.Count; i++)
            {
                var db = _resolver.BuildDbName(dung[i].Ma, nam);
                nhanh.Add($@"
                    SELECT @m{i} AS ma_donvi, v.thang, v.loai_ct,
                           SUM(ISNULL(l.value1, 0)) AS gt_hang,
                           SUM(ISNULL(l.tax, 0))    AS vat
                      FROM [{db}].dbo.IN_VALUE v
                      JOIN [{db}].dbo.IN_VALUE_LINE l ON l.ma_input = v.ma_input
                     GROUP BY v.thang, v.loai_ct");
                thamSo.Add(($"@m{i}", dung[i].Ma));
            }

            // (mã đơn vị, kỳ kê khai) → số của BẢNG KÊ gốc TCT
            var so = new Dictionary<string, (decimal HangVao, decimal VatVao,
                                             decimal HangRa, decimal VatRa)>(
                StringComparer.OrdinalIgnoreCase);

            using var conn = new SqlConnection(_resolver.GetMasterConnection());
            await conn.OpenAsync(huy);
            using var cmd = new SqlCommand(string.Join("\n UNION ALL\n", nhanh), conn);
            foreach (var (ten, gia) in thamSo) cmd.Parameters.AddWithValue(ten, gia);

            using var r = await cmd.ExecuteReaderAsync(huy);
            while (await r.ReadAsync(huy))
            {
                if (r.IsDBNull(1)) continue;             // dòng bảng kê chưa gán kỳ
                var k = $"{r.GetString(0)}|{r.GetInt32(1)}".ToUpperInvariant();
                // IN_VALUE ghi hướng bằng MỘT ký tự V/R, không phải VAO/RA như HOA_DON.
                var laVao = string.Equals(r.IsDBNull(2) ? "" : r.GetString(2),
                                          "V", StringComparison.OrdinalIgnoreCase);
                var hang = r.IsDBNull(3) ? 0m : r.GetDecimal(3);
                var vat = r.IsDBNull(4) ? 0m : r.GetDecimal(4);

                so.TryGetValue(k, out var cu);
                so[k] = laVao ? (cu.HangVao + hang, cu.VatVao + vat, cu.HangRa, cu.VatRa)
                              : (cu.HangVao, cu.VatVao, cu.HangRa + hang, cu.VatRa + vat);
            }

            foreach (var d in ds)
            {
                if (!so.TryGetValue($"{d.MaDonVi}|{d.Thang}".ToUpperInvariant(), out var s))
                    continue;
                d.GtHdVao = s.HangVao;
                d.GtVatVao = s.VatVao;
                d.GtHdRa = s.HangRa;
                d.GtVatRa = s.VatRa;
                d.LechGtHdVao = d.GtMuaVao == null ? null : d.GtMuaVao - s.HangVao;
                d.LechVatVao = d.VatVao == null ? null : d.VatVao - s.VatVao;
                d.LechGtHdRa = d.GtBanRa == null ? null : d.GtBanRa - s.HangRa;
                d.LechVatRa = d.VatRa == null ? null : d.VatRa - s.VatRa;
            }
        }

        public string? ThuMucToKhai(string maDonVi, int nam, int thang)
        {
            var goc = _config["Paths:ScanDocRoot1"];
            if (string.IsNullOrWhiteSpace(goc)) return null;
            if (!TenantDbResolver.IsValidCode(maDonVi)) return null;

            var cha = ToKhaiService.DuongDanToKhai(goc, maDonVi, nam);
            if (!Directory.Exists(cha))
            {
                var phang = ToKhaiService.DuongDanToKhaiPhang(goc, maDonVi, nam);
                if (Directory.Exists(phang)) cha = phang;
            }

            return Path.Combine(cha, $"TKG_T{thang}_{nam}");
        }

        /// <summary>Một mục (thư mục con hoặc file) khi duyệt kho tờ khai.</summary>
        public sealed class MucKho
        {
            public string Ten { get; set; } = "";
            public string DuongDan { get; set; } = "";
            public bool LaThuMuc { get; set; }
            public long Kich { get; set; }           // byte; thư mục = 0
            public DateTime? SuaLuc { get; set; }
        }

        /// <summary>Kết quả duyệt MỘT thư mục trong kho tờ khai.</summary>
        public sealed class KetQuaDuyet
        {
            public string DuongDan { get; set; } = "";
            public string? Cha { get; set; }
            public bool LaGoc { get; set; }
            public List<MucKho> Muc { get; set; } = new();

            public string DuongDanXin { get; set; } = "";
            public List<string> ThieuTang { get; set; } = new();
        }

        private (string Dich, string Goc) DuyetKhoHopLe(string? duongDan)
        {
            var goc = _config["Paths:ScanDocRoot1"];
            if (string.IsNullOrWhiteSpace(goc))
                throw new ArgumentException("Chưa khai Paths:ScanDocRoot1 trong cấu hình máy chủ");

            var gocDay = Path.TrimEndingDirectorySeparator(Path.GetFullPath(goc));
            var dich = string.IsNullOrWhiteSpace(duongDan)
                ? gocDay
                : Path.TrimEndingDirectorySeparator(Path.GetFullPath(duongDan));

            if (!dich.Equals(gocDay, StringComparison.OrdinalIgnoreCase)
                && !dich.StartsWith(gocDay + Path.DirectorySeparatorChar,
                                    StringComparison.OrdinalIgnoreCase))
                throw new UnauthorizedAccessException(
                    "Đường dẫn nằm ngoài kho tờ khai — không được phép");

            return (dich, gocDay);
        }

        public KetQuaDuyet DuyetKho(string? duongDan)
        {
            var (dich, gocDay) = DuyetKhoHopLe(duongDan);
            var xin = dich;
            var thieu = new List<string>();
            while (!Directory.Exists(dich)
                   && !dich.Equals(gocDay, StringComparison.OrdinalIgnoreCase))
            {
                thieu.Insert(0, Path.GetFileName(dich));
                var cha = Path.GetDirectoryName(dich);
                if (string.IsNullOrEmpty(cha)) break;
                dich = Path.TrimEndingDirectorySeparator(cha);
            }

            if (!Directory.Exists(dich))
                throw new DirectoryNotFoundException($"Không thấy thư mục {dich}");

            var laGoc = dich.Equals(gocDay, StringComparison.OrdinalIgnoreCase);
            var kq = new KetQuaDuyet
            {
                DuongDan = dich,
                LaGoc = laGoc,
                // Ở gốc thì KHÔNG cho lùi tiếp — lùi nữa là ra khỏi kho.
                Cha = laGoc ? null : Path.GetDirectoryName(dich),
                DuongDanXin = xin,
                ThieuTang = thieu,
            };

            var thongTin = new DirectoryInfo(dich);

            foreach (var d in thongTin.EnumerateDirectories().OrderBy(x => x.Name))
                kq.Muc.Add(new MucKho
                {
                    Ten = d.Name,
                    DuongDan = d.FullName,
                    LaThuMuc = true,
                    SuaLuc = d.LastWriteTime,
                });

            foreach (var f in thongTin.EnumerateFiles()
                         .Where(x => x.Extension.Equals(".xml", StringComparison.OrdinalIgnoreCase)
                                  || x.Extension.Equals(".zip", StringComparison.OrdinalIgnoreCase))
                         .OrderBy(x => x.Name))
                kq.Muc.Add(new MucKho
                {
                    Ten = f.Name,
                    DuongDan = f.FullName,
                    LaThuMuc = false,
                    Kich = f.Length,
                    SuaLuc = f.LastWriteTime,
                });

            return kq;
        }

        public async Task<string> LuuFileToKhai(
            string maDonVi, int nam, int thang, string tenFile, Stream noiDung,
            CancellationToken huy = default, string? thuMucChon = null)
        {
            string thuMuc;
            if (!string.IsNullOrWhiteSpace(thuMucChon))
                thuMuc = DuyetKhoHopLe(thuMucChon).Dich;   // ném nếu ra ngoài kho
            else
            {
                thuMuc = ThuMucToKhai(maDonVi, nam, thang)
                    ?? throw new ArgumentException(
                        "Chưa khai Paths:ScanDocRoot1 hoặc mã đơn vị không hợp lệ");
            }

            Directory.CreateDirectory(thuMuc);      // tự tạo thư mục kỳ mới
            var ten = Path.GetFileName(tenFile);
            if (string.IsNullOrWhiteSpace(ten))
                throw new ArgumentException("Tên file không hợp lệ");

            var duong = Path.Combine(thuMuc, ten);
            if (File.Exists(duong))
            {
                var goc = Path.GetFileNameWithoutExtension(ten);
                var duoi = Path.GetExtension(ten);
                for (int i = 1; i <= 99 && File.Exists(duong); i++)
                    duong = Path.Combine(thuMuc, $"{goc}_{i}{duoi}");
            }

            using (var ra = File.Create(duong))
                await noiDung.CopyToAsync(ra, huy);

            return duong;
        }

        public async Task<bool> GanXmlDaNop(
            string maDonVi, int nam, int thang, int lanNop,
            string tenFile, string? duongDan, Dictionary<string, decimal?> ct,
            string nguoiGhi, CancellationToken huy = default, string? ghiChu = null)
        {
            var dat = string.Join(", ", ToKhaiService.ChiTieuXml.Select(x => $"{x.Cot} = @{x.Cot}"));
            var cot = string.Join(", ", ToKhaiService.ChiTieuXml.Select(x => x.Cot));
            var giaTri = string.Join(", ", ToKhaiService.ChiTieuXml.Select(x => $"@{x.Cot}"));

            var sql = $@"
                UPDATE TOKHAI
                   SET xml_name = @ten, xml_path = @duong, xml_nap_luc = SYSDATETIME(),
                       {dat},
                       ghi_chu = ISNULL(@ghiChu, ghi_chu),
                       updated_by = @nguoi, updated_at = SYSDATETIME()
                 WHERE ma_donvi = @ma AND nam = @nam AND thang = @thang
                   AND lan_nop = @lan AND not_use = 0;

                IF @@ROWCOUNT = 0
                   AND NOT EXISTS (SELECT 1 FROM TOKHAI
                                    WHERE ma_donvi = @ma AND ky_kekhai = @ky
                                      AND lan_nop = @lan)
                    INSERT INTO TOKHAI
                        (ma_donvi, ky_kekhai, lan_nop, thang, nam,
                         xml_name, xml_path, xml_nap_luc, {cot},
                         ghi_chu, not_use, created_by, created_at)
                    VALUES
                        (@ma, @ky, @lan, @thang, @nam,
                         @ten, @duong, SYSDATETIME(), {giaTri},
                         @ghiChu, 0, @nguoi, SYSDATETIME());";

            using var conn = new SqlConnection(_resolver.GetPubConnection());
            await conn.OpenAsync(huy);
            using var cmd = new SqlCommand(sql, conn);
            cmd.Parameters.AddWithValue("@ma", maDonVi);
            cmd.Parameters.AddWithValue("@nam", nam);
            cmd.Parameters.AddWithValue("@thang", thang);
            cmd.Parameters.AddWithValue("@ky", $"{thang:00}/{nam}");
            cmd.Parameters.AddWithValue("@lan", lanNop);
            cmd.Parameters.AddWithValue("@ten", tenFile);
            cmd.Parameters.AddWithValue("@duong", (object?)duongDan ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@nguoi", nguoiGhi);
            cmd.Parameters.AddWithValue("@ghiChu", (object?)ghiChu ?? DBNull.Value);
            foreach (var (_, c) in ToKhaiService.ChiTieuXml)
                cmd.Parameters.AddWithValue($"@{c}",
                    (object?)(ct.TryGetValue(c, out var v) ? v : null) ?? DBNull.Value);

            return await cmd.ExecuteNonQueryAsync(huy) > 0;
        }

        /// <summary>Một chỉ tiêu lệch giữa bản TỰ LẬP và bản TCT TRẢ VỀ.</summary>
        public sealed class ChiTieuLech
        {
            public string Ma { get; set; } = "";      // '22', '43'…
            public decimal? TuLap { get; set; }
            public decimal? Tct { get; set; }
            public decimal? Lech { get; set; }
        }

        public sealed class DongDoiChieu
        {
            public string Ma { get; set; } = "";       // '22', '32a', '43'…
            public string Ten { get; set; } = "";      // nhãn đọc được
            public decimal? ToKhai { get; set; }
            public decimal? So { get; set; }
            public decimal? Tct { get; set; }
            public decimal? LechSo => ToKhai != null && So != null ? ToKhai - So : null;
            public decimal? LechTct => ToKhai != null && Tct != null ? ToKhai - Tct : null;
            public bool CoLech => (LechSo ?? 0) != 0 || (LechTct ?? 0) != 0;
        }

        public async Task<List<DongDoiChieu>> DoiChieuBaNguon(
            string maDonVi, int nam, int thang, bool khaiQuy, int lanNop,
            ToKhaiGtgtDto? tuSo, CancellationToken huy = default)
        {
            // Nhãn chỉ tiêu — giữ đúng chữ của bản in để đối chiếu với tờ khai giấy.
            var nhan = new Dictionary<string, string>
            {
                ["21"] = "Không phát sinh mua bán",
                ["22"] = "Khấu trừ kỳ trước chuyển sang",
                ["23"] = "Giá trị HHDV mua vào",
                ["24"] = "Thuế GTGT mua vào",
                ["25"] = "Thuế GTGT được khấu trừ kỳ này",
                ["26"] = "Bán ra không chịu thuế",
                ["27"] = "Bán ra chịu thuế — doanh thu",
                ["28"] = "Bán ra chịu thuế — thuế",
                ["29"] = "Bán ra thuế suất 0%",
                ["30"] = "Bán ra 5% — doanh thu",
                ["31"] = "Bán ra 5% — thuế",
                ["32"] = "Bán ra 10% — doanh thu",
                ["33"] = "Bán ra 10% — thuế",
                ["32a"] = "Bán ra không tính thuế",
                ["34"] = "Tổng doanh thu bán ra",
                ["35"] = "Tổng thuế GTGT bán ra",
                ["36"] = "Thuế GTGT phát sinh trong kỳ",
                ["37"] = "Điều chỉnh giảm",
                ["38"] = "Điều chỉnh tăng",
                ["39"] = "Thuế nhận bàn giao được khấu trừ",
                ["40a"] = "Thuế phải nộp của HĐSXKD",
                ["40b"] = "Thuế dự án đầu tư được bù trừ",
                ["40"] = "Thuế còn phải nộp trong kỳ",
                ["41"] = "Thuế chưa khấu trừ hết",
                ["42"] = "Thuế đề nghị hoàn",
                ["43"] = "Còn khấu trừ chuyển kỳ sau",
            };

            // Số TÍNH TỪ SỔ — chỉ những chỉ tiêu sổ suy ra được.
            var tuSoMap = new Dictionary<string, decimal?>();
            if (tuSo != null)
            {
                tuSoMap["23"] = tuSo.Ct23; tuSoMap["24"] = tuSo.Ct24;
                tuSoMap["25"] = tuSo.Ct25; tuSoMap["26"] = tuSo.Ct26;
                tuSoMap["27"] = tuSo.Ct27; tuSoMap["28"] = tuSo.Ct28;
                tuSoMap["29"] = tuSo.Ct29; tuSoMap["30"] = tuSo.Ct30;
                tuSoMap["31"] = tuSo.Ct31; tuSoMap["32"] = tuSo.Ct32;
                tuSoMap["33"] = tuSo.Ct33; tuSoMap["32a"] = tuSo.Ct32a;
                tuSoMap["34"] = tuSo.Ct34; tuSoMap["35"] = tuSo.Ct35;
                tuSoMap["36"] = tuSo.Ct36;
            }

            var cap = ToKhaiService.ChiTieuXml
                .Select(x => (Ma: x.The.Replace("ct", ""),
                              Nnt: x.Cot.Replace("_xml", "_nnt"), Xml: x.Cot))
                .ToArray();

            var sql = $@"
                SELECT xml_nap_luc, {string.Join(", ", cap.Select(c => $"{c.Nnt}, {c.Xml}"))}
                  FROM TOKHAI
                 WHERE ma_donvi = @ma AND nam = @nam AND thang = @thang
                   AND lan_nop = @lan AND not_use = 0";

            var ds = new List<DongDoiChieu>();
            using var conn = new SqlConnection(_resolver.GetPubConnection());
            await conn.OpenAsync(huy);
            using var cmd = new SqlCommand(sql, conn);
            cmd.Parameters.AddWithValue("@ma", maDonVi);
            cmd.Parameters.AddWithValue("@nam", nam);
            cmd.Parameters.AddWithValue("@thang", thang);
            cmd.Parameters.AddWithValue("@lan", lanNop);

            using var r = await cmd.ExecuteReaderAsync(huy);
            if (!await r.ReadAsync(huy)) return ds;
            bool coTct = !r.IsDBNull(0);

            for (int i = 0; i < cap.Length; i++)
            {
                int iN = 1 + i * 2, iX = iN + 1;
                var ma = cap[i].Ma;
                ds.Add(new DongDoiChieu
                {
                    Ma = ma,
                    Ten = nhan.TryGetValue(ma, out var t) ? t : ma,
                    ToKhai = r.IsDBNull(iN) ? null : r.GetDecimal(iN),
                    So = tuSoMap.TryGetValue(ma, out var v) ? v : null,
                    Tct = coTct && !r.IsDBNull(iX) ? r.GetDecimal(iX) : null,
                });
            }
            return ds;
        }

        public async Task<List<ChiTieuLech>> SoSanhVoiTct(
            string maDonVi, int nam, int thang, int lanNop = 0,
            CancellationToken huy = default)
        {
            var cap = ToKhaiService.ChiTieuXml
                .Select(x => (Ma: x.The.Replace("ct", ""),
                              Nnt: x.Cot.Replace("_xml", "_nnt"), Xml: x.Cot))
                .ToArray();

            var sql = $@"
                SELECT xml_nap_luc, {string.Join(", ", cap.Select(c => $"{c.Nnt}, {c.Xml}"))}
                  FROM TOKHAI
                 WHERE ma_donvi = @ma AND nam = @nam AND thang = @thang
                   AND lan_nop = @lan AND not_use = 0";

            using var conn = new SqlConnection(_resolver.GetPubConnection());
            await conn.OpenAsync(huy);
            using var cmd = new SqlCommand(sql, conn);
            cmd.Parameters.AddWithValue("@ma", maDonVi);
            cmd.Parameters.AddWithValue("@nam", nam);
            cmd.Parameters.AddWithValue("@thang", thang);
            cmd.Parameters.AddWithValue("@lan", lanNop);

            var ds = new List<ChiTieuLech>();
            using var r = await cmd.ExecuteReaderAsync(huy);
            if (!await r.ReadAsync(huy)) return ds;
            if (r.IsDBNull(0)) return ds;               // chưa nạp bản TCT

            for (int i = 0; i < cap.Length; i++)
            {
                int iN = 1 + i * 2, iX = iN + 1;
                decimal a = r.IsDBNull(iN) ? 0m : r.GetDecimal(iN);
                decimal b = r.IsDBNull(iX) ? 0m : r.GetDecimal(iX);
                if (a != b)
                    ds.Add(new ChiTieuLech
                    { Ma = cap[i].Ma, TuLap = a, Tct = b, Lech = a - b });
            }
            return ds;
        }

        public async Task<(decimal? Ct22, string? Nguon)> TonDauTuKyTruoc(
            string maDonVi, int nam, int thang, bool khaiQuy,
            CancellationToken huy = default)
        {
            var buoc = khaiQuy ? 3 : 1;
            var t = thang - buoc;
            var namTr = t >= 1 ? nam : nam - 1;
            var thangTr = t >= 1 ? t : t + 12;

            const string sql = @"
                SELECT TOP 1 ct43_xml, ct43_nnt, xml_nap_luc
                  FROM TOKHAI
                 WHERE ma_donvi = @ma AND nam = @nam AND thang = @thang
                   AND not_use = 0
                 ORDER BY lan_nop DESC";

            using var conn = new SqlConnection(_resolver.GetPubConnection());
            await conn.OpenAsync(huy);
            using var cmd = new SqlCommand(sql, conn);
            cmd.Parameters.AddWithValue("@ma", maDonVi);
            cmd.Parameters.AddWithValue("@nam", namTr);
            cmd.Parameters.AddWithValue("@thang", thangTr);

            using var r = await cmd.ExecuteReaderAsync(huy);
            if (!await r.ReadAsync(huy)) return (null, null);

            var ky = $"{thangTr:00}/{namTr}";
            if (!r.IsDBNull(0))
                return (r.GetDecimal(0), $"tờ khai TCT trả về kỳ {ky}");
            if (!r.IsDBNull(1))
                return (r.GetDecimal(1), $"tờ khai tự lập kỳ {ky} (chưa nạp bản TCT)");
            return (null, null);
        }

        public async Task<ToKhaiTayDto?> DocToKhaiTay(
            string maDonVi, int nam, int thang, int lanNop, CancellationToken huy = default)
        {
            const string sql = @"
                SELECT ma_donvi, nam, thang, lan_nop, ma_cct, ten_cct,
                       mst_nnt, ten_nnt, dia_chi_nnt, ghi_chu,
                       ct21_nnt, ct22_nnt, ct23_nnt, ct24_nnt, ct25_nnt, ct26_nnt,
                       ct27_nnt, ct28_nnt, ct29_nnt, ct30_nnt, ct31_nnt, ct32_nnt,
                       ct33_nnt, ct32a_nnt, ct34_nnt, ct35_nnt, ct36_nnt, ct37_nnt,
                       ct38_nnt, ct39_nnt, ct40a_nnt, ct40b_nnt, ct40_nnt, ct41_nnt,
                       ct42_nnt, ct43_nnt,
                       ct23a_nnt, ct24a_nnt
                  FROM TOKHAI
                 WHERE ma_donvi = @ma AND nam = @nam AND thang = @thang
                   AND lan_nop = @lan AND not_use = 0";

            using var conn = new SqlConnection(_resolver.GetPubConnection());
            await conn.OpenAsync(huy);
            using var cmd = new SqlCommand(sql, conn);
            cmd.Parameters.AddWithValue("@ma", maDonVi);
            cmd.Parameters.AddWithValue("@nam", nam);
            cmd.Parameters.AddWithValue("@thang", thang);
            cmd.Parameters.AddWithValue("@lan", lanNop);

            using var r = await cmd.ExecuteReaderAsync(huy);
            if (!await r.ReadAsync(huy)) return null;

            decimal D(int i) => r.IsDBNull(i) ? 0m : r.GetDecimal(i);
            return new ToKhaiTayDto
            {
                MaDonVi = r.GetString(0),
                Nam = r.GetInt32(1),
                Thang = r.GetInt32(2),
                LanNop = r.GetInt32(3),
                MaCct = r.IsDBNull(4) ? null : r.GetString(4),
                TenCct = r.IsDBNull(5) ? null : r.GetString(5),
                Mst = r.IsDBNull(6) ? null : r.GetString(6),
                TenNnt = r.IsDBNull(7) ? null : r.GetString(7),
                DiaChiNnt = r.IsDBNull(8) ? null : r.GetString(8),
                GhiChu = r.IsDBNull(9) ? null : r.GetString(9),
                Ct21 = D(10),
                Ct22 = D(11),
                Ct23 = D(12),
                Ct24 = D(13),
                Ct25 = D(14),
                Ct26 = D(15),
                Ct27 = D(16),
                Ct28 = D(17),
                Ct29 = D(18),
                Ct30 = D(19),
                Ct31 = D(20),
                Ct32 = D(21),
                Ct33 = D(22),
                Ct32a = D(23),
                Ct34 = D(24),
                Ct35 = D(25),
                Ct36 = D(26),
                Ct37 = D(27),
                Ct38 = D(28),
                Ct39 = D(29),
                Ct40a = D(30),
                Ct40b = D(31),
                Ct40 = D(32),
                Ct41 = D(33),
                Ct42 = D(34),
                Ct43 = D(35),
                Ct23a = D(36),
                Ct24a = D(37),
            };
        }

        private static string Khoa(string ma, int nam, int thang) =>
            $"{ma}|{nam}|{thang}".ToUpperInvariant();

        private sealed class ToKhaiKy
        {
            public decimal? Ct22;
            public decimal? Ct43;
            public decimal? Ct43Xml;
            public string? MaTk;      // '842' = mẫu 01/GTGT
        }

        private async Task<Dictionary<string, ToKhaiKy>> DocToKhai(
            int nam, CancellationToken huy)
        {
            const string sql = @"
                WITH x AS (
                    SELECT ma_donvi, nam, thang, ct22_nnt, ct43_nnt, ct43_xml, ma_tk,
                           ROW_NUMBER() OVER (PARTITION BY ma_donvi, nam, thang
                                              ORDER BY lan_nop DESC) AS rn
                      FROM TOKHAI
                     WHERE not_use = 0
                       AND nam IN (@nam, @namTruoc)
                )
                SELECT ma_donvi, nam, thang, ct22_nnt, ct43_nnt, ct43_xml, ma_tk
                  FROM x WHERE rn = 1";

            var kq = new Dictionary<string, ToKhaiKy>(StringComparer.OrdinalIgnoreCase);
            using var conn = new SqlConnection(_resolver.GetPubConnection());
            await conn.OpenAsync(huy);
            using var cmd = new SqlCommand(sql, conn);
            cmd.Parameters.AddWithValue("@nam", nam);
            cmd.Parameters.AddWithValue("@namTruoc", nam - 1);

            using var r = await cmd.ExecuteReaderAsync(huy);
            while (await r.ReadAsync(huy))
            {
                var ma = r.GetString(0);
                if (r.IsDBNull(2)) continue;
                var k = Khoa(ma, r.GetInt32(1), r.GetInt32(2));
                kq[k] = new ToKhaiKy
                {
                    Ct22 = r.IsDBNull(3) ? null : r.GetDecimal(3),
                    Ct43 = r.IsDBNull(4) ? null : r.GetDecimal(4),
                    Ct43Xml = r.IsDBNull(5) ? null : r.GetDecimal(5),
                    MaTk = r.IsDBNull(6) ? null : r.GetString(6),
                };
            }
            return kq;
        }

        private Dictionary<string, ToKhaiKy> QuetKhoToKhai(
            IReadOnlyList<DonViKy> dsDonVi, int nam, int thang, CancellationToken huy)
        {
            var kq = new Dictionary<string, ToKhaiKy>(StringComparer.OrdinalIgnoreCase);
            if (string.IsNullOrWhiteSpace(_config["Paths:ScanDocRoot1"])) return kq;

            // (mã, năm, tháng) cần đọc — gộp kỳ này và kỳ trước, bỏ trùng.
            var can = new HashSet<(string Ma, int Nam, int Thang)>();
            foreach (var dv in dsDonVi)
            {
                var thangTk = ThangToKhai(dv, thang);
                var (namTr, thangTr) = KyTruocCuaDonVi(dv, nam, thangTk);
                can.Add((dv.Ma, nam, thangTk));
                can.Add((dv.Ma, namTr, thangTr));
            }

            var khoa = new object();
            try
            {
                Parallel.ForEach(
                    can,
                    new ParallelOptions { MaxDegreeOfParallelism = 8, CancellationToken = huy },
                    muc =>
                    {
                        var duong = TimXmlToKhaiTrongKho(muc.Ma, muc.Thang, muc.Nam);
                        if (duong == null) return;

                        var ct43 = DocCt43TuFile(duong);
                        if (ct43 == null) return;

                        lock (khoa)
                            kq[Khoa(muc.Ma, muc.Nam, muc.Thang)] = new ToKhaiKy { Ct43 = ct43 };
                    });
            }
            catch (OperationCanceledException) { throw; }
            catch { /* kho hỏng/mất mạng — mất phần bù, lưới vẫn lên bằng số DB */ }

            return kq;
        }

        private string? TimXmlToKhaiTrongKho(string ma, int thang, int nam)
        {
            var goc = _config["Paths:ScanDocRoot1"];
            if (string.IsNullOrWhiteSpace(goc)) return null;
            if (!TenantDbResolver.IsValidCode(ma)) return null;

            var cha = ToKhaiService.DuongDanToKhai(goc, ma, nam);
            if (!Directory.Exists(cha))
            {
                cha = ToKhaiService.DuongDanToKhaiPhang(goc, ma, nam);
                if (!Directory.Exists(cha)) return null;
            }

            var ky = Path.Combine(cha, $"TKG_T{thang}_{nam}");
            var noiTim = Directory.Exists(ky) ? ky : cha;

            var dau = $"M{thang:00}{nam}";
            try
            {
                return Directory
                    .EnumerateFiles(noiTim, "*.xml", SearchOption.AllDirectories)
                    .FirstOrDefault(f =>
                    {
                        var ten = Path.GetFileName(f);
                        return !ten.StartsWith("HD_VAO", StringComparison.OrdinalIgnoreCase)
                            && !ten.StartsWith("HD_RA", StringComparison.OrdinalIgnoreCase)
                            && ten.Contains(dau, StringComparison.OrdinalIgnoreCase);
                    });
            }
            catch { return null; }
        }

        private static decimal? DocCt43TuFile(string duong)
        {
            try
            {
                // Bỏ qua namespace: tờ khai HTKK khai xmlns mặc định.
                var e = XDocument.Load(duong).Descendants()
                                 .FirstOrDefault(x => x.Name.LocalName == "ct43");
                return e != null && decimal.TryParse(
                        e.Value.Trim(), NumberStyles.Any, CultureInfo.InvariantCulture,
                        out var v) ? v : null;
            }
            catch { return null; }
        }

        private sealed class DemHoaDon
        {
            public int V1, R1, V2, R2, V3, R3;
        }

        private async Task<Dictionary<string, DemHoaDon>> DemHoaDonMoiDonVi(
            IReadOnlyList<DonViKy> dsDonVi, int nam, int thang, CancellationToken huy)
        {
            var kq = new Dictionary<string, DemHoaDon>(StringComparer.OrdinalIgnoreCase);

            var duocDung = await LocDonViCoBang(dsDonVi, nam, huy);
            if (duocDung.Count == 0) return kq;
            var nhanh = new List<string>(duocDung.Count);
            var thamSo = new List<(string Ten, object Gia)>();
            for (int i = 0; i < duocDung.Count; i++)
            {
                var dv = duocDung[i];
                var db = _resolver.BuildDbName(dv.Ma, nam);
                var t1 = ThangDau(dv, thang);
                nhanh.Add($@"
                    SELECT @ma{i} AS ma_donvi, h.thang, h.huong, COUNT(*) AS sl
                      FROM [{db}].dbo.HOA_DON h
                     WHERE h.thang BETWEEN @t{i} AND @t{i} + @buoc{i}
                     GROUP BY h.thang, h.huong");
                thamSo.Add(($"@ma{i}", dv.Ma));
                thamSo.Add(($"@t{i}", t1));
                thamSo.Add(($"@buoc{i}", dv.KhaiQuy ? 2 : 0));
            }

            using var conn = new SqlConnection(_resolver.GetMasterConnection());
            await conn.OpenAsync(huy);
            using var cmd = new SqlCommand(string.Join("\n UNION ALL\n", nhanh), conn);
            foreach (var (ten, gia) in thamSo) cmd.Parameters.AddWithValue(ten, gia);

            var mocTheoMa = duocDung.ToDictionary(
                d => d.Ma, d => ThangDau(d, thang), StringComparer.OrdinalIgnoreCase);

            using var r = await cmd.ExecuteReaderAsync(huy);
            while (await r.ReadAsync(huy))
            {
                var ma = r.GetString(0);
                if (r.IsDBNull(1)) continue;          // hóa đơn chưa gán kỳ kê khai
                var t = r.GetInt32(1);
                var laVao = string.Equals(r.IsDBNull(2) ? "" : r.GetString(2),
                                          "VAO", StringComparison.OrdinalIgnoreCase);
                var n = r.GetInt32(3);

                if (!kq.TryGetValue(ma, out var d)) kq[ma] = d = new DemHoaDon();
                var moc = mocTheoMa[ma];
                if (t == moc) { if (laVao) d.V1 = n; else d.R1 = n; }
                else if (t == moc + 1) { if (laVao) d.V2 = n; else d.R2 = n; }
                else if (t == moc + 2) { if (laVao) d.V3 = n; else d.R3 = n; }
            }
            return kq;
        }

        /// <param name="bang">
        /// Bảng dùng để dò xem database của đơn vị đã dựng chưa. Mặc định HOA_DON; chỗ
        /// đọc bảng kê gốc truyền IN_VALUE_LINE vì database đời đầu chưa có bảng đó
        /// (script 021 mới bù), mà tên bảng thiếu thì cả câu UNION hỏng chứ không chỉ
        /// nhánh của riêng đơn vị ấy.
        /// </param>
        private async Task<List<DonViKy>> LocDonViCoBang(
            IReadOnlyList<DonViKy> dsDonVi, int nam, CancellationToken huy,
            string bang = "HOA_DON")
        {
            var hopLe = new List<DonViKy>(dsDonVi.Count);
            var ve = new List<string>();
            var thamSo = new List<(string, object)>();

            for (int i = 0; i < dsDonVi.Count; i++)
            {
                string db;
                try { db = _resolver.BuildDbName(dsDonVi[i].Ma, nam); }
                catch (ArgumentException) { continue; }

                hopLe.Add(dsDonVi[i]);
                ve.Add($"SELECT @m{i} AS ma, OBJECT_ID(@o{i}) AS id");
                thamSo.Add(($"@m{i}", dsDonVi[i].Ma));
                thamSo.Add(($"@o{i}", $"[{db}].dbo.{bang}"));
            }
            if (ve.Count == 0) return new List<DonViKy>();

            var co = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            using var conn = new SqlConnection(_resolver.GetMasterConnection());
            await conn.OpenAsync(huy);
            using var cmd = new SqlCommand(string.Join(" UNION ALL ", ve), conn);
            foreach (var (ten, gia) in thamSo) cmd.Parameters.AddWithValue(ten, gia);

            using var r = await cmd.ExecuteReaderAsync(huy);
            while (await r.ReadAsync(huy))
                if (!r.IsDBNull(1)) co.Add(r.GetString(0));

            return hopLe.Where(d => co.Contains(d.Ma)).ToList();
        }
    }

    public class GhiChuHdLienQuan
    {
        private readonly TenantDbResolver _resolver;
        private readonly IConfiguration _config;

        public GhiChuHdLienQuan(TenantDbResolver resolver, IConfiguration config)
        {
            _resolver = resolver;
            _config = config;
        }

        /// <summary>Một hóa đơn liên quan KHÁC KỲ đã đánh dấu.</summary>
        public sealed class DongLienQuan
        {
            public string MaDonVi { get; set; } = "";
            public string Huong { get; set; } = "";
            public string Khhd { get; set; } = "";
            public string SoHd { get; set; } = "";
            public DateTime? Ngay { get; set; }
            public string TenKh { get; set; } = "";
            public string LoaiXuLy { get; set; } = "";     // Thay thế / Điều chỉnh / Gốc mồ côi
            public string TrangThai { get; set; } = "";
            public string KhhdGoc { get; set; } = "";
            public string SoHdGoc { get; set; } = "";
            public DateTime? NgayGoc { get; set; }
            public int ThangGoc { get; set; }
            public int NamGoc { get; set; }
            public decimal TienHang { get; set; }
            public decimal TienVat { get; set; }
            public string GhiChuMoi { get; set; } = "";
            public bool DaCoGhiChu { get; set; }
            public bool CungKy { get; set; }
            public string MucKhacKy { get; set; } = "";
        }

        public sealed class KetQua
        {
            public int SoDonVi { get; set; }
            public int SoHoaDon { get; set; }
            public int SoDaGhi { get; set; }
            public int SoBoQua { get; set; }
            public string? DuongDanFile { get; set; }
            public List<DongLienQuan> Dong { get; set; } = new();
            public List<string> Loi { get; set; } = new();
        }

        private static string TenLoai(string? tc) => tc switch
        {
            "1" => "Thay thế",
            "2" => "Điều chỉnh",
            _ => $"Liên quan (mã {tc})",
        };

        private const string DauHieu = "[TK-LQ]";

        private const int MaxGhiChu = 500;

        private static string MucLechKy(int thangGoc, int namGoc, int thangKy, int namKy)
        {
            if (namGoc != namKy) return "năm";
            return (thangGoc + 2) / 3 != (thangKy + 2) / 3 ? "quý" : "tháng";
        }

        /// <summary>
        /// Tìm hóa đơn có quan hệ thay thế / điều chỉnh cần kế toán để mắt, gồm ba nhóm:
        ///   1. Thay thế/điều chỉnh cho hóa đơn thuộc kỳ KHÁC — engine loại khỏi tờ khai
        ///      vì gốc đã kê ở kỳ đó (BR-TK-06b). Bắt buộc phải có sohd_lienquan: cổng
        ///      gán mã liên quan cho cả hóa đơn không trỏ tới đâu, thiếu điều kiện này
        ///      là đánh dấu oan.
        ///   2. Hóa đơn gốc MỒ CÔI — liên kết chỉ một chiều (bản thay thế trỏ về gốc,
        ///      gốc không trỏ ngược lại), nên bản thay thế ở kỳ khác hoặc chưa nạp thì
        ///      không dò ra được. Engine vẫn tính đúng nhờ BR-TK-06c nhưng sổ im lặng.
        ///   3. Liên quan CÙNG KỲ — engine xử đúng số (BR-TK-06 loại gốc khi thay thế,
        ///      BR-TK-19 giữ cả hai khi điều chỉnh) nhưng sổ không nói gì; spec §10.4
        ///      hẹn bù bằng ghi chú. Lấy cả hai phía vì mỗi phía đọc lên một câu khác.
        /// Thiếu ngay_lienquan thì không biết gốc ở kỳ nào — vẫn nêu ra cho kế toán tự
        /// tra thay vì đoán bừa.
        /// </summary>
        private const string SqlTim = @"
            SELECT h.ma_hd, h.huong, ISNULL(h.khhd,''), ISNULL(h.so_hd,''), h.ngay,
                   ISNULL(h.ten_kh,''), ISNULL(h.tich_chat_hd_lienquan,''),
                   ISNULL(h.khhd_lienquan,''), ISNULL(h.sohd_lienquan,''),
                   h.ngay_lienquan,
                   CAST(ISNULL(l.tien_hang,0) AS DECIMAL(18,2)),
                   CAST(ISNULL(h.tien_vat,0)  AS DECIMAL(18,2)),
                   ISNULL(h.ghi_chu,''),
                   ISNULL(h.tthai_hd,''),
                   bt.so_hd, bt.tich_chat_hd_lienquan, bt.tien_vat,
                   bt.chi_sua_thong_tin
              FROM HOA_DON h
              OUTER APPLY (
                    SELECT TOP 1 t.so_hd, ISNULL(t.tich_chat_hd_lienquan,'') AS tich_chat_hd_lienquan,
                           CAST(ISNULL(t.tien_vat,0) AS DECIMAL(18,2)) AS tien_vat,
                           CAST(CASE WHEN EXISTS (SELECT 1 FROM HOA_DON_LINE y
                                                   WHERE y.ma_hd = t.ma_hd
                                                     AND ISNULL(y.tinh_chat,'1') = '4')
                                     THEN 1 ELSE 0 END AS BIT) AS chi_sua_thong_tin
                      FROM HOA_DON t
                     WHERE t.thang = h.thang
                       AND ISNULL(t.sohd_lienquan,'') = h.so_hd
                       AND ISNULL(t.tich_chat_hd_lienquan,'') <> ''
                     ORDER BY t.so_hd
              ) bt
              OUTER APPLY (
                    SELECT SUM(CASE WHEN ISNULL(x.tinh_chat,'1') = '3' THEN 0
                                    ELSE ISNULL(x.so_luong,0) * ISNULL(x.don_gia,0)
                               END) AS tien_hang
                      FROM HOA_DON_LINE x WHERE x.ma_hd = h.ma_hd
              ) l
             WHERE h.thang = @thang
               AND (
                 (    ISNULL(h.tich_chat_hd_lienquan,'') <> ''
                  AND ISNULL(h.sohd_lienquan,'') <> ''
                  AND (
                        (h.ngay_lienquan IS NOT NULL
                         AND (MONTH(h.ngay_lienquan) <> @thang
                              OR YEAR(h.ngay_lienquan) <> @nam))
                        OR h.ngay_lienquan IS NULL
                      ))

                 OR (    ISNULL(h.tthai_hd,'') LIKE N'%đã bị%'
                     AND NOT EXISTS (
                           SELECT 1 FROM HOA_DON tt
                            WHERE tt.thang = h.thang
                              AND ISNULL(tt.sohd_lienquan,'') = h.so_hd))

                 OR(ISNULL(h.tich_chat_hd_lienquan,'') <> ''
                     AND ISNULL(h.sohd_lienquan,'') <> ''
                     AND h.ngay_lienquan IS NOT NULL
                     AND MONTH(h.ngay_lienquan) = @thang
                     AND YEAR(h.ngay_lienquan)  = @nam)

                 OR(ISNULL(h.tthai_hd,'') LIKE N'%đã bị%'
                     AND EXISTS(
                           SELECT 1 FROM HOA_DON tt
                            WHERE tt.thang = h.thang
                              AND ISNULL(tt.sohd_lienquan,'') = h.so_hd))
               )
             ORDER BY h.huong, h.so_hd";

        /// <param name="chiXem">true = chỉ liệt kê, KHÔNG ghi (xem trước).</param>
        public async Task<KetQua> QuetVaGhi(
            string maDonVi, int nam, int thang, string nguoiGhi,
            bool chiXem, CancellationToken huy = default)
        {
            var kq = new KetQua();
            var ds = new List<DongLienQuan>();
            var maHd = new List<(string Ma, string GhiChu, string Moi)>();

            using var conn = new SqlConnection(_resolver.GetTenantConnection(maDonVi, nam));
            await conn.OpenAsync(huy);

            using (var cmd = new SqlCommand(SqlTim, conn))
            {
                cmd.Parameters.AddWithValue("@thang", thang);
                cmd.Parameters.AddWithValue("@nam", nam);
                using var r = await cmd.ExecuteReaderAsync(huy);
                while (await r.ReadAsync(huy))
                {
                    var ngayGoc = r.IsDBNull(9) ? (DateTime?)null : r.GetDateTime(9);
                    var loai = TenLoai(r.GetString(6));
                    var ghiChuCu = r.GetString(12);
                    var tthai = r.GetString(13);

                    var banSoHd = r.IsDBNull(14) ? "" : r.GetString(14);
                    var banLoai = r.IsDBNull(15) ? "" : r.GetString(15);
                    var banVat = r.IsDBNull(16) ? 0m : r.GetDecimal(16);
                    var banChiSuaTt = !r.IsDBNull(17) && r.GetBoolean(17);

                    var d = new DongLienQuan
                    {
                        MaDonVi = maDonVi,
                        Huong = r.IsDBNull(1) ? "" : r.GetString(1),
                        Khhd = r.GetString(2),
                        SoHd = r.GetString(3),
                        Ngay = r.IsDBNull(4) ? null : r.GetDateTime(4),
                        TenKh = r.GetString(5),
                        LoaiXuLy = loai,
                        TrangThai = tthai,
                        KhhdGoc = r.GetString(7),
                        SoHdGoc = r.GetString(8),
                        NgayGoc = ngayGoc,
                        ThangGoc = ngayGoc?.Month ?? 0,
                        NamGoc = ngayGoc?.Year ?? 0,
                        TienHang = r.GetDecimal(10),
                        TienVat = r.GetDecimal(11),
                        DaCoGhiChu = ghiChuCu.Contains(DauHieu, StringComparison.Ordinal),
                    };

                    var laGocCungKy = !string.IsNullOrWhiteSpace(banSoHd);
                    d.CungKy = ngayGoc != null && ngayGoc.Value.Month == thang
                                               && ngayGoc.Value.Year == nam;

                    if (laGocCungKy)
                    {
                        d.CungKy = true;
                        var laThayThe = banLoai == "1";
                        d.LoaiXuLy = laThayThe ? "Gốc đã bị thay thế" : "Gốc đã bị điều chỉnh";

                        if (laThayThe)
                            d.GhiChuMoi =
                                $"{DauHieu} ĐÃ THAY THẾ bởi HĐ {d.Khhd}/{banSoHd} cùng kỳ "
                              + $"{thang:00}/{nam} — hóa đơn này KHÔNG tính vào tờ khai kỳ "
                              + "này, căn cứ kê khai là hóa đơn thay thế";
                        else if (banChiSuaTt)
                            d.GhiChuMoi =
                                $"{DauHieu} ĐÃ ĐIỀU CHỈNH THÔNG TIN bởi HĐ {d.Khhd}/{banSoHd} "
                              + $"cùng kỳ {thang:00}/{nam} (chỉ sửa nội dung, không đổi tiền) "
                              + "— hóa đơn này VẪN tính đủ vào tờ khai";
                        else
                            d.GhiChuMoi =
                                $"{DauHieu} ĐÃ ĐIỀU CHỈNH bởi HĐ {d.Khhd}/{banSoHd} cùng kỳ "
                              + $"{thang:00}/{nam} (VAT điều chỉnh {banVat:N0}) — hóa đơn này "
                              + "VẪN tính vào tờ khai, tổng = gốc + phần điều chỉnh";
                    }
                    else if (string.IsNullOrWhiteSpace(d.SoHdGoc))
                    {
                        d.LoaiXuLy = "Gốc mồ côi";
                        d.MucKhacKy = "chưa rõ";
                        d.GhiChuMoi =
                            $"{DauHieu} Hóa đơn này ĐÃ BỊ thay thế/điều chỉnh "
                          + $"(trạng thái cổng: {tthai}) nhưng KHÔNG tìm thấy hóa đơn "
                          + $"thay thế trong kỳ {thang:00}/{nam} — CÓ SỰ THAY ĐỔI THÁNG "
                          + "KÊ KHAI, bản thay thế ở kỳ khác hoặc chưa nạp về sổ. "
                          + "Chưa kê khai lại";
                    }
                    else if (d.CungKy)
                    {
                        d.GhiChuMoi =
                            $"{DauHieu} {loai.ToUpperInvariant()} cho HĐ {d.KhhdGoc}/{d.SoHdGoc} "
                          + $"ngày {ngayGoc:dd/MM/yyyy} — cùng kỳ {thang:00}/{nam}, "
                          + "đã xử lý trọn trong kỳ";
                    }
                    else if (ngayGoc == null)
                    {
                        d.MucKhacKy = "chưa rõ";
                        d.GhiChuMoi =
                            $"{DauHieu} {loai} cho HĐ {d.KhhdGoc}/{d.SoHdGoc} "
                          + "— CHƯA RÕ KỲ GỐC (sổ không có ngày hóa đơn gốc), "
                          + $"xử lý tại kỳ {thang:00}/{nam} — Chưa kê khai lại";
                    }
                    else
                    {
                        d.MucKhacKy = MucLechKy(d.ThangGoc, d.NamGoc, thang, nam);
                        d.GhiChuMoi =
                            $"{DauHieu} {loai.ToUpperInvariant()} cho HĐ {d.KhhdGoc}/{d.SoHdGoc} "
                          + $"ngày {ngayGoc:dd/MM/yyyy} — CÓ SỰ THAY ĐỔI THÁNG KÊ KHAI "
                          + $"(khác {d.MucKhacKy}: gốc thuộc kỳ {d.ThangGoc:00}/{d.NamGoc}, "
                          + $"số liệu chuyển về kỳ {thang:00}/{nam}) — Chưa kê khai lại";
                    }

                    ds.Add(d);
                    if (!d.DaCoGhiChu)
                        maHd.Add((r.GetString(0), ghiChuCu, d.GhiChuMoi));
                }
            }

            kq.Dong = ds;
            kq.SoHoaDon = ds.Count;
            kq.SoBoQua = ds.Count(x => x.DaCoGhiChu);

            if (chiXem || maHd.Count == 0) return kq;

            using var tran = conn.BeginTransaction();
            try
            {
                foreach (var (ma, cu, moi) in maHd)
                {
                    huy.ThrowIfCancellationRequested();
                    var gop = string.IsNullOrWhiteSpace(cu) ? moi : $"{cu} | {moi}";
                    if (gop.Length > MaxGhiChu)
                    {
                        kq.Loi.Add($"{ma}: ghi chú cũ quá dài ({cu.Length} ký tự), "
                                 + $"nối thêm sẽ vượt {MaxGhiChu} — BỎ QUA để không mất nội dung cũ");
                        continue;
                    }

                    using var up = new SqlCommand(
                        @"UPDATE HOA_DON
                             SET ghi_chu = @gc, updated_by = @nguoi, updated_at = SYSDATETIME()
                           WHERE ma_hd = @ma", conn, tran);
                    up.Parameters.AddWithValue("@gc", gop);
                    up.Parameters.AddWithValue("@nguoi", nguoiGhi);
                    up.Parameters.AddWithValue("@ma", ma);
                    kq.SoDaGhi += await up.ExecuteNonQueryAsync(huy);
                }
                tran.Commit();
            }
            catch
            {
                tran.Rollback();
                throw;
            }

            return kq;
        }

        public async Task<KetQua> QuetNhieuDonVi(
            IEnumerable<string> maDonVis, int nam, int thang, string nguoiGhi,
            bool chiXem, CancellationToken huy = default)
        {
            var gop = new KetQua();
            foreach (var ma in maDonVis)
            {
                huy.ThrowIfCancellationRequested();
                try
                {
                    var r = await QuetVaGhi(ma, nam, thang, nguoiGhi, chiXem, huy);
                    gop.SoDonVi++;
                    gop.SoHoaDon += r.SoHoaDon;
                    gop.SoDaGhi += r.SoDaGhi;
                    gop.SoBoQua += r.SoBoQua;
                    gop.Dong.AddRange(r.Dong);
                    gop.Loi.AddRange(r.Loi);
                }
                catch (Exception ex)
                {
                    gop.Loi.Add($"{ma}: {ex.Message}");
                }
            }

            gop.DuongDanFile = await XuatFile(gop, nam, thang, nguoiGhi, huy);
            return gop;
        }

        private async Task<string?> XuatFile(
            KetQua kq, int nam, int thang, string nguoiGhi, CancellationToken huy)
        {
            var goc = _config["Paths:JobsRoot"];
            if (string.IsNullOrWhiteSpace(goc))
            {
                kq.Loi.Add("Chưa khai Paths:JobsRoot — không xuất được file tổng hợp");
                return null;
            }

            var thuMuc = Path.Combine(goc, "TO_KHAI_LIEN_QUAN");
            Directory.CreateDirectory(thuMuc);
            var duong = Path.Combine(thuMuc, $"HD_LIEN_QUAN_KHAC_KY_T{thang}_{nam}.txt");

            var sb = new StringBuilder();
            sb.AppendLine("TỔNG HỢP HÓA ĐƠN THAY THẾ / ĐIỀU CHỈNH KHÁC KỲ");
            sb.AppendLine($"Kỳ kê khai : tháng {thang:00}/{nam}");
            sb.AppendLine($"Người chạy : {nguoiGhi}");
            sb.AppendLine($"Lập lúc    : {DateTime.Now:dd/MM/yyyy HH:mm:ss}");
            sb.AppendLine(new string('=', 100));
            sb.AppendLine();
            sb.AppendLine("File này gom HAI loại hóa đơn cần theo dõi, đều là loại KHÔNG tự xử lý trọn");
            sb.AppendLine("trong kỳ này nên phải có người nhìn tới:");
            sb.AppendLine();
            sb.AppendLine("  [1] THAY THẾ / ĐIỀU CHỈNH — GỐC THUỘC KỲ KHÁC");
            sb.AppendLine("      Engine KHÔNG kê chúng vào tờ khai kỳ này (BR-TK-06b) — đúng như bản tờ");
            sb.AppendLine("      khai cổng TCT trả về. Nhưng kỳ GỐC chưa được khai bổ sung tự động; kế");
            sb.AppendLine("      toán phải tự kiểm và kê khai lại kỳ đó (spec §10.4 trường hợp 2).");
            sb.AppendLine();
            sb.AppendLine("  [2] GỐC MỒ CÔI — bị thay thế/điều chỉnh mà KHÔNG tìm thấy bản thay thế");
            sb.AppendLine("      Liên kết trong sổ chỉ có MỘT CHIỀU: hóa đơn thay thế trỏ về gốc, còn");
            sb.AppendLine("      hóa đơn gốc không có cột nào trỏ ngược lại — nó chỉ biết mình 'đã bị");
            sb.AppendLine("      thay thế' qua trạng thái của cổng. Bản thay thế nằm ở kỳ khác hoặc chưa");
            sb.AppendLine("      nạp về sổ. Số tờ khai vẫn ĐÚNG (BR-TK-06c đã loại), nhưng cần tra lại");
            sb.AppendLine("      xem bản thay thế ở đâu và đã kê khai chưa.");
            sb.AppendLine();
            var soMoCoi = kq.Dong.Count(d => string.IsNullOrWhiteSpace(d.SoHdGoc));
            sb.AppendLine($"Tổng: {kq.SoDonVi} đơn vị · {kq.SoHoaDon} hóa đơn "
                        + $"(khác kỳ {kq.SoHoaDon - soMoCoi} · gốc mồ côi {soMoCoi}) "
                        + $"· đã ghi chú {kq.SoDaGhi} · bỏ qua {kq.SoBoQua} (đã đánh dấu từ trước)");
            sb.AppendLine();

            foreach (var nhom in kq.Dong.GroupBy(d => d.MaDonVi).OrderBy(g => g.Key))
            {
                sb.AppendLine(new string('-', 100));
                sb.AppendLine($"ĐƠN VỊ: {nhom.Key}   ({nhom.Count()} hóa đơn)");
                sb.AppendLine(new string('-', 100));

                foreach (var d in nhom.OrderBy(x => x.Huong).ThenBy(x => x.SoHd))
                {
                    var moCoi = string.IsNullOrWhiteSpace(d.SoHdGoc);
                    sb.AppendLine(
                        $"  {(moCoi ? "[2]" : "[1]")} "
                      + $"{(d.Huong == "RA" ? "BÁN RA" : "MUA VÀO"),-8} "
                      + $"{d.Khhd}/{d.SoHd}  ngày {d.Ngay:dd/MM/yyyy}");
                    sb.AppendLine($"      Đối tác   : {d.TenKh}");
                    sb.AppendLine($"      Loại      : {d.LoaiXuLy}");
                    sb.AppendLine($"      Cổng ghi  : {d.TrangThai}");

                    if (moCoi)
                    {
                        sb.AppendLine("      HĐ gốc    : KHÔNG tìm thấy bản thay thế trong kỳ này");
                        sb.AppendLine($"      Tiền hàng : {d.TienHang,20:N0}");
                        sb.AppendLine($"      Tiền VAT  : {d.TienVat,20:N0}");
                        sb.AppendLine("      CẦN LÀM   : tra xem bản thay thế/điều chỉnh nằm ở kỳ nào, "
                                     + "đã nạp về sổ chưa");
                    }
                    else
                    {
                        sb.AppendLine($"      HĐ gốc    : {d.KhhdGoc}/{d.SoHdGoc}"
                            + (d.NgayGoc == null
                                ? "  ⇒ CHƯA RÕ KỲ GỐC (sổ không có ngày hóa đơn gốc)"
                                : $" ngày {d.NgayGoc:dd/MM/yyyy}  ⇒ KỲ GỐC {d.ThangGoc:00}/{d.NamGoc}"));
                        sb.AppendLine($"      Tiền hàng : {d.TienHang,20:N0}");
                        sb.AppendLine($"      Tiền VAT  : {d.TienVat,20:N0}");
                        sb.AppendLine("      CẦN LÀM   : kê khai lại kỳ gốc khi đã đủ dữ liệu");
                    }

                    sb.AppendLine($"      Đánh dấu  : {(d.DaCoGhiChu ? "đã đánh dấu từ lượt trước" : "vừa đánh dấu")}");
                    sb.AppendLine();
                }

                sb.AppendLine($"      Cộng đơn vị: tiền hàng {nhom.Sum(x => x.TienHang),20:N0}"
                            + $"   VAT {nhom.Sum(x => x.TienVat),18:N0}");
                sb.AppendLine();
            }

            if (kq.Dong.Count == 0)
                sb.AppendLine("(Không có hóa đơn thay thế/điều chỉnh khác kỳ nào trong kỳ này)");

            if (kq.Loi.Count > 0)
            {
                sb.AppendLine();
                sb.AppendLine(new string('=', 100));
                sb.AppendLine("LỖI / BỎ QUA:");
                foreach (var l in kq.Loi) sb.AppendLine($"  - {l}");
            }

            await File.WriteAllTextAsync(duong, sb.ToString(),
                                         new UTF8Encoding(true), huy);
            return duong;
        }
    }


    /// <summary>
    /// Đổi <see cref="SoChuaMoException"/> thành 409 kèm lời nhắn đọc được.
    /// </summary>

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
