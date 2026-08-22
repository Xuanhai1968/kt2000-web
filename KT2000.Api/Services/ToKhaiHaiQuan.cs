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

        /// <summary>
        /// Hồ sơ MỘT tờ khai hải quan — các trường bản VFP đọc ra để dựng hóa đơn.
        ///
        /// Bản VFP (docs/THUE/TOKHAI/TOKHAIHAIQUAN.md) đi tuần tự theo nhãn ở cột C/D rồi
        /// bắt 16 CASE. C# trước đây chỉ lấy 4 thứ (số tờ khai, ngày, trị giá, thuế GTGT)
        /// vì chỉ cần điền [23a]/[24a]. Đọc thêm phần còn lại để ĐỐI CHIẾU và cảnh báo —
        /// vẫn không tự ghi vào sổ, cùng luật với phần thuế: kế toán tự quyết.
        /// </summary>
        public sealed class HoSoToKhai
        {
            /// <summary>Số tờ khai ĐẦY ĐỦ 12 chữ số (ô E4) — dùng làm khóa dedup.</summary>
            public string? SoToKhai { get; set; }

            /// <summary>
            /// Số rút gọn 6 chữ số kiểu VFP: LEFT(số, LEN−5) rồi RIGHT(6). Dùng dựng nhãn
            /// KHHD "TKHQ######" như bản cũ.
            ///
            /// KHÔNG dùng làm khóa dedup: quét 26 tờ khai thật thấy 108175662600 và
            /// 108175686401 rút gọn ra CÙNG "081756" — hai tờ khai của HAI đơn vị khác
            /// nhau. Dedup theo số này là mất một tờ khai.
            /// </summary>
            public string? SoNgan { get; set; }

            /// <summary>Nhãn ký hiệu hóa đơn kiểu VFP: "TKHQ" + SoNgan.</summary>
            public string? Khhd { get; set; }

            public string? NgayDangKy { get; set; }
            public string? MstNhapKhau { get; set; }
            public string? TenNhapKhau { get; set; }
            public string? TenXuatKhau { get; set; }
            public string? DiaChiXuatKhau { get; set; }

            /// <summary>Ô "Tổng trị giá tính thuế" (COL_10 dòng nhãn) — VFP đưa vào HĐ 156.</summary>
            public decimal TongTriGiaTinhThue { get; set; }

            /// <summary>Thuế GTGT hàng nhập khẩu (khối "Tên sắc thuế", VFP: TK 33312).</summary>
            public decimal ThueGtgt { get; set; }

            /// <summary>Thuế nhập khẩu (VFP: TK 3333). 0 nếu tờ khai không có.</summary>
            public decimal ThueNhapKhau { get; set; }

            /// <summary>
            /// % VAT suy ngược theo công thức VFP:
            ///     lnVAT_P = thuế GTGT / (thuế NK + tổng trị giá tính thuế) × 100
            /// Null khi mẫu số bằng 0.
            /// </summary>
            public decimal? PhanTramVat { get; set; }
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

            /// <summary>
            /// Hồ sơ từng tờ khai được tính vào kỳ (khóa = số tờ khai đầy đủ). Mang MST,
            /// tên hai bên, thuế nhập khẩu, %VAT suy ngược — phần bản VFP đọc để dựng
            /// hóa đơn. Ở đây chỉ để tra cứu/đối chiếu, KHÔNG tự ghi vào sổ.
            /// </summary>
            public List<HoSoToKhai> HoSo { get; set; } = new();

            /// <summary>Mã hóa đơn dòng tổng nếu kỳ này được ghi vào sổ.</summary>
            public string? MaHdTrongSo { get; set; }

            /// <summary>Cờ HaiQuan:GhiVaoSo — frontend ẩn/hiện nút "Ghi vào sổ".</summary>
            public bool ChoGhiVaoSo { get; set; }
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
        /// <param name="mstDonVi">
        /// MST của đơn vị đang lập tờ khai. Có truyền thì file nào ghi MST người nhập
        /// khẩu KHÁC sẽ bị loại (chốt chặn bản VFP có, bản C# cũ thiếu). Bỏ trống =
        /// không kiểm, giữ nguyên hành vi cũ cho chỗ gọi chưa có MST trong tay.
        /// </param>
        public KetQuaHaiQuan DocKy(string maDonVi, int nam, int thang,
                                   ISet<string>? soDaDungKyTruoc = null,
                                   string? mstDonVi = null)
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
            // Hồ sơ từng tờ khai (MST, tên hai bên, thuế NK, %VAT) — để đối chiếu.
            var hoSo = new Dictionary<string, HoSoToKhai>(StringComparer.OrdinalIgnoreCase);

            foreach (var f in files)
            {
                var ten = Path.GetFileName(f);
                List<DongThueHq> dong;
                string? soTk, ngay;
                decimal thueVfp;
                HoSoToKhai hs;
                try
                {
                    dong = DocMotFile(f, out soTk, out ngay, out thueVfp, out hs);
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

                // MST NGƯỜI NHẬP KHẨU phải là của đơn vị đang lập tờ khai — chốt chặn
                // bản VFP có ("Tờ khai HQ không phải của đơn vị ...") mà bản C# thiếu.
                // File lạc thư mục mà vẫn cộng vào [24a] thì tờ khai sai, không ai biết.
                //
                // So theo GỐC MST (bỏ đuôi -001 chi nhánh) như RaSoatService.GocMst.
                if (!string.IsNullOrWhiteSpace(mstDonVi)
                    && !string.IsNullOrWhiteSpace(hs.MstNhapKhau)
                    && !string.Equals(RaSoatService.GocMst(hs.MstNhapKhau),
                                      RaSoatService.GocMst(mstDonVi),
                                      StringComparison.OrdinalIgnoreCase))
                {
                    kq.CanhBao.Add(
                        $"{ten}: tờ khai {soTk} có MST người nhập khẩu {hs.MstNhapKhau} "
                      + $"KHÔNG PHẢI của đơn vị {maDonVi} (MST {mstDonVi}) — BỎ QUA, "
                      + "kiểm tra xem file có để nhầm thư mục không");
                    continue;
                }

                if (dong.Count == 0)
                {
                    kq.CanhBao.Add($"{ten}: tờ khai {soTk} không có dòng thuế GTGT — bỏ qua");
                    continue;
                }


                if (hs.ThueNhapKhau != 0)
                    kq.CanhBao.Add(
                        $"{ten}: tờ khai {soTk} có THUẾ NHẬP KHẨU {hs.ThueNhapKhau:N0}đ — "
                      + "khoản này KHÔNG vào [23a]/[24a] của tờ khai GTGT, phải hạch toán "
                      + "riêng (Nợ 156 / Có 3333)");

                hoSo[soTk!] = hs;

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
                    hoSo.Remove(so);
                }
            }

            kq.Dong = theoSo.Values.SelectMany(x => x)
                            .OrderBy(x => x.SoToKhai, StringComparer.Ordinal).ToList();
            kq.SoToKhai = theoSo.Count;
            kq.TongTriGia = kq.Dong.Sum(x => x.TriGia);
            kq.TongTienThue = kq.Dong.Sum(x => x.TienThue);
            kq.HoSo = hoSo.Values.OrderBy(x => x.SoToKhai, StringComparer.Ordinal).ToList();

            // Đối chiếu kiểu bản VFP: khối "Tên sắc thuế" (tổng đầu tờ khai) phải khớp
            // tổng các dòng chi tiết ở cuối. Lệch = file lạ khuôn, phải báo.
            var thueHoSo = kq.HoSo.Sum(x => x.ThueGtgt);
            if (kq.HoSo.Count > 0 && Math.Abs(thueHoSo - kq.TongTienThue) > 1m)
                kq.CanhBao.Add(
                    $"Tổng thuế GTGT theo khối \"Tên sắc thuế\" ({thueHoSo:N0}đ) lệch với "
                  + $"tổng các dòng chi tiết ({kq.TongTienThue:N0}đ) — lấy theo dòng chi "
                  + "tiết, cần kiểm tra tay");

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
                        DocMotFile(f, out var so, out _, out _, out _);
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
        /// MST NGƯỜI NHẬP KHẨU — ô "Mã" ngay dưới nhãn "Người nhập khẩu".
        ///
        /// Bản VFP chặn ở đây ("Tờ khai HQ không phải của đơn vị ..."), bản C# trước đây
        /// KHÔNG đọc: file của đơn vị khác lạc vào thư mục là cộng thẳng vào [24a] mà
        /// không ai biết. Quét 32 file thật (USA_MEVA + HUY_THANH, 7 tháng) ô H10 đúng
        /// 32/32 nên neo cứng, nhưng vẫn dò theo nhãn nếu H10 trống (xem DocMst).
        /// </summary>
        private const string O_MST_NHAP_KHAU = "H10";

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
                                                   out decimal thueKieuVfp,
                                                   out HoSoToKhai hoSo)
        {
            var ds = new List<DongThueHq>();
            soToKhai = null; ngay = null; thueKieuVfp = 0m;
            hoSo = new HoSoToKhai();

            using var wb = new XLWorkbook(duongDan);
            var ws = wb.Worksheets.FirstOrDefault(w =>
                         string.Equals(w.Name, "TKN", StringComparison.OrdinalIgnoreCase))
                     ?? wb.Worksheets.First();

            var vung = ws.RangeUsed();
            if (vung == null) return ds;
            int cuoi = vung.LastRow().RowNumber();

            hoSo = DocHoSo(ws, cuoi);

            // Ô neo E4/G8 vẫn đúng trên mọi file đã quét; dò theo nhãn là đường chính,
            // ô neo chỉ đỡ khi khối đầu tờ khai thiếu nhãn.
            soToKhai = hoSo.SoToKhai ?? Chuoi(ws, O_SO_TO_KHAI);
            ngay = hoSo.NgayDangKy ?? Chuoi(ws, O_NGAY_DANG_KY);
            hoSo.SoToKhai ??= soToKhai;
            hoSo.NgayDangKy ??= ngay;
            hoSo.MstNhapKhau ??= Chuoi(ws, O_MST_NHAP_KHAU);

            // Sắc thuế trong khối tổng: GTGT (VFP: 33312) và thuế NK (VFP: 3333).
            foreach (var (ten, tien) in SacThue(ws, cuoi))
            {
                var gon = ten.Replace(" ", "");
                if (gon.StartsWith("VThuếGTGT", StringComparison.OrdinalIgnoreCase))
                    hoSo.ThueGtgt += tien;
                else if (gon.StartsWith("NThuếNK", StringComparison.OrdinalIgnoreCase))
                    hoSo.ThueNhapKhau += tien;
            }

            // Công thức bản VFP:
            //     lnVAT_P = INT(lnTienVAT_P / (lnTienThue3333 + lnTienHang_P)) * 100
            // INT() của VFP cắt về 0 với mọi tỷ lệ < 1 nên kết quả LUÔN bằng 0 — đó là
            // lỗi của bản cũ (đặt INT sai chỗ). Ý định rõ ràng là % thuế suất, nên tính
            // đúng: chia trước, nhân 100, rồi mới làm tròn.
            var mauSo = hoSo.ThueNhapKhau + hoSo.TongTriGiaTinhThue;
            if (mauSo != 0)
                hoSo.PhanTramVat = Math.Round(hoSo.ThueGtgt * 100m / mauSo, 2,
                                              MidpointRounding.AwayFromZero);

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

        /// <summary>
        /// Đọc hồ sơ tờ khai theo ĐÚNG LỐI BẢN VFP: dò NHÃN ở cột C/D rồi lấy ô dữ liệu
        /// trên cùng dòng (hoặc các dòng con ngay dưới), thay vì neo số dòng cứng.
        ///
        /// Ánh xạ nhãn → cột, đối chiếu từng dòng với bản VFP và kiểm trên 32 file thật:
        ///
        /// | CASE bản VFP           | Nhãn                          | Ô lấy số |
        /// |------------------------|-------------------------------|----------|
        /// | SO_TO_KHAI             | C = "Số tờ khai"              | E (COL_5)|
        /// | NGAY                   | C = "Ngày đăng ký"            | G (COL_7)|
        /// | NGUOI_NHAP_KHAU_MST    | C = "Người nhập khẩu" → D="Mã"| H (COL_8)|
        /// | NGUOI_NHAP_KHAU_TEN    | idem            → D="Tên"     | H        |
        /// | NGUOI_XUAT_KHAU_TEN    | C = "Người xuất khẩu"→ D="Tên"| H        |
        /// | NGUOI_XUAT_KHAU_DIA_CHI| idem       → D="Địa chỉ"      | H + U    |
        /// | TIEN_HANG              | C = "Tổng trị giá tính thuế"  | J (COL_10)|
        ///
        /// VÌ SAO DÒ NHÃN CHỨ KHÔNG NEO Ô: tờ khai in NHIỀU TRANG, mỗi trang lặp lại
        /// khối đầu. File T7 USA_MEVA có "Số tờ khai" ở cả dòng 4, 79 và 136. Neo ô thì
        /// đúng tình cờ ở trang 1; dò nhãn và lấy LẦN ĐẦU thì đúng theo thiết kế.
        /// </summary>
        private static HoSoToKhai DocHoSo(IXLWorksheet ws, int cuoiDong)
        {
            var hs = new HoSoToKhai();

            for (int r = 1; r <= cuoiDong; r++)
            {
                var c = Chuoi(ws, $"C{r}");
                if (c == null) continue;

                switch (c)
                {
                    case "Số tờ khai" when hs.SoToKhai == null:
                        hs.SoToKhai = Chuoi(ws, $"E{r}");
                        break;

                    case "Ngày đăng ký" when hs.NgayDangKy == null:
                        hs.NgayDangKy = Chuoi(ws, $"G{r}");
                        break;

                    case "Tổng trị giá tính thuế" when hs.TongTriGiaTinhThue == 0:
                        hs.TongTriGiaTinhThue = So(ws, $"J{r}");
                        break;

                    // Khối "Người nhập khẩu": các dòng con ngay dưới, cột C để TRỐNG,
                    // nhãn con nằm ở cột D. Bản VFP cũng đi kiểu này (DO WHILE + SKIP).
                    case "Người nhập khẩu" when hs.MstNhapKhau == null:
                        for (int k = r + 1; k <= Math.Min(r + 8, cuoiDong); k++)
                        {
                            if (Chuoi(ws, $"C{k}") != null) break;   // sang khối khác
                            var d = Chuoi(ws, $"D{k}");
                            if (d == "Mã") hs.MstNhapKhau ??= Chuoi(ws, $"H{k}");
                            else if (d == "Tên") hs.TenNhapKhau ??= Chuoi(ws, $"H{k}");
                        }
                        break;

                    case "Người xuất khẩu" when hs.TenXuatKhau == null:
                        for (int k = r + 1; k <= Math.Min(r + 8, cuoiDong); k++)
                        {
                            if (Chuoi(ws, $"C{k}") != null) break;
                            var d = Chuoi(ws, $"D{k}");
                            if (d == "Tên") hs.TenXuatKhau ??= Chuoi(ws, $"H{k}");
                            else if (d == "Địa chỉ")
                                // VFP ghép COL_8 + COL_21 rồi nối tiếp dòng dưới.
                                hs.DiaChiXuatKhau ??= string.Join(" ",
                                    new[] { Chuoi(ws, $"H{k}"), Chuoi(ws, $"U{k}") }
                                        .Where(x => x != null));
                        }
                        break;
                }
            }

            // Số rút gọn kiểu VFP: LEFT(số, LEN−5) rồi RIGHT(6).
            var so = hs.SoToKhai;
            if (!string.IsNullOrWhiteSpace(so) && so.Length > 5)
            {
                var cat = so[..^5];
                hs.SoNgan = cat.Length >= 6 ? cat[^6..] : cat;
                hs.Khhd = "TKHQ" + hs.SoNgan;
            }

            return hs;
        }

        /// <summary>
        /// Mọi dòng của khối "Tên sắc thuế" (nhãn cột D, tiền cột H).
        ///
        /// Bản VFP dò đúng hai nhãn con: "V  Thuế GTGT" → TK 33312 và "N  Thuế NK" →
        /// TK 3333. Trả cả danh sách để chỗ gọi tự phân loại, và để phát hiện sắc thuế
        /// LẠ (thuế TTĐB, BVMT…) mà báo ra thay vì im lặng bỏ.
        /// </summary>
        private static List<(string Ten, decimal Tien)> SacThue(
            IXLWorksheet ws, int cuoiDong)
        {
            var ds = new List<(string, decimal)>();
            for (int r = 1; r <= cuoiDong; r++)
            {
                var nhan = Chuoi(ws, $"D{r}");
                if (nhan == null) continue;
                if (!nhan.Contains("Thuế", StringComparison.OrdinalIgnoreCase)) continue;
                if (string.Equals(nhan, "Tên sắc thuế", StringComparison.OrdinalIgnoreCase))
                    continue;                                  // dòng tiêu đề của khối

                var tien = So(ws, $"H{r}");
                if (tien != 0) ds.Add((nhan, tien));
            }
            return ds;
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
