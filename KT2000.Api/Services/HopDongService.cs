using Microsoft.Data.SqlClient;
using KT2000.Api.Models;

namespace KT2000.Api.Services
{
    // Nhân sự + hợp đồng lao động. Hai bảng nằm trong database ĐƠN VỊ-NĂM
    // (xem database/025_tenant_nhansu_hopdong.sql), KHÔNG ở KT2000_Base: nhân sự là dữ
    // liệu CỦA đơn vị, không phải danh mục tham khảo dùng chung như DM_TK.
    //
    // BR-HD-01 — cả database đã là của một đơn vị nên bảng KHÔNG có cột ma_donvi.
    // Mã đơn vị chỉ dùng để CHỌN database qua resolver (luật #1), không lọt vào WHERE.
    //
    // Mọi câu SQL tham số hóa 100% (luật #3).
    public class HopDongService
    {
        private readonly TenantDbResolver _resolver;
        private readonly VaCauTrucService _va;

        public HopDongService(TenantDbResolver resolver, VaCauTrucService va)
        {
            _resolver = resolver;
            _va = va;
        }

        // Database đơn vị-năm CÓ THỂ CHƯA TỒN TẠI (chưa mở năm làm việc) — bắt riêng 4060
        // và đổi thành thông điệp nói rõ phải làm gì, cùng cách ThueService.OpenAsync.
        //
        // Gọi VaCauTrucService trước: hai bảng này mới có từ bản vá 18, database mở từ
        // trước đó chưa có chúng. Không vá ở đây thì màn Hợp đồng chỉ chạy được trên đơn
        // vị vừa tạo, còn đơn vị cũ báo "Invalid object name NHAN_SU" mà không ai hiểu.
        private async Task<SqlConnection> MoAsync(string code, int year)
        {
            _va.BaoDam(code, year);

            var conn = new SqlConnection(_resolver.GetTenantConnection(code, year));
            try
            {
                await conn.OpenAsync();
                return conn;
            }
            catch (SqlException ex) when (ex.Number is 4060 or 911)
            {
                conn.Dispose();
                throw new SoChuaMoException(
                    $"Đơn vị {code} chưa có sổ của năm {year}. "
                    + "Vào Quản trị -> Đơn vị để mở năm làm việc này trước khi lập hợp đồng.");
            }
        }

        private static T? Doc<T>(SqlDataReader r, int i) where T : struct =>
            r.IsDBNull(i) ? null : (T)r.GetValue(i);

        private static string? Chuoi(SqlDataReader r, int i) =>
            r.IsDBNull(i) ? null : r.GetString(i);

        // ===================== LƯỚI CHỌN ĐƠN VỊ =====================

        /// <summary>
        /// Đếm nhân sự + hợp đồng của MỘT đơn vị. Trả ChuaMoNam nếu đơn vị chưa có
        /// database của năm đó.
        ///
        /// KHÔNG ném lỗi ra ngoài: lưới gọi hàm này cho từng đơn vị một, chỉ cần một
        /// đơn vị hỏng mà ném ra thì dòng đó mất hẳn số thay vì hiện "chưa mở năm".
        ///
        /// KHÔNG gọi VaCauTrucService ở đây (khác MoAsync): đây là đường ĐẾM, chạy cho
        /// mọi đơn vị mỗi lần mở màn. Vá cấu trúc là việc nặng (mở connection riêng,
        /// khóa DB, kiểm từng bản vá) — bắt cả 17 đơn vị vá chỉ để đếm hai con số là
        /// treo màn hàng chục giây, đúng lỗi gặp 20/08. Vá vẫn chạy đúng lúc cần: khi
        /// người dùng thật sự MỞ một đơn vị, MoAsync gọi nó.
        /// Bảng chưa tồn tại (đơn vị chưa vá) rơi vào catch SqlException → "chưa mở năm",
        /// bấm vào là MoAsync vá rồi hiện bình thường.
        /// </summary>
        public async Task<DonViHopDongDto> DemMotDonVi(string code, int year)
        {
            var kq = new DonViHopDongDto { MaDonVi = code };
            try
            {
                using var c = new SqlConnection(_resolver.GetTenantConnection(code, year));
                await c.OpenAsync();

                // Hỏi bảng có tồn tại KHÔNG PHẢI để cho đẹp: từ 21/08 module Hợp đồng +
                // Lương không còn được dựng tự động cho mọi database (xem
                // VaCauTrucService.CAC_BAN_VA). Đơn vị chưa bấm "Tạo bảng Hợp đồng +
                // Lương" thì 4 bảng chưa có, và câu COUNT(*) bên dưới sẽ ném "Invalid
                // object name".
                //
                // Phải tách khỏi nhánh ChuaMoNam: hai tình trạng này cần hai cách chữa
                // khác hẳn nhau (mở năm vs tạo bảng), gộp làm một thì người dùng đi mở
                // năm cho đơn vị đã mở năm rồi và không hiểu vì sao vẫn không được.
                using (var hoi = new SqlCommand(
                    "SELECT CASE WHEN OBJECT_ID('NHAN_SU') IS NOT NULL "
                  + "        AND OBJECT_ID('HOP_DONG') IS NOT NULL "
                  + "       THEN 1 ELSE 0 END", c))
                {
                    if (Convert.ToInt32(await hoi.ExecuteScalarAsync()) == 0)
                    {
                        kq.ChuaTaoBang = true;
                        return kq;
                    }
                }

                using var cmd = new SqlCommand(
                    "SELECT (SELECT COUNT(*) FROM NHAN_SU), "
                  + "       (SELECT COUNT(*) FROM HOP_DONG)", c);
                using var r = await cmd.ExecuteReaderAsync();
                if (await r.ReadAsync())
                {
                    kq.SoNhanSu = r.GetInt32(0);
                    kq.SoHopDong = r.GetInt32(1);
                }
            }
            catch (SqlException) { kq.ChuaMoNam = true; }
            return kq;
        }

        // ===================== NHÂN SỰ =====================

        private const string COT_NS =
            "id, ma_ns, ho_ten, ngay_sinh, gioi_tinh, quoc_tich, so_cmnd, "
          + "ngay_cap, noi_cap, dia_chi, dien_thoai, email, so_bhxh, mst_ns, "
          + "nghe_nghiep, chuc_danh, chuc_vu, bo_phan, dang_lam, ngay_vao, ngay_nghi, ghi_chu";

        private static NhanSuDto DocNhanSu(SqlDataReader r) => new()
        {
            Id = r.GetInt32(0),
            MaNs = Chuoi(r, 1),
            HoTen = r.IsDBNull(2) ? "" : r.GetString(2),
            NgaySinh = Doc<DateTime>(r, 3),
            GioiTinh = Chuoi(r, 4),
            QuocTich = Chuoi(r, 5),
            SoCmnd = Chuoi(r, 6),
            NgayCap = Doc<DateTime>(r, 7),
            NoiCap = Chuoi(r, 8),
            DiaChi = Chuoi(r, 9),
            DienThoai = Chuoi(r, 10),
            Email = Chuoi(r, 11),
            SoBhxh = Chuoi(r, 12),
            MstNs = Chuoi(r, 13),
            NgheNghiep = Chuoi(r, 14),
            ChucDanh = Chuoi(r, 15),
            ChucVu = Chuoi(r, 16),
            BoPhan = Chuoi(r, 17),
            DangLam = !r.IsDBNull(18) && r.GetBoolean(18),
            NgayVao = Doc<DateTime>(r, 19),
            NgayNghi = Doc<DateTime>(r, 20),
            GhiChu = Chuoi(r, 21),
        };

        /// <summary>Danh sách nhân sự của đơn vị, kèm số hợp đồng đã ký.</summary>
        public async Task<List<NhanSuDto>> DanhSachNhanSu(
            string code, int year, bool caNguoiDaNghi)
        {
            var ds = new List<NhanSuDto>();
            using var c = await MoAsync(code, year);

            // Đếm hợp đồng bằng subquery thay vì gọi thêm một vòng: nhân sự của một đơn vị
            // chỉ vài chục dòng, một câu là xong.
            using var cmd = new SqlCommand(
                $"SELECT {COT_NS}, "
              + "(SELECT COUNT(*) FROM HOP_DONG h WHERE h.nhan_su_id = n.id) AS so_hd "
              + "FROM NHAN_SU n "
              + (caNguoiDaNghi ? "" : "WHERE dang_lam = 1 ")
              + "ORDER BY ho_ten", c);

            using var r = await cmd.ExecuteReaderAsync();
            while (await r.ReadAsync())
            {
                var x = DocNhanSu(r);
                x.SoHopDong = r.GetInt32(22);
                ds.Add(x);
            }
            return ds;
        }

        public async Task<NhanSuDto?> MotNhanSu(string code, int year, int id)
        {
            using var c = await MoAsync(code, year);
            using var cmd = new SqlCommand(
                $"SELECT {COT_NS} FROM NHAN_SU n WHERE id = @id", c);
            cmd.Parameters.AddWithValue("@id", id);
            using var r = await cmd.ExecuteReaderAsync();
            return await r.ReadAsync() ? DocNhanSu(r) : null;
        }

        private static void GanThamSoNhanSu(SqlCommand cmd, NhanSuDto x)
        {
            cmd.Parameters.AddWithValue("@ma_ns", (object?)x.MaNs ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@ho_ten", x.HoTen);
            cmd.Parameters.AddWithValue("@ngay_sinh", (object?)x.NgaySinh ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@gioi_tinh", (object?)x.GioiTinh ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@quoc_tich", (object?)x.QuocTich ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@so_cmnd", (object?)x.SoCmnd ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@ngay_cap", (object?)x.NgayCap ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@noi_cap", (object?)x.NoiCap ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@dia_chi", (object?)x.DiaChi ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@dien_thoai", (object?)x.DienThoai ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@email", (object?)x.Email ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@so_bhxh", (object?)x.SoBhxh ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@mst_ns", (object?)x.MstNs ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@nghe_nghiep", (object?)x.NgheNghiep ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@chuc_danh", (object?)x.ChucDanh ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@chuc_vu", (object?)x.ChucVu ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@bo_phan", (object?)x.BoPhan ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@dang_lam", x.DangLam);
            cmd.Parameters.AddWithValue("@ngay_vao", (object?)x.NgayVao ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@ngay_nghi", (object?)x.NgayNghi ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@ghi_chu", (object?)x.GhiChu ?? DBNull.Value);
        }

        /// <summary>
        /// Sinh mã nhân sự kế tiếp dạng NS + 5 chữ số (NS00001, NS00002...).
        ///
        /// Lấy số LỚN NHẤT đang có rồi +1, KHÔNG dùng COUNT(*): xóa người ở giữa thì
        /// COUNT tụt xuống và mã kế tiếp đè lên mã đã cấp cho người khác.
        ///
        /// Chỉ xét mã đúng khuôn NS+5 số; mã kế toán tự gõ tay kiểu "NV-01" bỏ qua để
        /// một mã lạ không kéo bộ đếm nhảy lung tung.
        ///
        /// Chạy TRONG cùng connection/transaction của lệnh INSERT gọi nó.
        /// </summary>
        private static async Task<string> MaNsKeTiep(SqlConnection c, SqlTransaction? tr)
        {
            using var cmd = new SqlCommand(
                "SELECT MAX(CAST(SUBSTRING(ma_ns, 3, 5) AS INT)) FROM NHAN_SU "
              + "WHERE ma_ns LIKE 'NS[0-9][0-9][0-9][0-9][0-9]' "
              + "AND LEN(ma_ns) = 7", c, tr);

            var v = await cmd.ExecuteScalarAsync();
            int max = v is null or DBNull ? 0 : Convert.ToInt32(v);

            // Cạn dải NS99999. Không tự tràn sang NS100000: mã 8 ký tự không còn khớp
            // bộ lọc LEN=7 ở trên, nên lần cấp sau sẽ bỏ qua nó và quay về NS00001 —
            // trùng mã cũ mà không ai thấy. Thà báo lỗi để kế toán tự đặt quy ước mới.
            if (max >= 99999)
                throw new InvalidOperationException(
                    "Đã dùng hết dải mã tự động NS00001–NS99999. Đặt mã nhân sự thủ công "
                  + "hoặc đổi quy ước mã.");

            return $"NS{max + 1:00000}";
        }

        public async Task<int> ThemNhanSu(string code, int year, NhanSuDto x, string nguoi)
        {
            using var c = await MoAsync(code, year);

            // Mã trống thì cấp tự động. Kế toán gõ tay mã riêng thì TÔN TRỌNG mã đó —
            // khuôn Excel không có cột mã nên phần lớn đường nhập đều để trống.
            if (string.IsNullOrWhiteSpace(x.MaNs))
                x.MaNs = await MaNsKeTiep(c, null);

            using var cmd = new SqlCommand(
                "INSERT INTO NHAN_SU (ma_ns, ho_ten, ngay_sinh, gioi_tinh, "
              + "quoc_tich, so_cmnd, ngay_cap, noi_cap, dia_chi, dien_thoai, email, "
              + "so_bhxh, mst_ns, nghe_nghiep, chuc_danh, chuc_vu, bo_phan, dang_lam, "
              + "ngay_vao, ngay_nghi, ghi_chu, created_by) "
              + "OUTPUT INSERTED.id "
              + "VALUES (@ma_ns, @ho_ten, @ngay_sinh, @gioi_tinh, @quoc_tich, "
              + "@so_cmnd, @ngay_cap, @noi_cap, @dia_chi, @dien_thoai, @email, @so_bhxh, "
              + "@mst_ns, @nghe_nghiep, @chuc_danh, @chuc_vu, @bo_phan, @dang_lam, "
              + "@ngay_vao, @ngay_nghi, @ghi_chu, @nguoi)", c);
            cmd.Parameters.AddWithValue("@nguoi", nguoi);
            GanThamSoNhanSu(cmd, x);
            return (int)(await cmd.ExecuteScalarAsync() ?? 0);
        }

        public async Task<bool> SuaNhanSu(
            string code, int year, int id, NhanSuDto x, string nguoi)
        {
            using var c = await MoAsync(code, year);
            using var cmd = new SqlCommand(
                "UPDATE NHAN_SU SET ma_ns=@ma_ns, ho_ten=@ho_ten, ngay_sinh=@ngay_sinh, "
              + "gioi_tinh=@gioi_tinh, quoc_tich=@quoc_tich, so_cmnd=@so_cmnd, "
              + "ngay_cap=@ngay_cap, noi_cap=@noi_cap, dia_chi=@dia_chi, "
              + "dien_thoai=@dien_thoai, email=@email, so_bhxh=@so_bhxh, mst_ns=@mst_ns, "
              + "nghe_nghiep=@nghe_nghiep, chuc_danh=@chuc_danh, chuc_vu=@chuc_vu, "
              + "bo_phan=@bo_phan, dang_lam=@dang_lam, ngay_vao=@ngay_vao, "
              + "ngay_nghi=@ngay_nghi, ghi_chu=@ghi_chu, "
              + "updated_by=@nguoi, updated_at=SYSDATETIME() "
              + "WHERE id=@id", c);
            cmd.Parameters.AddWithValue("@id", id);
            cmd.Parameters.AddWithValue("@nguoi", nguoi);
            GanThamSoNhanSu(cmd, x);
            return await cmd.ExecuteNonQueryAsync() > 0;
        }

        /// <summary>
        /// BR-HD-04 — xóa nhân sự. Người đã có hợp đồng thì KHÔNG xóa — hợp đồng là chứng từ, mất
        /// người ký là mất luôn ý nghĩa của nó. Trả false để controller báo rõ lý do.
        /// </summary>
        public async Task<bool> XoaNhanSu(string code, int year, int id)
        {
            using var c = await MoAsync(code, year);
            using var dem = new SqlCommand(
                "SELECT COUNT(*) FROM HOP_DONG WHERE nhan_su_id=@id", c);
            dem.Parameters.AddWithValue("@id", id);
            if ((int)(await dem.ExecuteScalarAsync() ?? 0) > 0) return false;

            using var cmd = new SqlCommand("DELETE FROM NHAN_SU WHERE id=@id", c);
            cmd.Parameters.AddWithValue("@id", id);
            return await cmd.ExecuteNonQueryAsync() > 0;
        }

        // ===================== HỢP ĐỒNG =====================

        private const string COT_HD =
            "h.id, h.nhan_su_id, h.so_hd, h.ngay_ky, h.loai_hd, h.tu_ngay, "
          + "h.den_ngay, h.dia_diem_lv, h.cong_viec, h.thoi_gian_lv, h.phuong_tien, "
          + "h.luong_chinh, h.pc_an_ca, h.pc_dien_thoai, h.pc_xang_xe, h.pc_khac, "
          + "h.hinh_thuc_tra, h.bao_ho_ld, h.thoa_thuan, h.nsdld_ho_ten, h.nsdld_chuc_vu, "
          + "h.nsdld_dai_dien, h.nsdld_dia_chi, h.trang_thai, h.ghi_chu, "
          + "n.ho_ten, n.ngay_sinh, n.so_cmnd, n.quoc_tich, n.nghe_nghiep, n.chuc_danh";

        private static HopDongDto DocHopDong(SqlDataReader r) => new()
        {
            Id = r.GetInt32(0),
            NhanSuId = r.GetInt32(1),
            SoHd = Chuoi(r, 2),
            NgayKy = Doc<DateTime>(r, 3),
            LoaiHd = Chuoi(r, 4),
            TuNgay = Doc<DateTime>(r, 5),
            DenNgay = Doc<DateTime>(r, 6),
            DiaDiemLv = Chuoi(r, 7),
            CongViec = Chuoi(r, 8),
            ThoiGianLv = Chuoi(r, 9),
            PhuongTien = Chuoi(r, 10),
            LuongChinh = Doc<decimal>(r, 11),
            PcAnCa = Doc<decimal>(r, 12),
            PcDienThoai = Doc<decimal>(r, 13),
            PcXangXe = Doc<decimal>(r, 14),
            PcKhac = Doc<decimal>(r, 15),
            HinhThucTra = Chuoi(r, 16),
            BaoHoLd = Chuoi(r, 17),
            ThoaThuan = Chuoi(r, 18),
            NsdldHoTen = Chuoi(r, 19),
            NsdldChucVu = Chuoi(r, 20),
            NsdldDaiDien = Chuoi(r, 21),
            NsdldDiaChi = Chuoi(r, 22),
            TrangThai = Chuoi(r, 23),
            GhiChu = Chuoi(r, 24),
            HoTen = Chuoi(r, 25),
            NgaySinh = Doc<DateTime>(r, 26),
            SoCmnd = Chuoi(r, 27),
            QuocTich = Chuoi(r, 28),
            NgheNghiep = Chuoi(r, 29),
            ChucDanh = Chuoi(r, 30),
        };

        public async Task<List<HopDongDto>> DanhSachHopDong(
            string code, int year, int? nhanSuId)
        {
            var ds = new List<HopDongDto>();
            using var c = await MoAsync(code, year);
            using var cmd = new SqlCommand(
                $"SELECT {COT_HD} FROM HOP_DONG h "
              + "JOIN NHAN_SU n ON n.id = h.nhan_su_id "
              + (nhanSuId.HasValue ? "WHERE h.nhan_su_id = @ns " : "")
              + "ORDER BY h.ngay_ky DESC, h.id DESC", c);
            if (nhanSuId.HasValue) cmd.Parameters.AddWithValue("@ns", nhanSuId.Value);
            using var r = await cmd.ExecuteReaderAsync();
            while (await r.ReadAsync()) ds.Add(DocHopDong(r));
            return ds;
        }

        public async Task<HopDongDto?> MotHopDong(string code, int year, int id)
        {
            using var c = await MoAsync(code, year);
            using var cmd = new SqlCommand(
                $"SELECT {COT_HD} FROM HOP_DONG h "
              + "JOIN NHAN_SU n ON n.id = h.nhan_su_id "
              + "WHERE h.id = @id", c);
            cmd.Parameters.AddWithValue("@id", id);
            using var r = await cmd.ExecuteReaderAsync();
            return await r.ReadAsync() ? DocHopDong(r) : null;
        }

        private static void GanThamSoHopDong(SqlCommand cmd, HopDongDto x)
        {
            cmd.Parameters.AddWithValue("@ns", x.NhanSuId);
            cmd.Parameters.AddWithValue("@so_hd", (object?)x.SoHd ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@ngay_ky", (object?)x.NgayKy ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@loai_hd", (object?)x.LoaiHd ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@tu_ngay", (object?)x.TuNgay ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@den_ngay", (object?)x.DenNgay ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@dia_diem_lv", (object?)x.DiaDiemLv ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@cong_viec", (object?)x.CongViec ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@thoi_gian_lv", (object?)x.ThoiGianLv ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@phuong_tien", (object?)x.PhuongTien ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@luong_chinh", (object?)x.LuongChinh ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@pc_an_ca", (object?)x.PcAnCa ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@pc_dien_thoai", (object?)x.PcDienThoai ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@pc_xang_xe", (object?)x.PcXangXe ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@pc_khac", (object?)x.PcKhac ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@hinh_thuc_tra", (object?)x.HinhThucTra ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@bao_ho_ld", (object?)x.BaoHoLd ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@thoa_thuan", (object?)x.ThoaThuan ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@nsdld_ho_ten", (object?)x.NsdldHoTen ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@nsdld_chuc_vu", (object?)x.NsdldChucVu ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@nsdld_dai_dien", (object?)x.NsdldDaiDien ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@nsdld_dia_chi", (object?)x.NsdldDiaChi ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@trang_thai", (object?)x.TrangThai ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@ghi_chu", (object?)x.GhiChu ?? DBNull.Value);
        }

        public async Task<int> ThemHopDong(string code, int year, HopDongDto x, string nguoi)
        {
            using var c = await MoAsync(code, year);
            using var cmd = new SqlCommand(
                "INSERT INTO HOP_DONG (nhan_su_id, so_hd, ngay_ky, loai_hd, "
              + "tu_ngay, den_ngay, dia_diem_lv, cong_viec, thoi_gian_lv, phuong_tien, "
              + "luong_chinh, pc_an_ca, pc_dien_thoai, pc_xang_xe, pc_khac, hinh_thuc_tra, "
              + "bao_ho_ld, thoa_thuan, nsdld_ho_ten, nsdld_chuc_vu, nsdld_dai_dien, "
              + "nsdld_dia_chi, trang_thai, ghi_chu, created_by) "
              + "OUTPUT INSERTED.id "
              + "VALUES (@ns, @so_hd, @ngay_ky, @loai_hd, @tu_ngay, @den_ngay, "
              + "@dia_diem_lv, @cong_viec, @thoi_gian_lv, @phuong_tien, @luong_chinh, "
              + "@pc_an_ca, @pc_dien_thoai, @pc_xang_xe, @pc_khac, @hinh_thuc_tra, "
              + "@bao_ho_ld, @thoa_thuan, @nsdld_ho_ten, @nsdld_chuc_vu, @nsdld_dai_dien, "
              + "@nsdld_dia_chi, @trang_thai, @ghi_chu, @nguoi)", c);
            cmd.Parameters.AddWithValue("@nguoi", nguoi);
            GanThamSoHopDong(cmd, x);
            return (int)(await cmd.ExecuteScalarAsync() ?? 0);
        }

        public async Task<bool> SuaHopDong(
            string code, int year, int id, HopDongDto x, string nguoi)
        {
            using var c = await MoAsync(code, year);
            using var cmd = new SqlCommand(
                "UPDATE HOP_DONG SET nhan_su_id=@ns, so_hd=@so_hd, ngay_ky=@ngay_ky, "
              + "loai_hd=@loai_hd, tu_ngay=@tu_ngay, den_ngay=@den_ngay, "
              + "dia_diem_lv=@dia_diem_lv, cong_viec=@cong_viec, thoi_gian_lv=@thoi_gian_lv, "
              + "phuong_tien=@phuong_tien, luong_chinh=@luong_chinh, pc_an_ca=@pc_an_ca, "
              + "pc_dien_thoai=@pc_dien_thoai, pc_xang_xe=@pc_xang_xe, pc_khac=@pc_khac, "
              + "hinh_thuc_tra=@hinh_thuc_tra, bao_ho_ld=@bao_ho_ld, thoa_thuan=@thoa_thuan, "
              + "nsdld_ho_ten=@nsdld_ho_ten, nsdld_chuc_vu=@nsdld_chuc_vu, "
              + "nsdld_dai_dien=@nsdld_dai_dien, nsdld_dia_chi=@nsdld_dia_chi, "
              + "trang_thai=@trang_thai, ghi_chu=@ghi_chu, "
              + "updated_by=@nguoi, updated_at=SYSDATETIME() "
              + "WHERE id=@id", c);
            cmd.Parameters.AddWithValue("@id", id);
            cmd.Parameters.AddWithValue("@nguoi", nguoi);
            GanThamSoHopDong(cmd, x);
            return await cmd.ExecuteNonQueryAsync() > 0;
        }

        public async Task<bool> XoaHopDong(string code, int year, int id)
        {
            using var c = await MoAsync(code, year);
            using var cmd = new SqlCommand("DELETE FROM HOP_DONG WHERE id=@id", c);
            cmd.Parameters.AddWithValue("@id", id);
            return await cmd.ExecuteNonQueryAsync() > 0;
        }
    }
}
