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

    // Một dòng hàng đọc thẳng từ XML gốc của TCT
    public record MatHang(int Stt, string TenHang, string Dvt, decimal SoLuong,
                          decimal DonGia, decimal ThanhTien, string ThueSuat);

    // Một hóa đơn còn nằm lại raw\ — dựng từ chính file XML chứ không từ Excel tổng,
    // vì file lạc (không có dòng master) thì trong Excel không có gì để đọc.
    public record HoaDonConLai(
        string TenFile, string Huong, int Thang, string MauSo, string KhHd, string SoHd,
        string Ngay, string MstBan, string TenBan, string MstMua, string TenMua,
        decimal TienHang, decimal TienVat, decimal TongTien,
        string LyDo, bool CoTrongExcel, List<MatHang> MatHangs);

    public class ImportService
    {
        private readonly AppDbContext _db;
        private readonly TenantDbResolver _resolver;
        private readonly IConfiguration _config;
        public ImportService(AppDbContext db, TenantDbResolver resolver, IConfiguration config)
        { _db = db; _resolver = resolver; _config = config; }

        public async Task<KetQuaNapJob> ImportJob(ImportJobRequest req, string userName)
        {
            var tenant = await _db.Tenants.FindAsync(req.TenantId)
                ?? throw new ArgumentException("Không tìm thấy đơn vị");

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

            using var conn = new SqlConnection(
                _resolver.GetTenantConnection(tenant.Code, req.Nam));
            await conn.OpenAsync();

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
                    string maHd = S(r, M, "MA_HD");
                    if (maHd == "") continue;

                    // Ngày: chuẩn hóa → fallback _G (đều có thể là CHUỖI)
                    DateTime? ngay = D2(r, M, "NGAY_HD", "NGAY_HD_G");
                    if (ngay == null) { skippedNoDate++;
                        errors.Add(new LoiNap(maHd, huong, "KHONG_RO_NGAY",
                            "Không đọc được NGAY_HD/NGAY_HD_G")); continue; }
                    if (ngay.Value.Year != req.Nam) { skippedYear++; continue; }  // BR-IMP-01 lớp DÒNG

                    var lines = linesByHd.GetValueOrDefault(maHd) ?? new List<IXLRow>();

                    // ---- Kiểm Σ line = master: ưu tiên cặp chuẩn hóa, trống thì cặp _G ----
                    // Sai số cho phép DƯỚI 10 đồng (chốt với Trường 03/08). Lý do: XML gốc
                    // của TCT có HĐ ghi đơn giá lẻ tới phần thập phân, cộng lại lệch vài
                    // hào so với tổng đã làm tròn — vd HUY_THANH T1/2026 lệch 0,4đ và 0,25đ.
                    // Từ 10 đồng trở lên là sai thật, phải để lại raw\ xử lý tay.
                    const decimal SAI_SO_CHO_PHEP = 10m;
                    decimal mNorm = N(r, M, "TIEN_HANG");
                    decimal sNorm = lines.Sum(x => N(x, L, "THANH_TIEN"));
                    decimal mG    = N(r, M, "TT_HD_G");
                    decimal sG    = lines.Sum(x => N(x, L, "TTIEN_LINE"));
                    bool useNorm  = mNorm != 0 || sNorm != 0;
                    decimal masterVal = useNorm ? mNorm : mG;
                    decimal sumLine   = useNorm ? sNorm : sG;

                    // HĐ đặc biệt không có gốc trên TCT (điện, viễn thông, ngân hàng —
                    // NGUON_DL = EXCEL_NO_XML): THANH_TIEN của line là tiền ĐÃ GỒM VAT,
                    // trong khi TIEN_HANG của master là tiền CHƯA VAT. So thẳng hai cái đó
                    // là so nhầm cặp — mọi HĐ loại này đều bị đá ra oan, chênh đúng bằng
                    // số tiền VAT. Đo bằng dữ liệu HUY_THANH T1/2026: 22/22 dòng như vậy.
                    // Với nhóm này phải so TONG_TIEN (đã gồm VAT) với Σ THANH_TIEN.  [spec 1.3.4]
                    if (S(r, M, "NGUON_DL").Equals("EXCEL_NO_XML", StringComparison.OrdinalIgnoreCase))
                    {
                        decimal tongTien = N(r, M, "TONG_TIEN");
                        if (tongTien == 0) tongTien = mNorm + N(r, M, "TIEN_VAT");
                        masterVal = tongTien;
                        sumLine   = sNorm;
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
                        bool existed = UpsertMaster(conn, tx, r, M, huong, maHd, userName);
                        ReplaceLines(conn, tx, maHd, lines, L, userName);
                        tx.Commit();
                        if (existed) updated++; else inserted++;
                        ghiXong = true;
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
                    if (string.IsNullOrWhiteSpace(xmlPath)) { khongCoGoc++; continue; }
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
            }

            await UpsertTaskStatus(tenant.Id, req.Nam, req.Thang, "NAP_HD",
                errors.Count == 0 ? "done" : "done_thieu",
                inserted + updated,
                $"Mới {inserted}, cập nhật {updated}, lệch năm {skippedYear}, không rõ ngày {skippedNoDate}, "
              + $"không có gốc {khongCoGoc}, lỗi {errors.Count}",
                userName);

            await LuuLoiNap(tenant.Id, req.Nam, req.Thang, errors, userName);

            int lechTong = errors.Count(e => e.LoaiLoi == "LECH_TONG");
            return new KetQuaNapJob
            {
                Inserted = inserted, Updated = updated,
                SkippedYear = skippedYear, SkippedNoDate = skippedNoDate,
                KhongCoGoc = khongCoGoc, Moved = moved, LechTong = lechTong,
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

                        // MA_HD kết thúc bằng _<KHHD>_<SO_HD>, tên file cũng vậy
                        string duoi = $"_{hd.KhHd}_{hd.SoHd}";
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
            string soHd = req.SoHd.Trim();
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
                      ? @"UPDATE HOA_DON SET ngay=@ngay, thang=@thang, khhd=@khhd, so_hd=@so_hd,
                            mst=@mst, ten_kh=@ten_kh, dia_chi=@dia_chi, tien_vat=@tien_vat,
                            tien_ck=@tien_ck, edit_vat=@edit_vat, edit_ck=@edit_ck,
                            updated_by=@user, updated_at=SYSDATETIME()
                          WHERE ma_hd=@id"
                      : @"INSERT INTO HOA_DON (ma_hd, ngay, thang, khhd, so_hd, mst, ten_kh, dia_chi,
                            tien_vat, tien_ck, edit_vat, edit_ck, created_by)
                          VALUES (@id, @ngay, @thang, @khhd, @so_hd, @mst, @ten_kh, @dia_chi,
                            @tien_vat, @tien_ck, @edit_vat, @edit_ck, @user)";
                    using (var cmd = new SqlCommand(sql, conn, tx))
                    {
                        var p = cmd.Parameters;
                        p.AddWithValue("@id", maHd);
                        p.AddWithValue("@ngay", ngay.Date);
                        p.AddWithValue("@thang", ngay.Month);
                        p.AddWithValue("@khhd", khhd);
                        p.AddWithValue("@so_hd", soHd);
                        p.AddWithValue("@mst", (object?)Nz(req.Mst) ?? DBNull.Value);
                        p.AddWithValue("@ten_kh", (object?)Nz(req.TenKh) ?? DBNull.Value);
                        p.AddWithValue("@dia_chi", (object?)Nz(req.DiaChi) ?? DBNull.Value);
                        p.AddWithValue("@tien_vat", req.TienVat);
                        p.AddWithValue("@tien_ck", req.TienCk);
                        p.AddWithValue("@edit_vat", req.TienVat > 0);
                        p.AddWithValue("@edit_ck", req.TienCk > 0);
                        p.AddWithValue("@user", userName);
                        await cmd.ExecuteNonQueryAsync();
                    }

                    using (var del = new SqlCommand("DELETE FROM HOA_DON_LINE WHERE ma_hd=@id", conn, tx))
                    { del.Parameters.AddWithValue("@id", maHd); await del.ExecuteNonQueryAsync(); }

                    foreach (var m in req.MatHangs)
                    {
                        using var ins = new SqlCommand(@"
                            INSERT INTO HOA_DON_LINE (ma_hd, stt_line, ten_hang_goc, dvt, so_luong,
                                don_gia, pt_vat, tien_ck, tinh_chat, created_by)
                            VALUES (@id, @stt, @ten, @dvt, @sl, @dg, @pt_vat, 0, @tc, @user)", conn, tx);
                        var p = ins.Parameters;
                        p.AddWithValue("@id", maHd);
                        p.AddWithValue("@stt", m.Stt);
                        p.AddWithValue("@ten", (object?)Nz(m.TenHang) ?? DBNull.Value);
                        p.AddWithValue("@dvt", (object?)Nz(m.Dvt) ?? DBNull.Value);
                        p.AddWithValue("@sl", m.SoLuong);
                        p.AddWithValue("@dg", m.DonGia);
                        p.AddWithValue("@pt_vat", DocPhanTram(m.ThueSuat));
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
                    hangs.Add(new MatHang(
                        int.TryParse(V(h, "STT"), out var stt) ? stt : hangs.Count + 1,
                        V(h, "THHDVu"), V(h, "DVTinh"),
                        D(h, "SLuong"), D(h, "DGia"), D(h, "ThTien"), V(h, "TSuat")));

                return new HoaDonConLai(
                    Path.GetFileName(path), huong, thang,
                    V(chung, "KHMSHDon"), V(chung, "KHHDon"), V(chung, "SHDon"), V(chung, "NLap"),
                    V(ban, "MST"), V(ban, "Ten"), V(mua, "MST"), V(mua, "Ten"),
                    D(tt, "TgTCThue"), D(tt, "TgTThue"), D(tt, "TgTTTBSo"),
                    "", false, hangs);
            }
            catch { return null; }
        }

        private bool UpsertMaster(SqlConnection c, SqlTransaction tx, IXLRow r,
                                  Dictionary<string,int> M, string huong, string maHd, string user)
        {
            bool existed;
            using (var chk = new SqlCommand("SELECT COUNT(*) FROM HOA_DON WHERE ma_hd=@id", c, tx))
            { chk.Parameters.AddWithValue("@id", maHd); existed = (int)chk.ExecuteScalar()! > 0; }

            // khhd GHÉP kiểu + ký hiệu; ký hiệu ưu tiên chuẩn hóa, trống lùi về _G
            string khhd = S(r, M, "KIEU_HD") + S2(r, M, "KHHD", "KHHD_G");
            string soHd = S2(r, M, "SO_HD", "SO_HD_G");
            string mst   = huong == "VAO" ? S(r, M, "MST_BAN")  : S(r, M, "MST_MUA");
            string tenKh = huong == "VAO" ? S(r, M, "TEN_BAN")  : S(r, M, "TEN_MUA");
            string diaChi= huong == "VAO" ? S(r, M, "DCHI_BAN") : S(r, M, "DCHI_MUA");
            decimal tienVat = N2(r, M, "TIEN_VAT", "TVAT_HD_G");
            decimal tienCk  = N2(r, M, "TIEN_CK",  "TIEN_CK_G");

            string sql = existed
              ? @"UPDATE HOA_DON SET ngay=@ngay, thang=@thang, khhd=@khhd, so_hd=@so_hd,
                    mst=@mst, ten_kh=@ten_kh, dia_chi=@dia_chi, nguoi_giao_dich=@ng_gd,
                    tien_vat=@tien_vat, tien_ck=@tien_ck, edit_vat=@edit_vat, edit_ck=@edit_ck,
                    tthai_hd=@tthai, tich_chat_hd_lienquan=@tc_lq, loai_hd_lienquan=@l_lq,
                    mau_so_hd_lienquan=@ms_lq, khhd_lienquan=@kh_lq, sohd_lienquan=@so_lq,
                    ngay_lienquan=@ngay_lq, updated_by=@user, updated_at=SYSDATETIME()
                  WHERE ma_hd=@id"
              : @"INSERT INTO HOA_DON (ma_hd, ngay, thang, khhd, so_hd, mst, ten_kh, dia_chi,
                    nguoi_giao_dich, tien_vat, tien_ck, edit_vat, edit_ck, tthai_hd,
                    tich_chat_hd_lienquan, loai_hd_lienquan, mau_so_hd_lienquan,
                    khhd_lienquan, sohd_lienquan, ngay_lienquan, created_by)
                  VALUES (@id, @ngay, @thang, @khhd, @so_hd, @mst, @ten_kh, @dia_chi,
                    @ng_gd, @tien_vat, @tien_ck, @edit_vat, @edit_ck, @tthai,
                    @tc_lq, @l_lq, @ms_lq, @kh_lq, @so_lq, @ngay_lq, @user)";

            using var cmd = new SqlCommand(sql, c, tx);
            var p = cmd.Parameters;
            p.AddWithValue("@id", maHd);
            p.AddWithValue("@ngay", (object?)D2(r, M, "NGAY_HD", "NGAY_HD_G") ?? DBNull.Value);
            p.AddWithValue("@thang", I(r, M, "THANG"));
            p.AddWithValue("@khhd", khhd);
            p.AddWithValue("@so_hd", soHd);
            p.AddWithValue("@mst", (object?)Nz(mst) ?? DBNull.Value);
            p.AddWithValue("@ten_kh", (object?)Nz(tenKh) ?? DBNull.Value);
            p.AddWithValue("@dia_chi", (object?)Nz(diaChi) ?? DBNull.Value);
            p.AddWithValue("@ng_gd", (object?)Nz(S(r, M, "NG_GD")) ?? DBNull.Value);
            p.AddWithValue("@tien_vat", tienVat);
            p.AddWithValue("@tien_ck", tienCk);
            p.AddWithValue("@edit_vat", tienVat > 0);   // BR: chốt số thuế HĐ gốc — không auto-tính đè
            p.AddWithValue("@edit_ck",  tienCk  > 0);
            p.AddWithValue("@tthai", (object?)Nz(S(r, M, "TTHAI_HD")) ?? DBNull.Value);
            p.AddWithValue("@tc_lq", (object?)Nz(S(r, M, "TCHD_LQUAN")) ?? DBNull.Value);
            p.AddWithValue("@l_lq",  (object?)Nz(S(r, M, "LHD_LQUAN")) ?? DBNull.Value);
            p.AddWithValue("@ms_lq", (object?)Nz(S(r, M, "MSHD_LQUAN")) ?? DBNull.Value);
            p.AddWithValue("@kh_lq", (object?)Nz(S(r, M, "KHHD_LQUAN")) ?? DBNull.Value);
            p.AddWithValue("@so_lq", (object?)Nz(S(r, M, "SOHD_LQUAN")) ?? DBNull.Value);
            p.AddWithValue("@ngay_lq", (object?)D(r, M, "NGAY_LQUAN") ?? DBNull.Value);
            p.AddWithValue("@user", user);
            cmd.ExecuteNonQuery();
            return existed;
        }

        private void ReplaceLines(SqlConnection c, SqlTransaction tx, string maHd,
                                  List<IXLRow> lines, Dictionary<string,int> L, string user)
        {
            using (var del = new SqlCommand("DELETE FROM HOA_DON_LINE WHERE ma_hd=@id", c, tx))
            { del.Parameters.AddWithValue("@id", maHd); del.ExecuteNonQuery(); }

            foreach (var r in lines)
            {
                using var cmd = new SqlCommand(@"
                    INSERT INTO HOA_DON_LINE (ma_hd, stt_line, ten_hang_goc, dvt, so_luong,
                        don_gia, pt_vat, tien_ck, ma_ngan, tinh_chat, created_by)
                    VALUES (@id, @stt, @ten_goc, @dvt, @sl, @dg, @pt_vat, @ck, @ma_ngan, @tc, @user)", c, tx);
                var p = cmd.Parameters;
                p.AddWithValue("@id", maHd);
                p.AddWithValue("@stt", I2(r, L, "LINE_NO", "STT_LINE_G"));
                p.AddWithValue("@ten_goc", (object?)Nz(S(r, L, "TEN_HANG_G")) ?? DBNull.Value);
                p.AddWithValue("@dvt",     (object?)Nz(S(r, L, "DVT_G")) ?? DBNull.Value);
                p.AddWithValue("@sl", N2(r, L, "SO_LUONG", "SO_LUONG_G"));
                p.AddWithValue("@dg", N2(r, L, "DON_GIA", "DON_GIA_G"));
                p.AddWithValue("@pt_vat", N2(r, L, "PT_VAT", "PT_VAT_L"));
                p.AddWithValue("@ck", N(r, L, "CK_LINE_G"));
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
            if (cell.TryGetValue<decimal>(out var v)) return v;
            var s = cell.GetString().Trim().Replace(",", "");
            return decimal.TryParse(s, System.Globalization.NumberStyles.Any,
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