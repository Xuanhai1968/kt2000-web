using Microsoft.Data.SqlClient;

namespace KT2000.Api.Services
{
    // ===================== ĐỊNH KHOẢN — ĐỌC DỮ LIỆU (nhóm A) =====================
    //
    // CHỈ ĐỌC. Phần ghi (sửa ghi_no/ghi_co, chụp dk_goc, đẩy về Data Training) thuộc
    // nhóm B/C, làm sau khi có script 025 và database KT2000_PUB.
    //
    // Vì sao SqlClient thẳng chứ không EF: bảng nằm trong database đơn vị-năm, tên chỉ
    // biết lúc chạy qua TenantDbResolver — cùng lý do với ThueService và TonKhoService.
    // MỌI câu lệnh tham số hóa (luật #3); tên bảng/cột là hằng trong code.
    //
    // KHÁC các service kia một điểm quan trọng: màn này đọc dữ liệu của NHIỀU đơn vị
    // trong một lượt, không riêng đơn vị đang đăng nhập — định khoản là việc của người
    // vận hành chạy cho cả hệ thống. Vì vậy controller PHẢI gate chặt, xem
    // DinhKhoanController.
    public class DinhKhoanService
    {
        private readonly TenantDbResolver _resolver;
        private readonly ILogger<DinhKhoanService> _log;

        public DinhKhoanService(TenantDbResolver resolver, ILogger<DinhKhoanService> log)
        { _resolver = resolver; _log = log; }

        /// <summary>Một mặt hàng gốc DUY NHẤT trong phạm vi các đơn vị đã chọn.</summary>
        public sealed class TenHangDto
        {
            public string MaDonVi { get; set; } = "";
            public string Huong { get; set; } = "";      // V (vào) | R (ra)
            public string TenHang { get; set; } = "";
            public int SoDong { get; set; }
            public string? DkGoc { get; set; }
            public string? DinhKhoan { get; set; }       // ghi_no (V) hoặc ghi_co (R)
            public bool DaXacNhan { get; set; }          // good_pred
            public decimal? TinCay { get; set; }         // proba (sẽ đổi tên pred_conf)
        }

        /// <summary>Một dòng hoá đơn thật của mặt hàng đang chọn.</summary>
        public sealed class DongHoaDonDto
        {
            public string MaHd { get; set; } = "";
            public string TenHang { get; set; } = "";
            public string? GhiNo { get; set; }
            public string? GhiCo { get; set; }
            public int? SttLine { get; set; }
            public decimal? SoLuong { get; set; }
            public decimal? DonGia { get; set; }
            public string? TenKh { get; set; }
            public decimal? TinCay { get; set; }
        }

        // Gom theo (hướng, tên hàng gốc). Một tên hàng đẻ ra nhiều dòng hoá đơn — soi
        // theo tên là cách duy nhất xử lý nổi vài nghìn dòng (đặc tả Trường 19/08).
        //
        // MAX cho các cột phụ: cùng một tên hàng có thể mang định khoản khác nhau ở các
        // dòng khác nhau — đó CHÍNH LÀ ca xung đột mà đặc tả nói tới. Ở nhóm A chỉ lấy
        // một giá trị đại diện; phần phát hiện xung đột thuộc nhóm C.
        private const string SqlGomTheoTen = @"
            SELECT h.huong,
                   LTRIM(RTRIM(ISNULL(l.ten_hang_goc, ''))) AS ten_hang,
                   COUNT(*)                                  AS so_dong,
                   MAX(l.dk_goc)                             AS dk_goc,
                   MAX(CASE WHEN h.huong = 'VAO' THEN l.ghi_no ELSE l.ghi_co END) AS dinh_khoan,
                   MAX(CASE WHEN ISNULL(l.good_pred, 0) = 1 THEN 1 ELSE 0 END)    AS da_xac_nhan,
                   MAX(CAST(l.proba AS DECIMAL(9,4)))        AS tin_cay
              FROM HOA_DON_LINE l
              JOIN HOA_DON h ON h.ma_hd = l.ma_hd
             WHERE LTRIM(RTRIM(ISNULL(l.ten_hang_goc, ''))) <> ''
               AND (@huong IS NULL OR h.huong = @huong)
             GROUP BY h.huong, LTRIM(RTRIM(ISNULL(l.ten_hang_goc, '')))
             ORDER BY 2";

        public async Task<List<TenHangDto>> LayTenHangAsync(
            IEnumerable<string> dsMaDonVi, int nam, string? huong)
        {
            var ra = new List<TenHangDto>();
            foreach (string code in dsMaDonVi.Distinct(StringComparer.OrdinalIgnoreCase))
            {
                // Đơn vị chưa mở sổ năm này thì BỎ QUA, không làm hỏng cả lượt. Chạy cho
                // vài chục đơn vị mà một cái chưa mở năm là chết cả mẻ thì người dùng
                // không có cách nào biết cái nào hỏng.
                try
                {
                    using var conn = new SqlConnection(_resolver.GetTenantConnection(code, nam));
                    await conn.OpenAsync();
                    using var cmd = new SqlCommand(SqlGomTheoTen, conn);
                    cmd.Parameters.AddWithValue("@huong", (object?)huong ?? DBNull.Value);
                    using var r = await cmd.ExecuteReaderAsync();
                    while (await r.ReadAsync())
                        ra.Add(new TenHangDto
                        {
                            MaDonVi = code,
                            // 'VAO' -> 'V', 'RA' -> 'R' cho khớp nhãn V/R trên lưới
                            Huong = r.IsDBNull(0) ? "" : (r.GetString(0) == "VAO" ? "V" : "R"),
                            TenHang = r.GetString(1),
                            SoDong = r.GetInt32(2),
                            DkGoc = r.IsDBNull(3) ? null : r.GetString(3),
                            DinhKhoan = r.IsDBNull(4) ? null : r.GetString(4),
                            DaXacNhan = !r.IsDBNull(5) && r.GetInt32(5) == 1,
                            TinCay = r.IsDBNull(6) ? null : r.GetDecimal(6),
                        });
                }
                catch (SqlException ex) when (ex.Number is 4060 or 911)
                {
                    _log.LogInformation("Định khoản: bỏ qua {Code} — chưa có sổ năm {Nam}", code, nam);
                }
            }

            // ĐẦU VÀO TRƯỚC, ĐẦU RA SAU (chốt Trường 20/08). Sắp trong SQL không đủ:
            // mỗi đơn vị là một câu lệnh riêng nên ghép lại vẫn xen kẽ V với R.
            // Hai chiều dùng hai vế định khoản khác nhau (vào sửa Nợ, ra sửa Có) nên
            // soi lẫn lộn là vừa đọc vừa phải đổi não liên tục.
            return ra
                .OrderBy(x => x.Huong == "V" ? 0 : 1)
                .ThenBy(x => x.MaDonVi, StringComparer.OrdinalIgnoreCase)
                .ThenBy(x => x.TenHang, StringComparer.CurrentCultureIgnoreCase)
                .ToList();
        }

        /// <summary>Một tài khoản trong danh mục dùng chung.</summary>
        public sealed class TaiKhoanDto
        {
            public string MaTk { get; set; } = "";
            public string TenTk { get; set; } = "";
        }

        // DM_TK nằm ở KT2000_Base (dùng chung mọi đơn vị), KHÔNG ở database đơn vị-năm.
        // 93 tài khoản — đọc thẳng, không cần lọc gì: người dùng cần thấy đủ để chọn,
        // và bảy nhãn model đang học chỉ là bảy cái nó GẶP NHIỀU, không phải giới hạn.
        public async Task<List<TaiKhoanDto>> LayDanhMucTkAsync(CancellationToken ct)
        {
            var ra = new List<TaiKhoanDto>();
            using var conn = new SqlConnection(_resolver.GetBaseConnection());
            await conn.OpenAsync(ct);
            using var cmd = new SqlCommand(
                @"SELECT ma_tk, ISNULL(NULLIF(LTRIM(RTRIM(displayname)), ''), ten_tk)
                    FROM DM_TK ORDER BY ma_tk", conn);
            using var r = await cmd.ExecuteReaderAsync(ct);
            while (await r.ReadAsync(ct))
                ra.Add(new TaiKhoanDto
                { MaTk = r.GetString(0).Trim(), TenTk = r.IsDBNull(1) ? "" : r.GetString(1).Trim() });
            return ra;
        }

        /// <summary>Một thay đổi người dùng gửi lên cho MỘT mặt hàng.</summary>
        public sealed class ThayDoiDto
        {
            public string MaDonVi { get; set; } = "";
            public string Huong { get; set; } = "";        // V | R
            public string TenHang { get; set; } = "";
            /// <summary>Tài khoản đúng người dùng gõ. Null/rỗng = không sửa định khoản.</summary>
            public string? TkMoi { get; set; }
            /// <summary>Xác nhận định khoản hiện tại là đúng (good_pred = 1).</summary>
            public bool XacNhanDung { get; set; }
        }

        // ===================== GHI (nhóm B) =====================
        //
        // Cập nhật theo TÊN HÀNG, không theo từng dòng: người dùng soi theo tên, nên một
        // lần sửa phải ăn cho mọi dòng mang tên đó. Đó là toàn bộ lý do màn này gom theo
        // tên ngay từ đầu.
        //
        // VÀO sửa ghi_no, RA sửa ghi_co — KHÔNG bao giờ cả hai (đặc tả Trường 19/08).
        // Vế kia giữ nguyên bằng cách gán lại chính nó trong CASE.
        //
        // dk_goc chụp giá trị TRƯỚC khi đè, và CHỈ khi còn trống — "chỉ thực hiện 1 lần".
        // An toàn vì SQL Server đánh giá MỌI biểu thức của một UPDATE trên giá trị CŨ,
        // nên dk_goc vẫn thấy vế cũ dù cùng câu lệnh đó đang ghi đè lên nó.
        //
        // Luật #5 (cột định khoản bất khả xâm phạm) KHÔNG áp ở đây: luật đó chặn hàm
        // NGUỒN (importer, worker) đè lên việc của kế toán. Đây là chính kế toán chủ động
        // sửa — đúng chiều ngược lại.
        private const string SqlCapNhat = @"
            UPDATE l
               SET dk_goc = CASE
                              WHEN ISNULL(l.dk_goc, '') <> '' THEN l.dk_goc
                              WHEN @huong = 'VAO' THEN l.ghi_no
                              ELSE l.ghi_co
                            END,
                   ghi_no = CASE WHEN @huong = 'VAO' AND @tk IS NOT NULL
                                 THEN @tk ELSE l.ghi_no END,
                   ghi_co = CASE WHEN @huong = 'RA'  AND @tk IS NOT NULL
                                 THEN @tk ELSE l.ghi_co END,
                   good_pred = CASE WHEN @xacNhan = 1 THEN 1 ELSE l.good_pred END,
                   updated_by = @user,
                   updated_at = SYSDATETIME()
              FROM HOA_DON_LINE l
              JOIN HOA_DON h ON h.ma_hd = l.ma_hd
             WHERE h.huong = @huong
               AND LTRIM(RTRIM(ISNULL(l.ten_hang_goc, ''))) = @ten";

        /// <summary>
        /// Ghi các thay đổi. Trả về số DÒNG hoá đơn đã đụng tới (không phải số mặt hàng).
        /// </summary>
        public async Task<int> CapNhatAsync(
            IEnumerable<ThayDoiDto> ds, int nam, string user)
        {
            int tong = 0;
            // Gom theo đơn vị: mỗi database một kết nối, một transaction. Sửa 30 mặt hàng
            // của cùng đơn vị mà mở 30 kết nối thì vừa chậm vừa không nguyên tử.
            foreach (var nhom in ds.GroupBy(x => x.MaDonVi, StringComparer.OrdinalIgnoreCase))
            {
                using var conn = new SqlConnection(_resolver.GetTenantConnection(nhom.Key, nam));
                await conn.OpenAsync();
                using var tx = conn.BeginTransaction();
                try
                {
                    foreach (var t in nhom)
                    {
                        string huong = t.Huong.Trim().ToUpperInvariant() == "R" ? "RA" : "VAO";
                        string tk = (t.TkMoi ?? "").Trim();

                        // Không sửa gì và cũng không xác nhận thì bỏ qua — đừng đụng vào
                        // updated_at của cả nghìn dòng chỉ để ghi lại đúng cái đang có.
                        if (tk.Length == 0 && !t.XacNhanDung) continue;

                        using var cmd = new SqlCommand(SqlCapNhat, conn, tx);
                        cmd.Parameters.AddWithValue("@huong", huong);
                        cmd.Parameters.AddWithValue("@ten", t.TenHang ?? "");
                        cmd.Parameters.AddWithValue("@tk", tk.Length == 0 ? DBNull.Value : tk);
                        cmd.Parameters.AddWithValue("@xacNhan", t.XacNhanDung ? 1 : 0);
                        cmd.Parameters.AddWithValue("@user", user);
                        tong += await cmd.ExecuteNonQueryAsync();
                    }
                    tx.Commit();
                }
                catch
                {
                    tx.Rollback();
                    throw;   // KHÔNG nuốt: đây là ghi vào SỔ, hỏng thì người dùng phải biết
                }
            }
            return tong;
        }

        // Các dòng hoá đơn THẬT của một mặt hàng. So tên đã TRIM ở cả hai vế cho khớp
        // đúng cái đã gom ở trên — lệch một dấu cách là lưới dưới trống trơn.
        public async Task<List<DongHoaDonDto>> LayDongHoaDonAsync(
            string maDonVi, int nam, string tenHang, string? huong)
        {
            var ra = new List<DongHoaDonDto>();
            using var conn = new SqlConnection(_resolver.GetTenantConnection(maDonVi, nam));
            await conn.OpenAsync();
            using var cmd = new SqlCommand(@"
                SELECT l.ma_hd, ISNULL(l.ten_hang_goc,''), l.ghi_no, l.ghi_co,
                       l.stt_line, l.so_luong, l.don_gia, h.ten_kh,
                       CAST(l.proba AS DECIMAL(9,4))
                  FROM HOA_DON_LINE l
                  JOIN HOA_DON h ON h.ma_hd = l.ma_hd
                 WHERE LTRIM(RTRIM(ISNULL(l.ten_hang_goc,''))) = @ten
                   AND (@huong IS NULL OR h.huong = @huong)
                 ORDER BY l.ma_hd, l.stt_line", conn);
            cmd.Parameters.AddWithValue("@ten", tenHang ?? "");
            cmd.Parameters.AddWithValue("@huong", (object?)huong ?? DBNull.Value);
            using var r = await cmd.ExecuteReaderAsync();
            while (await r.ReadAsync())
                ra.Add(new DongHoaDonDto
                {
                    MaHd = r.GetString(0),
                    TenHang = r.GetString(1),
                    GhiNo = r.IsDBNull(2) ? null : r.GetString(2),
                    GhiCo = r.IsDBNull(3) ? null : r.GetString(3),
                    SttLine = r.IsDBNull(4) ? null : r.GetInt32(4),
                    SoLuong = r.IsDBNull(5) ? null : r.GetDecimal(5),
                    DonGia = r.IsDBNull(6) ? null : r.GetDecimal(6),
                    TenKh = r.IsDBNull(7) ? null : r.GetString(7),
                    TinCay = r.IsDBNull(8) ? null : r.GetDecimal(8),
                });
            return ra;
        }
    }
}
