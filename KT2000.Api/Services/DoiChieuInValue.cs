using Microsoft.Data.SqlClient;

namespace KT2000.Api.Services
{
    /// <summary>
    /// Đọc BẢN GỐC bảng kê (IN_VALUE / IN_VALUE_LINE) rồi đối chiếu với sổ (HOA_DON),
    /// phục vụ màn lập tờ khai.
    ///
    /// VÌ SAO CẦN: tờ khai lập tự động chỉ tính từ HOA_DON. Nhưng IN_VALUE_LINE mới là
    /// bản chép nguyên si của file Excel bảng kê do cổng thuế phát ra — hóa đơn nào cổng
    /// có mà sổ chưa có (file XML tải hỏng, hoặc hóa đơn bị đá ra vì lệch Σ) thì tờ khai
    /// thiếu đúng phần đó mà không có gì báo.
    ///
    /// CHỈ ĐỌC, KHÔNG tự cộng vào chỉ tiêu — cùng luật với ToKhaiHaiQuanService:
    /// kế toán xem chênh lệch rồi TỰ QUYẾT nạp nốt hóa đơn hay bỏ qua. Tự cộng thì số
    /// trên tờ khai đã nộp khác số trong sổ, mà sổ mới là thứ đi đối chiếu về sau.
    ///
    /// IN_VALUE nằm trong database ĐƠN VỊ-NĂM, cùng chỗ với HOA_DON — không phải Base.
    /// </summary>
    public class DoiChieuInValue
    {
        private readonly TenantDbResolver _resolver;
        private readonly VaCauTrucService _va;

        public DoiChieuInValue(TenantDbResolver resolver, VaCauTrucService va)
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
                    $"Đơn vị {code} chưa có sổ của năm {year}.");
            }
        }

        /// <summary>
        /// So bảng kê với sổ cho MỘT kỳ. Trả về tổng hai bên + danh sách hóa đơn lệch.
        ///
        /// Khớp theo (khhd, so_hd, mst) — cùng bộ khóa mà DoiChieuService dùng lúc ghi,
        /// nên hai bên chắc chắn hiểu nhau. so_hd của cả hai bảng đều đã chuẩn hóa 7 chữ
        /// số từ lúc nạp; so chuỗi thẳng là đủ.
        /// </summary>
        public async Task<Models.DoiChieuBangKeDto> SoVoiSo(
            string code, int year, int thang, bool khaiQuy)
        {
            var kq = new Models.DoiChieuBangKeDto { Thang = thang };

            using var c = await MoAsync(code, year);

            // Bảng chưa dựng (database đời đầu) thì trả rỗng, KHÔNG ném: màn tờ khai vẫn
            // phải lập được, chỉ là không có gì để đối chiếu.
            using (var hoi = new SqlCommand(
                "SELECT CASE WHEN OBJECT_ID('IN_VALUE') IS NOT NULL "
              + "        AND OBJECT_ID('IN_VALUE_LINE') IS NOT NULL "
              + "       THEN 1 ELSE 0 END", c))
            {
                if (Convert.ToInt32(await hoi.ExecuteScalarAsync()) == 0)
                {
                    kq.ChuaCoBang = true;
                    return kq;
                }
            }

            // Kỳ kê khai: khai QUÝ thì một dòng IN_VALUE gom cả quý (xem khuôn gom ở
            // DoiChieuService), nên phải lấy đúng tháng CUỐI QUÝ làm mã kỳ.
            int kyKeKhai = khaiQuy ? (thang + 2) / 3 * 3 : thang;

            const string SQL = @"
                WITH bk AS (
                    SELECT v.loai_ct,
                           ISNULL(l.khhd, '')  AS khhd,
                           ISNULL(l.so_hd, '') AS so_hd,
                           ISNULL(l.mst, '')   AS mst,
                           MAX(ISNULL(l.ten_kh, '')) AS ten_kh,
                           MAX(l.ngay)               AS ngay,
                           SUM(ISNULL(l.value1, 0))  AS tien_hang,
                           SUM(ISNULL(l.tax, 0))     AS tien_vat
                      FROM IN_VALUE v
                      JOIN IN_VALUE_LINE l ON l.ma_input = v.ma_input
                     WHERE v.thang = @ky
                     GROUP BY v.loai_ct, ISNULL(l.khhd,''), ISNULL(l.so_hd,''),
                              ISNULL(l.mst,'')
                ),
                so AS (
                    SELECT h.huong,
                           ISNULL(h.khhd, '')  AS khhd,
                           ISNULL(h.so_hd, '') AS so_hd,
                           ISNULL(h.mst, '')   AS mst
                      FROM HOA_DON h
                     WHERE h.thang = @thang
                )
                SELECT bk.loai_ct, bk.khhd, bk.so_hd, bk.mst, bk.ten_kh, bk.ngay,
                       bk.tien_hang, bk.tien_vat,
                       CASE WHEN so.khhd IS NULL THEN 0 ELSE 1 END AS co_trong_so
                  FROM bk
                  LEFT JOIN so
                    ON so.khhd = bk.khhd AND so.so_hd = bk.so_hd AND so.mst = bk.mst
                   AND so.huong = CASE WHEN bk.loai_ct = 'V' THEN 'VAO' ELSE 'RA' END
                 ORDER BY bk.loai_ct, bk.ngay, bk.so_hd";

            using var cmd = new SqlCommand(SQL, c);
            cmd.Parameters.AddWithValue("@ky", kyKeKhai);
            cmd.Parameters.AddWithValue("@thang", thang);

            using var r = await cmd.ExecuteReaderAsync();
            while (await r.ReadAsync())
            {
                bool laVao = r.GetString(0) == "V";
                var dong = new Models.DongBangKeDto
                {
                    Huong = laVao ? "VAO" : "RA",
                    Khhd = r.GetString(1),
                    SoHd = r.GetString(2),
                    Mst = r.GetString(3),
                    TenKh = r.GetString(4),
                    Ngay = r.IsDBNull(5) ? null : r.GetDateTime(5),
                    TienHang = r.GetDecimal(6),
                    TienVat = r.GetDecimal(7),
                    CoTrongSo = r.GetInt32(8) == 1,
                };

                if (laVao)
                {
                    kq.BangKeVao += dong.TienHang;
                    kq.BangKeVatVao += dong.TienVat;
                }
                else
                {
                    kq.BangKeRa += dong.TienHang;
                    kq.BangKeVatRa += dong.TienVat;
                }

                // CHỈ trả về dòng LỆCH. Kỳ vài trăm hóa đơn mà đổ hết về thì màn phải
                // lọc lại, trong khi thứ kế toán cần là đúng mấy dòng chưa lên sổ.
                if (!dong.CoTrongSo) kq.ChuaLenSo.Add(dong);
            }

            return kq;
        }
    }
}
