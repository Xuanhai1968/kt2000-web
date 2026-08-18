using ClosedXML.Excel;

namespace KT2000.Api.Services
{
    /// <summary>
    /// Đọc thuế GTGT hàng NHẬP KHẨU từ kho tờ khai hải quan (Excel) để điền chỉ tiêu
    /// [23a]/[24a] của mẫu 01/GTGT.
    ///
    /// VÌ SAO PHẢI ĐỌC RIÊNG: thuế khâu nhập khẩu KHÔNG nằm trong bảng kê hóa đơn điện
    /// tử của cổng TCT — nó phát sinh ở tờ khai hải quan. Lập tờ khai chỉ từ bảng kê thì
    /// [23a]/[24a] luôn bằng 0, kéo theo [23]/[24]/[25] hụt, [36] sai, [41]/[43] sai và
    /// cộng dồn sang kỳ sau (đối soát 18/08: USA_MEVA T7/2026 lệch 490 triệu).
    ///
    /// KHO: {ScanDocRoot1}\{MÃ}\NAM{năm}\TK_HAI_QUAN\TKHQ_T{tháng}_{năm}\*.xlsx
    /// Mỗi tờ khai hải quan một file, một kỳ nhiều file nên phải CỘNG lại.
    ///
    /// KHÔNG lưu vào database: số này chỉ để điền vào hai ô của tờ khai, mà tờ khai lưu
    /// xong đã có ct23a_nnt/ct24a_nnt (xem 022_base_tokhai.sql PHẦN 4). Dựng thêm bảng
    /// chi tiết chỉ có nghĩa khi cần tra cứu từng tờ khai hải quan — chưa có nhu cầu đó.
    /// </summary>
    public class ToKhaiHaiQuanService
    {
        private readonly IConfiguration _config;

        public ToKhaiHaiQuanService(IConfiguration config) => _config = config;

        /// <summary>Một dòng thuế GTGT đọc được trong một tờ khai hải quan.</summary>
        public sealed class DongThueHq
        {
            public string SoToKhai { get; set; } = "";
            public string? NgayDangKy { get; set; }
            public decimal TriGia { get; set; }      // trị giá tính thuế
            public string? ThueSuat { get; set; }    // giữ nguyên chuỗi "8%"/"10%" như file
            public decimal TienThue { get; set; }
            public string File { get; set; } = "";
            public int Thang { get; set; }           // tháng của THƯ MỤC chứa file
        }

        public sealed class KetQuaHaiQuan
        {
            public string MaDonVi { get; set; } = "";
            public int Nam { get; set; }
            public int Thang { get; set; }
            public string? ThuMuc { get; set; }
            public bool CoThuMuc { get; set; }
            public int SoFile { get; set; }
            public int SoToKhai { get; set; }
            public decimal TongTriGia { get; set; }   // gợi ý cho [23a]
            public decimal TongTienThue { get; set; } // gợi ý cho [24a]
            public List<DongThueHq> Dong { get; set; } = new();
            public List<string> CanhBao { get; set; } = new();
        }

        public static string DuongDanHaiQuan(string goc, string code, int nam)
            => Path.Combine(goc, code, $"NAM{nam}", "TK_HAI_QUAN");

        /// <summary>Thư mục kỳ; null nếu chưa khai ScanDocRoot1 hoặc mã đơn vị sai.</summary>
        public string? ThuMucKy(string maDonVi, int nam, int thang)
        {
            var goc = _config["Paths:ScanDocRoot1"];
            if (string.IsNullOrWhiteSpace(goc)) return null;
            if (!TenantDbResolver.IsValidCode(maDonVi)) return null;
            return Path.Combine(DuongDanHaiQuan(goc, maDonVi, nam), $"TKHQ_T{thang}_{nam}");
        }

        /// <summary>
        /// Đọc và tổng hợp một kỳ.
        ///
        /// BỐN CẠM BẪY CỦA DỮ LIỆU THẬT (quét 7 tháng USA_MEVA 18/08) — đừng cộng mù:
        ///  1. MỘT TỜ KHAI NẰM Ở HAI THÁNG. 108175662600 và 108180515220 có ở cả T4 lẫn
        ///     T5; 108300109040 ở cả T5 lẫn T6. Cộng cả hai nơi là tính hai lần (T5 phồng
        ///     khoảng 4,8 tỷ). Nên dedup theo SỐ TỜ KHAI, kỳ nào giữ thì xem tham số
        ///     soDaDungKyTruoc.
        ///  2. CÙNG TỜ KHAI, HAI TÊN FILE. T3 có "...603760 usa.xlsx" và "...603760.xlsx".
        ///     Dedup theo số tờ khai xử lý luôn.
        ///  3. MỘT FILE NHIỀU DÒNG THUẾ, KHÁC THUẾ SUẤT. T3 file 108091603760 có 3 dòng
        ///     8% / 10% / 8%. Nên quét MỌI khối "Thuế GTGT", không cứng hóa 8%.
        ///  4. FILE KHUNG TRỐNG. Hai file T1 không có số tờ khai, không dòng thuế nào nên
        ///     bỏ qua (có ghi cảnh báo), KHÔNG coi là lỗi.
        /// </summary>
        /// <param name="soDaDungKyTruoc">
        /// Số tờ khai đã tính ở các kỳ TRƯỚC trong cùng năm. Tờ khai nằm trong tập này bị
        /// loại khỏi kỳ đang xét — giữ ở thư mục tháng SỚM hơn, vì tờ khai hải quan khai
        /// thuế ở kỳ phát sinh.
        /// </param>
        public KetQuaHaiQuan DocKy(string maDonVi, int nam, int thang,
                                   ISet<string>? soDaDungKyTruoc = null)
        {
            var kq = new KetQuaHaiQuan { MaDonVi = maDonVi, Nam = nam, Thang = thang };
            var thuMuc = ThuMucKy(maDonVi, nam, thang);
            kq.ThuMuc = thuMuc;

            if (thuMuc == null)
            {
                kq.CanhBao.Add("Chưa khai Paths:ScanDocRoot1 hoặc mã đơn vị không hợp lệ");
                return kq;
            }
            if (!Directory.Exists(thuMuc))
            {
                kq.CanhBao.Add($"Không có thư mục tờ khai hải quan kỳ {thang:00}/{nam}");
                return kq;
            }

            kq.CoThuMuc = true;

            // Bỏ file tạm của Excel (~$...) — mở file đang khóa sẽ ném lỗi.
            var files = Directory.EnumerateFiles(thuMuc, "*.xlsx", SearchOption.TopDirectoryOnly)
                                 .Where(f => !Path.GetFileName(f).StartsWith("~$"))
                                 .OrderBy(f => f, StringComparer.OrdinalIgnoreCase)
                                 .ToList();
            kq.SoFile = files.Count;

            // Gom theo số tờ khai: mỗi số chỉ tính MỘT lần dù nằm ở mấy file.
            var theoSo = new Dictionary<string, List<DongThueHq>>(StringComparer.OrdinalIgnoreCase);

            foreach (var f in files)
            {
                var ten = Path.GetFileName(f);
                List<DongThueHq> dong;
                string? soTk, ngay;
                decimal thueVfp;
                try
                {
                    dong = DocMotFile(f, out soTk, out ngay, out thueVfp);
                }
                catch (Exception ex)
                {
                    kq.CanhBao.Add($"{ten}: không đọc được — {ex.Message}");
                    continue;
                }

                if (string.IsNullOrWhiteSpace(soTk))
                {
                    kq.CanhBao.Add($"{ten}: không có số tờ khai (khung trống) — bỏ qua");
                    continue;
                }
                if (dong.Count == 0)
                {
                    kq.CanhBao.Add($"{ten}: tờ khai {soTk} không có dòng thuế GTGT — bỏ qua");
                    continue;
                }

                // Đối chiếu chéo hai khối của cùng tờ khai: khối "Thuế và thu khác" chi
                // tiết (cách chính) với khối "Tên sắc thuế" tổng hợp (cách bản VFP đọc).
                // Bằng nhau là bình thường; lệch nghĩa là file lạ khuôn — phải báo để kế
                // toán mở ra xem, KHÔNG im lặng lấy một bên.
                var thueChiTiet = dong.Sum(x => x.TienThue);
                if (Math.Abs(thueChiTiet - thueVfp) > 1m)
                    kq.CanhBao.Add(
                        $"{ten}: tờ khai {soTk} — thuế đọc từ khối chi tiết "
                      + $"({thueChiTiet:N0}đ) lệch khối tổng \"Tên sắc thuế\" "
                      + $"({thueVfp:N0}đ). Lấy theo khối chi tiết, cần kiểm tra tay.");

                foreach (var d in dong)
                {
                    d.SoToKhai = soTk!;
                    d.NgayDangKy = ngay;
                    d.File = ten;
                    d.Thang = thang;
                }

                if (theoSo.TryGetValue(soTk!, out var daCo))
                {
                    // Cùng số tờ khai ở file thứ hai: chỉ báo, không cộng thêm.
                    if (daCo.Sum(x => x.TienThue) != dong.Sum(x => x.TienThue))
                        kq.CanhBao.Add(
                            $"{ten}: tờ khai {soTk} trùng với file khác trong kỳ nhưng SỐ TIỀN "
                          + $"KHÁC ({dong.Sum(x => x.TienThue):N0} vs {daCo.Sum(x => x.TienThue):N0})"
                          + " — lấy file đọc trước, cần kiểm tra tay");
                    else
                        kq.CanhBao.Add($"{ten}: trùng tờ khai {soTk} với file khác — chỉ tính một lần");
                    continue;
                }

                theoSo[soTk!] = dong;
            }

            // Loại tờ khai đã tính ở kỳ trước (giữ ở tháng sớm hơn).
            if (soDaDungKyTruoc is { Count: > 0 })
            {
                foreach (var so in theoSo.Keys.Where(soDaDungKyTruoc.Contains).ToList())
                {
                    kq.CanhBao.Add(
                        $"Tờ khai {so} đã tính ở kỳ trước trong năm — không tính lại ở kỳ này");
                    theoSo.Remove(so);
                }
            }

            kq.Dong = theoSo.Values.SelectMany(x => x)
                            .OrderBy(x => x.SoToKhai, StringComparer.Ordinal).ToList();
            kq.SoToKhai = theoSo.Count;
            kq.TongTriGia = kq.Dong.Sum(x => x.TriGia);
            kq.TongTienThue = kq.Dong.Sum(x => x.TienThue);
            return kq;
        }

        /// <summary>Số tờ khai đã dùng ở các kỳ TRƯỚC tháng denThang (cùng năm).</summary>
        public HashSet<string> SoToKhaiTruocKy(string maDonVi, int nam, int denThang)
        {
            var da = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            for (int t = 1; t < denThang; t++)
            {
                var d = ThuMucKy(maDonVi, nam, t);
                if (d == null || !Directory.Exists(d)) continue;
                foreach (var f in Directory.EnumerateFiles(d, "*.xlsx", SearchOption.TopDirectoryOnly))
                {
                    if (Path.GetFileName(f).StartsWith("~$")) continue;
                    try
                    {
                        DocMotFile(f, out var so, out _, out _);
                        if (!string.IsNullOrWhiteSpace(so)) da.Add(so!);
                    }
                    catch { /* kỳ trước hỏng file thì thôi, không chặn kỳ đang lập */ }
                }
            }
            return da;
        }

        // ---------- đọc một file ----------

        // Ô neo trên sheet TKN (khuôn ToKhaiHQ7N_*.xlsx, ổn định cả 7 tháng đã quét).
        private const string O_SO_TO_KHAI = "E4";
        private const string O_NGAY_DANG_KY = "G8";

        /// <summary>
        /// Quét MỌI khối "Thuế GTGT" ở phần "Thuế và thu khác" của sheet TKN.
        ///
        /// Khuôn khối (nhãn nằm cột H, số nằm cột I của 3 dòng kế tiếp):
        ///     H{r}   = "Thuế GTGT"
        ///     I{r+1} = trị giá tính thuế
        ///     I{r+2} = thuế suất   ("8%" / "10%")
        ///     I{r+3} = số tiền thuế
        /// Neo theo NHÃN chứ không theo số dòng cứng vì khối này lặp nhiều lần trong file.
        /// </summary>
        private static List<DongThueHq> DocMotFile(string duongDan,
                                                   out string? soToKhai, out string? ngay,
                                                   out decimal thueKieuVfp)
        {
            var ds = new List<DongThueHq>();
            soToKhai = null; ngay = null; thueKieuVfp = 0m;

            using var wb = new XLWorkbook(duongDan);
            var ws = wb.Worksheets.FirstOrDefault(w =>
                         string.Equals(w.Name, "TKN", StringComparison.OrdinalIgnoreCase))
                     ?? wb.Worksheets.First();

            soToKhai = Chuoi(ws, O_SO_TO_KHAI);
            ngay = Chuoi(ws, O_NGAY_DANG_KY);

            var vung = ws.RangeUsed();
            if (vung == null) return ds;
            int cuoi = vung.LastRow().RowNumber();

            // Đọc thêm theo lối bản VFP để đối chiếu chéo — xem TongThueKieuVfp.
            thueKieuVfp = TongThueKieuVfp(ws, cuoi);

            for (int r = 1; r + 3 <= cuoi; r++)
            {
                var nhan = Chuoi(ws, $"H{r}");
                if (!string.Equals(nhan, "Thuế GTGT", StringComparison.OrdinalIgnoreCase))
                    continue;

                var triGia = So(ws, $"I{r + 1}");
                var ts = Chuoi(ws, $"I{r + 2}");
                var tien = So(ws, $"I{r + 3}");

                // Dòng chỉ có nhãn mà không có tiền = khối trống của khuôn in.
                if (triGia == 0 && tien == 0) continue;

                ds.Add(new DongThueHq { TriGia = triGia, ThueSuat = ts, TienThue = tien });
            }

            return ds;
        }

        /// <summary>
        /// Tổng tiền thuế GTGT theo lối bản VFP: tìm nhãn "V  Thuế GTGT" ở cột D (khối
        /// "Tên sắc thuế" tổng hợp đầu tờ khai) rồi lấy số ở cột H cùng dòng.
        ///
        /// Dùng để ĐỐI CHIẾU CHÉO với DocMotFile — cách kia đọc khối "Thuế và thu khác"
        /// chi tiết từng dòng hàng ở cuối tờ khai. Hai khối là hai chỗ khác nhau của
        /// cùng một tờ khai nên phải bằng nhau; lệch tức là file lạ khuôn, phải báo chứ
        /// không im lặng lấy một bên.
        ///
        /// Đo 18/08 trên 26 file (7 tháng USA_MEVA): tiền thuế hai cách KHỚP TUYỆT ĐỐI,
        /// tổng 4.572.647.903đ cả hai. Giữ cách chi tiết làm chính vì nó tách được từng
        /// dòng thuế suất (8% / 10%), còn khối tổng chỉ có một con số gộp.
        /// </summary>
        private static decimal TongThueKieuVfp(IXLWorksheet ws, int cuoiDong)
        {
            decimal tong = 0m;
            for (int r = 1; r <= cuoiDong; r++)
            {
                var nhan = Chuoi(ws, $"D{r}");
                if (nhan == null) continue;
                // Khuôn cổng ghi "V  Thuế GTGT" (hai dấu cách) — so lỏng phòng khi
                // bản khác đổi khoảng trắng.
                var gon = nhan.Replace(" ", "");
                if (gon.StartsWith("VThuếGTGT", StringComparison.OrdinalIgnoreCase))
                    tong += So(ws, $"H{r}");
            }
            return tong;
        }

        /// <summary>
        /// Tổng trị giá tính thuế theo lối VFP: nhãn "Tổng trị giá tính thuế" ở cột C,
        /// số nằm ở cột J cùng dòng.
        ///
        /// CHÚ Ý — vì sao KHÔNG lấy số này làm trị giá chính: ô J46 là trị giá của CẢ tờ
        /// khai, có cả khi tờ khai chưa phát sinh thuế. Hai file T1/2026 (USAMEVA-260106,
        /// -260107) là tờ khai CHƯA HOÀN TẤT — không số tờ khai, không ngày, khối thuế
        /// rỗng — nhưng J46 vẫn ghi 2.765.434.000. Lấy theo J46 thì hai file đó cộng vào
        /// 5,53 tỷ trị giá mà không có đồng thuế nào, sai hẳn ý nghĩa [23a].
        /// [23a] phải là trị giá của phần hàng CÓ tính thuế ở [24a].
        /// </summary>
        private static decimal TongTriGiaKieuVfp(IXLWorksheet ws, int cuoiDong)
        {
            decimal tong = 0m;
            for (int r = 1; r <= cuoiDong; r++)
            {
                var nhan = Chuoi(ws, $"C{r}");
                if (string.Equals(nhan, "Tổng trị giá tính thuế",
                                  StringComparison.OrdinalIgnoreCase))
                    tong += So(ws, $"J{r}");
            }
            return tong;
        }

        private static string? Chuoi(IXLWorksheet ws, string o)
        {
            var v = ws.Cell(o).GetFormattedString()?.Trim();
            return string.IsNullOrWhiteSpace(v) ? null : v;
        }

        /// <summary>
        /// Số trong file ghi kiểu Việt: "2.189.880.000" — dấu chấm là NGĂN NGHÌN, không
        /// phải thập phân. Ô có thể là số thật (ClosedXML trả number) hoặc chuỗi đã định
        /// dạng, nên thử số trước rồi mới bóc chuỗi.
        /// </summary>
        private static decimal So(IXLWorksheet ws, string o)
        {
            var c = ws.Cell(o);
            if (c.DataType == XLDataType.Number) return (decimal)c.GetDouble();

            var s = c.GetFormattedString()?.Trim();
            if (string.IsNullOrWhiteSpace(s) || s == "-") return 0m;

            s = s.Replace(".", "").Replace(",", ".").Replace(" ", "");
            return decimal.TryParse(s, System.Globalization.NumberStyles.Any,
                                    System.Globalization.CultureInfo.InvariantCulture,
                                    out var d) ? d : 0m;
        }
    }
}
