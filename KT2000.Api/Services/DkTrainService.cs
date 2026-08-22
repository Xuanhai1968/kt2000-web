using System.Diagnostics;
using System.Text.Json;
using Microsoft.Data.SqlClient;

namespace KT2000.Api.Services
{
    // ============ ĐỊNH KHOẢN — HUẤN LUYỆN LẠI MODEL ============
    //
    // Xuất Data Training ra JSON rồi gọi train.py, sinh model_v3.joblib mới.
    //
    // TÁCH HẲN khỏi DkPredictService, dù cả hai đều chạy Python: đoán là việc HẰNG NGÀY
    // (4 giây, đọc model có sẵn), huấn luyện là việc HẰNG TUẦN (một phút, ghi đè model
    // cho TOÀN hệ thống). Gộp một service thì sớm muộn cũng có người gọi nhầm cái nặng.
    //
    // Chỗ dễ hiểu lầm nhất của cả màn Định khoản: bấm Auto Accounting New KHÔNG huấn
    // luyện lại. Nó chỉ mở model có sẵn ra hỏi. Những gì người dùng đẩy về Data Training chỉ
    // vào được model sau khi CHẠY CÁI NÀY.
    public class DkTrainService
    {
        private readonly TenantDbResolver _resolver;
        private readonly IConfiguration _config;
        private readonly ILogger<DkTrainService> _log;

        public DkTrainService(TenantDbResolver resolver, IConfiguration config,
                              ILogger<DkTrainService> log)
        { _resolver = resolver; _config = config; _log = log; }

        // MỘT lượt huấn luyện tại một thời điểm, cho cả tiến trình.
        //
        // Không phải để tiết kiệm sức máy: hai lượt chạy song song sẽ cùng ghi vào
        // model_v3.joblib, và cái file 40 MB ấy hỏng nửa chừng thì mọi lần bấm Auto sau
        // đó đều chết, không ai hiểu vì sao. Static vì model là tài nguyên toàn cục,
        // không thuộc riêng request nào.
        private static readonly SemaphoreSlim _khoa = new(1, 1);

        public sealed class KetQuaTrain
        {
            public int SoMau { get; set; }          // dòng ACTIVE đã xuất
            public int SoLop { get; set; }          // số tài khoản model học được
            public double DoChinhXac { get; set; }  // đo trên 15% giữ lại
            public double GiaySo { get; set; }
            public List<string> Lop { get; } = new();
        }

        public async Task<KetQuaTrain> HuanLuyenAsync(string user, CancellationToken ct)
        {
            if (!await _khoa.WaitAsync(0, ct))
                throw new InvalidOperationException(
                    "Đang có một lượt huấn luyện chạy dở — đợi nó xong đã.");
            try
            {
                return await ChayAsync(user, ct);
            }
            finally { _khoa.Release(); }
        }

        private async Task<KetQuaTrain> ChayAsync(string user, CancellationToken ct)
        {
            string py = _config["Paths:PythonExe"]
                ?? throw new InvalidOperationException("Thiếu cấu hình Paths:PythonExe");
            if (!File.Exists(py))
                throw new InvalidOperationException($"Không thấy python.exe tại: {py}");

            string script = _config["Paths:DkTrainScript"]
                ?? Path.Combine(AppContext.BaseDirectory, "tools", "dinh_khoan", "train.py");
            if (!File.Exists(script))
                throw new InvalidOperationException($"Không thấy train.py tại: {script}");

            string models = _config["Paths:DkModels"]
                ?? throw new InvalidOperationException("Thiếu cấu hình Paths:DkModels");
            Directory.CreateDirectory(models);

            // ---- 1. Xuất Data Training ----
            //
            // CHỈ status = 'ACTIVE'. Dòng xung đột chưa giải thích phải nằm ngoài model —
            // đó là toàn bộ tác dụng của luật CHO_GIAI_THICH, bỏ điều kiện này là luật
            // thành vô nghĩa.
            //
            // ORDER BY id ASC là BẮT BUỘC: train.py khử trùng lặp theo "last write wins",
            // nên bản ghi sau phải đến sau. Đảo thứ tự là model học phải nhãn cũ.
            var items = new List<object>();
            var dsLop = new HashSet<string>(StringComparer.Ordinal);
            using (var conn = new SqlConnection(_resolver.GetPubConnection()))
            {
                await conn.OpenAsync(ct);
                using var cmd = new SqlCommand(
                    @"SELECT ten_uni, vao_ra, ma_donvi, label
                        FROM dbo.DK_DATA_TRAIN
                       WHERE status = 'ACTIVE'
                       ORDER BY id ASC", conn)
                { CommandTimeout = 300 };
                using var r = await cmd.ExecuteReaderAsync(ct);
                while (await r.ReadAsync(ct))
                {
                    items.Add(new
                    {
                        ten = r.GetString(0), vr = r.GetString(1),
                        dv = r.GetString(2), label = r.GetString(3),
                    });
                    dsLop.Add(r.GetString(3));
                }
            }

            if (items.Count == 0)
                throw new InvalidOperationException(
                    "Data Training đang rỗng — chưa có gì để huấn luyện.");

            string thuMuc = Path.Combine(
                _config["Paths:JobsRoot"] ?? Path.GetTempPath(), "dk_train");
            Directory.CreateDirectory(thuMuc);
            string fIn = Path.Combine(
                thuMuc, $"TRAIN_{DateTime.Now:yyyyMMdd_HHmmss}.json");
            await using (var fs = File.Create(fIn))
                await JsonSerializer.SerializeAsync(fs, new { items },
                                                    cancellationToken: ct);

            _log.LogInformation("Định khoản: {User} huấn luyện lại từ {N} dòng ACTIVE",
                                user, items.Count);

            // ---- 2. Chạy train.py ----
            var psi = new ProcessStartInfo
            {
                FileName = py,
                WorkingDirectory = Path.GetDirectoryName(script)!,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
                CreateNoWindow = true,
            };
            foreach (var a in new[] { script, "--input", fIn, "--models", models })
                psi.ArgumentList.Add(a);
            psi.Environment["PYTHONIOENCODING"] = "utf-8";

            using var proc = new Process { StartInfo = psi };
            var log = new System.Text.StringBuilder();
            proc.OutputDataReceived += (_, e) => { if (e.Data != null) log.AppendLine(e.Data); };
            proc.ErrorDataReceived += (_, e) => { if (e.Data != null) log.AppendLine("[stderr] " + e.Data); };
            proc.Start();
            proc.BeginOutputReadLine();
            proc.BeginErrorReadLine();
            await proc.WaitForExitAsync(ct);

            if (proc.ExitCode != 0)
                throw new InvalidOperationException(
                    $"train.py lỗi (mã {proc.ExitCode}): {Cuoi(log.ToString(), 600)}");

            // ---- 3. Đọc kết quả ----
            //
            // Số liệu lấy từ last_train_stats.json chứ KHÔNG bóc từ log: log là để người
            // xem, đổi một dòng print là mọi phép bóc tách vỡ hết.
            string fStats = Path.Combine(models, "last_train_stats.json");
            if (!File.Exists(fStats))
                throw new InvalidOperationException(
                    "train.py chạy xong nhưng không thấy last_train_stats.json");

            using var doc = JsonDocument.Parse(await File.ReadAllTextAsync(fStats, ct));
            var g = doc.RootElement;
            var kq = new KetQuaTrain
            {
                SoMau = Lay(g, "n_samples", items.Count),
                SoLop = Lay(g, "n_classes", dsLop.Count),
                DoChinhXac = g.TryGetProperty("accuracy", out var acc) ? acc.GetDouble() : 0,
                GiaySo = g.TryGetProperty("elapsed_sec", out var giay) ? giay.GetDouble() : 0,
            };
            if (g.TryGetProperty("classes", out var cls) && cls.ValueKind == JsonValueKind.Array)
                foreach (var x in cls.EnumerateArray())
                    kq.Lop.Add(x.GetString() ?? "");

            // Giữ file JSON đã xuất, không xoá: huấn luyện xong mà kết quả tệ thì đây là
            // bằng chứng DUY NHẤT về việc model đã học từ đúng những dòng nào.
            _log.LogInformation("Định khoản: huấn luyện xong — {N} mẫu, {K} lớp, "
                              + "độ chính xác {Acc}, {Giay}s", kq.SoMau, kq.SoLop,
                                kq.DoChinhXac, kq.GiaySo);
            return kq;
        }

        private static int Lay(JsonElement g, string ten, int macDinh)
            => g.TryGetProperty(ten, out var v) && v.TryGetInt32(out int n) ? n : macDinh;

        private static string Cuoi(string s, int n) => s.Length <= n ? s : s[^n..];
    }
}
