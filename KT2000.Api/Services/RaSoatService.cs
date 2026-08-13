using Microsoft.Data.SqlClient;
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
        public RaSoatService(TenantDbResolver resolver) => _resolver = resolver;

        // Danh tính hóa đơn theo BR-HD-01: hướng + MST đối tác + ký hiệu + số HĐ.
        // KHÔNG dùng ma_hd vì file XML không có sẵn, phải tự ghép — mà ghép sai một
        // dấu gạch là ra hai danh tính khác nhau cho cùng một hóa đơn.
        private static string Khoa(string huong, string mst, string khhd, string soHd)
            => $"{huong}|{mst?.Trim()}|{khhd?.Trim()}|{ImportService.ChuanSoHd(soHd ?? "")}";

        // MST chỉ so phần SỐ: cổng TCT khai chi nhánh dạng "0100686174-634" còn hồ sơ
        // đơn vị thường chỉ ghi "0100686174". So nguyên chuỗi thì mọi hóa đơn chi
        // nhánh đều lệch hướng.
        private static string GocMst(string? mst)
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
            string code, int year, int? thang, IReadOnlyList<HoaDonFileDto> tuFile)
        {
            var kq = new KetQuaRaSoatDto { Nam = year, Thang = thang };

            // ---------- 1. Đọc sổ ----------
            var trongSo = new Dictionary<string, HoaDonSoDto>(StringComparer.OrdinalIgnoreCase);
            using (var conn = new SqlConnection(_resolver.GetTenantConnection(code, year)))
            {
                await conn.OpenAsync();
                var sql = @"
                    SELECT h.ma_hd, h.huong, h.mst, h.khhd, h.so_hd, h.ngay, h.thang,
                           h.ten_kh,
                           ISNULL(l.tien_hang, 0) AS tien_hang,
                           ISNULL(h.tien_vat, 0)  AS tien_vat
                      FROM HOA_DON h
                      OUTER APPLY (
                            SELECT SUM(ISNULL(x.so_luong,0) * ISNULL(x.don_gia,0)) AS tien_hang
                              FROM HOA_DON_LINE x WHERE x.ma_hd = h.ma_hd
                      ) l"
                    + (thang is > 0 ? " WHERE h.thang = @thang" : "");

                using var cmd = new SqlCommand(sql, conn);
                if (thang is > 0) cmd.Parameters.AddWithValue("@thang", thang);

                using var r = await cmd.ExecuteReaderAsync();
                while (await r.ReadAsync())
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
            var trongFile = new Dictionary<string, HoaDonFileDto>(StringComparer.OrdinalIgnoreCase);
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

        /// <summary>
        /// Quét một THƯ MỤC TRÊN MÁY CHỦ, đọc mọi file .xml (kể cả thư mục con) và
        /// dựng danh sách hóa đơn để đối chiếu. Dùng cho kho XML đã tải sẵn về server.
        /// </summary>
        /// <remarks>
        /// CHẶN ĐƯỜNG DẪN LẠ: chỉ cho quét trong các gốc đã khai ở appsettings
        /// (Paths:ScanDocRoot, Paths:RawRoot). Không có rào này thì ai gửi được
        /// request là đọc được C:\Windows\... — đường dẫn đến thẳng từ client.
        /// </remarks>
        public static List<HoaDonFileDto> QuetThuMuc(string thuMuc, IEnumerable<string> gocChoPhep)
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

            var ds = new List<HoaDonFileDto>();
            foreach (var f in Directory.EnumerateFiles(duong, "*.xml", SearchOption.AllDirectories))
            {
                var hd = DocXml(f);
                if (hd != null) ds.Add(hd);      // file hỏng thì bỏ qua, không chặn cả mẻ
            }
            return ds;
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
}
