using Microsoft.Data.SqlClient;
using KT2000.Api.Models;

namespace KT2000.Api.Services
{
    // Chấm công + bảng thanh toán lương. Hai bảng nằm trong database ĐƠN VỊ-NĂM
    // (database/026_tenant_chamcong_bangluong.sql).
    //
    // Spec: docs/THUE/HOPDONG/SPEC-MAN-HOP-DONG.md
    // Mọi câu SQL tham số hóa 100% (luật #3).
    public class ChamCongService
    {
        private readonly TenantDbResolver _resolver;
        private readonly VaCauTrucService _va;

        public ChamCongService(TenantDbResolver resolver, VaCauTrucService va)
        {
            _resolver = resolver;
            _va = va;
        }

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
                    + "Vào Quản trị -> Đơn vị để mở năm làm việc này trước khi chấm công.");
            }
        }

        private static T? Doc<T>(SqlDataReader r, int i) where T : struct =>
            r.IsDBNull(i) ? null : (T)r.GetValue(i);

        private static string? Chuoi(SqlDataReader r, int i) =>
            r.IsDBNull(i) ? null : r.GetString(i);

        // ===================== KÝ HIỆU CHẤM CÔNG =====================

        // Ký hiệu TÍNH CÔNG — theo Thông tư 200 mẫu 01a-LĐTL (spec mục 5.2).
        //
        // Nhận CẢ BỘ TT200 đầy đủ để đơn vị khác dùng được, dù VĨNH HOÀN chỉ gõ khuôn
        // rút gọn '1' / '0' / 'CN' / 'L'.
        //
        // NGHỈ LỄ ('L') và CHỦ NHẬT ('CN') KHÔNG cộng công: người lao động vẫn hưởng
        // nguyên lương ngày lễ, nhưng đó là chế độ riêng, không phải ngày công làm
        // việc. Cộng vào đây thì lương thực tế của tháng nhiều lễ vọt lên vô lý.
        //   Bằng chứng trong khuôn: cc01 dòng Ngân có 5 ô 'L' cuối tháng, Tổng = 21
        //   chứ không phải 26 — đúng bằng số ô mang '1'.
        private static readonly HashSet<string> KY_HIEU_TINH_CONG =
            new(StringComparer.OrdinalIgnoreCase)
            {
                "1",      // đi làm — khuôn rút gọn VĨNH HOÀN
                "X", "+", // lương thời gian (TT200)
                "SP",     // lương sản phẩm
                "P",      // nghỉ phép năm (có hưởng lương)
                "H",      // hội nghị, học tập
                "NB",     // nghỉ bù
            };

        /// <summary>Nửa công ghi '0.5' hoặc '1/2' — quy về 0,5; ký hiệu chữ tính 1 công.</summary>
        private static decimal CongCuaO(string? o)
        {
            var s = (o ?? "").Trim();
            if (s.Length == 0) return 0;

            if (s == "0.5" || s == "0,5" || s == "1/2") return 0.5m;
            return KY_HIEU_TINH_CONG.Contains(s) ? 1m : 0m;
        }

        /// <summary>BR-CC-03 — tổng công do hệ thống tính, không nhận số kế toán gõ.</summary>
        public static decimal TinhTongCong(string?[] ngay) =>
            ngay.Take(31).Sum(CongCuaO);

        // ===================== CHẤM CÔNG =====================

        private static readonly string COT_NGAY = string.Join(", ",
            Enumerable.Range(1, 31).Select(i => $"c.ngay_{i:00}"));

        private const string COT_CC_DAU =
            "c.id, c.nhan_su_id, c.thang";

        private const string COT_CC_CUOI =
            "c.tong_cong, c.cong_them_gio, c.ghi_chu, n.ho_ten, n.chuc_danh, n.bo_phan";

        private static ChamCongDto DocChamCong(SqlDataReader r)
        {
            var x = new ChamCongDto
            {
                Id = r.GetInt32(0),
                NhanSuId = r.GetInt32(1),
                Thang = r.GetInt32(2),
            };
            for (int i = 0; i < 31; i++) x.Ngay[i] = Chuoi(r, 3 + i);
            x.TongCong = Doc<decimal>(r, 34);
            x.CongThemGio = Doc<decimal>(r, 35);
            x.GhiChu = Chuoi(r, 36);
            x.HoTen = Chuoi(r, 37);
            x.ChucDanh = Chuoi(r, 38);
            x.BoPhan = Chuoi(r, 39);
            return x;
        }

        public async Task<List<ChamCongDto>> DanhSachChamCong(string code, int year, int thang)
        {
            var ds = new List<ChamCongDto>();
            using var c = await MoAsync(code, year);
            using var cmd = new SqlCommand(
                $"SELECT {COT_CC_DAU}, {COT_NGAY}, {COT_CC_CUOI} "
              + "FROM CHAM_CONG c JOIN NHAN_SU n ON n.id = c.nhan_su_id "
              + "WHERE c.thang = @t ORDER BY n.ho_ten", c);
            cmd.Parameters.AddWithValue("@t", thang);
            using var r = await cmd.ExecuteReaderAsync();
            while (await r.ReadAsync()) ds.Add(DocChamCong(r));
            return ds;
        }

        /// <summary>
        /// Sinh dòng chấm công trống cho những nhân sự đang làm mà tháng này chưa có.
        /// Điền sẵn 'CN' vào chủ nhật — đó là thứ duy nhất suy được từ lịch; ngày lễ
        /// KHÔNG tự điền vì lịch nghỉ lễ mỗi năm một khác và còn phụ thuộc lịch nghỉ
        /// bù do Chính phủ công bố, đoán sai thì kế toán phải dò lại cả bảng.
        /// </summary>
        public async Task<int> KhoiTao(string code, int year, int thang, string nguoi)
        {
            using var c = await MoAsync(code, year);

            var thieu = new List<int>();
            using (var cmd = new SqlCommand(
                "SELECT n.id FROM NHAN_SU n "
              + "WHERE n.dang_lam = 1 AND NOT EXISTS ("
              + "  SELECT 1 FROM CHAM_CONG cc WHERE cc.nhan_su_id = n.id AND cc.thang = @t)", c))
            {
                cmd.Parameters.AddWithValue("@t", thang);
                using var r = await cmd.ExecuteReaderAsync();
                while (await r.ReadAsync()) thieu.Add(r.GetInt32(0));
            }
            if (thieu.Count == 0) return 0;

            int soNgay = DateTime.DaysInMonth(year, thang);
            var oCn = new string?[31];
            for (int d = 1; d <= soNgay; d++)
                if (new DateTime(year, thang, d).DayOfWeek == DayOfWeek.Sunday)
                    oCn[d - 1] = "CN";

            int n = 0;
            foreach (var id in thieu)
            {
                using var cmd = new SqlCommand(TaoCauChen(), c);
                GanThamSoChamCong(cmd, id, thang, oCn, TinhTongCong(oCn), null, null);
                cmd.Parameters.AddWithValue("@nguoi", nguoi);
                await cmd.ExecuteNonQueryAsync();
                n++;
            }
            return n;
        }

        private static string TaoCauChen()
        {
            var cot = string.Join(", ", Enumerable.Range(1, 31).Select(i => $"ngay_{i:00}"));
            var gt = string.Join(", ", Enumerable.Range(1, 31).Select(i => $"@n{i:00}"));
            return "INSERT INTO CHAM_CONG (nhan_su_id, thang, " + cot
                 + ", tong_cong, cong_them_gio, ghi_chu, created_by) "
                 + "VALUES (@ns, @t, " + gt
                 + ", @tong, @them, @ghi_chu, @nguoi)";
        }

        private static void GanThamSoChamCong(
            SqlCommand cmd, int nhanSuId, int thang, string?[] ngay,
            decimal tong, decimal? themGio, string? ghiChu)
        {
            cmd.Parameters.AddWithValue("@ns", nhanSuId);
            cmd.Parameters.AddWithValue("@t", thang);
            for (int i = 1; i <= 31; i++)
            {
                var v = i - 1 < ngay.Length ? ngay[i - 1] : null;
                cmd.Parameters.AddWithValue($"@n{i:00}",
                    string.IsNullOrWhiteSpace(v) ? DBNull.Value : v.Trim());
            }
            cmd.Parameters.AddWithValue("@tong", tong);
            cmd.Parameters.AddWithValue("@them", (object?)themGio ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@ghi_chu", (object?)ghiChu ?? DBNull.Value);
        }

        /// <summary>
        /// Lưu cả lưới một lượt, trong MỘT transaction. Lưới chấm công là một tờ giấy:
        /// lưu được nửa bảng rồi hỏng thì tháng đó vừa không đúng bản cũ vừa không đúng
        /// bản mới, mà nhìn màn hình không biết dòng nào đã vào.
        ///
        /// Ô ngày vượt số ngày thực của tháng bị BỎ QUA (BR-CC-04): tháng 2 không có
        /// ngày 30, để lọt ký hiệu vào đó thì tổng công vống lên.
        /// </summary>
        public async Task<int> LuuChamCong(
            string code, int year, int thang, List<ChamCongDto> ds, string nguoi)
        {
            using var c = await MoAsync(code, year);
            using var tran = c.BeginTransaction();
            try
            {
                int soNgay = DateTime.DaysInMonth(year, thang);
                var cotSet = string.Join(", ",
                    Enumerable.Range(1, 31).Select(i => $"ngay_{i:00}=@n{i:00}"));

                int n = 0;
                foreach (var x in ds)
                {
                    var ngay = new string?[31];
                    for (int i = 0; i < 31; i++)
                        ngay[i] = i < soNgay && i < x.Ngay.Length ? x.Ngay[i] : null;

                    var tong = TinhTongCong(ngay);

                    using var cmd = new SqlCommand(
                        "UPDATE CHAM_CONG SET " + cotSet
                      + ", tong_cong=@tong, cong_them_gio=@them, ghi_chu=@ghi_chu, "
                      + "updated_by=@nguoi, updated_at=SYSDATETIME() "
                      + "WHERE nhan_su_id=@ns AND thang=@t", c, tran);
                    GanThamSoChamCong(cmd, x.NhanSuId, thang, ngay, tong,
                                      x.CongThemGio, x.GhiChu);
                    cmd.Parameters.AddWithValue("@nguoi", nguoi);

                    if (await cmd.ExecuteNonQueryAsync() == 0)
                    {
                        // Chưa có dòng thì chèn — nhân sự mới thêm giữa tháng vẫn chấm được
                        using var chen = new SqlCommand(TaoCauChen(), c, tran);
                        GanThamSoChamCong(chen, x.NhanSuId, thang, ngay, tong,
                                          x.CongThemGio, x.GhiChu);
                        chen.Parameters.AddWithValue("@nguoi", nguoi);
                        await chen.ExecuteNonQueryAsync();
                    }
                    n++;
                }
                tran.Commit();
                return n;
            }
            catch
            {
                tran.Rollback();
                throw;
            }
        }

        // ===================== BẢNG LƯƠNG =====================

        private const string COT_BL =
            "b.id, b.nhan_su_id, b.thang, b.bo_phan, b.ngay_cong_chuan, b.ngay_cong_tt, "
          + "b.luong_chinh, b.luong_thuc_te, b.pc_an_ca, b.pc_dien_thoai, b.pc_xang_xe, "
          + "b.pc_chuyen_can, b.pc_hieu_qua, b.tien_thuong, b.tong_phu_cap, b.tong_luong, "
          + "b.tam_ung, b.khau_tru_bh, b.thue_tncn, b.tong_khau_tru, b.thuc_linh, "
          + "b.ghi_chu, n.ho_ten, n.chuc_danh";

        private static BangLuongDto DocBangLuong(SqlDataReader r) => new()
        {
            Id = r.GetInt32(0),
            NhanSuId = r.GetInt32(1),
            Thang = r.GetInt32(2),
            BoPhan = Chuoi(r, 3),
            NgayCongChuan = r.GetDecimal(4),
            NgayCongTt = Doc<decimal>(r, 5),
            LuongChinh = Doc<decimal>(r, 6),
            LuongThucTe = Doc<decimal>(r, 7),
            PcAnCa = Doc<decimal>(r, 8),
            PcDienThoai = Doc<decimal>(r, 9),
            PcXangXe = Doc<decimal>(r, 10),
            PcChuyenCan = Doc<decimal>(r, 11),
            PcHieuQua = Doc<decimal>(r, 12),
            TienThuong = Doc<decimal>(r, 13),
            TongPhuCap = Doc<decimal>(r, 14),
            TongLuong = Doc<decimal>(r, 15),
            TamUng = Doc<decimal>(r, 16),
            KhauTruBh = Doc<decimal>(r, 17),
            ThueTncn = Doc<decimal>(r, 18),
            TongKhauTru = Doc<decimal>(r, 19),
            ThucLinh = Doc<decimal>(r, 20),
            GhiChu = Chuoi(r, 21),
            HoTen = Chuoi(r, 22),
            ChucDanh = Chuoi(r, 23),
        };

        public async Task<List<BangLuongDto>> DanhSachBangLuong(string code, int year, int thang)
        {
            var ds = new List<BangLuongDto>();
            using var c = await MoAsync(code, year);
            using var cmd = new SqlCommand(
                $"SELECT {COT_BL} FROM BANG_LUONG b "
              + "JOIN NHAN_SU n ON n.id = b.nhan_su_id "
              + "WHERE b.thang = @t ORDER BY n.ho_ten", c);
            cmd.Parameters.AddWithValue("@t", thang);
            using var r = await cmd.ExecuteReaderAsync();
            while (await r.ReadAsync()) ds.Add(DocBangLuong(r));
            return ds;
        }

        // ---------------------------------------------------------------------------------
        // TÍNH LƯƠNG — BR-BL-02..07
        //
        // Đối chiếu khuôn VĨNH HOÀN sheet "THANG 1" năm 2025, ngày công chuẩn 21:
        //   Ngân  21 công → thực tế 5.310.000        · ăn ca 525.000 · BH 557.550 · lĩnh 9.777.450
        //   Hiền  20 công → 5.310.000×20/21 = 5.057.142,857 · ăn ca 500.000
        //   Hồi   19 công → 5.310.000×19/21 = 4.804.285,714 · ăn ca 475.000 · BH VẪN 557.550
        // ---------------------------------------------------------------------------------

        /// <summary>Tỷ lệ NLĐ đóng: BHXH 8% + BHYT 1,5% + BHTN 1% (mức 2026).</summary>
        public const decimal TY_LE_BH_NLD = 0.105m;

        /// <summary>
        /// BR-BL-05 — trần đóng bảo hiểm: 20 lần mức tham chiếu, 46,8 triệu/tháng (2026).
        /// Lương vượt trần thì lấy TRẦN để tính, không lấy lương thật.
        /// </summary>
        public const decimal TRAN_DONG_BH = 46_800_000m;

        /// <summary>
        /// Tính một dòng lương từ ngày công + mức trên hợp đồng. KHÔNG lưu — trả bản nháp
        /// để kế toán soát rồi mới PUT. Tính xong ghi đè thẳng thì một lần bấm nhầm là mất
        /// số đã chỉnh tay của cả tháng.
        /// </summary>
        public static BangLuongDto TinhMotDong(BangLuongDto x)
        {
            var chuan = x.NgayCongChuan > 0 ? x.NgayCongChuan : 1m;
            var cong = x.NgayCongTt ?? 0m;
            var luongChinh = x.LuongChinh ?? 0m;

            // BR-BL-02: KHÔNG làm tròn ở bước này. Excel giữ đủ phần lẻ; làm tròn sớm
            // thì Tổng lương lệch vài đồng so với bản kế toán đang phát.
            x.LuongThucTe = Math.Round(luongChinh * cong / chuan, 2,
                                       MidpointRounding.AwayFromZero);

            // BR-BL-03: ăn ca theo NGÀY CÔNG THỰC TẾ. PcAnCa truyền vào là ĐƠN GIÁ/ngày
            // (lấy từ HOP_DONG.pc_an_ca), nhân ra thành tiền tháng.
            // Các phụ cấp còn lại trọn tháng, KHÔNG chia theo công.
            var anCa = Math.Round((x.PcAnCa ?? 0m) * cong, 0, MidpointRounding.AwayFromZero);
            x.PcAnCa = anCa;

            x.TongPhuCap = anCa
                         + (x.PcDienThoai ?? 0m) + (x.PcXangXe ?? 0m)
                         + (x.PcChuyenCan ?? 0m) + (x.PcHieuQua ?? 0m)
                         + (x.TienThuong ?? 0m);

            // BR-BL-07: chỉ làm tròn ở cột lưu cuối cùng
            x.TongLuong = Math.Round((x.LuongThucTe ?? 0m) + (x.TongPhuCap ?? 0m), 0,
                                     MidpointRounding.AwayFromZero);

            // BR-BL-04: tính trên LƯƠNG CHÍNH, KHÔNG trên lương thực tế.
            // Đây là chỗ dễ code sai nhất: nhìn qua tưởng phải nhân theo ngày công như
            // lương. Ô P14 của khuôn chứng minh — Hồi 19 công vẫn trừ đúng 557.550.
            var canCu = Math.Min(luongChinh, TRAN_DONG_BH);
            x.KhauTruBh = Math.Round(canCu * TY_LE_BH_NLD, 0, MidpointRounding.AwayFromZero);

            x.TongKhauTru = (x.TamUng ?? 0m) + (x.KhauTruBh ?? 0m) + (x.ThueTncn ?? 0m);
            x.ThucLinh = (x.TongLuong ?? 0m) - (x.TongKhauTru ?? 0m);
            return x;
        }

        /// <summary>
        /// Dựng bản nháp bảng lương cả tháng: ghép ngày công (CHAM_CONG) với mức lương và
        /// phụ cấp trên HỢP ĐỒNG còn hiệu lực của từng người, rồi tính theo TinhMotDong.
        /// KHÔNG ghi vào DB.
        /// </summary>
        public async Task<List<BangLuongDto>> TinhBangLuong(
            string code, int year, int thang, decimal ngayCongChuan)
        {
            var ds = new List<BangLuongDto>();
            using var c = await MoAsync(code, year);

            // Hợp đồng lấy bản MỚI NHẤT còn hiệu lực tại thời điểm cuối tháng đang tính:
            // người ký phụ lục tăng lương giữa năm thì tháng sau phải ăn theo mức mới.
            // OUTER APPLY chứ không JOIN thẳng — một người có nhiều hợp đồng, JOIN thẳng
            // sẽ nhân dòng lên và bảng lương có hai dòng cùng một người.
            var cuoiThang = new DateTime(year, thang, DateTime.DaysInMonth(year, thang));

            using var cmd = new SqlCommand(
                "SELECT n.id, n.ho_ten, n.chuc_danh, n.bo_phan, "
              + "       cc.tong_cong, "
              + "       h.luong_chinh, h.pc_an_ca, h.pc_dien_thoai, h.pc_xang_xe, h.pc_khac "
              + "FROM NHAN_SU n "
              + "LEFT JOIN CHAM_CONG cc ON cc.nhan_su_id = n.id AND cc.thang = @t "
              + "OUTER APPLY ("
              + "  SELECT TOP 1 luong_chinh, pc_an_ca, pc_dien_thoai, pc_xang_xe, pc_khac "
              + "  FROM HOP_DONG hd "
              + "  WHERE hd.nhan_su_id = n.id "
              + "    AND (hd.trang_thai IS NULL OR hd.trang_thai <> 'da_huy') "
              + "    AND (hd.tu_ngay IS NULL OR hd.tu_ngay <= @cuoi) "
              + "  ORDER BY hd.ngay_ky DESC, hd.id DESC) h "
              + "WHERE n.dang_lam = 1 "
              + "ORDER BY n.ho_ten", c);
            cmd.Parameters.AddWithValue("@t", thang);
            cmd.Parameters.AddWithValue("@cuoi", cuoiThang);

            using var r = await cmd.ExecuteReaderAsync();
            while (await r.ReadAsync())
            {
                var x = new BangLuongDto
                {
                    NhanSuId = r.GetInt32(0),
                    Thang = thang,
                    HoTen = Chuoi(r, 1),
                    ChucDanh = Chuoi(r, 2),
                    BoPhan = Chuoi(r, 3),
                    NgayCongChuan = ngayCongChuan,
                    NgayCongTt = Doc<decimal>(r, 4) ?? 0m,
                    LuongChinh = Doc<decimal>(r, 5),
                    // pc_an_ca trên hợp đồng là ĐƠN GIÁ/ngày công (khuôn Excel: 25.000)
                    PcAnCa = Doc<decimal>(r, 6),
                    PcDienThoai = Doc<decimal>(r, 7),
                    PcXangXe = Doc<decimal>(r, 8),
                    // pc_khac của hợp đồng rót vào "hiệu quả công việc" — khuôn Excel để
                    // khoản lớn nhất (3.500.000) ở cột đó.
                    PcHieuQua = Doc<decimal>(r, 9),
                };
                ds.Add(TinhMotDong(x));
            }
            return ds;
        }

        private static void GanThamSoLuong(SqlCommand cmd, BangLuongDto x, int thang)
        {
            cmd.Parameters.AddWithValue("@ns", x.NhanSuId);
            cmd.Parameters.AddWithValue("@t", thang);
            cmd.Parameters.AddWithValue("@bo_phan", (object?)x.BoPhan ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@chuan", x.NgayCongChuan);
            cmd.Parameters.AddWithValue("@cong", (object?)x.NgayCongTt ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@luong_chinh", (object?)x.LuongChinh ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@luong_tt", (object?)x.LuongThucTe ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@an_ca", (object?)x.PcAnCa ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@dien_thoai", (object?)x.PcDienThoai ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@xang_xe", (object?)x.PcXangXe ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@chuyen_can", (object?)x.PcChuyenCan ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@hieu_qua", (object?)x.PcHieuQua ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@thuong", (object?)x.TienThuong ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@tong_pc", (object?)x.TongPhuCap ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@tong_luong", (object?)x.TongLuong ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@tam_ung", (object?)x.TamUng ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@bh", (object?)x.KhauTruBh ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@tncn", (object?)x.ThueTncn ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@tong_kt", (object?)x.TongKhauTru ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@thuc_linh", (object?)x.ThucLinh ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@ghi_chu", (object?)x.GhiChu ?? DBNull.Value);
        }

        /// <summary>
        /// Lưu cả bảng lương một tháng trong MỘT transaction — cùng lý do LuuChamCong.
        /// Cột tính được vẫn LƯU THẬT chứ không tính lúc đọc: bảng lương là chứng từ đã
        /// phát cho người lao động, đổi công thức năm sau mà bảng cũ tự tính lại ra số
        /// khác là sai.
        /// </summary>
        public async Task<int> LuuBangLuong(
            string code, int year, int thang, List<BangLuongDto> ds, string nguoi)
        {
            using var c = await MoAsync(code, year);
            using var tran = c.BeginTransaction();
            try
            {
                int n = 0;
                foreach (var x in ds)
                {
                    using var cmd = new SqlCommand(
                        "UPDATE BANG_LUONG SET bo_phan=@bo_phan, ngay_cong_chuan=@chuan, "
                      + "ngay_cong_tt=@cong, luong_chinh=@luong_chinh, luong_thuc_te=@luong_tt, "
                      + "pc_an_ca=@an_ca, pc_dien_thoai=@dien_thoai, pc_xang_xe=@xang_xe, "
                      + "pc_chuyen_can=@chuyen_can, pc_hieu_qua=@hieu_qua, tien_thuong=@thuong, "
                      + "tong_phu_cap=@tong_pc, tong_luong=@tong_luong, tam_ung=@tam_ung, "
                      + "khau_tru_bh=@bh, thue_tncn=@tncn, tong_khau_tru=@tong_kt, "
                      + "thuc_linh=@thuc_linh, ghi_chu=@ghi_chu, "
                      + "updated_by=@nguoi, updated_at=SYSDATETIME() "
                      + "WHERE nhan_su_id=@ns AND thang=@t", c, tran);
                    GanThamSoLuong(cmd, x, thang);
                    cmd.Parameters.AddWithValue("@nguoi", nguoi);

                    if (await cmd.ExecuteNonQueryAsync() == 0)
                    {
                        using var chen = new SqlCommand(
                            "INSERT INTO BANG_LUONG (nhan_su_id, thang, bo_phan, "
                          + "ngay_cong_chuan, ngay_cong_tt, luong_chinh, luong_thuc_te, "
                          + "pc_an_ca, pc_dien_thoai, pc_xang_xe, pc_chuyen_can, pc_hieu_qua, "
                          + "tien_thuong, tong_phu_cap, tong_luong, tam_ung, khau_tru_bh, "
                          + "thue_tncn, tong_khau_tru, thuc_linh, ghi_chu, created_by) "
                          + "VALUES (@ns, @t, @bo_phan, @chuan, @cong, @luong_chinh, @luong_tt, "
                          + "@an_ca, @dien_thoai, @xang_xe, @chuyen_can, @hieu_qua, @thuong, "
                          + "@tong_pc, @tong_luong, @tam_ung, @bh, @tncn, @tong_kt, "
                          + "@thuc_linh, @ghi_chu, @nguoi)", c, tran);
                        GanThamSoLuong(chen, x, thang);
                        chen.Parameters.AddWithValue("@nguoi", nguoi);
                        await chen.ExecuteNonQueryAsync();
                    }
                    n++;
                }
                tran.Commit();
                return n;
            }
            catch
            {
                tran.Rollback();
                throw;
            }
        }
    }
}
