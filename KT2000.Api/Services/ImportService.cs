using ClosedXML.Excel;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using KT2000.Api.Data;
using KT2000.Api.Models;

namespace KT2000.Api.Services
{
    // v2 (31/07): chịu được thực địa Excel tổng —
    //  * ô ngày là CHUỖI ('2025-01-02' / '02/01/2025') → tự parse nhiều định dạng
    //  * sheet RA không có bộ cột chuẩn hóa → mọi phép đọc có FALLBACK sang bộ _G
    //  * đếm riêng "không đọc được ngày" khỏi "lệch năm" để chẩn bệnh nhanh
    // Một dòng lỗi nạp, có PHÂN LOẠI — nhờ LoaiLoi mà FRM_LAY_HDDT tách được
    // "lệch Σ line phải xử lý tay" khỏi các loại hỏng khác.
    public record LoiNap(string MaHd, string Huong, string LoaiLoi, string LyDo);

    // Kết quả của nút "Lấy giá trị từ tờ khai" — dựng lại bản gốc TCT từ Excel có sẵn.
    // Loi là danh sách tháng đọc không nổi, KHÔNG phải hóa đơn lỗi: một file hỏng thì
    // các tháng khác vẫn bù được, nên phải nói rõ hỏng ở tháng nào.
    public class KetQuaDungGoc
    {
        public int SoFile { get; set; }
        public int Them { get; set; }
        public int Sua { get; set; }
        public List<string> Loi { get; set; } = new();
    }

    // Một dòng hàng đọc thẳng từ XML gốc của TCT
    // TinhChat = TChat của TCT: 1 hàng hóa/dịch vụ, 2 khuyến mại, 3 CHIẾT KHẤU thương mại,
    // 4 ghi chú. Phải mang ra tận giao diện: dòng chiết khấu ghi ThTien DƯƠNG trong XML
    // nhưng bản chất là TRỪ. Cộng thẳng vào là lệch đúng 2 lần số chiết khấu
    // (ca thật: C26TLC/10 — CK 4.195.324, Σ line vượt master đúng 8.390.648).
    // ChietKhau = STCKhau, chiết khấu của RIÊNG dòng đó — khác TTCKTMai (chiết khấu
    // của cả hóa đơn, nằm ở HoaDonConLai.TienCk). Hai con số khác nhau, đừng gộp.
    public record MatHang(int Stt, string TenHang, string Dvt, decimal SoLuong,
                          decimal DonGia, decimal ThanhTien, string ThueSuat,
                          string TinhChat = "1", decimal ChietKhau = 0m);

    // Một hóa đơn còn nằm lại raw\ — dựng từ chính file XML chứ không từ Excel tổng,
    // vì file lạc (không có dòng master) thì trong Excel không có gì để đọc.
    public record HoaDonConLai(
        string TenFile, string Huong, int Thang, string MauSo, string KhHd, string SoHd,
        string Ngay, string MstBan, string TenBan, string MstMua, string TenMua,
        decimal TienHang, decimal TienVat, decimal TongTien, decimal TienCk,
        string LyDo, bool CoTrongExcel, List<MatHang> MatHangs);

    public class ImportService
    {
        private readonly AppDbContext _db;
        private readonly TenantDbResolver _resolver;
        private readonly IConfiguration _config;
        private readonly VaCauTrucService _va;
        private readonly DanhMucService _dm;
        private readonly DoiChieuService _dc;
        public ImportService(AppDbContext db, TenantDbResolver resolver, IConfiguration config,
                             VaCauTrucService va, DanhMucService dm, DoiChieuService dc)
        { _db = db; _resolver = resolver; _config = config; _va = va; _dm = dm; _dc = dc; }

        public async Task<KetQuaNapJob> ImportJob(ImportJobRequest req, string userName)
        {
            var tenant = await _db.Tenants.FindAsync(req.TenantId)
                ?? throw new ArgumentException("Không tìm thấy đơn vị");

            // Vá cấu trúc TRƯỚC khi ghi: đây là chỗ cần cột mới nhất, và cũng là chỗ hay
            // gặp database lâu không ai đụng tới. Lần đầu tốn một câu SELECT, sau đó nhớ
            // trong bộ nhớ nên gần như miễn phí.
            _va.BaoDam(tenant.Code, req.Nam, userName);

            string jobsRoot = _config["Paths:JobsRoot"]!;
            string scanRoot = _config["Paths:ScanDocRoot"]!;
            string jobDir = Path.Combine(jobsRoot, tenant.Code, $"NAM{req.Nam}",
                                         $"T{req.Thang}_{req.Nam}_{tenant.Code}");
            string outDir = Path.Combine(jobDir, "outputs");
            if (!Directory.Exists(outDir))
                throw new ArgumentException($"Không thấy thư mục outputs của job: {outDir}");

            string scanDir = Path.Combine(scanRoot, tenant.Code, $"NAM{req.Nam}");
            Directory.CreateDirectory(scanDir);

            var errors = new List<LoiNap>();
            int inserted = 0, updated = 0, skippedYear = 0, skippedNoDate = 0, moved = 0;
            // HĐ đặc biệt (điện, viễn thông, ngân hàng): không có bản gốc trên TCT, chỉ
            // nằm trong Excel. Vẫn nạp bình thường, chỉ không có file để dời — đếm riêng
            // để khỏi bị hiểu nhầm là "thiếu file" (spec 1.3.4).
            int khongCoGoc = 0;
            // Bảng đối chiếu bản gốc TCT (IN_VALUE_LINE): số dòng thêm mới và số dòng bị
            // thay vì cổng khai lại khác đi.
            int dongGocMoi = 0, dongGocSua = 0;

            // Số liệu tách theo hướng ("VAO" / "RA"). TheoH() tự tạo ô khi gặp hướng mới,
            // nên chỉ nạp một hướng thì từ điển chỉ có đúng một khóa — màn hình dựa vào
            // đó để biết có cần hiện phần tách hay không.
            var theoHuong = new Dictionary<string, NapTheoHuong>();
            NapTheoHuong TheoH(string h)
            {
                if (!theoHuong.TryGetValue(h, out var o)) theoHuong[h] = o = new NapTheoHuong();
                return o;
            }

            using var conn = new SqlConnection(
                _resolver.GetTenantConnection(tenant.Code, req.Nam));
            await conn.OpenAsync();

            // Dò MỘT LẦN cho cả job: database chưa chạy 017 thì bỏ cột loai_thue ra khỏi
            // câu ghi thay vì để cả mẻ nạp chết.
            bool coLoaiThue = CoCot(conn, "HOA_DON_LINE", "loai_thue");

            // Danh mục nằm ở KT2000_Base — DATABASE KHÁC, nên phải mở kết nối riêng và
            // giữ suốt lượt nạp. Cố ý KHÔNG nằm trong transaction của việc ghi hóa đơn:
            // mã khách vừa cấp phải giữ lại kể cả khi một hóa đơn bị rollback, không thì
            // lần sau cấp trùng số cho cùng một khách.
            using var connBase = _dm.MoKetNoi();
            _dm.BaoDamDongHung(connBase);

            // Theo đúng lựa chọn trên màn hình: "Chỉ đầu vào" thì đừng đụng tới file RA
            var cacHuongNap = CacHuong(req.Huong);

            foreach (var huong in cacHuongNap)
            {
                string file = Path.Combine(outDir, $"HOA_DON_{huong}_{tenant.Code}.xlsx");
                if (!File.Exists(file)) continue;

                using var wb = new XLWorkbook(file);
                var wsM = wb.Worksheet($"hoa_don_{huong.ToLower()}");
                var wsL = wb.Worksheet($"hoa_don_{huong.ToLower()}_line");
                var M = HeaderMap(wsM); var L = HeaderMap(wsL);

                // ---- BR-IMP-01 lớp JOB: đúng chủ + đúng năm ----
                var firstRow = wsM.Row(2);
                string mstTraCuu = S(firstRow, M, "MST_TRA_CU");
                string maDonVi   = S(firstRow, M, "MA_DONVI");
                int namFile      = I(firstRow, M, "NAM");
                if (!string.IsNullOrEmpty(tenant.TaxCode) && mstTraCuu != tenant.TaxCode)
                    throw new ArgumentException(
                        $"File {huong}: MST tra cứu ({mstTraCuu}) KHÁC MST đơn vị ({tenant.TaxCode}) — từ chối cả job");
                if (maDonVi != tenant.Code)
                    throw new ArgumentException(
                        $"File {huong}: MA_DONVI ({maDonVi}) khác đơn vị đích ({tenant.Code}) — từ chối cả job");
                if (namFile != req.Nam)
                    throw new ArgumentException(
                        $"File {huong}: NAM trong file ({namFile}) khác năm đích ({req.Nam}) — từ chối cả job");

                // Bản gốc TCT của hướng này, gom lại để ghi MỘT lượt cuối vòng — mỗi kỳ kê
                // khai chỉ mở một transaction thay vì mỗi hóa đơn một cái.
                var dsGoc = new List<DoiChieuService.DongGoc>();
                var maHdDaGhi = new HashSet<string>(StringComparer.Ordinal);

                // ---- Gom LINE theo MA_HD ----
                var linesByHd = new Dictionary<string, List<IXLRow>>();
                foreach (var r in wsL.RowsUsed().Skip(1))
                {
                    string k = S(r, L, "MA_HD");
                    if (k == "") continue;
                    if (!linesByHd.TryGetValue(k, out var lst)) linesByHd[k] = lst = new();
                    lst.Add(r);
                }

                foreach (var r in wsM.RowsUsed().Skip(1))
                {
                    // MA_HD thô dùng để KHỚP sang sheet LINE (Python ghi y hệt chuỗi đó ở
                    // cả hai sheet). Bản đã chuẩn hóa số hóa đơn mới là thứ ghi xuống DB —
                    // đừng đổi chỗ hai cái, khớp bằng bản chuẩn là mất sạch dòng hàng.
                    string maHdTho = S(r, M, "MA_HD");
                    if (maHdTho == "") continue;
                    string maHd = ChuanHoaMaHd(maHdTho, S2(r, M, "SO_HD", "SO_HD_G"));

                    // Ngày: chuẩn hóa → fallback _G (đều có thể là CHUỖI)
                    DateTime? ngay = D2(r, M, "NGAY_HD", "NGAY_HD_G");
                    if (ngay == null) { skippedNoDate++;
                        errors.Add(new LoiNap(maHd, huong, "KHONG_RO_NGAY",
                            "Không đọc được NGAY_HD/NGAY_HD_G")); continue; }
                    if (ngay.Value.Year != req.Nam) { skippedYear++; continue; }  // BR-IMP-01 lớp DÒNG

                    var lines = linesByHd.GetValueOrDefault(maHdTho) ?? new List<IXLRow>();

                    // Bản gốc TCT: chép thẳng dòng Excel danh sách sang bảng đối chiếu,
                    // TRƯỚC mọi phép kiểm. Hóa đơn bị đá ra vì lệch Σ vẫn phải nằm đây —
                    // "cổng có mà sổ chưa có" chính là thứ đối chiếu sinh ra để thấy.
                    dsGoc.Add(DongGocTuExcel(r, M, huong, maHd, ngay.Value,
                                             TongTienHangTuLine(lines, L)));

                    // ---- Kiểm Σ line = master: ưu tiên cặp chuẩn hóa, trống thì cặp _G ----
                    // Sai số cho phép DƯỚI 10 đồng. Có lúc nới lên 1.000đ rồi trả về 10đ
                    // (chốt Trường 14/08) sau khi đo lại cho đúng.
                    //
                    // Đo trên ~1.250 hóa đơn thật, ĐÃ tính cả nhánh EXCEL_NO_XML: chỉ 63
                    // hóa đơn có lệch, cao nhất 160đ, và TUYỆT ĐỐI không có gì trong
                    // khoảng 0,01%–1% giá trị. Lỗi thật thì lệch hàng triệu.
                    // Nên 1.000đ rộng gấp 6 lần mức cần — bỏ lọt cả một hạng sai số mà
                    // không đổi lại được gì.
                    //
                    // Vì sao KHÔNG nới cho nhóm lệch 11–160đ: mấy hóa đơn đó chỉ có MỘT
                    // dòng, nên không thể là sai số cộng dồn — nó sinh ngay từ con số
                    // người bán khai. Loại đó đáng để mắt chứ không đáng bỏ qua.
                    const decimal SAI_SO_CHO_PHEP = 10m;

                    // Dòng CHIẾT KHẤU thương mại (LOAI_HH = TChat = 3) ghi thành tiền
                    // DƯƠNG trong XML của TCT, nhưng bản chất là TRỪ vào tiền hàng.
                    // Cộng thẳng là lệch đúng HAI LẦN số chiết khấu — một lần thiếu phép
                    // trừ, một lần cộng nhầm.
                    //   Ca thật C26TLC/10: Σ 12 dòng = 128.929.583, master = 120.538.935,
                    //   chênh 8.390.648 = 2 × 4.195.324. Chín hóa đơn của cùng người bán
                    //   6200068486 bị đá ra raw\ vì lý do này.
                    // Chốt với Trường 11/08: CHỈ sửa phép so sánh, KHÔNG đổi dấu dòng
                    // chiết khấu khi ghi vào HOA_DON_LINE — kế toán không nhận số âm.
                    // NGOẠI LỆ — hóa đơn CHIẾT KHẤU THƯƠNG MẠI đứng riêng: cả hóa đơn chỉ
                    // toàn dòng TC=3, người bán phát hành để trả lại khoản chiết khấu chứ
                    // không bán gì. Master khai số DƯƠNG, nên đảo dấu như dòng chiết khấu
                    // nằm lẫn trong hóa đơn hàng hóa là sai gấp đôi và hóa đơn bị đá ra.
                    //   Ca thật HOA_SANG T4: VAO_4600285900_C26TMN_14708 — một dòng TC=3
                    //   9.482.503, master 9.482.503, phép kiểm cũ báo chênh 18.965.006.
                    // Hóa đơn TC hỗn hợp (vừa hàng vừa chiết khấu) vẫn đảo dấu như cũ —
                    // ca C26TMN_14134 và _17159 cùng đơn vị đó chạy đúng, đừng đụng vào.
                    // MỘT cách tính Σ duy nhất. Bản cũ có hai (THANH_TIEN và TTIEN_LINE)
                    // rồi chọn theo cặp nào khác 0 — giữ hai lối tính song song là tái lập
                    // đúng cái vênh vừa sửa. Bên master vẫn lùi từ cột chuẩn hóa sang cột _G
                    // vì đó chỉ là hai cách CHÉP cùng một số của cổng.
                    decimal sumLine   = TongTienHangTuLine(lines, L);
                    decimal masterVal = N(r, M, "TIEN_HANG");
                    if (masterVal == 0) masterVal = N(r, M, "TT_HD_G");

                    // Hóa đơn KHÔNG CHỊU THUẾ: cổng không khai tiền chưa thuế nên cả
                    // TIEN_HANG lẫn TT_HD_G đều rỗng → masterVal = 0, và hóa đơn bị đá ra
                    // với "chênh" đúng bằng toàn bộ giá trị của nó.
                    //   Ca thật C26MYY/3: Σ line 1.750.000 vs master 0.
                    // Suy ngược từ tổng trừ thuế; hết đường mới lấy chính Σ line.
                    if (masterVal == 0 && sumLine != 0)
                    {
                        decimal suyRa = N(r, M, "TONG_TIEN") - N(r, M, "TIEN_VAT");
                        masterVal = suyRa > 0 ? suyRa : sumLine;
                    }

                    // Chốt tiền hàng CHƯA THUẾ ở đây, TRƯỚC nhánh EXCEL_NO_XML bên dưới —
                    // nhánh đó ghi đè masterVal bằng TỔNG ĐÃ GỒM VAT để so Σ line cho đúng
                    // cặp, lấy số đó chia ra thuế suất là sai mẫu số.
                    decimal tienHangChuaThue = masterVal;

                    // HĐ đặc biệt không có gốc trên TCT (điện, viễn thông, ngân hàng —
                    // NGUON_DL = EXCEL_NO_XML): THANH_TIEN của line là tiền ĐÃ GỒM VAT,
                    // trong khi TIEN_HANG của master là tiền CHƯA VAT. So thẳng hai cái đó
                    // là so nhầm cặp — mọi HĐ loại này đều bị đá ra oan, chênh đúng bằng
                    // số tiền VAT. Đo bằng dữ liệu HUY_THANH T1/2026: 22/22 dòng như vậy.
                    // Với nhóm này phải so TONG_TIEN (đã gồm VAT) với Σ THANH_TIEN.  [spec 1.3.4]
                    if (S(r, M, "NGUON_DL").Equals("EXCEL_NO_XML", StringComparison.OrdinalIgnoreCase))
                    {
                        decimal tongTien = N(r, M, "TONG_TIEN");
                        if (tongTien == 0) tongTien = masterVal + N(r, M, "TIEN_VAT");
                        masterVal = tongTien;
                        // sumLine giữ nguyên: với dòng NOXML thì script đặt SL=1 và
                        // ĐG=TỔNG TIỀN, nên SL × ĐG chính là tổng đã gồm VAT — đúng cặp
                        // cần so ở nhánh này.
                    }

                    decimal chenh = masterVal - sumLine;
                    if ((masterVal != 0 || sumLine != 0) && Math.Abs(chenh) >= SAI_SO_CHO_PHEP)
                    {
                        errors.Add(new LoiNap(maHd, huong, "LECH_TONG",
                            $"Σ line ({sumLine}) ≠ master ({masterVal}), chênh {chenh}"
                          + $" — quá ngưỡng {SAI_SO_CHO_PHEP}đ, để lại raw\\ xử lý tay"));
                        continue;
                    }

                    bool ghiXong = false;
                    using var tx = conn.BeginTransaction();
                    try
                    {
                        if (req.XoaTruocKhiGhi)
                        {
                            // Đè trắng: xóa LINE trước (khóa ngoại), rồi master — HĐ thành "mới tinh"
                            using (var d1 = new SqlCommand("DELETE FROM HOA_DON_LINE WHERE ma_hd=@id", conn, tx))
                            { d1.Parameters.AddWithValue("@id", maHd); d1.ExecuteNonQuery(); }
                            using (var d2 = new SqlCommand("DELETE FROM HOA_DON WHERE ma_hd=@id", conn, tx))
                            { d2.Parameters.AddWithValue("@id", maHd); d2.ExecuteNonQuery(); }
                        }
                        bool existed = UpsertMaster(conn, tx, r, M, huong, maHd, userName,
                                                    tenant.KhaiQuy, tienHangChuaThue, connBase);
                        ReplaceLines(conn, tx, maHd, lines, L, userName,
                                     N2(r, M, "TIEN_VAT", "TVAT_HD_G"), tienHangChuaThue,
                                     coLoaiThue);
                        tx.Commit();
                        if (existed) updated++; else inserted++;
                        // Đếm song song theo hướng: chạy "cả vào cả ra" thì số tổng không
                        // nói được bên nào ra bên nào. Cộng ngay tại chỗ tăng biến tổng để
                        // hai con số không bao giờ lệch nhau.
                        if (existed) TheoH(huong).Updated++; else TheoH(huong).Inserted++;
                        ghiXong = true;
                        // Chỉ hóa đơn THỰC SỰ vào được HOA_DON mới được mang ma_hd sang bảng
                        // đối chiếu. Điền sẵn cho dòng bị đá ra là trỏ tới bản ghi không tồn
                        // tại, mà cột đó quy ước NULL = chưa khớp.
                        maHdDaGhi.Add(maHd);
                    }
                    catch (Exception ex)
                    {
                        tx.Rollback();
                        errors.Add(new LoiNap(maHd, huong, "LOI_GHI", ex.Message));
                    }

                    // Dời file NGOÀI transaction: đã Commit rồi thì đừng để lỗi dời file rơi
                    // vào catch ở trên — Rollback một transaction đã commit sẽ ném tiếp và
                    // giết cả vòng nạp. Hỏng khâu này thì HĐ vẫn vào DB, chỉ báo để dời tay.
                    if (!ghiXong) continue;
                    string xmlPath = S(r, M, "XML_PATH");
                    if (string.IsNullOrWhiteSpace(xmlPath))
                    { khongCoGoc++; TheoH(huong).KhongCoGoc++; continue; }
                    try
                    {
                        moved += MoveArtifacts(jobDir, huong, req.Thang, req.Nam, scanDir, xmlPath);
                    }
                    catch (Exception ex)
                    {
                        errors.Add(new LoiNap(maHd, huong, "LOI_DOI_FILE",
                            $"Đã ghi DB nhưng không dời được file: {ex.Message}"));
                    }
                }

                var kqGoc = _dc.Ghi(conn, huong, tenant.KhaiQuy,
                    dsGoc.Select(d => maHdDaGhi.Contains(d.MaHd!) ? d : d with { MaHd = null })
                         .ToList(),
                    userName);
                dongGocMoi += kqGoc.Them; dongGocSua += kqGoc.Sua;
            }

            await UpsertTaskStatus(tenant.Id, req.Nam, req.Thang, "NAP_HD",
                errors.Count == 0 ? "done" : "done_thieu",
                inserted + updated,
                $"Mới {inserted}, cập nhật {updated}, lệch năm {skippedYear}, không rõ ngày {skippedNoDate}, "
              + $"không có gốc {khongCoGoc}, đối chiếu +{dongGocMoi}/thay {dongGocSua}, "
              + $"lỗi {errors.Count}",
                userName);

            await LuuLoiNap(tenant.Id, req.Nam, req.Thang, errors, userName);

            int lechTong = errors.Count(e => e.LoaiLoi == "LECH_TONG");
            // Lệch Σ lấy từ chính danh sách lỗi (LoiNap đã mang sẵn Hướng) chứ không đếm
            // song song như ba số kia — không có biến tổng nào để bám vào.
            foreach (var h in errors.Where(e => e.LoaiLoi == "LECH_TONG")
                                    .GroupBy(e => e.Huong))
                TheoH(h.Key).LechTong = h.Count();

            return new KetQuaNapJob
            {
                Inserted = inserted, Updated = updated,
                SkippedYear = skippedYear, SkippedNoDate = skippedNoDate,
                KhongCoGoc = khongCoGoc, Moved = moved, LechTong = lechTong,
                TheoHuong = theoHuong,
                Errors = errors
                    .Select(e => new LoiNapDto { MaHd = e.MaHd, LoaiLoi = e.LoaiLoi, Reason = e.LyDo })
                    .ToList(),
            };
        }

        // Ghi đè danh sách lỗi của đúng (đơn vị × năm × tháng) này bằng kết quả lần chạy
        // mới nhất — bảng luôn là hiện trạng, chạy lại 5 lần không đẻ ra 5 bộ lỗi chồng nhau.
        private async Task LuuLoiNap(Guid tenantId, int nam, int thang,
                                     List<LoiNap> ds, string userName)
        {
            await _db.Database.ExecuteSqlRawAsync(
                "DELETE FROM ImportError WHERE TenantId={0} AND Nam={1} AND Thang={2}",
                tenantId, nam, thang);

            foreach (var e in ds)
                await _db.Database.ExecuteSqlRawAsync(
                    @"INSERT INTO ImportError (TenantId, Nam, Thang, Huong, MaHd, LoaiLoi, LyDo, TaoBoi)
                      VALUES ({0}, {1}, {2}, {3}, {4}, {5}, {6}, {7})",
                    tenantId, nam, thang, e.Huong, e.MaHd, e.LoaiLoi,
                    e.LyDo.Length > 500 ? e.LyDo[..500] : e.LyDo, userName);
        }

        // Spec 1.3.3: HĐ lệch Σ line vs master thì file gốc NẰM LẠI raw\ chờ xử lý tay.
        // Đếm số file còn lại theo (đơn vị × khoảng tháng) để FRM_LAY_HDDT hiện thành cột.
        // Chỉ đếm .xml — .html luôn đi cặp nên đếm cả hai sẽ ra số gấp đôi, dễ hiểu nhầm.
        // huong: "vao" = chỉ đếm raw\VAO, "all" = cả raw\VAO lẫn raw\RA. Phải theo đúng
        // lựa chọn trên màn hình, không thì chọn "chỉ đầu vào" mà cột lại cộng cả đầu ra.
        public async Task<List<object>> DemFileConLai(List<Tenant> dsTenant, int nam,
                                                     int thangBd, int thangKt, string huong)
        {
            var cacHuong = CacHuong(huong);

            string jobsRoot = _config["Paths:JobsRoot"]
                ?? throw new ArgumentException("Chưa cấu hình Paths:JobsRoot trong appsettings.json");

            // Lỗi đã ghi lúc nạp — chỉ có bảng này mới phân biệt được "lệch Σ line phải
            // xử lý tay" với "chưa nạp", vì nhìn thư mục thì hai thứ đó y hệt nhau.
            var ids = dsTenant.Select(t => t.Id).ToList();
            var loi = await _db.Set<ImportErrorRow>()
                // Lọc hướng bằng hai tham số thay vì cờ 0/1: có thêm hướng 'ra' rồi thì
                // "không phải all" không còn đồng nghĩa với "chỉ VAO" nữa.
                .FromSqlRaw(@"SELECT TenantId, Thang, LoaiLoi, COUNT(*) AS SoLuong
                              FROM ImportError
                              WHERE Nam={0} AND Thang BETWEEN {1} AND {2}
                                AND Huong IN ({3}, {4})
                              GROUP BY TenantId, Thang, LoaiLoi",
                            nam, thangBd, thangKt,
                            cacHuong[0], cacHuong.Length > 1 ? cacHuong[1] : cacHuong[0])
                .ToListAsync();

            var kq = new List<object>();
            foreach (var t in dsTenant)
            {
                var loiCuaDv = loi.Where(x => x.TenantId == t.Id).ToList();
                int tong = 0, soVao = 0, soRa = 0; var chiTiet = new List<object>();
                for (int thang = thangBd; thang <= thangKt; thang++)
                {
                    string rawDir = Path.Combine(jobsRoot, t.Code, $"NAM{nam}",
                                                 $"T{thang}_{nam}_{t.Code}", "raw");
                    if (!Directory.Exists(rawDir)) continue;
                    // NT-04: ĐẾM CẢ HAI hướng bất kể lựa chọn "chỉ vào" hay "cả vào và ra".
                    // Hai cột V/R nói hiện trạng trên đĩa; file đầu ra kẹt lại vẫn phải
                    // hiện ra dù lần này người dùng chỉ định lấy đầu vào.
                    int nVao = DemXml(Path.Combine(rawDir, "VAO"));
                    int nRa  = DemXml(Path.Combine(rawDir, "RA"));
                    soVao += nVao; soRa += nRa;
                    int n = nVao + nRa;
                    if (n > 0) { tong += n; chiTiet.Add(new { thang, soFile = n }); }
                }
                kq.Add(new
                {
                    tenantId = t.Id, code = t.Code, soFileConLai = tong, soVao, soRa, chiTiet,
                    soLechTong = loiCuaDv.Where(x => x.LoaiLoi == "LECH_TONG").Sum(x => x.SoLuong),
                    soLoiKhac  = loiCuaDv.Where(x => x.LoaiLoi != "LECH_TONG").Sum(x => x.SoLuong),
                    lechTheoThang = loiCuaDv.Where(x => x.LoaiLoi == "LECH_TONG")
                        .OrderBy(x => x.Thang)
                        .Select(x => new { thang = x.Thang, soFile = x.SoLuong }).ToList(),
                });
            }
            return kq;
        }

        // Một chỗ dịch "hướng" của giao diện sang tên thư mục/khuôn tên file.
        // Có 'ra' vì màn Hóa đơn đầu ra dùng lại đúng bộ máy này, chỉ khác hướng.
        private static string[] CacHuong(string huong) =>
            huong.Equals("all", StringComparison.OrdinalIgnoreCase) ? new[] { "VAO", "RA" }
          : huong.Equals("ra",  StringComparison.OrdinalIgnoreCase) ? new[] { "RA" }
          : new[] { "VAO" };

        private static int DemXml(string thuMuc) =>
            Directory.Exists(thuMuc) ? Directory.GetFiles(thuMuc, "*.xml").Length : 0;

        // Đọc từng hóa đơn còn nằm lại raw\ để soi "nó bị làm sao".
        // Nguồn là chính file XML của TCT — file lạc không có dòng nào trong Excel tổng
        // nên đọc Excel sẽ ra rỗng. Lý do bị giữ lại thì tra bảng ImportError, khớp theo
        // đuôi <KHHD>_<SO_HD> vì MA_HD và tên file đều kết thúc bằng cặp đó.
        public async Task<List<HoaDonConLai>> DocHoaDonConLai(
            Tenant t, int nam, int thangBd, int thangKt, string huong)
        {
            string jobsRoot = _config["Paths:JobsRoot"]
                ?? throw new ArgumentException("Chưa cấu hình Paths:JobsRoot trong appsettings.json");
            var cacHuong = CacHuong(huong);

            var loi = await _db.Set<ImportErrorDetail>()
                .FromSqlRaw(@"SELECT MaHd, Thang, LyDo FROM ImportError
                              WHERE TenantId={0} AND Nam={1} AND Thang BETWEEN {2} AND {3}",
                            t.Id, nam, thangBd, thangKt)
                .ToListAsync();

            var kq = new List<HoaDonConLai>();
            for (int thang = thangBd; thang <= thangKt; thang++)
                foreach (var h in cacHuong)
                {
                    string jobDir = Path.Combine(jobsRoot, t.Code, $"NAM{nam}",
                                                 $"T{thang}_{nam}_{t.Code}");
                    string d = Path.Combine(jobDir, "raw", h);
                    if (!Directory.Exists(d)) continue;

                    // Không có Excel tổng của hướng này thì cả thư mục CHƯA hề được nạp —
                    // khác hẳn với "đã nạp nhưng hóa đơn này bị bỏ lại". Phân biệt cho rõ,
                    // không thì nhìn 254 dòng "file lạc" sẽ tưởng dữ liệu hỏng hàng loạt.
                    string fileTong = Path.Combine(jobDir, "outputs", $"HOA_DON_{h}_{t.Code}.xlsx");
                    bool coExcelTong = File.Exists(fileTong);

                    foreach (var f in Directory.GetFiles(d, "*.xml").OrderBy(x => x))
                    {
                        var hd = DocXmlHoaDon(f, h, thang);
                        if (hd == null) continue;

                        // MA_HD kết thúc bằng _<KHHD>_<SO_HD>, tên file cũng vậy. Nhưng
                        // hd.SoHd đọc THÔ từ XML ("4490") còn ImportError.MaHd đã đệm số 0
                        // theo BR-HD-01 ("0004490") — so thẳng là không bao giờ khớp, cột
                        // "Vì sao còn nằm lại" trống trơn. So bằng bản đã chuẩn hóa.
                        string duoi = $"_{hd.KhHd}_{ChuanSoHd(hd.SoHd)}";
                        var khop = loi.FirstOrDefault(x => x.MaHd.EndsWith(duoi, StringComparison.OrdinalIgnoreCase));
                        kq.Add(khop != null
                            ? hd with { LyDo = khop.LyDo ?? "", CoTrongExcel = true }
                            : hd with
                              {
                                  LyDo = coExcelTong
                                      ? "Không có dòng nào trong Excel tổng — file lạc của lần tải trước"
                                      : $"Chưa nạp hướng {h}: thiếu file tổng HOA_DON_{h}_{t.Code}.xlsx",
                                  CoTrongExcel = false,
                              });
                    }
                }
            return kq;
        }

        // Đường dẫn file gốc trong raw\ — dùng chung cho xem HTML và nạp tay.
        // Chặn path traversal: chỉ nhận TÊN file, mọi ký tự phân cách đều bị từ chối.
        public string DuongDanFileRaw(Tenant t, int nam, int thang, string huong,
                                      string tenFile, string ext)
        {
            if (tenFile.Contains('/') || tenFile.Contains('\\') || tenFile.Contains(".."))
                throw new ArgumentException("Tên file không hợp lệ");
            string jobsRoot = _config["Paths:JobsRoot"]
                ?? throw new ArgumentException("Chưa cấu hình Paths:JobsRoot trong appsettings.json");
            string h = huong.Equals("RA", StringComparison.OrdinalIgnoreCase) ? "RA" : "VAO";
            return Path.Combine(jobsRoot, t.Code, $"NAM{nam}", $"T{thang}_{nam}_{t.Code}",
                                "raw", h, Path.ChangeExtension(tenFile, ext));
        }

        // Nạp TAY một hóa đơn (người dùng đã sửa trên màn hình) vào database đơn vị-năm.
        // Khác ImportJob ở chỗ nguồn là XML + số liệu người dùng sửa, không phải Excel tổng —
        // dùng cho HĐ bị bỏ lại (lệch Σ line) hoặc file lạc không có trong Excel.
        public async Task<object> NapMotHoaDon(ImportOneRequest req, string userName)
        {
            var tenant = await _db.Tenants.FindAsync(req.TenantId)
                ?? throw new ArgumentException("Không tìm thấy đơn vị");

            // BR-HD-01: <HƯỚNG>_<MST người phát hành>_<KÝ HIỆU>_<SỐ HĐ> — đúng khuôn mà
            // TRA_CUU_HDDT_2_0.py sinh ra (vá #6). HĐ vào thì người phát hành là người bán;
            // HĐ ra thì người bán cũng chính là đơn vị mình — một công thức phủ cả hai hướng.
            // Nhờ tiền tố VAO_/RA_ mà cột tính `huong` trong HOA_DON mới chạy đúng.
            string huongMa = req.Huong.Equals("RA", StringComparison.OrdinalIgnoreCase) ? "RA" : "VAO";
            string mstPhatHanh = string.IsNullOrWhiteSpace(req.MstPhatHanh)
                ? (tenant.TaxCode ?? "") : req.MstPhatHanh.Trim();
            // BR-HD-01: đệm về 8 chữ số TRƯỚC khi ghép ma_hd, y như đường nạp hàng loạt —
            // hai đường ra hai dạng số là cùng một hóa đơn nằm hai dòng trong DB.
            string soHd = ChuanSoHd(req.SoHd);
            string maHd = $"{huongMa}_{mstPhatHanh}_{req.KhHd}_{soHd}";
            string khhd = req.MauSo + req.KhHd;   // giống UpsertMaster: KIEU_HD + ký hiệu

            if (!DateTime.TryParse(req.Ngay, System.Globalization.CultureInfo.InvariantCulture,
                    System.Globalization.DateTimeStyles.None, out var ngay))
                throw new ArgumentException($"Ngày không hợp lệ: '{req.Ngay}' (cần dạng yyyy-MM-dd)");
            if (ngay.Year != req.Nam)
                throw new ArgumentException($"Ngày HĐ ({ngay:yyyy-MM-dd}) không thuộc năm {req.Nam}");

            using var conn = new SqlConnection(_resolver.GetTenantConnection(tenant.Code, req.Nam));
            await conn.OpenAsync();

            bool existed;
            using (var chk = new SqlCommand("SELECT COUNT(*) FROM HOA_DON WHERE ma_hd=@id", conn))
            { chk.Parameters.AddWithValue("@id", maHd); existed = (int)(await chk.ExecuteScalarAsync())! > 0; }

            using (var tx = conn.BeginTransaction())
            {
                try
                {
                    string sql = existed
                      // ngay_nh dùng ISNULL — luật #5, xem giải thích ở UpsertMaster
                      ? @"UPDATE HOA_DON SET ngay=@ngay, thang=@thang,
                            ngay_nh=ISNULL(ngay_nh,@ngay_nh), vat=@vat,
                            ghi_no=ISNULL(ghi_no,@ghi_no), ghi_co=ISNULL(ghi_co,@ghi_co),
                            ghi_no_vat=ISNULL(ghi_no_vat,@ghi_no_vat),
                            ghi_co_vat=ISNULL(ghi_co_vat,@ghi_co_vat),
                            khhd=@khhd, so_hd=@so_hd,
                            mst=@mst, ten_kh=@ten_kh, dia_chi=@dia_chi, tien_vat=@tien_vat,
                            tien_ck=@tien_ck, edit_vat=@edit_vat, edit_ck=@edit_ck,
                            updated_by=@user, updated_at=SYSDATETIME()
                          WHERE ma_hd=@id"
                      : @"INSERT INTO HOA_DON (ma_hd, ngay, thang, ngay_nh, vat,
                            ghi_no, ghi_co, ghi_no_vat, ghi_co_vat,
                            khhd, so_hd, mst, ten_kh, dia_chi,
                            tien_vat, tien_ck, edit_vat, edit_ck, created_by)
                          VALUES (@id, @ngay, @thang, @ngay_nh, @vat,
                            @ghi_no, @ghi_co, @ghi_no_vat, @ghi_co_vat,
                            @khhd, @so_hd, @mst, @ten_kh, @dia_chi,
                            @tien_vat, @tien_ck, @edit_vat, @edit_ck, @user)";
                    using (var cmd = new SqlCommand(sql, conn, tx))
                    {
                        var p = cmd.Parameters;
                        p.AddWithValue("@id", maHd);
                        p.AddWithValue("@ngay", ngay.Date);
                        p.AddWithValue("@thang", ThangKeKhai(ngay.Month, tenant.KhaiQuy));
                        p.AddWithValue("@ngay_nh", ngay.Date);
                        // Tiền hàng chưa thuế = Σ dòng hàng, dòng chiết khấu (TChat=3)
                        // TRỪ ra — cùng quy ước với phép kiểm Σ ở ImportJob.
                        p.AddWithValue("@vat", SuyThueSuat(req.TienVat,
                            req.MatHangs.Sum(m => (m.TinhChat == "3" ? -1m : 1m) * m.ThanhTien)));
                        p.AddWithValue("@khhd", khhd);
                        p.AddWithValue("@so_hd", soHd);
                        p.AddWithValue("@mst", (object?)Nz(req.Mst) ?? DBNull.Value);
                        p.AddWithValue("@ten_kh", (object?)Nz(req.TenKh) ?? DBNull.Value);
                        p.AddWithValue("@dia_chi", (object?)Nz(req.DiaChi) ?? DBNull.Value);
                        p.AddWithValue("@tien_vat", req.TienVat);
                        p.AddWithValue("@tien_ck", req.TienCk);
                        // Định khoản mồi — cùng quy tắc với đường nạp hàng loạt, không thì
                        // hóa đơn nạp tay ra một kiểu, nạp cả job ra kiểu khác.
                        var dkTay = DinhKhoanMacDinh(huongMa);
                        p.AddWithValue("@ghi_no", dkTay.No);
                        p.AddWithValue("@ghi_co", dkTay.Co);
                        p.AddWithValue("@ghi_no_vat",
                            req.TienVat != 0 ? dkTay.NoVat : (object)DBNull.Value);
                        p.AddWithValue("@ghi_co_vat",
                            req.TienVat != 0 ? dkTay.CoVat : (object)DBNull.Value);
                        // != 0 chứ KHÔNG phải > 0 (chốt Trường 11/08): hóa đơn điều
                        // chỉnh GIẢM có thuế ÂM, mà số âm đó cũng là số đã chốt từ hóa
                        // đơn gốc — dùng > 0 là tắt cờ khóa đúng nhóm cần khóa nhất.
                        // Ca thật: RA_0108169869_C26TXQ_5, tien_vat = -784.800.
                        p.AddWithValue("@edit_vat", req.TienVat != 0);
                        p.AddWithValue("@edit_ck", req.TienCk > 0);
                        p.AddWithValue("@user", userName);
                        await cmd.ExecuteNonQueryAsync();
                    }

                    using (var del = new SqlCommand("DELETE FROM HOA_DON_LINE WHERE ma_hd=@id", conn, tx))
                    { del.Parameters.AddWithValue("@id", maHd); await del.ExecuteNonQueryAsync(); }

                    // Cùng lý do như ở ImportJob: database chưa chạy 017 thì bỏ cột ra.
                    bool coLoaiThue = CoCot(conn, "HOA_DON_LINE", "loai_thue");

                    foreach (var m in req.MatHangs)
                    {
                        using var ins = new SqlCommand($@"
                            INSERT INTO HOA_DON_LINE (ma_hd, stt_line, ten_hang_goc, dvt, so_luong,
                                don_gia, pt_vat, tien_ck, tinh_chat, created_by
                                {(coLoaiThue ? ", loai_thue" : "")})
                            VALUES (@id, @stt, @ten, @dvt, @sl, @dg, @pt_vat, @tien_ck, @tc, @user
                                {(coLoaiThue ? ", @loai_thue" : "")})", conn, tx);
                        var p = ins.Parameters;
                        p.AddWithValue("@id", maHd);
                        p.AddWithValue("@stt", m.Stt);
                        p.AddWithValue("@ten", (object?)Nz(m.TenHang) ?? DBNull.Value);
                        p.AddWithValue("@dvt", (object?)Nz(m.Dvt) ?? DBNull.Value);
                        p.AddWithValue("@sl", m.SoLuong);
                        p.AddWithValue("@dg", m.DonGia);
                        string thueSuat = (m.ThueSuat ?? "").Trim();
                        p.AddWithValue("@pt_vat", DocThueSuat(thueSuat));
                        if (coLoaiThue)
                        {
                            // Giữ nguyên chuỗi gốc — xem giải thích ở ReplaceLines
                            string lt = thueSuat.Length > 10 ? thueSuat[..10] : thueSuat;
                            p.AddWithValue("@loai_thue", (object?)Nz(lt) ?? DBNull.Value);
                        }
                        // Trước ghi cứng 0: cột Chiết khấu ở lưới dòng hàng nay sửa được
                        // (chốt 12/08), không ghi thì gõ xong số bay mất.
                        p.AddWithValue("@tien_ck", m.ChietKhau);
                        p.AddWithValue("@tc", (object?)Nz(m.TinhChat) ?? DBNull.Value);
                        p.AddWithValue("@user", userName);
                        await ins.ExecuteNonQueryAsync();
                    }
                    tx.Commit();
                }
                catch { tx.Rollback(); throw; }
            }

            // Dời file gốc sang SCAN_DOC (ngoài transaction — hỏng thì HĐ vẫn đã vào DB)
            int moved = 0; string? loiDoiFile = null;
            try
            {
                string jobDir = Path.Combine(_config["Paths:JobsRoot"]!, tenant.Code,
                                             $"NAM{req.Nam}", $"T{req.Thang}_{req.Nam}_{tenant.Code}");
                string scanDir = Path.Combine(_config["Paths:ScanDocRoot"]!, tenant.Code, $"NAM{req.Nam}");
                Directory.CreateDirectory(scanDir);
                string h = req.Huong.Equals("RA", StringComparison.OrdinalIgnoreCase) ? "RA" : "VAO";
                moved = MoveArtifacts(jobDir, h, req.Thang, req.Nam, scanDir, req.TenFile);
            }
            catch (Exception ex) { loiDoiFile = ex.Message; }

            // Hóa đơn đã vào sổ thì dòng lỗi cũ của nó không còn đúng nữa
            await _db.Database.ExecuteSqlRawAsync(
                "DELETE FROM ImportError WHERE TenantId={0} AND Nam={1} AND Thang={2} AND MaHd={3}",
                tenant.Id, req.Nam, req.Thang, maHd);

            await _db.Database.ExecuteSqlRawAsync(
                @"INSERT INTO ActivityLog (UserName, TenantId, Nam, Thang, Action, Detail)
                  VALUES ({0}, {1}, {2}, {3}, N'NAP_HD_TAY', {4})",
                userName, tenant.Id, req.Nam, req.Thang,
                $"{(existed ? "Cập nhật" : "Thêm mới")} {maHd} (sửa tay từ {req.TenFile})");

            return new { maHd, capNhat = existed, soDongHang = req.MatHangs.Count, moved, loiDoiFile };
        }

        // "10%" / "8%" / "KCT" → số phần trăm; không đọc được thì 0
        // MÃ ÂM cho loại không có thuế suất bằng số (chốt Trường 14/08):
        //     -1 = Không kê khai   (cổng ghi 'KKKNT' — 863 dòng thật)
        //     -2 = Không chịu thuế (cổng ghi 'KCT'   —  91 dòng thật)
        // Mã -3 "Thuế TC" đã BỎ: quét 91.062 dòng của mọi đơn vị không có giá trị nào ứng
        // với nó, giữ chỗ cho một mã không ai sinh ra chỉ tổ gây thắc mắc.
        //
        // VÌ SAO SỐ ÂM: pt_vat là DECIMAL nên không chứa nổi chữ, mà 0 đã có nghĩa riêng —
        // "thuế suất 0%", 8.450 dòng thật đang mang đúng nghĩa đó. Dồn KCT vào 0 là trộn
        // hai thứ mà tờ khai GTGT xếp vào hai chỉ tiêu khác nhau. Số âm an toàn vì thuế
        // suất thật không bao giờ âm.
        //
        // Chuỗi gốc vẫn giữ ở loai_thue: cột này để TÍNH, cột kia để ĐỌC.
        // Số lượng / đơn giá của MỘT dòng sau khi vá chỗ cổng khai thiếu.
        //
        // Dùng CHUNG cho phép kiểm Σ (ImportJob) và cho lúc ghi (ReplaceLines) — đây là
        // điểm mấu chốt (chốt Trường 14/08). Trước đây phép kiểm đọc THANH_TIEN còn chỗ
        // ghi lưu SL và ĐG: hóa đơn khớp hoàn hảo lúc kiểm rồi vào DB thành 0, không phép
        // kiểm nào bắt được vì hai bên đọc hai cột khác nhau.
        //   Ca thật VAO_0107696742_C26TDM_3647 (HUY_THANH T8): SL = -9.292, cổng KHÔNG
        //   khai đơn giá, THANH_TIEN = -140.224.736. Σ khớp master đúng 0đ nên qua cửa,
        //   nhưng SL × ĐG = 0 — 140 triệu biến mất khỏi sổ.
        //
        // Hai ca vá:
        //   SL và ĐG cùng trống  -> coi như 1 đơn vị, đơn giá chính là thành tiền
        //   chỉ thiếu ĐG         -> suy ngược ĐG = thành tiền / SL
        internal static (decimal Sl, decimal Dg) SoLuongDonGia(
            decimal sl, decimal dg, decimal thanhTien)
        {
            if (thanhTien == 0) return (sl, dg);
            if (sl == 0 && dg == 0) return (1m, thanhTien);
            if (dg == 0 && sl != 0) return (sl, thanhTien / sl);
            return (sl, dg);
        }

        /// <summary>
        /// Σ tiền hàng của các dòng hàng trong Excel: SL × ĐG − chiết khấu dòng.
        /// </summary>
        /// <remarks>
        /// Trước đây là hai closure nằm trong ImportJob. Tách ra vì việc dựng bản gốc TCT
        /// cũng cần ĐÚNG con số này — hai chỗ tính hai kiểu thì sớm muộn lệch nhau, mà lệch
        /// ở đây nghĩa là phép kiểm lúc nạp bảo khớp còn bảng đối chiếu bảo lệch.
        ///
        /// SL/ĐG khuyết được vá bằng đúng hàm mà ReplaceLines dùng lúc ghi (chốt Trường
        /// 14/08). Trước đây đọc thẳng THANH_TIEN — khớp master hoàn hảo nhưng không nói
        /// được gì về hai cột thật sự vào DB, nên dòng thiếu đơn giá lọt qua rồi vào sổ
        /// bằng 0.
        ///
        /// Làm tròn về ĐỒNG ở TỪNG DÒNG rồi mới cộng: người bán cũng làm thế khi in hóa
        /// đơn. Giữ phần lẻ của mọi dòng rồi mới cộng là tự tích ra sai số bản gốc không
        /// hề có — đo trên 1.250 hóa đơn thật, cách này kéo thêm 22 hóa đơn về khớp tuyệt đối.
        ///
        /// Dòng CHIẾT KHẤU (LOAI_HH = TChat = 3) ghi số DƯƠNG trong XML của TCT nhưng bản
        /// chất là TRỪ vào tiền hàng, nên đảo dấu.
        /// NGOẠI LỆ — hóa đơn chiết khấu thương mại đứng riêng (mọi dòng đều TC=3): người
        /// bán phát hành để trả lại khoản chiết khấu chứ không bán gì, master khai số DƯƠNG
        /// nên đảo dấu là sai gấp đôi.
        ///   Ca thật HOA_SANG T4: VAO_4600285900_C26TMN_14708 — một dòng TC=3 9.482.503,
        ///   master 9.482.503, phép kiểm cũ báo chênh 18.965.006.
        /// Hóa đơn TC hỗn hợp (vừa hàng vừa chiết khấu) vẫn đảo dấu như cũ — ca C26TMN_14134
        /// và _17159 cùng đơn vị đó chạy đúng, đừng đụng vào.
        /// </remarks>
        internal static decimal TongTienHangTuLine(List<IXLRow> lines, Dictionary<string,int> L)
        {
            if (lines.Count == 0) return 0m;
            bool toanChietKhau = lines.All(x => S(x, L, "LOAI_HH").Trim() == "3");

            decimal TienHangDong(IXLRow x)
            {
                var (sl, dg) = SoLuongDonGia(
                    N2(x, L, "SO_LUONG", "SO_LUONG_G"),
                    N2(x, L, "DON_GIA",  "DON_GIA_G"),
                    N2(x, L, "THANH_TIEN", "TTIEN_LINE"));
                return Math.Round(sl * dg, 0, MidpointRounding.AwayFromZero)
                     - N(x, L, "CK_LINE_G");
            }

            return lines.Sum(x =>
                (!toanChietKhau && S(x, L, "LOAI_HH").Trim() == "3" ? -1m : 1m)
                * TienHangDong(x));
        }

        internal const decimal PT_VAT_KHONG_KE_KHAI   = -1m;
        internal const decimal PT_VAT_KHONG_CHIU_THUE = -2m;

        internal static decimal DocThueSuat(string tho)
        {
            string s = (tho ?? "").Trim().ToUpperInvariant();
            if (s == "KKKNT") return PT_VAT_KHONG_KE_KHAI;
            if (s == "KCT")   return PT_VAT_KHONG_CHIU_THUE;
            // '0%' '5%' '8%' '10%' và cả chuỗi rỗng đều qua đây; rỗng cho ra 0
            // (chốt Trường 14/08: dòng trống vẫn để 0, không để NULL).
            return DocPhanTram(s);
        }

        private static decimal DocPhanTram(string s)
        {
            var so = new string((s ?? "").Where(c => char.IsDigit(c) || c == '.' || c == ',').ToArray())
                     .Replace(",", ".");
            return decimal.TryParse(so, System.Globalization.NumberStyles.Any,
                System.Globalization.CultureInfo.InvariantCulture, out var v) ? v : 0m;
        }

        // Bộ đọc XML hóa đơn TCT (phiên bản 2.x, không có namespace).
        // File hỏng/không đúng khuôn thì trả null chứ không ném — một file rác không
        // được phép làm chết cả modal.
        private static HoaDonConLai? DocXmlHoaDon(string path, string huong, int thang)
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

                var ban = nd.Element("NBan"); var mua = nd.Element("NMua");
                var tt = nd.Element("TToan");

                var hangs = new List<MatHang>();
                foreach (var h in nd.Element("DSHHDVu")?.Elements("HHDVu")
                                  ?? Enumerable.Empty<System.Xml.Linq.XElement>())
                {
                    // TChat rỗng thì coi là hàng hóa — đa số hóa đơn không khai trường này
                    string tchat = V(h, "TChat");
                    hangs.Add(new MatHang(
                        int.TryParse(V(h, "STT"), out var stt) ? stt : hangs.Count + 1,
                        V(h, "THHDVu"), V(h, "DVTinh"),
                        D(h, "SLuong"), D(h, "DGia"), D(h, "ThTien"), V(h, "TSuat"),
                        string.IsNullOrWhiteSpace(tchat) ? "1" : tchat,
                        D(h, "STCKhau")));
                }

                decimal tienVat  = D(tt, "TgTThue");
                decimal tongTien = D(tt, "TgTTTBSo");
                decimal tienHang = D(tt, "TgTCThue");

                // Hóa đơn không chịu thuế thường KHÔNG khai TgTCThue (ca thật: C26MYY/3 —
                // chỉ có TgTTTBSo = 1.750.000). Để nguyên 0 thì cột Tiền hàng trống trơn
                // và mọi phép kiểm Σ line đều báo lệch oan. Suy ngược từ tổng trừ thuế;
                // hết đường mới lấy Σ dòng hàng.
                if (tienHang == 0)
                {
                    tienHang = tongTien - tienVat;
                    if (tienHang <= 0)
                        tienHang = hangs.Where(x => x.TinhChat != "3").Sum(x => x.ThanhTien)
                                 - hangs.Where(x => x.TinhChat == "3").Sum(x => x.ThanhTien);
                }

                return new HoaDonConLai(
                    Path.GetFileName(path), huong, thang,
                    V(chung, "KHMSHDon"), V(chung, "KHHDon"), V(chung, "SHDon"), V(chung, "NLap"),
                    V(ban, "MST"), V(ban, "Ten"), V(mua, "MST"), V(mua, "Ten"),
                    tienHang, tienVat, tongTien, D(tt, "TTCKTMai"),
                    "", false, hangs);
            }
            catch { return null; }
        }

        // BR-HD-01: SỐ HÓA ĐƠN chuẩn 8 chữ số (chốt Trường 11/08). Cổng TCT trả lúc
        // "00000003" lúc "1" cho cùng một dạng số — mà ma_hd = HƯỚNG_MST_KHHD_SỐHĐ, nên
        // cùng một hóa đơn lấy hai đường có thể ra HAI ma_hd khác nhau, nằm hai dòng
        // trong DB. Đệm về 8 để danh tính chỉ có một dạng duy nhất.
        //
        // 7 chữ số (chốt Trường 12/08). Cách làm: BỎ HẾT số 0 đầu rồi đệm lại cho đủ 7 —
        // nhờ vậy "00000003" của cổng cũng về đúng "0000003", không còn hai dạng song song.
        // Số thật dài hơn 7 (vd 12345678) thì GIỮ NGUYÊN, không cắt — cắt là mất dữ liệu.
        // Chuỗi có ký tự lạ cũng để nguyên: 1.500 hóa đơn thật của 3 đơn vị không có ca
        // nào như vậy, nhưng chừa đường vẫn hơn làm hỏng.
        // Định khoản MẶC ĐỊNH theo hướng (chốt Trường 12/08):
        //   VÀO: Nợ 156 / Có 331   ·  thuế: Nợ 1331 / Có 331
        //   RA : Nợ 131 / Có 511   ·  thuế: Nợ 131  / Có 3331
        //
        // Luật #5 cấm hàm nguồn ĐÈ định khoản đã có, không cấm điền khi còn trống — nên
        // mọi câu ghi đều dùng ISNULL, đúng khuôn "cập nhật có chừa" như ngay_nh/ghi_chu.
        // Kế toán sửa lại lần nào là giữ nguyên lần đó, nạp lại bao nhiêu lần cũng vậy.
        //
        // Trong bốn tài khoản này chỉ 156 là chỗ SẼ ĐỔI (chốt Trường 12/08): nó là tài
        // khoản đối ứng của tiền hàng, tùy hóa đơn mà thành 152/153/627/642… — hóa đơn
        // điện nước viễn thông chẳng hạn không phải hàng hóa. Kế toán định khoản lại từng
        // cái, ISNULL bên dưới giữ nguyên số họ sửa.
        // Ba cái còn lại (331, 1331/331 và 131, 511, 3331) là bút toán cố định theo hướng,
        // không có gì để đổi — đừng biến chúng thành tham số cấu hình cho "linh hoạt".
        // Bộ định khoản đầy đủ của MỘT hóa đơn. MaCt* nhận mã khách rồi trả về đúng chỗ:
        // bên nào là khách thì bên đó mang ma_kh, bên kia để chuỗi RỖNG (không phải NULL —
        // giữ nếp VFP, kế toán quen ô trống chứ không quen ô null).
        internal readonly record struct BoDinhKhoan(
            string No, string Co, string NoVat, string CoVat, string NoCk, string CoCk,
            bool KhachBenNo, bool KhachBenNoCk)
        {
            public string MaCtNo(string maKh)  => KhachBenNo ? maKh : "";
            public string MaCtCo(string maKh)  => KhachBenNo ? "" : maKh;
            public string MaCtNck(string maKh) => KhachBenNoCk ? maKh : "";
            public string MaCtCck(string maKh) => KhachBenNoCk ? "" : maKh;
        }

        internal static BoDinhKhoan DinhKhoanMacDinh(string huong)
            => huong.Equals("RA", StringComparison.OrdinalIgnoreCase)
             // BÁN: Nợ 131 phải thu / Có 511 doanh thu · thuế Nợ 131 / Có 3331 phải nộp
             //      chiết khấu Nợ 5211 / Có 131 — khách nằm bên NỢ, bên CÓ của chiết khấu
             ? new("131", "511", "131", "3331", "5211", "131",
                   KhachBenNo: true,  KhachBenNoCk: false)
             // MUA: Nợ 156 hàng hóa / Có 331 phải trả · thuế Nợ 1331 khấu trừ / Có 331
             //      chiết khấu Nợ 331 / Có 711 thu nhập khác — khách bên CÓ, bên NỢ của CK
             : new("156", "331", "1331", "331", "331", "711",
                   KhachBenNo: false, KhachBenNoCk: true);

        internal const int DO_DAI_SO_HD = 7;

        internal static string ChuanSoHd(string tho)
        {
            string s = (tho ?? "").Trim();
            if (s.Length == 0 || !s.All(char.IsAsciiDigit)) return s;
            string loi = s.TrimStart('0');
            if (loi.Length == 0) loi = "0";                    // "0000" -> "0"
            return loi.Length >= DO_DAI_SO_HD ? loi : loi.PadLeft(DO_DAI_SO_HD, '0');
        }

        // Đệm phần ĐUÔI số hóa đơn của ma_hd. Cố tình KHÔNG dựng lại ma_hd từ các mảnh:
        // BR-HD-01 dùng MST NGƯỜI PHÁT HÀNH (luôn là người bán), còn biến mst ở UpsertMaster
        // là của ĐỐI TÁC — dựng lại là sai MST với hóa đơn RA. Sửa đúng cái đuôi thì phần
        // đầu không bị đụng, không có cách nào sai.
        internal static string ChuanHoaMaHd(string maHd, string soHdTho)
        {
            string tho = (soHdTho ?? "").Trim();
            string chuan = ChuanSoHd(tho);
            if (tho.Length == 0 || chuan == tho) return maHd;
            return maHd.EndsWith("_" + tho, StringComparison.Ordinal)
                 ? maHd[..^tho.Length] + chuan
                 : maHd;   // đuôi không khớp -> để nguyên, thà giữ cũ còn hơn đoán
        }

        // Tháng KÊ KHAI, không phải tháng phát sinh (chốt Trường 11/08).
        // Đơn vị khai QUÝ gộp 3 tháng vào tờ khai của tháng CUỐI quý:
        //   1,2,3 → 3 · 4,5,6 → 6 · 7,8,9 → 9 · 10,11,12 → 12
        // Khai THÁNG giữ nguyên.
        //
        // CẢNH BÁO cho người sửa sau: cột `HOA_DON.thang` từ đây mang HAI nghĩa
        // tùy loại DB — DB thuế (<MÃ>_<NĂM>) là tháng KÊ KHAI, còn DB nội bộ
        // (<MÃ>_NB_<NĂM>, do NoiBoService ghi) vẫn là tháng phát sinh. Hai sản
        // phẩm dùng hai bộ DB tách rời nên không đụng nhau, nhưng ĐỪNG bê truy
        // vấn từ bên này sang bên kia. Tháng phát sinh của HĐ thuế luôn lấy lại
        // được bằng MONTH(ngay).
        internal static int ThangKeKhai(int thangHd, bool khaiQuy)
            => khaiQuy && thangHd >= 1 && thangHd <= 12
             ? ((thangHd - 1) / 3 + 1) * 3
             : thangHd;

        // Thuế suất TƯỢNG TRƯNG suy ngược từ số tiền (chốt Trường 11/08). Cổng TCT
        // chỉ trả TỔNG tiền thuế ở mức hóa đơn, không có ô "thuế suất" nào ở đó —
        // thuế suất THẬT của từng mặt hàng nằm ở HOA_DON_LINE.pt_vat. Cột này chỉ
        // để nhìn nhanh trên lưới, KHÔNG được dùng để tính lại thuế.
        // Hóa đơn nhiều mức thuế sẽ ra một số lai (vd 7) — đúng bản chất bình quân.
        // Tiền hàng ≤ 0 (hóa đơn không chịu thuế không suy ra được) thì để trống.
        internal static object SuyThueSuat(decimal tienVat, decimal tienHang)
            => tienHang <= 0
             ? DBNull.Value
             : (int)Math.Round(tienVat * 100m / tienHang, MidpointRounding.AwayFromZero);

        // cBase: kết nối tới KT2000_Base để tra/cấp mã khách. Truyền kết nối chứ không
        // truyền sẵn ma_kh vì chính hàm này mới biết MST của đối tác là bên bán hay bên
        // mua — tùy hướng hóa đơn.
        /// <summary>
        /// Dựng lại BẢN GỐC TCT cho cả năm từ những file Excel danh sách đã nằm sẵn trên
        /// đĩa. KHÔNG vào mạng, KHÔNG đụng HOA_DON — chỉ ghi IN_VALUE / IN_VALUE_LINE.
        /// </summary>
        /// <remarks>
        /// VÌ SAO CẦN: IN_VALUE_LINE chỉ bắt đầu được ghi từ 15/08, nên mọi hóa đơn nạp
        /// trước đó không có bản gốc để đối chiếu (đo 15/08: HOA_SANG_2026 có 592 hóa đơn
        /// mà chỉ 49 dòng gốc). Nạp lại từng tháng cũng bù được, nhưng nạp lại còn ghi cả
        /// HOA_DON — nặng hơn hẳn việc cần làm, và đụng vào sổ khi chỉ muốn bù bảng tra.
        ///
        /// Nguồn là chính file mà lần nạp trước đã dùng, nên số ra y hệt nạp lại.
        /// Thiếu file tháng nào thì bỏ qua tháng đó — có gì bù nấy, không kêu.
        /// </remarks>
        public async Task<KetQuaDungGoc> DungLaiBanGoc(Guid tenantId, int nam, string huong,
                                                       string userName)
        {
            var tenant = await _db.Tenants.FindAsync(tenantId)
                ?? throw new ArgumentException("Không tìm thấy đơn vị");

            _va.BaoDam(tenant.Code, nam, userName);   // bốn DB đời đầu còn thiếu hẳn hai bảng

            string jobsRoot = _config["Paths:JobsRoot"]
                ?? throw new ArgumentException("Chưa cấu hình Paths:JobsRoot trong appsettings.json");

            using var conn = new SqlConnection(_resolver.GetTenantConnection(tenant.Code, nam));
            await conn.OpenAsync();

            // Mã hóa đơn ĐÃ CÓ trong sổ. Chỉ những mã này mới được gắn vào cột ma_hd —
            // hóa đơn nằm trong Excel mà chưa nạp vào sổ thì vẫn ghi dòng gốc (đó chính
            // là thứ đối chiếu cần thấy) nhưng để ma_hd trống, đúng quy ước NULL = chưa khớp.
            var maHdTrongSo = new HashSet<string>(StringComparer.Ordinal);
            using (var doc = new SqlCommand("SELECT ma_hd FROM HOA_DON", conn))
            using (var r = await doc.ExecuteReaderAsync())
                while (await r.ReadAsync()) maHdTrongSo.Add(r.GetString(0));

            int soFile = 0, them = 0, sua = 0;
            var loi = new List<string>();

            foreach (string h in CacHuong(huong))
            {
                // Duyệt cả 12 tháng, tháng nào không có file thì bỏ qua. Rẻ hơn quét đệ quy
                // cả cây thư mục, mà tên thư mục thì cố định theo khuôn của bộ tải.
                for (int thang = 1; thang <= 12; thang++)
                {
                    string file = Path.Combine(
                        jobsRoot, tenant.Code, $"NAM{nam}", $"T{thang}_{nam}_{tenant.Code}",
                        "outputs", $"HOA_DON_{h}_{tenant.Code}.xlsx");
                    if (!File.Exists(file)) continue;

                    try
                    {
                        using var wb = new XLWorkbook(file);
                        var wsM = wb.Worksheet($"hoa_don_{h.ToLower()}");
                        var wsL = wb.Worksheet($"hoa_don_{h.ToLower()}_line");
                        var M = HeaderMap(wsM);
                        var L = HeaderMap(wsL);

                        // Phải đọc CẢ sheet dòng hàng: hóa đơn máy tính tiền của hộ kinh
                        // doanh không có cột tiền nào ở master, số chỉ nằm dưới này.
                        // Khớp bằng MA_HD THÔ — Python ghi y hệt chuỗi đó ở cả hai sheet,
                        // khớp bằng bản đã chuẩn hóa là mất sạch dòng hàng.
                        var linesByHd = new Dictionary<string, List<IXLRow>>();
                        foreach (var x in wsL.RowsUsed().Skip(1))
                        {
                            string k = S(x, L, "MA_HD");
                            if (k == "") continue;
                            if (!linesByHd.TryGetValue(k, out var lst)) linesByHd[k] = lst = new();
                            lst.Add(x);
                        }

                        var dsGoc = new List<DoiChieuService.DongGoc>();
                        foreach (var r in wsM.RowsUsed().Skip(1))
                        {
                            string maHdTho = S(r, M, "MA_HD");
                            if (maHdTho == "") continue;
                            DateTime? ngay = D2(r, M, "NGAY_HD", "NGAY_HD_G");
                            if (ngay == null) continue;
                            if (ngay.Value.Year != nam) continue;   // BR-IMP-01 lớp DÒNG

                            string maHd = ChuanHoaMaHd(maHdTho, S2(r, M, "SO_HD", "SO_HD_G"));
                            var lines = linesByHd.GetValueOrDefault(maHdTho) ?? new List<IXLRow>();
                            var d = DongGocTuExcel(r, M, h, maHd, ngay.Value,
                                                   TongTienHangTuLine(lines, L));
                            dsGoc.Add(maHdTrongSo.Contains(maHd) ? d : d with { MaHd = null });
                        }

                        var kq = _dc.Ghi(conn, h, tenant.KhaiQuy, dsGoc, userName);
                        them += kq.Them; sua += kq.Sua;
                        soFile++;
                    }
                    catch (Exception ex)
                    {
                        // Một file hỏng không được làm hỏng cả lượt: các tháng khác vẫn bù
                        // được, và người dùng cần biết đúng tháng nào đọc không nổi.
                        loi.Add($"T{thang} {h}: {ex.Message}");
                    }
                }
            }

            await GhiNhatKyDungGoc(tenantId, nam, userName,
                $"Dựng bản gốc từ Excel ({huong}): {soFile} file, thêm {them}, thay {sua}"
              + (loi.Count > 0 ? $", lỗi {loi.Count}" : ""));

            return new KetQuaDungGoc { SoFile = soFile, Them = them, Sua = sua, Loi = loi };
        }

        // Luật #7: việc này ghi vào database nên phải có vết, kể cả khi nó chỉ đụng bảng tra.
        private async Task GhiNhatKyDungGoc(Guid tenantId, int nam, string user, string chiTiet)
            => await _db.Database.ExecuteSqlRawAsync(
                @"INSERT INTO ActivityLog (UserName, TenantId, Nam, Action, Detail)
                  VALUES ({0}, {1}, {2}, {3}, {4})",
                user, tenantId, nam, "DUNG_BAN_GOC", chiTiet);

        // Một dòng Excel danh sách → một dòng bản gốc TCT (IN_VALUE_LINE).
        // Đọc THẲNG từ Excel, KHÔNG mượn lại masterVal của phép kiểm Σ: chỗ đó đã qua mấy
        // lượt suy ngược (trừ thuế ra, đổi sang tổng đã gồm VAT cho HĐ không có gốc) để so
        // cho đúng cặp. Bảng này phải là bản chép của cổng, suy diễn thì hết là bản gốc.
        // khhd ghép KIEU_HD + ký hiệu, y hệt HOA_DON.khhd — hai bảng phải khớp được nhau.
        private static DoiChieuService.DongGoc DongGocTuExcel(
            IXLRow r, Dictionary<string,int> M, string huong, string maHd, DateTime ngay,
            decimal tongTuLine)
        {
            decimal value1    = N2(r, M, "TIEN_HANG", "TT_HD_G");
            decimal tax       = N2(r, M, "TIEN_VAT",  "TVAT_HD_G");
            decimal thanhToan = N(r, M, "TONG_TIEN");

            // Hóa đơn HỘ KINH DOANH: cổng chỉ khai tổng thanh toán, không có dòng tiền
            // trước thuế — vì loại này không có thuế GTGT (chốt Trường 15/08). Lấy tổng
            // làm tiền hàng và ép thuế về 0; để value1 = 0 thì cả kỳ hụt đúng số tiền đó.
            if (value1 == 0 && thanhToan != 0) { value1 = thanhToan; tax = 0; }

            // Nấc lùi cuối: hóa đơn MÁY TÍNH TIỀN của hộ kinh doanh — dòng master trong
            // Excel danh sách KHÔNG có lấy một cột tiền nào, cả TIEN_HANG lẫn TT_HD_G,
            // TIEN_VAT và TONG_TIEN đều trống; số tiền chỉ nằm ở sheet dòng hàng.
            //   Ca thật HOA_SANG T7: 2C26MTT/0000192 của HỘ KINH DOANH NGUYỄN TIẾN DUYỆT
            //   — master trống trơn, dòng hàng 1.488 × 13.440 = 19.998.720.
            // Không có nấc này thì value1 = 0 và cả hóa đơn hiện thành "lệch" đúng bằng
            // toàn bộ giá trị của nó. Dòng hàng cũng là số của cổng nên vẫn là bản gốc.
            // Thuế vẫn 0: loại này không có thuế GTGT, đúng luật Trường đã chốt.
            if (value1 == 0 && tax == 0 && tongTuLine != 0) value1 = tongTuLine;

            return new DoiChieuService.DongGoc(
                S(r, M, "KIEU_HD") + S2(r, M, "KHHD", "KHHD_G"),
                ChuanSoHd(S2(r, M, "SO_HD", "SO_HD_G")),
                ngay,
                huong == "VAO" ? S(r, M, "MST_BAN") : S(r, M, "MST_MUA"),
                huong == "VAO" ? S(r, M, "TEN_BAN") : S(r, M, "TEN_MUA"),
                value1, tax, N2(r, M, "TIEN_CK", "TIEN_CK_G"), maHd,
                // Cột "Trạng thái hóa đơn" của Excel danh sách → ghi_chu_m. Cùng nguồn với
                // HOA_DON.tthai_hd, nhưng bên đó là trạng thái MỚI NHẤT còn bên này ghi lại
                // trạng thái từng lần nạp — chênh nhau chính là dấu hiệu hóa đơn bị thay
                // thế hay điều chỉnh sau khi đã lên sổ.
                S(r, M, "TTHAI_HD"));
        }

        private bool UpsertMaster(SqlConnection c, SqlTransaction tx, IXLRow r,
                                  Dictionary<string,int> M, string huong, string maHd,
                                  string user, bool khaiQuy, decimal tienHang,
                                  SqlConnection cBase)
        {
            // Dọn bản cũ khác cách đệm TRƯỚC khi kiểm tồn tại — nếu không, bản 8 chữ số
            // của lần nạp trước vẫn nằm đó và ta chèn thêm bản 7 chữ số bên cạnh.
            DonBanTrungKhacDem(c, tx, maHd, ChuanSoHd(S2(r, M, "SO_HD", "SO_HD_G")));

            bool existed;
            using (var chk = new SqlCommand("SELECT COUNT(*) FROM HOA_DON WHERE ma_hd=@id", c, tx))
            { chk.Parameters.AddWithValue("@id", maHd); existed = (int)chk.ExecuteScalar()! > 0; }

            // khhd GHÉP kiểu + ký hiệu; ký hiệu ưu tiên chuẩn hóa, trống lùi về _G
            string khhd = S(r, M, "KIEU_HD") + S2(r, M, "KHHD", "KHHD_G");
            string soHd = ChuanSoHd(S2(r, M, "SO_HD", "SO_HD_G"));   // BR-HD-01: 8 chữ số
            string mst   = huong == "VAO" ? S(r, M, "MST_BAN")  : S(r, M, "MST_MUA");
            string tenKh = huong == "VAO" ? S(r, M, "TEN_BAN")  : S(r, M, "TEN_MUA");
            string diaChi= huong == "VAO" ? S(r, M, "DCHI_BAN") : S(r, M, "DCHI_MUA");
            decimal tienVat = N2(r, M, "TIEN_VAT", "TVAT_HD_G");
            decimal tienCk  = N2(r, M, "TIEN_CK",  "TIEN_CK_G");

            // Mã khách: tra DM_KH theo MST của ĐỐI TÁC. Chưa có thì cấp KH01, KH02…;
            // hóa đơn bán lẻ không có MST thì gom vào KH0.
            string maKh = _dm.LayMaKh(cBase, mst, tenKh, diaChi);

            string sql = existed
            // ngay_nh dùng ISNULL: luật #5 — hàm nguồn KHÔNG được đè ngày hạch toán
            // kế toán đã tự nhập. Chỉ điền khi cột còn trống ("cập nhật có chừa").
              ? @"UPDATE HOA_DON SET ngay=@ngay, thang=@thang, ngay_nh=ISNULL(ngay_nh,@ngay_nh),
                    vat=@vat, ghi_chu=ISNULL(ghi_chu,@ghi_chu), khhd=@khhd, so_hd=@so_hd,
                    ma_kh=ISNULL(ma_kh,@ma_kh),
                    ghi_no=ISNULL(ghi_no,@ghi_no), ghi_co=ISNULL(ghi_co,@ghi_co),
                    ma_ct_no=ISNULL(ma_ct_no,@ma_ct_no), ma_ct_co=ISNULL(ma_ct_co,@ma_ct_co),
                    ghi_no_vat=ISNULL(ghi_no_vat,@ghi_no_vat),
                    ghi_co_vat=ISNULL(ghi_co_vat,@ghi_co_vat),
                    ghi_no_ck=ISNULL(ghi_no_ck,@ghi_no_ck),
                    ghi_co_ck=ISNULL(ghi_co_ck,@ghi_co_ck),
                    ma_ct_nck=ISNULL(ma_ct_nck,@ma_ct_nck),
                    ma_ct_cck=ISNULL(ma_ct_cck,@ma_ct_cck),
                    mst=@mst, ten_kh=@ten_kh, dia_chi=@dia_chi, nguoi_giao_dich=@ng_gd,
                    tien_vat=@tien_vat, tien_ck=@tien_ck, edit_vat=@edit_vat, edit_ck=@edit_ck,
                    tthai_hd=@tthai, tich_chat_hd_lienquan=@tc_lq, loai_hd_lienquan=@l_lq,
                    mau_so_hd_lienquan=@ms_lq, khhd_lienquan=@kh_lq, sohd_lienquan=@so_lq,
                    ngay_lienquan=@ngay_lq, updated_by=@user, updated_at=SYSDATETIME()
                  WHERE ma_hd=@id"
              : @"INSERT INTO HOA_DON (ma_hd, ngay, thang, ngay_nh, vat, ghi_chu, khhd, so_hd,
                    ma_kh, ghi_no, ghi_co, ma_ct_no, ma_ct_co,
                    ghi_no_vat, ghi_co_vat, ghi_no_ck, ghi_co_ck, ma_ct_nck, ma_ct_cck,
                    mst, ten_kh, dia_chi,
                    nguoi_giao_dich, tien_vat, tien_ck, edit_vat, edit_ck, tthai_hd,
                    tich_chat_hd_lienquan, loai_hd_lienquan, mau_so_hd_lienquan,
                    khhd_lienquan, sohd_lienquan, ngay_lienquan, created_by)
                  VALUES (@id, @ngay, @thang, @ngay_nh, @vat, @ghi_chu, @khhd, @so_hd,
                    @ma_kh, @ghi_no, @ghi_co, @ma_ct_no, @ma_ct_co,
                    @ghi_no_vat, @ghi_co_vat, @ghi_no_ck, @ghi_co_ck, @ma_ct_nck, @ma_ct_cck,
                    @mst, @ten_kh, @dia_chi,
                    @ng_gd, @tien_vat, @tien_ck, @edit_vat, @edit_ck, @tthai,
                    @tc_lq, @l_lq, @ms_lq, @kh_lq, @so_lq, @ngay_lq, @user)";

            using var cmd = new SqlCommand(sql, c, tx);
            var p = cmd.Parameters;
            DateTime? ngayHd = D2(r, M, "NGAY_HD", "NGAY_HD_G");
            p.AddWithValue("@id", maHd);
            p.AddWithValue("@ngay", (object?)ngayHd ?? DBNull.Value);
            // Cột THANG của Excel tổng là tháng PHÁT SINH; đổi sang tháng KÊ KHAI.
            p.AddWithValue("@thang", ThangKeKhai(I(r, M, "THANG"), khaiQuy));
            // Ngày hạch toán mặc định = ngày hóa đơn (chốt Trường 11/08). Kế toán
            // sửa lại được, và lần nạp sau sẽ không đè (ISNULL ở câu UPDATE).
            p.AddWithValue("@ngay_nh", (object?)ngayHd ?? DBNull.Value);
            p.AddWithValue("@vat", SuyThueSuat(tienVat, tienHang));
            // Hóa đơn không có bản gốc trên cổng (điện, nước, viễn thông, ngân hàng):
            // đánh dấu ngay ở ghi chú kèm TÊN đối tác, để nhìn là biết của ai mà khỏi
            // phải mở từng cái ra tra (chốt Trường 12/08).
            // ISNULL ở câu UPDATE — luật #5: không đè ghi chú kế toán đã nhập.
            string ghiChu = S(r, M, "XML_PATH").Trim().Length == 0
                ? ("NoXml" + (Nz(tenKh) == null ? "" : " - " + tenKh)) : "";
            p.AddWithValue("@ghi_chu", (object?)Nz(ghiChu) ?? DBNull.Value);

            // Định khoản mồi. Cặp THUẾ chỉ điền khi hóa đơn CÓ thuế, cặp CHIẾT KHẤU chỉ
            // khi có chiết khấu — gắn 1331/3331 vào hóa đơn không chịu thuế là mời kế toán
            // hạch toán một khoản thuế không tồn tại.
            // Điều kiện != 0 chứ không > 0 (chốt Trường 13/08): hóa đơn điều chỉnh GIẢM
            // mang số ÂM, mà nó vẫn cần bút toán — bỏ qua là mất hẳn.
            var dk = DinhKhoanMacDinh(huong);
            p.AddWithValue("@ma_kh", maKh);
            p.AddWithValue("@ghi_no", dk.No);
            p.AddWithValue("@ghi_co", dk.Co);
            p.AddWithValue("@ma_ct_no", dk.MaCtNo(maKh));
            p.AddWithValue("@ma_ct_co", dk.MaCtCo(maKh));
            p.AddWithValue("@ghi_no_vat", tienVat != 0 ? dk.NoVat : (object)DBNull.Value);
            p.AddWithValue("@ghi_co_vat", tienVat != 0 ? dk.CoVat : (object)DBNull.Value);
            p.AddWithValue("@ghi_no_ck", tienCk != 0 ? dk.NoCk : (object)DBNull.Value);
            p.AddWithValue("@ghi_co_ck", tienCk != 0 ? dk.CoCk : (object)DBNull.Value);
            p.AddWithValue("@ma_ct_nck", tienCk != 0 ? dk.MaCtNck(maKh) : (object)DBNull.Value);
            p.AddWithValue("@ma_ct_cck", tienCk != 0 ? dk.MaCtCck(maKh) : (object)DBNull.Value);

            p.AddWithValue("@khhd", khhd);
            p.AddWithValue("@so_hd", soHd);
            p.AddWithValue("@mst", (object?)Nz(mst) ?? DBNull.Value);
            p.AddWithValue("@ten_kh", (object?)Nz(tenKh) ?? DBNull.Value);
            p.AddWithValue("@dia_chi", (object?)Nz(diaChi) ?? DBNull.Value);
            p.AddWithValue("@ng_gd", (object?)Nz(S(r, M, "NG_GD")) ?? DBNull.Value);
            p.AddWithValue("@tien_vat", tienVat);
            p.AddWithValue("@tien_ck", tienCk);
            // BR: chốt số thuế HĐ gốc — không auto-tính đè.
            // != 0 chứ KHÔNG phải > 0 (chốt Trường 11/08) — xem giải thích ở NapMotHoaDon.
            p.AddWithValue("@edit_vat", tienVat != 0);
            p.AddWithValue("@edit_ck",  tienCk  > 0);
            p.AddWithValue("@tthai", (object?)Nz(S(r, M, "TTHAI_HD")) ?? DBNull.Value);
            p.AddWithValue("@tc_lq", (object?)Nz(S(r, M, "TCHD_LQUAN")) ?? DBNull.Value);
            p.AddWithValue("@l_lq",  (object?)Nz(S(r, M, "LHD_LQUAN")) ?? DBNull.Value);
            p.AddWithValue("@ms_lq", (object?)Nz(S(r, M, "MSHD_LQUAN")) ?? DBNull.Value);
            p.AddWithValue("@kh_lq", (object?)Nz(S(r, M, "KHHD_LQUAN")) ?? DBNull.Value);
            // Đệm luôn số hóa đơn LIÊN QUAN: cột này tồn tại để dò ngược về hóa đơn gốc
            // trong chính bảng HOA_DON. Một bên "00000177", một bên "177" thì phép dò
            // không bao giờ khớp — mà đó lại đúng là việc phát hiện HĐ bị điều chỉnh.
            p.AddWithValue("@so_lq",
                (object?)Nz(ChuanSoHd(S(r, M, "SOHD_LQUAN"))) ?? DBNull.Value);
            p.AddWithValue("@ngay_lq", (object?)D(r, M, "NGAY_LQUAN") ?? DBNull.Value);
            p.AddWithValue("@user", user);
            cmd.ExecuteNonQuery();
            return existed;
        }

        // Cùng một hóa đơn mà đệm số khác nhau thì ra HAI ma_hd khác nhau — bản cũ
        // "..._C26TMN_00014708" (8 chữ số) và bản nay "..._C26TMN_0014708" (7 chữ số) —
        // nên nạp lại đẻ ra hai dòng song song thay vì đè lên nhau (chốt Trường 13/08).
        //
        // Dọn trước khi ghi: xóa mọi bản có CÙNG phần đầu và CÙNG GIÁ TRỊ SỐ nhưng khác
        // ma_hd. Bản đang ghi luôn là bản mới và đầy đủ nhất, bản kia là rác.
        // Xóa chứ không đổi tên: nếu cả hai đã cùng tồn tại thì đổi tên sẽ đụng khóa
        // chính, mà rốt cuộc vẫn phải bỏ một bản.
        // Có 14 database đơn vị-năm, script đánh số chạy TAY từng cái — sót một cái là
        // mọi lần nạp vào đó chết với "Invalid column name". ThueService đã dính đúng
        // chuyện này với mấy cột của 015. Dò một lần mỗi job rồi ghi theo, đắt gần bằng
        // không mà không bao giờ vỡ.
        private static bool CoCot(SqlConnection c, string bang, string cot)
        {
            using var cmd = new SqlCommand("SELECT COL_LENGTH(@b, @c)", c);
            cmd.Parameters.AddWithValue("@b", bang);
            cmd.Parameters.AddWithValue("@c", cot);
            var o = cmd.ExecuteScalar();
            return o != null && o != DBNull.Value;
        }

        private static void DonBanTrungKhacDem(SqlConnection c, SqlTransaction tx,
                                               string maHd, string soHd)
        {
            // Số có ký tự lạ thì không dám dọn — không so được "cùng giá trị".
            if (!long.TryParse(soHd, out var soGoc)) return;
            int viTri = maHd.LastIndexOf('_');
            if (viTri < 0) return;

            // '_' '%' '[' là ký tự đại diện của LIKE, phải thoát — không thì "VAO_0101_"
            // khớp cả những mã chỉ hao hao.
            string mau = maHd[..(viTri + 1)]
                .Replace("[", "[[]").Replace("_", "[_]").Replace("%", "[%]") + "%";
            int batDau = viTri + 2;      // SUBSTRING của SQL đếm từ 1

            const string loc = @"ma_hd <> @moi AND ma_hd LIKE @mau
                                 AND TRY_CONVERT(bigint, SUBSTRING(ma_hd, @batdau, 50)) = @so";

            // LINE trước, master sau — ngược lại là bỏ mồ côi dòng hàng.
            foreach (var sql in new[]
            {
                $"DELETE FROM HOA_DON_LINE WHERE ma_hd IN (SELECT ma_hd FROM HOA_DON WHERE {loc})",
                $"DELETE FROM HOA_DON WHERE {loc}",
            })
            {
                using var cmd = new SqlCommand(sql, c, tx);
                cmd.Parameters.AddWithValue("@moi", maHd);
                cmd.Parameters.AddWithValue("@mau", mau);
                cmd.Parameters.AddWithValue("@batdau", batDau);
                cmd.Parameters.AddWithValue("@so", soGoc);
                cmd.ExecuteNonQuery();
            }
        }

        // masterTienVat / masterTienHang: tiền thuế và tiền hàng ghi ở mức HÓA ĐƠN. Chỉ
        // dùng để vá ca hóa đơn KHÔNG CÓ XML — cổng không khai gì ở tầng dòng cho loại
        // này, mà nó luôn đúng MỘT dòng nên cả tiền thuế lẫn thuế suất đều là của dòng
        // đó. Đo thật trên HOA_SANG T1: 27/27 hóa đơn thuộc nhóm này, không vá thì cả
        // tien_vat_l lẫn pt_vat đều trống.
        private void ReplaceLines(SqlConnection c, SqlTransaction tx, string maHd,
                                  List<IXLRow> lines, Dictionary<string,int> L, string user,
                                  decimal masterTienVat = 0m, decimal masterTienHang = 0m,
                                  bool coLoaiThue = false)
        {
            using (var del = new SqlCommand("DELETE FROM HOA_DON_LINE WHERE ma_hd=@id", c, tx))
            { del.Parameters.AddWithValue("@id", maHd); del.ExecuteNonQuery(); }

            foreach (var r in lines)
            {
                using var cmd = new SqlCommand($@"
                    INSERT INTO HOA_DON_LINE (ma_hd, stt_line, ten_hang_goc, dvt, so_luong,
                        don_gia, pt_vat, tien_ck, tien_vat_l, ma_ngan, tinh_chat, created_by,
                        ma_hang, ghi_no, ghi_co, ma_ct_no, ma_ct_co
                        {(coLoaiThue ? ", loai_thue" : "")})
                    VALUES (@id, @stt, @ten_goc, @dvt, @sl, @dg, @pt_vat, @ck,
                        @tien_vat_l, @ma_ngan, @tc, @user,
                        @ma_hang, @l_ghi_no, @l_ghi_co, @l_ma_ct_no, @l_ma_ct_co
                        {(coLoaiThue ? ", @loai_thue" : "")})", c, tx);
                var p = cmd.Parameters;
                p.AddWithValue("@id", maHd);
                p.AddWithValue("@stt", I2(r, L, "LINE_NO", "STT_LINE_G"));
                // Dự phòng sang cột CHUẨN HÓA, giống hệt so_luong/don_gia ngay dưới. Dòng
                // hóa đơn KHÔNG CÓ XML (điện, nước, ngân hàng) chỉ điền TEN_HANG/DVT và
                // để trống cặp _G — chỉ đọc _G thì số lượng, đơn giá vào được còn tên hàng
                // với đơn vị tính mất trắng. Đo thật: 22/22 dòng thiếu tên đều là NOXML.
                p.AddWithValue("@ten_goc", (object?)Nz(S2(r, L, "TEN_HANG", "TEN_HANG_G")) ?? DBNull.Value);
                p.AddWithValue("@dvt",     (object?)Nz(S2(r, L, "DVT", "DVT_G")) ?? DBNull.Value);
                // @sl / @dg gán ở CUỐI hàm: phải biết khongCoXml và thanhTien mới quyết
                // được — xem khối "SL × ĐG" bên dưới.
                // Thuế suất trong Excel là CHUỖI có dấu phần trăm ("10%"), không phải số.
                // N2 gọi DocSo — bộ đọc TIỀN — và decimal.TryParse chết ngay ở ký tự '%',
                // trả về 0 mà không báo gì: toàn bộ pt_vat trong DB bằng 0.
                // DocPhanTram lọc bỏ mọi ký tự không phải chữ số trước khi đọc, đúng việc.
                // Dùng S2 (lấy chuỗi) chứ không N2 (lấy số) để có giá trị thô mà lọc.
                // (biến ptVat khai ngay dưới, dùng lại cho tien_vat_l)
                string thueSuatTho = S2(r, L, "PT_VAT", "PT_VAT_L").Trim();
                if (coLoaiThue)
                {
                    // Giữ NGUYÊN chuỗi cổng khai. pt_vat bên dưới biến "KCT" thành 0, y
                    // hệt "0%" — hai thứ khác nhau ở tờ khai GTGT mà nhìn số không ra.
                    // Cắt 10 ký tự cho vừa NVARCHAR(10): dài hơn thế là cổng đổi khuôn,
                    // thà mất đuôi còn hơn cả mẻ nạp chết vì tràn cột.
                    string lt = thueSuatTho.Length > 10 ? thueSuatTho[..10] : thueSuatTho;
                    p.AddWithValue("@loai_thue", (object?)Nz(lt) ?? DBNull.Value);
                }
                decimal ptVat = DocThueSuat(thueSuatTho);

                // Hóa đơn KHÔNG CÓ XML không có thuế suất ở tầng dòng — suy từ chính hóa
                // đơn: tiền thuế / tiền hàng (chốt Trường 12/08).
                //
                // Nhận diện bằng NGUON_DL, KHÔNG bằng "hóa đơn chỉ có một dòng" (chốt
                // Trường 12/08). Một dòng là HỆ QUẢ của việc thiếu file chi tiết, không
                // phải bản chất — mà hệ quả đó không độc quyền: đo trên HOA_SANG T2 có
                // 29 hóa đơn CÓ XML mà vẫn chỉ một dòng. Bắt theo hệ quả là vơ cả nhóm
                // đó vào, rồi đắp số bình quân của hóa đơn lên dòng vốn đã có số thật.
                //
                // Làm tròn về số nguyên cho khớp cột `vat` ở HOA_DON (kiểu INT) — hai chỗ
                // ra hai số khác nhau thì người đọc không biết tin cái nào.
                bool khongCoXml = S(r, L, "NGUON_DL")
                    .Equals("EXCEL_NO_XML", StringComparison.OrdinalIgnoreCase);

                if (ptVat == 0 && khongCoXml && masterTienVat != 0 && masterTienHang > 0)
                    ptVat = Math.Round(masterTienVat * 100m / masterTienHang, 0,
                                       MidpointRounding.AwayFromZero);

                p.AddWithValue("@pt_vat", ptVat);
                decimal tienCk = N(r, L, "CK_LINE_G");
                p.AddWithValue("@ck", tienCk);

                // pt_ck và tien_vat_l trước KHÔNG nằm trong câu INSERT — chưa bao giờ được
                // ghi, 461/461 dòng NULL. Cổng TCT không trả sẵn hai số này ở tầng dòng
                // (XML_MAP chỉ map 10 trường, không có TLCKhau lẫn tiền thuế của dòng), nên
                // SUY RA từ những gì có. Suy được thì ghi, không thì để NULL — đừng ghi 0,
                // vì 0 đọc như "chiết khấu 0%" trong khi sự thật là "không biết".
                decimal thanhTien = N2(r, L, "THANH_TIEN", "TTIEN_LINE");
                object tienVatL;
                if (khongCoXml)
                {
                    // Nhánh này phải xét TRƯỚC. THANH_TIEN của dòng không-có-XML là tiền
                    // ĐÃ GỒM VAT (spec 1.3.4), khác hẳn dòng đọc từ XML vốn là tiền chưa
                    // thuế. Nhân thuế suất vào nó là tính thừa: ca thật 51.228 × 10% =
                    // 5.122 trong khi thuế thật của hóa đơn là 4.657.
                    //
                    // Lấy thẳng tiền thuế của hóa đơn, không chặn gì thêm: dòng này do
                    // build_rows_from_excel_without_xml của script tự sinh, mỗi hóa đơn
                    // đúng một dòng — không phải cổng trả về nên không có chuyện nhiều dòng.
                    tienVatL = masterTienVat != 0 ? masterTienVat : (object)DBNull.Value;
                }
                else
                {
                    // ptVat > 0 chứ KHÔNG phải != 0: từ 14/08 giá trị âm là MÃ LOẠI
                    // (-1 không kê khai, -2 không chịu thuế) chứ không phải thuế suất.
                    // Nhân vào là ra tiền thuế ÂM cho 954 dòng vốn không có thuế nào.
                    tienVatL = thanhTien != 0 && ptVat > 0
                        ? Math.Round(thanhTien * ptVat / 100m, 2) : (object)DBNull.Value;
                }
                p.AddWithValue("@tien_vat_l", tienVatL);

                // pt_ck (% chiết khấu) CỐ Ý để trống (chốt Trường 12/08). Cổng có trường
                // TLCKhau nhưng XML_MAP không map, nên chỉ suy ngược được từ tiền chiết
                // khấu chia SL×ĐG — mà số suy ra không phải số người bán khai. Số tiền
                // chiết khấu đã nằm ở tien_ck, đủ dùng. Cần % thật thì thêm TLCKhau vào
                // XML_MAP rồi tải lại, ĐỪNG tính lại ở đây.
                // ===== SL × ĐG =====
                // HOA_DON_LINE KHÔNG có cột thành tiền — tiền hàng của dòng là SL × ĐG.
                // Dòng nào thiếu một trong hai thì coi như dòng đó trị giá 0, và tiền hàng
                // của cả hóa đơn hụt theo.
                decimal sl = N2(r, L, "SO_LUONG", "SO_LUONG_G");
                decimal dg = N2(r, L, "DON_GIA",  "DON_GIA_G");

                if (khongCoXml)
                {
                    // Script đặt sẵn SL=1, ĐG=TỔNG TIỀN (đã gồm VAT). Đổi về tiền CHƯA
                    // thuế (chốt Trường 13/08) để cột don_gia trong DB chỉ mang MỘT nghĩa
                    // duy nhất — cùng một cột mà lúc gồm thuế lúc không là bẫy cho mọi
                    // báo cáo về sau.
                    sl = 1m;
                    if (masterTienHang > 0) dg = masterTienHang;
                }
                else
                {
                    // Vá SL/ĐG khuyết bằng ĐÚNG hàm mà phép kiểm Σ ở ImportJob dùng — hai
                    // bên phải ra cùng một con số, không thì lại tái diễn cảnh "khớp lúc
                    // kiểm, mất lúc ghi". thanhTien của dòng đọc từ XML là tiền CHƯA thuế
                    // nên dùng thẳng được.
                    (sl, dg) = SoLuongDonGia(sl, dg, thanhTien);
                }
                p.AddWithValue("@sl", sl);
                p.AddWithValue("@dg", dg);

                // Định khoản tầng DÒNG (chốt Trường 13/08):
                //   VÀO  Nợ 156 / Có 331   ma_ct_no = ma_hang, ma_ct_co = ""
                //   RA   Nợ 632 / Có 156   ma_ct_no = "",      ma_ct_co = ma_hang
                // Đầu ra là bút toán GIÁ VỐN (632/156) chứ không phải doanh thu — doanh
                // thu đã nằm ở tầng hóa đơn (131/511), ghi lại lần nữa ở đây là kê hai lần.
                //
                // ma_hang = H0 cho MỌI dòng: hàng thật chưa vào DM_HANG lúc nạp, chờ kế
                // toán định khoản mới lưu. Tên hàng gốc vẫn nằm ở ten_hang_goc.
                // Hướng lấy từ chính dòng hàng (sheet line có sẵn cột HUONG) chứ không
                // truyền thêm tham số — ít chỗ sai hơn, và dòng nào cũng tự mang hướng của nó.
                bool laRa = S(r, L, "HUONG").Equals("RA", StringComparison.OrdinalIgnoreCase);
                p.AddWithValue("@ma_hang", DanhMucService.MA_HANG_TAM);
                p.AddWithValue("@l_ghi_no", laRa ? "632" : "156");
                p.AddWithValue("@l_ghi_co", laRa ? "156" : "331");
                p.AddWithValue("@l_ma_ct_no", laRa ? "" : DanhMucService.MA_HANG_TAM);
                p.AddWithValue("@l_ma_ct_co", laRa ? DanhMucService.MA_HANG_TAM : "");

                p.AddWithValue("@ma_ngan", (object?)Nz(S(r, L, "MA_NGAN_G")) ?? DBNull.Value);
                p.AddWithValue("@tc", I(r, L, "LOAI_HH"));
                p.AddWithValue("@user", user);
                cmd.ExecuteNonQuery();
            }
        }

        // Dời bản gốc sang kho SCAN_DOC. GIỮ NGUYÊN TÊN FILE (chốt với Trường 03/08):
        // tên do bên tải HĐ đặt đã có MST + ký hiệu + số HĐ nên tự nó đủ phân biệt,
        // đổi tên ở đây chỉ tạo thêm một quy ước nữa để sai.
        //   .html → SCAN_DOC\<MA>\NAM<năm>\<HUONG>_T<tháng>_<năm>\        (user xem HĐ gốc)
        //   .xml  → SCAN_DOC\<MA>\NAM<năm>\xmls_only\<huong>\t<tháng>\    (kho XML để máy đọc)
        private int MoveArtifacts(string jobDir, string huong, int thang, int nam,
                                  string scanTenantYearDir, string xmlPath)
        {
            // XML_PATH trong Excel là đường TUYỆT ĐỐI của máy đã tải → không tin nó;
            // tìm theo TÊN FILE trong chính thư mục job đang nạp, trượt mới thử đường gốc
            string fileName = Path.GetFileName(xmlPath);
            string srcXml = Path.Combine(jobDir, "raw", huong, fileName);
            if (!File.Exists(srcXml)) srcXml = xmlPath;

            string dstHtmlDir = Path.Combine(scanTenantYearDir, $"{huong}_T{thang}_{nam}");
            string dstXmlDir  = Path.Combine(scanTenantYearDir, "xmls_only",
                                             huong.ToLowerInvariant(), $"t{thang}");

            int n = 0;
            foreach (var (ext, dstDir) in new[] { (".html", dstHtmlDir), (".xml", dstXmlDir) })
            {
                var src = Path.ChangeExtension(srcXml, ext);
                if (!File.Exists(src)) continue;
                Directory.CreateDirectory(dstDir);   // chỉ dựng thư mục khi thật sự có file
                File.Move(src, Path.Combine(dstDir, Path.GetFileName(src)), overwrite: true);
                n++;
            }
            return n;
        }

        private async Task UpsertTaskStatus(Guid tenantId, int nam, int thang, string taskCode,
                                            string status, int soLuong, string message, string user)
        {
            await _db.Database.ExecuteSqlRawAsync(@"
                MERGE TaskStatus AS t
                USING (SELECT {0} AS TenantId, {1} AS Nam, {2} AS Thang, {3} AS TaskCode) AS s
                ON t.TenantId=s.TenantId AND t.Nam=s.Nam AND t.Thang=s.Thang AND t.TaskCode=s.TaskCode
                WHEN MATCHED THEN UPDATE SET Status={4}, SoLuong={5}, Message={6}, UpdatedBy={7}, UpdatedAt=SYSDATETIME()
                WHEN NOT MATCHED THEN INSERT (TenantId,Nam,Thang,TaskCode,Status,SoLuong,Message,UpdatedBy)
                    VALUES (s.TenantId,s.Nam,s.Thang,s.TaskCode,{4},{5},{6},{7});
                INSERT INTO ActivityLog (UserName, TenantId, Nam, Thang, Action, Detail)
                VALUES ({7}, {0}, {1}, {2}, {3} + N'_DONE', {6});",
                tenantId, nam, thang, taskCode, status, soLuong, message, user);
        }

        // ================= BỘ ĐỌC Ô v2 — chịu chữ, chịu trống, có fallback =================
        private static Dictionary<string,int> HeaderMap(IXLWorksheet ws)
        {
            var map = new Dictionary<string,int>(StringComparer.OrdinalIgnoreCase);
            foreach (var c in ws.Row(1).CellsUsed()) map[c.GetString().Trim()] = c.Address.ColumnNumber;
            return map;
        }
        private static string S(IXLRow r, Dictionary<string,int> m, string col) =>
            m.TryGetValue(col, out var i) ? r.Cell(i).GetString().Trim() : "";
        private static string S2(IXLRow r, Dictionary<string,int> m, string col, string fb)
        { var v = S(r, m, col); return v != "" ? v : S(r, m, fb); }
        private static string? Nz(string s) => string.IsNullOrWhiteSpace(s) ? null : s;

        private static decimal N(IXLRow r, Dictionary<string,int> m, string col)
        {
            if (!m.TryGetValue(col, out var i)) return 0m;
            var cell = r.Cell(i);
            // Ô SỐ thật thì lấy thẳng — không có dấu phân cách nào để hiểu nhầm.
            // Chỉ ô Text mới phải đoán khuôn, và đó là chỗ từng gây họa (xem DocSo).
            if (cell.DataType == XLDataType.Number && cell.TryGetValue<decimal>(out var v))
                return v;
            return DocSo(cell.GetString());
        }

        // Đọc một con số ghi dưới dạng CHUỖI trong Excel.
        //
        // Vì sao phải cẩn thận đến thế: Excel tổng do Python sinh ra không nhất quán —
        // có file ghi "2152778.40" (dấu chấm thập phân), có file ghi "128929583,000000"
        // (dấu phẩy thập phân, 6 chữ số lẻ). Bản cũ cứ Replace(",", "") rồi parse với
        // NumberStyles.Any: gặp khuôn thứ hai là "128929583,000000" thành 128929583000000
        // — sai GẤP 10^6. Đó chính là thứ đã ghi 32 hóa đơn sai vào HOA_SANG_2026 lúc
        // 11:03 ngày 10/08/2026 (VAT lên tới 13.909.091.000.000) và đá hàng loạt hóa đơn
        // khác ra raw\ vì Σ line lệch.
        //
        // Quy tắc: dấu phân cách XUẤT HIỆN SAU CÙNG là dấu thập phân; loại còn lại là
        // phân cách nghìn. Một loại xuất hiện nhiều lần thì chắc chắn là phân cách nghìn.
        // Xuất hiện đúng một lần và là loại duy nhất thì coi là dấu thập phân — dữ liệu
        // TCT không bao giờ ghi phân cách nghìn, nên đây là suy đoán đúng với nguồn thật.
        internal static decimal DocSo(string tho)
        {
            string s = (tho ?? "").Trim().Replace(" ", "").Replace(" ", "");
            if (s.Length == 0) return 0m;

            int viTriCham = s.LastIndexOf('.');
            int viTriPhay = s.LastIndexOf(',');

            if (viTriCham >= 0 && viTriPhay >= 0)
            {
                // Có cả hai: cái đứng sau là dấu thập phân
                char thapPhan = viTriCham > viTriPhay ? '.' : ',';
                char nghin    = thapPhan == '.' ? ',' : '.';
                s = s.Replace(nghin.ToString(), "").Replace(thapPhan, '.');
            }
            else if (viTriCham >= 0 || viTriPhay >= 0)
            {
                char dau = viTriCham >= 0 ? '.' : ',';
                int soLan = s.Count(c => c == dau);
                s = soLan > 1
                    ? s.Replace(dau.ToString(), "")   // nhiều lần → phân cách nghìn
                    : s.Replace(dau, '.');            // một lần → dấu thập phân
            }

            // KHÔNG dùng NumberStyles.Any: nó bật AllowThousands, mà tới đây chuỗi đã
            // sạch phân cách nghìn rồi — để bật chỉ tổ mở lại đúng cái cửa vừa đóng.
            return decimal.TryParse(s,
                System.Globalization.NumberStyles.AllowLeadingSign
              | System.Globalization.NumberStyles.AllowDecimalPoint,
                System.Globalization.CultureInfo.InvariantCulture, out var p) ? p : 0m;
        }
        private static decimal N2(IXLRow r, Dictionary<string,int> m, string col, string fb)
        { var v = N(r, m, col); return v != 0m ? v : N(r, m, fb); }

        private static int I(IXLRow r, Dictionary<string,int> m, string col)
        {
            if (!m.TryGetValue(col, out var i)) return 0;
            var cell = r.Cell(i);
            if (cell.TryGetValue<int>(out var v)) return v;
            return int.TryParse(cell.GetString().Trim(), out var p) ? p : 0;
        }
        private static int I2(IXLRow r, Dictionary<string,int> m, string col, string fb)
        { var v = I(r, m, col); return v != 0 ? v : I(r, m, fb); }

        private static readonly string[] DateFormats =
            { "yyyy-MM-dd", "dd/MM/yyyy", "d/M/yyyy", "yyyy-MM-dd HH:mm:ss", "dd-MM-yyyy" };
        private static DateTime? D(IXLRow r, Dictionary<string,int> m, string col)
        {
            if (!m.TryGetValue(col, out var i)) return null;
            var cell = r.Cell(i);
            if (cell.TryGetValue<DateTime>(out var v)) return v;
            var s = cell.GetString().Trim();
            if (s == "") return null;
            if (DateTime.TryParseExact(s, DateFormats, System.Globalization.CultureInfo.InvariantCulture,
                System.Globalization.DateTimeStyles.None, out var p)) return p;
            return DateTime.TryParse(s, System.Globalization.CultureInfo.InvariantCulture,
                System.Globalization.DateTimeStyles.None, out var q) ? q : (DateTime?)null;
        }
        private static DateTime? D2(IXLRow r, Dictionary<string,int> m, string col, string fb) =>
            D(r, m, col) ?? D(r, m, fb);
    }
}