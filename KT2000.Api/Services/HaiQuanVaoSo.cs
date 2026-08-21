using Microsoft.Data.SqlClient;

namespace KT2000.Api.Services
{
    /// <summary>
    /// Ghi TỔNG tờ khai hải quan của một kỳ vào sổ (HOA_DON + HOA_DON_LINE).
    ///
    /// VÌ SAO CÓ (yêu cầu sếp 21/08): thuế khâu nhập khẩu không nằm trong bảng kê hóa
    /// đơn điện tử. Trước nay chỉ đọc file rồi điền tay vào [23a]/[24a], nên lần sau lập
    /// lại tờ khai là phải đọc lại file. Đưa vào sổ thì nó thành chứng từ như mọi hóa
    /// đơn khác — lập tờ khai lần sau tự cộng, không phải đọc file nữa.
    ///
    /// ĐI KÈM CỜ, MẶC ĐỊNH TẮT (appsettings "HaiQuan:GhiVaoSo"). Luồng đọc file hiện
    /// tại GIỮ NGUYÊN, không đụng vào: bật cờ ở một đơn vị thử trước, hỏng thì tắt là
    /// về đúng hành vi cũ, không phải rollback code giữa lúc kế toán đang làm.
    ///
    /// KHUÔN GHI (chốt 21/08):
    ///   • CẢ KỲ gộp MỘT dòng HOA_DON, các khối thuế thành HOA_DON_LINE.
    ///   • ma_hd = "VAO_HQ_{MÃ}_{THÁNG}_{NĂM}" — tiền tố VAO_ là BẮT BUỘC:
    ///     cột `huong` của HOA_DON là CỘT TÍNH, suy từ tiền tố ma_hd
    ///     (LIKE 'VAO_%' -> 'VAO'). Đặt tên khác là hóa đơn không thuộc chiều nào
    ///     và biến mất khỏi mọi báo cáo.
    ///   • Định khoản 1331 / 3331 — thuế GTGT hàng nhập khẩu được khấu trừ / phải nộp.
    /// </summary>
    public class HaiQuanVaoSo
    {
        private readonly TenantDbResolver _resolver;
        private readonly IConfiguration _config;
        private readonly ILogger<HaiQuanVaoSo> _log;

        public HaiQuanVaoSo(TenantDbResolver resolver, IConfiguration config,
                            ILogger<HaiQuanVaoSo> log)
        {
            _resolver = resolver;
            _config = config;
            _log = log;
        }

        /// <summary>Cờ bật/tắt. Mặc định TẮT — xem phần đầu class.</summary>
        public bool DuocGhi => _config.GetValue("HaiQuan:GhiVaoSo", false);

        public sealed record KetQua(bool DaGhi, string MaHd, int SoDong, string ThongDiep);

        /// <summary>
        /// Mã hóa đơn của dòng tổng. Một kỳ MỘT mã — đây chính là khóa chống trùng:
        /// bấm lại lần hai thì ma_hd đã tồn tại, không ghi thêm.
        /// </summary>
        public static string MaHdCuaKy(string maDonVi, int nam, int thang)
            => $"VAO_HQ_{maDonVi}_{thang:00}_{nam}";

        /// <summary>
        /// Ghi tổng tờ khai hải quan của kỳ vào sổ.
        ///
        /// KHÔNG ghi khi: cờ tắt, hoặc kỳ không có tờ khai nào, hoặc dòng của kỳ đã có
        /// trong sổ. Cả ba đều trả DaGhi=false kèm lý do — người dùng phải biết vì sao
        /// bấm mà không thấy gì đổi.
        /// </summary>
        public async Task<KetQua> Ghi(string maDonVi, int nam, int thang,
                                      ToKhaiHaiQuanService.KetQuaHaiQuan hq,
                                      string nguoiDung)
        {
            if (!DuocGhi)
                return new KetQua(false, "", 0,
                    "Chưa bật ghi tờ khai hải quan vào sổ (HaiQuan:GhiVaoSo = false)");

            if (hq.SoToKhai == 0 || hq.Dong.Count == 0)
                return new KetQua(false, "", 0, "Kỳ này không có tờ khai hải quan nào");

            var maHd = MaHdCuaKy(maDonVi, nam, thang);

            using var c = new SqlConnection(_resolver.GetTenantConnection(maDonVi, nam));
            await c.OpenAsync();

            // CHỐNG TRÙNG tầng 1: hỏi trước cho có thông điệp tử tế.
            // Tầng 2 là câu INSERT ... WHERE NOT EXISTS bên dưới — hai người bấm cùng
            // lúc thì tầng 1 cùng nói "chưa có", chỉ tầng 2 mới chặn được.
            using (var hoi = new SqlCommand(
                "SELECT COUNT(*) FROM HOA_DON WHERE ma_hd = @m", c))
            {
                hoi.Parameters.AddWithValue("@m", maHd);
                if (Convert.ToInt32(await hoi.ExecuteScalarAsync()) > 0)
                    return new KetQua(false, maHd, 0,
                        $"Tờ khai hải quan kỳ {thang}/{nam} ĐÃ có trong sổ ({maHd}) "
                      + "— không ghi lại để khỏi cộng hai lần");
            }

            using var tx = c.BeginTransaction();
            try
            {
                // ---- HOA_DON: một dòng tổng cho cả kỳ ----
                // ngay = ngày cuối kỳ: tờ khai hải quan rải khắp tháng, gộp lại thì
                // không còn "ngày" của riêng cái nào. Lấy ngày cuối tháng để nó luôn
                // rơi đúng kỳ kê khai dù mở sổ ngày nào.
                var ngayCuoiKy = new DateTime(nam, thang, DateTime.DaysInMonth(nam, thang));

                using (var ins = new SqlCommand(@"
                    INSERT INTO HOA_DON
                        (ma_hd, ngay, thang, ngay_nh, khhd, so_hd, mst, ten_kh,
                         tien_vat, vat, ghi_no, ghi_co, ghi_chu, tthai_hd, created_by)
                    SELECT @m, @ngay, @thang, @ngay, @khhd, @so_hd, @mst, @ten,
                           @vat_tien, NULL, @ghi_no, @ghi_co, @ghi_chu, @tthai, @u
                    WHERE NOT EXISTS (SELECT 1 FROM HOA_DON WHERE ma_hd = @m)",
                    c, tx))
                {
                    var p = ins.Parameters;
                    p.AddWithValue("@m", maHd);
                    p.AddWithValue("@ngay", ngayCuoiKy);
                    p.AddWithValue("@thang", thang);
                    // Tờ khai hải quan KHÔNG có ký hiệu/số hóa đơn. Để trống thì lưới
                    // hiện ô rỗng khó nhận ra; ghi rõ "TKHQ" + số tờ khai đại diện.
                    p.AddWithValue("@khhd", "TKHQ");
                    p.AddWithValue("@so_hd",
                        hq.SoToKhai == 1 ? hq.Dong[0].SoToKhai : $"{hq.SoToKhai} tờ khai");
                    // Bên bán là cơ quan hải quan, không phải nhà cung cấp — để trống
                    // MST thay vì bịa, nhưng ten_kh phải nói rõ đây là gì.
                    p.AddWithValue("@mst", DBNull.Value);
                    p.AddWithValue("@ten", $"Thuế GTGT hàng nhập khẩu — tờ khai hải quan "
                                         + $"kỳ {thang}/{nam}");
                    p.AddWithValue("@vat_tien", hq.TongTienThue);
                    // 1331 = thuế GTGT được khấu trừ, 3331 = thuế GTGT phải nộp.
                    p.AddWithValue("@ghi_no", "1331");
                    p.AddWithValue("@ghi_co", "3331");
                    p.AddWithValue("@ghi_chu",
                        $"TKHQ - gộp {hq.SoToKhai} tờ khai hải quan, "
                      + $"trị giá {hq.TongTriGia:N0}đ");
                    p.AddWithValue("@tthai", "Tờ khai hải quan");
                    p.AddWithValue("@u", nguoiDung);

                    if (await ins.ExecuteNonQueryAsync() == 0)
                    {
                        tx.Rollback();
                        return new KetQua(false, maHd, 0,
                            $"Tờ khai hải quan kỳ {thang}/{nam} vừa được người khác ghi "
                          + "— không ghi lại");
                    }
                }

                // ---- HOA_DON_LINE: mỗi khối thuế đọc được một dòng ----
                // Giữ chi tiết từng khối thay vì gộp một dòng: mỗi khối một thuế suất
                // khác nhau, gộp lại thì PhanBo() không biết xếp vào nhóm nào.
                int stt = 0;
                foreach (var d in hq.Dong)
                {
                    stt++;
                    using var insL = new SqlCommand(@"
                        INSERT INTO HOA_DON_LINE
                            (ma_hd, stt_line, ten_hang_goc, dvt, so_luong, don_gia,
                             pt_vat, tien_vat_l, tinh_chat, ghi_no, ghi_co,
                             loai_thue, ghi_chu, created_by)
                        VALUES (@m, @stt, @ten, @dvt, 1, @dg,
                                @pt_vat, @vat_l, '1', @ghi_no, @ghi_co,
                                @loai, @ghi_chu, @u)", c, tx);
                    var p = insL.Parameters;
                    p.AddWithValue("@m", maHd);
                    p.AddWithValue("@stt", stt);
                    p.AddWithValue("@ten",
                        $"Thuế GTGT hàng nhập khẩu — tờ khai {d.SoToKhai}");
                    p.AddWithValue("@dvt", "Tờ khai");
                    // so_luong = 1, don_gia = trị giá tính thuế: PhanBo() tính doanh thu
                    // bằng SL × ĐG nên phải để trị giá vào đơn giá thì mới cộng đúng.
                    p.AddWithValue("@dg", d.TriGia);
                    p.AddWithValue("@pt_vat", PhanTramTu(d.ThueSuat));
                    p.AddWithValue("@vat_l", d.TienThue);
                    p.AddWithValue("@ghi_no", "1331");
                    p.AddWithValue("@ghi_co", "3331");
                    p.AddWithValue("@loai", "TKHQ");
                    p.AddWithValue("@ghi_chu",
                        $"{d.File} · đăng ký {d.NgayDangKy}");
                    p.AddWithValue("@u", nguoiDung);
                    await insL.ExecuteNonQueryAsync();
                }

                tx.Commit();
                _log.LogInformation(
                    "Ghi tờ khai hải quan vào sổ {Ma}: {SoTk} tờ khai, thuế {Thue}",
                    maHd, hq.SoToKhai, hq.TongTienThue);

                return new KetQua(true, maHd, stt,
                    $"Đã ghi {hq.SoToKhai} tờ khai hải quan vào sổ "
                  + $"({hq.TongTienThue:N0}đ thuế) — lập lại tờ khai để lấy số");
            }
            catch
            {
                // Ghi HOA_DON xong mà LINE hỏng giữa chừng thì sổ có hóa đơn rỗng ruột,
                // mà lần sau chạy lại bị chặn trùng nên KHÔNG BAO GIỜ ghi được dòng
                // hàng nữa. Rollback cả cụm.
                tx.Rollback();
                throw;
            }
        }

        /// <summary>
        /// "8%" -> 8. Tờ khai hải quan ghi thuế suất dạng chuỗi như trên file Excel.
        /// Đọc không ra thì trả 0 — thà để 0 rồi lệch có cảnh báo, còn hơn đoán bừa
        /// một mức thuế rồi số vào sổ sai mà không ai biết.
        /// </summary>
        private static int PhanTramTu(string? ts)
        {
            var s = (ts ?? "").Replace("%", "").Trim();
            return int.TryParse(s, out var v) && v is >= 0 and <= 100 ? v : 0;
        }
    }
}
