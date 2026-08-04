using System.Diagnostics;
using System.Text.Json;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using KT2000.Api.Data;

namespace KT2000.Api.Services
{
    // Tiến độ của MỘT lượt (đơn vị × tháng) trong phiên lấy hóa đơn
    public class TienDoLay
    {
        public Guid TenantId { get; set; }
        public string Code { get; set; } = "";
        public int Nam { get; set; }
        public int Thang { get; set; }
        public string TrangThai { get; set; } = "cho";   // cho / dang_chay / xong / loi / huy
        public string GiaiDoan { get; set; } = "";       // state trong status.json
        public string ThongDiep { get; set; } = "";
        public int DaTai { get; set; }
        public int Tong { get; set; }
        public string? Loi { get; set; }
        public DateTime? BatDau { get; set; }
        public DateTime? KetThuc { get; set; }
    }

    public class PhienLay
    {
        public bool DangChay { get; set; }
        public string? NguoiChay { get; set; }
        public DateTime? BatDau { get; set; }
        public List<TienDoLay> Cac { get; set; } = new();
    }

    // Đốc công cho TRA_CUU_HDDT_2_0.py: dựng tham số, chạy python.exe TUẦN TỰ từng
    // (đơn vị × tháng), và đọc status.json của script để báo tiến độ về giao diện.
    //
    // Vì sao tuần tự: mỗi lượt mở một Chrome đăng nhập cổng TCT. Chạy song song vừa
    // nặng máy vừa dễ bị cổng coi là bất thường — đúng nhịp làm tay bên VFP.
    //
    // Vì sao mỗi tháng một lượt: script đổ mọi kết quả vào MỘT thư mục job và tên file
    // Excel tổng không mang tháng. Chạy gộp nhiều tháng thì các tháng đè nhau, và
    // Importer (bước 2) sẽ không tìm thấy thư mục T<tháng>_<năm>_<mã> như nó mong đợi.
    public class TctFetchService
    {
        private readonly IServiceScopeFactory _scopeFactory;
        private readonly IConfiguration _config;
        private readonly IDataProtector _protector;
        private readonly ILogger<TctFetchService> _log;

        private readonly SemaphoreSlim _khoaPhien = new(1, 1);
        private CancellationTokenSource? _cts;
        private volatile PhienLay _phien = new();

        public TctFetchService(IServiceScopeFactory scopeFactory, IConfiguration config,
                               IDataProtectionProvider dp, ILogger<TctFetchService> log)
        {
            _scopeFactory = scopeFactory;
            _config = config;
            _protector = dp.CreateProtector("KT2000.TctCredential.v1");
            _log = log;
        }

        public PhienLay LayTienDo() => _phien;

        public string MaHoa(string matKhauTho) => _protector.Protect(matKhauTho);

        // ---------- Khởi động một phiên ----------
        public PhienLay BatDauPhien(List<(Guid Id, string Code)> dsDonVi,
                                    int nam, int thangBd, int thangKt, string huong,
                                    string nguoiChay)
        {
            if (!_khoaPhien.Wait(0))
                throw new ArgumentException("Đang có phiên lấy hóa đơn chạy dở — chờ xong hoặc bấm Dừng");

            try
            {
                KiemTraCauHinh();

                var phien = new PhienLay
                {
                    DangChay = true, NguoiChay = nguoiChay, BatDau = DateTime.Now,
                };
                foreach (var dv in dsDonVi)
                    for (int t = thangBd; t <= thangKt; t++)
                        phien.Cac.Add(new TienDoLay
                        {
                            TenantId = dv.Id, Code = dv.Code, Nam = nam, Thang = t,
                        });
                _phien = phien;

                _cts = new CancellationTokenSource();
                var token = _cts.Token;
                // Chạy nền, KHÔNG await — API trả về ngay, giao diện hỏi tiến độ sau
                _ = Task.Run(() => ChayTuanTu(phien, huong, nguoiChay, token));
                return phien;
            }
            catch
            {
                _khoaPhien.Release();
                throw;
            }
        }

        public void DungPhien() => _cts?.Cancel();

        private void KiemTraCauHinh()
        {
            foreach (var k in new[] { "Paths:PythonExe", "Paths:JobsRoot" })
                if (string.IsNullOrWhiteSpace(_config[k]))
                    throw new ArgumentException($"Chưa cấu hình {k} trong appsettings.json");

            string py = _config["Paths:PythonExe"]!;
            if (!File.Exists(py))
                throw new ArgumentException($"Không thấy python.exe tại: {py}");
            if (!File.Exists(DuongDanScript()))
                throw new ArgumentException($"Không thấy script tải HĐ tại: {DuongDanScript()}");
        }

        // Script đi kèm bản build (thư mục tools cạnh file thực thi), đè được bằng cấu hình
        private string DuongDanScript() =>
            _config["Paths:TctScript"]
            ?? Path.Combine(AppContext.BaseDirectory, "tools", "TRA_CUU_HDDT_2_0.py");

        private async Task ChayTuanTu(PhienLay phien, string huong, string nguoiChay,
                                      CancellationToken token)
        {
            try
            {
                foreach (var muc in phien.Cac)
                {
                    if (token.IsCancellationRequested)
                    {
                        muc.TrangThai = "huy";
                        muc.ThongDiep = "Người dùng đã dừng phiên";
                        continue;
                    }
                    await ChayMotLuot(muc, huong, nguoiChay, token);
                }
            }
            catch (Exception ex)
            {
                _log.LogError(ex, "Phiên lấy HĐ hỏng giữa chừng");
            }
            finally
            {
                phien.DangChay = false;
                _khoaPhien.Release();
            }
        }

        private async Task ChayMotLuot(TienDoLay muc, string huong, string nguoiChay,
                                       CancellationToken token)
        {
            muc.TrangThai = "dang_chay";
            muc.BatDau = DateTime.Now;
            muc.ThongDiep = "Đang chuẩn bị…";

            string? matKhau, mst;
            using (var scope = _scopeFactory.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
                var tenant = await db.Tenants
                    .Where(x => x.Id == muc.TenantId)
                    .Select(x => new { x.TaxCode, x.MatKhauHddt })
                    .FirstOrDefaultAsync(token);
                mst = tenant?.TaxCode;
                matKhau = string.IsNullOrEmpty(tenant?.MatKhauHddt)
                    ? null : GiaiMa(tenant!.MatKhauHddt!);
            }

            if (string.IsNullOrWhiteSpace(mst))
            { KetThucLoi(muc, "Đơn vị chưa có MST — bổ sung ở màn hình Đơn vị khách hàng"); return; }
            if (string.IsNullOrWhiteSpace(matKhau))
            { KetThucLoi(muc, "Chưa khai mật khẩu cổng TCT cho đơn vị này"); return; }

            // Thư mục job phải TRÙNG khuôn mà Importer bước 2 đọc:
            // <JobsRoot>\<MÃ>\NAM<năm>\T<tháng>_<năm>_<MÃ>\
            string jobsRoot = _config["Paths:JobsRoot"]!;
            string jobId = Path.Combine($"NAM{muc.Nam}", $"T{muc.Thang}_{muc.Nam}_{muc.Code}");
            string jobDir = Path.Combine(jobsRoot, muc.Code, jobId);
            Directory.CreateDirectory(jobDir);

            string statusFile = Path.Combine(jobDir, "status.json");
            // Xóa status cũ để không đọc nhầm kết quả lần chạy trước làm tiến độ lần này
            try { if (File.Exists(statusFile)) File.Delete(statusFile); } catch { }

            var psi = new ProcessStartInfo
            {
                FileName = _config["Paths:PythonExe"]!,
                WorkingDirectory = Path.GetDirectoryName(DuongDanScript())!,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
                CreateNoWindow = true,
            };
            foreach (var a in new[]
            {
                DuongDanScript(), "--run",
                "--mst", mst!,
                "--thang_bd", muc.Thang.ToString(),
                "--thang_kt", muc.Thang.ToString(),
                "--nam", muc.Nam.ToString(),
                "--loai", huong.Equals("all", StringComparison.OrdinalIgnoreCase) ? "all" : "vao",
                "--ma_donvi", muc.Code,
                "--job_id", jobId,
                "--save_dir", jobsRoot,
                "--status", statusFile,
                "--events", Path.Combine(jobDir, "events.jsonl"),
                "--stagedir", Path.Combine(jobDir, "stage"),
            }) psi.ArgumentList.Add(a);

            string? xmlMap = _config["Paths:XmlMap"];
            if (!string.IsNullOrWhiteSpace(xmlMap))
            { psi.ArgumentList.Add("--xml_map"); psi.ArgumentList.Add(xmlMap); }

            // Vá #1 của script: mật khẩu đi bằng biến môi trường, KHÔNG lên dòng lệnh
            // (tham số dòng lệnh lộ nguyên văn trong Task Manager).
            psi.Environment["HDDT_PASSWORD"] = matKhau!;
            psi.Environment["KT2000_LOG_DIR"] = Path.Combine(jobDir, "logs");

            using var proc = new Process { StartInfo = psi };
            var nhatKy = new System.Text.StringBuilder();
            proc.OutputDataReceived += (_, e) => { if (e.Data != null) nhatKy.AppendLine(e.Data); };
            proc.ErrorDataReceived += (_, e) => { if (e.Data != null) nhatKy.AppendLine("[stderr] " + e.Data); };

            try
            {
                proc.Start();
                proc.BeginOutputReadLine();
                proc.BeginErrorReadLine();
            }
            catch (Exception ex)
            { KetThucLoi(muc, "Không khởi chạy được python.exe: " + ex.Message); return; }

            // Vừa chờ tiến trình, vừa đọc status.json để cập nhật tiến độ
            while (!proc.HasExited)
            {
                if (token.IsCancellationRequested)
                {
                    try { proc.Kill(entireProcessTree: true); } catch { }
                    KetThucLoi(muc, "Đã dừng theo yêu cầu");
                    return;
                }
                DocStatus(statusFile, muc);
                await Task.Delay(1500, CancellationToken.None);
            }
            DocStatus(statusFile, muc);

            try
            {
                await File.WriteAllTextAsync(Path.Combine(jobDir, "backend_run.log"),
                    nhatKy.ToString(), CancellationToken.None);
            }
            catch { /* log phụ, hỏng cũng không sao */ }

            // KHÔNG dùng exit code: script luôn thoát 1 vì có sys.exit(1) trong finally.
            // Sự thật nằm ở state trong status.json.
            if (muc.GiaiDoan.StartsWith("DONE", StringComparison.OrdinalIgnoreCase)
                || muc.GiaiDoan.Equals("PARSING_DONE", StringComparison.OrdinalIgnoreCase))
            {
                muc.TrangThai = "xong";
            }
            else if (muc.GiaiDoan.Equals("ERROR", StringComparison.OrdinalIgnoreCase))
            {
                muc.TrangThai = "loi";
                muc.Loi = string.IsNullOrWhiteSpace(muc.ThongDiep) ? "Script báo lỗi" : muc.ThongDiep;
            }
            else
            {
                muc.TrangThai = "loi";
                muc.Loi = $"Tiến trình dừng ở giai đoạn '{muc.GiaiDoan}' — xem backend_run.log trong thư mục job";
            }
            muc.KetThuc = DateTime.Now;
        }

        private static void KetThucLoi(TienDoLay muc, string loi)
        {
            muc.TrangThai = "loi";
            muc.Loi = loi;
            muc.ThongDiep = loi;
            muc.KetThuc = DateTime.Now;
        }

        // status.json được script ghi kiểu ghi-tạm-rồi-đổi-tên, nhưng vẫn có lúc bắt
        // được file dở — đọc hỏng thì bỏ qua, vòng sau đọc lại.
        private static void DocStatus(string path, TienDoLay muc)
        {
            try
            {
                if (!File.Exists(path)) return;
                using var fs = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite);
                using var doc = JsonDocument.Parse(fs);
                var r = doc.RootElement;
                if (r.TryGetProperty("state", out var st)) muc.GiaiDoan = st.GetString() ?? "";
                if (r.TryGetProperty("message", out var ms)) muc.ThongDiep = ms.GetString() ?? "";
                if (r.TryGetProperty("total", out var tt) && tt.TryGetInt32(out var t)) muc.Tong = t;
                if (r.TryGetProperty("downloaded", out var dl) && dl.TryGetInt32(out var d)) muc.DaTai = d;
            }
            catch { /* file đang được ghi dở */ }
        }

        private string GiaiMa(string maHoa)
        {
            try { return _protector.Unprotect(maHoa); }
            catch (Exception ex)
            {
                _log.LogError(ex, "Không giải mã được mật khẩu TCT — khóa Data Protection có thể đã đổi");
                return "";
            }
        }
    }
}
