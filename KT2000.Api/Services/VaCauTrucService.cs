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
        // Số Ver phải TRA TRONG DATABASE THẬT trước khi đặt, không suy từ thư mục database/.
        // Bản đầu đặt 10 vì script 015 ghi version 9 — nhưng database thật đã có 10 và 11
        // từ trước (những bản vá không nằm trong thư mục, hoặc ai đó chạy tay). Kết quả là
        // Ver=10 mang hai nghĩa khác nhau tùy database. Lấy 12 cho chắc (bắt được 14/08).
        //   Cách tra:  SELECT Ver FROM SCHEMA_VERSION  trên vài database đang chạy.
        private static readonly (int Ver, string TaiNguyen)[] CAC_BAN_VA =
        {
            (12, "KT2000.Api.va_017_loai_thue.sql"),
            (13, "KT2000.Api.va_019_dinh_khoan_kieu.sql"),
            (14, "KT2000.Api.va_020_pt_vat_int.sql"),
            (15, "KT2000.Api.va_021_in_value.sql"),
            // 16 chứ không phải 12: số 12 bị 022_base_tokhai.sql của nhánh tờ khai chiếm
            // mất, khiến bản vá 017 bị coi là "đã áp" ở 9 database chưa hề có cột
            // loai_thue. Xem đầu file 023 để biết cách phát hiện và vì sao không sửa
            // ngược được. TRA CẢ database THẬT LẪN script của MỌI nhánh trước khi đặt số.
            (16, "KT2000.Api.va_023_bu_loai_thue.sql"),
            // Số lượng / đơn giá lên 4 số thập phân. Lưới đã hiện 4 số từ 17/08 nhưng cột
            // vẫn 3 và 2, nên màn hình cho gõ thứ mà sổ không giữ nổi: 22,9885 vào DB hóa
            // 22,989, nhân lại lệch 10,75 và hóa đơn bị đá ra trong khi màn hình vẫn xanh.
            (17, "KT2000.Api.va_024_4_so_le.sql"),
            // gia_von lên 4 số lẻ cho khớp don_gia. Từ 21/08 trình nạp đặt
            // gia_von = don_gia với hàng VÀO, mà cột chỉ (18,2) nên SQL cắt bớt ngay lúc
            // gán: 22.249,4159 vào sổ hóa 22.249,42, hai cột cùng một số mà khác giá trị.
            (18, "KT2000.Api.va_025_gia_von.sql"),

        };
        public static readonly (int Ver, string TaiNguyen)[] MODULE_HOP_DONG_LUONG =
        {
            (19, "KT2000.Api.va_026_nhansu_hopdong.sql"),
            (20, "KT2000.Api.va_027_chamcong_bangluong.sql"),

        };

        // KHÔNG có khái niệm "phiên bản mới nhất" — xem giải thích ở DocCacPhienBan.

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

                var daCo = DocCacPhienBan(conn);
                if (CAC_BAN_VA.All(x => daCo.Contains(x.Ver))) { _daDu[khoa] = true; return; }

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

        // Đọc TOÀN BỘ danh sách bản vá đã áp, KHÔNG phải MAX(Ver).
        //
        // Bản đầu so `MAX(Ver) >= phiên bản mới nhất` và sai nặng (bắt được 14/08):
        // SCHEMA_VERSION là DANH SÁCH các bản đã chạy, mỗi bản một dòng — không phải một
        // cái mốc. Database nào mang số CAO hơn sẽ không bao giờ nhận được bản vá số THẤP
        // hơn, dù chưa hề chạy nó.
        //   Ca thật: HOA_SANG_2026 có {6,7,8,9,10,11}. Bản vá số 10 bị coi là "đã có" vì
        //   MAX = 11, trong khi cột loai_thue chưa hề được thêm. Bốn database dính y hệt.
        //
        // SCHEMA_VERSION có thể chưa tồn tại (database dựng tay đời đầu) — khi đó trả tập
        // RỖNG và chạy hết bản vá. Mỗi bản vá đều tự kiểm trước khi sửa nên chạy thừa vô hại.
        private static HashSet<int> DocCacPhienBan(SqlConnection conn)
        {
            var da = new HashSet<int>();
            using var cmd = new SqlCommand(
                @"IF OBJECT_ID('SCHEMA_VERSION') IS NOT NULL
                      SELECT Ver FROM SCHEMA_VERSION", conn);
            using var r = cmd.ExecuteReader();
            while (r.Read()) if (!r.IsDBNull(0)) da.Add(r.GetInt32(0));
            return da;
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
                // Đọc lại SAU khi có khóa: tiến trình kia có thể vừa vá xong trong lúc ta chờ.
                var daCo = DocCacPhienBan(conn);

                foreach (var (ver, taiNguyen) in CAC_BAN_VA.Where(x => !daCo.Contains(x.Ver))
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

        public bool CoBangHopDongLuong(string code, int nam)
        {
            try
            {
                using var conn = new SqlConnection(_resolver.GetTenantConnection(code, nam));
                conn.Open();
                using var cmd = new SqlCommand(
                    "SELECT CASE WHEN OBJECT_ID('NHAN_SU') IS NOT NULL "
                  + "        AND OBJECT_ID('HOP_DONG') IS NOT NULL "
                  + "        AND OBJECT_ID('CHAM_CONG') IS NOT NULL "
                  + "        AND OBJECT_ID('BANG_LUONG') IS NOT NULL "
                  + "       THEN 1 ELSE 0 END", conn);
                return Convert.ToInt32(cmd.ExecuteScalar()) == 1;
            }
            catch
            {
                // Chưa mở năm / không nối được — coi như CHƯA có. Người gọi phân biệt hai
                // trường hợp đó bằng đường khác (đếm bảng), ở đây chỉ cần một câu trả lời.
                return false;
            }
        }

        public bool TaoBangHopDongLuong(string code, int nam, string nguoiDung)
        {
            using var conn = new SqlConnection(_resolver.GetTenantConnection(code, nam));
            conn.Open();

            var daCo = DocCacPhienBan(conn);
            var thieu = MODULE_HOP_DONG_LUONG.Where(x => !daCo.Contains(x.Ver))
                                             .OrderBy(x => x.Ver).ToList();

            // Script tự kiểm (IF OBJECT_ID ... IS NULL) nên chạy lại vô hại; nhưng đủ cả
            // hai số phiên bản rồi thì khỏi mở lô SQL cho nhanh.
            if (thieu.Count == 0) return false;

            var daTao = new List<int>();
            foreach (var (ver, taiNguyen) in thieu)
            {
                foreach (var lo in TachLo(DocNhung(taiNguyen)))
                {
                    using var cmd = new SqlCommand(lo, conn) { CommandTimeout = 300 };
                    cmd.ExecuteNonQuery();
                }
                daTao.Add(ver);
            }

            // Bộ nhớ đệm của BaoDam giữ theo database; module này không nằm trong
            // CAC_BAN_VA nên không đụng gì tới nó — để nguyên.
            _log.LogInformation("Tạo bảng Hợp đồng + Lương cho {Db}: {Ver}",
                                $"{code}_{nam}", string.Join(", ", daTao));
            GhiNhatKy(code, nam, nguoiDung,
                      $"{code}_{nam} — đã tạo bảng module Hợp đồng + Lương "
                    + $"(script {string.Join(", ", daTao)})");
            return true;
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
