using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using KT2000.Api.Data;

namespace KT2000.Api.Services
{
    // Tự vá cấu trúc database ĐƠN VỊ-NĂM cho khớp phiên bản mới nhất.
    //
    // VÌ SAO (chốt Trường 13/08): script đánh số trong database/ trước nay chạy TAY từng
    // database. Hôm nay đã 14 database, sắp lên 150 đơn vị × nhiều năm — chạy tay ở quy
    // mô đó chắc chắn sót, mà sót thì lỗi không nổ ngay: ba hôm sau mới chết giữa lúc nạp
    // với "Invalid column name", ở chỗ chẳng liên quan gì tới việc quên chạy script.
    //
    // KHÔNG làm nút cho người dùng bấm: họ không biết khi nào cần bấm, mà không bấm thì
    // hỏng — giao việc cho người trong khi máy tự làm được là đẩy rủi ro sang chỗ yếu.
    //
    // ĐƯỜNG NHANH: chỉ một câu SELECT MAX(Ver) lần đầu gặp database, sau đó nhớ trong bộ
    // nhớ. Nhờ vậy gọi bao nhiêu lần cũng gần như miễn phí — cố ý như thế để móc được vào
    // nhiều lối vào mà không phải cân nhắc chi phí.
    public class VaCauTrucService
    {
        // Bản vá cho database đơn vị-năm. XẾP TĂNG DẦN theo Ver, và ĐỪNG BAO GIỜ đổi số
        // đã phát hành — Ver chính là thứ đang nằm trong SCHEMA_VERSION của khách.
        // Thêm bản vá mới = thêm một dòng ở đây + một <EmbeddedResource> trong .csproj.
        private static readonly (int Ver, string TaiNguyen)[] CAC_BAN_VA =
        {
            (10, "KT2000.Api.va_017_loai_thue.sql"),
        };

        private static readonly int VER_MOI_NHAT = CAC_BAN_VA.Max(x => x.Ver);

        // Database nào đã đủ phiên bản thì thôi hỏi lại. CHỈ ghi vào đây sau khi vá xong
        // — vá hỏng mà đánh dấu là đủ thì lần sau bỏ qua luôn, hỏng âm thầm.
        private static readonly System.Collections.Concurrent.ConcurrentDictionary<string, bool>
            _daDu = new(StringComparer.OrdinalIgnoreCase);

        private readonly TenantDbResolver _resolver;
        private readonly IServiceScopeFactory _scopeFactory;
        private readonly ILogger<VaCauTrucService> _log;

        public VaCauTrucService(TenantDbResolver resolver, IServiceScopeFactory scopeFactory,
                                ILogger<VaCauTrucService> log)
        {
            _resolver = resolver;
            _scopeFactory = scopeFactory;
            _log = log;
        }

        /// <summary>
        /// Bảo đảm database đơn vị-năm đã đủ cấu trúc mới nhất. Gọi được ở bất kỳ lối vào
        /// nào, gọi nhiều lần vô hại. KHÔNG ném lỗi ra ngoài: vá được thì tốt, không vá
        /// được thì ghi nhật ký rồi để lời gọi đi tiếp — chặn cả việc nạp chỉ vì một cột
        /// chưa thêm được thì hại hơn là để nó chạy.
        /// </summary>
        public void BaoDam(string code, int nam, string nguoiDung = "he_thong")
        {
            string khoa = $"{code}_{nam}";
            if (_daDu.ContainsKey(khoa)) return;

            try
            {
                using var conn = new SqlConnection(_resolver.GetTenantConnection(code, nam));
                conn.Open();

                if (DocPhienBan(conn) >= VER_MOI_NHAT) { _daDu[khoa] = true; return; }

                var daVa = Va(conn, khoa);
                if (daVa.Count > 0)
                {
                    _log.LogInformation("Vá cấu trúc {Db}: phiên bản {Ver}",
                                        khoa, string.Join(", ", daVa));
                    GhiNhatKy(code, nam, nguoiDung,
                              $"{khoa} — đã vá lên phiên bản {string.Join(", ", daVa)}");
                }
                _daDu[khoa] = true;
            }
            catch (Exception ex)
            {
                // KHÔNG đánh dấu _daDu: lần gọi sau còn thử lại.
                _log.LogError(ex, "Không vá được cấu trúc {Db}", khoa);
                try { GhiNhatKy(code, nam, nguoiDung, $"{khoa} — VÁ HỎNG: {ex.Message}"); }
                catch { /* nhật ký hỏng thì thôi, đừng che mất lỗi gốc */ }
            }
        }

        // SCHEMA_VERSION có thể chưa tồn tại (database dựng tay đời đầu) — khi đó coi như
        // phiên bản 0 và chạy hết bản vá. Mỗi bản vá đều tự kiểm trước khi sửa nên không sao.
        private static int DocPhienBan(SqlConnection conn)
        {
            using var cmd = new SqlCommand(
                @"IF OBJECT_ID('SCHEMA_VERSION') IS NULL SELECT 0
                  ELSE SELECT ISNULL(MAX(Ver), 0) FROM SCHEMA_VERSION", conn);
            var o = cmd.ExecuteScalar();
            return o is int i ? i : 0;
        }

        private static List<int> Va(SqlConnection conn, string khoa)
        {
            var daVa = new List<int>();

            // Khóa theo TÊN DATABASE: hai tiến trình cùng chạm một đơn vị chưa vá sẽ cùng
            // chạy ALTER. Bản vá tự kiểm nên chạy trùng không hỏng dữ liệu, nhưng vẫn khóa
            // để nhật ký khỏi ghi hai lần, và để bản vá tương lai (nặng hơn, có thể không
            // idempotent) đã có sẵn hàng rào.
            using (var khoaCmd = new SqlCommand(
                @"EXEC sp_getapplock @Resource=@r, @LockMode='Exclusive',
                                     @LockOwner='Session', @LockTimeout=30000", conn))
            {
                khoaCmd.Parameters.AddWithValue("@r", $"va_cau_truc_{khoa}");
                khoaCmd.ExecuteNonQuery();
            }

            try
            {
                // Đọc lại phiên bản SAU khi có khóa: tiến trình kia có thể vừa vá xong
                // trong lúc ta đứng chờ.
                int hienTai = DocPhienBan(conn);

                foreach (var (ver, taiNguyen) in CAC_BAN_VA.Where(x => x.Ver > hienTai)
                                                           .OrderBy(x => x.Ver))
                {
                    foreach (var lo in TachLo(DocNhung(taiNguyen)))
                    {
                        using var cmd = new SqlCommand(lo, conn) { CommandTimeout = 300 };
                        cmd.ExecuteNonQuery();
                    }
                    daVa.Add(ver);
                }
            }
            finally
            {
                using var moKhoa = new SqlCommand(
                    "EXEC sp_releaseapplock @Resource=@r, @LockOwner='Session'", conn);
                moKhoa.Parameters.AddWithValue("@r", $"va_cau_truc_{khoa}");
                try { moKhoa.ExecuteNonQuery(); } catch { /* mất kết nối thì khóa tự tan */ }
            }
            return daVa;
        }

        // GO không phải lệnh T-SQL, chỉ là dấu ngắt lô của sqlcmd — SqlCommand không hiểu.
        // Cùng cách AdminService tách khuôn tenant; để lại đây cho service này đứng độc lập.
        private static IEnumerable<string> TachLo(string sql) =>
            sql.Split(new[] { "\nGO", "\rGO" }, StringSplitOptions.None)
               .Select(x => x.Trim())
               .Where(x => x.Length > 0);

        private static string DocNhung(string ten)
        {
            using var s = typeof(VaCauTrucService).Assembly.GetManifestResourceStream(ten)
                ?? throw new InvalidOperationException(
                    $"Thiếu file SQL nhúng ({ten}) — build lại backend");
            using var r = new StreamReader(s);
            return r.ReadToEnd();
        }

        // Luật #7: mọi thay đổi phải có vết. Vá chạy ngầm nên đây là chỗ DUY NHẤT người ta
        // biết được database vừa bị đổi khuôn lúc nào, lên phiên bản mấy.
        private void GhiNhatKy(string code, int nam, string nguoiDung, string chiTiet)
        {
            using var scope = _scopeFactory.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var tenantId = db.Tenants.Where(t => t.Code == code)
                                     .Select(t => (Guid?)t.Id).FirstOrDefault();
            db.Database.ExecuteSqlRaw(
                @"INSERT INTO ActivityLog (UserName, TenantId, Nam, Action, Detail)
                  VALUES ({0}, {1}, {2}, {3}, {4})",
                nguoiDung, (object?)tenantId ?? DBNull.Value, nam, "VA_CAU_TRUC", chiTiet);
        }
    }
}
