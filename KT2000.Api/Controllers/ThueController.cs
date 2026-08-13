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
        private readonly IConfiguration _config;
        private readonly AppDbContext _db;
        public ThueController(ThueService thue, RaSoatService raSoat, IConfiguration config,
                              AppDbContext db)
        {
            _thue = thue;
            _raSoat = raSoat;
            _config = config;
            _db = db;
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
        /// POST api/thue/ra-soat?thang=7 — đối chiếu hóa đơn trong FILE với SỔ.
        /// Client đọc XML/Excel rồi gửi danh sách lên; server chỉ SO, KHÔNG GHI.
        /// </summary>
        public record RaSoatRequest(List<Models.HoaDonFileDto>? HoaDon);

        [HttpPost("ra-soat")]
        public async Task<IActionResult> RaSoat([FromQuery] int? thang,
                                                [FromBody] RaSoatRequest req)
        {
            var chan = ChanNeuLaNoiBo();
            if (chan != null) return chan;

            var ds = req?.HoaDon ?? new List<Models.HoaDonFileDto>();
            // Chặn payload phi lý — một kỳ nhiều nhất vài nghìn hóa đơn
            if (ds.Count > 20000)
                return BadRequest(new { message = "Quá 20.000 hóa đơn trong một lần rà soát" });

            // Rà soát CẢ HAI CHIỀU trong một lượt: hướng suy từ MST người bán trong
            // file, không bắt người dùng chọn trước. Client gửi Huong rỗng; nếu nó có
            // gửi (bản cũ) thì giữ nguyên giá trị đó.
            var mstDv = await MstDonVi();
            foreach (var f in ds)
            {
                if (!string.IsNullOrWhiteSpace(f.Huong)) continue;
                f.Huong = RaSoatService.SuyHuong(f.Mst, mstDv) ?? "VAO";
            }

            var ky = thang is >= 1 and <= 12 ? thang : null;
            return Ok(await _raSoat.Soat(TenantCode(), FiscalYear(), ky, ds));
        }

        /// <summary>
        /// POST api/thue/ra-soat/thu-muc?thang=7 — quét thư mục XML TRÊN MÁY CHỦ rồi
        /// đối chiếu với sổ. Dùng khi kho XML đã tải sẵn về server.
        /// Chỉ cho quét trong các gốc khai ở appsettings (Paths) — xem RaSoatService.
        /// </summary>
        public record QuetThuMucRequest(string? ThuMuc, string? Huong);

        [HttpPost("ra-soat/thu-muc")]
        public async Task<IActionResult> RaSoatThuMuc([FromQuery] int? thang,
                                                      [FromBody] QuetThuMucRequest req)
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

                var ds = RaSoatService.QuetThuMuc(req.ThuMuc, goc);
                // File XML không tự nói vào hay ra. Ép một chiều nếu người dùng chọn,
                // còn không thì suy từng file theo MST người bán so với MST đơn vị.
                var mstDv = huong == null ? await MstDonVi() : null;
                foreach (var x in ds)
                    x.Huong = huong ?? RaSoatService.SuyHuong(x.Mst, mstDv) ?? "VAO";

                var ky = thang is >= 1 and <= 12 ? thang : null;
                return Ok(await _raSoat.Soat(TenantCode(), FiscalYear(), ky, ds));
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
        /// GET api/thue/hoa-don/{maHd}/html — bản HTML gốc của hóa đơn (ảnh HĐ).
        /// </summary>
        [HttpGet("hoa-don/{maHd}/html")]
        public async Task<IActionResult> XemHtml(string maHd)
        {
            var chan = ChanNeuLaNoiBo();
            if (chan != null) return chan;
            var (html, _) = await _thue.LayHtmlGoc(TenantCode(), FiscalYear(), maHd);
            return html == null
                ? NotFound(new { message = "Hóa đơn này không có bản HTML kèm theo" })
                : Content(html, "text/html; charset=utf-8");
        }
    }
}
