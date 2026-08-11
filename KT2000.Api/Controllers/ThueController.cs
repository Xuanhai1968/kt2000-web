using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
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
        public ThueController(ThueService thue) => _thue = thue;

        private string TenantCode() =>
            User.FindFirst("tenant_code")?.Value
            ?? throw new UnauthorizedAccessException("Token không có thông tin đơn vị");

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
        /// GET api/thue/hoa-don/{maHd}/html — bản HTML gốc của hóa đơn (ảnh HĐ).
        /// Trả text/html để frontend mở bằng blob; 404 khi hóa đơn không kèm bản gốc.
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
