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
    public class ImportService
    {
        private readonly AppDbContext _db;
        private readonly TenantDbResolver _resolver;
        private readonly IConfiguration _config;
        public ImportService(AppDbContext db, TenantDbResolver resolver, IConfiguration config)
        { _db = db; _resolver = resolver; _config = config; }

        public async Task<object> ImportJob(ImportJobRequest req, string userName)
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

            var errors = new List<object>();
            int inserted = 0, updated = 0, skippedYear = 0, skippedNoDate = 0, moved = 0;

            using var conn = new SqlConnection(
                _resolver.GetTenantConnection(tenant.Code, req.Nam));
            await conn.OpenAsync();

            foreach (var huong in new[] { "VAO", "RA" })
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
                        errors.Add(new { maHd, reason = "Không đọc được NGAY_HD/NGAY_HD_G" }); continue; }
                    if (ngay.Value.Year != req.Nam) { skippedYear++; continue; }  // BR-IMP-01 lớp DÒNG

                    var lines = linesByHd.GetValueOrDefault(maHd) ?? new List<IXLRow>();

                    // ---- Kiểm Σ line = master: ưu tiên cặp chuẩn hóa, trống thì cặp _G ----
                    decimal tol = 1m;
                    decimal mNorm = N(r, M, "TIEN_HANG");
                    decimal sNorm = lines.Sum(x => N(x, L, "THANH_TIEN"));
                    decimal mG    = N(r, M, "TT_HD_G");
                    decimal sG    = lines.Sum(x => N(x, L, "TTIEN_LINE"));
                    bool useNorm  = mNorm != 0 || sNorm != 0;
                    decimal masterVal = useNorm ? mNorm : mG;
                    decimal sumLine   = useNorm ? sNorm : sG;
                    if ((masterVal != 0 || sumLine != 0) && Math.Abs(masterVal - sumLine) > tol)
                    {
                        errors.Add(new { maHd, reason =
                            $"Σ line ({sumLine:N0}) ≠ master ({masterVal:N0}) — để lại raw\\ xử lý tay" });
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
                        errors.Add(new { maHd, reason = ex.Message });
                    }

                    // Dời file NGOÀI transaction: đã Commit rồi thì đừng để lỗi dời file rơi
                    // vào catch ở trên — Rollback một transaction đã commit sẽ ném tiếp và
                    // giết cả vòng nạp. Hỏng khâu này thì HĐ vẫn vào DB, chỉ báo để dời tay.
                    if (!ghiXong) continue;
                    try
                    {
                        moved += MoveArtifacts(jobDir, huong, req.Thang, req.Nam,
                                               scanDir, S(r, M, "XML_PATH"), maHd);
                    }
                    catch (Exception ex)
                    {
                        errors.Add(new { maHd, reason = $"Đã ghi DB nhưng không dời được file: {ex.Message}" });
                    }
                }
            }

            await UpsertTaskStatus(tenant.Id, req.Nam, req.Thang, "NAP_HD",
                errors.Count == 0 ? "done" : "done_thieu",
                inserted + updated,
                $"Mới {inserted}, cập nhật {updated}, lệch năm {skippedYear}, không rõ ngày {skippedNoDate}, lỗi {errors.Count}",
                userName);

            return new { inserted, updated, skippedYear, skippedNoDate, moved, errors };
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

        private int MoveArtifacts(string jobDir, string huong, int thang, int nam,
                                  string scanTenantYearDir, string xmlPath, string maHd)
        {
            if (string.IsNullOrWhiteSpace(xmlPath)) return 0;   // HĐ không XML (điện, viễn thông…)

            // XML_PATH trong Excel là đường TUYỆT ĐỐI của máy đã tải → không tin nó;
            // tìm theo TÊN FILE trong chính thư mục job đang nạp, trượt mới thử đường gốc
            string fileName = Path.GetFileName(xmlPath);
            string srcXml = Path.Combine(jobDir, "raw", huong, fileName);
            if (!File.Exists(srcXml)) srcXml = xmlPath;

            // Tầng đích theo mẫu Leader: SCAN_DOC\<MA>\NAM<năm>\<HUONG>_T<tháng>_<năm>\
            string dstDir = Path.Combine(scanTenantYearDir, $"{huong}_T{thang}_{nam}");
            Directory.CreateDirectory(dstDir);   // chưa có tầng nào thì tự dựng đủ

            int n = 0;
            foreach (var ext in new[] { ".xml", ".html" })
            {
                var src = Path.ChangeExtension(srcXml, ext);
                if (File.Exists(src))
                {
                    File.Move(src, Path.Combine(dstDir, maHd + ext), overwrite: true);
                    n++;
                }
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