using Microsoft.Data.SqlClient;

namespace KT2000.Api.Services
{
    // Ghi BẢN GỐC TCT vào IN_VALUE / IN_VALUE_LINE — bản chép nguyên si của file Excel
    // danh sách, để sau này đối chiếu với những gì đã lên sổ (HOA_DON).
    //
    // VÌ SAO tách khỏi ImportService: hai bảng này KHÔNG phải sổ kế toán. Chúng là bản
    // sao của cái cổng thuế nói, giữ nguyên kể cả khi hóa đơn bị đá ra khỏi HOA_DON vì
    // lệch Σ. Trộn vào luồng ghi sổ là sớm muộn có người "sửa cho khớp" — mà khớp sẵn
    // thì đối chiếu chẳng còn nghĩa gì.
    //
    // KHUÔN GOM (chốt Trường 15/08):
    //   • Một dòng IN_VALUE = một KỲ KÊ KHAI × một HƯỚNG.
    //     Hòa Sang khai quý, nạp tháng 1 → chưa có kỳ tháng 3 → tạo IP1 (V), IP2 (R).
    //     Nạp tiếp tháng 2 → kỳ tháng 3 đã có → KHÔNG tạo mã mới, line vẫn vào IP1/IP2.
    //     Khai tháng thì mỗi tháng một mã.
    //   • loai_ct tách V/R, không gộp — gộp thì tổng tiền hai chiều lẫn nhau.
    //   • input_from luôn 'TO_KHAI'. Mấy mã TCT_CM/TCT_KM/TCT_MTT trong ghi chú schema
    //     chỉ là mô tả, không dùng.
    //   • Nạp lại một tháng thì dòng cũ bị THAY bằng bản mới, không đẻ thêm dòng.
    //     Bản đầu chỉ-thêm-không-sửa để khỏi đè cột checked/ghi_chu của kế toán; Trường
    //     bỏ vì hiện chưa ai ghi chú vào bảng này, mà đổi lại thì bảng đứng im khi cổng
    //     sửa số — "bản gốc" hóa ra là bản gốc của lần nạp đầu chứ không phải của cổng.
    public class DoiChieuService
    {
        public const string NGUON = "TO_KHAI";

        // Một dòng của file Excel danh sách, đã đọc xong và chuẩn hóa.
        // SoHd phải là bản ĐÃ chuẩn hóa 7 chữ số (ImportService.ChuanSoHd) — nếu không,
        // lần nạp sau đệm khác đi là cùng một hóa đơn hóa thành hai dòng.
        // TthaiHd: cột "Trạng thái hóa đơn" của file Excel danh sách — 'Hóa đơn mới',
        // 'Hóa đơn đã bị thay thế', 'Hóa đơn điều chỉnh'… Vào thẳng ghi_chu_m; chữ
        // 'Hóa đơn mới' trong ghi chú schema chính là giá trị của cột này (Trường phát
        // hiện 15/08 — trước đó tưởng là nhãn tự đặt nên để trống).
        public sealed record DongGoc(
            string Khhd, string SoHd, DateTime Ngay, string Mst, string TenKh,
            decimal Value1, decimal Tax, decimal Ck, string? MaHd, string TthaiHd);

        private readonly ILogger<DoiChieuService> _log;
        public DoiChieuService(ILogger<DoiChieuService> log) => _log = log;

        public sealed record KetQua(int Them, int Sua);

        /// <summary>
        /// Ghi các dòng gốc vào IN_VALUE / IN_VALUE_LINE. Trả về số dòng thêm mới và số
        /// dòng bị thay.
        /// Dòng đã có thì THAY BẰNG BẢN MỚI (chốt Trường 15/08) — cổng thuế sửa lại số
        /// tiền một hóa đơn thì bảng này phải theo, không thì "bản gốc" là bản gốc của
        /// lần nạp đầu chứ không phải của cổng.
        /// Số cũ không mất: value1/tax trước khi thay được cất sang old_value/old_vat.
        /// </summary>
        public KetQua Ghi(SqlConnection c, string huong, bool khaiQuy,
                          IReadOnlyList<DongGoc> dong, string user)
        {
            if (dong.Count == 0) return new KetQua(0, 0);
            string loaiCt = huong.Equals("RA", StringComparison.OrdinalIgnoreCase) ? "R" : "V";
            int themMoi = 0, daSua = 0;

            // Gom theo THÁNG KÊ KHAI, dùng đúng hàm mà HOA_DON.thang dùng — hai bảng phải
            // hiểu "tháng" giống hệt nhau, không thì đối chiếu lệch nguyên một kỳ.
            foreach (var nhom in dong.GroupBy(x => ImportService.ThangKeKhai(x.Ngay.Month, khaiQuy)))
            {
                using var tx = c.BeginTransaction();
                try
                {
                    string maInput = LayHoacTaoMaInput(c, tx, nhom.Key, loaiCt, khaiQuy, user);
                    var kq = ThemHoacThayLine(c, tx, maInput, nhom.ToList(), user);
                    themMoi += kq.Them; daSua += kq.Sua;
                    CongLaiTong(c, tx, maInput, user);
                    tx.Commit();
                }
                catch (Exception ex)
                {
                    tx.Rollback();
                    // KHÔNG ném ra ngoài: đây là bảng đối chiếu, không phải sổ. Hỏng chỗ này
                    // mà chặn cả job nạp là đánh đổi sai hướng — hóa đơn mới là thứ phải vào.
                    _log.LogError(ex, "Không ghi được đối chiếu {Huong} kỳ {Thang}", huong, nhom.Key);
                }
            }
            return new KetQua(themMoi, daSua);
        }

        // Khóa nhận dạng một hóa đơn trong bảng đối chiếu. Không dùng ma_hd vì dòng bị đá
        // ra khỏi HOA_DON (lệch Σ) vẫn phải vào đây, mà loại đó thì ma_hd rỗng.
        private static string Khoa(string khhd, string soHd, string mst)
            => $"{khhd}|{soHd}|{mst}".ToUpperInvariant();

        private static string LayHoacTaoMaInput(SqlConnection c, SqlTransaction tx,
                                                int thang, string loaiCt, bool khaiQuy, string user)
        {
            using (var tim = new SqlCommand(
                "SELECT ma_input FROM IN_VALUE WHERE thang=@t AND loai_ct=@lc", c, tx))
            {
                tim.Parameters.AddWithValue("@t", thang);
                tim.Parameters.AddWithValue("@lc", loaiCt);
                if (tim.ExecuteScalar() is string cu && cu.Length > 0) return cu;
            }

            // Cấp mã mới. Khóa theo cả bảng chứ không theo kỳ: hai tiến trình nạp hai kỳ
            // khác nhau vẫn tranh nhau ĐÚNG một con số MAX, và cả hai sẽ ra cùng một mã.
            using (var khoa = new SqlCommand(
                @"EXEC sp_getapplock @Resource='cap_ma_input', @LockMode='Exclusive',
                                     @LockOwner='Transaction', @LockTimeout=15000", c, tx))
                khoa.ExecuteNonQuery();

            // Đọc lại sau khi có khóa — tiến trình kia có thể vừa tạo xong kỳ này.
            using (var tim2 = new SqlCommand(
                "SELECT ma_input FROM IN_VALUE WHERE thang=@t AND loai_ct=@lc", c, tx))
            {
                tim2.Parameters.AddWithValue("@t", thang);
                tim2.Parameters.AddWithValue("@lc", loaiCt);
                if (tim2.ExecuteScalar() is string cu2 && cu2.Length > 0) return cu2;
            }

            int ke;
            using (var max = new SqlCommand(
                @"SELECT ISNULL(MAX(TRY_CAST(SUBSTRING(ma_input, 3, 18) AS INT)), 0)
                  FROM IN_VALUE WHERE ma_input LIKE 'IP[0-9]%'", c, tx))
                ke = Convert.ToInt32(max.ExecuteScalar()) + 1;

            string maMoi = "IP" + ke;
            using (var them = new SqlCommand(
                @"INSERT INTO IN_VALUE (ma_input, thang, loai_ct, input_from, ke_khai, created_by)
                  VALUES (@m, @t, @lc, @nguon, @kk, @u)", c, tx))
            {
                them.Parameters.AddWithValue("@m", maMoi);
                them.Parameters.AddWithValue("@t", thang);
                them.Parameters.AddWithValue("@lc", loaiCt);
                them.Parameters.AddWithValue("@nguon", NGUON);
                them.Parameters.AddWithValue("@kk", khaiQuy ? "Quy" : "Thang");
                them.Parameters.AddWithValue("@u", user);
                them.ExecuteNonQuery();
            }
            return maMoi;
        }

        // Dòng đang nằm trong bảng: cần line_num để UPDATE đúng chỗ, và số tiền + trạng
        // thái cũ để biết có thật sự khác không — bằng nhau thì đừng ghi, khỏi đụng vào cả
        // nghìn dòng chỉ để viết lại đúng cái đang có.
        // PHẢI có GhiChuM ở đây: hóa đơn bị thay thế thì SỐ TIỀN KHÔNG ĐỔI, chỉ mỗi trạng
        // thái đổi từ 'Hóa đơn mới' sang 'Hóa đơn đã bị thay thế'. So thiếu cột này là bỏ
        // qua đúng cái thay đổi đáng giá nhất.
        private sealed record DongCu(string LineNum, decimal Value1, decimal Tax, decimal Ck,
                                     string GhiChuM);

        private static KetQua ThemHoacThayLine(SqlConnection c, SqlTransaction tx, string maInput,
                                               List<DongGoc> dong, string user)
        {
            // Đọc HẾT dòng đã có của kỳ này một lần, thay vì hỏi database từng dòng.
            // Một kỳ cỡ vài trăm dòng nên tập này nhỏ, mà đổi lại là vài trăm lần round-trip.
            var daCo = new Dictionary<string, DongCu>(StringComparer.Ordinal);
            int lineKe = 0;
            using (var doc = new SqlCommand(
                @"SELECT ISNULL(khhd,''), ISNULL(so_hd,''), ISNULL(mst,''),
                         line_num, value1, tax, ck, ISNULL(ghi_chu_m,'')
                  FROM IN_VALUE_LINE WHERE ma_input=@m", c, tx))
            {
                doc.Parameters.AddWithValue("@m", maInput);
                using var r = doc.ExecuteReader();
                while (r.Read())
                {
                    string ln = r.GetString(3);
                    daCo[Khoa(r.GetString(0), r.GetString(1), r.GetString(2))] =
                        new DongCu(ln, r.GetDecimal(4), r.GetDecimal(5), r.GetDecimal(6),
                                   r.GetString(7));
                    // line_num là 'L' + số. Lấy số LỚN NHẤT để đánh tiếp, đừng đếm số dòng —
                    // đếm thì xóa tay một dòng giữa chừng là sinh trùng khóa chính.
                    if (ln.Length > 1 && int.TryParse(ln.AsSpan(1), out int so) && so > lineKe)
                        lineKe = so;
                }
            }

            int stt = lineKe, them = 0, sua = 0;
            using var ins = new SqlCommand(
                @"INSERT INTO IN_VALUE_LINE
                    (ma_input, line_num, stt, khhd, so_hd, ngay, mst, ten_kh,
                     value1, tax, ck, ma_hd, ghi_chu_m, created_by)
                  VALUES (@m, @ln, @stt, @khhd, @so_hd, @ngay, @mst, @ten_kh,
                     @value1, @tax, @ck, @ma_hd, @tthai, @u)", c, tx);
            var p = ins.Parameters;
            p.Add("@m", System.Data.SqlDbType.NVarChar, 20);
            p.Add("@ln", System.Data.SqlDbType.NVarChar, 20);
            p.Add("@stt", System.Data.SqlDbType.Int);
            p.Add("@khhd", System.Data.SqlDbType.NVarChar, 20);
            p.Add("@so_hd", System.Data.SqlDbType.NVarChar, 20);
            p.Add("@ngay", System.Data.SqlDbType.Date);
            p.Add("@mst", System.Data.SqlDbType.NVarChar, 20);
            p.Add("@ten_kh", System.Data.SqlDbType.NVarChar, 500);
            p.Add("@value1", System.Data.SqlDbType.Decimal);
            p.Add("@tax", System.Data.SqlDbType.Decimal);
            p.Add("@ck", System.Data.SqlDbType.Decimal);
            p.Add("@ma_hd", System.Data.SqlDbType.NVarChar, 80);
            p.Add("@tthai", System.Data.SqlDbType.NVarChar, 200);
            p.Add("@u", System.Data.SqlDbType.NVarChar, 50);
            foreach (string ten in new[] { "@value1", "@tax", "@ck" })
            { p[ten].Precision = 18; p[ten].Scale = 2; }

            // Thay bản cũ. old_value/old_vat giữ số TRƯỚC khi thay — hai cột đó có sẵn trong
            // schema đúng để làm việc này, và nhờ vậy vẫn trả lời được "hóa đơn nào bị cổng
            // sửa số" dù dòng hiện tại đã mang số mới.
            using var upd = new SqlCommand(
                @"UPDATE IN_VALUE_LINE
                     SET ngay=@ngay, ten_kh=@ten_kh,
                         -- CASE chứ không gán thẳng: dòng bị sửa vì lý do KHÁC (trạng thái
                         -- đổi, mà số tiền y nguyên) thì đừng đụng vào old_value. Gán thẳng
                         -- là mọi dòng đều mang old_value = value1, và cột đó hết còn nghĩa
                         -- là số trước khi cổng sửa.
                         old_value = CASE WHEN value1 <> @value1 THEN value1 ELSE old_value END,
                         old_vat   = CASE WHEN tax    <> @tax    THEN tax    ELSE old_vat   END,
                         value1=@value1, tax=@tax, ck=@ck, ma_hd=@ma_hd,
                         ghi_chu_m=@tthai
                   WHERE ma_input=@m AND line_num=@ln", c, tx);
            var q = upd.Parameters;
            q.Add("@m", System.Data.SqlDbType.NVarChar, 20);
            q.Add("@ln", System.Data.SqlDbType.NVarChar, 20);
            q.Add("@ngay", System.Data.SqlDbType.Date);
            q.Add("@ten_kh", System.Data.SqlDbType.NVarChar, 500);
            q.Add("@value1", System.Data.SqlDbType.Decimal);
            q.Add("@tax", System.Data.SqlDbType.Decimal);
            q.Add("@ck", System.Data.SqlDbType.Decimal);
            q.Add("@ma_hd", System.Data.SqlDbType.NVarChar, 80);
            q.Add("@tthai", System.Data.SqlDbType.NVarChar, 200);
            foreach (string ten in new[] { "@value1", "@tax", "@ck" })
            { q[ten].Precision = 18; q[ten].Scale = 2; }

            foreach (var d in dong)
            {
                string k = Khoa(d.Khhd, d.SoHd, d.Mst);

                if (daCo.TryGetValue(k, out var cu))
                {
                    // Y hệt thì bỏ qua: nạp lại một tháng không có gì đổi là chuyện thường,
                    // ghi đè cả nghìn dòng bằng đúng cái đang có chỉ tổ mất old_value thật
                    // (nó bị đè bằng chính value1 hiện tại).
                    if (cu.Value1 == d.Value1 && cu.Tax == d.Tax && cu.Ck == d.Ck
                        && cu.GhiChuM == (d.TthaiHd ?? "").Trim()) continue;

                    q["@m"].Value = maInput;
                    q["@ln"].Value = cu.LineNum;
                    q["@ngay"].Value = d.Ngay.Date;
                    q["@ten_kh"].Value = Rong(d.TenKh);
                    q["@value1"].Value = d.Value1;
                    q["@tax"].Value = d.Tax;
                    q["@ck"].Value = d.Ck;
                    q["@ma_hd"].Value = Rong(d.MaHd);
                    q["@tthai"].Value = Rong(d.TthaiHd);
                    upd.ExecuteNonQuery();
                    // Ghi lại giá trị mới vào bộ nhớ: file Excel có hai dòng cùng hóa đơn
                    // thì dòng sau phải so với dòng trước, không thì lần nào cũng "khác".
                    daCo[k] = cu with { Value1 = d.Value1, Tax = d.Tax, Ck = d.Ck,
                                        GhiChuM = (d.TthaiHd ?? "").Trim() };
                    sua++;
                    continue;
                }

                lineKe++; stt++;
                p["@m"].Value = maInput;
                p["@ln"].Value = "L" + lineKe;
                p["@stt"].Value = stt;
                p["@khhd"].Value = Rong(d.Khhd);
                p["@so_hd"].Value = Rong(d.SoHd);
                p["@ngay"].Value = d.Ngay.Date;
                p["@mst"].Value = Rong(d.Mst);
                p["@ten_kh"].Value = Rong(d.TenKh);
                p["@value1"].Value = d.Value1;
                p["@tax"].Value = d.Tax;
                p["@ck"].Value = d.Ck;
                p["@ma_hd"].Value = Rong(d.MaHd);
                p["@tthai"].Value = Rong(d.TthaiHd);
                p["@u"].Value = user;
                ins.ExecuteNonQuery();
                daCo[k] = new DongCu("L" + lineKe, d.Value1, d.Tax, d.Ck,
                                     (d.TthaiHd ?? "").Trim());
                them++;
            }
            return new KetQua(them, sua);
        }

        private static object Rong(string? s)
            => string.IsNullOrWhiteSpace(s) ? DBNull.Value : s.Trim();

        // Cộng LẠI từ line chứ không cộng thêm phần vừa ghi: kỳ đã có sẵn dòng từ lần nạp
        // trước, và cộng dồn thì chỉ cần một lần chạy hụt là tổng sai vĩnh viễn mà không
        // cách nào biết. Cộng lại thì tổng luôn đúng bằng đúng thứ đang nằm trong bảng.
        private static void CongLaiTong(SqlConnection c, SqlTransaction tx,
                                        string maInput, string user)
        {
            using var cmd = new SqlCommand(
                @"UPDATE IN_VALUE
                     SET tong_value = (SELECT ISNULL(SUM(value1), 0) FROM IN_VALUE_LINE
                                        WHERE ma_input = @m),
                         tong_vat   = (SELECT ISNULL(SUM(tax), 0)    FROM IN_VALUE_LINE
                                        WHERE ma_input = @m),
                         updated_by = @u, updated_at = SYSDATETIME()
                   WHERE ma_input = @m", c, tx);
            cmd.Parameters.AddWithValue("@m", maInput);
            cmd.Parameters.AddWithValue("@u", user);
            cmd.ExecuteNonQuery();
        }
    }
}
