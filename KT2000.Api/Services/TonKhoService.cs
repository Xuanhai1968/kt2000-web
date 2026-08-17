using Microsoft.Data.SqlClient;
using KT2000.Api.Models;

namespace KT2000.Api.Services
{
    // ===================== TỒN KHO — VIÊN GẠCH DÙNG CHUNG (spec mục 3) =====================
    //
    // MỌI chức năng cần số tồn kho (báo cáo, tách khuyến mại, chỉnh kho, engine giá thành)
    // gọi qua đây. KHÔNG module nào được viết lại công thức tồn kho lần thứ hai — có hai
    // công thức song song thì sớm muộn chúng lệch nhau, và lúc đó không ai biết cái nào đúng.
    //
    // BR-BC-01 — CHỈ ĐỌC TUYỆT ĐỐI. File này không được có INSERT/UPDATE/DELETE dưới bất kỳ
    // hình thức nào. Bản VFP cũ vừa báo cáo vừa UPDATE DM_HANG.QUY_CACH và xuất file; cả hai
    // đã bị loại khỏi phạm vi. Thêm một lệnh ghi vào đây là trả PR.
    //
    // Vì sao SqlClient thẳng chứ không EF: bảng nằm trong database đơn vị-năm, tên chỉ biết
    // lúc chạy qua TenantDbResolver — cùng lý do với ThueService và NoiBoService.
    // MỌI câu lệnh tham số hóa (luật #3); tên bảng/cột là hằng trong code.
    public class TonKhoService
    {
        private readonly TenantDbResolver _resolver;
        public TonKhoService(TenantDbResolver resolver) => _resolver = resolver;

        // Database đơn vị-năm có thể chưa tồn tại — đổi 4060/911 thành thông điệp nói rõ
        // phải làm gì, thay vì để nguyên stack trace 500. Giống ThueService.OpenAsync.
        private async Task<SqlConnection> MoAsync(string code, int nam)
        {
            var conn = new SqlConnection(_resolver.GetTenantConnection(code, nam));
            try { await conn.OpenAsync(); return conn; }
            catch (SqlException ex) when (ex.Number is 4060 or 911)
            {
                conn.Dispose();
                throw new SoChuaMoException(
                    $"Đơn vị {code} chưa có sổ của năm {nam}. "
                    + "Vào Quản trị -> Đơn vị để mở năm làm việc này trước khi xem báo cáo.");
            }
        }

        // ---------------------------------------------------------------------------------
        // TẬP K — BR-BC-03
        //
        // K = các MA_TK có cờ ton_kho trong DM_TK. Đo 17/08 trên KT2000_Base: 10 tài khoản
        // (152, 1521, 153, 155, 156, 157, 211, 2113, 2114, 212) — nhiều hơn danh sách ví dụ
        // trong spec, nên KHÔNG được viết cứng danh sách vào code.
        //
        // DM_TK nằm ở KT2000_Base (dùng chung mọi đơn vị), KHÔNG ở database đơn vị-năm — vì
        // vậy phải mở kết nối riêng, không JOIN thẳng được. Tên database chỉ lấy từ resolver
        // (luật #1).
        // ---------------------------------------------------------------------------------
        public async Task<List<string>> LayTapKAsync()
        {
            var ds = new List<string>();
            using var c = new SqlConnection(_resolver.GetBaseConnection());
            await c.OpenAsync();
            using var cmd = new SqlCommand(
                "SELECT ma_tk FROM DM_TK WHERE ton_kho = 1 ORDER BY ma_tk", c);
            using var r = await cmd.ExecuteReaderAsync();
            while (await r.ReadAsync()) ds.Add(r.GetString(0));
            return ds;
        }

        // Danh mục hàng để gắn tên/nhóm vào dòng tổng hợp. Đọc CẢ BẢNG một lượt rồi ghép ở
        // C# thay vì JOIN: DM_HANG ở database khác (Base), không JOIN chéo được, mà bảng này
        // nhỏ và dùng lại cho mọi dòng.
        private async Task<Dictionary<string, (string? Ten, string? MaNh, string? MaNgan)>>
            LayDanhMucHangAsync()
        {
            var dm = new Dictionary<string, (string?, string?, string?)>(StringComparer.OrdinalIgnoreCase);
            using var c = new SqlConnection(_resolver.GetBaseConnection());
            await c.OpenAsync();
            using var cmd = new SqlCommand("SELECT ma_hang, ten_hang, ma_nh, ma_ngan FROM DM_HANG", c);
            using var r = await cmd.ExecuteReaderAsync();
            while (await r.ReadAsync())
                dm[r.GetString(0)] = (
                    r.IsDBNull(1) ? null : r.GetString(1),
                    r.IsDBNull(2) ? null : r.GetString(2),
                    r.IsDBNull(3) ? null : r.GetString(3));
            return dm;
        }

        // ---------------------------------------------------------------------------------
        // CHUYỂN ĐỘNG KHO — BR-BC-03, dựng bằng UNION ALL
        //
        // Nhánh 1: dòng có ghi_no ∈ K  → NHẬP vào kho ghi_no.
        // Nhánh 2: dòng có ghi_co ∈ K  → XUẤT khỏi kho ghi_co.
        // Dòng có CẢ HAI vế thuộc K (chuyển kho nội bộ) tự sinh hai chuyển động độc lập —
        // đúng ý BR-BC-03 mà không cần câu lệnh riêng.
        //
        // Phân loại theo tập K, KHÔNG theo DM_HANG.tk_kho: hai field tk_kho/tk_gv của danh
        // mục chỉ còn vai trò gợi ý lúc nhập liệu. Đây chính là chỗ bản VFP bỏ rơi những
        // dòng "mồ côi" (vế thuộc K nhưng khác tk_kho đăng ký) — xem nghiệm thu A1.
        //
        // ma_hang NULL gom về chuỗi rỗng: 1.389/2.991 dòng đang NULL vì chưa định khoản, để
        // nguyên NULL thì GROUP BY đánh rơi hết, báo cáo thiếu hơn nửa số dòng mà không báo gì.
        //
        // Kỳ tính theo HOA_DON.ngay_nh (BR-BC-02), KHÔNG phải HOA_DON.ngay.
        // ---------------------------------------------------------------------------------
        private const string SqlChuyenDong = @"
            SELECT l.ghi_no AS ma_tk, ISNULL(l.ma_hang, '') AS ma_hang,
                   MONTH(h.ngay_nh) AS thang, h.ngay_nh AS ngay,
                   ISNULL(l.so_luong, 0) AS sl_no, 0 AS sl_co,
                   ISNULL(l.so_luong, 0) * ISNULL(l.gia_von, 0) AS gt_no, 0 AS gt_co,
                   l.quy_cach, h.ma_hd
              FROM HOA_DON_LINE l
              JOIN HOA_DON h ON h.ma_hd = l.ma_hd
             WHERE h.ngay_nh IS NOT NULL
               AND l.ghi_no IN (SELECT value FROM STRING_SPLIT(@dsK, ','))
            UNION ALL
            SELECT l.ghi_co, ISNULL(l.ma_hang, ''),
                   MONTH(h.ngay_nh), h.ngay_nh,
                   0, ISNULL(l.so_luong, 0),
                   0, ISNULL(l.so_luong, 0) * ISNULL(l.gia_von, 0),
                   l.quy_cach, h.ma_hd
              FROM HOA_DON_LINE l
              JOIN HOA_DON h ON h.ma_hd = l.ma_hd
             WHERE h.ngay_nh IS NOT NULL
               AND l.ghi_co IN (SELECT value FROM STRING_SPLIT(@dsK, ','))";

        /// <summary>
        /// Bảng tổng hợp tồn kho (grid trên). Thang = 13 nghĩa là cả năm.
        /// </summary>
        public async Task<TonKhoKetQua> GetTongHopAsync(string code, int nam, TonKhoQuery q)
        {
            var tapK = await LayTapKAsync();
            if (tapK.Count == 0) return new TonKhoKetQua();     // chưa khai TK kho nào

            // Lọc theo MaTk của người dùng, nhưng KHÔNG cho vượt ra ngoài tập K: gõ đại một
            // TK không phải kho thì "tồn kho" của nó là con số vô nghĩa.
            var dsTk = q.MaTk is { Count: > 0 }
                ? tapK.Where(x => q.MaTk.Contains(x, StringComparer.OrdinalIgnoreCase)).ToList()
                : tapK;
            if (dsTk.Count == 0) return new TonKhoKetQua();

            bool caNam = q.Thang >= 13;
            using var conn = await MoAsync(code, nam);

            // Tồn đầu và phát sinh trong MỘT lượt quét (gợi ý spec 6): SUM có điều kiện theo
            // tháng trên cùng tập chuyển động, thay vì chạy hai lần cho hai khoảng thời gian.
            //
            // Cả năm (thang = 13): không có tháng nào "trước kỳ" nên tồn đầu chỉ còn phần
            // chuyển năm, còn phát sinh là toàn bộ 12 tháng.
            string sql = $@"
                WITH cd AS ({SqlChuyenDong})
                SELECT ma_tk, ma_hang,
                       SUM(CASE WHEN @caNam = 0 AND thang < @thang THEN sl_no - sl_co
                                ELSE 0 END)                                   AS sl_td_ps,
                       SUM(CASE WHEN @caNam = 0 AND thang < @thang THEN gt_no - gt_co
                                ELSE 0 END)                                   AS gt_td_ps,
                       SUM(CASE WHEN @caNam = 1 OR thang = @thang THEN sl_no ELSE 0 END) AS sl_no,
                       SUM(CASE WHEN @caNam = 1 OR thang = @thang THEN gt_no ELSE 0 END) AS gt_no,
                       SUM(CASE WHEN @caNam = 1 OR thang = @thang THEN sl_co ELSE 0 END) AS sl_co,
                       SUM(CASE WHEN @caNam = 1 OR thang = @thang THEN gt_co ELSE 0 END) AS gt_co,
                       MAX(CASE WHEN (@caNam = 1 OR thang = @thang) AND sl_no > 0
                                THEN ngay END)                                AS ngay_nhap_cuoi,
                       MAX(quy_cach)                                          AS quy_cach
                  FROM cd
                 WHERE ma_tk IN (SELECT value FROM STRING_SPLIT(@dsTk, ','))
                   AND (@locHang = 0
                        OR ma_hang IN (SELECT value FROM STRING_SPLIT(@dsHang, ',')))
                 GROUP BY ma_tk, ma_hang";

            var thoRows = new List<(string MaTk, string MaHang, decimal SlTdPs, decimal GtTdPs,
                                    decimal SlNo, decimal GtNo, decimal SlCo, decimal GtCo,
                                    DateTime? NgayNhapCuoi, string? QuyCach)>();

            using (var cmd = new SqlCommand(sql, conn))
            {
                ThemThamSoLoc(cmd, q, dsTk, tapK, caNam);
                using var r = await cmd.ExecuteReaderAsync();
                while (await r.ReadAsync())
                    thoRows.Add((r.GetString(0), r.GetString(1),
                                 r.GetDecimal(2), r.GetDecimal(3),
                                 r.GetDecimal(4), r.GetDecimal(5),
                                 r.GetDecimal(6), r.GetDecimal(7),
                                 r.IsDBNull(8) ? null : r.GetDateTime(8),
                                 r.IsDBNull(9) ? null : r.GetString(9)));
            }

            var tonDauNam = await LayTonDauNamAsync(conn);
            var giaNhap   = await LayGiaNhapTrongKyAsync(conn, q, caNam, tapK);
            var loLai     = q.IncludeLoLai
                          ? await LayLoLaiAsync(conn, q, caNam)
                          : new Dictionary<string, decimal>();
            var danhMuc   = await LayDanhMucHangAsync();

            var rows = new List<TonKhoTongHopRow>();
            foreach (var t in thoRows)
            {
                // BR-BC-04: tồn đầu = dòng TON_KHO thang=0 (chuyển năm) + lũy kế chuyển động
                // các tháng TRƯỚC kỳ. KHÔNG dùng dòng TON_KHO tháng 1–12 làm nguồn.
                var (slDauNam, gtDauNam) = tonDauNam.GetValueOrDefault((t.MaTk, t.MaHang));
                decimal slTd = slDauNam + t.SlTdPs;
                decimal gtTd = gtDauNam + t.GtTdPs;

                // BR-BC-07: bỏ dòng rác tồn đầu — giá trị dưới 0,1đ mà số lượng bằng 0.
                // Chỉ bỏ khi trong kỳ CŨNG không phát sinh gì, nếu không thì mặt hàng mới
                // mua trong kỳ (tồn đầu đúng bằng 0) sẽ biến mất khỏi báo cáo.
                bool racTonDau = gtTd < 0.1m && slTd == 0;
                bool khongPhatSinh = t.SlNo == 0 && t.SlCo == 0 && t.GtNo == 0 && t.GtCo == 0;
                if (racTonDau && khongPhatSinh) continue;

                var dm = danhMuc.GetValueOrDefault(t.MaHang);
                decimal slTc = slTd + t.SlNo - t.SlCo;      // BR-BC-05
                decimal gtTc = gtTd + t.GtNo - t.GtCo;

                rows.Add(new TonKhoTongHopRow
                {
                    MaTk = t.MaTk, MaHang = t.MaHang,
                    TenHang = dm.Ten, MaNh = dm.MaNh, MaNgan = dm.MaNgan,
                    TenNh = null,                    // chưa có bảng DM_NH — xem DTO
                    QuyCach = t.QuyCach,
                    SlTd = slTd, GtTd = gtTd,
                    SlNo = t.SlNo, GtNo = t.GtNo,
                    SlCo = t.SlCo, GtCo = t.GtCo,
                    SlTc = slTc, GtTc = gtTc,
                    // Đơn giá nhập mua gần nhất trong kỳ; không nhập trong kỳ thì suy từ tồn
                    // đầu. slTd = 0 thì đành để 0 — chia cho 0 là hỏng cả báo cáo.
                    GiaNhap = giaNhap.GetValueOrDefault((t.MaTk, t.MaHang),
                                                        slTd != 0 ? gtTd / slTd : 0m),
                    LoLai = loLai.GetValueOrDefault(t.MaHang, 0m),
                    // BR-BC-10: cột phai_sua chưa tồn tại trong HOA_DON_LINE (kiểm 17/08),
                    // nên luôn false. Nối vào khi có script thêm cột.
                    PhaiSua = false,
                    // llNgayPS: chỉ có nghĩa với mặt hàng CÓ nhập mà KHÔNG bán trong kỳ.
                    NgayPs = t.SlCo == 0 ? t.NgayNhapCuoi : null,
                });
            }

            return new TonKhoKetQua
            {
                Rows = rows.OrderBy(x => x.MaTk).ThenBy(x => x.MaHang).ToList(),
                // BR-BC-11: chưa có chỗ lưu cờ trong DB — xem ghi chú ở TonKhoKetQua.
                CanTinhLaiGia = false,
            };
        }

        // Gắn đủ tham số lọc cho câu tổng hợp. Gom một chỗ vì các câu bên dưới dùng lại cùng
        // bộ điều kiện — sửa một chỗ, cả nhóm đổi theo.
        private static void ThemThamSoLoc(SqlCommand cmd, TonKhoQuery q,
                                          List<string> dsTk, List<string> tapK, bool caNam)
        {
            cmd.Parameters.AddWithValue("@dsK", string.Join(",", tapK));
            cmd.Parameters.AddWithValue("@dsTk", string.Join(",", dsTk));
            cmd.Parameters.AddWithValue("@thang", caNam ? 0 : q.Thang);
            cmd.Parameters.AddWithValue("@caNam", caNam ? 1 : 0);
            bool locHang = q.MaHang is { Count: > 0 };
            cmd.Parameters.AddWithValue("@locHang", locHang ? 1 : 0);
            cmd.Parameters.AddWithValue("@dsHang", locHang ? string.Join(",", q.MaHang!) : "");
        }

        // TON_KHO thang = 0 — tồn đầu NĂM, sản phẩm của WP-08 Chuyển năm.
        // Cột tên là ma_chitiet chứ không phải ma_hang (kiểm cấu trúc 17/08).
        // Đo 17/08: bảng này đang RỖNG ở mọi đơn vị vì chuyển năm chưa chạy → tồn đầu năm 0.
        private static async Task<Dictionary<(string, string), (decimal Sl, decimal Gt)>>
            LayTonDauNamAsync(SqlConnection conn)
        {
            var d = new Dictionary<(string, string), (decimal, decimal)>();
            using var cmd = new SqlCommand(
                @"SELECT ma_tk, ISNULL(ma_chitiet, ''),
                         SUM(ISNULL(so_luong_no, 0) - ISNULL(so_luong_co, 0)),
                         SUM(ISNULL(ps_no, 0)       - ISNULL(ps_co, 0))
                    FROM TON_KHO
                   WHERE thang = 0
                     -- Bỏ dòng không có TK: tồn kho của một tài khoản rỗng là vô nghĩa,
                     -- mà để lọt thì GetString bên dưới ném SqlNullValueException. Bảng
                     -- đang rỗng nên chưa lộ; sẽ lộ đúng lúc WP-08 Chuyển năm chạy xong.
                     AND ma_tk IS NOT NULL
                   GROUP BY ma_tk, ISNULL(ma_chitiet, '')", conn);
            using var r = await cmd.ExecuteReaderAsync();
            while (await r.ReadAsync())
                d[(r.GetString(0), r.GetString(1))] = (r.GetDecimal(2), r.GetDecimal(3));
            return d;
        }

        // Đơn giá của dòng NHẬP MUA gần nhất trong kỳ. Nhập mua nhận biết qua ma_hd bắt đầu
        // bằng "V" (hóa đơn VÀO) — cùng quy ước đặt mã của ImportService.
        //
        // PHẢI lọc ghi_no thuộc tập K, không chỉ vì đúng nghĩa "giá nhập VÀO KHO" mà còn vì
        // an toàn kiểu: thiếu điều kiện này thì câu vơ cả dòng có ghi_no NULL (dòng chưa
        // định khoản), và GetString ném SqlNullValueException.
        //   Gặp thật 17/08: chọn tháng 8 chạy bình thường, chọn "Cả năm" là 500 — vì tháng
        //   8 không có dòng nào chưa định khoản, tháng khác thì có.
        private static async Task<Dictionary<(string, string), decimal>>
            LayGiaNhapTrongKyAsync(SqlConnection conn, TonKhoQuery q, bool caNam,
                                   List<string> tapK)
        {
            var d = new Dictionary<(string, string), decimal>();
            using var cmd = new SqlCommand(
                @"SELECT ma_tk, ma_hang, don_gia FROM (
                      SELECT l.ghi_no AS ma_tk, ISNULL(l.ma_hang,'') AS ma_hang,
                             ISNULL(l.don_gia,0) AS don_gia,
                             ROW_NUMBER() OVER (PARTITION BY l.ghi_no, ISNULL(l.ma_hang,'')
                                                ORDER BY h.ngay_nh DESC, l.stt_line DESC) AS rn
                        FROM HOA_DON_LINE l
                        JOIN HOA_DON h ON h.ma_hd = l.ma_hd
                       WHERE h.ngay_nh IS NOT NULL
                         AND l.ma_hd LIKE 'V%'
                         AND ISNULL(l.so_luong,0) > 0
                         AND l.ghi_no IN (SELECT value FROM STRING_SPLIT(@dsK, ','))
                         AND (@caNam = 1 OR MONTH(h.ngay_nh) = @thang)
                  ) x WHERE rn = 1", conn);
            cmd.Parameters.AddWithValue("@dsK", string.Join(",", tapK));
            cmd.Parameters.AddWithValue("@thang", caNam ? 0 : q.Thang);
            cmd.Parameters.AddWithValue("@caNam", caNam ? 1 : 0);
            using var r = await cmd.ExecuteReaderAsync();
            while (await r.ReadAsync())
                d[(r.GetString(0), r.GetString(1))] = r.GetDecimal(2);
            return d;
        }

        // BR-BC-08 — lỗ/lãi theo MẶT HÀNG (không theo TK): Σ (đơn giá bán − giá vốn) × SL
        // trên các dòng XUẤT có ghi_co = '156' và don_gia > 0.
        // Chừng nào gia_von còn trống thì cột này bằng đúng DOANH THU, không phải lãi thật.
        private static async Task<Dictionary<string, decimal>>
            LayLoLaiAsync(SqlConnection conn, TonKhoQuery q, bool caNam)
        {
            var d = new Dictionary<string, decimal>();
            using var cmd = new SqlCommand(
                @"SELECT ISNULL(l.ma_hang, ''),
                         SUM((ISNULL(l.don_gia,0) - ISNULL(l.gia_von,0)) * ISNULL(l.so_luong,0))
                    FROM HOA_DON_LINE l
                    JOIN HOA_DON h ON h.ma_hd = l.ma_hd
                   WHERE h.ngay_nh IS NOT NULL
                     AND l.ghi_co = '156' AND ISNULL(l.don_gia, 0) > 0
                     AND (@caNam = 1 OR MONTH(h.ngay_nh) = @thang)
                   GROUP BY ISNULL(l.ma_hang, '')", conn);
            cmd.Parameters.AddWithValue("@thang", caNam ? 0 : q.Thang);
            cmd.Parameters.AddWithValue("@caNam", caNam ? 1 : 0);
            using var r = await cmd.ExecuteReaderAsync();
            while (await r.ReadAsync()) d[r.GetString(0)] = r.GetDecimal(1);
            return d;
        }

        /// <summary>
        /// Phát sinh chi tiết của MỘT mặt hàng (grid dưới). Mỗi lần click là một query mới —
        /// stateless, thay cho cursor "nằm chờ" DbfNhapVao của VFP (nghiệm thu A5).
        /// </summary>
        public async Task<List<TonKhoChiTietRow>> GetChiTietAsync(
            string code, int nam, string maHang, int thang)
        {
            var tapK = await LayTapKAsync();
            if (tapK.Count == 0) return new List<TonKhoChiTietRow>();
            bool caNam = thang >= 13;

            using var conn = await MoAsync(code, nam);
            var ds = new List<TonKhoChiTietRow>();
            using var cmd = new SqlCommand(
                @"SELECT h.ngay_nh, h.ten_kh, h.so_hd, h.so_ptc, h.ma_hd,
                         CASE WHEN l.ghi_no IN (SELECT value FROM STRING_SPLIT(@dsK, ','))
                              THEN ISNULL(l.so_luong,0) ELSE 0 END AS sl_no,
                         CASE WHEN l.ghi_no IN (SELECT value FROM STRING_SPLIT(@dsK, ','))
                              THEN ISNULL(l.so_luong,0) * ISNULL(l.gia_von,0) ELSE 0 END AS gt_no,
                         CASE WHEN l.ghi_co IN (SELECT value FROM STRING_SPLIT(@dsK, ','))
                              THEN ISNULL(l.so_luong,0) ELSE 0 END AS sl_co,
                         CASE WHEN l.ghi_co IN (SELECT value FROM STRING_SPLIT(@dsK, ','))
                              THEN ISNULL(l.so_luong,0) * ISNULL(l.gia_von,0) ELSE 0 END AS gt_co,
                         l.ghi_no, l.ghi_co, ISNULL(l.don_gia,0), ISNULL(l.gia_von,0),
                         l.dvt, ISNULL(l.sl_qd,0), ISNULL(l.dg_qd,0), l.ghi_chu
                    FROM HOA_DON_LINE l
                    JOIN HOA_DON h ON h.ma_hd = l.ma_hd
                   WHERE h.ngay_nh IS NOT NULL
                     AND ISNULL(l.ma_hang, '') = @maHang
                     AND (l.ghi_no IN (SELECT value FROM STRING_SPLIT(@dsK, ','))
                       OR l.ghi_co IN (SELECT value FROM STRING_SPLIT(@dsK, ',')))
                     AND (@caNam = 1 OR MONTH(h.ngay_nh) = @thang)
                   ORDER BY h.ngay_nh, h.ma_hd, l.stt_line", conn);
            cmd.Parameters.AddWithValue("@dsK", string.Join(",", tapK));
            cmd.Parameters.AddWithValue("@maHang", maHang ?? "");
            cmd.Parameters.AddWithValue("@thang", caNam ? 0 : thang);
            cmd.Parameters.AddWithValue("@caNam", caNam ? 1 : 0);

            using var r = await cmd.ExecuteReaderAsync();
            while (await r.ReadAsync())
            {
                string? soHd = r.IsDBNull(2) ? null : r.GetString(2);
                string? soPtc = r.IsDBNull(3) ? null : r.GetString(3);
                ds.Add(new TonKhoChiTietRow
                {
                    NgayNh = r.IsDBNull(0) ? null : r.GetDateTime(0),
                    TenKh = r.IsDBNull(1) ? null : r.GetString(1),
                    // Luật ghép của VFP: không có số HĐ thì hiện số phiếu; có cả hai thì
                    // "SoHD (số phiếu)". Giữ nguyên để kế toán đọc quen mắt.
                    SoHd = GhepSoHd(soHd, soPtc),
                    MaHd = r.GetString(4),
                    SlNo = r.GetDecimal(5), GtNo = r.GetDecimal(6),
                    SlCo = r.GetDecimal(7), GtCo = r.GetDecimal(8),
                    GhiNo = r.IsDBNull(9) ? null : r.GetString(9),
                    GhiCo = r.IsDBNull(10) ? null : r.GetString(10),
                    DonGia = r.GetDecimal(11), GiaVon = r.GetDecimal(12),
                    Dvt = r.IsDBNull(13) ? null : r.GetString(13),
                    SlQd = r.GetDecimal(14), DgQd = r.GetDecimal(15),
                    GhiChu = r.IsDBNull(16) ? null : r.GetString(16),
                    PhaiSua = false,        // BR-BC-10 — cột chưa tồn tại
                });
            }
            return ds;
        }

        internal static string? GhepSoHd(string? soHd, string? soPtc)
        {
            string a = (soHd ?? "").Trim(), b = (soPtc ?? "").Trim();
            if (a.Length == 0) return b.Length == 0 ? null : b;
            return b.Length == 0 ? a : $"{a} ({b})";
        }

        /// <summary>
        /// Số lượng tồn của từng mặt hàng tính đến HẾT một ngày bất kỳ.
        /// Viên gạch cho nghiệp vụ tách khuyến mại (ldNgayHDKM của VFP).
        /// </summary>
        public async Task<List<TonDenNgayRow>> GetTonDenNgayAsync(
            string code, int nam, DateTime ngay, string? maHang = null)
        {
            var tapK = await LayTapKAsync();
            if (tapK.Count == 0) return new List<TonDenNgayRow>();

            using var conn = await MoAsync(code, nam);
            var danhMuc = await LayDanhMucHangAsync();
            var ds = new List<TonDenNgayRow>();

            using var cmd = new SqlCommand($@"
                WITH cd AS ({SqlChuyenDong})
                SELECT ma_hang, SUM(sl_no - sl_co)
                  FROM cd
                 WHERE ngay <= @ngay
                   AND (@locHang = 0 OR ma_hang = @maHang)
                 GROUP BY ma_hang
                HAVING SUM(sl_no - sl_co) <> 0", conn);
            cmd.Parameters.AddWithValue("@dsK", string.Join(",", tapK));
            cmd.Parameters.AddWithValue("@ngay", ngay.Date);
            cmd.Parameters.AddWithValue("@locHang", string.IsNullOrWhiteSpace(maHang) ? 0 : 1);
            cmd.Parameters.AddWithValue("@maHang", maHang ?? "");

            using var r = await cmd.ExecuteReaderAsync();
            while (await r.ReadAsync())
            {
                string mh = r.GetString(0);
                ds.Add(new TonDenNgayRow
                {
                    MaHang = mh,
                    TenHang = danhMuc.GetValueOrDefault(mh).Ten,
                    SoLuong = r.GetDecimal(1),
                });
            }
            return ds;
        }

        /// <summary>
        /// Mặt hàng có số dư lũy kế xuống ÂM giữa chừng, kèm ngày âm đầu tiên.
        /// CHỈ ĐỌC — nguồn cho nút "Test" của SPEC Chỉnh kho tự động; phần dời ngay_nh nằm
        /// hoàn toàn bên spec đó (BR-BC-01).
        /// </summary>
        public async Task<List<HangAmRow>> GetHangAmAsync(string code, int nam, int? thang = null)
        {
            var tapK = await LayTapKAsync();
            if (tapK.Count == 0) return new List<HangAmRow>();
            bool caNam = thang is null or >= 13;

            using var conn = await MoAsync(code, nam);
            var danhMuc = await LayDanhMucHangAsync();
            var ds = new List<HangAmRow>();

            // Window function thay trọn vòng SCAN Temp79/Temp791 của VFP (gợi ý spec 6).
            // Thứ tự cộng dồn phải GIỮ luật VFP: trong cùng một ngày, phiếu trả lại (mã "R")
            // xếp SAU — không thì một hóa đơn trả hàng cùng ngày làm số dư âm giả.
            using var cmd = new SqlCommand($@"
                WITH cd AS ({SqlChuyenDong}),
                luy_ke AS (
                    SELECT ma_tk, ma_hang, ngay, ma_hd,
                           SUM(sl_no - sl_co) OVER (
                               PARTITION BY ma_tk, ma_hang
                               ORDER BY ngay,
                                        CASE WHEN ma_hd LIKE 'R%' THEN 1 ELSE 0 END,
                                        ma_hd
                               ROWS UNBOUNDED PRECEDING) AS so_du
                      FROM cd
                     WHERE @caNam = 1 OR thang = @thang
                ),
                lan_dau AS (
                    SELECT ma_tk, ma_hang, ngay, ma_hd, so_du,
                           ROW_NUMBER() OVER (PARTITION BY ma_tk, ma_hang
                                              ORDER BY ngay, ma_hd) AS rn
                      FROM luy_ke WHERE so_du < 0
                )
                SELECT ma_tk, ma_hang, ngay, ma_hd, so_du
                  FROM lan_dau WHERE rn = 1
                 ORDER BY ma_tk, ma_hang", conn);
            cmd.Parameters.AddWithValue("@dsK", string.Join(",", tapK));
            cmd.Parameters.AddWithValue("@thang", caNam ? 0 : thang!.Value);
            cmd.Parameters.AddWithValue("@caNam", caNam ? 1 : 0);

            using var r = await cmd.ExecuteReaderAsync();
            while (await r.ReadAsync())
            {
                string mh = r.GetString(1);
                ds.Add(new HangAmRow
                {
                    MaTk = r.GetString(0),
                    MaHang = mh,
                    TenHang = danhMuc.GetValueOrDefault(mh).Ten,
                    NgayAmDauTien = r.IsDBNull(2) ? null : r.GetDateTime(2),
                    MaHdGayAm = r.IsDBNull(3) ? null : r.GetString(3),
                    SoDuKhiAm = r.GetDecimal(4),
                });
            }
            return ds;
        }
    }
}
