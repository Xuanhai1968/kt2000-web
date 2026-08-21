using System.Collections.Concurrent;
using Microsoft.Data.SqlClient;

namespace KT2000.Api.Services
{
    // Tra và cấp mã trong danh mục dùng chung KT2000_Base (DM_KH, DM_HANG).
    //
    // VÌ SAO CẦN (chốt Trường 13/08): bộ định khoản đòi ma_ct_* = ma_kh, và HOA_DON_LINE
    // đòi ma_hang. Mà importer trước nay chỉ ghi được mst + ten_kh dạng chữ — ma_kh và
    // ma_hang trống 100%. Không có hai mã đó thì không điền nổi định khoản.
    //
    // DÙNG CHUNG là cố ý: danh mục để cả khối khai thuế tham khảo. Đơn vị nào cần danh
    // mục riêng thì đã tách sang bản NB, có DM_KH_NB / DM_HANG_NB trong database đơn vị.
    public class DanhMucService
    {
        // Hai dòng "hứng" cho trường hợp chưa phân loại được. Giá trị mã do Trường chốt.
        public const string MA_KH_KHONG_MST = "KH0";
        public const string MA_HANG_TAM     = "H0";

        // Nhớ mst -> ma_kh để khỏi hỏi database ở từng dòng hóa đơn. CHỈ nhớ chiều TÌM
        // THẤY: mst chưa có thì phải xuống database mà cấp mã, không được đoán.
        private static readonly ConcurrentDictionary<string, string> _nhoMaKh =
            new(StringComparer.OrdinalIgnoreCase);

        private static bool _daBaoDamDongHung;

        private readonly TenantDbResolver _resolver;
        public DanhMucService(TenantDbResolver resolver) => _resolver = resolver;

        public SqlConnection MoKetNoi()
        {
            var c = new SqlConnection(_resolver.GetBaseConnection());
            c.Open();
            return c;
        }

        /// <summary>
        /// Bảo đảm hai dòng hứng KH0 và H0 có mặt. Gọi một lần mỗi lượt nạp là đủ.
        /// </summary>
        public void BaoDamDongHung(SqlConnection c)
        {
            if (_daBaoDamDongHung) return;

            // KH0 — khách lẻ không có mã số thuế. Các cột khác để TRỐNG theo đúng yêu cầu:
            // đây là chỗ GOM, không phải một khách hàng có thật.
            Chay(c, @"IF NOT EXISTS (SELECT 1 FROM DM_KH WHERE ma_kh = @ma)
                          INSERT INTO DM_KH (ma_kh, ten_kh) VALUES (@ma, @ten)",
                 ("@ma", MA_KH_KHONG_MST), ("@ten", "Khách hàng không mã số thuế"));

            // H0 — mã hàng TẠM. Hàng thật chưa vào DM_HANG lúc nạp: chờ kế toán định khoản
            // rồi mới lưu (chốt Trường 13/08). Từ giờ tới lúc đó mọi dòng hàng trỏ về H0,
            // còn tên hàng thật vẫn nằm nguyên ở HOA_DON_LINE.ten_hang_goc.
            Chay(c, @"IF NOT EXISTS (SELECT 1 FROM DM_HANG WHERE ma_hang = @ma)
                          INSERT INTO DM_HANG (ma_hang, ma_ngan, ten_hang, tk_kho, tk_gv)
                          VALUES (@ma, @ngan, @ten, @kho, @gv)",
                 ("@ma", MA_HANG_TAM), ("@ngan", "CPK"), ("@ten", "Chi Phí Khác"),
                 ("@kho", "641"), ("@gv", "632"));

            _daBaoDamDongHung = true;
        }

        /// <summary>
        /// Mã khách cho một hóa đơn. Tra theo MST; chưa có thì cấp mã mới KH01, KH02…
        /// Hóa đơn không có MST (bán lẻ) thì gom hết vào KH0.
        /// </summary>
        public string LayMaKh(SqlConnection c, string? mst, string? tenKh, string? diaChi)
        {
            string m = (mst ?? "").Trim();
            if (m.Length == 0) return MA_KH_KHONG_MST;
            if (_nhoMaKh.TryGetValue(m, out var da)) return da;

            // Khóa quanh CẢ tra lẫn cấp: hai đơn vị nạp cùng lúc, cùng gặp một MST lạ, mà
            // chỉ khóa lúc ghi thì cả hai đều đọc ra "chưa có" rồi cấp hai mã khác nhau
            // cho cùng một khách.
            using (var khoa = new SqlCommand(
                @"EXEC sp_getapplock @Resource='dm_kh_cap_ma', @LockMode='Exclusive',
                                     @LockOwner='Session', @LockTimeout=15000", c))
                khoa.ExecuteNonQuery();
            try
            {
                using (var tim = new SqlCommand(
                    "SELECT TOP 1 ma_kh FROM DM_KH WHERE mst = @mst ORDER BY ma_kh", c))
                {
                    tim.Parameters.AddWithValue("@mst", m);
                    if (tim.ExecuteScalar() is string cu && cu.Length > 0)
                    {
                        _nhoMaKh[m] = cu;
                        return cu;
                    }
                }

                string moi = MaKhKeTiep(c);
                using (var them = new SqlCommand(
                    @"INSERT INTO DM_KH (ma_kh, ten_kh, dia_chi, mst)
                      VALUES (@ma, @ten, @dc, @mst)", c))
                {
                    them.Parameters.AddWithValue("@ma", moi);
                    them.Parameters.AddWithValue("@ten", (object?)Rong(tenKh) ?? DBNull.Value);
                    them.Parameters.AddWithValue("@dc", (object?)Rong(diaChi) ?? DBNull.Value);
                    them.Parameters.AddWithValue("@mst", m);
                    them.ExecuteNonQuery();
                }
                _nhoMaKh[m] = moi;
                return moi;
            }
            finally
            {
                using var mo = new SqlCommand(
                    "EXEC sp_releaseapplock @Resource='dm_kh_cap_ma', @LockOwner='Session'", c);
                try { mo.ExecuteNonQuery(); } catch { /* mất kết nối thì khóa tự tan */ }
            }
        }

        // Lấy số lớn nhất trong các mã dạng KH<số> rồi +1. Đệm 2 chữ số cho KH01..KH99,
        // quá 99 thì tự dài ra (KH100) — không cắt, không quay vòng.
        // KH0 (dòng hứng) có phần số bằng 0 nên nằm sẵn trong dãy và mã kế tiếp là KH01:
        // vừa không đụng nhau, vừa khỏi phải loại trừ riêng.
        private static string MaKhKeTiep(SqlConnection c)
        {
            using var cmd = new SqlCommand(
                @"SELECT ISNULL(MAX(TRY_CONVERT(int, SUBSTRING(ma_kh, 3, 20))), 0)
                  FROM DM_KH
                  WHERE ma_kh LIKE 'KH%'
                    AND TRY_CONVERT(int, SUBSTRING(ma_kh, 3, 20)) IS NOT NULL", c);
            int lonNhat = cmd.ExecuteScalar() is int i ? i : 0;
            return $"KH{lonNhat + 1:00}";
        }

        private static void Chay(SqlConnection c, string sql,
                                 params (string Ten, object GiaTri)[] thamSo)
        {
            using var cmd = new SqlCommand(sql, c);
            foreach (var (ten, gt) in thamSo) cmd.Parameters.AddWithValue(ten, gt);
            cmd.ExecuteNonQuery();
        }

        private static string? Rong(string? s) => string.IsNullOrWhiteSpace(s) ? null : s.Trim();

        /// <summary>
        /// Danh sách khách hàng cho ô "Mã CT nợ / Mã CT có" trên màn hóa đơn.
        ///
        /// Bản VFP gốc để hai ô này là combobox tra thẳng DM_KH — web trước nay chỉ có ô
        /// gõ tay, gõ sai một ký tự thì định khoản trỏ vào mã không tồn tại mà không có
        /// gì báo. Trả cả tên để người dùng chọn bằng mắt; giá trị lưu vẫn là ma_kh.
        ///
        /// DM_KH nằm ở KT2000_Base (dùng chung mọi đơn vị) nên mở kết nối riêng, cùng
        /// cách LayDanhMucTaiKhoan của ThueService. Tên database chỉ lấy qua resolver.
        /// </summary>
        public async Task<List<Models.DmKhDto>> LayDanhSachKhachHang()
        {
            var ds = new List<Models.DmKhDto>();
            using var c = new SqlConnection(_resolver.GetBaseConnection());
            await c.OpenAsync();
            using var cmd = new SqlCommand(
                "SELECT ma_kh, ten_kh, mst FROM DM_KH ORDER BY ma_kh", c);
            using var r = await cmd.ExecuteReaderAsync();
            while (await r.ReadAsync())
                ds.Add(new Models.DmKhDto
                {
                    MaKh = r.GetString(0),
                    TenKh = r.IsDBNull(1) ? null : r.GetString(1),
                    Mst = r.IsDBNull(2) ? null : r.GetString(2),
                });
            return ds;
        }
    }
}
