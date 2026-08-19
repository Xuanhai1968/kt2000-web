using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using KT2000.Api.Data;
using KT2000.Api.Services;

namespace KT2000.Api.Controllers
{
    [Route("api/thue")]
    [ApiController]
    [Authorize]
    public class ThueController : ControllerBase
    {
        private readonly ThueService _thue;
        private readonly RaSoatService _raSoat;
        private readonly ToKhaiService _toKhai;
        private readonly BangToKhaiService _bangToKhai;
        private readonly GhiChuHdLienQuan _ghiChuLq;
        private readonly IConfiguration _config;
        private readonly AppDbContext _db;
        private readonly ImportService _import;
        private readonly IMemoryCache _cache;
        private readonly ToKhaiHaiQuanService _hqan;
        public ThueController(ThueService thue, RaSoatService raSoat, ToKhaiService toKhai,
                              IConfiguration config, AppDbContext db, ImportService import,
                              BangToKhaiService bangToKhai,
                              IMemoryCache cache,
                               GhiChuHdLienQuan ghiChuLq,
                               ToKhaiHaiQuanService hqan
                              )
        {
            _thue = thue;
            _raSoat = raSoat;
            _toKhai = toKhai;
            _bangToKhai = bangToKhai;
            _ghiChuLq = ghiChuLq;
            _config = config;
            _db = db;
            _import = import;
            _cache = cache;
            _hqan = hqan;
        }

        private async Task<string?> MstDonVi()
        {
            var code = TenantCode();
            return await _db.Tenants
                .Where(t => t.Code == code)
                .Select(t => t.TaxCode)
                .FirstOrDefaultAsync();
        }

        private string TenantCode() =>
            User.FindFirst("tenant_code")?.Value
            ?? throw new UnauthorizedAccessException("Token không có thông tin đơn vị");

        private string CurrentUser() => User.FindFirst("login_name")?.Value ?? "?";

        private int FiscalYear() =>
            int.TryParse(User.FindFirst("fiscal_year")?.Value, out var y)
                ? y
                : throw new UnauthorizedAccessException("Token không có năm làm việc");

        private IActionResult? ChanNeuLaNoiBo() =>
            User.FindFirst("tenant_type")?.Value == "noibo"
                ? StatusCode(403, new
                { message = "Đơn vị nội bộ không có sổ thuế — dùng màn Phiếu xuất/nhập" })
                : null;

        private static string? ChuanHoaHuong(string? huong) =>
            huong?.Trim().ToUpperInvariant() switch
            {
                "VAO" or "VÀO" => "VAO",
                "RA" => "RA",
                _ => null,
            };

        [HttpGet("hoa-don")]
        public async Task<IActionResult> DanhSach([FromQuery] string? huong,
                                                  [FromQuery] int? thang,
                                                  [FromQuery] string? tu,
                                                  [FromQuery] int gioiHan = 200)
        {
            var chan = ChanNeuLaNoiBo();
            if (chan != null) return chan;
            return Ok(await _thue.DanhSach(TenantCode(), FiscalYear(),
                                           ChuanHoaHuong(huong), thang,
                                           string.IsNullOrWhiteSpace(tu) ? null : tu,
                                           Math.Clamp(gioiHan, 1, 2000)));
        }

        [HttpGet("hoa-don/doi-chieu")]
        public async Task<IActionResult> DoiChieu([FromQuery] string? huong)
        {
            var chan = ChanNeuLaNoiBo();
            if (chan != null) return chan;
            return Ok(await _thue.LayDoiChieu(TenantCode(), FiscalYear(), ChuanHoaHuong(huong)));
        }

        [HttpPost("hoa-don/dung-ban-goc")]
        public async Task<IActionResult> DungBanGoc([FromQuery] string? huong)
        {
            var chan = ChanNeuLaNoiBo();
            if (chan != null) return chan;

            var code = TenantCode();
            var tenantId = await _db.Tenants.Where(t => t.Code == code)
                                            .Select(t => (Guid?)t.Id).FirstOrDefaultAsync();
            if (tenantId == null)
                return BadRequest(new { message = $"Không tìm thấy đơn vị {code}" });

            return Ok(await _import.DungLaiBanGoc(
                tenantId.Value, FiscalYear(), ChuanHoaHuong(huong) ?? "VAO",
                User.Identity?.Name ?? "he_thong"));
        }

        [HttpGet("hoa-don/{maHd}")]
        public async Task<IActionResult> ChiTiet(string maHd)
        {
            var chan = ChanNeuLaNoiBo();
            if (chan != null) return chan;
            var hd = await _thue.LayChiTiet(TenantCode(), FiscalYear(), maHd);
            return hd == null
                ? NotFound(new { message = $"Không tìm thấy hóa đơn {maHd}" })
                : Ok(hd);
        }

        public record LinesNhieuRequest(List<string>? MaHds);

        [HttpPost("hoa-don/lines")]
        public async Task<IActionResult> LinesNhieu([FromBody] LinesNhieuRequest req)
        {
            var chan = ChanNeuLaNoiBo();
            if (chan != null) return chan;

            var ds = (req?.MaHds ?? new List<string>())
                     .Where(s => !string.IsNullOrWhiteSpace(s))
                     .Select(s => s.Trim())
                     .Distinct()
                     .Take(500)
                     .ToList();

            return Ok(await _thue.LayLinesNhieu(TenantCode(), FiscalYear(), ds));
        }

        [HttpGet("bao-cao")]
        public async Task<IActionResult> BaoCao([FromQuery] int? thang)
        {
            var chan = ChanNeuLaNoiBo();
            if (chan != null) return chan;

            // Tháng ngoài 1..12 coi như không lọc, thay vì ném lỗi làm trắng màn hình
            var ky = thang is >= 1 and <= 12 ? thang : null;
            return Ok(await _thue.BaoCaoThue(TenantCode(), FiscalYear(), ky));
        }

        [HttpGet("ra-soat-cheo")]
        public async Task<IActionResult> RaSoatCheo([FromQuery] int? nam, [FromQuery] int? thang)
        {
            if (User.FindFirst("tenant_type")?.Value != "internal")
                return StatusCode(403, new
                { message = "Chỉ đơn vị quản trị nội bộ mới xem được bảng rà soát chéo" });

            var ky = thang is >= 1 and <= 12 ? thang.Value : DateTime.Today.Month;
            var year = nam is >= 2000 and <= 2100 ? nam.Value : FiscalYear();
            var donVi = await _db.Tenants
                .AsNoTracking()
                .Where(t => t.TenantType != "internal" && t.TenantType != "noibo"
                         && t.IsActive)
                .OrderBy(t => t.Code)
                .Select(t => new { t.Code, t.Name, t.KhaiQuy, t.TaxCode })
                .ToListAsync(HttpContext.RequestAborted);

            var ds = await _bangToKhai.Lap(
                donVi.Select(x => new BangToKhaiService.DonViKy
                { Ma = x.Code, KhaiQuy = x.KhaiQuy }).ToList(),
                year, ky, HttpContext.RequestAborted);
            var hoSo = donVi.ToDictionary(x => x.Code, x => x, StringComparer.OrdinalIgnoreCase);
            foreach (var d in ds)
                if (hoSo.TryGetValue(d.MaDonVi, out var t))
                { d.TenDonVi = t.Name; d.Mst = t.TaxCode; }

            return Ok(new { nam = year, thang = ky, dong = ds });
        }

        [HttpGet("bc-to-khai")]
        public async Task<IActionResult> BcToKhai(
            [FromQuery] int? nam, [FromQuery] string? ma, [FromQuery] int? thang)
        {
            if (User.FindFirst("tenant_type")?.Value != "internal")
                return StatusCode(403, new
                { message = "Chỉ đơn vị quản trị nội bộ mới xem được danh sách tờ khai" });

            var year = nam is >= 2000 and <= 2100 ? nam.Value : FiscalYear();
            var ds = await _bangToKhai.DsToKhai(year, ma, thang, HttpContext.RequestAborted);

            var ten = await _db.Tenants.AsNoTracking()
                .Select(t => new { t.Code, t.Name })
                .ToDictionaryAsync(x => x.Code, x => x.Name,
                                   StringComparer.OrdinalIgnoreCase,
                                   HttpContext.RequestAborted);
            foreach (var d in ds)
                if (ten.TryGetValue(d.MaDonVi, out var n)) d.TenDonVi = n;

            return Ok(new { nam = year, dong = ds });
        }

        [HttpPost("bc-to-khai/nap-xml")]
        [RequestSizeLimit(50 * 1024 * 1024)]
        public async Task<IActionResult> NapXmlDaNop(IFormFile? file)
        {
            if (User.FindFirst("tenant_type")?.Value != "internal")
                return StatusCode(403, new
                { message = "Chỉ đơn vị quản trị nội bộ mới nạp được tờ khai đã nộp" });

            if (file == null || file.Length == 0)
                return BadRequest(new { message = "Chưa chọn file" });

            var duoi = Path.GetExtension(file.FileName).ToLowerInvariant();
            if (duoi is not (".xml" or ".zip"))
                return BadRequest(new { message = "Chỉ nhận file .xml hoặc .zip" });

            var theoMst = await _db.Tenants.AsNoTracking()
                .Where(t => t.TaxCode != null && t.IsActive
                         && t.TenantType != "internal" && t.TenantType != "noibo")
                .Select(t => new { t.Code, t.TaxCode })
                .ToListAsync(HttpContext.RequestAborted);

            var ketQua = new List<object>();
            var nguoi = CurrentUser();

            async Task XuLyMot(string tenFile, string noiDung)
            {
                var (mst, thang, nam, ct43) = ToKhaiService.DocTomTatXmlToKhai(noiDung);
                var ct = ToKhaiService.DocChiTieuXml(noiDung);
                if (mst == null || thang == null || nam == null)
                {
                    ketQua.Add(new
                    {
                        tenFile,
                        ok = false,
                        message = "Không đọc được MST/kỳ trong file"
                    });
                    return;
                }

                // So phần SỐ của MST: cổng có thể khai chi nhánh dạng "0100686174-634".
                var goc = RaSoatService.GocMst(mst);
                var dv = theoMst.FirstOrDefault(
                    x => RaSoatService.GocMst(x.TaxCode) == goc);
                if (dv == null)
                {
                    ketQua.Add(new
                    {
                        tenFile,
                        ok = false,
                        message = $"Không có đơn vị nào mang MST {mst}"
                    });
                    return;
                }

                var gan = await _bangToKhai.GanXmlDaNop(
                    dv.Code, nam.Value, thang.Value, 0, tenFile, null, ct, nguoi,
                    HttpContext.RequestAborted);

                if (!gan)
                {
                    ketQua.Add(new
                    {
                        tenFile,
                        ok = false,
                        message = $"{dv.Code} chưa có tờ khai kỳ {thang:00}/{nam} "
                                + "trong hệ thống — hãy tạo tờ khai trước"
                    });
                    return;
                }

                var lech = await _bangToKhai.SoSanhVoiTct(
                    dv.Code, nam.Value, thang.Value, 0, HttpContext.RequestAborted);

                ketQua.Add(new
                {
                    tenFile,
                    ok = true,
                    message = lech.Count == 0
                        ? $"{dv.Code} kỳ {thang:00}/{nam} — KHỚP hoàn toàn "
                          + $"(chỉ tiêu 43: {ct43:N0})"
                        : $"{dv.Code} kỳ {thang:00}/{nam} — LỆCH {lech.Count} chỉ tiêu: "
                          + string.Join(", ", lech.Take(6).Select(
                              x => $"[{x.Ma}] tự lập {x.TuLap:N0} ≠ TCT {x.Tct:N0}")),
                    lech
                });
            }

            try
            {
                if (duoi == ".xml")
                {
                    using var doc = new StreamReader(file.OpenReadStream());
                    await XuLyMot(file.FileName, await doc.ReadToEndAsync());
                }
                else
                {
                    using var luong = file.OpenReadStream();
                    using var zip = new System.IO.Compression.ZipArchive(
                        luong, System.IO.Compression.ZipArchiveMode.Read);
                    foreach (var muc in zip.Entries)
                    {
                        if (!muc.Name.EndsWith(".xml", StringComparison.OrdinalIgnoreCase))
                            continue;
                        using var d = new StreamReader(muc.Open());
                        await XuLyMot(muc.Name, await d.ReadToEndAsync());
                    }
                    if (ketQua.Count == 0)
                        return BadRequest(new { message = "File .zip không có file .xml nào" });
                }
            }
            catch (Exception ex)
            {
                return BadRequest(new { message = $"Không đọc được file: {ex.Message}" });
            }

            var soOk = ketQua.Count(x => (bool)x.GetType().GetProperty("ok")!.GetValue(x)!);
            return Ok(new { soFile = ketQua.Count, soOk, ketQua });
        }

        [HttpGet("duong-dan-to-khai")]
        public async Task<IActionResult> DuongDanToKhai(
            [FromQuery] string? ma, [FromQuery] int thang, [FromQuery] int? nam)
        {
            var code = await DonViThaoTac(ma);
            if (code == null)
                return NotFound(new { message = $"Không có đơn vị khai thuế mã {ma}" });
            if (thang is < 1 or > 12)
                return BadRequest(new { message = "Kỳ kê khai phải trong khoảng tháng 1..12" });

            var year = nam is >= 2000 and <= 2100 ? nam.Value : FiscalYear();
            var duong = _bangToKhai.ThuMucToKhai(code, year, thang);
            if (duong == null)
                return BadRequest(new
                { message = "Chưa khai Paths:ScanDocRoot1 trong cấu hình máy chủ" });

            return Ok(new
            {
                maDonVi = code,
                nam = year,
                thang,
                duongDan = duong,
                daCo = Directory.Exists(duong),   // chưa có thì lúc lưu sẽ tự tạo
            });
        }

        /// <summary>
        /// GET api/thue/tk-hai-quan?thang=&amp;ma=&amp;nam= — đọc kho tờ khai HẢI QUAN của
        /// kỳ, trả tổng trị giá + tổng thuế GTGT hàng nhập khẩu để điền [23a]/[24a].
        /// </summary>
        /// <remarks>
        /// CHỈ ĐỌC, KHÔNG tự ghi vào tờ khai: kế toán xem chi tiết từng tờ khai hải quan
        /// rồi tự quyết có lấy số hay không — hai ô [23a]/[24a] vẫn gõ tay được.
        ///
        /// Vì sao cần: thuế khâu nhập khẩu không có trong bảng kê hóa đơn điện tử, nên
        /// tờ khai lập tự động luôn thiếu phần này (xem ToKhaiHaiQuanService).
        ///
        /// bqTruoc=false để TẮT việc loại tờ khai đã tính ở kỳ trước — chỉ dùng khi cần
        /// nhìn nguyên trạng thư mục, không nên dùng để lấy số vào tờ khai.
        /// </remarks>
        [HttpGet("tk-hai-quan")]
        public async Task<IActionResult> TkHaiQuan(
            [FromQuery] string? ma, [FromQuery] int thang, [FromQuery] int? nam,
            [FromQuery] bool bqTruoc = true)
        {
            var code = await DonViThaoTac(ma);
            if (code == null)
                return NotFound(new { message = $"Không có đơn vị khai thuế mã {ma}" });
            if (thang is < 1 or > 12)
                return BadRequest(new { message = "Kỳ kê khai phải trong khoảng tháng 1..12" });

            var year = nam is >= 2000 and <= 2100 ? nam.Value : FiscalYear();

            // Tờ khai hải quan hay bị lưu ở cả hai thư mục tháng (đã gặp 3 lần trong
            // 7 tháng). Không lọc thì kỳ sau cộng lại số của kỳ trước.
            var daDung = bqTruoc ? _hqan.SoToKhaiTruocKy(code, year, thang) : null;

            var kq = _hqan.DocKy(code, year, thang, daDung);
            return Ok(kq);
        }

        /// <summary>
        /// GET api/thue/duyet-kho-to-khai?duong=… — duyệt cây thư mục KHO TỜ KHAI để
        /// người dùng nhìn tận mắt trước khi chốt chỗ lưu.
        /// </summary>
        /// <remarks>
        /// CHỈ ĐỌC và bị nhốt trong Paths:ScanDocRoot1 (rào nằm trong DuyetKho).
        /// Bỏ trống tham số duong = đứng ở gốc kho.
        ///
        /// Gate claim y như luu-to-khai-tct: đây là cửa sổ nhìn vào ổ đĩa máy chủ,
        /// không phải số liệu nghiệp vụ — chỉ quản trị nội bộ mới được mở.
        /// </remarks>
        [HttpGet("duyet-kho-to-khai")]
        public IActionResult DuyetKhoToKhai([FromQuery] string? duong)
        {
            if (User.FindFirst("tenant_type")?.Value != "internal")
                return StatusCode(403, new
                { message = "Chỉ đơn vị quản trị nội bộ mới duyệt được kho tờ khai" });

            try
            {
                return Ok(_bangToKhai.DuyetKho(duong));
            }
            catch (ArgumentException ex)
            { return BadRequest(new { message = ex.Message }); }
            catch (UnauthorizedAccessException ex)
            { return StatusCode(403, new { message = ex.Message }); }
            catch (DirectoryNotFoundException ex)
            { return NotFound(new { message = ex.Message }); }
            catch (Exception ex)
            { return BadRequest(new { message = $"Không đọc được thư mục: {ex.Message}" }); }
        }

        [HttpPost("hd-lien-quan-khac-ky")]
        public async Task<IActionResult> HdLienQuanKhacKy(
            [FromQuery] int thang, [FromQuery] int? nam,
            [FromQuery] string? ma, [FromQuery] bool chiXem = true)
        {
            if (User.FindFirst("tenant_type")?.Value != "internal")
                return StatusCode(403, new
                { message = "Chỉ đơn vị quản trị nội bộ mới chạy được chức năng này" });

            if (thang is < 1 or > 12)
                return BadRequest(new { message = "Kỳ kê khai phải trong khoảng tháng 1..12" });

            var year = nam is >= 2000 and <= 2100 ? nam.Value : FiscalYear();

            List<string> dsMa;
            if (!string.IsNullOrWhiteSpace(ma))
            {
                var code = await DonViThaoTac(ma);
                if (code == null)
                    return NotFound(new { message = $"Không có đơn vị khai thuế mã {ma}" });
                dsMa = new List<string> { code };
            }
            else
            {
                dsMa = await _db.Tenants.AsNoTracking()
                    .Where(t => t.TenantType != "internal" && t.TenantType != "noibo"
                             && t.IsActive)
                    .OrderBy(t => t.Code)
                    .Select(t => t.Code)
                    .ToListAsync(HttpContext.RequestAborted);
            }

            var kq = await _ghiChuLq.QuetNhieuDonVi(
                dsMa, year, thang, CurrentUser(), chiXem, HttpContext.RequestAborted);

            // Chỉ ghi nhật ký khi THẬT SỰ ghi vào sổ — xem trước thì không có gì để vết.
            if (!chiXem && kq.SoDaGhi > 0)
            {
                try
                {
                    // TenantId để NULL: việc này quét nhiều đơn vị cùng lúc nên không
                    // gắn được vào một đơn vị nào. Chi tiết nằm ở cột Detail.
                    await _db.Database.ExecuteSqlRawAsync(
                        @"INSERT INTO ActivityLog (UserName, TenantId, Nam, Action, Detail)
                          VALUES ({0}, {1}, {2}, {3}, {4})",
                        CurrentUser(), DBNull.Value, year, "GHI_CHU_HD_LIEN_QUAN",
                        $"Kỳ {thang:00}/{year} — đánh dấu {kq.SoDaGhi} hóa đơn "
                      + $"trên {kq.SoDonVi} đơn vị");
                }
                catch { /* mất một dòng nhật ký còn hơn báo hỏng việc đã xong */ }
            }

            return Ok(new
            {
                nam = year,
                thang,
                chiXem,
                soDonVi = kq.SoDonVi,
                soHoaDon = kq.SoHoaDon,
                soDaGhi = kq.SoDaGhi,
                soBoQua = kq.SoBoQua,
                duongDanFile = kq.DuongDanFile,
                loi = kq.Loi,
                dong = kq.Dong,
                message = kq.SoHoaDon == 0
                    ? $"Kỳ {thang:00}/{year}: không có hóa đơn thay thế/điều chỉnh khác kỳ nào"
                    : chiXem
                        ? $"Tìm thấy {kq.SoHoaDon} hóa đơn trên {kq.SoDonVi} đơn vị — "
                          + "mới chỉ XEM TRƯỚC, chưa ghi vào sổ"
                        : $"Đã đánh dấu {kq.SoDaGhi} hóa đơn"
                          + (kq.SoBoQua > 0 ? $", bỏ qua {kq.SoBoQua} (đã đánh dấu từ trước)" : ""),
            });
        }

        [HttpPost("luu-to-khai-tct")]
        [RequestSizeLimit(50 * 1024 * 1024)]
        public async Task<IActionResult> LuuToKhaiTct(
            IFormFile? file, [FromQuery] string? ma,
            [FromQuery] int thang, [FromQuery] int? nam,
            [FromQuery] string? ghiChu = null, [FromQuery] string? thuMuc = null)
        {
            if (User.FindFirst("tenant_type")?.Value != "internal")
                return StatusCode(403, new
                { message = "Chỉ đơn vị quản trị nội bộ mới lưu được tờ khai TCT" });

            var code = await DonViThaoTac(ma);
            if (code == null)
                return NotFound(new { message = $"Không có đơn vị khai thuế mã {ma}" });
            if (thang is < 1 or > 12)
                return BadRequest(new { message = "Kỳ kê khai phải trong khoảng tháng 1..12" });
            if (file == null || file.Length == 0)
                return BadRequest(new { message = "Chưa chọn file" });

            var duoi = Path.GetExtension(file.FileName).ToLowerInvariant();
            if (duoi is not (".xml" or ".zip"))
                return BadRequest(new { message = "Chỉ nhận file .xml hoặc .zip" });

            var year = nam is >= 2000 and <= 2100 ? nam.Value : FiscalYear();

            // ---------- 1. Đọc nội dung XML (mở .zip nếu cần) để KIỂM CHÉO ----------
            string noiDung;
            try
            {
                if (duoi == ".xml")
                {
                    using var doc = new StreamReader(file.OpenReadStream());
                    noiDung = await doc.ReadToEndAsync();
                }
                else
                {
                    using var luong = file.OpenReadStream();
                    using var zip = new System.IO.Compression.ZipArchive(
                        luong, System.IO.Compression.ZipArchiveMode.Read);
                    var muc = zip.Entries.FirstOrDefault(
                        e => e.Name.EndsWith(".xml", StringComparison.OrdinalIgnoreCase));
                    if (muc == null)
                        return BadRequest(new { message = "File .zip không có file .xml nào" });
                    using var d = new StreamReader(muc.Open());
                    noiDung = await d.ReadToEndAsync();
                }
            }
            catch (Exception ex)
            {
                return BadRequest(new { message = $"Không đọc được file: {ex.Message}" });
            }

            var (mstFile, thangFile, namFile, _) =
                ToKhaiService.DocTomTatXmlToKhai(noiDung);

            var canhBao = new List<string>();
            var (mstDv, _, _) = await HoSoDonVi(code);
            if (mstFile != null && !string.IsNullOrWhiteSpace(mstDv)
                && RaSoatService.GocMst(mstFile) != RaSoatService.GocMst(mstDv))
                canhBao.Add($"MST trong file ({mstFile}) khác MST của {code} ({mstDv})");
            if (thangFile != null && namFile != null
                && (thangFile != thang || namFile != year))
                canhBao.Add($"Kỳ trong file ({thangFile:00}/{namFile}) khác kỳ đang chọn "
                          + $"({thang:00}/{year})");

            // ---------- 2. Lưu file vào kho ----------
            string duongDan;
            try
            {
                using var luong = file.OpenReadStream();
                duongDan = await _bangToKhai.LuuFileToKhai(
                    code, year, thang, file.FileName, luong, HttpContext.RequestAborted,
                    thuMuc);
            }
            catch (ArgumentException ex)
            { return BadRequest(new { message = ex.Message }); }
            catch (UnauthorizedAccessException ex)
            { return StatusCode(403, new { message = ex.Message }); }
            catch (Exception ex)
            { return BadRequest(new { message = $"Không ghi được file vào kho: {ex.Message}" }); }

            var ct = ToKhaiService.DocChiTieuXml(noiDung);
            var chuThich = string.IsNullOrWhiteSpace(ghiChu)
                ? null
                : ghiChu.Trim()[..Math.Min(ghiChu.Trim().Length, 500)];

            var gan = await _bangToKhai.GanXmlDaNop(
                code, year, thang, 0, Path.GetFileName(duongDan), duongDan, ct,
                CurrentUser(), HttpContext.RequestAborted, chuThich);

            var lech = new List<BangToKhaiService.ChiTieuLech>();
            if (gan)
                lech = await _bangToKhai.SoSanhVoiTct(
                    code, year, thang, 0, HttpContext.RequestAborted);

            try
            {
                var tid = await _db.Tenants.AsNoTracking()
                    .Where(t => t.Code == code).Select(t => t.Id)
                    .FirstOrDefaultAsync(HttpContext.RequestAborted);
                await _db.Database.ExecuteSqlRawAsync(
                    @"INSERT INTO ActivityLog (UserName, TenantId, Nam, Action, Detail)
                      VALUES ({0}, {1}, {2}, {3}, {4})",
                    CurrentUser(), tid, year, "LUU_TO_KHAI_TCT",
                    $"Kỳ {thang:00}/{year} — lưu {Path.GetFileName(duongDan)}");
            }
            catch { /* mất một dòng nhật ký còn hơn báo hỏng việc đã xong */ }

            return Ok(new
            {
                duongDan,
                daNapSoLieu = gan,
                soLech = lech.Count,
                lech,
                canhBao,
                message = !gan
                    ? $"Đã lưu file vào kho, nhưng kỳ {thang:00}/{year} chưa có tờ khai "
                      + "trong hệ thống nên chưa nạp được số liệu"
                    : lech.Count == 0
                        ? "Đã lưu và nạp số liệu — KHỚP hoàn toàn với bản tự lập"
                        : $"Đã lưu và nạp số liệu — LỆCH {lech.Count} chỉ tiêu so với bản tự lập",
            });
        }


        [HttpGet("to-khai-tay")]
        public async Task<IActionResult> DocToKhaiTay(
            [FromQuery] string? ma, [FromQuery] int thang,
            [FromQuery] int? nam, [FromQuery] int lanNop = 0)
        {
            var code = await DonViThaoTac(ma);
            if (code == null)
                return NotFound(new { message = $"Không có đơn vị khai thuế mã {ma}" });
            if (thang is < 1 or > 12)
                return BadRequest(new { message = "Kỳ kê khai phải trong khoảng tháng 1..12" });

            var year = nam is >= 2000 and <= 2100 ? nam.Value : FiscalYear();
            var tk = await _bangToKhai.DocToKhaiTay(code, year, thang, lanNop,
                                                    HttpContext.RequestAborted);

            var khaiQuy = await _db.Tenants.AsNoTracking()
                .Where(t => t.Code == code).Select(t => t.KhaiQuy)
                .FirstOrDefaultAsync(HttpContext.RequestAborted);
            var (ct22Truoc, nguon) = await _bangToKhai.TonDauTuKyTruoc(
                code, year, thang, khaiQuy, HttpContext.RequestAborted);
            if (tk == null)
            {
                if (ct22Truoc == null) return NoContent();
                return Ok(new
                {
                    maDonVi = code,
                    nam = year,
                    thang,
                    lanNop,
                    ct22 = ct22Truoc,
                    nguonCt22 = nguon,
                });
            }

            if ((tk.Ct22 == 0m) && ct22Truoc != null) tk.Ct22 = ct22Truoc.Value;
            return Ok(new { tk, nguonCt22 = nguon });
        }

        [HttpGet("doi-chieu")]
        public async Task<IActionResult> DoiChieu(
            [FromQuery] string? ma, [FromQuery] int thang,
            [FromQuery] int? nam, [FromQuery] int lanNop = 0)
        {
            var code = await DonViThaoTac(ma);
            if (code == null)
                return NotFound(new { message = $"Không có đơn vị khai thuế mã {ma}" });
            if (thang is < 1 or > 12)
                return BadRequest(new { message = "Kỳ kê khai phải trong khoảng tháng 1..12" });

            var year = nam is >= 2000 and <= 2100 ? nam.Value : FiscalYear();
            var khaiQuy = await _db.Tenants.AsNoTracking()
                .Where(t => t.Code == code).Select(t => t.KhaiQuy)
                .FirstOrDefaultAsync(HttpContext.RequestAborted);

            Models.ToKhaiGtgtDto? tuSo = null;
            try
            {
                var (mst, ten, diaChi) = await HoSoDonVi(code);
                tuSo = await _toKhai.Lap(code, year, thang, mst, ten, diaChi);
            }
            catch (SoChuaMoException) { }
            catch (Microsoft.Data.SqlClient.SqlException) { }

            var ds = await _bangToKhai.DoiChieuBaNguon(
                code, year, thang, khaiQuy, lanNop, tuSo, HttpContext.RequestAborted);

            return Ok(new
            {
                maDonVi = code,
                nam = year,
                thang,
                lanNop,
                coSo = tuSo != null,
                coTct = ds.Any(x => x.Tct != null),
                soLech = ds.Count(x => x.CoLech),
                dong = ds,
            });
        }

        [HttpPost("to-khai-tay")]
        public async Task<IActionResult> LuuToKhaiTay([FromBody] Models.ToKhaiTayDto? tk)
        {
            if (tk == null)
                return BadRequest(new { message = "Thiếu nội dung tờ khai" });
            if (tk.Thang is < 1 or > 12)
                return BadRequest(new { message = "Kỳ kê khai phải trong khoảng tháng 1..12" });
            if (tk.LanNop is < 0 or > 99)
                return BadRequest(new { message = "Lần nộp phải trong khoảng 0..99" });

            if (tk.Ct21 != 1 && tk.ChiTieu().All(x => (decimal)x.Gia == 0m))
                return BadRequest(new
                {
                    message = "Tờ khai chưa có số liệu — nhập ít nhất một chỉ tiêu, "
                            + "hoặc đánh dấu [21] nếu kỳ này không phát sinh mua bán",
                });

            var code = await DonViThaoTac(tk.MaDonVi);
            if (code == null)
                return NotFound(new { message = $"Không có đơn vị khai thuế mã {tk.MaDonVi}" });
            tk.MaDonVi = code;

            if (tk.Nam is < 2000 or > 2100) tk.Nam = FiscalYear();
            if (string.IsNullOrWhiteSpace(tk.Mst) || string.IsNullOrWhiteSpace(tk.TenNnt))
            {
                var (mst, ten, diaChi) = await HoSoDonVi(code);
                if (string.IsNullOrWhiteSpace(tk.Mst)) tk.Mst = mst;
                if (string.IsNullOrWhiteSpace(tk.TenNnt)) tk.TenNnt = ten;
                if (string.IsNullOrWhiteSpace(tk.DiaChiNnt)) tk.DiaChiNnt = diaChi;
            }

            await _bangToKhai.LuuToKhai(tk, CurrentUser(), HttpContext.RequestAborted);
            return Ok(new { message = $"Đã lưu tờ khai {tk.Thang:00}/{tk.Nam} của {code}" });
        }

        [HttpGet("bao-cao-don-vi")]
        public async Task<IActionResult> BaoCaoDonVi(
            [FromQuery] string? ma, [FromQuery] int? nam, [FromQuery] int? thang)
        {
            if (User.FindFirst("tenant_type")?.Value != "internal")
                return StatusCode(403, new
                { message = "Chỉ đơn vị quản trị nội bộ mới xem được sổ của đơn vị khác" });

            if (string.IsNullOrWhiteSpace(ma))
                return BadRequest(new { message = "Thiếu mã đơn vị" });

            if (await DonViThaoTac(ma) == null)
                return NotFound(new { message = $"Không có đơn vị khai thuế mã {ma}" });

            var ky = thang is >= 1 and <= 12 ? thang : null;
            var year = nam is >= 2000 and <= 2100 ? nam.Value : FiscalYear();
            return Ok(await _thue.BaoCaoThue(ma, year, ky));
        }

        /// <param name="maDonVi">

        private async Task<(string Mst, string Ten, string? DiaChi)> HoSoDonVi(
            string? maDonVi = null)
        {
            var code = string.IsNullOrWhiteSpace(maDonVi) ? TenantCode() : maDonVi;
            var t = await _db.Tenants
                .AsNoTracking()
                .Where(x => x.Code == code)
                .Select(x => new { x.TaxCode, x.Name, x.Address })
                .FirstOrDefaultAsync(HttpContext.RequestAborted);
            return (t?.TaxCode ?? "", t?.Name ?? code, t?.Address);
        }


        private async Task<string?> DonViThaoTac(string? maDonVi)
        {
            if (User.FindFirst("tenant_type")?.Value != "internal"
                || string.IsNullOrWhiteSpace(maDonVi))
                return TenantCode();

            var hopLe = await _db.Tenants.AsNoTracking()
                .AnyAsync(t => t.Code == maDonVi && t.IsActive
                            && t.TenantType != "internal" && t.TenantType != "noibo",
                          HttpContext.RequestAborted);
            return hopLe ? maDonVi : null;
        }

        [HttpGet("kho")]
        public async Task<IActionResult> DoKho([FromQuery] int thang,
                                               CancellationToken huy)
        {
            var chan = ChanNeuLaNoiBo();
            if (chan != null) return chan;

            if (thang is < 1 or > 12)
                return BadRequest(new { message = "Kỳ phải trong khoảng tháng 1..12" });

            var code = TenantCode();
            var nam = FiscalYear();
            var congViecKho = _raSoat.DoKhoAsync(code, nam, thang, huy);
            var mstDv = await MstDonVi();
            var kho = await congViecKho;
            var (tuExcel, loiExcel) = await RaSoatService.DocNhieuBangKe(
                kho.ExcelRa.Concat(kho.ExcelVao), mstDv, huy);

            var tongExcel = new
            {
                soHdVao = tuExcel.Count(x => x.Huong != "RA"),
                soHdRa = tuExcel.Count(x => x.Huong == "RA"),
                hangVao = tuExcel.Where(x => x.Huong != "RA").Sum(x => x.TienHang),
                vatVao = tuExcel.Where(x => x.Huong != "RA").Sum(x => x.TienVat),
                hangRa = tuExcel.Where(x => x.Huong == "RA").Sum(x => x.TienHang),
                vatRa = tuExcel.Where(x => x.Huong == "RA").Sum(x => x.TienVat),
            };

            // --- Đối chiếu Excel với SỔ ---
            var doiChieu = tuExcel.Count > 0
                ? await _raSoat.Soat(code, nam, thang, tuExcel, huy)
                : null;

            return Ok(new
            {
                thang,
                nam,
                soFile = new
                {
                    xmlRa = kho.XmlRa.Count,
                    xmlVao = kho.XmlVao.Count,
                    htmlRa = kho.HtmlRa.Count,
                    htmlVao = kho.HtmlVao.Count,
                    excelRa = kho.ExcelRa.Count,
                    excelVao = kho.ExcelVao.Count,
                },
                thuMucDaDo = kho.DaDo,
                tongExcel,
                loiExcel,
                doiChieu,
            });
        }
        /// <param name="chiTong">
        [HttpGet("kho/bang-ke")]
        public async Task<IActionResult> KhoBangKe([FromQuery] int thang,
                                                   [FromQuery] string? huong,
                                                   [FromQuery] string? maDonVi,
                                                   [FromQuery] bool chiTong,
                                                   CancellationToken huy)
        {
            var laNoiBoQuanTri = User.FindFirst("tenant_type")?.Value == "internal";
            if (!laNoiBoQuanTri)
            {
                var chan = ChanNeuLaNoiBo();
                if (chan != null) return chan;
                maDonVi = null;
            }

            if (thang is < 1 or > 12)
                return BadRequest(new { message = "Kỳ phải trong khoảng tháng 1..12" });

            var chieu = (huong ?? "").Trim().ToUpperInvariant();
            if (chieu != "RA" && chieu != "VAO")
                return BadRequest(new { message = "huong phải là RA hoặc VAO" });

            var code = await DonViThaoTac(maDonVi);
            if (code == null)
                return NotFound(new { message = $"Không có đơn vị khai thuế mã {maDonVi}" });

            var nam = FiscalYear();

            try
            {
                var congViecKho = _cache.GetOrCreateAsync(
                    $"kho|{code}|{nam}|{thang}",
                    muc =>
                    {
                        muc.AbsoluteExpirationRelativeToNow = TimeSpan.FromMinutes(1);
                        muc.Size = 1;
                        return _raSoat.DoKhoAsync(code, nam, thang, huy);
                    });
                var (mstDv, _, _) = await HoSoDonVi(code);
                var kho = await congViecKho ?? new RaSoatService.KhoKy();
                var fileCanDoc = chieu == "RA" ? kho.ExcelRa : kho.ExcelVao;
                if (fileCanDoc.Count == 0)
                    return Ok(new
                    {
                        thang,
                        nam,
                        huong = chieu,
                        soFile = 0,
                        thuMucDaDo = kho.DaDo,
                        tong = new { soHd = 0, tienHang = 0m, tienVat = 0m },
                        dong = Array.Empty<object>(),
                        loi = new List<string>(),
                        doiChieu = (Models.KetQuaRaSoatDto?)null,
                    });

                var vanTay = string.Join("|", fileCanDoc
                    .OrderBy(p => p, StringComparer.OrdinalIgnoreCase)
                    .Select(p =>
                    {
                        var fi = new FileInfo(p);
                        return $"{p}:{fi.LastWriteTimeUtc.Ticks}:{fi.Length}";
                    }));
                var khoaCache = $"bangke|{code}|{nam}|{thang}|{chieu}|{mstDv}|{vanTay}";

                var (tuExcel, loiExcel) = await _cache.GetOrCreateAsync(khoaCache,
                    async muc =>
                    {
                        muc.AbsoluteExpirationRelativeToNow = TimeSpan.FromHours(1);
                        muc.Size = fileCanDoc.Count;
                        return await RaSoatService.DocNhieuBangKe(fileCanDoc, mstDv, huy);
                    });

                var dung = tuExcel.Where(x => (x.Huong ?? chieu) == chieu).ToList();

                // chiHuong: sổ chỉ lấy đúng chiều đang soát. Bảng kê cổng tách riêng hai
                // chiều, mà sổ có cả hai — không lọc thì toàn bộ hóa đơn chiều kia bị
                // báo là "có trong sổ, thiếu trong bảng kê".
                var doiChieu = dung.Count > 0 && !chiTong
                    ? await _raSoat.Soat(code, nam, thang, dung, huy, chieu)
                    : null;

                return Ok(new
                {
                    thang,
                    nam,
                    huong = chieu,
                    soFile = fileCanDoc.Count,
                    thuMucDaDo = kho.DaDo,
                    tong = new
                    {
                        soHd = dung.Count,
                        tienHang = dung.Sum(x => x.TienHang),
                        tienVat = dung.Sum(x => x.TienVat),
                    },
                    // BR-TK-20 — từng dòng của bảng kê, để màn rà soát cộng lại vế
                    // Excel theo đúng những hóa đơn người dùng tick chọn. Không có
                    // danh sách này thì vế Excel luôn là CẢ KỲ, đem trừ phần đã chọn
                    // ra một số lệch vô nghĩa.
                    //
                    // Chỉ 4 trường: đủ để tra khớp (ký hiệu + số HĐ) và cộng tiền.
                    // Không trả cả HoaDonFileDto vì tên đối tác/MST/ngày đã có sẵn
                    // trong lưới sổ rồi, gửi lại chỉ phình response.
                    dong = dung.Select(x => new
                    {
                        khhd = x.Khhd,
                        soHd = x.SoHd,
                        tienHang = x.TienHang,
                        tienVat = x.TienVat,
                    }),
                    loi = loiExcel,
                    doiChieu,
                });
            }
            catch (UnauthorizedAccessException ex)
            {
                return BadRequest(new { message = ex.Message });
            }
            catch (DirectoryNotFoundException ex)
            {
                return BadRequest(new { message = ex.Message });
            }
        }

        /// <summary>
        /// GET api/thue/hd-lech/mua-vao — hóa đơn MUA VÀO lệch giữa sổ và bảng kê cổng.
        /// </summary>
        /// <remarks>
        /// Tách hẳn khỏi bán ra (xem <see cref="HdLechBanRa"/>): hai lưới trên màn là hai
        /// bảng độc lập, mỗi bảng có nút riêng, bấm bên này không được đụng bên kia.
        /// </remarks>
        [HttpGet("hd-lech/mua-vao")]
        public Task<IActionResult> HdLechMuaVao([FromQuery] int thang,
                                                [FromQuery] string? maDonVi,
                                                CancellationToken huy)
            => HdLechTheoChieu("VAO", thang, maDonVi, huy);

        /// <summary>
        /// GET api/thue/hd-lech/ban-ra — hóa đơn BÁN RA lệch giữa sổ và bảng kê cổng.
        /// </summary>
        [HttpGet("hd-lech/ban-ra")]
        public Task<IActionResult> HdLechBanRa([FromQuery] int thang,
                                               [FromQuery] string? maDonVi,
                                               CancellationToken huy)
            => HdLechTheoChieu("RA", thang, maDonVi, huy);

        /// <summary>
        /// Lõi chung của hai endpoint trên — đọc kho Excel của kỳ, đối chiếu với sổ, rồi
        /// trả về danh sách hóa đơn lệch THEO ĐÚNG KHUÔN CỘT của lưới sổ.
        ///
        /// VÌ SAO TRẢ NGUYÊN DÒNG chứ không trả danh sách mã để client tự lọc: hóa đơn
        /// "có trong bảng kê mà sổ chưa có" KHÔNG có dòng nào trong lưới để lọc ra, nên
        /// cách lọc cũ luôn giấu mất đúng loại lệch nguy hiểm nhất — chính là loại đã
        /// làm sót HĐ 830 (DAT_VIET_THANH) và 51,8 triệu thuế mua vào (USA_MEVA).
        /// Ở đây dòng đó vẫn hiện, với CoTrongSo = false và tiền sổ = 0.
        /// </summary>
        private async Task<IActionResult> HdLechTheoChieu(
            string chieu, int thang, string? maDonVi, CancellationToken huy)
        {
            var laNoiBoQuanTri = User.FindFirst("tenant_type")?.Value == "internal";
            if (!laNoiBoQuanTri)
            {
                var chan = ChanNeuLaNoiBo();
                if (chan != null) return chan;
                maDonVi = null;
            }

            if (thang is < 1 or > 12)
                return BadRequest(new { message = "Kỳ phải trong khoảng tháng 1..12" });

            var code = await DonViThaoTac(maDonVi);
            if (code == null)
                return NotFound(new { message = $"Không có đơn vị khai thuế mã {maDonVi}" });

            var nam = FiscalYear();
            var kq = new Models.KetQuaHdLechDto { Nam = nam, Thang = thang, Huong = chieu };

            var kho = await _raSoat.DoKhoAsync(code, nam, thang, huy)
                      ?? new RaSoatService.KhoKy();
            var fileCanDoc = chieu == "RA" ? kho.ExcelRa : kho.ExcelVao;
            kq.SoFile = fileCanDoc.Count;
            kq.Nhan = $"kho {(chieu == "RA" ? "bán ra" : "mua vào")} / {fileCanDoc.Count} file";

            if (fileCanDoc.Count == 0)
            {
                kq.Loi.Add($"Không thấy file Excel bảng kê {(chieu == "RA" ? "bán ra" : "mua vào")} "
                         + $"của kỳ {thang}/{nam} trong kho");
                return Ok(kq);
            }

            var (mstDv, _, _) = await HoSoDonVi(code);
            var (tuExcel, loiExcel) = await RaSoatService.DocNhieuBangKe(fileCanDoc, mstDv, huy);
            kq.Loi.AddRange(loiExcel);

            var dung = tuExcel.Where(x => (x.Huong ?? chieu) == chieu).ToList();
            kq.SoHdFile = dung.Count;
            if (dung.Count == 0) return Ok(kq);

            var dc = await _raSoat.Soat(code, nam, thang, dung, huy, chieu);

            // Sổ theo ĐÚNG khuôn cột của lưới — dòng lệch phải đọc y hệt dòng gốc.
            var soSach = await _thue.BangKeMotChieu(code, nam, chieu, thang);
            kq.SoHdSo = soSach.Count;

            // Tổng CẢ KỲ hai bên — đây mới là số ảnh hưởng lên [23]/[24] của tờ khai.
            // Cộng riêng phần hóa đơn lệch KHÔNG ra con số này: sai số làm tròn nằm rải
            // ở cả những hóa đơn không bị coi là lệch (đo 19/08: phần lệch cho VAT 0đ,
            // trong khi cả kỳ thiếu 5.254đ).
            kq.TongHangSo = soSach.Sum(x => x.DoanhThuChuaVat);
            kq.TongVatSo = soSach.Sum(x => x.ThueGtgt);
            kq.TongHangFile = dung.Sum(x => x.TienHang);
            kq.TongVatFile = dung.Sum(x => x.TienVat);

            var theoMa = soSach.ToDictionary(x => x.MaHd, StringComparer.OrdinalIgnoreCase);
            var theoKhoa = new Dictionary<string, Models.BangKeHoaDonDto>(StringComparer.OrdinalIgnoreCase);
            foreach (var x in soSach)
                theoKhoa[KhoaLech(x.KhHd, x.SoHd)] = x;

            var dong = new List<Models.HoaDonLechDto>();
            var daCo = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            foreach (var v in dc.LechTien.Concat(dc.ThieuTrongFile).Concat(dc.ThieuTrongSo))
            {
                // Tra dòng sổ: ưu tiên mã (server trả sẵn ở nhánh lệch tiền), không có
                // thì tra ngược theo ký hiệu + số hóa đơn.
                Models.BangKeHoaDonDto? g = null;
                if (!string.IsNullOrWhiteSpace(v.MaHd)) theoMa.TryGetValue(v.MaHd!, out g);
                g ??= theoKhoa.GetValueOrDefault(KhoaLech(v.Khhd, v.SoHd));

                var khoa = g?.MaHd ?? KhoaLech(v.Khhd, v.SoHd);
                if (!daCo.Add(khoa)) continue;   // một hóa đơn chỉ hiện một dòng

                dong.Add(new Models.HoaDonLechDto
                {
                    MaHd = g?.MaHd ?? v.MaHd ?? "",
                    KhHd = g?.KhHd ?? v.Khhd,
                    SoHd = g?.SoHd ?? v.SoHd,
                    Ngay = g?.Ngay,
                    TenDoiTac = g?.TenDoiTac ?? v.TenDoiTac,
                    MstDoiTac = g?.MstDoiTac ?? v.Mst,
                    MatHang = g?.MatHang,
                    DoanhThuChuaVat = g?.DoanhThuChuaVat ?? 0m,
                    ThueSuat = g?.ThueSuat,
                    ThueGtgt = g?.ThueGtgt ?? 0m,
                    GhiChu = g?.GhiChu,
                    Loai = v.Loai,
                    MoTa = v.MoTa,
                    CoTrongSo = g != null,
                    TienHangFile = v.TienHangFile,
                    TienVatFile = v.TienVatFile,
                    TenFile = v.TenFile,
                });
            }

            // Lệch tiền lên trước (soi được ngay), rồi tới thiếu sổ, cuối là thiếu file.
            static int Uu(string loai) => loai switch
            {
                "lech-tien" => 0,
                "thieu-trong-so" => 1,
                _ => 2,
            };
            kq.Dong = dong.OrderBy(x => Uu(x.Loai))
                          .ThenBy(x => x.Ngay ?? DateTime.MaxValue)
                          .ThenBy(x => x.SoHd, StringComparer.Ordinal)
                          .Select((x, i) => { x.Stt = i + 1; return x; })
                          .ToList();
            kq.SoLech = kq.Dong.Count;
            return Ok(kq);
        }

        /// <summary>Khóa tra hóa đơn: ký hiệu bỏ mẫu số + số HĐ bỏ số 0 đệm.</summary>
        private static string KhoaLech(string? khhd, string? soHd)
            => $"{RaSoatService.ChuanKhhd(khhd)}|{ImportService.ChuanSoHd(soHd ?? "")}";

        /// <param name="maDonVi">

        [HttpPost("doc-bang-ke")]
        [RequestSizeLimit(30 * 1024 * 1024)]
        public async Task<IActionResult> DocBangKe(IFormFile? file, [FromQuery] string? maDonVi)
        {
            var laNoiBoQuanTri = User.FindFirst("tenant_type")?.Value == "internal";
            if (!laNoiBoQuanTri)
            {
                var chan = ChanNeuLaNoiBo();
                if (chan != null) return chan;
                maDonVi = null;
            }

            if (file == null || file.Length == 0)
                return BadRequest(new { message = "Chưa chọn file bảng kê" });

            var duoi = Path.GetExtension(file.FileName).ToLowerInvariant();
            if (duoi != ".xlsx")
                return BadRequest(new
                {
                    message = duoi == ".xls"
                        ? "File .xls (Excel 97-2003) chưa đọc được — mở bằng Excel rồi "
                        + "lưu lại thành .xlsx"
                        : "Chỉ nhận file Excel .xlsx",
                });

            try
            {
                var code = await DonViThaoTac(maDonVi);
                if (code == null)
                    return NotFound(new { message = $"Không có đơn vị khai thuế mã {maDonVi}" });
                var (mstDv, _, _) = await HoSoDonVi(code);

                using var luong = file.OpenReadStream();
                var ds = RaSoatService.DocBangKeExcel(luong, file.FileName, mstDv);
                return Ok(new { soDong = ds.Count, hoaDon = ds });
            }
            catch (Exception ex)
            {
                return BadRequest(new
                { message = $"Không đọc được bảng kê: {ex.Message}" });
            }
        }

        public record LapToKhaiRequest(string? XmlKyTruoc, List<string>? ChonHd = null);

        // Chặn body khổng lồ: một kỳ vài trăm hóa đơn, gửi lên hàng chục nghìn mã là
        // dấu hiệu client hỏng hoặc bị lợi dụng để bắt server băm chuỗi vô ích.
        private const int MaxChonHd = 20000;

        [HttpPost("to-khai")]
        public async Task<IActionResult> ToKhai([FromQuery] int thang,
                                                [FromQuery] string? maDonVi,
                                                [FromBody] LapToKhaiRequest? req)
        {
            if (User.FindFirst("tenant_type")?.Value != "internal")
            {
                var chan = ChanNeuLaNoiBo();
                if (chan != null) return chan;
            }

            if (thang is < 1 or > 12)
                return BadRequest(new { message = "Kỳ kê khai phải trong khoảng tháng 1..12" });

            var code = await DonViThaoTac(maDonVi);
            if (code == null)
                return NotFound(new { message = $"Không có đơn vị khai thuế mã {maDonVi}" });

            var (mst, ten, diaChi) = await HoSoDonVi(code);
            if (string.IsNullOrWhiteSpace(mst))
                return BadRequest(new
                { message = $"Đơn vị {code} chưa khai mã số thuế — không lập được tờ khai" });

            var nam = FiscalYear();

            if (!_toKhai.CoToKhaiKyTruoc(code, nam, thang, req?.XmlKyTruoc,
                                         out var thangTruoc, out var namTruoc))
                return Conflict(new
                {
                    message = $"Chưa có tờ khai kỳ trước (tháng {thangTruoc}/{namTruoc}) "
                            + "nên chưa lập được tờ khai kỳ này. Hãy tải file XML tờ khai "
                            + $"tháng {thangTruoc}/{namTruoc} lên — chỉ tiêu 43 của kỳ đó "
                            + "là chỉ tiêu 22 của kỳ này, và tờ khai đó cũng là khuôn "
                            + "mang thông tin cơ quan thuế mà sổ không lưu.",
                    thangTruoc,
                    namTruoc,
                });

            if (req?.ChonHd is { Count: > MaxChonHd })
                return BadRequest(new
                { message = $"Danh sách hóa đơn chọn quá dài (tối đa {MaxChonHd})" });

            return Ok(await _toKhai.Lap(code, nam, thang, mst, ten, diaChi,
                                        req?.XmlKyTruoc, req?.ChonHd));
        }

        [HttpPost("to-khai/xml")]
        public async Task<IActionResult> ToKhaiXml([FromQuery] int thang,
                                                   [FromQuery] string? maDonVi,
                                                   [FromBody] LapToKhaiRequest? req)
        {
            if (User.FindFirst("tenant_type")?.Value != "internal")
            {
                var chan = ChanNeuLaNoiBo();
                if (chan != null) return chan;
            }

            if (thang is < 1 or > 12)
                return BadRequest(new { message = "Kỳ kê khai phải trong khoảng tháng 1..12" });

            var code = await DonViThaoTac(maDonVi);
            if (code == null)
                return NotFound(new { message = $"Không có đơn vị khai thuế mã {maDonVi}" });

            var (mst, ten, diaChi) = await HoSoDonVi(code);
            if (string.IsNullOrWhiteSpace(mst))
                return BadRequest(new
                { message = $"Đơn vị {code} chưa khai mã số thuế — không lập được tờ khai" });

            var nam = FiscalYear();

            if (!_toKhai.CoToKhaiKyTruoc(code, nam, thang, req?.XmlKyTruoc,
                                         out var thangTruoc, out var namTruoc))
                return Conflict(new
                {
                    message = $"Chưa có tờ khai kỳ trước (tháng {thangTruoc}/{namTruoc}) "
                            + "nên chưa xuất được XML. Hãy tải file XML tờ khai kỳ đó lên.",
                    thangTruoc,
                    namTruoc,
                });

            if (req?.ChonHd is { Count: > MaxChonHd })
                return BadRequest(new
                { message = $"Danh sách hóa đơn chọn quá dài (tối đa {MaxChonHd})" });

            var tk = await _toKhai.Lap(code, nam, thang, mst, ten, diaChi,
                                       req?.XmlKyTruoc, req?.ChonHd);

            try
            {
                var doc = _toKhai.SinhXml(tk, req?.XmlKyTruoc);
                using var ms = new MemoryStream();
                var cai = new System.Xml.XmlWriterSettings
                {
                    Encoding = new System.Text.UTF8Encoding(false),
                    Indent = true,
                    IndentChars = "  ",
                };
                using (var w = System.Xml.XmlWriter.Create(ms, cai)) doc.Save(w);
                var noiDung = ms.ToArray();

                // Tải XML = CHỐT tờ khai: vừa trả file cho người dùng, vừa lưu bản đó
                // vào kho ScanDoc và ghi số liệu vào bảng TOKHAI.
                //
                // Vì sao gộp vào đây thay vì bắt bấm thêm nút "Lưu": bản XML tải về là
                // bản đem nộp thuế, nên kho và sổ phải giữ ĐÚNG bản đó. Tách hai thao
                // tác thì chỉ cần quên một lần là kho có file mà sổ không có số (hoặc
                // ngược lại), kỳ sau lấy ct22 sai mà không ai biết vì sao.
                //
                // Lưu HỎNG KHÔNG chặn việc tải: file XML vẫn phải về tay người dùng,
                // chỉ báo lại qua header để màn hình hiện cảnh báo.
                try
                {
                    using var luu = new MemoryStream(noiDung);
                    var duongDan = await _bangToKhai.LuuFileToKhai(
                        code, nam, thang, tk.TenFileXml, luu,
                        HttpContext.RequestAborted);

                    await _bangToKhai.LuuToKhai(ToKhaiTayTu(tk, code, nam, thang),
                                                CurrentUser(), HttpContext.RequestAborted);

                    Response.Headers["X-Da-Luu"] = "1";
                    Response.Headers["X-Duong-Dan"] =
                        System.Net.WebUtility.UrlEncode(duongDan);
                }
                catch (Exception ex)
                {
                    Response.Headers["X-Da-Luu"] = "0";
                    Response.Headers["X-Loi-Luu"] =
                        System.Net.WebUtility.UrlEncode(ex.Message);
                }

                return File(noiDung, "application/xml", tk.TenFileXml);
            }
            catch (InvalidOperationException ex)
            {
                // Còn lỗi chặn — trả 409 kèm lý do để màn hình hiện đúng chỗ sai
                return Conflict(new { message = ex.Message, canhBao = tk.CanhBao });
            }
        }

        /// <summary>
        /// Chuyển tờ khai vừa lập sang khuôn ToKhaiTayDto để ghi vào bảng TOKHAI.
        /// </summary>
        /// <remarks>
        /// Hai DTO tách nhau vì hai nguồn khác nhau (một tính từ sổ, một gõ tay) nhưng
        /// lưu chung một bảng. Ánh xạ 1-1 theo mã chỉ tiêu, riêng ct39a của bản tính
        /// ứng với ct39 của bảng — khác tên, cùng chỉ tiêu (xem BangToKhai.tsx).
        /// LanNop = 0: bản tự lập luôn là tờ khai chính thức lần đầu; bản bổ sung do
        /// kế toán khai tay qua màn "Nhập tờ khai".
        /// </remarks>
        private static Models.ToKhaiTayDto ToKhaiTayTu(
            Models.ToKhaiGtgtDto tk, string code, int nam, int thang) => new()
            {
                MaDonVi = code, Nam = nam, Thang = thang, LanNop = 0,
                MaCct = tk.MaCqtNoiNop, TenCct = tk.TenCqtNoiNop,
                Mst = tk.Mst, TenNnt = tk.TenNnt, DiaChiNnt = tk.DiaChiNnt,
                Ct21 = tk.Ct21, Ct22 = tk.Ct22, Ct23 = tk.Ct23, Ct24 = tk.Ct24,
                Ct23a = tk.Ct23a, Ct24a = tk.Ct24a, Ct25 = tk.Ct25, Ct26 = tk.Ct26,
                Ct27 = tk.Ct27, Ct28 = tk.Ct28, Ct29 = tk.Ct29, Ct30 = tk.Ct30,
                Ct31 = tk.Ct31, Ct32 = tk.Ct32, Ct33 = tk.Ct33, Ct32a = tk.Ct32a,
                Ct34 = tk.Ct34, Ct35 = tk.Ct35, Ct36 = tk.Ct36, Ct37 = tk.Ct37,
                Ct38 = tk.Ct38, Ct39 = tk.Ct39a, Ct40a = tk.Ct40a, Ct40b = tk.Ct40b,
                Ct40 = tk.Ct40, Ct41 = tk.Ct41, Ct42 = tk.Ct42, Ct43 = tk.Ct43,
                GhiChu = "Tự lập từ sổ hóa đơn (bấm Tải XML)",
            };

        public record RaSoatRequest(List<Models.HoaDonFileDto>? HoaDon);

        [HttpPost("ra-soat")]
        public async Task<IActionResult> RaSoat([FromQuery] int? thang,
                                                [FromQuery] string? maDonVi,
                                                [FromBody] RaSoatRequest req)
        {
            if (User.FindFirst("tenant_type")?.Value != "internal")
            {
                var chan = ChanNeuLaNoiBo();
                if (chan != null) return chan;
            }

            var code = await DonViThaoTac(maDonVi);
            if (code == null)
                return NotFound(new { message = $"Không có đơn vị khai thuế mã {maDonVi}" });

            var ds = req?.HoaDon ?? new List<Models.HoaDonFileDto>();
            if (ds.Count > 20000)
                return BadRequest(new { message = "Quá 20.000 hóa đơn trong một lần rà soát" });

            var (mstDv, _, _) = await HoSoDonVi(code);
            foreach (var f in ds)
            {
                if (!string.IsNullOrWhiteSpace(f.Huong)) continue;
                f.Huong = RaSoatService.SuyHuong(f.Mst, mstDv) ?? "VAO";
            }

            var ky = thang is >= 1 and <= 12 ? thang : null;
            return Ok(await _raSoat.Soat(code, FiscalYear(), ky, ds));
        }

        public record QuetThuMucRequest(string? ThuMuc, string? Huong);

        [HttpPost("ra-soat/thu-muc")]
        public async Task<IActionResult> RaSoatThuMuc([FromQuery] int? thang,
                                                      [FromBody] QuetThuMucRequest req,
                                                      CancellationToken huy)
        {
            var chan = ChanNeuLaNoiBo();
            if (chan != null) return chan;

            if (string.IsNullOrWhiteSpace(req?.ThuMuc))
                return BadRequest(new { message = "Chưa nhập đường dẫn thư mục" });
            var huong = ChuanHoaHuong(req.Huong);

            try
            {
                var goc = new[] { _config["Paths:ScanDocRoot"], _config["Paths:RawRoot"] }
                          .Where(x => !string.IsNullOrWhiteSpace(x))
                          .Select(x => x!)
                          .ToList();
                if (goc.Count == 0)
                    return BadRequest(new
                    { message = "Chưa khai Paths:ScanDocRoot trong cấu hình máy chủ" });

                var ds = await RaSoatService.QuetThuMuc(req.ThuMuc, goc, huy);
                var mstDv = huong == null ? await MstDonVi() : null;
                foreach (var x in ds)
                    x.Huong = huong ?? RaSoatService.SuyHuong(x.Mst, mstDv) ?? "VAO";

                var ky = thang is >= 1 and <= 12 ? thang : null;
                return Ok(await _raSoat.Soat(TenantCode(), FiscalYear(), ky, ds, huy));
            }
            catch (UnauthorizedAccessException ex)
            {
                return StatusCode(403, new { message = ex.Message });
            }
            catch (DirectoryNotFoundException ex)
            {
                return NotFound(new { message = ex.Message });
            }
        }

        [HttpPut("hoa-don/{maHd}/lines")]
        public async Task<IActionResult> LuuLines(
            string maHd, [FromBody] List<Models.HoaDonLineDto>? lines)
        {
            var chan = ChanNeuLaNoiBo();
            if (chan != null) return chan;

            if (string.IsNullOrWhiteSpace(maHd))
                return BadRequest(new { message = "Thiếu mã hóa đơn" });

            var ds = lines ?? new List<Models.HoaDonLineDto>();
            if (ds.Count > 1000)
                return BadRequest(new { message = "Hóa đơn không thể có quá 1000 dòng hàng" });

            var soDong = await _thue.LuuLines(TenantCode(), FiscalYear(),
                                              maHd.Trim(), ds, CurrentUser());
            return soDong == null
                ? NotFound(new { message = $"Không tìm thấy hóa đơn {maHd}" })
                : Ok(new { message = $"Đã lưu {soDong} dòng hàng", soDong });
        }

        [HttpPost("xu-ly-tt-dc")]
        public async Task<IActionResult> XuLyThayTheDieuChinh(
            [FromQuery] int thang, [FromQuery] string? maDonVi)
        {
            if (User.FindFirst("tenant_type")?.Value != "internal")
            {
                var chan = ChanNeuLaNoiBo();
                if (chan != null) return chan;
            }

            var code = await DonViThaoTac(maDonVi);
            if (code == null)
                return NotFound(new { message = $"Không có đơn vị khai thuế mã {maDonVi}" });
            if (thang is < 1 or > 12)
                return BadRequest(new { message = "Kỳ kê khai phải trong khoảng tháng 1..12" });

            var nam = FiscalYear();
            var kq = await _thue.XuLyThayTheDieuChinh(code, nam, thang, CurrentUser());

            if (kq.SoKhacKy > 0)
            {
                try
                {
                    var tid = await _db.Tenants.AsNoTracking()
                        .Where(t => t.Code == code).Select(t => t.Id)
                        .FirstOrDefaultAsync(HttpContext.RequestAborted);
                    await _db.Database.ExecuteSqlRawAsync(
                        @"INSERT INTO ActivityLog (UserName, TenantId, Nam, Action, Detail)
                          VALUES ({0}, {1}, {2}, {3}, {4})",
                        CurrentUser(), tid, nam, "XU_LY_TT_DC",
                        $"Kỳ {thang:00}/{nam} — {kq.SoCungKy} HĐ cùng kỳ (engine tự loại), "
                        + $"{kq.SoKhacKy} HĐ khác kỳ (đã ghi chú)");
                }
                catch { /* mất một dòng nhật ký còn hơn báo hỏng việc đã xong */ }
            }

            return Ok(new
            {
                soCungKy = kq.SoCungKy,
                soKhacKy = kq.SoKhacKy,
                chiTiet = kq.ChiTiet,
                message = kq.SoCungKy + kq.SoKhacKy == 0
                    ? $"Kỳ {thang:00}/{nam} không có hóa đơn thay thế/điều chỉnh nào"
                    : $"{kq.SoCungKy} HĐ cùng kỳ — tờ khai tự loại hóa đơn gốc; "
                      + $"{kq.SoKhacKy} HĐ khác kỳ — đã ghi chú để xử lý tay",
            });
        }

        [HttpDelete("hoa-don/{maHd}")]
        public async Task<IActionResult> XoaHoaDon(string maHd, [FromQuery] string? maDonVi)
        {
            if (User.FindFirst("tenant_type")?.Value != "internal")
            {
                var chan = ChanNeuLaNoiBo();
                if (chan != null) return chan;
            }

            var code = await DonViThaoTac(maDonVi);
            if (code == null)
                return NotFound(new { message = $"Không có đơn vị khai thuế mã {maDonVi}" });

            if (string.IsNullOrWhiteSpace(maHd))
                return BadRequest(new { message = "Thiếu mã hóa đơn" });

            var nam = FiscalYear();
            var xong = await _thue.XoaHoaDon(code, nam, maHd);
            if (!xong)
                return NotFound(new { message = $"Không tìm thấy hóa đơn {maHd}" });
            try
            {
                var tid = await _db.Tenants.AsNoTracking()
                    .Where(t => t.Code == code).Select(t => t.Id)
                    .FirstOrDefaultAsync(HttpContext.RequestAborted);
                await _db.Database.ExecuteSqlRawAsync(
                    @"INSERT INTO ActivityLog (UserName, TenantId, Nam, Action, Detail)
                      VALUES ({0}, {1}, {2}, {3}, {4})",
                    CurrentUser(), tid, nam, "XOA_HOA_DON",
                    $"Xóa hóa đơn {maHd} khỏi sổ {code}_{nam}");
            }
            catch { /* mất một dòng nhật ký còn hơn báo hỏng thao tác đã xong */ }

            return Ok(new { message = $"Đã xóa hóa đơn {maHd}" });
        }

        /// <param name="maDonVi">

        [HttpGet("hoa-don/{maHd}/html")]
        public async Task<IActionResult> XemHtml(string maHd, [FromQuery] string? maDonVi)
        {
            var laNoiBoQuanTri = User.FindFirst("tenant_type")?.Value == "internal";
            if (!laNoiBoQuanTri)
            {
                var chan = ChanNeuLaNoiBo();
                if (chan != null) return chan;
                maDonVi = null;      // tenant thường không được chỉ định đơn vị khác
            }

            var code = await DonViThaoTac(maDonVi);
            if (code == null)
                return NotFound(new { message = $"Không có đơn vị khai thuế mã {maDonVi}" });

            var (html, duongDan) = await _thue.LayHtmlGoc(code, FiscalYear(), maHd);
            if (html == null)
                return NotFound(new { message = "Hóa đơn này không có bản HTML kèm theo" });
            Response.Headers["X-Duong-Dan"] = Uri.EscapeDataString(duongDan ?? "");
            Response.Headers["Access-Control-Expose-Headers"] = "X-Duong-Dan";
            return Content(html, "text/html; charset=utf-8");
        }
    }
}
