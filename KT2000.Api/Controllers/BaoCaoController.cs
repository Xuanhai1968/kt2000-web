using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using KT2000.Api.Models;
using KT2000.Api.Services;

namespace KT2000.Api.Controllers
{
    // ===================== BÁO CÁO (SPEC-BAO-CAO-TON-KHO mục 4) =====================
    //
    // BR-BC-01 — TOÀN BỘ là GET. Không có và sẽ không có endpoint ghi ở đây; mọi hành động
    // sửa dữ liệu (dời ngày, đánh dấu phải sửa, tính lại giá) thuộc module khác, màn báo cáo
    // chỉ gọi sang rồi nạp lại.
    //
    // BR-BC-12 — đơn vị và năm CHỈ đọc từ claim trong token, không nhận từ query/body.
    // Người dùng sửa URL cũng không sang được database của đơn vị khác.
    //
    // Chặn 'noibo' như ThueController: đơn vị nội bộ không dùng sổ thuế nên vào đây là nhầm
    // màn hình — thà báo rõ còn hơn trả bảng rỗng để họ tưởng chưa có dữ liệu.
    [Route("api/bao-cao")]
    [ApiController]
    [Authorize]
    public class BaoCaoController : ControllerBase
    {
        private readonly TonKhoService _tonKho;
        public BaoCaoController(TonKhoService tonKho) => _tonKho = tonKho;

        private string TenantCode() =>
            User.FindFirst("tenant_code")?.Value
            ?? throw new UnauthorizedAccessException("Token không có thông tin đơn vị");

        private int FiscalYear() =>
            int.TryParse(User.FindFirst("fiscal_year")?.Value, out var y)
                ? y : throw new UnauthorizedAccessException("Token không có năm làm việc");

        private IActionResult? ChanNeuLaNoiBo() =>
            User.FindFirst("tenant_type")?.Value == "noibo"
                ? StatusCode(403, new
                  { message = "Đơn vị nội bộ không có báo cáo tồn kho thuế" })
                : null;

        // Tháng ngoài 1–13 quy về 13 (cả năm) thay vì ném lỗi: người dùng sửa URL thì cho họ
        // xem cả năm, còn hơn một màn hình vỡ mà không nói vì sao.
        private static int ChuanHoaThang(int? thang)
            => thang is >= 1 and <= 13 ? thang.Value : 13;

        /// <summary>
        /// GET api/bao-cao/ton-kho?thang=7&amp;includeLoLai=true — bảng tổng hợp (grid trên).
        /// Trả kèm cờ canTinhLaiGia cho banner BR-BC-11.
        /// </summary>
        [HttpGet("ton-kho")]
        public async Task<IActionResult> TonKho([FromQuery] int? thang,
                                                [FromQuery] bool includeLoLai = false,
                                                [FromQuery] bool includePhaiSua = false,
                                                [FromQuery] string? maTk = null,
                                                [FromQuery] string? maHang = null)
        {
            var chan = ChanNeuLaNoiBo();
            if (chan != null) return chan;

            var q = new TonKhoQuery
            {
                Thang = ChuanHoaThang(thang),
                IncludeLoLai = includeLoLai,
                IncludePhaiSua = includePhaiSua,
                MaTk = TachDs(maTk),
                MaHang = TachDs(maHang),
            };
            return Ok(await _tonKho.GetTongHopAsync(TenantCode(), FiscalYear(), q));
        }

        /// <summary>
        /// GET api/bao-cao/ton-kho/chi-tiet?maHang=H0&amp;thang=7 — phát sinh của một mặt hàng.
        /// </summary>
        [HttpGet("ton-kho/chi-tiet")]
        public async Task<IActionResult> ChiTiet([FromQuery] string? maHang,
                                                 [FromQuery] int? thang)
        {
            var chan = ChanNeuLaNoiBo();
            if (chan != null) return chan;
            // maHang RỖNG là hợp lệ: 1.389 dòng đang có ma_hang NULL và được gom về chuỗi
            // rỗng — muốn xem phát sinh của nhóm chưa định khoản thì đúng là truyền rỗng.
            return Ok(await _tonKho.GetChiTietAsync(
                TenantCode(), FiscalYear(), maHang ?? "", ChuanHoaThang(thang)));
        }

        /// <summary>
        /// GET api/bao-cao/ton-kho/hang-am?thang=7 — mặt hàng có số dư âm giữa chừng.
        /// CHỈ ĐỌC: nút "Test" của spec Chỉnh kho gọi đây để lấy danh sách, phần sửa dữ liệu
        /// nằm bên spec đó.
        /// </summary>
        [HttpGet("ton-kho/hang-am")]
        public async Task<IActionResult> HangAm([FromQuery] int? thang)
        {
            var chan = ChanNeuLaNoiBo();
            if (chan != null) return chan;
            return Ok(await _tonKho.GetHangAmAsync(TenantCode(), FiscalYear(),
                                                   thang is >= 1 and <= 12 ? thang : null));
        }

        /// <summary>
        /// GET api/bao-cao/ton-kho/den-ngay?ngay=2026-07-31 — tồn tới một ngày bất kỳ.
        /// Viên gạch cho nghiệp vụ tách khuyến mại; chưa màn hình nào dùng, mở sẵn để spec
        /// sau không phải sửa service.
        /// </summary>
        [HttpGet("ton-kho/den-ngay")]
        public async Task<IActionResult> DenNgay([FromQuery] DateTime ngay,
                                                 [FromQuery] string? maHang = null)
        {
            var chan = ChanNeuLaNoiBo();
            if (chan != null) return chan;
            return Ok(await _tonKho.GetTonDenNgayAsync(
                TenantCode(), FiscalYear(), ngay, maHang));
        }

        // Danh sách truyền dạng "156,152". Bỏ phần tử rỗng để "156," không sinh ra một mã
        // rỗng rồi lọc trượt sạch.
        private static List<string>? TachDs(string? s)
            => string.IsNullOrWhiteSpace(s)
             ? null
             : s.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                .ToList();
    }
}
