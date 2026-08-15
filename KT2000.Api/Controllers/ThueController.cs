using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using KT2000.Api.Data;
using KT2000.Api.Services;

namespace KT2000.Api.Controllers
{
    // Endpoint sổ THUẾ: đọc HOA_DON / HOA_DON_LINE của chính đơn vị đang đăng nhập.
    // AN TOÀN: đơn vị và năm KHÔNG lấy từ query mà đọc từ claim trong token
    // (tenant_code, fiscal_year) — người dùng sửa URL cũng không sang được database
    // của đơn vị khác.
    //
    // Ngược với NoiBoController (chỉ cho tenant_type='noibo'), ở đây CHẶN 'noibo':
    // đơn vị nội bộ không có sổ thuế, vào đây là nhầm màn hình.
    [Route("api/thue")]
    [ApiController]
    [Authorize]
    public class ThueController : ControllerBase
    {
        private readonly ThueService _thue;
        private readonly RaSoatService _raSoat;
        private readonly ToKhaiService _toKhai;
        private readonly BangToKhaiService _bangToKhai;
        private readonly IConfiguration _config;
        private readonly AppDbContext _db;
        private readonly ImportService _import;
        public ThueController(ThueService thue, RaSoatService raSoat, ToKhaiService toKhai,
                              IConfiguration config, AppDbContext db, ImportService import,
                              BangToKhaiService bangToKhai
                              )
        {
            _thue = thue;
            _raSoat = raSoat;
            _toKhai = toKhai;
            _bangToKhai = bangToKhai;
            _config = config;
            _db = db;
            _import = import;
        }

        // MST của đơn vị đang đăng nhập, đọc từ Master. Dùng để suy hướng hóa đơn khi
        // rà soát — xem RaSoatService.SuyHuong. Hồ sơ bỏ trống thì trả null.
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

        // Sổ thuế không dành cho đơn vị nội bộ. Trả null nếu hợp lệ.
        private IActionResult? ChanNeuLaNoiBo() =>
            User.FindFirst("tenant_type")?.Value == "noibo"
                ? StatusCode(403, new
                  { message = "Đơn vị nội bộ không có sổ thuế — dùng màn Phiếu xuất/nhập" })
                : null;

        // Hướng chỉ nhận đúng hai giá trị; chuỗi lạ coi như không lọc thay vì ném lỗi,
        // để màn hình vẫn hiện được danh sách đầy đủ.
        private static string? ChuanHoaHuong(string? huong) =>
            huong?.Trim().ToUpperInvariant() switch
            {
                "VAO" or "VÀO" => "VAO",
                "RA" => "RA",
                _ => null,
            };

        /// <summary>
        /// GET api/thue/hoa-don?huong=VAO&amp;thang=1&amp;tu=...&amp;gioiHan=200
        /// Danh sách hóa đơn, mới nhất trước. Không kèm dòng hàng.
        /// </summary>
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

        /// <summary>
        /// GET api/thue/hoa-don/doi-chieu?huong=VAO — sổ so với bản gốc TCT, cả năm, để màn
        /// danh sách hiện cột lệch khi bật "So sánh dữ liệu".
        ///
        /// PHẢI đứng TRƯỚC hoa-don/{maHd}, không thì "doi-chieu" bị nuốt thành một mã hóa
        /// đơn và endpoint này không bao giờ được gọi tới.
        ///
        /// Trả CẢ NĂM chứ không lọc tháng: màn danh sách tự lọc tháng ở phía nó, mà gọi lại
        /// mỗi lần đổi bộ lọc thì vừa chậm vừa dễ lệch với lưới đang hiển thị.
        /// </summary>
        [HttpGet("hoa-don/doi-chieu")]
        public async Task<IActionResult> DoiChieu([FromQuery] string? huong)
        {
            var chan = ChanNeuLaNoiBo();
            if (chan != null) return chan;
            return Ok(await _thue.LayDoiChieu(TenantCode(), FiscalYear(), ChuanHoaHuong(huong)));
        }

        /// <summary>
        /// POST api/thue/hoa-don/dung-ban-goc?huong=VAO — dựng lại bản gốc TCT của cả năm
        /// từ file Excel danh sách đã có trên đĩa. KHÔNG vào mạng, KHÔNG đụng sổ.
        ///
        /// Dành cho hóa đơn nạp TRƯỚC 15/08 (lúc IN_VALUE_LINE chưa được ghi) nên không có
        /// gì để đối chiếu. Bấm một lần là đủ; chạy lại vô hại vì DoiChieuService chỉ thêm
        /// dòng thiếu và thay dòng đổi số.
        ///
        /// PHẢI đứng TRƯỚC hoa-don/{maHd} — cùng lý do với doi-chieu ở trên.
        /// </summary>
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

        /// <summary>
        /// GET api/thue/hoa-don/{maHd} — một hóa đơn kèm đầy đủ dòng hàng.
        /// maHd chứa dấu chấm/gạch nên phải để {maHd} bắt trọn phần còn lại.
        /// </summary>
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

        /// <summary>
        /// POST api/thue/hoa-don/lines — dòng hàng của NHIỀU hóa đơn trong một lượt.
        /// </summary>
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

        /// <summary>
        /// GET api/thue/bao-cao?thang=12 — báo cáo thuế GTGT của một kỳ.
        /// Bỏ trống thang = cả năm. Trả bảng kê mua vào, bán ra và bảng tổng hợp
        /// theo chỉ tiêu tờ khai 01/GTGT (đã tính sẵn ở server).
        /// </summary>
        [HttpGet("bao-cao")]
        public async Task<IActionResult> BaoCao([FromQuery] int? thang)
        {
            var chan = ChanNeuLaNoiBo();
            if (chan != null) return chan;

            // Tháng ngoài 1..12 coi như không lọc, thay vì ném lỗi làm trắng màn hình
            var ky = thang is >= 1 and <= 12 ? thang : null;
            return Ok(await _thue.BaoCaoThue(TenantCode(), FiscalYear(), ky));
        }

        /// <summary>
        /// GET api/thue/ra-soat-cheo?nam=2026&amp;thang=7 — lưới rà soát MỌI đơn vị
        /// của một kỳ, mỗi đơn vị một dòng. Bàn làm việc của kế toán dịch vụ (MDN_NB).
        /// </summary>
        /// <remarks>
        /// KHÔNG gọi ChanNeuLaNoiBo: endpoint này DÀNH RIÊNG cho tenant nội bộ quản trị.
        /// Ngược lại phải chặn tenant THƯỜNG — đơn vị khách hàng không có quyền nhìn số
        /// khấu trừ của các đơn vị khác (ranh giới hai sổ, luật 9).
        ///
        /// Danh sách đơn vị lấy từ Master ngay tại đây rồi truyền xuống service: service
        /// không được biết bảng Tenants (xem chú thích tham số dsDonVi).
        ///
        /// CHỈ ĐƠN VỊ KHAI THUẾ. Loại cả hai loại tenant không có tờ khai:
        ///   'internal' — MDN_NB, chính là đơn vị đang đăng nhập, không khai thuế
        ///   'noibo'    — TUAN_NGA_NB, USA_MEVA_NB: sổ ĐƠN HÀNG/GIAO HÀNG của khách,
        ///                không phải sổ thuế (ranh giới hai sổ, luật 9). Sổ thuế của
        ///                họ nằm ở đơn vị mẹ TUAN_NGA / USA_MEVA đã có dòng riêng rồi
        ///                — để lại thì lưới có hai dòng cho cùng một doanh nghiệp.
        /// </remarks>
        [HttpGet("ra-soat-cheo")]
        public async Task<IActionResult> RaSoatCheo([FromQuery] int? nam, [FromQuery] int? thang)
        {
            if (User.FindFirst("tenant_type")?.Value != "internal")
                return StatusCode(403, new
                { message = "Chỉ đơn vị quản trị nội bộ mới xem được bảng rà soát chéo" });

            var ky = thang is >= 1 and <= 12 ? thang.Value : DateTime.Today.Month;
            var year = nam is >= 2000 and <= 2100 ? nam.Value : FiscalYear();

            // Sắp theo MÃ để thứ tự dòng cố định giữa các lần mở — kế toán nhớ vị trí
            // đơn vị trên lưới, thứ tự nhảy mỗi lần tải là rất khó dùng.
            // KhaiQuy quyết định nhịp kỳ của từng đơn vị (đo thật 14/08: 7 đơn vị khai
            // quý, 11 khai tháng) — service cần biết để tra tờ khai đúng kỳ và đếm
            // đúng số tháng.
            // AsNoTracking: chỉ ĐỌC để dựng lưới, không sửa gì — bật change tracking
            // chỉ tổ bắt EF giữ snapshot của từng dòng cho một truy vấn dùng một lần.
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

            // Tên đơn vị ghép ở đây chứ không truy vấn trong service: service chỉ làm
            // việc với số, tên là thứ của Master.
            var hoSo = donVi.ToDictionary(x => x.Code, x => x, StringComparer.OrdinalIgnoreCase);
            foreach (var d in ds)
                if (hoSo.TryGetValue(d.MaDonVi, out var t))
                { d.TenDonVi = t.Name; d.Mst = t.TaxCode; }

            return Ok(new { nam = year, thang = ky, dong = ds });
        }

        /// <summary>
        /// GET api/thue/bc-to-khai?nam=2026 — danh sách tờ khai ĐÃ LƯU của cả năm,
        /// lưới của màn "BC lấy tờ khai XML". Lọc thêm theo đơn vị/tháng nếu cần.
        /// </summary>
        [HttpGet("bc-to-khai")]
        public async Task<IActionResult> BcToKhai(
            [FromQuery] int? nam, [FromQuery] string? ma, [FromQuery] int? thang)
        {
            if (User.FindFirst("tenant_type")?.Value != "internal")
                return StatusCode(403, new
                { message = "Chỉ đơn vị quản trị nội bộ mới xem được danh sách tờ khai" });

            var year = nam is >= 2000 and <= 2100 ? nam.Value : FiscalYear();
            var ds = await _bangToKhai.DsToKhai(year, ma, thang, HttpContext.RequestAborted);

            // Tên đơn vị ghép ở đây — service chỉ làm việc với số, tên là của Master.
            var ten = await _db.Tenants.AsNoTracking()
                .Select(t => new { t.Code, t.Name })
                .ToDictionaryAsync(x => x.Code, x => x.Name,
                                   StringComparer.OrdinalIgnoreCase,
                                   HttpContext.RequestAborted);
            foreach (var d in ds)
                if (ten.TryGetValue(d.MaDonVi, out var n)) d.TenDonVi = n;

            return Ok(new { nam = year, dong = ds });
        }

        /// <summary>
        /// POST api/thue/bc-to-khai/nap-xml — nạp file XML (hoặc .zip chứa XML) do
        /// CỔNG TCT trả về sau khi nộp, gắn vào tờ khai đã lưu.
        /// </summary>
        /// <remarks>
        /// Đọc ct43 trong file để làm cột "Tồn XML" — số ĐÃ NỘP THẬT. Lệch với ct43
        /// mình tự lập nghĩa là bản nộp khác bản lập, phải soi lại.
        ///
        /// Nhận .zip vì cổng trả về gói nhiều file một lượt; mở ra lấy MỌI file .xml
        /// bên trong rồi khớp từng cái theo MST + kỳ ghi TRONG file, không dựa vào
        /// tên file (tên do cổng đặt, mỗi đợt một kiểu).
        /// </remarks>
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

            // MST → mã đơn vị, để biết file thuộc về ai. Tra một lần cho cả gói.
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
                    ketQua.Add(new { tenFile, ok = false,
                                     message = "Không đọc được MST/kỳ trong file" });
                    return;
                }

                // So phần SỐ của MST: cổng có thể khai chi nhánh dạng "0100686174-634".
                var goc = RaSoatService.GocMst(mst);
                var dv = theoMst.FirstOrDefault(
                    x => RaSoatService.GocMst(x.TaxCode) == goc);
                if (dv == null)
                {
                    ketQua.Add(new { tenFile, ok = false,
                                     message = $"Không có đơn vị nào mang MST {mst}" });
                    return;
                }

                var gan = await _bangToKhai.GanXmlDaNop(
                    dv.Code, nam.Value, thang.Value, 0, tenFile, null, ct, nguoi,
                    HttpContext.RequestAborted);

                if (!gan)
                {
                    ketQua.Add(new { tenFile, ok = false,
                        message = $"{dv.Code} chưa có tờ khai kỳ {thang:00}/{nam} "
                                + "trong hệ thống — hãy tạo tờ khai trước" });
                    return;
                }

                // Đối chiếu NGAY sau khi nạp: báo luôn lệch ở chỉ tiêu nào thay vì
                // bắt người dùng mở màn khác ra dò.
                var lech = await _bangToKhai.SoSanhVoiTct(
                    dv.Code, nam.Value, thang.Value, 0, HttpContext.RequestAborted);

                ketQua.Add(new { tenFile, ok = true,
                    message = lech.Count == 0
                        ? $"{dv.Code} kỳ {thang:00}/{nam} — KHỚP hoàn toàn "
                          + $"(chỉ tiêu 43: {ct43:N0})"
                        : $"{dv.Code} kỳ {thang:00}/{nam} — LỆCH {lech.Count} chỉ tiêu: "
                          + string.Join(", ", lech.Take(6).Select(
                              x => $"[{x.Ma}] tự lập {x.TuLap:N0} ≠ TCT {x.Tct:N0}")),
                    lech });
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

        /// <summary>
        /// GET api/thue/duong-dan-to-khai?ma=USA_MEVA&amp;thang=6 — đường dẫn thư mục
        /// lưu tờ khai của đơn vị-kỳ, để màn hình hiện cho người dùng kiểm trước.
        /// </summary>
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
                maDonVi = code, nam = year, thang,
                duongDan = duong,
                daCo = Directory.Exists(duong),   // chưa có thì lúc lưu sẽ tự tạo
            });
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

        /// <summary>
        /// POST api/thue/luu-to-khai-tct — LƯU file tờ khai TCT trả về vào kho, rồi
        /// nạp số liệu vào bảng TOKHAI của đúng kỳ đó.
        /// </summary>
        /// <remarks>
        /// Làm HAI việc trong một lượt bấm (đúng luồng kế toán mô tả 15/08):
        ///   1. Chép file vào thư mục kỳ trong kho — TỰ TẠO thư mục nếu chưa có.
        ///   2. Đọc 26 chỉ tiêu trong file, ghi vào cột ct*_xml rồi đối chiếu ngay
        ///      với bản tự lập.
        ///
        /// Kỳ và đơn vị lấy từ THAM SỐ người dùng chọn, KHÔNG suy từ nội dung file —
        /// nhưng vẫn KIỂM CHÉO với MST/kỳ ghi trong file và báo nếu lệch. Người dùng
        /// chọn nhầm kỳ là chuyện thường, mà lưu nhầm thì số kỳ này đè lên kỳ khác.
        /// </remarks>
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

            // KIỂM CHÉO — cảnh báo chứ không chặn: để người dùng tự quyết. Nhưng phải
            // nói ra, lưu nhầm kỳ là số đè lên kỳ khác.
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
            // Đường dẫn ra ngoài kho — chỉ tới được bằng request nặn tay, màn hình
            // không cho chọn. Trả 403 chứ không 400: đây là chặn quyền, không phải
            // dữ liệu sai.
            catch (UnauthorizedAccessException ex)
            { return StatusCode(403, new { message = ex.Message }); }
            catch (Exception ex)
            { return BadRequest(new { message = $"Không ghi được file vào kho: {ex.Message}" }); }

            // ---------- 3. Nạp 26 chỉ tiêu vào TOKHAI + đối chiếu ----------
            var ct = ToKhaiService.DocChiTieuXml(noiDung);
            // Ghi chú cắt 500 ký tự cho vừa cột ghi_chu — chuỗi dài hơn thì SQL ném
            // lỗi truncate và HỎNG CẢ lượt lưu, trong khi file đã nằm trong kho rồi.
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

        /// <summary>
        /// GET api/thue/to-khai-tay?ma=AK_GLOBAL&amp;thang=7 — đọc tờ khai GÕ TAY đã
        /// lưu của một kỳ, để mở ra sửa tiếp. Trả 204 nếu kỳ đó chưa lưu lần nào.
        /// </summary>
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

            // TỒN ĐẦU TỰ ĐIỀN TỪ KỲ TRƯỚC (BR-TK-02): ct22 kỳ này = ct43 kỳ liền
            // trước, ưu tiên bản TCT trả về vì đó là số ĐÃ NỘP THẬT.
            // Lập tờ khai T7 thì lấy từ T6 — kế toán khỏi phải mở tờ khai cũ ra chép
            // tay, và chép tay là chỗ hay sai nhất của cả quy trình.
            var khaiQuy = await _db.Tenants.AsNoTracking()
                .Where(t => t.Code == code).Select(t => t.KhaiQuy)
                .FirstOrDefaultAsync(HttpContext.RequestAborted);
            var (ct22Truoc, nguon) = await _bangToKhai.TonDauTuKyTruoc(
                code, year, thang, khaiQuy, HttpContext.RequestAborted);

            // Chưa lưu lần nào → trả khung rỗng CÓ SẴN ct22, thay vì 204 để form
            // trắng trơn rồi người dùng tự đi tìm số.
            if (tk == null)
            {
                if (ct22Truoc == null) return NoContent();
                return Ok(new
                {
                    maDonVi = code, nam = year, thang, lanNop,
                    ct22 = ct22Truoc, nguonCt22 = nguon,
                });
            }

            // Đã lưu rồi nhưng ct22 còn trống → điền hộ; đã có số thì GIỮ NGUYÊN,
            // không ghi đè thứ kế toán đã chủ động nhập.
            if ((tk.Ct22 == 0m) && ct22Truoc != null) tk.Ct22 = ct22Truoc.Value;
            return Ok(new { tk, nguonCt22 = nguon });
        }

        /// <summary>
        /// GET api/thue/doi-chieu?ma=THUAN_AN&amp;thang=7 — ĐỐI CHIẾU BA NGUỒN cho
        /// một kỳ: tờ khai đã lưu · sổ hóa đơn · bản TCT trả về.
        /// </summary>
        /// <remarks>
        /// Trả về TỪNG chỉ tiêu kèm số của cả ba nguồn và hai cột lệch, để kế toán
        /// thấy ngay "lệch ở đâu và lệch với cái gì" thay vì mở ba màn tự so.
        ///
        /// Dùng được cho CẢ tờ khai tự lập lẫn tờ khai gõ tay — cùng một bảng TOKHAI,
        /// cùng bộ chỉ tiêu, nên không cần hai đường riêng.
        /// </remarks>
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

            // TÍNH LẠI TỪ SỔ để có cột "Sổ". Đơn vị chưa mở năm/chưa có bảng thì bỏ
            // qua cột đó chứ không làm hỏng cả lời gọi — vẫn còn hai nguồn kia.
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
                maDonVi = code, nam = year, thang, lanNop,
                coSo = tuSo != null,
                coTct = ds.Any(x => x.Tct != null),
                soLech = ds.Count(x => x.CoLech),
                dong = ds,
            });
        }

        /// <summary>
        /// POST api/thue/to-khai-tay — lưu tờ khai gõ tay vào bảng TOKHAI (KT2000_Base).
        /// </summary>
        /// <remarks>
        /// Đây là endpoint DUY NHẤT trong controller này có GHI. Ghi vào TOKHAI ở Base
        /// thôi — KHÔNG đụng sổ hóa đơn của đơn vị (luật 5: hàm nguồn ngoài không được
        /// ghi đè dữ liệu sổ).
        /// </remarks>
        [HttpPost("to-khai-tay")]
        public async Task<IActionResult> LuuToKhaiTay([FromBody] Models.ToKhaiTayDto? tk)
        {
            if (tk == null)
                return BadRequest(new { message = "Thiếu nội dung tờ khai" });
            if (tk.Thang is < 1 or > 12)
                return BadRequest(new { message = "Kỳ kê khai phải trong khoảng tháng 1..12" });
            if (tk.LanNop is < 0 or > 99)
                return BadRequest(new { message = "Lần nộp phải trong khoảng 0..99" });

            // CHẶN TỜ KHAI RỖNG: mọi chỉ tiêu đều 0 nghĩa là người dùng mở form ra rồi
            // bấm Lưu mà chưa gõ gì. Cho lưu thì lưới hiện một dòng toàn số 0 — trông
            // y như "đã khai và bằng 0", trong khi thực ra chưa khai; tệ hơn là kỳ sau
            // lấy ct43 = 0 đó làm tồn đầu và sai dây chuyền.
            //
            // Trừ ct21 ra khỏi phép kiểm: đó là ô đánh dấu "không phát sinh mua bán",
            // đúng là tờ khai hợp lệ mà mọi chỉ tiêu tiền đều 0.
            if (tk.Ct21 != 1 && tk.ChiTieu().All(x => (decimal)x.Gia == 0m))
                return BadRequest(new
                {
                    message = "Tờ khai chưa có số liệu — nhập ít nhất một chỉ tiêu, "
                            + "hoặc đánh dấu [21] nếu kỳ này không phát sinh mua bán",
                });

            // Mã đơn vị trong THÂN request cũng phải qua cửa quyền y như tham số query
            // — không kiểm thì tenant thường gửi mã đơn vị khác là ghi được vào tờ
            // khai của họ (luật 9).
            var code = await DonViThaoTac(tk.MaDonVi);
            if (code == null)
                return NotFound(new { message = $"Không có đơn vị khai thuế mã {tk.MaDonVi}" });
            tk.MaDonVi = code;

            if (tk.Nam is < 2000 or > 2100) tk.Nam = FiscalYear();

            // MST/tên lấy từ Master nếu client không gửi — hồ sơ đơn vị là nguồn chuẩn,
            // để client tự khai thì mỗi lần lưu một kiểu.
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

        /// <summary>
        /// GET api/thue/bao-cao-don-vi?ma=THAI_TUAN&amp;thang=7 — báo cáo thuế của MỘT
        /// đơn vị bất kỳ, xem từ bàn làm việc của kế toán dịch vụ (MDN_NB).
        /// </summary>
        /// <remarks>
        /// Khác /bao-cao ở chỗ đơn vị lấy từ THAM SỐ chứ không từ claim — đó chính là
        /// lý do phải gate riêng: chỉ 'internal' mới được chỉ định đơn vị. Với tenant
        /// thường thì tham số ma là lỗ hổng đọc sổ đơn vị khác (luật 9), nên chặn thẳng.
        ///
        /// Mã đơn vị vẫn phải TRA LẠI Master trước khi dùng: hợp lệ theo BR-DB-01 không
        /// có nghĩa là đơn vị có thật, và mã 'internal'/'noibo' thì không có sổ thuế.
        /// Không tra thì người dùng sửa query gọi sang database bất kỳ trên server.
        /// </remarks>
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

        // ===================== TỜ KHAI 01/GTGT =====================
        // Spec: docs/NB/SPEC-TO-KHAI-01-GTGT.md

        // Thông tin đơn vị lấy từ Master để điền phần NNT của tờ khai.
        /// <param name="maDonVi">
        /// Lấy hồ sơ của ĐƠN VỊ NÀO. Bỏ trống = đơn vị đang đăng nhập.
        ///
        /// Có tham số này vì MDN_NB lập tờ khai HỘ đơn vị khác: bản thân MDN_NB không
        /// khai thuế nên TaxCode để NULL, đọc theo claim thì tờ khai nào cũng chặn ở
        /// "Đơn vị chưa khai mã số thuế" (gặp thật 14/08 với NHAT_TUAN).
        /// </param>
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

        /// <summary>
        /// Đơn vị mà lời gọi này thao tác lên: MDN_NB được chỉ định đơn vị khác qua
        /// tham số, tenant thường luôn là chính mình.
        /// </summary>
        /// <remarks>
        /// Tra lại Master chứ không tin thẳng tham số: mã hợp lệ theo BR-DB-01 không
        /// có nghĩa là đơn vị có thật, và không tra thì người dùng sửa query là đọc
        /// được database bất kỳ trên server (luật 9 — ranh giới hai sổ).
        /// Trả null nếu mã không hợp lệ; tầng gọi đổi thành 404.
        /// </remarks>
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

        /// <summary>
        /// GET api/thue/kho?thang=7 — dò kho dữ liệu của kỳ (Excel/XML/HTML) rồi đối
        /// chiếu với SỔ. Đường dẫn sinh từ appsettings, không hỏi người dùng.
        /// </summary>
        /// <remarks>
        /// Đây là bước "đối soát ba nguồn" của §4 spec: một lời gọi ra đủ số liệu của
        /// cả bốn nguồn để kế toán thấy ngay chỗ nào lệch trước khi lập tờ khai.
        /// </remarks>
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

            // Dò kho và đọc hồ sơ đơn vị CÙNG LÚC: hai việc độc lập, một chạm đĩa, một
            // chạm SQL — chờ nối tiếp chỉ tổ cộng dồn độ trễ.
            var congViecKho = _raSoat.DoKhoAsync(code, nam, thang, huy);
            var mstDv = await MstDonVi();
            var kho = await congViecKho;

            // --- Đọc Excel bảng kê: nguồn số liệu gốc từ cổng TCT ---
            var (tuExcel, loiExcel) = await RaSoatService.DocNhieuBangKe(
                kho.ExcelRa.Concat(kho.ExcelVao), mstDv, huy);

            var tongExcel = new
            {
                soHdVao  = tuExcel.Count(x => x.Huong != "RA"),
                soHdRa   = tuExcel.Count(x => x.Huong == "RA"),
                hangVao  = tuExcel.Where(x => x.Huong != "RA").Sum(x => x.TienHang),
                vatVao   = tuExcel.Where(x => x.Huong != "RA").Sum(x => x.TienVat),
                hangRa   = tuExcel.Where(x => x.Huong == "RA").Sum(x => x.TienHang),
                vatRa    = tuExcel.Where(x => x.Huong == "RA").Sum(x => x.TienVat),
            };

            // --- Đối chiếu Excel với SỔ ---
            var doiChieu = tuExcel.Count > 0
                ? await _raSoat.Soat(code, nam, thang, tuExcel, huy)
                : null;

            return Ok(new
            {
                thang, nam,
                soFile = new
                {
                    xmlRa = kho.XmlRa.Count, xmlVao = kho.XmlVao.Count,
                    htmlRa = kho.HtmlRa.Count, htmlVao = kho.HtmlVao.Count,
                    excelRa = kho.ExcelRa.Count, excelVao = kho.ExcelVao.Count,
                },
                thuMucDaDo = kho.DaDo,
                tongExcel,
                loiExcel,
                doiChieu,
            });
        }

        /// <summary>
        /// POST api/thue/doc-bang-ke — đọc bảng kê Excel của cổng TCT (HD_VAO/HD_RA…xlsx)
        /// thành danh sách hóa đơn để đối chiếu. CHỈ ĐỌC, không ghi gì.
        /// </summary>
        /// <remarks>
        /// Đọc ở SERVER chứ không ở trình duyệt: frontend chưa có thư viện đọc Excel,
        /// thêm SheetJS vào bundle chỉ để đọc vài file là không đáng — backend đã sẵn
        /// ClosedXML dùng cho ImportService.
        /// </remarks>
        /// <param name="maDonVi">
        /// Đọc bảng kê CỦA ĐƠN VỊ NÀO — chỉ 'internal' (MDN_NB) được truyền, để soi
        /// bảng kê của đơn vị khác từ màn Tờ khai. Bỏ trống thì lấy đơn vị đang đăng
        /// nhập như cũ.
        ///
        /// Vì sao PHẢI có tham số này: hàm đọc Excel suy HƯỚNG hóa đơn bằng cách so
        /// MST người bán với MST đơn vị (RaSoatService.SuyHuong). Lấy nhầm MST của
        /// MDN_NB thì MỌI dòng đều thành "VAO" — đối chiếu ra sai toàn bộ.
        /// </param>
        [HttpPost("doc-bang-ke")]
        [RequestSizeLimit(30 * 1024 * 1024)]
        public async Task<IActionResult> DocBangKe(IFormFile? file, [FromQuery] string? maDonVi)
        {
            var laNoiBoQuanTri = User.FindFirst("tenant_type")?.Value == "internal";
            if (!laNoiBoQuanTri)
            {
                var chan = ChanNeuLaNoiBo();
                if (chan != null) return chan;
                // Tenant thường KHÔNG được chỉ định đơn vị khác — bỏ qua tham số thay
                // vì báo lỗi, để URL cũ vẫn chạy y như trước.
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
                // MST của đơn vị được chỉ định (MDN_NB soi đơn vị khác), không thì
                // của chính đơn vị đang đăng nhập.
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

        /// <summary>
        /// POST api/thue/to-khai?thang=7 — LẬP tờ khai 01/GTGT của kỳ để XEM TRƯỚC.
        /// Chỉ tính toán, không ghi file, không đụng sổ. Kèm danh sách cảnh báo để
        /// kế toán soi trước khi quyết định xuất XML.
        /// </summary>
        /// <remarks>
        /// POST chứ không GET vì thân request mang nội dung XML tờ khai kỳ trước — kích
        /// thước vài KB, nhét vào query string là vượt giới hạn URL.
        /// </remarks>
        public record LapToKhaiRequest(string? XmlKyTruoc);

        [HttpPost("to-khai")]
        public async Task<IActionResult> ToKhai([FromQuery] int thang,
                                                [FromQuery] string? maDonVi,
                                                [FromBody] LapToKhaiRequest? req)
        {
            // MDN_NB lập tờ khai HỘ đơn vị khác nên không chặn ở đây — DonViThaoTac
            // đã lo phần quyền: tenant thường luôn trả về chính nó, mã lạ trả null.
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

            // ===== PHẢI CÓ TỜ KHAI KỲ TRƯỚC MỚI CHO LẬP =====
            //
            // Chặn NGAY TỪ ĐẦU chứ không để lập xong rồi mới báo lỗi ở bước xuất: tờ
            // khai lập thiếu chỉ tiêu 22 có mọi con số khác trông vẫn hợp lý, kế toán
            // dễ tin là đúng rồi đem đối chiếu, mất công vô ích.
            //
            // Hai thứ đều lấy từ tờ khai kỳ trước và đều không thay được:
            //   • ct22 = ct43 kỳ trước (BR-TK-02) — sai là lệch dây chuyền mọi kỳ sau
            //   • khuôn XML: maCQTNoiNop, maTinhNNT, tieuMucHachToan… sổ không lưu
            if (!_toKhai.CoToKhaiKyTruoc(code, nam, thang, req?.XmlKyTruoc,
                                         out var thangTruoc, out var namTruoc))
                return Conflict(new
                {
                    message = $"Chưa có tờ khai kỳ trước (tháng {thangTruoc}/{namTruoc}) "
                            + "nên chưa lập được tờ khai kỳ này. Hãy tải file XML tờ khai "
                            + $"tháng {thangTruoc}/{namTruoc} lên — chỉ tiêu 43 của kỳ đó "
                            + "là chỉ tiêu 22 của kỳ này, và tờ khai đó cũng là khuôn "
                            + "mang thông tin cơ quan thuế mà sổ không lưu.",
                    thangTruoc, namTruoc,
                });

            return Ok(await _toKhai.Lap(code, nam, thang, mst, ten, diaChi, req?.XmlKyTruoc));
        }

        /// <summary>
        /// POST api/thue/to-khai/xml?thang=7 — tải file XML tờ khai để nạp vào HTKK.
        /// Tờ khai còn lỗi mức CHẶN thì trả 409, KHÔNG xuất file từ số liệu chưa cân.
        /// </summary>
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

            // Chặn y như bước lập — endpoint này gọi thẳng được nên không dựa vào việc
            // client đã qua bước kia.
            if (!_toKhai.CoToKhaiKyTruoc(code, nam, thang, req?.XmlKyTruoc,
                                         out var thangTruoc, out var namTruoc))
                return Conflict(new
                {
                    message = $"Chưa có tờ khai kỳ trước (tháng {thangTruoc}/{namTruoc}) "
                            + "nên chưa xuất được XML. Hãy tải file XML tờ khai kỳ đó lên.",
                    thangTruoc, namTruoc,
                });

            var tk = await _toKhai.Lap(code, nam, thang, mst, ten, diaChi, req?.XmlKyTruoc);

            try
            {
                var doc = _toKhai.SinhXml(tk, req?.XmlKyTruoc);

                // UTF-8 KHÔNG BOM: HTKK đọc BOM thành ký tự lạ ở đầu file rồi báo sai
                // định dạng. XDocument.Save mặc định ghi BOM nên phải tự dựng writer.
                using var ms = new MemoryStream();
                var cai = new System.Xml.XmlWriterSettings
                {
                    Encoding = new System.Text.UTF8Encoding(false),
                    Indent = true,
                    IndentChars = "  ",
                };
                using (var w = System.Xml.XmlWriter.Create(ms, cai)) doc.Save(w);

                return File(ms.ToArray(), "application/xml", tk.TenFileXml);
            }
            catch (InvalidOperationException ex)
            {
                // Còn lỗi chặn — trả 409 kèm lý do để màn hình hiện đúng chỗ sai
                return Conflict(new { message = ex.Message, canhBao = tk.CanhBao });
            }
        }

        /// <summary>
        /// POST api/thue/ra-soat?thang=7 — đối chiếu hóa đơn trong FILE với SỔ.
        /// Client đọc XML/Excel rồi gửi danh sách lên; server chỉ SO, KHÔNG GHI.
        /// </summary>
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
            // Chặn payload phi lý — một kỳ nhiều nhất vài nghìn hóa đơn
            if (ds.Count > 20000)
                return BadRequest(new { message = "Quá 20.000 hóa đơn trong một lần rà soát" });

            // Rà soát CẢ HAI CHIỀU trong một lượt: hướng suy từ MST người bán trong
            // file, không bắt người dùng chọn trước. Client gửi Huong rỗng; nếu nó có
            // gửi (bản cũ) thì giữ nguyên giá trị đó.
            //
            // MST phải là của ĐƠN VỊ ĐANG SOI, không phải của người đăng nhập: MDN_NB
            // có TaxCode NULL nên suy hướng bằng nó thì mọi hóa đơn đều thành "VAO".
            var (mstDv, _, _) = await HoSoDonVi(code);
            foreach (var f in ds)
            {
                if (!string.IsNullOrWhiteSpace(f.Huong)) continue;
                f.Huong = RaSoatService.SuyHuong(f.Mst, mstDv) ?? "VAO";
            }

            var ky = thang is >= 1 and <= 12 ? thang : null;
            return Ok(await _raSoat.Soat(code, FiscalYear(), ky, ds));
        }

        /// <summary>
        /// POST api/thue/ra-soat/thu-muc?thang=7 — quét thư mục XML TRÊN MÁY CHỦ rồi
        /// đối chiếu với sổ. Dùng khi kho XML đã tải sẵn về server.
        /// Chỉ cho quét trong các gốc khai ở appsettings (Paths) — xem RaSoatService.
        /// </summary>
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

            // Hướng KHÔNG còn bắt buộc: để trống thì suy từ MST người bán của từng
            // file, nhờ vậy một lượt quét soi được cả hóa đơn vào lẫn ra. Vẫn nhận
            // giá trị tường minh nếu người dùng muốn ép một chiều.
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
                // File XML không tự nói vào hay ra. Ép một chiều nếu người dùng chọn,
                // còn không thì suy từng file theo MST người bán so với MST đơn vị.
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

        /// <summary>
        /// PUT api/thue/hoa-don/{maHd}/lines — ghi lại toàn bộ dòng hàng của hóa đơn.
        /// Gửi lên danh sách dòng hiện tại; server xóa hết rồi chèn lại trong một
        /// transaction. KHÔNG đụng bảng HOA_DON.
        /// </summary>
        [HttpPut("hoa-don/{maHd}/lines")]
        public async Task<IActionResult> LuuLines(
            string maHd, [FromBody] List<Models.HoaDonLineDto>? lines)
        {
            var chan = ChanNeuLaNoiBo();
            if (chan != null) return chan;

            if (string.IsNullOrWhiteSpace(maHd))
                return BadRequest(new { message = "Thiếu mã hóa đơn" });

            var ds = lines ?? new List<Models.HoaDonLineDto>();
            // Chặn payload phi lý — hóa đơn thật nhiều nhất vài trăm dòng
            if (ds.Count > 1000)
                return BadRequest(new { message = "Hóa đơn không thể có quá 1000 dòng hàng" });

            var soDong = await _thue.LuuLines(TenantCode(), FiscalYear(),
                                              maHd.Trim(), ds, CurrentUser());
            return soDong == null
                ? NotFound(new { message = $"Không tìm thấy hóa đơn {maHd}" })
                : Ok(new { message = $"Đã lưu {soDong} dòng hàng", soDong });
        }

        /// <summary>
        /// POST api/thue/xu-ly-tt-dc?thang=7 — xử lý hóa đơn THAY THẾ / ĐIỀU CHỈNH.
        /// </summary>
        /// <remarks>
        /// Spec: docs/THUE/TOKHAI/SPEC-TO-KHAI-01-GTGT.md §10 (BR-TK-06).
        ///
        /// CÙNG KỲ: không làm gì ở đây — engine tờ khai tự loại hóa đơn gốc lúc tính
        /// (ToKhai.cs / LocHdBiThayThe), sổ giữ nguyên số liệu.
        ///
        /// KHÁC KỲ: ghi chú vào HOA_DON.ghi_chu để kế toán truy lại và sửa tay khi có
        /// dữ liệu kỳ gốc. Đây là phần CÓ GHI, nên ghi ActivityLog (luật 7).
        /// </remarks>
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

        /// <summary>
        /// DELETE api/thue/hoa-don/{maHd} — XÓA HẲN một hóa đơn khỏi sổ (kèm dòng hàng).
        /// </summary>
        /// <remarks>
        /// Endpoint GHI duy nhất trên sổ hóa đơn của controller này. Dùng khi cổng trả
        /// về hóa đơn sai/trùng/không thuộc kỳ (HĐ ngân hàng…) — phải bỏ trước khi lên
        /// tờ khai.
        ///
        /// KHÔNG ĐẢO NGƯỢC ĐƯỢC: xóa xong muốn lấy lại phải chạy nạp HĐĐT lần nữa. Vì
        /// vậy ghi ActivityLog (luật 7) để còn truy được ai xóa cái gì, lúc nào.
        /// </remarks>
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

            // Ghi vết SAU khi xóa thành công. Lỗi ghi nhật ký KHÔNG được làm hỏng kết
            // quả đã xong — mất một dòng log còn hơn báo lỗi cho việc đã chạy rồi.
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

        /// <summary>
        /// GET api/thue/hoa-don/{maHd}/html — bản HTML gốc của hóa đơn (ảnh HĐ).
        /// </summary>
        /// <param name="maDonVi">
        /// Xem hóa đơn CỦA ĐƠN VỊ NÀO — chỉ 'internal' (MDN_NB) được truyền, để mở
        /// ảnh hóa đơn từ màn Tờ khai của đơn vị khác. Bỏ trống = đơn vị đang đăng
        /// nhập, giữ nguyên hành vi cũ cho tenant thường.
        /// </param>
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

            // Đường dẫn đi qua HEADER, KHÔNG bọc thân response thành JSON: thân vẫn
            // là HTML thuần y như cũ để client nhét thẳng vào iframe — cách đọc đang
            // chạy giữ nguyên, header chỉ là thông tin THÊM về nguồn file.
            //
            // Mã hóa URL vì header HTTP chỉ nhận ASCII, mà đường dẫn có dấu cách và
            // dấu tiếng Việt — để nguyên là hỏng response.
            Response.Headers["X-Duong-Dan"] = Uri.EscapeDataString(duongDan ?? "");
            Response.Headers["Access-Control-Expose-Headers"] = "X-Duong-Dan";

            return Content(html, "text/html; charset=utf-8");
        }
    }
}
