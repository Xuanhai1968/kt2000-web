using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using KT2000.Api.Data;
using KT2000.Api.Models;

namespace KT2000.Api.Services
{
    // Nghiệp vụ NỘI BỘ (NB): danh mục đối tượng/hàng, đơn hàng, gói hàng, tra cứu
    // xuyên DB sang sổ thuế.
    //
    // ĐƠN HÀNG NẰM TRONG HOA_DON/HOA_DON_LINE — khuôn dùng chung với sổ thuế
    // (SPEC mục 4, chốt v0.3). Không có bảng DON_HANG. Nhờ vậy TON_KHO, CONG_NO và
    // engine định khoản chạy MỘT đường code cho cả hai sản phẩm (AD-NB-10).
    //
    // Vì sao dùng SqlClient thẳng chứ không EF: các bảng này nằm trong database
    // ĐƠN VỊ-NĂM, tên database chỉ biết lúc chạy (qua TenantDbResolver). AppDbContext
    // của EF gắn cứng vào Master — chỉ dùng cho việc tra Tenants (LinkedTenantCode).
    //
    // MỌI câu lệnh đều tham số hóa. Tên bảng/cột là hằng trong code, không ghép từ
    // input người dùng, nên không có chỗ cho SQL injection.
    public class NoiBoService
    {
        private readonly TenantDbResolver _resolver;
        private readonly AppDbContext _db;

        public NoiBoService(TenantDbResolver resolver, AppDbContext db)
        {
            _resolver = resolver;
            _db = db;
        }

        private async Task<SqlConnection> OpenAsync(string code, int year)
        {
            var conn = new SqlConnection(_resolver.GetTenantConnection(code, year));
            await conn.OpenAsync();
            return conn;
        }

        // ============================ DANH MỤC HÀNG ============================

        // user: để xếp mặt hàng NGƯỜI NÀY hay dùng lên đầu (USER_HANG, script 018).
        // Bỏ trống -> xếp theo tên như cũ. Tham số có mặc định để mọi chỗ gọi sẵn có
        // không phải sửa.
        public async Task<List<DmHangNbDto>> SearchHang(string code, int year, string? tu,
                                                        int gioiHan, int boQua = 0,
                                                        string? user = null)
        {
            using var conn = await OpenAsync(code, year);

            // Bảng USER_HANG chỉ có từ script 018. Đơn vị dựng trước đó vẫn tìm hàng
            // bình thường, chỉ là không có xếp hạng theo thói quen.
            var coBangXep = false;
            if (!string.IsNullOrWhiteSpace(user))
            {
                using var kiemTra = new SqlCommand(
                    "SELECT CASE WHEN OBJECT_ID('USER_HANG') IS NULL THEN 0 ELSE 1 END", conn);
                coBangXep = (int)(await kiemTra.ExecuteScalarAsync() ?? 0) == 1;
            }

            // XẾP THEO THÓI QUEN rồi mới tới tên: người bán quen tay chỉ đánh đi đánh lại
            // chục mặt hàng trong số 50, gõ một hai chữ là thứ hay dùng phải nhảy lên đầu.
            // LEFT JOIN nên mặt hàng chưa dùng lần nào vẫn ra, chỉ xếp sau (so_lan = 0).
            var xepTheo = coBangXep
                ? @"ORDER BY ISNULL(u.so_lan, 0) DESC, u.lan_cuoi DESC, h.ten_hang, h.ma_hang"
                : @"ORDER BY h.ten_hang, h.ma_hang";
            var noiBang = coBangXep
                ? "LEFT JOIN USER_HANG u ON u.ma_hang = h.ma_hang AND u.login_name = @user"
                : "";

            var sql = $@"SELECT h.ma_hang, h.ten_hang, h.dvt, h.quy_cach, h.gia_ban, h.gia_mua,
                               h.pt_vat, h.ma_ngan, h.ma_hang_thue, h.ghi_chu,
                               h.ten_tat, h.ma_vach, h.nhom_hang, h.dvt_lon, h.he_so_lon,
                               h.gia_ban_lon, h.ten_hd
                        FROM DM_HANG_NB h
                        {noiBang}
                        WHERE h.ngung_dung = 0
                          AND (@tu IS NULL OR h.ten_hang LIKE @like OR h.ma_hang LIKE @like
                               OR h.ten_tat LIKE @like OR h.ma_vach LIKE @like
                               OR h.ten_hd LIKE @like)
                        {xepTheo}
                        OFFSET (@boqua) ROWS FETCH NEXT (@top) ROWS ONLY";
            using var cmd = new SqlCommand(sql, conn);
            cmd.Parameters.AddWithValue("@top", gioiHan);
            cmd.Parameters.AddWithValue("@boqua", boQua);
            cmd.Parameters.AddWithValue("@tu", (object?)tu ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@like", $"%{tu}%");
            if (coBangXep) cmd.Parameters.AddWithValue("@user", user!);
            var ds = new List<DmHangNbDto>();
            using var r = await cmd.ExecuteReaderAsync();
            while (await r.ReadAsync())
                ds.Add(new DmHangNbDto
                {
                    MaHang = r.GetString(0),
                    TenHang = r.GetString(1),
                    Dvt = r.IsDBNull(2) ? null : r.GetString(2),
                    QuyCach = r.IsDBNull(3) ? null : r.GetString(3),
                    GiaBan = r.IsDBNull(4) ? null : r.GetDecimal(4),
                    GiaMua = r.IsDBNull(5) ? null : r.GetDecimal(5),
                    PtVat = r.IsDBNull(6) ? null : r.GetDecimal(6),
                    MaNgan = r.IsDBNull(7) ? null : r.GetString(7),
                    MaHangThue = r.IsDBNull(8) ? null : r.GetString(8),
                    GhiChu = r.IsDBNull(9) ? null : r.GetString(9),
                    TenTat = r.IsDBNull(10) ? null : r.GetString(10),
                    MaVach = r.IsDBNull(11) ? null : r.GetString(11),
                    NhomHang = r.IsDBNull(12) ? null : r.GetString(12),
                    DvtLon = r.IsDBNull(13) ? null : r.GetString(13),
                    HeSoLon = r.IsDBNull(14) ? null : r.GetDecimal(14),
                    GiaBanLon = r.IsDBNull(15) ? null : r.GetDecimal(15),
                    TenHd = r.IsDBNull(16) ? null : r.GetString(16),
                });
            r.Close();

            // Nạp quy cách cho CẢ TRANG bằng MỘT câu, không lặp mỗi mặt hàng một lần:
            // combobox trả 50 dòng thì lối kia thành 51 vòng gọi DB cho mỗi lần gõ phím.
            await NapQuyCach(conn, ds);
            return ds;
        }

        // Gắn danh sách quy cách vào các mặt hàng đã đọc. Tách hàm vì cả SearchHang lẫn
        // endpoint tra riêng một mặt hàng đều dùng.
        //
        // Bảng DM_QUY_CACH_NB chỉ có từ script 018 — đơn vị NB dựng trước đó chưa có.
        // Không kiểm tra thì cả màn đánh đơn ngã vì thiếu một bảng danh mục phụ; thiếu
        // thì đơn giản là không mặt hàng nào có quy cách, form lùi về ô ĐVT gõ tay.
        private static async Task NapQuyCach(SqlConnection conn, List<DmHangNbDto> ds)
        {
            if (ds.Count == 0) return;

            using (var kiemTra = new SqlCommand(
                "SELECT CASE WHEN OBJECT_ID('DM_QUY_CACH_NB') IS NULL THEN 0 ELSE 1 END", conn))
            {
                if ((int)(await kiemTra.ExecuteScalarAsync() ?? 0) == 0) return;
            }

            // Truyền danh sách mã hàng bằng THAM SỐ từng cái (@h0, @h1...), không nối
            // chuỗi giá trị vào SQL (luật #3 CLAUDE.md).
            var thamSo = string.Join(",", ds.Select((_, i) => $"@h{i}"));
            var sql = $@"SELECT q.ma_hang, q.ma_dvt, d.ten_dvt, d.ten_tat, d.he_so_qd, d.dvt_goc,
                                q.la_dvt_goc, q.gia_ban, q.gia_mua, q.ma_vach
                         FROM DM_QUY_CACH_NB q
                         LEFT JOIN DM_DVT_NB d ON d.ma_dvt = q.ma_dvt
                         WHERE q.ma_hang IN ({thamSo})
                         ORDER BY q.ma_hang, q.la_dvt_goc DESC, d.he_so_qd DESC, q.ma_dvt";
            using var cmd = new SqlCommand(sql, conn);
            for (int i = 0; i < ds.Count; i++)
                cmd.Parameters.AddWithValue($"@h{i}", ds[i].MaHang ?? "");

            var theoMa = ds.Where(x => x.MaHang != null)
                           .GroupBy(x => x.MaHang!)
                           .ToDictionary(g => g.Key, g => g.First(), StringComparer.OrdinalIgnoreCase);
            using var r = await cmd.ExecuteReaderAsync();
            while (await r.ReadAsync())
            {
                if (!theoMa.TryGetValue(r.GetString(0), out var h)) continue;
                h.QuyCach2.Add(new QuyCachNbDto
                {
                    MaDvt    = r.GetString(1),
                    TenDvt   = r.IsDBNull(2) ? null : r.GetString(2),
                    TenTat   = r.IsDBNull(3) ? null : r.GetString(3),
                    HeSoQd   = r.IsDBNull(4) ? null : r.GetDecimal(4),
                    DvtGoc   = r.IsDBNull(5) ? null : r.GetString(5),
                    LaDvtGoc = !r.IsDBNull(6) && r.GetBoolean(6),
                    GiaBan   = r.IsDBNull(7) ? null : r.GetDecimal(7),
                    GiaMua   = r.IsDBNull(8) ? null : r.GetDecimal(8),
                    MaVach   = r.IsDBNull(9) ? null : r.GetString(9),
                });
            }
        }

        // Thêm nhanh mặt hàng ngay trên form (phím F2). Mã tự sinh nếu để trống.
        // BR-NB-02: chọn từ từ điển thuế = CHÉP về đây, ma_hang_thue giữ vết nguồn gốc.
        public async Task<DmHangNbDto> LuuHang(string code, int year, DmHangNbDto d, string user)
        {
            using var conn = await OpenAsync(code, year);
            var ma = string.IsNullOrWhiteSpace(d.MaHang)
                ? await SinhMa(conn, "DM_HANG_NB", "ma_hang", "H")
                : d.MaHang.Trim();

            var sql = @"MERGE DM_HANG_NB AS t
                        USING (SELECT @ma AS ma_hang) AS s ON t.ma_hang = s.ma_hang
                        WHEN MATCHED THEN UPDATE SET
                            ten_hang = @ten, dvt = @dvt, quy_cach = @qc, gia_ban = @gb,
                            gia_mua = @gm, pt_vat = @vat, ma_ngan = @ngan,
                            ma_hang_thue = @thue, ghi_chu = @gc, ten_tat = @tentat,
                            ma_vach = @mavach, nhom_hang = @nhom, dvt_lon = @dvtlon,
                            he_so_lon = @hesolon, gia_ban_lon = @gbanlon, ten_hd = @tenhd,
                            updated_by = @user, updated_at = SYSDATETIME()
                        WHEN NOT MATCHED THEN INSERT
                            (ma_hang, ten_hang, dvt, quy_cach, gia_ban, gia_mua, pt_vat,
                             ma_ngan, ma_hang_thue, ghi_chu, ten_tat, ma_vach, nhom_hang,
                             dvt_lon, he_so_lon, gia_ban_lon, ten_hd, created_by)
                            VALUES (@ma, @ten, @dvt, @qc, @gb, @gm, @vat, @ngan, @thue, @gc,
                                    @tentat, @mavach, @nhom, @dvtlon, @hesolon, @gbanlon,
                                    @tenhd, @user);";
            using var cmd = new SqlCommand(sql, conn);
            cmd.Parameters.AddWithValue("@ma", ma);
            cmd.Parameters.AddWithValue("@ten", d.TenHang ?? "");
            cmd.Parameters.AddWithValue("@dvt", (object?)d.Dvt ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@qc", (object?)d.QuyCach ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@gb", (object?)d.GiaBan ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@gm", (object?)d.GiaMua ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@vat", (object?)d.PtVat ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@ngan", (object?)d.MaNgan ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@thue", (object?)d.MaHangThue ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@gc", (object?)d.GhiChu ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@tentat", (object?)d.TenTat ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@mavach", (object?)d.MaVach ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@nhom", (object?)d.NhomHang ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@dvtlon", (object?)d.DvtLon ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@hesolon", (object?)d.HeSoLon ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@gbanlon", (object?)d.GiaBanLon ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@tenhd",
                string.IsNullOrWhiteSpace(d.TenHd)
                || d.TenHd.Trim() == (d.TenHang ?? "").Trim()
                    ? DBNull.Value : d.TenHd.Trim());
            cmd.Parameters.AddWithValue("@user", user);
            await cmd.ExecuteNonQueryAsync();
            d.MaHang = ma;
            return d;
        }

        // ============================ DANH MỤC ĐỐI TƯỢNG ============================
        // BR-NB-01: một bảng cho cả khách lẫn nhân viên. loaiDt lọc theo vai:
        //   "KH" — combobox khách trên đơn hàng
        //   "NV" — combobox NVKD/NVVC
        //   null — không lọc (màn hình danh mục)
        // maNhan != null -> chỉ lấy khách của nhãn đó. Danh mục 1600+ khách, gõ tên
        // không nhớ thì lọc theo nhãn cho danh sách ngắn lại (ô Nhãn hàng trên form).
        // boQua: xem ghi chú ở SearchHang — cùng cơ chế cuộn vô tận.
        public async Task<List<DmKhNbDto>> SearchKh(string code, int year, string? tu,
                                                    string? loaiDt, int gioiHan,
                                                    string? maNhan = null, int boQua = 0)
        {
            using var conn = await OpenAsync(code, year);
            // LEFT JOIN chứ không INNER: khách chưa gắn nhãn (29 dòng) vẫn phải tìm được,
            // INNER JOIN là họ biến mất khỏi combobox mà không ai hiểu vì sao.
            var sql = @"SELECT k.ma_kh, k.ten_kh, k.loai_dt, k.ten_giao_dich,
                               k.mst, k.dia_chi, k.dien_thoai, k.nguoi_lien_he, k.ma_kh_hd,
                               k.cong_no_dau, k.ghi_chu, k.ten_tat, k.dia_chi_giao,
                               k.ma_nhan, n.ten_nhan, k.ma_tinh
                        FROM DM_KH_NB k
                        LEFT JOIN DM_NHAN n ON n.ma_nhan = k.ma_nhan
                        WHERE k.ngung_dung = 0
                          AND (@tu IS NULL OR k.ten_kh LIKE @like OR k.ma_kh LIKE @like
                               OR k.mst LIKE @like OR k.ten_giao_dich LIKE @like
                               OR k.ten_tat LIKE @like OR k.dien_thoai LIKE @like)
                          AND (@loai IS NULL OR k.loai_dt = @loai)
                          AND (@nhan IS NULL OR k.ma_nhan = @nhan)
                        ORDER BY k.ten_kh, k.ma_kh
                        OFFSET (@boqua) ROWS FETCH NEXT (@top) ROWS ONLY";
            using var cmd = new SqlCommand(sql, conn);
            cmd.Parameters.AddWithValue("@top", gioiHan);
            cmd.Parameters.AddWithValue("@boqua", boQua);
            cmd.Parameters.AddWithValue("@tu", (object?)tu ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@like", $"%{tu}%");
            cmd.Parameters.AddWithValue("@loai", (object?)loaiDt ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@nhan", (object?)maNhan ?? DBNull.Value);
            var ds = new List<DmKhNbDto>();
            using var r = await cmd.ExecuteReaderAsync();
            while (await r.ReadAsync())
                ds.Add(new DmKhNbDto
                {
                    MaKh = r.GetString(0),
                    TenKh = r.GetString(1),
                    LoaiDt = r.IsDBNull(2) ? "KH" : r.GetString(2),
                    TenGiaoDich = r.IsDBNull(3) ? null : r.GetString(3),
                    Mst = r.IsDBNull(4) ? null : r.GetString(4),
                    DiaChi = r.IsDBNull(5) ? null : r.GetString(5),
                    DienThoai = r.IsDBNull(6) ? null : r.GetString(6),
                    NguoiLienHe = r.IsDBNull(7) ? null : r.GetString(7),
                    MaKhHd = r.IsDBNull(8) ? null : r.GetString(8),
                    CongNoDau = r.IsDBNull(9) ? null : r.GetDecimal(9),
                    GhiChu = r.IsDBNull(10) ? null : r.GetString(10),
                    TenTat = r.IsDBNull(11) ? null : r.GetString(11),
                    DiaChiGiao = r.IsDBNull(12) ? null : r.GetString(12),
                    MaNhan = r.IsDBNull(13) ? null : r.GetString(13),
                    TenNhan = r.IsDBNull(14) ? null : r.GetString(14),
                    MaTinh = r.IsDBNull(15) ? null : r.GetString(15),
                });
            return ds;
        }

        // Danh mục nhãn hàng — nuôi ô "Nhãn hàng" trên form đánh đơn (dùng để lọc khách).
        // 43 dòng, trả hết một lượt, không phân trang.
        public async Task<List<DmNhanDto>> SearchNhan(string code, int year, string? tu)
        {
            using var conn = await OpenAsync(code, year);
            using var cmd = new SqlCommand(
                @"SELECT ma_nhan, ten_nhan, ten_cty, mst, ten_tat
                  FROM DM_NHAN
                  WHERE ngung_dung = 0
                    AND (@tu IS NULL OR ten_nhan LIKE @like OR ma_nhan LIKE @like
                         OR ten_cty LIKE @like OR ten_tat LIKE @like)
                  ORDER BY ten_nhan", conn);
            cmd.Parameters.AddWithValue("@tu", (object?)tu ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@like", $"%{tu}%");
            var ds = new List<DmNhanDto>();
            using var r = await cmd.ExecuteReaderAsync();
            while (await r.ReadAsync())
                ds.Add(new DmNhanDto
                {
                    MaNhan = r.GetString(0),
                    TenNhan = r.IsDBNull(1) ? "" : r.GetString(1),
                    TenCty = r.IsDBNull(2) ? null : r.GetString(2),
                    Mst = r.IsDBNull(3) ? null : r.GetString(3),
                    TenTat = r.IsDBNull(4) ? null : r.GetString(4),
                });
            return ds;
        }

        public async Task<List<DmMauDto>> SearchMau(string code, int year, string? tu,
                                                    int gioiHan, int boQua = 0)
        {
            using var conn = await OpenAsync(code, year);
            using var cmd = new SqlCommand(
                @"SELECT m.ma_mau,
                         STRING_AGG(m.nhom_mau, N' / ')
                             WITHIN GROUP (ORDER BY m.thu_tu, m.nhom_mau),
                         MIN(m.ma_hex), MIN(m.thu_tu), MIN(m.ghi_chu)
                  FROM DM_MAU m
                  WHERE m.ngung_dung = 0
                    AND (@tu IS NULL OR EXISTS (
                          SELECT 1 FROM DM_MAU k
                          WHERE k.ma_mau = m.ma_mau AND k.ngung_dung = 0
                            AND (k.ma_mau LIKE @like OR k.nhom_mau LIKE @like
                                 OR k.ghi_chu LIKE @like)))
                  GROUP BY m.ma_mau
                  ORDER BY CASE WHEN MIN(m.thu_tu) IS NULL THEN 1 ELSE 0 END,
                           MIN(m.thu_tu), m.ma_mau
                  OFFSET (@boqua) ROWS FETCH NEXT (@top) ROWS ONLY", conn);
            cmd.Parameters.AddWithValue("@top", gioiHan);
            cmd.Parameters.AddWithValue("@boqua", boQua);
            cmd.Parameters.AddWithValue("@tu", (object?)tu ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@like", $"%{tu}%");
            var ds = new List<DmMauDto>();
            using var r = await cmd.ExecuteReaderAsync();
            while (await r.ReadAsync())
                ds.Add(new DmMauDto
                {
                    MaMau = r.GetString(0),
                    NhomMau = r.IsDBNull(1) ? "" : r.GetString(1),
                    MaHex = r.IsDBNull(2) ? null : r.GetString(2),
                    ThuTu = r.IsDBNull(3) ? null : r.GetInt32(3),
                    GhiChu = r.IsDBNull(4) ? null : r.GetString(4),
                });
            return ds;
        }

        public async Task<List<DmKmNbDto>> SearchKm(string code, int year, string? tu,
                                                    int gioiHan, int boQua = 0,
                                                    bool chiConHieuLuc = false)
        {
            using var conn = await OpenAsync(code, year);
            var sql = @"SELECT k.ma_km, k.ten_km, k.ma_hang, k.ma_dvt, k.ma_dvt_tang,
                               k.sl_mua, k.sl_tang, k.tu_ngay, k.den_ngay, k.ghi_chu,
                               h.ten_hang, dm.ten_tat, dt.ten_tat
                        FROM DM_KM_NB k
                        LEFT JOIN DM_HANG_NB h  ON h.ma_hang = k.ma_hang
                        LEFT JOIN DM_DVT_NB  dm ON dm.ma_dvt = k.ma_dvt
                        LEFT JOIN DM_DVT_NB  dt ON dt.ma_dvt = k.ma_dvt_tang
                        WHERE (@tu IS NULL OR k.ten_km LIKE @like OR k.ma_km LIKE @like
                               OR k.ma_hang LIKE @like OR h.ten_hang LIKE @like)
                          AND (@loc = 0 OR ((k.tu_ngay  IS NULL OR k.tu_ngay  <= CAST(SYSDATETIME() AS DATE))
                                        AND (k.den_ngay IS NULL OR k.den_ngay >= CAST(SYSDATETIME() AS DATE))))
                        ORDER BY k.ma_hang, k.sl_mua DESC, k.ma_km
                        OFFSET (@boqua) ROWS FETCH NEXT (@top) ROWS ONLY";
            using var cmd = new SqlCommand(sql, conn);
            cmd.Parameters.AddWithValue("@top", gioiHan);
            cmd.Parameters.AddWithValue("@boqua", boQua);
            cmd.Parameters.AddWithValue("@tu", (object?)tu ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@like", $"%{tu}%");
            cmd.Parameters.AddWithValue("@loc", chiConHieuLuc ? 1 : 0);

            var ds = new List<DmKmNbDto>();
            using var r = await cmd.ExecuteReaderAsync();
            while (await r.ReadAsync())
                ds.Add(new DmKmNbDto
                {
                    MaKm       = r.GetString(0),
                    TenKm      = r.IsDBNull(1) ? "" : r.GetString(1),
                    MaHang     = r.IsDBNull(2) ? "" : r.GetString(2),
                    MaDvt      = r.IsDBNull(3) ? "" : r.GetString(3),
                    MaDvtTang  = r.IsDBNull(4) ? "" : r.GetString(4),
                    SlMua      = r.IsDBNull(5) ? 0 : r.GetDecimal(5),
                    SlTang     = r.IsDBNull(6) ? 0 : r.GetDecimal(6),
                    TuNgay     = r.IsDBNull(7) ? null : r.GetDateTime(7),
                    DenNgay    = r.IsDBNull(8) ? null : r.GetDateTime(8),
                    GhiChu     = r.IsDBNull(9) ? null : r.GetString(9),
                    TenHang    = r.IsDBNull(10) ? null : r.GetString(10),
                    TenDvt     = r.IsDBNull(11) ? null : r.GetString(11),
                    TenDvtTang = r.IsDBNull(12) ? null : r.GetString(12),
                });
            return ds;
        }

        public async Task<DmKmNbDto> LuuKm(string code, int year, DmKmNbDto d, string user)
        {
            using var conn = await OpenAsync(code, year);
            var ma = string.IsNullOrWhiteSpace(d.MaKm)
                ? await SinhMaKm(conn)
                : d.MaKm.Trim();

            var dvtTang = string.IsNullOrWhiteSpace(d.MaDvtTang) ? d.MaDvt : d.MaDvtTang;

            var sql = @"MERGE DM_KM_NB AS t
                        USING (SELECT @ma AS ma_km) AS s ON t.ma_km = s.ma_km
                        WHEN MATCHED THEN UPDATE SET
                            ten_km = @ten, ma_hang = @mahang, ma_dvt = @dvt,
                            ma_dvt_tang = @dvttang, sl_mua = @slmua, sl_tang = @sltang,
                            tu_ngay = @tu, den_ngay = @den, ghi_chu = @gc,
                            updated_by = @user, updated_at = SYSDATETIME()
                        WHEN NOT MATCHED THEN INSERT
                            (ma_km, ten_km, ma_hang, ma_dvt, ma_dvt_tang,
                             sl_mua, sl_tang, tu_ngay, den_ngay, ghi_chu, created_by)
                            VALUES (@ma, @ten, @mahang, @dvt, @dvttang,
                                    @slmua, @sltang, @tu, @den, @gc, @user);";
            using var cmd = new SqlCommand(sql, conn);
            cmd.Parameters.AddWithValue("@ma", ma);
            cmd.Parameters.AddWithValue("@ten", d.TenKm ?? "");
            cmd.Parameters.AddWithValue("@mahang", d.MaHang ?? "");
            cmd.Parameters.AddWithValue("@dvt", d.MaDvt ?? "");
            cmd.Parameters.AddWithValue("@dvttang", dvtTang ?? "");
            cmd.Parameters.AddWithValue("@slmua", d.SlMua);
            cmd.Parameters.AddWithValue("@sltang", d.SlTang);
            cmd.Parameters.AddWithValue("@tu", (object?)d.TuNgay ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@den", (object?)d.DenNgay ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@gc", (object?)d.GhiChu ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@user", user);
            await cmd.ExecuteNonQueryAsync();

            d.MaKm = ma;
            d.MaDvtTang = dvtTang ?? "";
            return d;
        }

        public async Task<bool> XoaKm(string code, int year, string maKm)
        {
            using var conn = await OpenAsync(code, year);
            using var cmd = new SqlCommand("DELETE FROM DM_KM_NB WHERE ma_km = @ma", conn);
            cmd.Parameters.AddWithValue("@ma", maKm);
            return await cmd.ExecuteNonQueryAsync() > 0;
        }

        public async Task<DmKhNbDto> LuuKh(string code, int year, DmKhNbDto d, string user)
        {
            using var conn = await OpenAsync(code, year);
            var loai = ChuanHoaLoaiDt(d.LoaiDt);
            var ma = string.IsNullOrWhiteSpace(d.MaKh)
                ? await SinhMa(conn, "DM_KH_NB", "ma_kh", loai == "NV" ? "N" : "K")
                : d.MaKh.Trim();

            var sql = @"MERGE DM_KH_NB AS t
                        USING (SELECT @ma AS ma_kh) AS s ON t.ma_kh = s.ma_kh
                        WHEN MATCHED THEN UPDATE SET
                            ten_kh = @ten, loai_dt = @loai, ten_giao_dich = @tgd, mst = @mst,
                            dia_chi = @dc, dien_thoai = @dt, nguoi_lien_he = @nlh,
                            ma_kh_hd = @khhd, cong_no_dau = @cnd, ghi_chu = @gc,
                            ten_tat = @tentat, dia_chi_giao = @dcgiao,
                            updated_by = @user, updated_at = SYSDATETIME()
                        WHEN NOT MATCHED THEN INSERT
                            (ma_kh, ten_kh, loai_dt, ten_giao_dich, mst, dia_chi, dien_thoai,
                             nguoi_lien_he, ma_kh_hd, cong_no_dau, ghi_chu,
                             ten_tat, dia_chi_giao, created_by)
                            VALUES (@ma, @ten, @loai, @tgd, @mst, @dc, @dt, @nlh, @khhd,
                                    @cnd, @gc, @tentat, @dcgiao, @user);";
            using var cmd = new SqlCommand(sql, conn);
            cmd.Parameters.AddWithValue("@ma", ma);
            cmd.Parameters.AddWithValue("@ten", d.TenKh ?? "");
            cmd.Parameters.AddWithValue("@loai", loai);
            cmd.Parameters.AddWithValue("@tgd", (object?)d.TenGiaoDich ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@mst", (object?)d.Mst ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@dc", (object?)d.DiaChi ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@dt", (object?)d.DienThoai ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@nlh", (object?)d.NguoiLienHe ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@khhd", (object?)d.MaKhHd ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@cnd", (object?)d.CongNoDau ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@gc", (object?)d.GhiChu ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@tentat", (object?)d.TenTat ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@dcgiao", (object?)d.DiaChiGiao ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@user", user);
            await cmd.ExecuteNonQueryAsync();
            d.MaKh = ma;
            d.LoaiDt = loai;
            return d;
        }


        public static string ChuanHoaLoaiDt(string? loai)
        {
            var l = (loai ?? "").Trim().ToUpperInvariant();
            return l == "NV" ? "NV" : "KH";
        }

        public async Task<string> SoDonKeTiep(string code, int year, string huong)
        {
            using var conn = await OpenAsync(code, year);
            return await SoDonKeTiep(conn, null, huong);
        }

        private static async Task<string> SoDonKeTiep(SqlConnection conn, SqlTransaction? tran,
                                                      string huong)
        {
            var prefix = huong == "VAO" ? "V" : "R";
            var khoa = tran != null ? "WITH (UPDLOCK, HOLDLOCK)" : "";
            using var cmd = new SqlCommand(
                $@"SELECT MAX(CAST(SUBSTRING(ma_hd, 2, LEN(ma_hd) - 1) AS BIGINT))
                   FROM HOA_DON {khoa}
                   WHERE ma_hd LIKE @p + N'[0-9]%'
                     AND SUBSTRING(ma_hd, 2, LEN(ma_hd) - 1) NOT LIKE '%[^0-9]%'", conn, tran);
            cmd.Parameters.AddWithValue("@p", prefix);
            var max = await cmd.ExecuteScalarAsync();
            var tiep = (max == null || max == DBNull.Value ? 0 : Convert.ToInt64(max)) + 1;
            return $"{prefix}{tiep}";
        }

        private const string SqlTienHang =
            @"ISNULL((SELECT SUM(CASE WHEN l.la_hang_tang = 1 THEN 0
                                      ELSE l.so_luong * l.don_gia
                                           + ISNULL(l.tien_tinh_mau, 0) END)
                      FROM HOA_DON_LINE l WHERE l.ma_hd = d.ma_hd), 0)";

        public async Task<List<DonNbDto>> DanhSachDon(string code, int year, string? huong,
                                                      int? thang, string? tu, int gioiHan)
        {
            using var conn = await OpenAsync(code, year);
            var loc = huong == null
                ? "(d.ma_hd LIKE N'V[0-9]%' OR d.ma_hd LIKE N'R[0-9]%')"
                : "d.huong = @huong AND d.ma_hd LIKE @prefix + N'[0-9]%'";
            var sql = $@"SELECT TOP (@top) d.ma_hd, d.ngay, d.ngay_nh, d.ma_kh, d.ten_kh,
                               d.mst, d.dia_chi, d.ma_nvkd, d.ma_nvvc, d.ma_goi, d.ghi_chu,
                               d.tien_vat, d.tthai_hd,
                               kd.ten_kh AS ten_nvkd, vc.ten_kh AS ten_nvvc,
                               {SqlTienHang} AS tien_hang, d.huong, d.dia_chi_giao, nh.ten_nhan
                        FROM HOA_DON d
                        LEFT JOIN DM_KH_NB kd ON kd.ma_kh = d.ma_nvkd
                        LEFT JOIN DM_KH_NB vc ON vc.ma_kh = d.ma_nvvc
                  LEFT JOIN DM_KH_NB kh ON kh.ma_kh = d.ma_kh
                  LEFT JOIN DM_NHAN  nh ON nh.ma_nhan = kh.ma_nhan
                        WHERE {loc}
                          AND (@thang IS NULL OR d.thang = @thang)
                          AND (@tu IS NULL OR d.ma_hd LIKE @like OR d.ten_kh LIKE @like)
                        ORDER BY d.ngay DESC, d.ma_hd DESC";
            using var cmd = new SqlCommand(sql, conn);
            cmd.Parameters.AddWithValue("@top", gioiHan);
            if (huong != null)
            {
                cmd.Parameters.AddWithValue("@huong", huong);
                cmd.Parameters.AddWithValue("@prefix", huong == "VAO" ? "V" : "R");
            }
            cmd.Parameters.AddWithValue("@thang", (object?)thang ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@tu", (object?)tu ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@like", $"%{tu}%");
            var ds = new List<DonNbDto>();
            using var r = await cmd.ExecuteReaderAsync();
            while (await r.ReadAsync()) ds.Add(DocDon(r));
            return ds;
        }

        public async Task<DonNbDto?> DonGanNhatCuaKhach(string code, int year,
                                                        string huong, string maKh)
        {
            if (string.IsNullOrWhiteSpace(maKh)) return null;

            string? maHd;
            using (var conn = await OpenAsync(code, year))
            using (var cmd = new SqlCommand(
                @"SELECT TOP (1) d.ma_hd
                  FROM HOA_DON d
                  WHERE d.ma_kh = @makh
                    AND d.huong = @huong
                    AND d.ma_hd LIKE @prefix + N'[0-9]%'
                  ORDER BY d.ngay DESC, d.ma_hd DESC", conn))
            {
                cmd.Parameters.AddWithValue("@makh", maKh);
                cmd.Parameters.AddWithValue("@huong", huong);
                cmd.Parameters.AddWithValue("@prefix", huong == "VAO" ? "V" : "R");
                var o = await cmd.ExecuteScalarAsync();
                maHd = o as string;
            }

            return maHd == null ? null : await LayDon(code, year, maHd);
        }

        public async Task<DonNbDto?> LayDon(string code, int year, string maHd)
        {
            using var conn = await OpenAsync(code, year);
            DonNbDto? don = null;
            using (var cmd = new SqlCommand(
                $@"SELECT d.ma_hd, d.ngay, d.ngay_nh, d.ma_kh, d.ten_kh, d.mst, d.dia_chi,
                         d.ma_nvkd, d.ma_nvvc, d.ma_goi, d.ghi_chu, d.tien_vat, d.tthai_hd,
                         kd.ten_kh AS ten_nvkd, vc.ten_kh AS ten_nvvc,
                         {SqlTienHang} AS tien_hang, d.huong, d.dia_chi_giao, nh.ten_nhan
                  FROM HOA_DON d
                  LEFT JOIN DM_KH_NB kd ON kd.ma_kh = d.ma_nvkd
                  LEFT JOIN DM_KH_NB vc ON vc.ma_kh = d.ma_nvvc
                  LEFT JOIN DM_KH_NB kh ON kh.ma_kh = d.ma_kh
                  LEFT JOIN DM_NHAN  nh ON nh.ma_nhan = kh.ma_nhan
                  WHERE d.ma_hd = @ma", conn))
            {
                cmd.Parameters.AddWithValue("@ma", maHd);
                using var r = await cmd.ExecuteReaderAsync();
                if (await r.ReadAsync()) don = DocDon(r);
            }
            if (don == null) return null;

            using (var cmd = new SqlCommand(
                @"SELECT l.stt_line, l.ma_hang, l.ten_hang_goc, l.dvt, l.so_luong, l.don_gia,
                         -- CAST bắt buộc: HOA_DON_LINE.pt_vat là INT từ script 020, mà
                         -- chỗ đọc bên dưới dùng GetDecimal — không ép thì ném
                         -- InvalidCastException lúc chạy. Ép trong SQL để chỗ đọc khỏi
                         -- phụ thuộc kiểu cột. (DM_HANG_NB.pt_vat là cột KHÁC, vẫn DECIMAL.)
                         CAST(l.pt_vat AS DECIMAL(18,3)) AS pt_vat,
                         l.tien_vat_l, l.ghi_chu, l.he_so_qd, l.sl_quy_doi,
                         l.la_hang_tang, l.quy_cach, l.ngay_nh_l,
                         l.ma_mau, l.tien_tinh_mau, m.ma_hex, h.ten_hd
                  FROM HOA_DON_LINE l
                  OUTER APPLY (SELECT TOP 1 ma_hex FROM DM_MAU
                               WHERE ma_mau = l.ma_mau) m
                  LEFT JOIN DM_HANG_NB h ON h.ma_hang = l.ma_hang
                  WHERE l.ma_hd = @ma ORDER BY l.stt_line, l.auto_num", conn))
            {
                cmd.Parameters.AddWithValue("@ma", maHd);
                using var r = await cmd.ExecuteReaderAsync();
                while (await r.ReadAsync())
                {
                    var sl = r.IsDBNull(4) ? 0 : r.GetDecimal(4);
                    var dg = r.IsDBNull(5) ? 0 : r.GetDecimal(5);
                    var tang = !r.IsDBNull(11) && r.GetBoolean(11);
                    var tinhMau = r.IsDBNull(15) ? 0 : r.GetDecimal(15);
                    don.Lines.Add(new DonNbLineDto
                    {
                        SttLine = r.IsDBNull(0) ? 0 : r.GetInt32(0),
                        MaHang = r.IsDBNull(1) ? null : r.GetString(1),
                        TenHang = r.IsDBNull(2) ? null : r.GetString(2),
                        Dvt = r.IsDBNull(3) ? null : r.GetString(3),
                        SoLuong = sl,
                        DonGia = dg,
                        ThanhTien = tang ? 0 : decimal.Round(sl * dg + tinhMau, 2),
                        PtVat = r.IsDBNull(6) ? 0 : r.GetDecimal(6),
                        TienVatL = r.IsDBNull(7) ? 0 : r.GetDecimal(7),
                        GhiChu = r.IsDBNull(8) ? null : r.GetString(8),
                        HeSoQd = r.IsDBNull(9) ? null : r.GetDecimal(9),
                        SlQuyDoi = r.IsDBNull(10) ? null : r.GetDecimal(10),
                        LaHangTang = tang,
                        QuyCach = r.IsDBNull(12) ? null : r.GetString(12),
                        NgayNhL = r.IsDBNull(13) ? null : r.GetDateTime(13),
                        MaMau = r.IsDBNull(14) ? null : r.GetString(14),
                        TienTinhMau = tang ? 0 : tinhMau,
                        MaHex = r.IsDBNull(16) ? null : r.GetString(16),
                        TenHd = r.IsDBNull(17) ? null : r.GetString(17),
                    });
                }
            }
            return don;
        }

        private static DonNbDto DocDon(SqlDataReader r)
        {
            var tienHang = r.IsDBNull(15) ? 0 : r.GetDecimal(15);
            var tienVat = r.IsDBNull(11) ? 0 : r.GetDecimal(11);
            return new DonNbDto
            {
                MaHd = r.GetString(0),
                Ngay = r.IsDBNull(1) ? null : r.GetDateTime(1),
                NgayNh = r.IsDBNull(2) ? null : r.GetDateTime(2),
                MaKh = r.IsDBNull(3) ? null : r.GetString(3),
                TenKh = r.IsDBNull(4) ? null : r.GetString(4),
                Mst = r.IsDBNull(5) ? null : r.GetString(5),
                DiaChi = r.IsDBNull(6) ? null : r.GetString(6),
                MaNvkd = r.IsDBNull(7) ? null : r.GetString(7),
                MaNvvc = r.IsDBNull(8) ? null : r.GetString(8),
                MaGoi = r.IsDBNull(9) ? null : r.GetString(9),
                GhiChu = r.IsDBNull(10) ? null : r.GetString(10),
                TienVat = tienVat,
                TthaiHd = r.IsDBNull(12) ? "nhap" : r.GetString(12),
                TenNvkd = r.IsDBNull(13) ? null : r.GetString(13),
                TenNvvc = r.IsDBNull(14) ? null : r.GetString(14),
                TienHang = tienHang,
                TongTien = tienHang + tienVat,
                Huong = r.IsDBNull(16) ? null : r.GetString(16),
                DiaChiGiao = r.IsDBNull(17) ? null : r.GetString(17),
                TenNhan = r.IsDBNull(18) ? null : r.GetString(18),
            };
        }

        public async Task<DonNbDto> LuuDon(string code, int year, string huong,
                                           DonNbDto d, string user)
        {
            if (huong != "VAO" && huong != "RA")
                throw new ArgumentException("Hướng đơn chỉ nhận VAO hoặc RA");

            var lines = (d.Lines ?? new List<DonNbLineDto>())
                .Where(l => !string.IsNullOrWhiteSpace(l.MaHang) && l.SoLuong > 0)
                .ToList();
            if (lines.Count == 0)
                throw new ArgumentException("Đơn phải có ít nhất một dòng hàng hợp lệ");

            decimal tienHang = 0, tienVat = 0;
            for (int i = 0; i < lines.Count; i++)
            {
                var l = lines[i];
                l.SttLine = i + 1;
                l.MaMau = string.IsNullOrWhiteSpace(l.MaMau) ? null : l.MaMau.Trim();
                if (l.MaMau == null) l.TienTinhMau = 0;
                if (l.TienTinhMau < 0) l.TienTinhMau = 0;
                l.ThanhTien = decimal.Round(l.SoLuong * l.DonGia + l.TienTinhMau, 2);
                l.TienVatL = decimal.Round(l.ThanhTien * l.PtVat / 100m, 2);
                if (l.LaHangTang) { l.ThanhTien = 0; l.TienVatL = 0; l.TienTinhMau = 0; }
                var heSo = l.HeSoQd is > 0 ? l.HeSoQd.Value : 1m;
                l.SlQuyDoi = decimal.Round(l.SoLuong * heSo, 3);
                tienHang += l.ThanhTien;
                tienVat += l.TienVatL;
            }

            using var conn = await OpenAsync(code, year);
            using var tran = conn.BeginTransaction();
            try
            {
                bool themMoi = string.IsNullOrWhiteSpace(d.MaHd);
                var maHd = themMoi
                    ? await SoDonKeTiep(conn, tran, huong)
                    : d.MaHd!.Trim();

                if (!themMoi)
                    await ChanSuaDonTrongGoiDaChot(conn, tran, maHd);

                var ngay = d.Ngay ?? DateTime.Today;
                var sql = @"MERGE HOA_DON AS t
                            USING (SELECT @ma AS ma_hd) AS s ON t.ma_hd = s.ma_hd
                            WHEN MATCHED THEN UPDATE SET
                                ngay = @ngay, thang = @thang, ngay_nh = @ngaynh,
                                ma_kh = @makh, ten_kh = @tenkh, dia_chi = @dc,
                                dia_chi_giao = @dcgiao,
                                ma_nvkd = @nvkd, ma_nvvc = @nvvc,
                                ghi_chu = @gc, tien_vat = @tv, tthai_hd = @tt,
                                updated_by = @user, updated_at = SYSDATETIME()
                            WHEN NOT MATCHED THEN INSERT
                                (ma_hd, ngay, thang, ngay_nh, ma_kh, ten_kh, dia_chi,
                                 dia_chi_giao,
                                 ma_nvkd, ma_nvvc, ghi_chu, tien_vat, tthai_hd, created_by)
                                VALUES (@ma, @ngay, @thang, @ngaynh, @makh, @tenkh, @dc,
                                        @dcgiao,
                                        @nvkd, @nvvc, @gc, @tv, @tt, @user);";
                using (var cmd = new SqlCommand(sql, conn, tran))
                {
                    cmd.Parameters.AddWithValue("@ma", maHd);
                    cmd.Parameters.AddWithValue("@ngay", ngay);
                    cmd.Parameters.AddWithValue("@thang", ngay.Month);
                    cmd.Parameters.AddWithValue("@ngaynh", (object?)d.NgayNh ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("@makh", (object?)d.MaKh ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("@tenkh", (object?)d.TenKh ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("@dc", (object?)d.DiaChi ?? DBNull.Value);
                    // Trùng địa chỉ cửa hàng -> lưu NULL, khỏi giữ bản sao thừa.
                    // Trống nghĩa là "giao đúng địa chỉ cửa hàng".
                    cmd.Parameters.AddWithValue("@dcgiao",
                        string.IsNullOrWhiteSpace(d.DiaChiGiao)
                        || d.DiaChiGiao.Trim() == (d.DiaChi ?? "").Trim()
                            ? DBNull.Value : d.DiaChiGiao.Trim());
                    cmd.Parameters.AddWithValue("@nvkd", (object?)d.MaNvkd ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("@nvvc", (object?)d.MaNvvc ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("@gc", (object?)d.GhiChu ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("@tv", tienVat);
                    cmd.Parameters.AddWithValue("@tt", string.IsNullOrWhiteSpace(d.TthaiHd)
                                                      ? "nhap" : d.TthaiHd);
                    cmd.Parameters.AddWithValue("@user", user);
                    await cmd.ExecuteNonQueryAsync();
                }
                using (var del = new SqlCommand("DELETE FROM HOA_DON_LINE WHERE ma_hd = @ma",
                                                conn, tran))
                {
                    del.Parameters.AddWithValue("@ma", maHd);
                    await del.ExecuteNonQueryAsync();
                }

                foreach (var l in lines)
                {
                    using var cmd = new SqlCommand(
                        @"INSERT INTO HOA_DON_LINE
                            (ma_hd, stt_line, ma_hang, ten_hang_goc, dvt, so_luong, don_gia,
                             pt_vat, tien_vat_l, ghi_chu,
                             he_so_qd, sl_quy_doi, la_hang_tang, quy_cach, ngay_nh_l,
                             ma_mau, tien_tinh_mau, created_by)
                          VALUES (@ma, @stt, @mahang, @tenhang, @dvt, @sl, @dg,
                                  @vat, @tienvat, @gc,
                                  @heso, @slqd, @tang, @quycach, @ngaynhl,
                                  @mamau, @tinhmau, @user)", conn, tran);
                    cmd.Parameters.AddWithValue("@ma", maHd);
                    cmd.Parameters.AddWithValue("@stt", l.SttLine);
                    cmd.Parameters.AddWithValue("@mahang", (object?)l.MaHang ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("@tenhang", (object?)l.TenHang ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("@dvt", (object?)l.Dvt ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("@sl", l.SoLuong);
                    cmd.Parameters.AddWithValue("@dg", l.DonGia);
                    cmd.Parameters.AddWithValue("@vat", l.PtVat);
                    cmd.Parameters.AddWithValue("@tienvat", l.TienVatL);
                    cmd.Parameters.AddWithValue("@gc", (object?)l.GhiChu ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("@heso", (object?)l.HeSoQd ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("@slqd", (object?)l.SlQuyDoi ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("@tang", l.LaHangTang);
                    cmd.Parameters.AddWithValue("@quycach", (object?)l.QuyCach ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("@ngaynhl", (object?)l.NgayNhL ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("@mamau", (object?)l.MaMau ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("@tinhmau", l.TienTinhMau);
                    cmd.Parameters.AddWithValue("@user", user);
                    await cmd.ExecuteNonQueryAsync();
                }

                tran.Commit();

                // Đếm mặt hàng vừa dùng để lần sau ô gợi ý xếp nó lên đầu (USER_HANG).
                // Đặt SAU Commit và nuốt mọi lỗi bên trong: đây là thống kê tiện dụng,
                // hỏng nó không được phép làm hỏng việc lưu đơn — đơn đã ghi xong rồi.
                await GhiVetHangDaDung(conn, user, lines);

                d.MaHd = maHd;
                d.Ngay = ngay;
                d.TienHang = tienHang;
                d.TienVat = tienVat;
                d.TongTien = tienHang + tienVat;
                d.Lines = lines;
                return d;
            }
            catch
            {
                tran.Rollback();
                throw;
            }
        }

        public async Task<bool> XoaDon(string code, int year, string maHd)
        {
            using var conn = await OpenAsync(code, year);
            using var tran = conn.BeginTransaction();
            try
            {
                await ChanSuaDonTrongGoiDaChot(conn, tran, maHd);
                // HOA_DON_LINE KHÔNG có ON DELETE CASCADE (khuôn 010) -> phải xóa tay
                using (var d1 = new SqlCommand("DELETE FROM HOA_DON_LINE WHERE ma_hd = @ma",
                                               conn, tran))
                {
                    d1.Parameters.AddWithValue("@ma", maHd);
                    await d1.ExecuteNonQueryAsync();
                }
                using var d2 = new SqlCommand("DELETE FROM HOA_DON WHERE ma_hd = @ma", conn, tran);
                d2.Parameters.AddWithValue("@ma", maHd);
                var n = await d2.ExecuteNonQueryAsync();
                tran.Commit();
                return n > 0;
            }
            catch
            {
                tran.Rollback();
                throw;
            }
        }

        // BR-NB-08: "Đơn thuộc gói đã chốt bị KHÓA sửa; muốn sửa phải rút đơn khỏi gói."
        // Chặn ở tầng service để mọi đường vào (form, API gọi thẳng) đều dính luật.
        private static async Task ChanSuaDonTrongGoiDaChot(SqlConnection conn, SqlTransaction tran,
                                                           string maHd)
        {
            using var cmd = new SqlCommand(
                @"SELECT g.ma_goi, g.trang_thai
                  FROM HOA_DON d JOIN GOI_HD g ON g.ma_goi = d.ma_goi
                  WHERE d.ma_hd = @ma", conn, tran);
            cmd.Parameters.AddWithValue("@ma", maHd);
            using var r = await cmd.ExecuteReaderAsync();
            if (await r.ReadAsync())
            {
                var tt = r.IsDBNull(1) ? "" : r.GetString(1);
                if (tt is "chot" or "xuat")
                    throw new ArgumentException(
                        $"Đơn đang thuộc gói {r.GetString(0)} đã chốt — rút đơn khỏi gói rồi mới sửa được");
            }
        }

        // ============================ TRA CỨU XUYÊN DB (BR-NB-03) ============================
        // MỘT CỬA DUY NHẤT cho mọi tra cứu từ NB sang thuế. Ba lớp chặn:
        //   1. Chỉ tenant_type='noibo' được gọi (kiểm ở Controller)
        //   2. Chỉ đọc được tenant thuế ghi trong LinkedTenantCode của CHÍNH tenant đang
        //      đăng nhập — không nhận mã đơn vị từ client, nên không trỏ nhầm sổ người khác
        //   3. Chỉ SELECT, và chỉ 4 trường tên/dvt/ma_ngan/ma_hang
        //
        // Phân kỳ (chốt 9.3): v1 tra HOA_DON_LINE hướng VAO trên MỌI NĂM đã mở của tenant
        // thuế (danh sách năm lấy từ FiscalYears). Giai đoạn 2 mới thêm nguồn DM_HANG của
        // KT2000_Base sau khi Base có cột mst_ncc để lọc về đúng đơn vị.
        public async Task<List<TraHangThueDto>> TraHangBenThue(string tenantCodeNb, string? tu,
                                                               int gioiHan)
        {
            var linked = await _db.Tenants
                .Where(t => t.Code == tenantCodeNb)
                .Select(t => t.LinkedTenantCode)
                .FirstOrDefaultAsync();

            if (string.IsNullOrWhiteSpace(linked))
                return new List<TraHangThueDto>();   // chưa gán tenant thuế -> không có gì để tra

            var cacNam = await _db.FiscalYears
                .Where(f => _db.Tenants.Any(t => t.Id == f.TenantId && t.Code == linked))
                .Select(f => f.Year)
                .OrderByDescending(y => y)
                .ToListAsync();

            var kq = new List<TraHangThueDto>();
            var daCo = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            foreach (var nam in cacNam)
            {
                if (kq.Count >= gioiHan) break;
                try
                {
                    foreach (var d in await TraHangMotNam(linked, nam, tu, gioiHan - kq.Count))
                    {
                        var khoa = $"{d.MaHang}|{d.TenHang}";
                        if (daCo.Add(khoa)) kq.Add(d);
                    }
                }
                catch (SqlException)
                {
                    // bỏ qua năm đó, không làm hỏng cả lần tra. App NB phải sống độc lập
                }
            }
            return kq;
        }

        private async Task<List<TraHangThueDto>> TraHangMotNam(string codeThue, int nam,
                                                               string? tu, int gioiHan)
        {
            using var conn = await OpenAsync(codeThue, nam);
            var sql = @"SELECT TOP (@top) ma_hang, ten_hang, dvt, ma_ngan, nguon FROM (
                            SELECT DISTINCT l.ma_hang, l.ten_hang_goc AS ten_hang, l.dvt,
                                   l.ma_ngan, N'da_co_ma' AS nguon
                            FROM HOA_DON_LINE l JOIN HOA_DON h ON h.ma_hd = l.ma_hd
                            WHERE h.huong = N'VAO' AND l.ma_hang IS NOT NULL
                              AND l.ten_hang_goc IS NOT NULL
                            UNION
                            SELECT DISTINCT NULL, l.ten_hang_goc, l.dvt, l.ma_ngan, N'ten_tren_hd'
                            FROM HOA_DON_LINE l JOIN HOA_DON h ON h.ma_hd = l.ma_hd
                            WHERE h.huong = N'VAO' AND l.ma_hang IS NULL
                              AND l.ten_hang_goc IS NOT NULL
                        ) x
                        WHERE (@tu IS NULL OR ten_hang LIKE @like)
                        ORDER BY nguon, ten_hang";
            using var cmd = new SqlCommand(sql, conn);
            cmd.Parameters.AddWithValue("@top", gioiHan);
            cmd.Parameters.AddWithValue("@tu", (object?)tu ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@like", $"%{tu}%");
            var ds = new List<TraHangThueDto>();
            using var r = await cmd.ExecuteReaderAsync();
            while (await r.ReadAsync())
                ds.Add(new TraHangThueDto
                {
                    MaHang = r.IsDBNull(0) ? null : r.GetString(0),
                    TenHang = r.IsDBNull(1) ? "" : r.GetString(1),
                    Dvt = r.IsDBNull(2) ? null : r.GetString(2),
                    MaNgan = r.IsDBNull(3) ? null : r.GetString(3),
                    Nguon = r.IsDBNull(4) ? "" : r.GetString(4),
                    Nam = nam,
                });
            return ds;
        }

        // ============================ GÓI HÀNG (BR-NB-08) ============================
        public async Task<List<GoiHdDto>> DanhSachGoi(string code, int year, int? thang,
                                                      string? trangThai, int gioiHan)
        {
            using var conn = await OpenAsync(code, year);
            var sql = @"SELECT TOP (@top) g.ma_goi, g.ten_goi, g.khu_vuc, g.ngay, g.ma_nvvc,
                               g.trang_thai, g.so_don, g.ngay_chot, g.ngay_xuat, g.ghi_chu,
                               vc.ten_kh AS ten_nvvc
                        FROM GOI_HD g
                        LEFT JOIN DM_KH_NB vc ON vc.ma_kh = g.ma_nvvc
                        WHERE (@thang IS NULL OR g.thang = @thang)
                          AND (@tt IS NULL OR g.trang_thai = @tt)
                        ORDER BY g.ngay DESC, g.ma_goi DESC";
            using var cmd = new SqlCommand(sql, conn);
            cmd.Parameters.AddWithValue("@top", gioiHan);
            cmd.Parameters.AddWithValue("@thang", (object?)thang ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@tt", (object?)trangThai ?? DBNull.Value);
            var ds = new List<GoiHdDto>();
            using var r = await cmd.ExecuteReaderAsync();
            while (await r.ReadAsync()) ds.Add(DocGoi(r));
            return ds;
        }

        private static GoiHdDto DocGoi(SqlDataReader r) => new()
        {
            MaGoi = r.GetString(0),
            TenGoi = r.IsDBNull(1) ? null : r.GetString(1),
            KhuVuc = r.IsDBNull(2) ? null : r.GetString(2),
            Ngay = r.IsDBNull(3) ? null : r.GetDateTime(3),
            MaNvvc = r.IsDBNull(4) ? null : r.GetString(4),
            TrangThai = r.IsDBNull(5) ? "moi" : r.GetString(5),
            SoDon = r.IsDBNull(6) ? null : r.GetInt32(6),
            NgayChot = r.IsDBNull(7) ? null : r.GetDateTime(7),
            NgayXuat = r.IsDBNull(8) ? null : r.GetDateTime(8),
            GhiChu = r.IsDBNull(9) ? null : r.GetString(9),
            TenNvvc = r.IsDBNull(10) ? null : r.GetString(10),
        };

        public async Task<GoiHdDto?> LayGoi(string code, int year, string maGoi)
        {
            using var conn = await OpenAsync(code, year);
            GoiHdDto? goi = null;
            using (var cmd = new SqlCommand(
                @"SELECT g.ma_goi, g.ten_goi, g.khu_vuc, g.ngay, g.ma_nvvc, g.trang_thai,
                         g.so_don, g.ngay_chot, g.ngay_xuat, g.ghi_chu, vc.ten_kh
                  FROM GOI_HD g LEFT JOIN DM_KH_NB vc ON vc.ma_kh = g.ma_nvvc
                  WHERE g.ma_goi = @ma", conn))
            {
                cmd.Parameters.AddWithValue("@ma", maGoi);
                using var r = await cmd.ExecuteReaderAsync();
                if (await r.ReadAsync()) goi = DocGoi(r);
            }
            if (goi == null) return null;

            // Phiếu soạn hàng (chỉ có sau khi CHỐT gói)
            using (var cmd = new SqlCommand(
                @"SELECT l.stt_line, l.ma_hang, l.ten_hang, l.dvt, l.so_luong,
                         l.so_don_gop, l.ghi_chu, h.he_so_lon, h.dvt_lon,
                         l.tri_gia, h.gia_ban
                  FROM GOI_HD_LINE l
                  LEFT JOIN DM_HANG_NB h ON h.ma_hang = l.ma_hang
                  WHERE l.ma_goi = @ma ORDER BY l.stt_line, l.auto_num", conn))
            {
                cmd.Parameters.AddWithValue("@ma", maGoi);
                using var r = await cmd.ExecuteReaderAsync();
                while (await r.ReadAsync())
                    goi.Lines.Add(new GoiHdLineDto
                    {
                        SttLine = r.IsDBNull(0) ? 0 : r.GetInt32(0),
                        MaHang = r.IsDBNull(1) ? null : r.GetString(1),
                        TenHang = r.IsDBNull(2) ? null : r.GetString(2),
                        Dvt = r.IsDBNull(3) ? null : r.GetString(3),
                        SoLuong = r.IsDBNull(4) ? 0 : r.GetDecimal(4),
                        SoDonGop = r.IsDBNull(5) ? 0 : r.GetInt32(5),
                        GhiChu = r.IsDBNull(6) ? null : r.GetString(6),
                        HeSoLon = r.IsDBNull(7) ? null : r.GetDecimal(7),
                        DvtLon = r.IsDBNull(8) ? null : r.GetString(8),
                        TriGia = r.IsDBNull(9) ? null : r.GetDecimal(9),
                        GiaChuan = r.IsDBNull(10) ? null : r.GetDecimal(10),
                    });
            }

            // Đơn thành viên: đọc từ cột ma_goi trên HOA_DON, không có bảng danh sách riêng
            using (var cmd = new SqlCommand(
                $@"SELECT d.ma_hd, d.ngay, d.ngay_nh, d.ma_kh, d.ten_kh, d.mst, d.dia_chi,
                         d.ma_nvkd, d.ma_nvvc, d.ma_goi, d.ghi_chu, d.tien_vat, d.tthai_hd,
                         kd.ten_kh, vc.ten_kh,
                         {SqlTienHang}, d.huong, d.dia_chi_giao, nh.ten_nhan
                  FROM HOA_DON d
                  LEFT JOIN DM_KH_NB kd ON kd.ma_kh = d.ma_nvkd
                  LEFT JOIN DM_KH_NB vc ON vc.ma_kh = d.ma_nvvc
                  LEFT JOIN DM_KH_NB kh ON kh.ma_kh = d.ma_kh
                  LEFT JOIN DM_NHAN  nh ON nh.ma_nhan = kh.ma_nhan
                  WHERE d.ma_goi = @ma ORDER BY d.ma_hd", conn))
            {
                cmd.Parameters.AddWithValue("@ma", maGoi);
                using var r = await cmd.ExecuteReaderAsync();
                while (await r.ReadAsync()) goi.DonCon.Add(DocDon(r));
            }
            return goi;
        }

        public async Task<GoiHdDto> LuuGoi(string code, int year, GoiHdDto d, string user)
        {
            using var conn = await OpenAsync(code, year);
            // Mã gói: G + số chạy (G1, G2, G15...) — cùng lối với số đơn V125/R236
            // (chốt 9.7), không đệm số 0 cho dễ đọc và dễ gọi nhau qua điện thoại.
            var ma = string.IsNullOrWhiteSpace(d.MaGoi)
                ? await SinhMaGoi(conn)
                : d.MaGoi.Trim();
            var ngay = d.Ngay ?? DateTime.Today;

            var sql = @"MERGE GOI_HD AS t
                        USING (SELECT @ma AS ma_goi) AS s ON t.ma_goi = s.ma_goi
                        WHEN MATCHED THEN UPDATE SET
                            ten_goi = @ten, khu_vuc = @kv, ngay = @ngay, thang = @thang,
                            ma_nvvc = @nvvc, ghi_chu = @gc,
                            updated_by = @user, updated_at = SYSDATETIME()
                        WHEN NOT MATCHED THEN INSERT
                            (ma_goi, ten_goi, khu_vuc, ngay, thang, ma_nvvc, ghi_chu,
                             trang_thai, created_by)
                            VALUES (@ma, @ten, @kv, @ngay, @thang, @nvvc, @gc, N'moi', @user);";
            using var cmd = new SqlCommand(sql, conn);
            cmd.Parameters.AddWithValue("@ma", ma);
            cmd.Parameters.AddWithValue("@ten", (object?)d.TenGoi ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@kv", (object?)d.KhuVuc ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@ngay", ngay);
            cmd.Parameters.AddWithValue("@thang", ngay.Month);
            cmd.Parameters.AddWithValue("@nvvc", (object?)d.MaNvvc ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@gc", (object?)d.GhiChu ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@user", user);
            await cmd.ExecuteNonQueryAsync();
            d.MaGoi = ma;
            d.Ngay = ngay;
            return d;
        }

        // GHÉP GÓI: user tích chọn đơn theo ma_hd -> đơn nhận ma_goi.
        // Mỗi đơn thuộc TỐI ĐA MỘT gói (một đơn không lên hai xe) — nên chỉ nhận đơn
        // đang rảnh hoặc đã thuộc chính gói này.
        public async Task<int> GhepDonVaoGoi(string code, int year, string maGoi,
                                             List<string> dsMaHd, string user)
        {
            if (dsMaHd == null || dsMaHd.Count == 0) return 0;
            using var conn = await OpenAsync(code, year);
            using var tran = conn.BeginTransaction();
            try
            {
                await ChanKhiGoiDaChot(conn, tran, maGoi, "ghép đơn");

                int n = 0;
                foreach (var maHd in dsMaHd.Where(x => !string.IsNullOrWhiteSpace(x)))
                {
                    using var cmd = new SqlCommand(
                        @"UPDATE HOA_DON SET ma_goi = @goi,
                                 updated_by = @user, updated_at = SYSDATETIME()
                          WHERE ma_hd = @ma AND (ma_goi IS NULL OR ma_goi = @goi)", conn, tran);
                    cmd.Parameters.AddWithValue("@goi", maGoi);
                    cmd.Parameters.AddWithValue("@ma", maHd.Trim());
                    cmd.Parameters.AddWithValue("@user", user);
                    n += await cmd.ExecuteNonQueryAsync();
                }
                await CapNhatSoDon(conn, tran, maGoi);
                tran.Commit();
                return n;
            }
            catch { tran.Rollback(); throw; }
        }

        // Dựng PHIẾU GÓI (snapshot gộp mặt hàng) — BR-NB-08: "CHỐT GÓI sinh GOI_HD_LINE
        // = SNAPSHOT tổng hợp mặt hàng của mọi đơn con".
        //
        // CHỈ gọi từ ChotGoi — người dùng chủ động bấm. KHÔNG gọi lúc ghép/rút đơn: SPEC
        // cố ý để gói mở cho gom/sửa thoải mái trước khi chốt.
        //
        // Gói đã XUẤT thì thôi — hàng đi rồi, dựng lại là sai sự thật kho.
        private static async Task DungLaiSnapshot(SqlConnection conn, SqlTransaction tran,
                                                  string maGoi, string user)
        {
            using (var tra = new SqlCommand(
                "SELECT trang_thai FROM GOI_HD WHERE ma_goi = @g", conn, tran))
            {
                tra.Parameters.AddWithValue("@g", maGoi);
                if (await tra.ExecuteScalarAsync() as string == "xuat") return;
            }

            using (var xoa = new SqlCommand(
                "DELETE FROM GOI_HD_LINE WHERE ma_goi = @g", conn, tran))
            {
                xoa.Parameters.AddWithValue("@g", maGoi);
                await xoa.ExecuteNonQueryAsync();
            }

            // Gộp theo mặt hàng. Tên/ĐVT lấy MIN cho ổn định: cùng ma_hang thì tên gần
            // như luôn giống nhau, khác chăng chỉ là dòng gõ tay lệch.
            // tri_gia: cộng tiền hàng, ĐÃ LOẠI hàng tặng — khớp cách tính tiền mọi nơi khác.
            using (var gop = new SqlCommand(
                @"INSERT INTO GOI_HD_LINE
                      (ma_goi, stt_line, ma_hang, ten_hang, dvt, so_luong,
                       so_don_gop, tri_gia, created_by)
                  SELECT @g,
                         ROW_NUMBER() OVER (ORDER BY MIN(l.ten_hang_goc)),
                         l.ma_hang, MIN(l.ten_hang_goc), MIN(l.dvt),
                         SUM(l.so_luong), COUNT(DISTINCT l.ma_hd),
                         SUM(CASE WHEN l.la_hang_tang = 1 THEN 0
                                  ELSE l.so_luong * l.don_gia
                                       + ISNULL(l.tien_tinh_mau, 0) END),
                         @user
                  FROM HOA_DON_LINE l JOIN HOA_DON d ON d.ma_hd = l.ma_hd
                  WHERE d.ma_goi = @g
                  GROUP BY l.ma_hang", conn, tran))
            {
                gop.Parameters.AddWithValue("@g", maGoi);
                gop.Parameters.AddWithValue("@user", user);
                await gop.ExecuteNonQueryAsync();
            }

            // Đánh dấu ĐÃ CHỐT. Từ đây đơn con bị khóa sửa (BR-NB-08) và xuất gói được.
            using var tt = new SqlCommand(
                @"UPDATE GOI_HD SET trang_thai = N'chot', ngay_chot = SYSDATETIME(),
                         updated_by = @user, updated_at = SYSDATETIME()
                  WHERE ma_goi = @g AND trang_thai <> N'xuat'", conn, tran);
            tt.Parameters.AddWithValue("@g", maGoi);
            tt.Parameters.AddWithValue("@user", user);
            await tt.ExecuteNonQueryAsync();
        }

        // RÚT ĐƠN khỏi gói. BR-NB-08: đây là đường DUY NHẤT để sửa lại đơn đã vào gói
        // chốt. Rút xong snapshot TỰ dựng lại theo danh sách đơn còn lại, nên phiếu gói
        // in ra vẫn khớp xe chở.
        public async Task<int> RutDonKhoiGoi(string code, int year, List<string> dsMaHd, string user)
        {
            if (dsMaHd == null || dsMaHd.Count == 0) return 0;
            using var conn = await OpenAsync(code, year);
            using var tran = conn.BeginTransaction();
            try
            {
                var cacGoi = new HashSet<string>();
                int n = 0;
                foreach (var maHd in dsMaHd.Where(x => !string.IsNullOrWhiteSpace(x)))
                {
                    using (var tra = new SqlCommand(
                        "SELECT ma_goi FROM HOA_DON WHERE ma_hd = @ma", conn, tran))
                    {
                        tra.Parameters.AddWithValue("@ma", maHd.Trim());
                        var g = await tra.ExecuteScalarAsync();
                        if (g != null && g != DBNull.Value) cacGoi.Add((string)g);
                    }
                    using var cmd = new SqlCommand(
                        @"UPDATE HOA_DON SET ma_goi = NULL,
                                 updated_by = @user, updated_at = SYSDATETIME()
                          WHERE ma_hd = @ma", conn, tran);
                    cmd.Parameters.AddWithValue("@ma", maHd.Trim());
                    cmd.Parameters.AddWithValue("@user", user);
                    n += await cmd.ExecuteNonQueryAsync();
                }

                // BR-NB-08: rút đơn ra thì snapshot cũ KHÔNG còn đúng -> xóa phiếu gói,
                // lùi về 'moi'. Bắt buộc CHỐT LẠI mới in được phiếu mới — nhờ vậy tờ giấy
                // cầm trên tay không bao giờ lệch với xe chở.
                foreach (var g in cacGoi)
                {
                    using (var xoa = new SqlCommand(
                        "DELETE FROM GOI_HD_LINE WHERE ma_goi = @g", conn, tran))
                    {
                        xoa.Parameters.AddWithValue("@g", g);
                        await xoa.ExecuteNonQueryAsync();
                    }
                    using (var lui = new SqlCommand(
                        @"UPDATE GOI_HD SET trang_thai = N'moi', ngay_chot = NULL,
                                 updated_by = @user, updated_at = SYSDATETIME()
                          WHERE ma_goi = @g AND trang_thai = N'chot'", conn, tran))
                    {
                        lui.Parameters.AddWithValue("@g", g);
                        lui.Parameters.AddWithValue("@user", user);
                        await lui.ExecuteNonQueryAsync();
                    }
                    await CapNhatSoDon(conn, tran, g);
                }
                tran.Commit();
                return n;
            }
            catch { tran.Rollback(); throw; }
        }

        // CHỐT GÓI: sinh GOI_HD_LINE = SNAPSHOT tổng hợp mặt hàng của MỌI đơn con.
        // 20 đơn × 1 thùng sữa chua -> MỘT dòng 20 thùng (BR-NB-08).
        public async Task<GoiHdDto?> ChotGoi(string code, int year, string maGoi, string user)
        {
            using var conn = await OpenAsync(code, year);
            using (var tran = conn.BeginTransaction())
            {
                try
                {
                    await ChanKhiGoiDaChot(conn, tran, maGoi, "chốt");
                    await CapNhatSoDon(conn, tran, maGoi);
                    await DungLaiSnapshot(conn, tran, maGoi, user);
                    tran.Commit();
                }
                catch { tran.Rollback(); throw; }
            }
            return await LayGoi(code, year, maGoi);
        }

        // XUẤT GÓI: đóng dấu ngay_nh HÀNG LOẠT cho mọi đơn con (BR-NB-08).
        // Đây là lúc kho thật sự mất hàng -> engine mới trừ tồn (BR-NB-07).
        // Chỉ xuất được gói ĐÃ CHỐT: chưa chốt thì chưa có phiếu soạn, kho chưa soạn hàng.
        public async Task<GoiHdDto?> XuatGoi(string code, int year, string maGoi,
                                             DateTime? ngayXuat, string user)
        {
            var ngay = ngayXuat ?? DateTime.Today;
            using var conn = await OpenAsync(code, year);
            using (var tran = conn.BeginTransaction())
            {
                try
                {
                    using (var tra = new SqlCommand(
                        "SELECT trang_thai FROM GOI_HD WHERE ma_goi = @g", conn, tran))
                    {
                        tra.Parameters.AddWithValue("@g", maGoi);
                        var tt = await tra.ExecuteScalarAsync() as string;
                        if (tt == null)
                            throw new ArgumentException($"Không tìm thấy gói {maGoi}");
                        if (tt != "chot")
                            throw new ArgumentException(
                                "Phải CHỐT gói (in phiếu soạn hàng) trước khi xuất");
                    }

                    // ngay_nh trên đơn + trên từng dòng: engine trừ kho theo dòng (BR-NB-07)
                    using (var cmd = new SqlCommand(
                        @"UPDATE HOA_DON SET ngay_nh = @ngay,
                                 updated_by = @user, updated_at = SYSDATETIME()
                          WHERE ma_goi = @g", conn, tran))
                    {
                        cmd.Parameters.AddWithValue("@g", maGoi);
                        cmd.Parameters.AddWithValue("@ngay", ngay);
                        cmd.Parameters.AddWithValue("@user", user);
                        await cmd.ExecuteNonQueryAsync();
                    }
                    using (var cmd = new SqlCommand(
                        @"UPDATE l SET l.ngay_nh_l = @ngay,
                                 l.updated_by = @user, l.updated_at = SYSDATETIME()
                          FROM HOA_DON_LINE l JOIN HOA_DON d ON d.ma_hd = l.ma_hd
                          WHERE d.ma_goi = @g AND l.ngay_nh_l IS NULL", conn, tran))
                    {
                        cmd.Parameters.AddWithValue("@g", maGoi);
                        cmd.Parameters.AddWithValue("@ngay", ngay);
                        cmd.Parameters.AddWithValue("@user", user);
                        await cmd.ExecuteNonQueryAsync();
                    }
                    using (var cmd = new SqlCommand(
                        @"UPDATE GOI_HD SET trang_thai = N'xuat', ngay_xuat = @ngay,
                                 updated_by = @user, updated_at = SYSDATETIME()
                          WHERE ma_goi = @g", conn, tran))
                    {
                        cmd.Parameters.AddWithValue("@g", maGoi);
                        cmd.Parameters.AddWithValue("@ngay", ngay);
                        cmd.Parameters.AddWithValue("@user", user);
                        await cmd.ExecuteNonQueryAsync();
                    }
                    tran.Commit();
                }
                catch { tran.Rollback(); throw; }
            }
            return await LayGoi(code, year, maGoi);
        }

        private static async Task ChanKhiGoiDaChot(SqlConnection conn, SqlTransaction tran,
                                                   string maGoi, string viec)
        {
            using var cmd = new SqlCommand(
                "SELECT trang_thai FROM GOI_HD WHERE ma_goi = @g", conn, tran);
            cmd.Parameters.AddWithValue("@g", maGoi);
            var tt = await cmd.ExecuteScalarAsync() as string;
            if (tt == null) throw new ArgumentException($"Không tìm thấy gói {maGoi}");
            if (tt == "xuat")
                throw new ArgumentException($"Gói {maGoi} đã xuất — không {viec} được nữa");
        }

        private static async Task CapNhatSoDon(SqlConnection conn, SqlTransaction tran, string maGoi)
        {
            using var cmd = new SqlCommand(
                @"UPDATE GOI_HD SET so_don = (SELECT COUNT(*) FROM HOA_DON WHERE ma_goi = @g)
                  WHERE ma_goi = @g", conn, tran);
            cmd.Parameters.AddWithValue("@g", maGoi);
            await cmd.ExecuteNonQueryAsync();
        }

        // Sinh mã danh mục kiểu H00001 / K00001 / N00001 / G00001. Cùng cách đếm với số đơn.
        // Mã gói kiểu G1, G2, G15 — lấy số lớn nhất đang có rồi +1, cùng cách với số đơn.
        // Tách riêng khỏi SinhMa vì SinhMa đệm 5 chữ số (H00001) cho danh mục, còn gói
        // thì để số trần cho ngắn.
        private static async Task<string> SinhMaGoi(SqlConnection conn)
        {
            using var cmd = new SqlCommand(
                @"SELECT MAX(CAST(SUBSTRING(ma_goi, 2, LEN(ma_goi) - 1) AS BIGINT))
                  FROM GOI_HD
                  WHERE ma_goi LIKE N'G[0-9]%'
                    AND SUBSTRING(ma_goi, 2, LEN(ma_goi) - 1) NOT LIKE '%[^0-9]%'", conn);
            var max = await cmd.ExecuteScalarAsync();
            var tiep = (max == null || max == DBNull.Value ? 0 : Convert.ToInt64(max)) + 1;
            return $"G{tiep}";
        }

        // Ghi vết "user này vừa dùng những mặt hàng nào" (USER_HANG) để ô gợi ý lần sau
        // xếp hàng quen lên đầu. Bê từ USA_Meva (DeliveriesController.TrackProductUsage).
        //
        // NUỐT MỌI LỖI: gọi sau khi đơn đã Commit, nên hỏng ở đây mà ném ra ngoài thì
        // người dùng thấy báo lỗi trong khi đơn ĐÃ LƯU THÀNH CÔNG — họ sẽ lưu lại lần
        // nữa và sinh đơn trùng. Mất một lượt đếm không đáng gì so với chuyện đó.
        //
        // Bảng chỉ có từ script 018 nên phải kiểm tra tồn tại: đơn vị NB dựng trước đó
        // vẫn lưu đơn bình thường, chỉ là chưa có xếp hạng.
        private static async Task GhiVetHangDaDung(SqlConnection conn, string user,
                                                   List<DonNbLineDto> lines)
        {
            try
            {
                // Mỗi mặt hàng đếm MỘT lần cho mỗi đơn, dù đơn có ba dòng cùng mặt hàng
                // (khác màu pha chẳng hạn) — đang đo "hay chọn", không đo số dòng.
                var cacMa = lines.Where(l => !string.IsNullOrWhiteSpace(l.MaHang))
                                 .Select(l => l.MaHang!)
                                 .Distinct(StringComparer.OrdinalIgnoreCase)
                                 .ToList();
                if (cacMa.Count == 0) return;

                using (var kiemTra = new SqlCommand(
                    "SELECT CASE WHEN OBJECT_ID('USER_HANG') IS NULL THEN 0 ELSE 1 END", conn))
                {
                    if ((int)(await kiemTra.ExecuteScalarAsync() ?? 0) == 0) return;
                }

                // MERGE để chạy bao nhiêu lần cũng chỉ CỘNG DỒN, không vỡ khóa chính.
                // Tham số hóa từng mã (@m0, @m1...) — không nối chuỗi (luật #3).
                var thamSo = string.Join(",", cacMa.Select((_, i) => $"(@u, @m{i})"));
                var sql = $@"MERGE USER_HANG AS t
                             USING (VALUES {thamSo}) AS s (login_name, ma_hang)
                                ON t.login_name = s.login_name AND t.ma_hang = s.ma_hang
                             WHEN MATCHED THEN
                                 UPDATE SET so_lan = t.so_lan + 1, lan_cuoi = SYSDATETIME()
                             WHEN NOT MATCHED THEN
                                 INSERT (login_name, ma_hang, so_lan, lan_cuoi)
                                 VALUES (s.login_name, s.ma_hang, 1, SYSDATETIME());";
                using var cmd = new SqlCommand(sql, conn);
                cmd.Parameters.AddWithValue("@u", user);
                for (int i = 0; i < cacMa.Count; i++)
                    cmd.Parameters.AddWithValue($"@m{i}", cacMa[i]);
                await cmd.ExecuteNonQueryAsync();
            }
            catch { /* thống kê là phụ — không làm hỏng việc lưu đơn */ }
        }

        // Mã KM theo đúng dạng dữ liệu gốc USA_Meva: "KM" + 4 chữ số (KM0001..KM0027).
        // KHÔNG dùng lại SinhMa: hàm đó ép LEN = 6 với prefix MỘT ký tự (H + 5 số), còn
        // "KM" dài hai ký tự — dùng nó sẽ ra KM00001 (7 ký tự), lệch hẳn bộ mã đang có.
        private static async Task<string> SinhMaKm(SqlConnection conn)
        {
            using var cmd = new SqlCommand(
                @"SELECT MAX(CAST(RIGHT(ma_km, 4) AS INT)) FROM DM_KM_NB
                  WHERE ma_km LIKE N'KM[0-9][0-9][0-9][0-9]' AND LEN(ma_km) = 6", conn);
            var max = await cmd.ExecuteScalarAsync();
            var tiep = (max == null || max == DBNull.Value ? 0 : Convert.ToInt32(max)) + 1;
            return $"KM{tiep:D4}";
        }

        private static async Task<string> SinhMa(SqlConnection conn, string bang,
                                                 string cot, string prefix)
        {
            // bang/cot là hằng do code truyền vào, không đến từ người dùng
            using var cmd = new SqlCommand(
                $@"SELECT MAX(CAST(RIGHT({cot}, 5) AS INT)) FROM {bang}
                   WHERE {cot} LIKE @p AND LEN({cot}) = 6
                     AND RIGHT({cot}, 5) NOT LIKE '%[^0-9]%'", conn);
            cmd.Parameters.AddWithValue("@p", $"{prefix}%");
            var max = await cmd.ExecuteScalarAsync();
            var tiep = (max == null || max == DBNull.Value ? 0 : Convert.ToInt32(max)) + 1;
            return $"{prefix}{tiep:D5}";
        }
    }
}
