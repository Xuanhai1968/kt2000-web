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

        // NT-01: hướng lấy và số tải THỰC TẾ, đọc thẳng từ status.json thay vì bắt
        // người dùng đoán qua câu message.
        public string Huong { get; set; } = "";          // VAO / RA / VAO+RA
        public int TaiOk { get; set; }                   // XML tải thành công
        public int TaiLoi { get; set; }                  // XML tải hỏng (mọi loại)
        public int SoFile { get; set; }                  // total_files khi script báo xong

        // Tách hai loại "không tải được" — gộp lại thì lần nào cũng thấy "lỗi" mà
        // không ai biết cái nào đáng đi tìm.
        public int KhongCoGoc { get; set; }   // HTTP 500 "không tồn tại hồ sơ gốc" — HỢP LỆ
        public int LoiThat { get; set; }      // 429 / 504 / mạng hỏng — phải xem lại
        public string NguonDs { get; set; } = "";        // excel | search

        // NT-03: kết quả pha NẠP chạy ngay sau pha lấy, trong cùng một lượt
        public string PhaNap { get; set; } = "";         // "" / dang_nap / xong / loi
        public int NapMoi { get; set; }
        public int NapCapNhat { get; set; }
        public int NapLoi { get; set; }
        public string? NapThongDiep { get; set; }
    }

    public class PhienLay
    {
        public bool DangChay { get; set; }
        public string? NguoiChay { get; set; }
        public DateTime? BatDau { get; set; }
        // Hướng người dùng YÊU CẦU lúc bấm Lấy: vao | ra | all. Khác với TienDoLay.Huong
        // (đọc từ status.json, chỉ có sau khi script chạy được một lúc). Cần cái này để
        // màn Đầu vào và màn Đầu ra không hiện tiến độ của nhau — cả hệ thống chỉ có
        // MỘT phiên chạy, không lọc thì hai màn cùng nhìn thấy đúng một bảng.
        public string Huong { get; set; } = "";
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
        // NT-03: lấy xong là nạp luôn, không còn bước hai. xoaTruocKhiGhi đi kèm xuống
        // tận pha nạp vì người dùng chọn nó ở cùng một thanh nút với nút Lấy.
        public PhienLay BatDauPhien(List<(Guid Id, string Code)> dsDonVi,
                                    int nam, int thangBd, int thangKt, string huong,
                                    bool xoaTruocKhiGhi, string nguoiChay,
                                    bool tangDan = false)
        {
            if (!_khoaPhien.Wait(0))
                throw new ArgumentException("Đang có phiên lấy hóa đơn chạy dở — chờ xong hoặc bấm Dừng");

            try
            {
                KiemTraCauHinh();

                // Chuẩn hóa MỘT LẦN ở cửa vào rồi dùng biến này xuyên suốt. Để mỗi chỗ
                // tự ?? "vao" thì sớm muộn có chỗ quên, và hướng lệch nhau giữa phiên
                // với tiến trình con là loại lỗi rất khó nhìn ra.
                huong = string.IsNullOrWhiteSpace(huong) ? "vao" : huong.Trim().ToLowerInvariant();

                var phien = new PhienLay
                {
                    DangChay = true, NguoiChay = nguoiChay, BatDau = DateTime.Now,
                    Huong = huong,
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
                _ = Task.Run(() => ChayTuanTu(phien, huong, xoaTruocKhiGhi, nguoiChay,
                                              tangDan, token));
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

        private async Task ChayTuanTu(PhienLay phien, string huong, bool xoaTruoc,
                                      string nguoiChay, bool tangDan,
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
                    await ChayMotLuot(muc, huong, xoaTruoc, nguoiChay, tangDan, token);
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

        private async Task ChayMotLuot(TienDoLay muc, string huong, bool xoaTruoc,
                                       string nguoiChay, bool tangDan,
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
            // jobId là TÊN job, không kèm thư mục. Script tự chèn tầng NAM<năm> (nó đọc
            // năm ra từ chính tên job), nên trước đây truyền "NAM2026\T5_..." xuống là
            // tầng NAM bị chèn hai lần → sinh cây NAM2026\NAM2026\ rỗng bên cạnh cây thật.
            string jobId = $"T{muc.Thang}_{muc.Nam}_{muc.Code}";
            string jobDir = Path.Combine(jobsRoot, muc.Code, $"NAM{muc.Nam}", jobId);
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
                "--loai", huong.Equals("all", StringComparison.OrdinalIgnoreCase) ? "all"
                        : huong.Equals("ra",  StringComparison.OrdinalIgnoreCase) ? "ra"
                        : "vao",
                "--ma_donvi", muc.Code,
                "--job_id", jobId,
                "--save_dir", jobsRoot,
                "--status", statusFile,
                "--events", Path.Combine(jobDir, "events.jsonl"),
                "--stagedir", Path.Combine(jobDir, "stage"),
            }) psi.ArgumentList.Add(a);

            // [ĐANG THỬ] chế độ tăng dần: script hợp nhất với Excel lần trước rồi bỏ tải
            // những hóa đơn đã có XML. Không truyền cờ thì script chạy y hệt trước đây.
            if (tangDan) psi.ArgumentList.Add("--tang_dan");

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

            // NT-03: lấy xong là nạp luôn, cùng một lượt. Chỉ nạp khi pha lấy thành công —
            // lấy hỏng mà vẫn nạp thì nạp lại đúng dữ liệu cũ của lần chạy trước, người
            // dùng nhìn con số lại tưởng lần này có kết quả.
            if (muc.TrangThai == "xong")
                await NapNgay(muc, huong, xoaTruoc, nguoiChay);

            muc.KetThuc = DateTime.Now;
            await GhiNhatKyLuot(muc, nguoiChay);
        }

        // Pha 2 của một lượt: đưa dữ liệu vừa tải vào HOA_DON / HOA_DON_LINE.
        // Hỏng ở đây KHÔNG hạ trạng thái lượt xuống "loi": file đã tải về nằm nguyên
        // trên đĩa, nạp lại được. Trộn hai loại hỏng vào một ô thì lần sau không biết
        // phải tải lại hay chỉ cần nạp lại.
        private async Task NapNgay(TienDoLay muc, string huong, bool xoaTruoc, string nguoiChay)
        {
            muc.PhaNap = "dang_nap";
            muc.NapThongDiep = "Đang nạp vào database…";
            try
            {
                using var scope = _scopeFactory.CreateScope();
                var import = scope.ServiceProvider.GetRequiredService<ImportService>();
                var kq = await import.ImportJob(new Models.ImportJobRequest
                {
                    TenantId = muc.TenantId, Nam = muc.Nam, Thang = muc.Thang,
                    Huong = huong, XoaTruocKhiGhi = xoaTruoc,
                }, nguoiChay);

                muc.NapMoi = kq.Inserted;
                muc.NapCapNhat = kq.Updated;
                muc.NapLoi = kq.Errors.Count;
                muc.PhaNap = "xong";
                muc.NapThongDiep = $"Nạp: mới {kq.Inserted}, cập nhật {kq.Updated}"
                    + (kq.LechTong > 0 ? $", lệch Σ {kq.LechTong} HĐ nằm lại raw\\" : "")
                    + (kq.KhongCoGoc > 0 ? $", {kq.KhongCoGoc} HĐ không có gốc TCT" : "");
            }
            catch (Exception ex)
            {
                muc.PhaNap = "loi";
                muc.NapThongDiep = "Lấy xong nhưng KHÔNG nạp được: " + ex.Message;
                _log.LogError(ex, "Nạp tự động hỏng cho {Code} T{Thang}", muc.Code, muc.Thang);
            }
        }

        // NT-07: một dòng nhật ký cho mỗi lượt, để màn hình mở lên là thấy ngay lịch sử.
        // Ghi vào ActivityLog sẵn có — luật #7 của repo, không đẻ bảng mới.
        private async Task GhiNhatKyLuot(TienDoLay muc, string nguoiChay)
        {
            try
            {
                string chiTiet =
                    $"{muc.Code} T{muc.Thang} {(string.IsNullOrEmpty(muc.Huong) ? "VAO" : muc.Huong)}"
                    + $" · tải {muc.TaiOk}/{(muc.Tong > 0 ? muc.Tong : muc.TaiOk)}"
                    + (muc.KhongCoGoc > 0 ? $" ({muc.KhongCoGoc} không có gốc)" : "")
                    + (muc.LoiThat > 0 ? $" (LỖI {muc.LoiThat})" : "")
                    + (string.IsNullOrEmpty(muc.NapThongDiep) ? "" : " · " + muc.NapThongDiep)
                    + (string.IsNullOrEmpty(muc.Loi) ? "" : " · LỖI: " + muc.Loi);

                using var scope = _scopeFactory.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
                await db.Database.ExecuteSqlRawAsync(
                    @"INSERT INTO ActivityLog (UserName, TenantId, Nam, Thang, Action, Detail)
                      VALUES ({0}, {1}, {2}, {3}, {4}, {5})",
                    nguoiChay, muc.TenantId, muc.Nam, muc.Thang,
                    muc.TrangThai == "xong" ? "LAY_HD" : "LAY_HD_LOI",
                    chiTiet.Length > 500 ? chiTiet[..500] : chiTiet);
            }
            catch (Exception ex)
            {
                // Mất một dòng lịch sử còn hơn làm hỏng cả phiên đang chạy
                _log.LogWarning(ex, "Không ghi được nhật ký lượt lấy HĐ");
            }
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
                // NT-01: số THỰC TẾ tải được, tách khỏi "đã duyệt tới hóa đơn thứ mấy"
                if (r.TryGetProperty("ok", out var ok) && ok.TryGetInt32(out var o)) muc.TaiOk = o;
                if (r.TryGetProperty("err", out var er) && er.TryGetInt32(out var e)) muc.TaiLoi = e;
                if (r.TryGetProperty("total_files", out var tf) && tf.TryGetInt32(out var f)) muc.SoFile = f;
                // Bộ đếm cộng dồn cả job — script nay giữ chúng trong 'state' nên mọi
                // lần ghi đều mang theo, kể cả lần ghi cuối cùng.
                if (r.TryGetProperty("tong_hd", out var th) && th.TryGetInt32(out var h2)) muc.Tong = h2 > 0 ? h2 : muc.Tong;
                if (r.TryGetProperty("tai_ok", out var tk) && tk.TryGetInt32(out var k2)) muc.TaiOk = k2;
                if (r.TryGetProperty("khong_co_goc", out var kg) && kg.TryGetInt32(out var g2)) muc.KhongCoGoc = g2;
                if (r.TryGetProperty("loi_that", out var lt) && lt.TryGetInt32(out var l2)) muc.LoiThat = l2;
                if (r.TryGetProperty("nguon_ds", out var nd)) muc.NguonDs = nd.GetString() ?? "";
                if (r.TryGetProperty("loai_xuat", out var lx))
                {
                    string lv = lx.GetString() ?? "";
                    muc.Huong = lv.Equals("all", StringComparison.OrdinalIgnoreCase) ? "VAO+RA"
                              : lv.Equals("ra",  StringComparison.OrdinalIgnoreCase) ? "RA"
                              : "VAO";
                }
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
