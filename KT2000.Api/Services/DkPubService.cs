using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Caching.Memory;

namespace KT2000.Api.Services
{
    // ============ ĐỊNH KHOẢN — DỮ LIỆU HUẤN LUYỆN CHUNG (nhóm C) ============
    //
    // Cửa duy nhất vào database KT2000_PUB (DK_DATA_TRAIN / DK_BLACKLIST / DK_AUDIT_LOG
    // — schema của Leader, commit 127f9408).
    //
    // Vì sao tách hẳn khỏi DinhKhoanService: hai bên nói chuyện với HAI database khác
    // hẳn nhau. DinhKhoanService đọc/ghi SỔ của từng đơn vị-năm; cái này đọc/ghi KHO
    // HỌC dùng chung toàn hệ thống. Gộp một service thì mỗi hàm lại phải tự nhớ mình
    // đang cầm connection nào — đúng loại nhầm lẫn ghi sai database.
    //
    // LUẬT XƯƠNG SỐNG (README_DK_WEB.md mục 2, Hiu 18/08):
    //   Dòng nào cùng tên + cùng hướng + cùng đơn vị mà ĐỔI nhãn so với lần trước là
    //   XUNG ĐỘT. Nó vẫn được lưu, nhưng ở trạng thái CHO_GIAI_THICH và KHÔNG BAO GIỜ
    //   vào model cho tới khi người dùng viết rõ vì sao lần này khác.
    //   Đây là luật chống tự đầu độc: một lần gõ nhầm mà lọt vào Data Training thì model
    //   học luôn cái nhầm đó và nhắc lại mãi mãi.
    public class DkPubService
    {
        private readonly TenantDbResolver _resolver;
        private readonly IMemoryCache _cache;
        private readonly ILogger<DkPubService> _log;

        public DkPubService(TenantDbResolver resolver, IMemoryCache cache,
                            ILogger<DkPubService> log)
        { _resolver = resolver; _cache = cache; _log = log; }

        // ===================== CHUẨN HOÁ TÊN =====================
        //
        // Bản port của dk_core.normalize_for_match. PHẢI khớp từng bước với Python:
        // ten_norm là KHOÁ tra cứu, C# tính một kiểu mà Python tính kiểu khác thì mọi
        // dòng web ghi xuống sẽ không bao giờ tra trúng dòng Python đã ghi.
        //   NFC → thường → thay ký tự điều khiển bằng khoảng trắng → gộp khoảng trắng.
        // ToLowerInvariant chứ KHÔNG ToLower(): máy đặt culture Thổ Nhĩ Kỳ thì 'I'
        // thành 'ı', và cùng một tên hàng ra hai khoá khác nhau tuỳ máy chạy.
        private static readonly Regex RgKyTuDieuKhien =
            new(@"[\x00-\x1F\x7F-\x9F]", RegexOptions.Compiled);
        private static readonly Regex RgKhoangTrang = new(@"\s+", RegexOptions.Compiled);

        public static string ChuanHoaTen(string? s)
        {
            if (string.IsNullOrEmpty(s)) return "";
            string t = s.Normalize(NormalizationForm.FormC).ToLowerInvariant().Trim();
            t = RgKyTuDieuKhien.Replace(t, " ");
            return RgKhoangTrang.Replace(t, " ").Trim();
        }

        // ===================== DANH SÁCH ĐEN =====================

        public sealed record LuatDen(string Loai, string Mau, string? MoTa);

        /// <summary>Kết quả soi một tên qua danh sách đen.</summary>
        /// <param name="Nhan">true = tên dùng được để học.</param>
        /// <param name="Ten">Tên sau khi đã cắt đuôi (TRIM_AFTER), đã chuẩn hoá.</param>
        /// <param name="LyDo">Vì sao bị loại, hoặc luật cắt đã áp.</param>
        public readonly record struct KetQuaLoc(bool Nhan, string Ten, string LyDo);

        // Đọc một lần rồi giữ 5 phút: 31 dòng cấu hình mà mỗi mặt hàng lại đi hỏi
        // database một lần thì chốt 2.000 mặt hàng là 2.000 lượt hỏi cùng một câu.
        // Size = 1 vì MemoryCache của Program.cs có SizeLimit — không đặt là ném ngay.
        public async Task<List<LuatDen>> LayLuatDenAsync(CancellationToken ct)
        {
            const string KHOA = "dk_pub_blacklist";
            if (_cache.TryGetValue(KHOA, out List<LuatDen>? san) && san != null) return san;

            var ds = new List<LuatDen>();
            using var conn = new SqlConnection(_resolver.GetPubConnection());
            await conn.OpenAsync(ct);
            using var cmd = new SqlCommand(
                @"SELECT [type], pattern, description
                    FROM dbo.DK_BLACKLIST
                   WHERE is_active = 1
                   ORDER BY CASE [type] WHEN 'TRIM_AFTER' THEN 0 ELSE 1 END,
                            LEN(pattern) DESC", conn);
            using var r = await cmd.ExecuteReaderAsync(ct);
            while (await r.ReadAsync(ct))
                ds.Add(new LuatDen(r.GetString(0), ChuanHoaTen(r.GetString(1)),
                                   r.IsDBNull(2) ? null : r.GetString(2)));

            _cache.Set(KHOA, ds, new MemoryCacheEntryOptions
            { Size = 1, AbsoluteExpirationRelativeToNow = TimeSpan.FromMinutes(5) });
            return ds;
        }

        // Thứ tự CÓ Ý NGHĨA: cắt đuôi TRƯỚC, rồi mới so EXACT/CONTAINS.
        // "sơn lót điều chỉnh giảm từ vnd 100" cắt xong còn "sơn lót" — một tên hàng
        // dùng được. Soi trước khi cắt thì nó dính luật CONTAINS và bị vứt oan.
        // Trong mỗi loại thì mẫu DÀI đứng trước (ORDER BY ở câu SQL): "điều chỉnh giảm
        // từ vnd" phải được thử trước "điều chỉnh giảm từ", không thì mẫu ngắn nuốt mất.
        public static KetQuaLoc LocTen(string tenGoc, IReadOnlyList<LuatDen> luat)
        {
            string ten = ChuanHoaTen(tenGoc);
            string datCat = "";

            foreach (var l in luat.Where(x => x.Loai == "TRIM_AFTER"))
            {
                int i = ten.IndexOf(l.Mau, StringComparison.Ordinal);
                if (i >= 0) { ten = ten[..i].Trim(); datCat = l.Mau; break; }
            }

            foreach (var l in luat.Where(x => x.Loai == "EXACT"))
                if (ten == l.Mau)
                    return new KetQuaLoc(false, ten, $"EXACT: {l.Mau}");

            foreach (var l in luat.Where(x => x.Loai == "CONTAINS"))
                if (ten.Contains(l.Mau, StringComparison.Ordinal))
                    return new KetQuaLoc(false, ten, $"CONTAINS: {l.Mau}");

            // Kiểm tra tối thiểu (README mục 2b). Không phải danh sách đen — đây là thứ
            // không bao giờ là tên hàng thật: quá ngắn, hoặc không có lấy một chữ cái.
            if (ten.Length < 3) return new KetQuaLoc(false, ten, "Tên dưới 3 ký tự");
            if (!ten.Any(char.IsLetter)) return new KetQuaLoc(false, ten, "Không có chữ cái nào");

            return new KetQuaLoc(true, ten, datCat.Length > 0 ? $"TRIM_AFTER: {datCat}" : "");
        }

        // ===================== BỘ TÀI KHOẢN CHO PHÉP =====================
        //
        // Model là model CHUNG, nhưng MỖI ĐƠN VỊ chỉ được đoán trong bộ tài khoản mà
        // CHÍNH ĐƠN VỊ ĐÓ đã từng dùng (chốt Trường 20/08).
        //
        // Vì sao cần: Data Training gộp 68 đơn vị đủ ngành nghề. Không chặn thì một đơn vị
        // thương mại thuần (chỉ 156/641) có ngày nhận về nhãn 155 "thành phẩm" học từ
        // một đơn vị sản xuất nào đó — sổ của họ không có khái niệm thành phẩm.
        //
        // Nguồn là DK_DATA_TRAIN lọc theo ma_donvi: đó là định khoản TAY kế toán đã làm
        // cho chính đơn vị này bên VFP. KHÔNG lấy ghi_no/ghi_co đang nằm trong sổ, vì đo
        // 20/08 cho thấy trình nạp gán 156 cho MỌI dòng — kể cả hoá đơn tiền điện và phí
        // bảo hiểm xe. Lấy nguồn đó thì bộ cho phép co lại còn đúng {156}.
        //
        // Đơn vị chưa có lịch sử → KHÔNG giới hạn. Chặn bằng một bộ rỗng thì máy không
        // đoán được gì cả, mà im lặng thì người dùng tưởng model hỏng.
        private const string SqlBoNhan = @"
            SELECT ma_donvi, vao_ra, label
              FROM dbo.DK_DATA_TRAIN
             WHERE status = 'ACTIVE'
             GROUP BY ma_donvi, vao_ra, label";

        /// <summary>Khoá "MA_DONVI|V" → các tài khoản đơn vị đó đã từng dùng ở chiều đó.</summary>
        public async Task<Dictionary<string, List<string>>> LayBoNhanAsync(CancellationToken ct)
        {
            const string KHOA = "dk_pub_bonhan";
            if (_cache.TryGetValue(KHOA, out Dictionary<string, List<string>>? san) && san != null)
                return san;

            var bo = new Dictionary<string, List<string>>(StringComparer.OrdinalIgnoreCase);
            using var conn = new SqlConnection(_resolver.GetPubConnection());
            await conn.OpenAsync(ct);
            using var cmd = new SqlCommand(SqlBoNhan, conn) { CommandTimeout = 120 };
            using var r = await cmd.ExecuteReaderAsync(ct);
            while (await r.ReadAsync(ct))
            {
                string k = KhoaBo(r.GetString(0), r.GetString(1));
                if (!bo.TryGetValue(k, out var ds)) bo[k] = ds = new List<string>();
                ds.Add(r.GetString(2));
            }

            _cache.Set(KHOA, bo, new MemoryCacheEntryOptions
            { Size = 1, AbsoluteExpirationRelativeToNow = TimeSpan.FromMinutes(5) });
            return bo;
        }

        public static string KhoaBo(string maDonVi, string vr)
            => $"{maDonVi.Trim().ToUpperInvariant()}|{vr}";

        // Data Training vừa đổi thì bộ tài khoản cho phép có thể rộng ra. Xoá thẳng, đừng đợi
        // hết 5 phút: người dùng vừa dạy máy một tài khoản mới rồi bấm Auto ngay là
        // chuyện thường.
        private void QuenBoNhan() => _cache.Remove("dk_pub_bonhan");

        // ===================== CHỐT VÀO Data Training =====================

        public sealed class ChotDto
        {
            public string MaDonVi { get; set; } = "";
            public string Huong { get; set; } = "";     // V | R
            public string TenHang { get; set; } = "";
            public string Label { get; set; } = "";     // tài khoản người dùng đã chốt
            /// <summary>Giải thích, chỉ cần khi biết trước là ca xung đột.</summary>
            public string? MoTa { get; set; }
        }

        public sealed class KetQuaChot
        {
            public string MaDonVi { get; set; } = "";
            public string Huong { get; set; } = "";
            public string TenHang { get; set; } = "";
            public string Label { get; set; } = "";
            /// <summary>NEW · DUPLICATE · CONFLICT · REJECT_BLACKLIST · REJECT_INVALID</summary>
            public string TrangThai { get; set; } = "";
            public string? LabelCu { get; set; }
            public string? LyDo { get; set; }
            /// <summary>id dòng DK_DATA_TRAIN vừa thêm (ca CONFLICT cần để gửi giải thích).</summary>
            public long? Id { get; set; }
        }

        private const string SqlChen = @"
            INSERT INTO dbo.DK_DATA_TRAIN
                   (ten_uni, ten_norm, vao_ra, ma_donvi, label, mo_ta,
                    is_conflict, notes, status, created_by)
            OUTPUT INSERTED.id
            VALUES (@tenUni, @tenNorm, @vr, @dv, @label, @moTa,
                    @conflict, @notes, @status, @user)";

        private const string SqlNhatKy = @"
            INSERT INTO dbo.DK_AUDIT_LOG
                   (action, vao_ra, ten_uni, label_new, label_old, ma_donvi, reason, user_name)
            VALUES (@action, @vr, @tenUni, @labelNew, @labelOld, @dv, @reason, @user)";

        /// <summary>
        /// Đẩy các mặt hàng đã chốt vào Data Training. Trả về kết quả TỪNG dòng — người dùng
        /// phải thấy cái nào vào được, cái nào bị chặn và vì sao.
        /// </summary>
        public async Task<List<KetQuaChot>> ChotAsync(
            IEnumerable<ChotDto> ds, string user, CancellationToken ct)
        {
            var luat = await LayLuatDenAsync(ct);
            var ra = new List<KetQuaChot>();

            using var conn = new SqlConnection(_resolver.GetPubConnection());
            await conn.OpenAsync(ct);

            foreach (var d in ds)
            {
                string vr = d.Huong.Trim().ToUpperInvariant().StartsWith('R') ? "R" : "V";
                string dv = (d.MaDonVi ?? "").Trim();
                string nhan = (d.Label ?? "").Trim();
                var kq = new KetQuaChot { MaDonVi = dv, Huong = vr,
                                          TenHang = d.TenHang ?? "", Label = nhan };

                if (nhan.Length == 0)
                {
                    kq.TrangThai = "REJECT_INVALID";
                    kq.LyDo = "Chưa có định khoản để học";
                    await GhiNhatKyAsync(conn, "REJECT_INVALID", vr, d.TenHang, nhan,
                                         null, dv, kq.LyDo, user, ct);
                    ra.Add(kq); continue;
                }

                var loc = LocTen(d.TenHang ?? "", luat);
                if (!loc.Nhan)
                {
                    // Tên rác thì CHỈ ghi nhật ký, không đụng vào Data Training. Nhật ký vẫn
                    // phải có: bị loại im lặng thì người dùng tưởng đã học xong.
                    kq.TrangThai = loc.LyDo.StartsWith("EXACT") || loc.LyDo.StartsWith("CONTAINS")
                                 ? "REJECT_BLACKLIST" : "REJECT_INVALID";
                    kq.LyDo = loc.LyDo;
                    await GhiNhatKyAsync(conn, kq.TrangThai, vr, d.TenHang, nhan,
                                         null, dv, loc.LyDo, user, ct);
                    ra.Add(kq); continue;
                }

                // ===== ĐÂY LÀ CÁI VAN CHỐNG "LOÃNG" MODEL =====
                //
                // Câu hỏi Trường đặt ra 22/08: thêm dữ liệu vào thì mặt hàng đang đúng ở
                // 90% có tụt xuống dưới 80% không? Ba việc phải tách bạch:
                //
                // 1. THÊM VÍ DỤ ĐÚNG KHÔNG LÀM LOÃNG. Model học bằng cách đếm bằng chứng
                //    — mỗi ví dụ đúng là một phiếu bầu cho ranh giới đúng. Loãng chỉ xảy
                //    ra khi thêm ví dụ MÂU THUẪN: cùng tên, cùng chiều, cùng đơn vị mà
                //    hai nhãn khác nhau. Đó chính xác là thứ đoạn dưới đây chặn — nhánh
                //    CONFLICT đẩy dòng vào CHO_GIAI_THICH, và export train chỉ lấy
                //    ACTIVE. Chưa ai viết lý do thì nó KHÔNG BAO GIỜ vào model.
                //
                //    Nói cách khác: van chống loãng không nằm ở chỗ hạn chế lượng dữ
                //    liệu, mà nằm ở mấy dòng so nhãn ngay bên dưới.
                //
                // 2. ĐỘ TIN CẬY TỤT VẪN CÓ THỂ LÀ CHUYỆN LÀNH. Khi dạy máy rằng
                //    "Chiết khấu…" là 154 trong khi một tên gần giống lại là 641, model
                //    trở nên THÀNH THẬT về vùng nó không chắc. Tin cậy giảm ở đó là hiểu
                //    biết TĂNG. Đừng thấy pred_conf tụt mà vội kết luận đã làm hỏng.
                //
                // 3. THƯỚC ĐO PHẢI LÀ ĐỘ CHÍNH XÁC, KHÔNG PHẢI ĐỘ TIN CẬY. Hai thứ khác
                //    nhau và có thể đi ngược chiều nhau.
                //
                // CẢNH BÁO KHI ĐỌC SỐ ACCURACY SAU KHI TRAIN LẠI: train.py có cố định
                // random_state = 42, nhưng train_test_split cắt theo TỈ LỆ trên tập đang
                // có — kho học đổi kích thước là tập kiểm đổi thành phần. Đo 22/08:
                // 52.435 -> 52.458 dòng sau hai lượt chốt đầu tiên, nên con số mới KHÔNG
                // so sánh được với 0,9633 của lượt trước; cao hơn hay thấp hơn đều không
                // kết luận được gì. Muốn so được phải có BỘ KIỂM CỐ ĐỊNH (giữ riêng một
                // danh sách id, loại khỏi tập huấn luyện). Chưa cài: train.py thuộc vùng
                // lõi chung (luật #10), chờ Leader duyệt.
                //
                // Một quan sát nữa từ số đo, để người sau khỏi giật mình: kho học đang
                // LỆCH NẶNG — nhãn 156 chiếm 35.001/52.435 = 66,8%. Model vì thế có xu
                // hướng kéo mọi thứ về 156, và những ca CONFLICT kiểu "kho học 152 ->
                // máy đoán 156" ở đơn vị sản xuất nhiều khả năng là MÁY sai chứ không
                // phải kho học sai. Đừng giải thích cho qua để thả chúng thành ACTIVE.
                string? nhanCu = await LayNhanMoiNhatAsync(conn, loc.Ten, vr, dv, ct);

                if (nhanCu == nhan)
                {
                    // Đã học đúng cái này rồi. Không chèn lại: Data Training phình ra vì cùng
                    // một sự thật lặp vài chục lần thì huấn luyện chậm mà chẳng thêm gì.
                    kq.TrangThai = "DUPLICATE";
                    kq.LabelCu = nhanCu;
                    ra.Add(kq); continue;
                }

                bool xungDot = nhanCu != null;
                string? giaiThich = string.IsNullOrWhiteSpace(d.MoTa) ? null : d.MoTa!.Trim();
                // Xung đột kèm giải thích ngay thì vào thẳng ACTIVE — bắt người dùng đi
                // một vòng "chờ giải thích" khi họ vừa giải thích xong là thừa.
                string trangThai = !xungDot || giaiThich != null ? "ACTIVE" : "CHO_GIAI_THICH";

                kq.Id = await ChenAsync(conn, d.TenHang ?? "", loc.Ten, vr, dv, nhan,
                                        giaiThich, xungDot,
                                        xungDot ? $"CONFLICT: was {nhanCu}, now {nhan}" : null,
                                        trangThai, user, ct);
                kq.TrangThai = xungDot ? "CONFLICT" : "NEW";
                kq.LabelCu = nhanCu;
                kq.LyDo = loc.LyDo.Length > 0 ? loc.LyDo : null;
                await GhiNhatKyAsync(conn, kq.TrangThai, vr, d.TenHang, nhan,
                                     nhanCu, dv, kq.LyDo, user, ct);
                ra.Add(kq);
            }

            // Data Training vừa rộng ra thì bộ tài khoản cho phép cũng vậy — quên bản nhớ đi.
            QuenBoNhan();
            return ra;
        }

        // Nhãn MỚI NHẤT của khoá này. TOP 1 ... ORDER BY id DESC chứ không phải "một
        // dòng bất kỳ": cùng khoá có thể có nhiều dòng lịch sử khác nhãn, và cái đang
        // có hiệu lực là cái ghi sau cùng — đúng luật last-write-wins của train.py.
        private static async Task<string?> LayNhanMoiNhatAsync(
            SqlConnection conn, string tenNorm, string vr, string dv, CancellationToken ct)
        {
            using var cmd = new SqlCommand(
                @"SELECT TOP 1 label FROM dbo.DK_DATA_TRAIN
                   WHERE ten_norm = @ten AND vao_ra = @vr AND ma_donvi = @dv
                     AND status = 'ACTIVE'
                   ORDER BY id DESC", conn);
            cmd.Parameters.AddWithValue("@ten", tenNorm);
            cmd.Parameters.AddWithValue("@vr", vr);
            cmd.Parameters.AddWithValue("@dv", dv);
            return await cmd.ExecuteScalarAsync(ct) as string;
        }

        private static async Task<long> ChenAsync(
            SqlConnection conn, string tenUni, string tenNorm, string vr, string dv,
            string nhan, string? moTa, bool xungDot, string? ghiChu, string trangThai,
            string user, CancellationToken ct)
        {
            using var cmd = new SqlCommand(SqlChen, conn);
            cmd.Parameters.AddWithValue("@tenUni", Cat(tenUni, 500));
            cmd.Parameters.AddWithValue("@tenNorm", Cat(tenNorm, 500));
            cmd.Parameters.AddWithValue("@vr", vr);
            cmd.Parameters.AddWithValue("@dv", Cat(dv, 50));
            cmd.Parameters.AddWithValue("@label", Cat(nhan, 10));
            cmd.Parameters.AddWithValue("@moTa", (object?)Cat(moTa, 500) ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@conflict", xungDot ? 1 : 0);
            cmd.Parameters.AddWithValue("@notes", (object?)Cat(ghiChu, 500) ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@status", trangThai);
            cmd.Parameters.AddWithValue("@user", Cat(user, 50));
            return Convert.ToInt64(await cmd.ExecuteScalarAsync(ct), CultureInfo.InvariantCulture);
        }

        // Nuốt lỗi CÓ CHỦ ĐÍCH, và chỉ ở đây: dòng dữ liệu đã chèn xong rồi, hỏng nhật
        // ký mà ném tiếp thì người dùng tưởng thất bại và bấm lại — thành hai bản ghi.
        private async Task GhiNhatKyAsync(
            SqlConnection conn, string hanhDong, string vr, string? tenUni, string? nhanMoi,
            string? nhanCu, string dv, string? lyDo, string user, CancellationToken ct)
        {
            try
            {
                using var cmd = new SqlCommand(SqlNhatKy, conn);
                cmd.Parameters.AddWithValue("@action", Cat(hanhDong, 20));
                cmd.Parameters.AddWithValue("@vr", vr);
                cmd.Parameters.AddWithValue("@tenUni", (object?)Cat(tenUni, 500) ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@labelNew",
                    string.IsNullOrEmpty(nhanMoi) ? DBNull.Value : Cat(nhanMoi, 10));
                cmd.Parameters.AddWithValue("@labelOld",
                    string.IsNullOrEmpty(nhanCu) ? DBNull.Value : Cat(nhanCu, 10));
                cmd.Parameters.AddWithValue("@dv", Cat(dv, 50));
                cmd.Parameters.AddWithValue("@reason", (object?)Cat(lyDo, 400) ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@user", Cat(user, 50));
                await cmd.ExecuteNonQueryAsync(ct);
            }
            catch (Exception ex)
            {
                _log.LogWarning(ex, "Không ghi được DK_AUDIT_LOG ({HanhDong})", hanhDong);
            }
        }

        // Cắt cho vừa cột. Tên hàng trên hoá đơn thỉnh thoảng dài hơn 500 ký tự thật —
        // để nguyên thì SQL Server ném "String or binary data would be truncated" và
        // người dùng nhận một lỗi chẳng nói lên điều gì.
        private static string? Cat(string? s, int n)
            => s == null ? null : (s.Length <= n ? s : s[..n]);

        // ===================== XUNG ĐỘT CHỜ GIẢI THÍCH =====================

        public sealed class ChoGiaiThichDto
        {
            public long Id { get; set; }
            public string TenHang { get; set; } = "";
            public string Huong { get; set; } = "";
            public string MaDonVi { get; set; } = "";
            public string Label { get; set; } = "";
            public string? GhiChu { get; set; }
            public DateTime TaoLuc { get; set; }
            public string? TaoBoi { get; set; }
        }

        public async Task<List<ChoGiaiThichDto>> LayChoGiaiThichAsync(CancellationToken ct)
        {
            var ra = new List<ChoGiaiThichDto>();
            using var conn = new SqlConnection(_resolver.GetPubConnection());
            await conn.OpenAsync(ct);
            using var cmd = new SqlCommand(
                @"SELECT id, ten_uni, vao_ra, ma_donvi, label, notes, created_at, created_by
                    FROM dbo.DK_DATA_TRAIN
                   WHERE status = 'CHO_GIAI_THICH'
                   ORDER BY id DESC", conn);
            using var r = await cmd.ExecuteReaderAsync(ct);
            while (await r.ReadAsync(ct))
                ra.Add(new ChoGiaiThichDto
                {
                    Id = r.GetInt64(0),
                    TenHang = r.GetString(1),
                    Huong = r.GetString(2),
                    MaDonVi = r.GetString(3),
                    Label = r.GetString(4),
                    GhiChu = r.IsDBNull(5) ? null : r.GetString(5),
                    TaoLuc = r.GetDateTime(6),
                    TaoBoi = r.IsDBNull(7) ? null : r.GetString(7),
                });
            return ra;
        }

        /// <summary>
        /// Người dùng viết xong lý do → dòng xung đột được thả vào Data Training.
        /// Điều kiện status = 'CHO_GIAI_THICH' trong WHERE là cố ý: bấm hai lần, hay
        /// hai người cùng mở một dòng, thì lần sau không đụng được vào dòng đã ACTIVE.
        /// </summary>
        public async Task<int> GiaiThichAsync(long id, string moTa, string user,
                                              CancellationToken ct)
        {
            using var conn = new SqlConnection(_resolver.GetPubConnection());
            await conn.OpenAsync(ct);
            using var cmd = new SqlCommand(
                @"UPDATE dbo.DK_DATA_TRAIN
                     SET mo_ta = @moTa, status = 'ACTIVE'
                   WHERE id = @id AND status = 'CHO_GIAI_THICH'", conn);
            cmd.Parameters.AddWithValue("@moTa", Cat(moTa, 500));
            cmd.Parameters.AddWithValue("@id", id);
            int n = await cmd.ExecuteNonQueryAsync(ct);
            if (n > 0)
            {
                await GhiNhatKyAsync(conn, "GIAI_THICH", "V", null, null, null, "",
                                     $"id {id}: {Cat(moTa, 300)}", user, ct);
                QuenBoNhan();
            }
            return n;
        }

        /// <summary>Đếm nhanh để hiện lên nút — bao nhiêu dòng đang chờ giải thích.</summary>
        public async Task<int> DemChoGiaiThichAsync(CancellationToken ct)
        {
            using var conn = new SqlConnection(_resolver.GetPubConnection());
            await conn.OpenAsync(ct);
            using var cmd = new SqlCommand(
                "SELECT COUNT(*) FROM dbo.DK_DATA_TRAIN WHERE status = 'CHO_GIAI_THICH'", conn);
            return Convert.ToInt32(await cmd.ExecuteScalarAsync(ct), CultureInfo.InvariantCulture);
        }
    }
}
