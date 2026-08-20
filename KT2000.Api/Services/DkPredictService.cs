using System.Data;
using System.Diagnostics;
using System.Text.Json;
using Microsoft.Data.SqlClient;

namespace KT2000.Api.Services
{
    // ============ ĐỊNH KHOẢN — MÁY ĐOÁN (Auto Accounting New) ============
    //
    // Đây là bước "máy tự định khoản toàn bộ": gom tên hàng chưa ai xác nhận, đưa hết
    // cho model đoán một lượt, rồi ghi nhãn thẳng vào ghi_no/ghi_co.
    //
    // Python là "PRG thuần túy" — nó KHÔNG mở database (README_DK_WEB.md). C# lo trọn
    // phần I/O: đọc tên hàng ra JSON, gọi predict.py, đọc JSON về, ghi xuống sổ.
    // Ranh giới này giữ được vì nó đáng: model đổi thuật toán bao nhiêu lần cũng không
    // đụng tới một dòng C# nào, miễn hai đầu JSON giữ nguyên.
    //
    // NGUYÊN TẮC VIÊN GẠCH (luật 12): nhận tham số tường minh (đơn vị nào, năm nào),
    // tự chạy trọn vẹn. Nút trên màn hình gọi nó, và sau này worker hằng ngày cũng gọi
    // ĐÚNG hàm này — không được đẻ ra bản thứ hai cho cách chạy thứ hai.
    public class DkPredictService
    {
        private readonly TenantDbResolver _resolver;
        private readonly DkPubService _pub;
        private readonly IConfiguration _config;
        private readonly ILogger<DkPredictService> _log;

        public DkPredictService(TenantDbResolver resolver, DkPubService pub,
                                IConfiguration config, ILogger<DkPredictService> log)
        { _resolver = resolver; _pub = pub; _config = config; _log = log; }

        // Dưới ngưỡng này thì máy tự nhận là "không chắc" — màn hình tô màu cho người
        // dùng soi trước. Con số 0,70 là của bản VFP, giữ nguyên để hai bên cùng một
        // thước đo (predict.py cũng lấy 0.70 làm mặc định).
        public const double NGUONG_TIN_CAY = 0.70;

        // Luật đối ứng CỨNG (README_DK_WEB.md mục 1). Máy chỉ đoán MỘT vế:
        //   hàng vào  → ghi_no = nhãn máy đoán, ghi_co = 331 (phải trả người bán)
        //   hàng ra   → ghi_no = 632 (giá vốn), ghi_co = nhãn máy đoán
        // Vế kia không phải việc của model — nó cố định theo hướng hoá đơn.
        private const string TK_DOI_UNG_VAO = "331";
        private const string TK_DOI_UNG_RA = "632";

        public sealed class KetQuaDoan
        {
            public int SoMatHang { get; set; }      // tên hàng duy nhất đã đưa cho model
            public int SoDong { get; set; }         // dòng hoá đơn đã ghi nhãn
            public int SoChac { get; set; }         // đạt ngưỡng 0,70
            public int SoCanSoi { get; set; }       // dưới ngưỡng — nên soi trước
            public int SoBoQua { get; set; }        // dòng ghi chú, danh sách đen gạt ra
            public int SoKhoiPhuc { get; set; }     // dòng ghi chú đã trả về dk_goc
            public double TinCayTb { get; set; }
            public List<string> CanhBao { get; } = new();
        }

        public async Task<KetQuaDoan> ChayAsync(
            IEnumerable<string> dsMaDonVi, int nam, string? huong, string user,
            CancellationToken ct)
        {
            var kq = new KetQuaDoan();

            // ---- 1. Gom tên hàng chưa ai xác nhận ----
            //
            // CHƯA XÁC NHẬN (good_pred = 0) là toàn bộ ý nghĩa chữ "New" trong tên nút:
            // mặt hàng người dùng đã soi và gật rồi thì máy không được phép đoán đè lên.
            // Đó là công sức của kế toán, không phải chỗ cho model thử lại.
            var dsTen = new List<(string Dv, string Vr, string Ten)>();
            foreach (string code in dsMaDonVi.Distinct(StringComparer.OrdinalIgnoreCase))
            {
                try
                {
                    using var conn = new SqlConnection(_resolver.GetTenantConnection(code, nam));
                    await conn.OpenAsync(ct);
                    using var cmd = new SqlCommand(@"
                        SELECT DISTINCT h.huong,
                               LTRIM(RTRIM(ISNULL(l.ten_hang_goc, ''))) AS ten
                          FROM HOA_DON_LINE l
                          JOIN HOA_DON h ON h.ma_hd = l.ma_hd
                         WHERE LTRIM(RTRIM(ISNULL(l.ten_hang_goc, ''))) <> ''
                           AND ISNULL(l.good_pred, 0) = 0
                           AND (@huong IS NULL OR h.huong = @huong)", conn);
                    cmd.Parameters.AddWithValue("@huong", (object?)huong ?? DBNull.Value);
                    cmd.CommandTimeout = 120;
                    using var r = await cmd.ExecuteReaderAsync(ct);
                    while (await r.ReadAsync(ct))
                        dsTen.Add((code, r.GetString(0) == "VAO" ? "V" : "R", r.GetString(1)));
                }
                catch (SqlException ex) when (ex.Number is 4060 or 911)
                {
                    // Chưa mở sổ năm này thì bỏ qua ĐƠN VỊ ĐÓ, không làm hỏng cả mẻ —
                    // nhưng phải nói ra, không thì người dùng tưởng đơn vị đó không có gì.
                    kq.CanhBao.Add($"{code}: chưa có sổ năm {nam}");
                }
            }

            // ---- 2. Gạt dòng KHÔNG PHẢI mặt hàng ra ----
            //
            // Danh sách đen phải áp Ở ĐÂY chứ không chỉ lúc đẩy về kho học. Bài học
            // 20/08: dòng ghi chú "Hóa đơn thay thế cho hóa đơn điện tử mẫu 1 ký hiệu
            // C26TN…" nằm sẵn trong DK_BLACKLIST, vậy mà máy vẫn gán cho nó 632/154 —
            // vì lúc đoán không ai soi danh sách đen cả. Một dòng ghi chú thì KHÔNG có
            // định khoản nào là đúng, kể cả định khoản đẹp.
            var luat = await _pub.LayLuatDenAsync(ct);
            var biLoai = new List<(string Dv, string Vr, string Ten)>();
            var dungDuoc = new List<(string Dv, string Vr, string Ten)>();
            foreach (var t in dsTen)
                (DkPubService.LocTen(t.Ten, luat).Nhan ? dungDuoc : biLoai).Add(t);

            kq.SoMatHang = dungDuoc.Count;
            kq.SoBoQua = biLoai.Count;

            // Dọn hậu quả của những lần chạy TRƯỚC khi có lằn ranh này: trả ghi_no/ghi_co
            // của dòng ghi chú về giá trị dk_goc đã chụp. Chỉ đụng dòng do MÁY ghi
            // (is_predict = 1) và người dùng CHƯA xác nhận — công của kế toán thì không
            // đụng tới, dù nó nằm trên dòng ghi chú.
            foreach (var nhom in biLoai.GroupBy(x => x.Dv, StringComparer.OrdinalIgnoreCase))
            {
                try { kq.SoKhoiPhuc += await KhoiPhucAsync(nhom.Key, nam, nhom.ToList(), user, ct); }
                catch (SqlException ex)
                { kq.CanhBao.Add($"{nhom.Key}: không dọn được dòng ghi chú — {ex.Message}"); }
            }

            if (dungDuoc.Count == 0) return kq;
            dsTen = dungDuoc;

            // ---- 3. Bộ tài khoản mỗi đơn vị được phép dùng ----
            //
            // Model học chung 68 đơn vị đủ ngành nghề. Không chặn thì một đơn vị thương
            // mại có ngày nhận nhãn 155 "thành phẩm" học từ đơn vị sản xuất — sổ của họ
            // không có khái niệm đó (chốt Trường 20/08).
            var boNhan = await _pub.LayBoNhanAsync(ct);
            foreach (var dv in dsTen.Select(t => t.Dv).Distinct(StringComparer.OrdinalIgnoreCase))
            {
                bool coV = boNhan.ContainsKey(DkPubService.KhoaBo(dv, "V"));
                bool coR = boNhan.ContainsKey(DkPubService.KhoaBo(dv, "R"));
                // Chưa có lịch sử thì KHÔNG chặn — chặn bằng bộ rỗng là máy không đoán
                // nổi gì. Nhưng phải nói ra, không thì người dùng tưởng đã có ràng buộc.
                if (!coV && !coR)
                    kq.CanhBao.Add($"{dv}: chưa có lịch sử định khoản trong kho học — "
                                 + "máy đoán tự do trong cả 7 tài khoản, soi kỹ hơn bình thường");
            }

            // ---- 4. Gọi model ----
            var doan = await GoiModelAsync(dsTen, boNhan, ct);

            // ---- 5. Ghi nhãn xuống sổ, từng đơn vị một ----
            foreach (var nhom in doan.GroupBy(x => x.Dv, StringComparer.OrdinalIgnoreCase))
            {
                try
                {
                    kq.SoDong += await GhiNhanAsync(nhom.Key, nam, nhom.ToList(), user, ct);
                }
                catch (SqlException ex)
                {
                    // Một đơn vị ghi hỏng thì báo tên nó ra, và VẪN ghi tiếp các đơn vị
                    // sau. Chạy 20 đơn vị mà chết ở cái thứ 3 rồi bỏ luôn 17 cái còn lại
                    // là bắt người dùng chạy lại từ đầu vì một chuyện không liên quan.
                    kq.CanhBao.Add($"{nhom.Key}: ghi hỏng — {ex.Message}");
                    _log.LogError(ex, "Định khoản: ghi nhãn hỏng ở {Code}", nhom.Key);
                }
            }

            kq.SoChac = doan.Count(x => x.Conf >= NGUONG_TIN_CAY);
            kq.SoCanSoi = doan.Count - kq.SoChac;
            kq.TinCayTb = doan.Count > 0 ? Math.Round(doan.Average(x => x.Conf), 4) : 0;
            return kq;
        }

        // ===================== GỌI PYTHON =====================

        private sealed record MotDoan(string Dv, string Vr, string Ten, string Label, double Conf);

        private sealed class KetQuaJson
        {
            public bool success { get; set; }
            public string? error { get; set; }
            public List<MucJson>? results { get; set; }
        }
        private sealed class MucJson
        {
            public string? id { get; set; }
            public string? label { get; set; }
            public double conf { get; set; }
        }

        private async Task<List<MotDoan>> GoiModelAsync(
            List<(string Dv, string Vr, string Ten)> dsTen,
            Dictionary<string, List<string>> boNhan, CancellationToken ct)
        {
            string py = _config["Paths:PythonExe"]
                ?? throw new InvalidOperationException("Thiếu cấu hình Paths:PythonExe");
            if (!File.Exists(py))
                throw new InvalidOperationException($"Không thấy python.exe tại: {py}");

            string script = _config["Paths:DkScript"]
                ?? Path.Combine(AppContext.BaseDirectory, "tools", "dinh_khoan", "predict.py");
            if (!File.Exists(script))
                throw new InvalidOperationException($"Không thấy predict.py tại: {script}");

            string models = _config["Paths:DkModels"]
                ?? throw new InvalidOperationException("Thiếu cấu hình Paths:DkModels");
            if (!File.Exists(Path.Combine(models, "model_v3.joblib")))
                throw new InvalidOperationException(
                    $"Chưa có model tại {models}. Chạy train.py trước "
                  + "(model_v3.joblib — KHÔNG dùng chung model_v2 của bản VFP, đặc trưng khác nhau).");

            string thuMuc = Path.Combine(
                _config["Paths:JobsRoot"] ?? Path.GetTempPath(), "dk_predict");
            Directory.CreateDirectory(thuMuc);
            // Tên file mang mốc thời gian: hai người cùng bấm một lúc mà dùng chung
            // INPUT.json thì lượt sau ghi đè lượt trước, và cả hai nhận kết quả của nhau.
            string moc = DateTime.Now.ToString("yyyyMMdd_HHmmss_fff");
            string fIn = Path.Combine(thuMuc, $"IN_{moc}.json");
            string fOut = Path.Combine(thuMuc, $"OUT_{moc}.json");

            // id = VỊ TRÍ trong danh sách. predict.py coi id là chuỗi mờ đục, nên dùng
            // số thứ tự là cách map ngược chắc nhất — tên hàng có dấu, có ký tự lạ,
            // ghép làm khoá thì sớm muộn cũng có cái làm vỡ.
            //
            // allow: bộ tài khoản của RIÊNG (đơn vị, chiều) này. Không có lịch sử thì
            // gửi null — predict.py hiểu là đoán tự do.
            await using (var fs = File.Create(fIn))
                await JsonSerializer.SerializeAsync(fs, new
                {
                    items = dsTen.Select((t, i) => new
                    {
                        id = i.ToString(), ten = t.Ten, vr = t.Vr, dv = t.Dv,
                        allow = boNhan.TryGetValue(DkPubService.KhoaBo(t.Dv, t.Vr), out var a)
                              ? a : null,
                    }),
                }, cancellationToken: ct);

            var psi = new ProcessStartInfo
            {
                FileName = py,
                WorkingDirectory = Path.GetDirectoryName(script)!,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
                CreateNoWindow = true,
            };
            foreach (var a in new[]
            {
                script, "--input", fIn, "--output", fOut,
                "--models", models,
                "--threshold", NGUONG_TIN_CAY.ToString(
                    System.Globalization.CultureInfo.InvariantCulture),
            }) psi.ArgumentList.Add(a);
            // Console Windows hay rơi về codepage cũ và làm vỡ chữ có dấu trong log.
            psi.Environment["PYTHONIOENCODING"] = "utf-8";

            using var proc = new Process { StartInfo = psi };
            var log = new System.Text.StringBuilder();
            proc.OutputDataReceived += (_, e) => { if (e.Data != null) log.AppendLine(e.Data); };
            proc.ErrorDataReceived += (_, e) => { if (e.Data != null) log.AppendLine("[stderr] " + e.Data); };
            proc.Start();
            proc.BeginOutputReadLine();
            proc.BeginErrorReadLine();
            await proc.WaitForExitAsync(ct);

            // Xem mã thoát TRƯỚC rồi mới đọc JSON (README). Ngược lại thì lúc Python
            // chết trước khi kịp ghi file, ta đọc phải OUTPUT.json của lượt cũ.
            if (proc.ExitCode != 0)
                throw new InvalidOperationException(
                    $"predict.py lỗi (mã {proc.ExitCode}): {Cuoi(log.ToString(), 500)}");
            if (!File.Exists(fOut))
                throw new InvalidOperationException("predict.py không sinh ra file kết quả");

            KetQuaJson? kq;
            await using (var fs = File.OpenRead(fOut))
                kq = await JsonSerializer.DeserializeAsync<KetQuaJson>(fs, cancellationToken: ct);
            if (kq is null || !kq.success)
                throw new InvalidOperationException($"predict.py: {kq?.error ?? "không rõ lỗi"}");

            var ra = new List<MotDoan>();
            foreach (var m in kq.results ?? new List<MucJson>())
            {
                // Nhãn rỗng = Python bỏ qua (tên rỗng). Không có nhãn thì không ghi gì —
                // ghi rỗng đè lên định khoản đang có là làm hỏng dữ liệu chứ không phải
                // "chưa đoán được".
                if (string.IsNullOrEmpty(m.label)) continue;
                if (!int.TryParse(m.id, out int i) || i < 0 || i >= dsTen.Count) continue;
                var t = dsTen[i];
                ra.Add(new MotDoan(t.Dv, t.Vr, t.Ten, m.label!, m.conf));
            }

            _log.LogInformation("Định khoản: model đoán {N}/{M} mặt hàng", ra.Count, dsTen.Count);
            try { File.Delete(fIn); File.Delete(fOut); }
            catch { /* để lại file tạm không sao, còn xoá được thì đỡ rác */ }
            return ra;
        }

        private static string Cuoi(string s, int n)
            => s.Length <= n ? s : s[^n..];

        // ===================== GHI NHÃN XUỐNG SỔ =====================

        // Đổ kết quả vào bảng tạm rồi UPDATE một phát, thay vì bắn từng câu lệnh cho
        // từng mặt hàng. Với 1.100 mặt hàng của một đơn vị thì đó là chênh lệch giữa
        // "một giây" và "một phút rưỡi" — hơn nghìn lượt đi về mạng.
        private const string SqlBangTam = @"
            CREATE TABLE #dk_doan (
                huong VARCHAR(3)     NOT NULL,
                ten   NVARCHAR(500)  NOT NULL,
                label NVARCHAR(10)   NOT NULL,
                conf  FLOAT          NOT NULL);";

        // dk_goc chụp giá trị TRƯỚC khi đè, và chỉ khi còn trống — "chỉ thực hiện 1 lần".
        // An toàn vì SQL Server đánh giá MỌI biểu thức của một UPDATE trên giá trị CŨ,
        // nên dk_goc vẫn thấy vế cũ dù chính câu lệnh đó đang ghi đè lên nó.
        //
        // good_pred = 0 trong WHERE là lằn ranh không được vượt: mặt hàng kế toán đã gật
        // thì máy không đụng tới. Bỏ điều kiện này là mỗi lần bấm Auto lại xoá sạch công
        // soi của cả tuần.
        private const string SqlGhiNhan = @"
            UPDATE l
               SET dk_goc = CASE
                              WHEN ISNULL(l.dk_goc, '') <> '' THEN l.dk_goc
                              WHEN h.huong = 'VAO' THEN l.ghi_no
                              ELSE l.ghi_co
                            END,
                   ghi_no = CASE WHEN h.huong = 'VAO' THEN d.label ELSE @tkRa END,
                   ghi_co = CASE WHEN h.huong = 'VAO' THEN @tkVao  ELSE d.label END,
                   is_predict = 1,
                   proba = d.conf,
                   updated_by = @user,
                   updated_at = SYSDATETIME()
              FROM HOA_DON_LINE l
              JOIN HOA_DON h ON h.ma_hd = l.ma_hd
              JOIN #dk_doan d ON d.huong = h.huong
                             AND d.ten = LTRIM(RTRIM(ISNULL(l.ten_hang_goc, '')))
             WHERE ISNULL(l.good_pred, 0) = 0";

        // Trả dòng ghi chú về nguyên trạng trước khi máy đụng vào.
        //
        // CHỈ khôi phục được vế máy đã ghi — dk_goc chụp đúng một vế. Vế đối ứng (331 /
        // 632) thì không có bản sao nào để trả về, đó là món nợ đã ghi trong nhật ký.
        // is_predict về 0 và proba về NULL để dòng này không còn mang tiếng "máy đã đoán".
        private const string SqlKhoiPhuc = @"
            UPDATE l
               SET ghi_no = CASE WHEN h.huong = 'VAO' AND ISNULL(l.dk_goc, '') <> ''
                                 THEN l.dk_goc ELSE l.ghi_no END,
                   ghi_co = CASE WHEN h.huong = 'RA'  AND ISNULL(l.dk_goc, '') <> ''
                                 THEN l.dk_goc ELSE l.ghi_co END,
                   is_predict = 0,
                   proba = NULL,
                   updated_by = @user,
                   updated_at = SYSDATETIME()
              FROM HOA_DON_LINE l
              JOIN HOA_DON h ON h.ma_hd = l.ma_hd
              JOIN #dk_doan d ON d.huong = h.huong
                             AND d.ten = LTRIM(RTRIM(ISNULL(l.ten_hang_goc, '')))
             WHERE ISNULL(l.good_pred, 0) = 0
               AND ISNULL(l.is_predict, 0) = 1";

        private async Task<int> KhoiPhucAsync(
            string code, int nam, List<(string Dv, string Vr, string Ten)> ds,
            string user, CancellationToken ct)
        {
            // Mượn nguyên khuôn bảng tạm của GhiNhanAsync — nhãn và độ tin cậy không
            // dùng tới nên nhét chỗ trống, đổi lấy việc chỉ có MỘT chỗ dựng bảng tạm.
            return await ChayTrenBangTamAsync(code, nam, SqlKhoiPhuc,
                ds.Select(t => (t.Vr, t.Ten, "", 0d)).ToList(),
                cmd => cmd.Parameters.AddWithValue("@user", user), ct);
        }

        private async Task<int> GhiNhanAsync(
            string code, int nam, List<MotDoan> ds, string user, CancellationToken ct)
            => await ChayTrenBangTamAsync(code, nam, SqlGhiNhan,
                ds.Select(d => (d.Vr, d.Ten, d.Label, d.Conf)).ToList(),
                cmd =>
                {
                    cmd.Parameters.AddWithValue("@tkVao", TK_DOI_UNG_VAO);
                    cmd.Parameters.AddWithValue("@tkRa", TK_DOI_UNG_RA);
                    cmd.Parameters.AddWithValue("@user", user);
                }, ct);

        // Khuôn chung cho mọi lệnh ghi hàng loạt: dựng bảng tạm, đổ dữ liệu vào bằng
        // SqlBulkCopy, chạy MỘT câu UPDATE nối với nó, tất cả trong một transaction.
        //
        // Vì sao không bắn từng câu lệnh cho từng mặt hàng: 1.100 mặt hàng của một đơn
        // vị là chênh lệch giữa "một giây" và "một phút rưỡi" — hơn nghìn lượt đi về
        // mạng. Và một transaction thì hoặc xong hết, hoặc không đụng gì.
        private async Task<int> ChayTrenBangTamAsync(
            string code, int nam, string sql,
            List<(string Vr, string Ten, string Label, double Conf)> ds,
            Action<SqlCommand> themThamSo, CancellationToken ct)
        {
            using var conn = new SqlConnection(_resolver.GetTenantConnection(code, nam));
            await conn.OpenAsync(ct);
            using var tx = conn.BeginTransaction();
            try
            {
                using (var cmd = new SqlCommand(SqlBangTam, conn, tx))
                    await cmd.ExecuteNonQueryAsync(ct);

                var bang = new DataTable();
                bang.Columns.Add("huong", typeof(string));
                bang.Columns.Add("ten", typeof(string));
                bang.Columns.Add("label", typeof(string));
                bang.Columns.Add("conf", typeof(double));
                foreach (var d in ds)
                    bang.Rows.Add(d.Vr == "R" ? "RA" : "VAO", d.Ten, d.Label, d.Conf);

                using (var bulk = new SqlBulkCopy(conn, SqlBulkCopyOptions.Default, tx)
                { DestinationTableName = "#dk_doan", BulkCopyTimeout = 120 })
                {
                    foreach (DataColumn c in bang.Columns)
                        bulk.ColumnMappings.Add(c.ColumnName, c.ColumnName);
                    await bulk.WriteToServerAsync(bang, ct);
                }

                int n;
                using (var cmd = new SqlCommand(sql, conn, tx) { CommandTimeout = 300 })
                {
                    themThamSo(cmd);
                    n = await cmd.ExecuteNonQueryAsync(ct);
                }

                tx.Commit();
                return n;
            }
            catch
            {
                tx.Rollback();
                throw;   // KHÔNG nuốt: đây là ghi vào SỔ
            }
        }
    }
}
