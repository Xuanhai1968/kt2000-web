using Microsoft.Data.SqlClient;
using System.Text;

// GhiChuHdLienQuan.cs — ĐÁNH DẤU hóa đơn THAY THẾ / ĐIỀU CHỈNH KHÁC KỲ.
//
// Spec: docs/THUE/TOKHAI/SPEC-TO-KHAI-01-GTGT.md §10.4 trường hợp 2 (BR-TK-20).
//
// Vì sao TÁCH KHỎI ToKhai.cs: cả file ToKhai.cs mang luật "TUYỆT ĐỐI KHÔNG GHI".
// Việc này thì NGƯỢC LẠI — nó ghi vào HOA_DON.ghi_chu. Trộn vào đó là sớm muộn có
// người chép nhầm một câu UPDATE sang nhánh chỉ-đọc.
//
// Hóa đơn thay thế/điều chỉnh mà GỐC thuộc kỳ khác thì engine KHÔNG kê vào kỳ này
// (BR-TK-06b) — đúng như bản thật của cổng. Nhưng "không kê" mà im lặng thì kế toán
// không biết còn khoản nào treo; ghi chú lại là để sau này truy được và kê bổ sung
// kỳ gốc khi đã đủ dữ liệu.

namespace KT2000.Api.Services
{
    public class GhiChuHdLienQuan
    {
        private readonly TenantDbResolver _resolver;
        private readonly IConfiguration _config;

        public GhiChuHdLienQuan(TenantDbResolver resolver, IConfiguration config)
        {
            _resolver = resolver;
            _config = config;
        }

        /// <summary>Một hóa đơn liên quan KHÁC KỲ đã đánh dấu.</summary>
        public sealed class DongLienQuan
        {
            public string MaDonVi { get; set; } = "";
            public string Huong { get; set; } = "";
            public string Khhd { get; set; } = "";
            public string SoHd { get; set; } = "";
            public DateTime? Ngay { get; set; }
            public string TenKh { get; set; } = "";
            public string LoaiXuLy { get; set; } = "";     // Thay thế / Điều chỉnh
            public string KhhdGoc { get; set; } = "";
            public string SoHdGoc { get; set; } = "";
            public DateTime? NgayGoc { get; set; }
            public int ThangGoc { get; set; }
            public int NamGoc { get; set; }
            public decimal TienHang { get; set; }
            public decimal TienVat { get; set; }
            public string GhiChuMoi { get; set; } = "";
            public bool DaCoGhiChu { get; set; }           // đã đánh dấu từ lượt trước
        }

        public sealed class KetQua
        {
            public int SoDonVi { get; set; }
            public int SoHoaDon { get; set; }
            public int SoDaGhi { get; set; }
            public int SoBoQua { get; set; }               // đã có ghi chú, không ghi lại
            public string? DuongDanFile { get; set; }
            public List<DongLienQuan> Dong { get; set; } = new();
            public List<string> Loi { get; set; } = new();
        }

        // tich_chat_hd_lienquan: '1' = thay thế, '2' = điều chỉnh (đo thật 15/08 trên
        // NHAT_TUAN, DAT_VIET_THANH, THAI_TUAN, HUY_THANH). Giá trị khác thì chưa gặp
        // nên để nguyên văn, KHÔNG đoán — ghi ra file cho người xem tự quyết.
        private static string TenLoai(string? tc) => tc switch
        {
            "1" => "Thay thế",
            "2" => "Điều chỉnh",
            _   => $"Liên quan (mã {tc})",
        };

        // Dấu hiệu ghi chú do CHÍNH hàm này sinh ra. Có nó thì lượt sau bỏ qua, nhờ
        // vậy bấm nhầm hai lần không nhân đôi ghi chú (spec §10.6).
        private const string DauHieu = "[TK-LQ]";

        private const string SqlTim = @"
            SELECT h.ma_hd, h.huong, ISNULL(h.khhd,''), ISNULL(h.so_hd,''), h.ngay,
                   ISNULL(h.ten_kh,''), ISNULL(h.tich_chat_hd_lienquan,''),
                   ISNULL(h.khhd_lienquan,''), ISNULL(h.sohd_lienquan,''),
                   h.ngay_lienquan,
                   CAST(ISNULL(l.tien_hang,0) AS DECIMAL(18,2)),
                   CAST(ISNULL(h.tien_vat,0)  AS DECIMAL(18,2)),
                   ISNULL(h.ghi_chu,'')
              FROM HOA_DON h
              OUTER APPLY (
                    SELECT SUM(CASE WHEN ISNULL(x.tinh_chat,'1') = '3' THEN 0
                                    ELSE ISNULL(x.so_luong,0) * ISNULL(x.don_gia,0)
                               END) AS tien_hang
                      FROM HOA_DON_LINE x WHERE x.ma_hd = h.ma_hd
              ) l
             WHERE h.thang = @thang
               AND ISNULL(h.tich_chat_hd_lienquan,'') <> ''
               AND h.ngay_lienquan IS NOT NULL
               -- KHÁC KỲ: gốc thuộc tháng/năm khác kỳ đang xét
               AND (MONTH(h.ngay_lienquan) <> @thang OR YEAR(h.ngay_lienquan) <> @nam)
             ORDER BY h.huong, h.so_hd";

        /// <summary>
        /// Quét MỘT đơn vị-kỳ, ghi chú vào HOA_DON.ghi_chu cho hóa đơn liên quan khác kỳ.
        /// </summary>
        /// <param name="chiXem">true = chỉ liệt kê, KHÔNG ghi (xem trước).</param>
        public async Task<KetQua> QuetVaGhi(
            string maDonVi, int nam, int thang, string nguoiGhi,
            bool chiXem, CancellationToken huy = default)
        {
            var kq = new KetQua();
            var ds = new List<DongLienQuan>();
            var maHd = new List<(string Ma, string GhiChu, string Moi)>();

            using var conn = new SqlConnection(_resolver.GetTenantConnection(maDonVi, nam));
            await conn.OpenAsync(huy);

            using (var cmd = new SqlCommand(SqlTim, conn))
            {
                cmd.Parameters.AddWithValue("@thang", thang);
                cmd.Parameters.AddWithValue("@nam", nam);
                using var r = await cmd.ExecuteReaderAsync(huy);
                while (await r.ReadAsync(huy))
                {
                    var ngayGoc = r.IsDBNull(9) ? (DateTime?)null : r.GetDateTime(9);
                    var loai = TenLoai(r.GetString(6));
                    var ghiChuCu = r.GetString(12);

                    var d = new DongLienQuan
                    {
                        MaDonVi = maDonVi,
                        Huong = r.IsDBNull(1) ? "" : r.GetString(1),
                        Khhd = r.GetString(2),
                        SoHd = r.GetString(3),
                        Ngay = r.IsDBNull(4) ? null : r.GetDateTime(4),
                        TenKh = r.GetString(5),
                        LoaiXuLy = loai,
                        KhhdGoc = r.GetString(7),
                        SoHdGoc = r.GetString(8),
                        NgayGoc = ngayGoc,
                        ThangGoc = ngayGoc?.Month ?? 0,
                        NamGoc = ngayGoc?.Year ?? 0,
                        TienHang = r.GetDecimal(10),
                        TienVat = r.GetDecimal(11),
                        DaCoGhiChu = ghiChuCu.Contains(DauHieu, StringComparison.Ordinal),
                    };

                    // Đủ BỐN thông tin bắt buộc của spec §10.4: loại xử lý, trỏ tới HĐ
                    // nào, kỳ của hóa đơn gốc, và trạng thái đã kê khai lại chưa.
                    d.GhiChuMoi =
                        $"{DauHieu} {loai} cho HĐ {d.KhhdGoc}/{d.SoHdGoc} "
                      + $"ngày {ngayGoc:dd/MM/yyyy} — khác kỳ (gốc thuộc kỳ "
                      + $"{d.ThangGoc:00}/{d.NamGoc}, xử lý tại kỳ {thang:00}/{nam}) "
                      + "— Chưa kê khai lại";

                    ds.Add(d);
                    if (!d.DaCoGhiChu)
                        maHd.Add((r.GetString(0), ghiChuCu, d.GhiChuMoi));
                }
            }

            kq.Dong = ds;
            kq.SoHoaDon = ds.Count;
            kq.SoBoQua = ds.Count(x => x.DaCoGhiChu);

            if (chiXem || maHd.Count == 0) return kq;

            // ---------- GHI: NỐI THÊM, không đè (luật 5 + spec §10.6) ----------
            // Gói transaction: nửa chừng đứt thì không để lại một mớ ghi chú dở dang.
            using var tran = conn.BeginTransaction();
            try
            {
                foreach (var (ma, cu, moi) in maHd)
                {
                    huy.ThrowIfCancellationRequested();

                    // Cột ghi_chu rộng 1000. Nối mà tràn thì SQL cắt cụt ÂM THẦM, mất
                    // cả phần cũ lẫn phần mới — nên phải tự kiểm trước khi ghi.
                    var gop = string.IsNullOrWhiteSpace(cu) ? moi : $"{cu} | {moi}";
                    if (gop.Length > 1000)
                    {
                        kq.Loi.Add($"{ma}: ghi chú cũ quá dài ({cu.Length} ký tự), "
                                 + "nối thêm sẽ vượt 1000 — BỎ QUA để không mất nội dung cũ");
                        continue;
                    }

                    using var up = new SqlCommand(
                        @"UPDATE HOA_DON
                             SET ghi_chu = @gc, updated_by = @nguoi, updated_at = SYSDATETIME()
                           WHERE ma_hd = @ma", conn, tran);
                    up.Parameters.AddWithValue("@gc", gop);
                    up.Parameters.AddWithValue("@nguoi", nguoiGhi);
                    up.Parameters.AddWithValue("@ma", ma);
                    kq.SoDaGhi += await up.ExecuteNonQueryAsync(huy);
                }
                tran.Commit();
            }
            catch
            {
                tran.Rollback();
                throw;
            }

            return kq;
        }

        /// <summary>
        /// Quét NHIỀU đơn vị rồi xuất MỘT file .txt tổng hợp ra Paths:JobsRoot.
        /// </summary>
        /// <remarks>
        /// Một đơn vị hỏng (chưa mở sổ năm đó, thiếu bảng…) thì ghi vào phần Lỗi rồi
        /// chạy tiếp — dừng cả mẻ vì một đơn vị là phải chạy lại từ đầu.
        /// </remarks>
        public async Task<KetQua> QuetNhieuDonVi(
            IEnumerable<string> maDonVis, int nam, int thang, string nguoiGhi,
            bool chiXem, CancellationToken huy = default)
        {
            var gop = new KetQua();
            foreach (var ma in maDonVis)
            {
                huy.ThrowIfCancellationRequested();
                try
                {
                    var r = await QuetVaGhi(ma, nam, thang, nguoiGhi, chiXem, huy);
                    gop.SoDonVi++;
                    gop.SoHoaDon += r.SoHoaDon;
                    gop.SoDaGhi += r.SoDaGhi;
                    gop.SoBoQua += r.SoBoQua;
                    gop.Dong.AddRange(r.Dong);
                    gop.Loi.AddRange(r.Loi);
                }
                catch (Exception ex)
                {
                    gop.Loi.Add($"{ma}: {ex.Message}");
                }
            }

            gop.DuongDanFile = await XuatFile(gop, nam, thang, nguoiGhi, huy);
            return gop;
        }

        /// <summary>
        /// Ghi file tổng hợp .txt ra Paths:JobsRoot. Trả về đường dẫn đã ghi.
        /// </summary>
        /// <remarks>
        /// UTF-8 CÓ BOM: Notepad của Windows đọc file không BOM thành mojibake với
        /// tiếng Việt. File này sinh ra để người ta mở bằng Notepad mà đọc.
        ///
        /// Tên file kèm kỳ, KHÔNG kèm giờ: chạy lại cùng một kỳ thì ĐÈ chính nó, thay
        /// vì rải ra chục file gần giống nhau không biết cái nào mới.
        /// </remarks>
        private async Task<string?> XuatFile(
            KetQua kq, int nam, int thang, string nguoiGhi, CancellationToken huy)
        {
            var goc = _config["Paths:JobsRoot"];
            if (string.IsNullOrWhiteSpace(goc))
            {
                kq.Loi.Add("Chưa khai Paths:JobsRoot — không xuất được file tổng hợp");
                return null;
            }

            var thuMuc = Path.Combine(goc, "TO_KHAI_LIEN_QUAN");
            Directory.CreateDirectory(thuMuc);
            var duong = Path.Combine(thuMuc, $"HD_LIEN_QUAN_KHAC_KY_T{thang}_{nam}.txt");

            var sb = new StringBuilder();
            sb.AppendLine("TỔNG HỢP HÓA ĐƠN THAY THẾ / ĐIỀU CHỈNH KHÁC KỲ");
            sb.AppendLine($"Kỳ kê khai : tháng {thang:00}/{nam}");
            sb.AppendLine($"Người chạy : {nguoiGhi}");
            sb.AppendLine($"Lập lúc    : {DateTime.Now:dd/MM/yyyy HH:mm:ss}");
            sb.AppendLine(new string('=', 100));
            sb.AppendLine();
            sb.AppendLine("Ý NGHĨA: các hóa đơn dưới đây là hóa đơn thay thế/điều chỉnh mà HÓA ĐƠN GỐC");
            sb.AppendLine("thuộc kỳ KHÁC. Engine KHÔNG kê chúng vào tờ khai kỳ này (BR-TK-06b) — đúng như");
            sb.AppendLine("bản tờ khai cổng TCT trả về. Kỳ GỐC chưa được khai bổ sung tự động; kế toán");
            sb.AppendLine("phải tự kiểm và kê khai lại kỳ đó khi đã đủ dữ liệu (spec §10.4 trường hợp 2).");
            sb.AppendLine();
            sb.AppendLine($"Tổng: {kq.SoDonVi} đơn vị · {kq.SoHoaDon} hóa đơn "
                        + $"· đã ghi chú {kq.SoDaGhi} · bỏ qua {kq.SoBoQua} (đã đánh dấu từ trước)");
            sb.AppendLine();

            foreach (var nhom in kq.Dong.GroupBy(d => d.MaDonVi).OrderBy(g => g.Key))
            {
                sb.AppendLine(new string('-', 100));
                sb.AppendLine($"ĐƠN VỊ: {nhom.Key}   ({nhom.Count()} hóa đơn)");
                sb.AppendLine(new string('-', 100));

                foreach (var d in nhom.OrderBy(x => x.Huong).ThenBy(x => x.SoHd))
                {
                    sb.AppendLine(
                        $"  {(d.Huong == "RA" ? "BÁN RA" : "MUA VÀO"),-8} "
                      + $"{d.Khhd}/{d.SoHd}  ngày {d.Ngay:dd/MM/yyyy}");
                    sb.AppendLine($"      Đối tác   : {d.TenKh}");
                    sb.AppendLine($"      Loại      : {d.LoaiXuLy}");
                    sb.AppendLine($"      HĐ gốc    : {d.KhhdGoc}/{d.SoHdGoc} "
                                + $"ngày {d.NgayGoc:dd/MM/yyyy}  ⇒ KỲ GỐC {d.ThangGoc:00}/{d.NamGoc}");
                    sb.AppendLine($"      Tiền hàng : {d.TienHang,20:N0}");
                    sb.AppendLine($"      Tiền VAT  : {d.TienVat,20:N0}");
                    sb.AppendLine($"      Trạng thái: {(d.DaCoGhiChu ? "đã đánh dấu từ lượt trước" : "vừa đánh dấu")}"
                                + " — CHƯA kê khai lại kỳ gốc");
                    sb.AppendLine();
                }

                sb.AppendLine($"      Cộng đơn vị: tiền hàng {nhom.Sum(x => x.TienHang),20:N0}"
                            + $"   VAT {nhom.Sum(x => x.TienVat),18:N0}");
                sb.AppendLine();
            }

            if (kq.Dong.Count == 0)
                sb.AppendLine("(Không có hóa đơn thay thế/điều chỉnh khác kỳ nào trong kỳ này)");

            if (kq.Loi.Count > 0)
            {
                sb.AppendLine();
                sb.AppendLine(new string('=', 100));
                sb.AppendLine("LỖI / BỎ QUA:");
                foreach (var l in kq.Loi) sb.AppendLine($"  - {l}");
            }

            await File.WriteAllTextAsync(duong, sb.ToString(),
                                         new UTF8Encoding(true), huy);
            return duong;
        }
    }
}
