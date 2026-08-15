using ClosedXML.Excel;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;
using System.Globalization;
using System.Text;
using System.Xml.Linq;
using KT2000.Api.Models;

// ToKhai.cs — TOÀN BỘ khối nghiệp vụ TỜ KHAI THUẾ GTGT, năm lớp trong một file:
//
//   RaSoatService     — đối chiếu hóa đơn FILE vs SỔ của MỘT đơn vị (trước khi khai)
//   ToKhaiService     — LẬP tờ khai 01/GTGT của MỘT đơn vị, tính ct21…ct43
//   BangToKhaiService — BẢNG tờ khai của MỌI đơn vị, một dòng một đơn vị (màn MDN_NB)
//   GhiChuHdLienQuan  — đánh dấu HĐ thay thế/điều chỉnh KHÁC KỲ ⚠ CÓ GHI
//   SoChuaMoFilter    — đổi SoChuaMoException thành 409 cho cả khối
//
// Vì sao gộp một file: các lớp này cùng một mạch nghiệp vụ (soát → lập → theo dõi
// chéo) và dùng chung một loạt quy ước — đọc theo cột thang (tháng kê khai) chứ
// không theo ngày hóa đơn, loại dòng chiết khấu tinh_chat='3'. Tách ra thì mấy quy
// ước đó bị chép lại ở nhiều chỗ và trôi dần khỏi nhau.
//
// LUẬT CHUNG CỦA CẢ FILE: KHÔNG GHI. Cả khối này chạy ngay trước kỳ nộp tờ khai —
// một câu UPDATE nhầm là hỏng số của cả tờ khai (hoặc cả loạt đơn vị với
// BangToKhaiService). Muốn nạp sổ thì dùng ImportService.
//
// ⚠ NGOẠI LỆ DUY NHẤT — GhiChuHdLienQuan:
// Lớp này CÓ GHI, nhưng CHỈ ghi đúng MỘT cột `HOA_DON.ghi_chu`, và chỉ NỐI THÊM chứ
// không đè (luật 5 của repo). Không đụng bất kỳ cột TIỀN hay ĐỊNH KHOẢN nào, nên số
// của tờ khai không thể bị nó làm sai.
//
// Nếu sau này thêm lớp CÓ GHI thứ hai vào đây thì DỪNG LẠI và tách file: một file
// mà nửa chỉ-đọc nửa có-ghi thì rào chắn ở đầu file mất tác dụng, và sớm muộn có
// người chép nhầm một câu UPDATE sang nhánh chỉ-đọc.

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

        /// <summary>
        /// Đọc NHANH bốn thứ định danh trong một file XML tờ khai: MST, tháng, năm và
        /// chỉ tiêu 43. Dùng khi nạp file cổng trả về sau khi nộp.
        /// </summary>
        /// <remarks>
        /// Khớp file với tờ khai trong hệ thống bằng MST + KỲ ghi TRONG file, KHÔNG
        /// dựa vào tên file: cổng đặt tên mỗi đợt một kiểu, mà thả nhầm chỗ thì gắn
        /// số của đơn vị này sang đơn vị khác.
        ///
        /// kyKKhai của HTKK là "MM/yyyy" (đo thật trên file Thái Tuấn: "06/2026").
        /// Đọc hỏng thì trả null hết — tầng gọi báo rõ file nào không đọc được thay
        /// vì đoán bừa.
        /// </remarks>
        /// <summary>
        /// Bộ 26 chỉ tiêu đọc từ một file XML tờ khai. Thứ tự thẻ trong XML → tên cột.
        /// XML gọi ct39a, bảng TOKHAI đặt ct39_xml — ánh xạ ngay ở đây để chỗ khác
        /// khỏi phải nhớ khác biệt đó.
        /// </summary>
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

        /// <summary>
        /// Đọc ĐỦ 26 chỉ tiêu của một file XML tờ khai (bản TCT trả về).
        /// </summary>
        /// <remarks>
        /// Lấy lần gặp ĐẦU TIÊN của mỗi thẻ: bản BỔ SUNG có thêm khối KHBSung lặp lại
        /// nhiều thẻ cùng tên, quét cả cây rồi lấy thẻ cuối là dính số của khối phụ.
        /// Khối tờ khai chính luôn đứng trước trong file HTKK.
        /// </remarks>
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


        // BR-TK-06 — LOẠI HÓA ĐƠN GỐC ĐÃ BỊ THAY THẾ TRONG CÙNG KỲ.
        //
        // Đo thật NHAT_TUAN T7 (15/08): 3 hóa đơn gốc bị thay thế VẪN nằm trong sổ với
        // VAT dương, trong khi hóa đơn thay thế cũng có VAT dương ⇒ 2.080.658 đ bị
        // tính HAI LẦN trên tổng VAT bán ra 242.331.533 đ.
        //
        // Thay thế = lấy hóa đơn MỚI làm căn cứ thay cho hóa đơn cũ, nên hóa đơn gốc
        // phải ra khỏi tổng của kỳ.
        //
        // ENGINE TỰ SUY, KHÔNG GHI VÀO SỔ (chốt 15/08 — xem SPEC §10.4): sổ giữ nguyên
        // 100% số liệu gốc. Đúng luật hiện hành nữa — từ NĐ 70/2025 hóa đơn bị thay thế
        // KHÔNG bị hủy, vẫn tồn tại, chỉ vô hiệu về giá trị kê khai.
        //
        // Nhận diện bằng LIÊN KẾT chứ không bằng chữ trong tthai_hd: tthai_hd là văn
        // bản tự do của cổng TCT ('Hóa đơn đã bị thay thế'), đổi cách viết một cái là
        // phép lọc câm lặng bỏ sót. Liên kết (khhd_lienquan + sohd_lienquan) là dữ liệu
        // có cấu trúc, chắc chắn hơn hẳn.
        //
        // CHỈ loại khi hóa đơn thay thế Ở CÙNG KỲ: khác kỳ thì hóa đơn gốc thuộc tờ
        // khai kỳ khác, không phải việc của kỳ này (xem SPEC §10.4 trường hợp 2).
        private const string LocHdBiThayThe = @"
               AND NOT EXISTS (
                     SELECT 1 FROM HOA_DON tt
                      WHERE tt.thang = h.thang
                        -- CHỈ nhận THAY THẾ ('1'), KHÔNG nhận ĐIỀU CHỈNH ('2').
                        -- Thay thế: hóa đơn gốc HẾT HIỆU LỰC, phải loại khỏi kỳ.
                        -- Điều chỉnh: hóa đơn gốc VẪN CÒN HIỆU LỰC, chỉ cộng thêm
                        -- phần chênh — loại gốc là mất luôn doanh thu của nó
                        -- (spec §10.3 đã phân biệt hai thứ này).
                        --
                        -- ĐO THẬT 15/08 — HUY_THANH T7: HĐ 1374 điều chỉnh (tc='2')
                        -- trỏ về HĐ gốc 1334. Bản cũ không phân biệt nên loại luôn
                        -- 1334 ⇒ mất 368.406.608 đ doanh thu, trong khi bảng kê cổng
                        -- VẪN TÍNH nó (368.406.585 / VAT 36.840.659).
                        AND ISNULL(tt.tich_chat_hd_lienquan, '') = '1'
                        -- KÝ HIỆU hai bên ghi KHÁC NHAU (đo thật 15/08):
                        --   h.khhd           = '1C26TNT'  (mẫu số + ký hiệu)
                        --   tt.khhd_lienquan =  'C26TNT'  (cổng chỉ ghi ký hiệu)
                        -- So bằng cách bỏ CHỮ SỐ ĐẦU của h.khhd. Không dùng REPLACE
                        -- vì nó xóa MỌI chữ số đó ở mọi vị trí — '1C26T1NT' hỏng ngay.
                        AND tt.khhd_lienquan = CASE
                              WHEN h.khhd LIKE '[0-9]%' THEN SUBSTRING(h.khhd, 2, LEN(h.khhd))
                              ELSE h.khhd END
                        AND tt.sohd_lienquan = h.so_hd
               )"
            + LocHdDaBiThayThe
            + LocHdLienQuanKhacKy;

        // BR-TK-06c — LOẠI HÓA ĐƠN TỰ KHAI "ĐÃ BỊ THAY THẾ", kể cả khi KHÔNG tìm
        // thấy bản thay thế nào trong kỳ.
        //
        // Nhánh trên nhận diện bằng LIÊN KẾT (có bản thay thế trỏ tới) — chắc chắn
        // hơn nhưng KHÔNG ĐỦ: bản thay thế có thể nằm ở kỳ khác hoặc chưa nạp về sổ,
        // lúc đó hóa đơn gốc không có ai trỏ tới nên lọt lưới.
        //
        // ĐO THẬT 15/08 — DAT_VIET_THANH T7/2026: năm hóa đơn RA mang trạng thái
        // 'Hóa đơn đã bị thay thế', bốn cái có bản thay thế cùng kỳ (nhánh liên kết
        // bắt được), riêng 0000801 (tiền hàng 2.000.000, VAT 100.000) KHÔNG có bản
        // nào trỏ tới. XML cổng trả về đã loại nó ⇒ engine cũng phải loại.
        // Thêm nhánh này thì VAT bán ra khớp ct35 = 65.949.024 TUYỆT ĐỐI.
        //
        // ĐÁNH ĐỔI ĐÃ BIẾT (chốt với anh Hiu 15/08): tthai_hd là văn bản tự do của
        // cổng TCT, cổng đổi cách viết là nhánh này câm lặng bỏ sót — đúng rủi ro mà
        // §10.2 của spec đã cảnh báo. Vì vậy engine ĐỒNG THỜI cảnh báo khi gặp trạng
        // thái lạ chứa chữ 'thay thế' mà không khớp mẫu nào (xem CanhBaoTrangThaiLa).
        // Dùng LIKE N'%bị thay thế%' chứ không so bằng: cổng có thể thêm đuôi.
        private const string LocHdDaBiThayThe = @"
               AND ISNULL(h.tthai_hd, '') NOT LIKE N'%bị thay thế%'";

        // BR-TK-06b — LOẠI CHÍNH HÓA ĐƠN THAY THẾ/ĐIỀU CHỈNH KHI GỐC THUỘC KỲ TRƯỚC.
        //
        // Khác hẳn nhánh trên: nhánh trên loại hóa đơn GỐC (vì đã có bản thay thế cùng
        // kỳ); nhánh này loại chính hóa đơn THAY THẾ/ĐIỀU CHỈNH, vì gốc của nó nằm ở
        // kỳ khác nên nó thuộc tờ khai kỳ đó, không phải kỳ này.
        //
        // ĐỐI CHIẾU BẢN THẬT 15/08 — DAT_VIET_THANH T7/2026 (chốt với anh Hiu):
        // XML cổng trả về KHÔNG kê hóa đơn 0000846 (thay thế cho 0000462 ngày 23/04,
        // tiền hàng 2.038.444.444, VAT 163.075.556) lẫn ba hóa đơn điều chỉnh âm
        // 0000819/0000838/0000839 (gốc thuộc T1, T4, T6). Engine trước đây kê hết
        // ⇒ khai THỪA 2,04 tỷ doanh thu và 163 triệu VAT chỉ riêng kỳ đó.
        //
        // Sau khi thêm nhánh này, nhóm 8% bán ra ra 47.642.515 so với ct32 = 47.642.315
        // của XML thật (lệch 200đ do làm tròn dòng), và ct33 khớp tuyệt đối 3.811.385.
        //
        // So theo NGÀY GỐC (ngay_lienquan) chứ không theo tháng của chính hóa đơn:
        // ngay_lienquan là ngày hóa đơn BỊ thay thế — nó mới quyết định gốc thuộc kỳ
        // nào. Bỏ trống ngay_lienquan thì GIỮ LẠI hóa đơn: không biết gốc ở kỳ nào thì
        // thà kê thừa (kế toán nhìn thấy mà bỏ) còn hơn nuốt mất một hóa đơn có thật.
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

            var hoaDon = await DocHoaDonKy(conn, thang, year);
            if (hoaDon.Count == 0)
                tk.CanhBao.Add(new CanhBaoToKhaiDto
                {
                    Ma = "KT-00", Muc = "CHAN",
                    MoTa = $"Kỳ tháng {thang}/{year} không có hóa đơn nào trong sổ",
                });

            await CanhBaoTrangThaiLa(conn, thang, tk.CanhBao);

            var dongRa  = await DocDongTheoSuat(conn, thang, year, "RA", coLoaiThue);
            var dongVao = await DocDongTheoSuat(conn, thang, year, "VAO", coLoaiThue);

            tk.NhomBanRa  = PhanBo(hoaDon, dongRa,  "RA",  tk.CanhBao);
            tk.NhomMuaVao = PhanBo(hoaDon, dongVao, "VAO", tk.CanhBao);

            TinhChiTieu(tk, hoaDon);
            TinhPhuLucNq142(tk);
            NoiKyTruoc(tk, code, xmlKyTruoc);
            KiemTraCanDoi(tk);

            return tk;
        }

        /// <summary>
        /// Cảnh báo khi sổ có trạng thái hóa đơn LẠ — phần bù cho BR-TK-06c.
        /// </summary>
        /// <remarks>
        /// BR-TK-06c lọc bằng CHỮ trong tthai_hd, mà đó là văn bản tự do của cổng TCT.
        /// Cổng đổi cách viết là phép lọc câm lặng bỏ sót, tờ khai khai thừa mà không
        /// ai biết. Hàm này bắt đúng cái câm lặng đó: gặp trạng thái chứa 'thay thế'
        /// hoặc 'điều chỉnh' mà KHÔNG khớp bốn mẫu đã biết thì nói ra ngay.
        ///
        /// Bốn mẫu đo thật 15/08 (DAT_VIET_THANH T7): 'Hóa đơn mới', 'Hóa đơn thay
        /// thế', 'Hóa đơn đã bị thay thế', 'Hóa đơn điều chỉnh'.
        ///
        /// Cảnh báo chứ KHÔNG chặn: gặp chữ lạ không có nghĩa là số sai, chỉ nghĩa là
        /// engine chưa chắc phân loại đúng — để kế toán tự nhìn rồi quyết.
        /// </remarks>
        private static async Task CanhBaoTrangThaiLa(
            SqlConnection conn, int thang, List<CanhBaoToKhaiDto> canhBao)
        {
            const string sql = @"
                SELECT tthai_hd, COUNT(*)
                  FROM HOA_DON
                 WHERE thang = @thang
                   AND ISNULL(tthai_hd, '') <> ''
                   AND (tthai_hd LIKE N'%thay thế%' OR tthai_hd LIKE N'%điều chỉnh%')
                   AND tthai_hd NOT IN (N'Hóa đơn mới', N'Hóa đơn thay thế',
                                        N'Hóa đơn đã bị thay thế', N'Hóa đơn điều chỉnh')
                 GROUP BY tthai_hd";

            using var cmd = new SqlCommand(sql, conn);
            cmd.Parameters.AddWithValue("@thang", thang);
            using var r = await cmd.ExecuteReaderAsync();
            while (await r.ReadAsync())
                canhBao.Add(new CanhBaoToKhaiDto
                {
                    Ma = "KT-09", Muc = "CANH_BAO",
                    MoTa = $"Sổ có {r.GetInt32(1)} hóa đơn mang trạng thái lạ "
                         + $"'{r.GetString(0)}' — engine chưa biết xếp loại, "
                         + "kiểm lại xem có phải hóa đơn thay thế/điều chỉnh không",
                });
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

            // loai_thue lấy thẳng từ DÒNG (xem vòng lặp dưới) để phân biệt KCT/KKKNT/0%
            // — ba loại này cùng thuế suất 0 nên chỉ nhìn con số thì không tách nổi,
            // script 017 sinh ra cột đó chính vì vậy.
            var gom = new Dictionary<decimal, NhomThueSuatDto>();

            // BR-TK-18 — GOM THEO pt_vat CỦA DÒNG, KHÔNG theo h.vat của header.
            //
            // h.vat là %VAT BÌNH QUÂN của cả hóa đơn. Hóa đơn trộn nhiều thuế suất thì
            // bình quân ra con số KHÔNG TỒN TẠI trong luật thuế.
            //
            // ĐO THẬT 15/08 — DAT_VIET_THANH T7: 4 hóa đơn có h.vat = 6% và 7% (mỗi cái
            // trộn hai thuế suất trên dòng), trong khi dòng hàng CHỈ CÓ 0/5/8%. Gom theo
            // header thì tờ khai mọc ra hai nhóm 6% và 7%, kéo ct32 từ 47.642.515 tụt
            // xuống 20.365.798 và BR-TK-03 chặn không cho xuất.
            //
            // Spec §3.3 đã ghi đúng cách: gom dòng theo pt_vat, rồi PHÂN BỔ chiết khấu
            // của từng hóa đơn về các nhóm THEO TỶ TRỌNG tiền hàng.
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
                n.LoaiThue ??= d.LoaiThue;

                // Chiết khấu của hóa đơn chia về nhóm theo tỷ trọng tiền hàng. Hóa đơn
                // tiền hàng 0 (hàng khuyến mại) thì không có gì để chia — bỏ qua, chứ
                // chia cho 0 là ném lỗi giữa mẻ.
                if (ckTheoHd.TryGetValue(d.MaHd, out var ck) && ck != 0
                    && gopTheoHd.TryGetValue(d.MaHd, out var gopHd) && gopHd != 0)
                    n.ChietKhau += ck * d.TienHang / gopHd;
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
            // BR-TK-17 — ct9 là chênh lệch THUẾ, KHÔNG phải chênh lệch GIÁ TRỊ HÀNG.
            //
            //     ct9 = thueGTGTDuocGiam (bán ra) − thueGTGTHHDV (mua vào)
            //
            // Bản cũ lấy hiệu giá trị hàng (GiaTriHhdvMuaVao − GiaTriHhdvBanRa) nên ra
            // số sai CẢ DẤU LẪN ĐỘ LỚN. Đo trên hai tờ khai thật 15/08, công thức trên
            // khớp tới từng đồng ở cả hai:
            //   NHAT_TUAN      :    59.595.118 −   268.421.207 = −208.826.089 ✔
            //   DAT_VIET_THANH :       952.846 −   165.876.147 = −164.923.301 ✔
            // Còn hiệu giá trị hàng cho ra 375.509.198 và 2.025.809.521 — lệch hẳn.
            pl.ChenhLechCt9 = pl.ThueGtgtDuocGiam - pl.ThueGtgtHhdvMuaVao;
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
        /// Thư mục tờ khai gốc của đơn vị theo NĂM — trong KHO TỜ KHAI:
        /// <c>&lt;ScanDocRoot1&gt;\&lt;MÃ&gt;\NAM&lt;năm&gt;\TO_KHAI\TO_KHAI_GOC</c>
        /// </summary>
        /// <remarks>
        /// Nằm TRONG NAM&lt;năm&gt; chứ không để phẳng ở gốc đơn vị: tờ khai là hồ sơ
        /// của một năm tài chính, gom cùng chỗ với dữ liệu năm đó thì sang năm mới chỉ
        /// việc thêm một thư mục, không phải trộn tờ khai nhiều năm vào một rổ.
        /// </remarks>
        public static string DuongDanToKhai(string goc, string code, int nam)
            => Path.Combine(goc, code, $"NAM{nam}", "TO_KHAI", "TO_KHAI_GOC");

        /// <summary>
        /// Biến thể KHÔNG có tầng TO_KHAI: <c>…\NAM&lt;năm&gt;\TO_KHAI_GOC</c>
        /// </summary>
        /// <remarks>
        /// Kho thật dùng CẢ HAI khuôn (đo 15/08): USA_MEVA và HUYEN_LINH có tầng
        /// TO_KHAI, còn THAI_TUAN và DAT_VIET_THANH để TO_KHAI_GOC thẳng dưới NAM2026.
        /// Kho do người gom tay qua nhiều năm nên không đồng nhất — chấp nhận cả hai
        /// khi ĐỌC thay vì bắt kế toán đi sửa lại tên thư mục của 91 đơn vị.
        /// Lúc GHI (LuuFileToKhai) vẫn chỉ dùng khuôn đủ tầng, để cái mới sinh ra
        /// thống nhất một kiểu.
        /// </remarks>
        public static string DuongDanToKhaiPhang(string goc, string code, int nam)
            => Path.Combine(goc, code, $"NAM{nam}", "TO_KHAI_GOC");

        /// <remarks>
        /// HAI KHO KHÁC HẲN NHAU, đừng lẫn (chốt 15/08):
        ///   Paths:ScanDocRoot  — nơi TẢI HÓA ĐƠN xml/html/excel về. Đọc VÀ ghi.
        ///   Paths:ScanDocRoot1 — kho TỜ KHAI các tháng trước. CHỈ ĐỌC.
        ///
        /// Tờ khai nằm ở kho thứ hai, nên hàm này phải đọc ScanDocRoot1. Trước đây nó
        /// đọc ScanDocRoot — tức là đi tìm tờ khai trong kho hóa đơn, chỗ không bao giờ
        /// có tờ khai. Đo thật 15/08: D:\...\SCAN_DOC\USA_MEVA\NAM2026 KHÔNG tồn tại,
        /// trong khi \\Server-test\scan_doc\USA_MEVA\NAM2026\TO_KHAI\TO_KHAI_GOC có đủ
        /// TKG_T1..T6_2026. Hàm luôn trả null → hệ thống tưởng đơn vị nào cũng CHƯA có
        /// tờ khai kỳ trước, nên không lấy được ct22 tồn đầu kỳ (BR-TK-02).
        /// </remarks>
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

        // Tìm XML tờ khai của một kỳ. Thư mục con đặt tên TKG_T<tháng>_<năm>.
        //
        // Kỳ tháng 1 lấy tờ khai tháng 12 NĂM TRƯỚC, mà tờ khai năm trước nằm dưới
        // NAM<năm-1> — nên phải tra theo đúng năm của kỳ cần tìm, không dùng năm làm việc.
        //
        // CHỈ LẤY XML TỜ KHAI: thư mục kỳ trong kho có lẫn bảng kê hóa đơn của chính kỳ
        // đó (đo thật 15/08 — TKG_T6_2026 của USA_MEVA chứa HD_VAO_*.xlsx, HD_RA_*.xlsx
        // nằm cạnh file tờ khai). Lọc bằng đuôi .xml thôi thì chưa đủ chắc, nên loại
        // thẳng những file mang tiền tố bảng kê.
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

        /// <summary>File này có phải XML TỜ KHAI không, hay là bảng kê hóa đơn lẫn vào.</summary>
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
            // Cùng lý do như TimXmlToKhai: loại bảng kê hóa đơn lẫn trong thư mục kỳ.
            // Chỗ này nguy hơn vì nó lấy file BẤT KỲ (không lọc theo kỳ) — vơ nhầm một
            // bảng kê là dựng tờ khai mới trên khuôn sai hoàn toàn.
            return Directory
                .EnumerateFiles(goc, "*.xml", SearchOption.AllDirectories)
                .Where(LaXmlToKhai)
                .OrderByDescending(f => f, StringComparer.OrdinalIgnoreCase)
                .FirstOrDefault();
        }
    }



    // ============ BÁO CÁO THUẾ & RÀ SOÁT CHÉO NHIỀU ĐƠN VỊ ============
    //
    // Bàn làm việc của kế toán DỊCH VỤ (MDN_NB): một dòng một đơn vị, soi nhanh xem
    // đơn vị nào còn lệch trước khi nộp tờ khai. Khác hẳn màn Báo cáo thuế của đơn vị
    // thường — màn kia soi MỘT đơn vị thật kỹ, màn này soi MỌI đơn vị ở mức tổng.
    //
    // CHỈ ĐỌC. Chạy ngay trước kỳ nộp tờ khai nên cùng luật với RaSoatService /
    // ToKhaiService: một câu UPDATE nhầm là hỏng số của cả loạt đơn vị.
    //
    // ----- NGUỒN SỐ CỦA TỪNG CỘT (chốt với anh Hiu 14/08) -----
    //   Tồn đầu   = ct22 kỳ này   — lấy từ bảng TOKHAI (KT2000_Base), tức DỮ LIỆU DB
    //   TĐ XML    = ct43 kỳ TRƯỚC — cũng từ TOKHAI, DỮ LIỆU DB
    //               Hai số này PHẢI bằng nhau: số chuyển kỳ sau của kỳ trước chính là
    //               số chuyển sang của kỳ này. Lệch nhau nghĩa là có kỳ khai sai.
    //   V1 R1 V2 R2 V3 R3 = SỐ HÓA ĐƠN vào/ra của 3 tháng trong kỳ, đếm từ HOA_DON
    //               của database đơn vị-năm. Có đơn vị khai THÁNG, có đơn vị khai QUÝ
    //               (chốt 14/08) nên phải trải đủ 3 tháng: khai tháng thì chỉ cặp đầu
    //               có số, khai quý thì cả ba cặp.
    //   Tồn cuối  = ct43 kỳ này   — từ TOKHAI, DỮ LIỆU DB
    //   Tồn XML   = ct43 đọc từ file XML CỔNG TRẢ VỀ SAU KHI NỘP.
    //               GIAI ĐOẠN NÀY CHƯA CÓ (xử lý sau) — luôn null, cột để trống.
    //   Lệch      = Tồn cuối − Tồn XML, chỉ tính khi có Tồn XML. Chưa có XML thì null
    //               chứ KHÔNG phải 0: 0 nghĩa là "đã đối chiếu và khớp", còn ở đây là
    //               "chưa đối chiếu được". Hai chuyện khác hẳn nhau.
    public class BangToKhaiService
    {
        private readonly TenantDbResolver _resolver;
        // Cần cho ThuMucToKhai(): đường dẫn kho lấy từ appsettings, không cứng trong
        // code (luật 4).
        private readonly IConfiguration _config;

        public BangToKhaiService(TenantDbResolver resolver, IConfiguration config)
        {
            _resolver = resolver;
            _config = config;
        }

        /// <summary>
        /// Lập bảng rà soát chéo cho một kỳ: mỗi đơn vị một dòng.
        /// </summary>
        /// <param name="dsDonVi">
        /// Danh sách mã đơn vị cần soi, do controller lấy từ Master. Truyền vào chứ
        /// không tự đọc: service này KHÔNG được biết bảng Tenants — đó là việc của
        /// tầng gọi, và nhờ vậy test được mà không cần Master.
        /// </param>
        public async Task<List<DongRaSoatToKhaiDto>> Lap(
            IReadOnlyList<DonViKy> dsDonVi, int nam, int thang,
            CancellationToken huy = default)
        {
            // ---------- 1. Đọc TOKHAI, MỘT lượt cho cả lưới ----------
            // Bảng nằm chung ở Base nên một SELECT là đủ, thay vì N lượt gọi.
            var toKhai = await DocToKhai(nam, huy);

            // ---------- 2. Đếm hóa đơn từng đơn vị ----------
            // Mỗi đơn vị một database riêng nên bắt buộc phải mở từng cái. Chạy SONG
            // SONG: 16 đơn vị, mỗi lượt một round-trip sang SQL Server; tuần tự thì
            // người dùng ngồi đợi tổng của 16 lượt cộng lại.
            var dem = await DemHoaDonMoiDonVi(dsDonVi, nam, thang, huy);

            // ---------- 2b. Vét kho tờ khai cho những kỳ DB chưa có ----------
            // DB mới có tờ khai của 5/13 đơn vị khai tháng (đo 15/08), trong khi kho
            // \\Server-test đã có file XML của nhiều kỳ hơn hẳn — lưới vì thế trống
            // gần hết dù số liệu nằm sẵn trên đĩa. Đọc thẳng file để lấp vào.
            //
            // KHO CHỈ LÀ NGUỒN BÙ, KHÔNG ĐÈ DB: dòng nào DB đã có thì giữ nguyên số
            // của DB. Nạp ngược file vào DB là việc riêng, làm sau — ở đây chỉ đọc.
            var tuKho = QuetKhoToKhai(dsDonVi, nam, thang, huy);

            // ---------- 3. Ghép thành dòng ----------
            var ds = new List<DongRaSoatToKhaiDto>(dsDonVi.Count);
            int stt = 0;
            foreach (var dv in dsDonVi)
            {
                var ma = dv.Ma;
                // Đơn vị khai QUÝ chốt số ở THÁNG CUỐI QUÝ — tờ khai của họ mang kỳ
                // 3/6/9/12. Tra tờ khai theo tháng đang chọn thì cả 7 đơn vị khai quý
                // đều trắng số ở 2/3 số kỳ.
                var thangTk = ThangToKhai(dv, thang);
                var (namTr, thangTr) = KyTruocCuaDonVi(dv, nam, thangTk);

                toKhai.TryGetValue(Khoa(ma, nam, thangTk), out var tkNay);
                toKhai.TryGetValue(Khoa(ma, namTr, thangTr), out var tkTruoc);
                dem.TryGetValue(ma, out var d);

                // Kho bù vào chỗ DB trống — xem bước 2b. DB có thì DB thắng.
                tuKho.TryGetValue(Khoa(ma, nam, thangTk), out var khoNay);
                tuKho.TryGetValue(Khoa(ma, namTr, thangTr), out var khoTruoc);

                // Tồn cuối = ct43 bản TỰ LẬP. DB chưa có thì để TRỐNG, KHÔNG lấy số
                // của kho thay vào: file trong kho là bản ĐÃ NỘP, đem nó làm bản tự
                // lập thì cột Lệch bên dưới lấy chính nó trừ chính nó, luôn ra 0 —
                // tức là báo "đã đối chiếu, khớp" cho kỳ chưa hề đối chiếu.
                var tonCuoi = tkNay?.Ct43;

                // Tồn XML = ct43 của bản CỔNG TRẢ VỀ. Cột ct43_xml trong DB chỉ có khi
                // đã nạp file qua màn "BC lấy tờ khai XML"; còn file nằm sẵn trong kho
                // chính là bản đã nộp, nên đọc được thì dùng luôn.
                var tonXml = tkNay?.Ct43Xml ?? khoNay?.Ct43;

                // Số hóa đơn trong SỔ, cộng cả kỳ — để so với số hóa đơn trên tờ khai.
                var slSo = (d?.V1 ?? 0) + (d?.R1 ?? 0) + (d?.V2 ?? 0) + (d?.R2 ?? 0)
                         + (d?.V3 ?? 0) + (d?.R3 ?? 0);

                ds.Add(new DongRaSoatToKhaiDto
                {
                    Stt = ++stt,
                    MaDonVi = ma,
                    KhaiQuy = dv.KhaiQuy,
                    KyKeKhai = dv.KhaiQuy ? $"Q{(thangTk + 2) / 3}/{nam}"
                                          : $"{thangTk:00}/{nam}",
                    // Tồn đầu = ct22 bản tự lập; TĐ XML = ct43 KỲ TRƯỚC. Hai số này
                    // phải bằng nhau (BR-TK-02). Vế phải lấy được từ kho khi DB chưa
                    // có kỳ trước — đây mới là chỗ kho giúp được thật: nó cho cái để SO.
                    TonDau = tkNay?.Ct22,
                    TonDauXml = tkTruoc?.Ct43 ?? khoTruoc?.Ct43,
                    V1 = d?.V1 ?? 0, R1 = d?.R1 ?? 0,
                    V2 = d?.V2 ?? 0, R2 = d?.R2 ?? 0,
                    V3 = d?.V3 ?? 0, R3 = d?.R3 ?? 0,
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

        // Tháng mà TỜ KHAI của đơn vị mang: khai tháng thì đúng tháng đang chọn, khai
        // quý thì tháng CUỐI QUÝ chứa tháng đó (1,2,3 → 3; 4,5,6 → 6…).
        private static int ThangToKhai(DonViKy dv, int thang) =>
            dv.KhaiQuy ? ((thang + 2) / 3) * 3 : thang;

        // Tháng ĐẦU của kỳ, dùng để đếm hóa đơn: khai tháng đếm đúng 1 tháng (V1/R1),
        // khai quý đếm 3 tháng của quý (V1..R3).
        private static int ThangDau(DonViKy dv, int thang) =>
            dv.KhaiQuy ? ((thang + 2) / 3) * 3 - 2 : thang;

        // Kỳ TRƯỚC của đơn vị: khai tháng lùi 1 tháng, khai quý lùi 3 tháng. Lùi sai
        // nhịp thì cột "TĐ XML" của đơn vị khai quý luôn trống.
        private static (int Nam, int Thang) KyTruocCuaDonVi(DonViKy dv, int nam, int thangTk)
        {
            var buoc = dv.KhaiQuy ? 3 : 1;
            var t = thangTk - buoc;
            return t >= 1 ? (nam, t) : (nam - 1, t + 12);
        }

        // ============ GHI / ĐỌC MỘT TỜ KHAI GÕ TAY ============
        //
        // Đơn vị chưa có hóa đơn trong sổ (AK_GLOBAL, ANH_DAO… — trắng trên lưới) vẫn
        // phải nộp tờ khai. Kế toán gõ tay các chỉ tiêu rồi lưu vào TOKHAI, để kỳ sau
        // tự lấy được ct22 (BR-TK-02) mà không phải nhớ lại con số.
        //
        // UPSERT theo khóa (ma_donvi, ky_kekhai, lan_nop): sửa rồi lưu lại là ghi đè
        // đúng dòng đó, không đẻ thêm bản trùng. Muốn giữ bản cũ thì tăng lan_nop —
        // đó chính là tờ khai BỔ SUNG.
        //
        // Chỉ đụng bảng TOKHAI ở Base. KHÔNG ghi gì sang database đơn vị: sổ hóa đơn
        // là nguồn riêng, tờ khai gõ tay không được phép sửa nó (luật 5).
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
                     ct21_nnt, ct22_nnt, ct23_nnt, ct24_nnt, ct25_nnt, ct26_nnt,
                     ct27_nnt, ct28_nnt, ct29_nnt, ct30_nnt, ct31_nnt, ct32_nnt,
                     ct33_nnt, ct32a_nnt, ct34_nnt, ct35_nnt, ct36_nnt, ct37_nnt,
                     ct38_nnt, ct39_nnt, ct40a_nnt, ct40b_nnt, ct40_nnt, ct41_nnt,
                     ct42_nnt, ct43_nnt, ghi_chu, ma_nv, time_add, created_by)
                  VALUES
                    (@ma, @ky, @lan, @nam, @thang,
                     @maTk, @tenTk, @xmlVer, @loaiTk, @maCct, @tenCct, @ngayLap,
                     @mst, @tenNnt, @diaChi,
                     @ct21, @ct22, @ct23, @ct24, @ct25, @ct26,
                     @ct27, @ct28, @ct29, @ct30, @ct31, @ct32,
                     @ct33, @ct32a, @ct34, @ct35, @ct36, @ct37,
                     @ct38, @ct39, @ct40a, @ct40b, @ct40, @ct41,
                     @ct42, @ct43, @ghiChu, @nguoi, SYSDATETIME(), @nguoi);";

            using var conn = new SqlConnection(_resolver.GetBaseConnection());
            await conn.OpenAsync(huy);
            using var cmd = new SqlCommand(sql, conn);
            var p = cmd.Parameters;
            p.AddWithValue("@ma", tk.MaDonVi);
            p.AddWithValue("@ky", $"{tk.Thang:00}/{tk.Nam}");
            p.AddWithValue("@lan", tk.LanNop);
            p.AddWithValue("@nam", tk.Nam);
            p.AddWithValue("@thang", tk.Thang);
            // Mặc định mẫu 01/GTGT của HTKK — cùng bộ giá trị với file XML thật, để
            // dòng gõ tay và dòng nạp từ Excel nằm chung một khuôn.
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

        /// <summary>
        /// Danh sách tờ khai đã lưu — lưới của màn "BC lấy tờ khai XML".
        /// Lọc theo năm; bỏ trống đơn vị/tháng thì lấy hết.
        /// </summary>
        public async Task<List<DongBcToKhaiDto>> DsToKhai(
            int nam, string? maDonVi, int? thang, CancellationToken huy = default)
        {
            // Sắp theo đơn vị rồi tới kỳ: kế toán dò theo tên đơn vị trước, trong một
            // đơn vị thì xem các kỳ nối tiếp nhau.
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
            using var conn = new SqlConnection(_resolver.GetBaseConnection());
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
                    TonDau = D(5), GtMuaVao = D(6), VatVao = D(7), VatKhauTru = D(8),
                    GtBanRa = D(9), VatRa = D(10), VatPhaiNop = D(11), TonCuoi = D(12),
                    XmlName = r.IsDBNull(13) ? null : r.GetString(13),
                    XmlPath = r.IsDBNull(14) ? null : r.GetString(14),
                    // CÓ file cổng trả về hay chưa — cột này quyết định dòng đã nộp
                    // xong hay mới chỉ lập trong máy.
                    DaNop = !r.IsDBNull(14),
                    NgayLap = r.IsDBNull(15) ? null : r.GetDateTime(15),
                    NguoiLap = r.IsDBNull(16) ? null : r.GetString(16),
                    GhiChu = r.IsDBNull(17) ? null : r.GetString(17),
                });
            }
            // ---------- Gộp thêm SỐ TỪ SỔ HÓA ĐƠN ----------
            // Cột "GT HĐ Vào / GT VAT Vào / GT HĐ Ra / GT VAT Ra" là số gộp từ SỔ, còn
            // ct23/ct24/ct34/ct35 là số trên TỜ KHAI. Bốn cột "Lệch …" là hiệu hai bên
            // — đây mới là thứ đáng nhìn nhất của lưới: tờ khai đã nộp mà lệch với sổ
            // nghĩa là khai thiếu/thừa hóa đơn.
            await GopSoTuSo(ds, nam, huy);
            return ds;
        }

        /// <summary>
        /// Gộp số tiền hàng / VAT theo SỔ HÓA ĐƠN vào từng dòng tờ khai.
        /// </summary>
        /// <remarks>
        /// Gom MỘT câu UNION ALL cho mọi đơn vị — cùng lý do với DemHoaDonMoiDonVi:
        /// chi phí mở kết nối lớn hơn hẳn chi phí truy vấn (đo thật 14/08: 16 kết nối
        /// riêng 764ms, một kết nối UNION ALL 152ms).
        ///
        /// Loại dòng chiết khấu tinh_chat='3' khỏi tiền hàng — BR-TK-05, giống hệt
        /// SqlHoaDonKy. Không loại thì tiền hàng phình lên và cột Lệch báo sai.
        /// </remarks>
        private async Task GopSoTuSo(
            List<DongBcToKhaiDto> ds, int nam, CancellationToken huy)
        {
            var maDs = ds.Select(d => d.MaDonVi)
                         .Distinct(StringComparer.OrdinalIgnoreCase).ToList();
            if (maDs.Count == 0) return;

            // Chỉ giữ đơn vị THẬT SỰ có bảng HOA_DON — một nhánh trỏ vào database
            // thiếu bảng làm hỏng CẢ câu UNION ALL.
            var dung = await LocDonViCoBang(
                maDs.Select(m => new DonViKy { Ma = m }).ToList(), nam, huy);
            if (dung.Count == 0) return;

            var nhanh = new List<string>();
            var thamSo = new List<(string, object)>();
            for (int i = 0; i < dung.Count; i++)
            {
                var db = _resolver.BuildDbName(dung[i].Ma, nam);
                nhanh.Add($@"
                    SELECT @m{i} AS ma_donvi, h.thang, h.huong,
                           SUM(ISNULL(l.tien_hang, 0)) AS gt_hang,
                           SUM(ISNULL(h.tien_vat, 0))  AS vat
                      FROM [{db}].dbo.HOA_DON h
                      OUTER APPLY (
                            SELECT SUM(CASE WHEN ISNULL(x.tinh_chat, '1') = '3' THEN 0
                                            ELSE ISNULL(x.so_luong, 0) * ISNULL(x.don_gia, 0)
                                       END) AS tien_hang
                              FROM [{db}].dbo.HOA_DON_LINE x WHERE x.ma_hd = h.ma_hd
                      ) l
                     GROUP BY h.thang, h.huong");
                thamSo.Add(($"@m{i}", dung[i].Ma));
            }

            // (mã đơn vị, tháng) → số của sổ
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
                if (r.IsDBNull(1)) continue;             // hóa đơn chưa gán kỳ kê khai
                var k = $"{r.GetString(0)}|{r.GetInt32(1)}".ToUpperInvariant();
                var laVao = string.Equals(r.IsDBNull(2) ? "" : r.GetString(2),
                                          "VAO", StringComparison.OrdinalIgnoreCase);
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

                // Lệch = TỜ KHAI − SỔ. Chỉ tính khi tờ khai CÓ khai chỉ tiêu đó; chưa
                // khai (null) thì để null chứ không lấy 0 trừ đi số sổ — hiện một con
                // số lệch to đùng cho kỳ chưa khai là báo động giả.
                d.LechGtHdVao = d.GtMuaVao == null ? null : d.GtMuaVao - s.HangVao;
                d.LechVatVao = d.VatVao == null ? null : d.VatVao - s.VatVao;
                d.LechGtHdRa = d.GtBanRa == null ? null : d.GtBanRa - s.HangRa;
                d.LechVatRa = d.VatRa == null ? null : d.VatRa - s.VatRa;
            }
        }

        /// <summary>
        /// Dựng đường dẫn thư mục lưu tờ khai của một đơn vị-kỳ, theo khuôn kho.
        /// </summary>
        /// <remarks>
        /// Khuôn (chốt 15/08, theo kho thật đang dùng):
        ///     &lt;ScanDocRoot1&gt;\&lt;MÃ_ĐƠN_VỊ&gt;\NAM&lt;năm&gt;\TO_KHAI\TO_KHAI_GOC\TKG_T&lt;tháng&gt;_&lt;năm&gt;
        /// Ví dụ: \Server-test\scan_doc\USA_MEVA\NAM2026\TO_KHAI\TO_KHAI_GOC\TKG_T6_2026
        ///
        /// TỰ SUY chứ không bắt người dùng chọn tay: kho có 91 đơn vị × 12 kỳ, chọn
        /// tay vừa lâu vừa dễ lạc thư mục — mà lạc thì file của đơn vị này nằm trong
        /// thư mục đơn vị khác, sau không ai tìm ra.
        ///
        /// Dùng ScanDocRoot1 (kho TỜ KHAI trên server) chứ KHÔNG phải ScanDocRoot (nơi
        /// tải HÓA ĐƠN về). Hai kho khác hẳn nhau — xem chú thích đầu ToKhaiService.
        ///
        /// BÁM THEO KHUÔN ĐƠN VỊ ĐANG DÙNG: đơn vị nào đã có cây TO_KHAI_GOC phẳng
        /// (THAI_TUAN, DAT_VIET_THANH) thì lưu vào đúng cây đó. Cứ ghi theo khuôn đủ
        /// tầng là đơn vị đó có HAI cây tờ khai song song, tháng cũ một nơi tháng mới
        /// một nơi — sau không ai biết tìm ở đâu. Đơn vị chưa có gì thì dựng khuôn đủ
        /// tầng, để cái mới sinh ra thống nhất một kiểu.
        /// </remarks>
        public string? ThuMucToKhai(string maDonVi, int nam, int thang)
        {
            var goc = _config["Paths:ScanDocRoot1"];
            if (string.IsNullOrWhiteSpace(goc)) return null;

            // Mã đơn vị đi qua BR-DB-01 trước khi ghép đường dẫn: chuỗi lạ (có ../
            // hay dấu \) là thoát ra khỏi kho, ghi đè file bất kỳ trên server.
            if (!TenantDbResolver.IsValidCode(maDonVi)) return null;

            // Đơn vị đã có cây phẳng thì theo cây đó; còn lại dùng khuôn đủ tầng.
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
            /// <summary>Thư mục cha, null nếu đang đứng ở gốc kho (không lùi được nữa).</summary>
            public string? Cha { get; set; }
            public bool LaGoc { get; set; }
            public List<MucKho> Muc { get; set; } = new();

            /// <summary>
            /// Thư mục người dùng XIN mở. Khác DuongDan khi chỗ đó chưa tồn tại.
            /// </summary>
            public string DuongDanXin { get; set; } = "";

            /// <summary>
            /// Các tầng CÒN THIẾU giữa DuongDan (chỗ đang mở thật) và DuongDanXin —
            /// theo thứ tự từ ngoài vào trong. Rỗng = mở đúng chỗ đã xin.
            /// </summary>
            /// <remarks>
            /// Để màn hình nói được "thư mục kỳ chưa có, lưu sẽ tự tạo" thay vì im
            /// lặng đưa người dùng tới một thư mục khác chỗ họ vừa bấm.
            /// </remarks>
            public List<string> ThieuTang { get; set; } = new();
        }

        /// <remarks>
        /// Dùng chung cho CẢ duyệt lẫn ghi — hai chỗ mà lệch nhau một chút là có
        /// đường ghi được ra ngoài kho dù đường duyệt đã chặn.
        /// </remarks>
        private (string Dich, string Goc) DuyetKhoHopLe(string? duongDan)
        {
            var goc = _config["Paths:ScanDocRoot1"];
            if (string.IsNullOrWhiteSpace(goc))
                throw new ArgumentException("Chưa khai Paths:ScanDocRoot1 trong cấu hình máy chủ");

            var gocDay = Path.TrimEndingDirectorySeparator(Path.GetFullPath(goc));
            var dich = string.IsNullOrWhiteSpace(duongDan)
                ? gocDay
                : Path.TrimEndingDirectorySeparator(Path.GetFullPath(duongDan));

            // NHỐT TRONG KHO: bằng gốc, hoặc nằm dưới gốc + dấu phân cách.
            if (!dich.Equals(gocDay, StringComparison.OrdinalIgnoreCase)
                && !dich.StartsWith(gocDay + Path.DirectorySeparatorChar,
                                    StringComparison.OrdinalIgnoreCase))
                throw new UnauthorizedAccessException(
                    "Đường dẫn nằm ngoài kho tờ khai — không được phép");

            return (dich, gocDay);
        }

        /// <summary>
        /// Duyệt một thư mục trong KHO TỜ KHAI để người dùng nhìn tận mắt trước khi
        /// chốt chỗ lưu.
        /// </summary>
        /// <remarks>
        /// CHỈ ĐỌC, và bị NHỐT trong Paths:ScanDocRoot1 (rào ở DuyetKhoHopLe).
        /// Bỏ trống duongDan = đứng ở gốc kho.
        ///
        /// TỰ LẦN XUỐNG SÂU NHẤT CÓ THỂ: thư mục kỳ thường CHƯA tồn tại (lát nữa lưu
        /// mới tạo). Ném 404 khi đó thì màn hình phải lùi hẳn về gốc kho — mà gốc có
        /// 91 đơn vị, bắt kế toán tự mò xuống 5 tầng đúng cái việc luồng này sinh ra
        /// để bỏ đi. Thay vào đó cứ bỏ dần tầng cuối cho tới khi gặp thư mục có thật,
        /// rồi báo về ThieuTang để màn hình nói rõ "chưa có, lưu sẽ tạo".
        /// </remarks>
        public KetQuaDuyet DuyetKho(string? duongDan)
        {
            var (dich, gocDay) = DuyetKhoHopLe(duongDan);

            // Lần ngược lên cho tới thư mục có thật. Vòng lặp luôn dừng: gốc kho đã
            // được kiểm tồn tại ở dưới, và mỗi vòng bỏ đúng một tầng.
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

            // Thư mục trước, file sau — cùng lối sắp của Explorer, kế toán quen mắt.
            foreach (var d in thongTin.EnumerateDirectories().OrderBy(x => x.Name))
                kq.Muc.Add(new MucKho
                {
                    Ten = d.Name, DuongDan = d.FullName,
                    LaThuMuc = true, SuaLuc = d.LastWriteTime,
                });

            // Chỉ hiện file TỜ KHAI (.xml/.zip): thư mục kỳ có lẫn bảng kê hóa đơn
            // .xlsx, hiện ra chỉ tổ rối vì hóa đơn không lấy từ kho này.
            foreach (var f in thongTin.EnumerateFiles()
                         .Where(x => x.Extension.Equals(".xml", StringComparison.OrdinalIgnoreCase)
                                  || x.Extension.Equals(".zip", StringComparison.OrdinalIgnoreCase))
                         .OrderBy(x => x.Name))
                kq.Muc.Add(new MucKho
                {
                    Ten = f.Name, DuongDan = f.FullName,
                    LaThuMuc = false, Kich = f.Length, SuaLuc = f.LastWriteTime,
                });

            return kq;
        }

        /// <summary>
        /// Lưu file tờ khai TCT trả về vào kho, TỰ TẠO thư mục kỳ nếu chưa có.
        /// </summary>
        /// <remarks>
        /// Trả về đường dẫn đầy đủ đã ghi. Ném ArgumentException nếu chưa khai
        /// ScanDocRoot1 hoặc mã đơn vị không hợp lệ.
        ///
        /// KHÔNG ghi đè file trùng tên: cổng có thể trả nhiều lần cho cùng một kỳ, mà
        /// ghi đè là mất bản trước — thêm hậu tố _1, _2… để giữ cả hai.
        /// </remarks>
        public async Task<string> LuuFileToKhai(
            string maDonVi, int nam, int thang, string tenFile, Stream noiDung,
            CancellationToken huy = default, string? thuMucChon = null)
        {
            // Thư mục kế toán tự duyệt và chọn thì GHI VÀO ĐÓ. Vẫn phải qua rào chặn
            // của DuyetKho: chuỗi này đến thẳng từ client nên dù màn hình chỉ cho
            // chọn trong kho, request nặn tay vẫn gửi được đường dẫn bất kỳ.
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

            // Chỉ lấy phần TÊN của file gửi lên: tên có kèm đường dẫn ("..\..\x.xml")
            // là ghi ra ngoài thư mục đích.
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

        /// <summary>
        /// Gắn file XML CỔNG TRẢ VỀ sau khi nộp vào tờ khai đã lưu.
        /// </summary>
        /// <remarks>
        /// Đây là mảnh còn thiếu của cột "Tồn XML" trên lưới rà soát chéo: ct43 đọc
        /// từ file cổng trả về mới là số ĐÃ NỘP THẬT, khác với ct43 mình tự tính.
        /// Lệch hai số đó nghĩa là bản nộp khác bản lập — phải soi lại.
        ///
        /// Chỉ ghi tên + đường dẫn + ct43 đọc được; KHÔNG ghi đè các chỉ tiêu khác:
        /// bản mình lập phải giữ nguyên để còn so được với bản đã nộp.
        ///
        /// KỲ CHƯA CÓ DÒNG THÌ TẠO MỚI (15/08): trước đây chỉ UPDATE, nên đơn vị nào
        /// chưa tự lập tờ khai trong máy là file cổng trả về lưu được vào kho mà số
        /// liệu không vào đâu cả — kỳ đó vĩnh viễn trống trên lưới. Dòng tạo mới chỉ
        /// mang phần _xml (bản TCT); các cột ct*_nnt để NULL vì KHÔNG có bản tự lập
        /// để mà điền — đặt 0 vào đó là dựng ra một bản tự lập không tồn tại và cột
        /// Lệch sẽ báo lệch bằng đúng số của TCT.
        /// </remarks>
        public async Task<bool> GanXmlDaNop(
            string maDonVi, int nam, int thang, int lanNop,
            string tenFile, string? duongDan, Dictionary<string, decimal?> ct,
            string nguoiGhi, CancellationToken huy = default, string? ghiChu = null)
        {
            // Ghi ĐỦ 26 chỉ tiêu của bản TCT, không chỉ ct43: có đủ mới chỉ ra được
            // lệch ở CHỈ TIÊU NÀO, chứ mỗi ct43 thì biết tổng lệch mà không biết vì đâu.
            var dat = string.Join(", ", ToKhaiService.ChiTieuXml.Select(x => $"{x.Cot} = @{x.Cot}"));
            var cot = string.Join(", ", ToKhaiService.ChiTieuXml.Select(x => x.Cot));
            var giaTri = string.Join(", ", ToKhaiService.ChiTieuXml.Select(x => $"@{x.Cot}"));

            // UPDATE trước, INSERT chỉ khi không đụng dòng nào. Không dùng MERGE: khóa
            // chính là (ma_donvi, ky_kekhai, lan_nop) mà câu này tìm theo (nam, thang)
            // — hai bộ cột khác nhau, MERGE trên đó dễ chèn trùng hơn là an toàn hơn.
            // ghi_chu chỉ ĐÈ khi lần này thật sự có gõ (@ghiChu khác null). Bỏ trống ô
            // ghi chú là "không có gì để nói thêm", KHÔNG phải "xóa ghi chú cũ" — mà
            // ghi chú cũ thường là lời dặn của kỳ trước, mất là mất hẳn.
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

            using var conn = new SqlConnection(_resolver.GetBaseConnection());
            await conn.OpenAsync(huy);
            using var cmd = new SqlCommand(sql, conn);
            cmd.Parameters.AddWithValue("@ma", maDonVi);
            cmd.Parameters.AddWithValue("@nam", nam);
            cmd.Parameters.AddWithValue("@thang", thang);
            // ky_kekhai là 'MM/yyyy' đúng khuôn Excel (script 019) — sinh ở đây cho
            // dòng INSERT, câu UPDATE vẫn tìm bằng (nam, thang) như cũ.
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

        /// <summary>
        /// So bản TỰ LẬP (ct*_nnt) với bản TCT TRẢ VỀ (ct*_xml) của một kỳ, trả về
        /// những chỉ tiêu KHÁC NHAU.
        /// </summary>
        /// <remarks>
        /// Chỉ so khi ĐÃ nạp bản TCT (xml_nap_luc khác null) — chưa nạp thì mọi cột
        /// ct*_xml đều null, so ra "lệch toàn bộ" là báo động giả.
        ///
        /// null ở MỘT bên coi là 0 để so: HTKK bỏ trống thẻ chỉ tiêu bằng 0, nên
        /// null và 0 là cùng một nghĩa trong tờ khai.
        /// </remarks>
        /// <summary>
        /// Một chỉ tiêu soi từ BA nguồn cùng lúc.
        /// </summary>
        public sealed class DongDoiChieu
        {
            public string Ma { get; set; } = "";       // '22', '32a', '43'…
            public string Ten { get; set; } = "";      // nhãn đọc được
            /// <summary>Số trên TỜ KHAI đã lưu (tự lập hoặc gõ tay).</summary>
            public decimal? ToKhai { get; set; }
            /// <summary>Số TÍNH LẠI TỪ SỔ hóa đơn — nguồn gốc, không phải số khai.</summary>
            public decimal? So { get; set; }
            /// <summary>Số của bản TCT TRẢ VỀ sau khi nộp.</summary>
            public decimal? Tct { get; set; }
            public decimal? LechSo => ToKhai != null && So != null ? ToKhai - So : null;
            public decimal? LechTct => ToKhai != null && Tct != null ? ToKhai - Tct : null;
            public bool CoLech => (LechSo ?? 0) != 0 || (LechTct ?? 0) != 0;
        }

        /// <summary>
        /// ĐỐI CHIẾU BA NGUỒN cho một kỳ: tờ khai đã lưu · sổ hóa đơn · bản TCT trả về.
        /// </summary>
        /// <remarks>
        /// Vì sao gộp một chỗ: kế toán cần biết "số này lệch với cái gì" chứ không
        /// phải mở ba màn rồi tự so. Ba câu hỏi khác nhau, một bảng trả lời:
        ///   • lệch với SỔ  → tờ khai khai thiếu/thừa so với hóa đơn thật
        ///   • lệch với TCT → bản nộp khác bản mình lập
        ///   • cả hai khớp  → kỳ này sạch
        ///
        /// Chỉ so được chỉ tiêu nào SỔ TÍNH RA ĐƯỢC (ct23…ct35). Mấy chỉ tiêu chuyển
        /// kỳ (ct22, ct40…ct43) không suy từ sổ nên cột "Sổ" để null — null KHÁC 0,
        /// nghĩa là "không so được", không phải "lệch bằng 0".
        /// </remarks>
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
            using var conn = new SqlConnection(_resolver.GetBaseConnection());
            await conn.OpenAsync(huy);
            using var cmd = new SqlCommand(sql, conn);
            cmd.Parameters.AddWithValue("@ma", maDonVi);
            cmd.Parameters.AddWithValue("@nam", nam);
            cmd.Parameters.AddWithValue("@thang", thang);
            cmd.Parameters.AddWithValue("@lan", lanNop);

            using var r = await cmd.ExecuteReaderAsync(huy);
            if (!await r.ReadAsync(huy)) return ds;     // kỳ này chưa lưu tờ khai
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
                    // Chưa nạp bản TCT thì để null — so ra "lệch toàn bộ" là báo
                    // động giả, khác hẳn "đã nạp và lệch".
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

            using var conn = new SqlConnection(_resolver.GetBaseConnection());
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

        /// <summary>Đọc lại một tờ khai đã lưu để sửa tiếp. Null nếu chưa có.</summary>
        /// <summary>
        /// Tồn đầu (ct22) của một kỳ = số CHUYỂN SANG của KỲ LIỀN TRƯỚC (BR-TK-02).
        /// Trả null nếu kỳ trước chưa có tờ khai.
        /// </summary>
        /// <remarks>
        /// ƯU TIÊN ct43 của BẢN TCT TRẢ VỀ, không có mới lùi về bản tự lập: bản TCT
        /// là số ĐÃ NỘP THẬT, còn bản tự lập chỉ là thứ mình tính ra. Hai bản lệch
        /// nhau mà lấy bản tự lập thì kỳ này sai ngay từ dòng đầu tiên.
        ///
        /// Lấy lần nộp MỚI NHẤT (lan_nop lớn nhất) của kỳ trước: tờ khai bổ sung mới
        /// là số đang có hiệu lực.
        ///
        /// Đơn vị khai QUÝ lùi 3 tháng, khai tháng lùi 1 — truyền khaiQuy vào chứ
        /// không tự đoán, service này không được biết bảng Tenants.
        /// </remarks>
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

            using var conn = new SqlConnection(_resolver.GetBaseConnection());
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
                       ct42_nnt, ct43_nnt
                  FROM TOKHAI
                 WHERE ma_donvi = @ma AND nam = @nam AND thang = @thang
                   AND lan_nop = @lan AND not_use = 0";

            using var conn = new SqlConnection(_resolver.GetBaseConnection());
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
                Ct21 = D(10), Ct22 = D(11), Ct23 = D(12), Ct24 = D(13),
                Ct25 = D(14), Ct26 = D(15), Ct27 = D(16), Ct28 = D(17),
                Ct29 = D(18), Ct30 = D(19), Ct31 = D(20), Ct32 = D(21),
                Ct33 = D(22), Ct32a = D(23), Ct34 = D(24), Ct35 = D(25),
                Ct36 = D(26), Ct37 = D(27), Ct38 = D(28), Ct39 = D(29),
                Ct40a = D(30), Ct40b = D(31), Ct40 = D(32), Ct41 = D(33),
                Ct42 = D(34), Ct43 = D(35),
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

        // Đọc TOKHAI cho HAI kỳ trong một câu. Chỉ lấy bản nộp MỚI NHẤT của mỗi kỳ
        // (lan_nop lớn nhất): tờ khai bổ sung mới là số đang có hiệu lực, bản gốc giữ
        // lại để tra chứ không dùng để đối chiếu.
        //
        // Lấy CẢ NĂM nay và năm trước thay vì đúng hai kỳ cần dùng: mỗi đơn vị có nhịp
        // kỳ riêng (khai tháng lùi 1, khai quý lùi 3) nên "kỳ trước" của 18 đơn vị rơi
        // vào nhiều tháng khác nhau — liệt kê từng cặp thì câu WHERE phình theo số đơn
        // vị. Cả năm cũng chỉ 12 dòng một đơn vị, đọc một lượt rẻ hơn hẳn.
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
            using var conn = new SqlConnection(_resolver.GetBaseConnection());
            await conn.OpenAsync(huy);
            using var cmd = new SqlCommand(sql, conn);
            cmd.Parameters.AddWithValue("@nam", nam);
            cmd.Parameters.AddWithValue("@namTruoc", nam - 1);

            using var r = await cmd.ExecuteReaderAsync(huy);
            while (await r.ReadAsync(huy))
            {
                var ma = r.GetString(0);
                // thang có thể NULL với dữ liệu nạp thiếu — bỏ qua dòng đó thay vì nổ,
                // vì không biết nó thuộc kỳ nào để đối chiếu.
                if (r.IsDBNull(2)) continue;
                var k = Khoa(ma, r.GetInt32(1), r.GetInt32(2));
                kq[k] = new ToKhaiKy
                {
                    Ct22 = r.IsDBNull(3) ? null : r.GetDecimal(3),
                    Ct43 = r.IsDBNull(4) ? null : r.GetDecimal(4),
                    // Tồn XML = ct43 đọc từ file CỔNG TRẢ VỀ sau khi nộp (nạp qua màn
                    // "BC tờ khai XML"). Chưa nạp file thì cột này NULL — cột Lệch
                    // cũng null theo, nghĩa là "chưa đối chiếu được", khác hẳn
                    // "đã đối chiếu và khớp" (Lệch = 0).
                    Ct43Xml = r.IsDBNull(5) ? null : r.GetDecimal(5),
                    MaTk = r.IsDBNull(6) ? null : r.GetString(6),
                };
            }
            return kq;
        }

        /// <summary>
        /// Đọc ct43 từ FILE XML trong kho tờ khai, cho kỳ này và kỳ trước của mỗi đơn vị.
        /// </summary>
        /// <remarks>
        /// NGUỒN BÙ khi DB chưa có dòng TOKHAI. Kho \\Server-test đã có tờ khai của
        /// nhiều kỳ mà bảng TOKHAI chưa nạp tới, nên lưới trống dù số nằm sẵn trên đĩa.
        ///
        /// CHỈ ĐỌC, không ghi gì xuống DB — nạp ngược file vào TOKHAI là việc riêng,
        /// làm sau. Tầng gọi luôn ưu tiên số của DB, kho chỉ lấp chỗ trống.
        ///
        /// Đọc SONG SONG vì mỗi đơn vị là một lượt đi qua ổ mạng: 18 đơn vị × 2 kỳ mà
        /// tuần tự thì người dùng ngồi đợi tổng của 36 lượt cộng lại.
        ///
        /// Nuốt mọi lỗi I/O: ổ mạng rớt hay thư mục thiếu quyền chỉ làm mất phần BÙ,
        /// không được phép làm hỏng cả lưới — số của DB vẫn lên bình thường.
        /// </remarks>
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

        // Tìm file XML tờ khai của một kỳ trong kho. Cùng khuôn thư mục và cùng luật
        // lọc file với ToKhaiService.TimXmlToKhai — kho có lẫn bảng kê hóa đơn.
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

            // M<MM><yyyy> trong tên file là dấu hiệu chắc chắn nhất của kỳ.
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

        // Đếm hóa đơn vào/ra của MỌI đơn vị trong MỘT lần gọi SQL.
        //
        // ----- VÌ SAO GỘP MỘT CÂU (đo thật 14/08) -----
        // Bản đầu mở 16 kết nối, mỗi đơn vị một cái, chạy song song 8 luồng. Đo ra:
        //   16 kết nối riêng ............ 764 ms
        //   1 kết nối, UNION ALL ........ 152 ms   (nhanh gấp 5)
        // Trong khi CHÍNH câu đếm chỉ tốn 0–1 ms mỗi đơn vị. Nghĩa là gần như toàn bộ
        // thời gian là chi phí BẮT TAY MỞ KẾT NỐI (TCP + đăng nhập + đổi database),
        // không phải truy vấn. Tối ưu câu SQL hay thêm index đều không chạm tới phần
        // đó — chỉ bỏ bớt số lần mở kết nối mới ăn thua.
        //
        // Chạy được vì MỌI database đơn vị nằm CÙNG một SQL Server, nên tham chiếu
        // chéo <db>.dbo.HOA_DON hợp lệ. Ngày nào tách server thì phải quay lại lối mở
        // từng kết nối — khi đó Parallel.ForEachAsync trong lịch sử git vẫn dùng lại được.
        //
        // Đếm theo cột THANG (tháng kê khai) chứ không theo NGAY: hóa đơn ngày 28/6 về
        // muộn vẫn kê khai tháng 7 — cùng quy ước với RaSoatService (mục "sai kỳ").
        private async Task<Dictionary<string, DemHoaDon>> DemHoaDonMoiDonVi(
            IReadOnlyList<DonViKy> dsDonVi, int nam, int thang, CancellationToken huy)
        {
            var kq = new Dictionary<string, DemHoaDon>(StringComparer.OrdinalIgnoreCase);

            // Chỉ giữ đơn vị THẬT SỰ có bảng HOA_DON. Nhánh UNION ALL trỏ vào database
            // không tồn tại (chưa mở năm) hay thiếu bảng sẽ làm HỎNG CẢ CÂU — một đơn
            // vị lỗi là mất số của tất cả. Lọc trước bằng OBJECT_ID nên phần còn lại
            // chắc chắn chạy được.
            var duocDung = await LocDonViCoBang(dsDonVi, nam, huy);
            if (duocDung.Count == 0) return kq;

            // Mỗi đơn vị một nhánh, kèm tháng đầu kỳ RIÊNG của nó: khai tháng đếm 1
            // tháng, khai quý đếm 3 tháng — hai loại kỳ không thể dùng chung một mốc.
            var nhanh = new List<string>(duocDung.Count);
            var thamSo = new List<(string Ten, object Gia)>();
            for (int i = 0; i < duocDung.Count; i++)
            {
                var dv = duocDung[i];
                // Tên database KHÔNG tham số hóa được (SQL không cho tham số ở vị trí
                // tên đối tượng) nên phải nối chuỗi — an toàn vì BuildDbName đã ép mã
                // đơn vị qua BR-DB-01 (chỉ A-Z 0-9 _) và ném lỗi nếu sai. Bọc thêm
                // ngoặc vuông để tên hợp lệ trong mọi trường hợp.
                var db = _resolver.BuildDbName(dv.Ma, nam);
                var t1 = ThangDau(dv, thang);
                nhanh.Add($@"
                    SELECT @ma{i} AS ma_donvi, h.thang, h.huong, COUNT(*) AS sl
                      FROM [{db}].dbo.HOA_DON h
                     WHERE h.thang BETWEEN @t{i} AND @t{i} + @buoc{i}
                     GROUP BY h.thang, h.huong");
                thamSo.Add(($"@ma{i}", dv.Ma));
                thamSo.Add(($"@t{i}", t1));
                // Khai tháng chỉ lấy đúng 1 tháng (bước 0), khai quý lấy 3 (bước 2).
                // Trước đây luôn quét 3 tháng nên đơn vị khai tháng bị đếm lây sang
                // tháng sau — số V2/R2 hiện ra dù kỳ của họ không có hai tháng đó.
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
                if (t == moc)          { if (laVao) d.V1 = n; else d.R1 = n; }
                else if (t == moc + 1) { if (laVao) d.V2 = n; else d.R2 = n; }
                else if (t == moc + 2) { if (laVao) d.V3 = n; else d.R3 = n; }
            }
            return kq;
        }

        // Lọc ra đơn vị có database CỦA NĂM ĐÓ và có bảng HOA_DON trong đó.
        //
        // Gặp thật 14/08: 5 đơn vị chưa mở năm 2026, riêng HA_THAI_2026 có database mà
        // thiếu hẳn bảng HOA_DON. Cả hai đều là tình huống BÌNH THƯỜNG (chưa tới lượt
        // dựng sổ), không phải lỗi — nhưng nếu để lọt vào câu UNION ALL thì cả câu nổ
        // và lưới trắng sạch.
        //
        // OBJECT_ID('db.dbo.HOA_DON') trả NULL thay vì ném lỗi khi database không có,
        // nên hỏi được cả 16 đơn vị trong một lượt, không cần thử mở từng cái.
        private async Task<List<DonViKy>> LocDonViCoBang(
            IReadOnlyList<DonViKy> dsDonVi, int nam, CancellationToken huy)
        {
            var hopLe = new List<DonViKy>(dsDonVi.Count);
            var ve = new List<string>();
            var thamSo = new List<(string, object)>();

            for (int i = 0; i < dsDonVi.Count; i++)
            {
                string db;
                // Mã đơn vị sai BR-DB-01 thì BuildDbName ném — bỏ qua đơn vị đó thay
                // vì để hỏng cả lưới.
                try { db = _resolver.BuildDbName(dsDonVi[i].Ma, nam); }
                catch (ArgumentException) { continue; }

                hopLe.Add(dsDonVi[i]);
                ve.Add($"SELECT @m{i} AS ma, OBJECT_ID(@o{i}) AS id");
                thamSo.Add(($"@m{i}", dsDonVi[i].Ma));
                thamSo.Add(($"@o{i}", $"[{db}].dbo.HOA_DON"));
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


    // ======== ĐÁNH DẤU HÓA ĐƠN THAY THẾ / ĐIỀU CHỈNH KHÁC KỲ (BR-TK-20) ========
    //
    // Spec: docs/THUE/TOKHAI/SPEC-TO-KHAI-01-GTGT.md §10.4 trường hợp 2.
    //
    // ⚠ LỚP DUY NHẤT CÓ GHI trong file này — xem rào chắn ở đầu file. Nó chỉ đụng
    // đúng MỘT cột HOA_DON.ghi_chu và chỉ NỐI THÊM, không đè (luật 5). Không chạm
    // bất kỳ cột TIỀN hay ĐỊNH KHOẢN nào, nên số của tờ khai không thể bị nó làm sai.
    //
    // Hóa đơn thay thế/điều chỉnh mà GỐC thuộc kỳ khác thì engine KHÔNG kê vào kỳ này
    // (BR-TK-06b) — đúng như bản tờ khai thật của cổng. Nhưng "không kê" mà im lặng thì
    // kế toán không biết còn khoản nào treo; ghi chú lại để sau này truy được và kê bổ
    // sung kỳ gốc khi đã đủ dữ liệu.

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
            /// <summary>tthai_hd nguyên văn của cổng — để phân biệt ca gốc mồ côi.</summary>
            public string TrangThai { get; set; } = "";
            public string KhhdGoc { get; set; } = "";
            public string SoHdGoc { get; set; } = "";
            public DateTime? NgayGoc { get; set; }
            public int ThangGoc { get; set; }
            public int NamGoc { get; set; }
            public decimal TienHang { get; set; }
            public decimal TienVat { get; set; }
            public string GhiChuMoi { get; set; } = "";
            public bool DaCoGhiChu { get; set; }           // đã đánh dấu từ lượt trước
        }

        public sealed class KetQua
        {
            public int SoDonVi { get; set; }
            public int SoHoaDon { get; set; }
            public int SoDaGhi { get; set; }
            public int SoBoQua { get; set; }               // đã có ghi chú, không ghi lại
            public string? DuongDanFile { get; set; }
            public List<DongLienQuan> Dong { get; set; } = new();
            public List<string> Loi { get; set; } = new();
        }

        // tich_chat_hd_lienquan: '1' = thay thế, '2' = điều chỉnh (đo thật 15/08 trên
        // NHAT_TUAN, DAT_VIET_THANH, THAI_TUAN, HUY_THANH). Giá trị khác thì chưa gặp
        // nên để nguyên văn, KHÔNG đoán — ghi ra file cho người xem tự quyết.
        private static string TenLoai(string? tc) => tc switch
        {
            "1" => "Thay thế",
            "2" => "Điều chỉnh",
            _   => $"Liên quan (mã {tc})",
        };

        // Dấu hiệu ghi chú do CHÍNH hàm này sinh ra. Có nó thì lượt sau bỏ qua, nhờ
        // vậy bấm nhầm hai lần không nhân đôi ghi chú (spec §10.6).
        private const string DauHieu = "[TK-LQ]";

        private const string SqlTim = @"
            SELECT h.ma_hd, h.huong, ISNULL(h.khhd,''), ISNULL(h.so_hd,''), h.ngay,
                   ISNULL(h.ten_kh,''), ISNULL(h.tich_chat_hd_lienquan,''),
                   ISNULL(h.khhd_lienquan,''), ISNULL(h.sohd_lienquan,''),
                   h.ngay_lienquan,
                   CAST(ISNULL(l.tien_hang,0) AS DECIMAL(18,2)),
                   CAST(ISNULL(h.tien_vat,0)  AS DECIMAL(18,2)),
                   ISNULL(h.ghi_chu,''),
                   ISNULL(h.tthai_hd,'')
              FROM HOA_DON h
              OUTER APPLY (
                    SELECT SUM(CASE WHEN ISNULL(x.tinh_chat,'1') = '3' THEN 0
                                    ELSE ISNULL(x.so_luong,0) * ISNULL(x.don_gia,0)
                               END) AS tien_hang
                      FROM HOA_DON_LINE x WHERE x.ma_hd = h.ma_hd
              ) l
             WHERE h.thang = @thang
               AND (
                 -- ---- NHÓM 1: hóa đơn THAY THẾ/ĐIỀU CHỈNH, gốc thuộc kỳ KHÁC ----
                 -- Phải CÓ hóa đơn gốc thì mới có chuyện 'khác kỳ'. Cổng có mã liên
                 -- quan KHÔNG trỏ tới hóa đơn nào (đo thật 15/08: 8 hóa đơn THAI_TUAN
                 -- mã '5', tthai_hd = 'Hóa đơn mới', bán lẻ cho hộ kinh doanh/cá nhân,
                 -- cả ba cột khhd/sohd/ngay_lienquan đều trống). Chúng KHÔNG phải thay
                 -- thế/điều chỉnh, cổng vẫn kê đủ — không được đánh dấu oan.
                 (    ISNULL(h.tich_chat_hd_lienquan,'') <> ''
                  AND ISNULL(h.sohd_lienquan,'') <> ''
                  AND (
                        (h.ngay_lienquan IS NOT NULL
                         AND (MONTH(h.ngay_lienquan) <> @thang
                              OR YEAR(h.ngay_lienquan) <> @nam))
                        -- Có gốc mà THIẾU ngày: không biết gốc thuộc kỳ nào nên không
                        -- kết luận được. Vẫn NÊU RA để kế toán tự tra — im lặng bỏ qua
                        -- mới là bỏ sót. Dòng loại này ghi 'chưa rõ kỳ gốc', không bịa.
                        OR h.ngay_lienquan IS NULL
                      ))

                 -- ---- NHÓM 2: hóa đơn GỐC MỒ CÔI ----
                 -- LIÊN KẾT CHỈ CÓ MỘT CHIỀU: hóa đơn thay thế trỏ về gốc, nhưng hóa
                 -- đơn GỐC không có cột nào trỏ ngược lại — nó chỉ biết mình 'đã bị
                 -- thay thế' qua tthai_hd. Bình thường dò ngược được bằng cách tìm ai
                 -- trỏ tới nó, nhưng bản thay thế có thể nằm ở KỲ KHÁC hoặc CHƯA NẠP,
                 -- lúc đó hóa đơn gốc thành MỒ CÔI.
                 --
                 -- Đo thật 15/08: 9 hóa đơn mồ côi trên 4 đơn vị, tổng VAT > 30 triệu
                 -- (HUY_THANH HĐ 1297 riêng nó đã 20,6 triệu). Engine vẫn tính ĐÚNG số
                 -- nhờ BR-TK-06c lọc theo tthai_hd, nhưng kế toán KHÔNG THẤY chúng —
                 -- mà đây đúng là loại cần nhìn: bản thay thế nằm ở kỳ nào, đã kê chưa.
                 OR (    ISNULL(h.tthai_hd,'') LIKE N'%đã bị%'
                     AND NOT EXISTS (
                           SELECT 1 FROM HOA_DON tt
                            WHERE tt.thang = h.thang
                              AND ISNULL(tt.sohd_lienquan,'') = h.so_hd))
               )
             ORDER BY h.huong, h.so_hd";

        /// <summary>
        /// Quét MỘT đơn vị-kỳ, ghi chú vào HOA_DON.ghi_chu cho hóa đơn liên quan khác kỳ.
        /// </summary>
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

                    // Đủ BỐN thông tin bắt buộc của spec §10.4: loại xử lý, trỏ tới HĐ
                    // nào, kỳ của hóa đơn gốc, và trạng thái đã kê khai lại chưa.
                    //
                    // BA DẠNG CÂU khác nhau — mỗi dạng nói ĐÚNG cái mình biết, không
                    // bịa phần không biết:
                    if (string.IsNullOrWhiteSpace(d.SoHdGoc))
                    {
                        // Nhóm 2 — GỐC MỒ CÔI: chính nó bị thay thế/điều chỉnh, nhưng
                        // không có bản nào trong kỳ trỏ tới. Bản kia ở kỳ khác hoặc
                        // chưa nạp. Không biết số hóa đơn thay thế nên KHÔNG ghi bừa.
                        d.LoaiXuLy = "Gốc mồ côi";
                        d.GhiChuMoi =
                            $"{DauHieu} Hóa đơn này ĐÃ BỊ thay thế/điều chỉnh "
                          + $"(trạng thái cổng: {tthai}) nhưng KHÔNG tìm thấy hóa đơn "
                          + $"thay thế trong kỳ {thang:00}/{nam} — bản thay thế có thể "
                          + "ở kỳ khác hoặc chưa nạp về sổ. Cần tra lại";
                    }
                    else if (ngayGoc == null)
                    {
                        // Có gốc nhưng thiếu ngày ⇒ không suy được kỳ gốc.
                        d.GhiChuMoi =
                            $"{DauHieu} {loai} cho HĐ {d.KhhdGoc}/{d.SoHdGoc} "
                          + "— CHƯA RÕ KỲ GỐC (sổ không có ngày hóa đơn gốc), "
                          + $"xử lý tại kỳ {thang:00}/{nam} — Chưa kê khai lại";
                    }
                    else
                    {
                        d.GhiChuMoi =
                            $"{DauHieu} {loai} cho HĐ {d.KhhdGoc}/{d.SoHdGoc} "
                          + $"ngày {ngayGoc:dd/MM/yyyy} — khác kỳ (gốc thuộc kỳ "
                          + $"{d.ThangGoc:00}/{d.NamGoc}, xử lý tại kỳ {thang:00}/{nam}) "
                          + "— Chưa kê khai lại";
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

            // ---------- GHI: NỐI THÊM, không đè (luật 5 + spec §10.6) ----------
            // Gói transaction: nửa chừng đứt thì không để lại một mớ ghi chú dở dang.
            using var tran = conn.BeginTransaction();
            try
            {
                foreach (var (ma, cu, moi) in maHd)
                {
                    huy.ThrowIfCancellationRequested();

                    // Cột ghi_chu rộng 1000. Nối mà tràn thì SQL cắt cụt ÂM THẦM, mất
                    // cả phần cũ lẫn phần mới — nên phải tự kiểm trước khi ghi.
                    var gop = string.IsNullOrWhiteSpace(cu) ? moi : $"{cu} | {moi}";
                    if (gop.Length > 1000)
                    {
                        kq.Loi.Add($"{ma}: ghi chú cũ quá dài ({cu.Length} ký tự), "
                                 + "nối thêm sẽ vượt 1000 — BỎ QUA để không mất nội dung cũ");
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

        /// <summary>
        /// Quét NHIỀU đơn vị rồi xuất MỘT file .txt tổng hợp ra Paths:JobsRoot.
        /// </summary>
        /// <remarks>
        /// Một đơn vị hỏng (chưa mở sổ năm đó, thiếu bảng…) thì ghi vào phần Lỗi rồi
        /// chạy tiếp — dừng cả mẻ vì một đơn vị là phải chạy lại từ đầu.
        /// </remarks>
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

        /// <summary>
        /// Ghi file tổng hợp .txt ra Paths:JobsRoot. Trả về đường dẫn đã ghi.
        /// </summary>
        /// <remarks>
        /// UTF-8 CÓ BOM: Notepad của Windows đọc file không BOM thành mojibake với
        /// tiếng Việt. File này sinh ra để người ta mở bằng Notepad mà đọc.
        ///
        /// Tên file kèm kỳ, KHÔNG kèm giờ: chạy lại cùng một kỳ thì ĐÈ chính nó, thay
        /// vì rải ra chục file gần giống nhau không biết cái nào mới.
        /// </remarks>
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
                        // Không có số hóa đơn gốc để in — in ra là bịa. Nói thẳng cái
                        // phải làm thay vì để trống một dòng vô nghĩa.
                        sb.AppendLine( "      HĐ gốc    : KHÔNG tìm thấy bản thay thế trong kỳ này");
                        sb.AppendLine($"      Tiền hàng : {d.TienHang,20:N0}");
                        sb.AppendLine($"      Tiền VAT  : {d.TienVat,20:N0}");
                        sb.AppendLine( "      CẦN LÀM   : tra xem bản thay thế/điều chỉnh nằm ở kỳ nào, "
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
                        sb.AppendLine( "      CẦN LÀM   : kê khai lại kỳ gốc khi đã đủ dữ liệu");
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
