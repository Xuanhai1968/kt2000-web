using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using KT2000.Api.Models;
using KT2000.Api.Services;

namespace KT2000.Api.Controllers
{
    // Endpoint phần NỘI BỘ (NB): danh mục đối tượng/hàng, đơn hàng, gói hàng,
    // tra cứu xuyên DB sang sổ thuế.
    //
    // AN TOÀN: đơn vị và năm KHÔNG lấy từ body/query mà đọc thẳng từ claim trong token
    // (tenant_code, fiscal_year). Người dùng đổi tham số trên URL cũng không sang được
    // database của đơn vị khác — đúng luật CLAUDE.md #2 (backend mới là lớp an toàn thật,
    // frontend chỉ là lớp tiện dụng).
    //
    // BR-NB-04 (ranh giới hai sổ): mọi endpoint ở đây chỉ mở cho tenant_type='noibo'.
    // Tenant kế toán thuế gọi vào sẽ bị 403 — hai sổ tách bạch ngay từ cửa.
    [Route("api/nb")]
    [ApiController]
    [Authorize]
    public class NoiBoController : ControllerBase
    {
        private readonly NoiBoService _nb;
        public NoiBoController(NoiBoService nb) => _nb = nb;

        private string TenantCode() =>
            User.FindFirst("tenant_code")?.Value
            ?? throw new UnauthorizedAccessException("Token không có thông tin đơn vị");

        private int FiscalYear() =>
            int.TryParse(User.FindFirst("fiscal_year")?.Value, out var y)
                ? y
                : throw new UnauthorizedAccessException("Token không có năm làm việc");

        private string CurrentUser() => User.FindFirst("login_name")?.Value ?? "?";

        // Chặn ngay ở cửa: chỉ phiên đăng nhập của tenant NỘI BỘ mới đi tiếp được.
        // Trả về null nếu hợp lệ, ngược lại trả thẳng ActionResult 403 cho caller.
        private IActionResult? ChanNeuKhongPhaiNoiBo()
        {
            if (User.FindFirst("tenant_type")?.Value == "noibo") return null;
            return StatusCode(403, new
            {
                message = "Chức năng nội bộ chỉ dùng được ở đơn vị loại 'noibo'"
            });
        }

        // Hướng đơn chỉ nhận đúng hai giá trị — chặn ở cửa để không có chuỗi lạ nào
        // đi tiếp xuống tầng SQL. VAO = đơn nhập hàng, RA = đơn bán/giao hàng
        // (cùng bộ giá trị với cột tính huong của khuôn HOA_DON).
        private static string ChuanHoaHuong(string? huong)
        {
            var h = (huong ?? "").Trim().ToUpperInvariant();
            if (h != "VAO" && h != "RA")
                throw new ArgumentException("Hướng đơn chỉ nhận VAO hoặc RA");
            return h;
        }

        // ============================ DANH MỤC HÀNG ============================
        // boQua: số dòng bỏ qua từ đầu — combobox cuộn tới đáy thì gọi tiếp với
        // boQua = số dòng đang có (cuộn vô tận).
        [HttpGet("hang")]
        public async Task<IActionResult> TimHang([FromQuery] string? tu,
                                                 [FromQuery] int gioiHan = 50,
                                                 [FromQuery] int boQua = 0)
            => ChanNeuKhongPhaiNoiBo()
               ?? Ok(await _nb.SearchHang(TenantCode(), FiscalYear(), Rong(tu),
                                          Math.Clamp(gioiHan, 1, 500), Math.Max(0, boQua)));

        [HttpPost("hang")]
        public async Task<IActionResult> LuuHang([FromBody] DmHangNbDto d)
        {
            var chan = ChanNeuKhongPhaiNoiBo();
            if (chan != null) return chan;
            if (string.IsNullOrWhiteSpace(d.TenHang))
                return BadRequest(new { message = "Tên hàng không được để trống" });
            return Ok(await _nb.LuuHang(TenantCode(), FiscalYear(), d, CurrentUser()));
        }

        // ============================ DANH MỤC ĐỐI TƯỢNG ============================
        // BR-NB-01: một danh mục cho cả khách lẫn nhân viên.
        //   loaiDt=KH  -> combobox khách trên đơn
        //   loaiDt=NV  -> combobox NVKD/NVVC
        //   bỏ trống   -> màn hình danh mục, xem tất
        // maNhan: lọc khách theo nhãn hàng họ bán (ô "Nhãn hàng" trên form đánh đơn).
        // Bỏ trống = không lọc.
        [HttpGet("kh")]
        public async Task<IActionResult> TimKh([FromQuery] string? tu, [FromQuery] string? loaiDt,
                                               [FromQuery] int gioiHan = 50,
                                               [FromQuery] string? maNhan = null,
                                               [FromQuery] int boQua = 0)
            => ChanNeuKhongPhaiNoiBo()
               ?? Ok(await _nb.SearchKh(TenantCode(), FiscalYear(), Rong(tu), Rong(loaiDt),
                                        Math.Clamp(gioiHan, 1, 500), Rong(maNhan),
                                        Math.Max(0, boQua)));

        // ============================ DANH MỤC NHÃN HÀNG ============================
        [HttpGet("nhan")]
        public async Task<IActionResult> TimNhan([FromQuery] string? tu)
            => ChanNeuKhongPhaiNoiBo()
               ?? Ok(await _nb.SearchNhan(TenantCode(), FiscalYear(), Rong(tu)));

        // ============================ DANH MỤC MÀU PHA ============================
        // Nuôi ô "Mã màu" trên lưới đánh đơn (ngành sơn). ~1131 dòng nên phải chặn số
        // dòng trả về và cho cuộn tiếp bằng boQua — cùng cơ chế với "hang"/"kh".
        [HttpGet("mau")]
        public async Task<IActionResult> TimMau([FromQuery] string? tu,
                                                [FromQuery] int gioiHan = 50,
                                                [FromQuery] int boQua = 0)
            => ChanNeuKhongPhaiNoiBo()
               ?? Ok(await _nb.SearchMau(TenantCode(), FiscalYear(), Rong(tu),
                                         Math.Clamp(gioiHan, 1, 500), Math.Max(0, boQua)));

        [HttpPost("kh")]
        public async Task<IActionResult> LuuKh([FromBody] DmKhNbDto d)
        {
            var chan = ChanNeuKhongPhaiNoiBo();
            if (chan != null) return chan;
            if (string.IsNullOrWhiteSpace(d.TenKh))
                return BadRequest(new { message = "Tên đối tượng không được để trống" });
            return Ok(await _nb.LuuKh(TenantCode(), FiscalYear(), d, CurrentUser()));
        }

        // ============================ TRA CỨU XUYÊN DB (BR-NB-03) ============================
        // MỘT CỬA DUY NHẤT sang sổ thuế. Chỉ SELECT, chỉ trả tên hàng / dvt / ma_ngan /
        // ma_hang — không có giá, số tiền hay đối tác của sổ thuế (v1).
        // Đơn vị thuế được đọc lấy từ LinkedTenantCode của chính tenant đang đăng nhập,
        // KHÔNG nhận từ client.
        [HttpGet("tra-hang-thue")]
        public async Task<IActionResult> TraHangThue([FromQuery] string? tu,
                                                     [FromQuery] int gioiHan = 30)
            => ChanNeuKhongPhaiNoiBo()
               ?? Ok(await _nb.TraHangBenThue(TenantCode(), Rong(tu),
                                              Math.Clamp(gioiHan, 1, 200)));

        // ============================ ĐƠN HÀNG ============================
        [HttpGet("don/{huong}/so-tiep")]
        public async Task<IActionResult> SoTiep(string huong)
            => ChanNeuKhongPhaiNoiBo()
               ?? Ok(new { maHd = await _nb.SoDonKeTiep(TenantCode(), FiscalYear(),
                                                        ChuanHoaHuong(huong)) });

        // TỔNG HỢP CẢ HAI CHIỀU cho màn hình danh sách chứng từ.
        // Route này phải khai TRƯỚC "don/{huong}", nếu không "tat-ca" sẽ bị hiểu là
        // giá trị của {huong} rồi chết ở ChuanHoaHuong.
        [HttpGet("don/tat-ca")]
        public async Task<IActionResult> DanhSachTatCa([FromQuery] int? thang,
                                                       [FromQuery] string? tu,
                                                       [FromQuery] int gioiHan = 200)
            => ChanNeuKhongPhaiNoiBo()
               ?? Ok(await _nb.DanhSachDon(TenantCode(), FiscalYear(), null,
                                           thang, Rong(tu), Math.Clamp(gioiHan, 1, 1000)));

        [HttpGet("don/{huong}")]
        public async Task<IActionResult> DanhSach(string huong, [FromQuery] int? thang,
                                                  [FromQuery] string? tu,
                                                  [FromQuery] int gioiHan = 100)
            => ChanNeuKhongPhaiNoiBo()
               ?? Ok(await _nb.DanhSachDon(TenantCode(), FiscalYear(), ChuanHoaHuong(huong),
                                           thang, Rong(tu), Math.Clamp(gioiHan, 1, 500)));

        // Đơn gần nhất của một khách — "dùng lại đơn trước" trên màn đánh đơn.
        // Khai TRƯỚC "don/{huong}" cùng lý do với "don/tat-ca": nếu không, "gan-nhat"
        // sẽ bị hiểu là giá trị của {huong} rồi chết ở ChuanHoaHuong.
        //
        // Không có đơn cũ trả 204 (No Content) chứ KHÔNG phải 404: khách mới chưa mua bao
        // giờ là chuyện bình thường, không phải lỗi — 404 sẽ hiện đỏ trong log/console
        // mỗi lần chọn khách mới, lâu dần không ai buồn đọc log nữa.
        [HttpGet("don/gan-nhat/{huong}")]
        public async Task<IActionResult> DonGanNhat(string huong, [FromQuery] string maKh)
        {
            var chan = ChanNeuKhongPhaiNoiBo();
            if (chan != null) return chan;
            if (string.IsNullOrWhiteSpace(maKh))
                return BadRequest(new { message = "Thiếu mã khách" });
            var don = await _nb.DonGanNhatCuaKhach(TenantCode(), FiscalYear(),
                                                   ChuanHoaHuong(huong), maKh.Trim());
            return don == null ? NoContent() : Ok(don);
        }

        [HttpGet("don/chi-tiet/{maHd}")]
        public async Task<IActionResult> ChiTiet(string maHd)
        {
            var chan = ChanNeuKhongPhaiNoiBo();
            if (chan != null) return chan;
            var don = await _nb.LayDon(TenantCode(), FiscalYear(), maHd);
            return don == null
                ? NotFound(new { message = $"Không tìm thấy đơn {maHd}" })
                : Ok(don);
        }

        [HttpPost("don/{huong}")]
        public async Task<IActionResult> Luu(string huong, [FromBody] DonNbDto d)
        {
            var chan = ChanNeuKhongPhaiNoiBo();
            if (chan != null) return chan;
            try
            {
                return Ok(await _nb.LuuDon(TenantCode(), FiscalYear(), ChuanHoaHuong(huong),
                                           d, CurrentUser()));
            }
            catch (ArgumentException ex)
            {
                return BadRequest(new { message = ex.Message });
            }
        }

        [HttpDelete("don/{maHd}")]
        public async Task<IActionResult> Xoa(string maHd)
        {
            var chan = ChanNeuKhongPhaiNoiBo();
            if (chan != null) return chan;
            try
            {
                return await _nb.XoaDon(TenantCode(), FiscalYear(), maHd)
                    ? Ok(new { message = $"Đã xóa đơn {maHd}" })
                    : NotFound(new { message = $"Không tìm thấy đơn {maHd}" });
            }
            catch (ArgumentException ex)
            {
                return BadRequest(new { message = ex.Message });
            }
        }

        // ============================ GÓI HÀNG (BR-NB-08) ============================
        [HttpGet("goi")]
        public async Task<IActionResult> DanhSachGoi([FromQuery] int? thang,
                                                     [FromQuery] string? trangThai,
                                                     [FromQuery] int gioiHan = 100)
            => ChanNeuKhongPhaiNoiBo()
               ?? Ok(await _nb.DanhSachGoi(TenantCode(), FiscalYear(), thang, Rong(trangThai),
                                           Math.Clamp(gioiHan, 1, 500)));

        [HttpGet("goi/{maGoi}")]
        public async Task<IActionResult> ChiTietGoi(string maGoi)
        {
            var chan = ChanNeuKhongPhaiNoiBo();
            if (chan != null) return chan;
            var g = await _nb.LayGoi(TenantCode(), FiscalYear(), maGoi);
            return g == null
                ? NotFound(new { message = $"Không tìm thấy gói {maGoi}" })
                : Ok(g);
        }

        [HttpPost("goi")]
        public async Task<IActionResult> LuuGoi([FromBody] GoiHdDto d)
            => ChanNeuKhongPhaiNoiBo()
               ?? Ok(await _nb.LuuGoi(TenantCode(), FiscalYear(), d, CurrentUser()));

        // Ghép đơn vào gói: tích chọn đơn theo ma_hd (BR-NB-08)
        [HttpPost("goi/{maGoi}/ghep")]
        public async Task<IActionResult> GhepDon(string maGoi, [FromBody] List<string> dsMaHd)
        {
            var chan = ChanNeuKhongPhaiNoiBo();
            if (chan != null) return chan;
            try
            {
                var n = await _nb.GhepDonVaoGoi(TenantCode(), FiscalYear(), maGoi, dsMaHd,
                                                CurrentUser());
                return Ok(new { message = $"Đã ghép {n} đơn vào gói {maGoi}", soDon = n });
            }
            catch (ArgumentException ex) { return BadRequest(new { message = ex.Message }); }
        }

        // Rút đơn khỏi gói — đường DUY NHẤT để sửa lại đơn đã vào gói chốt
        [HttpPost("goi/rut")]
        public async Task<IActionResult> RutDon([FromBody] List<string> dsMaHd)
        {
            var chan = ChanNeuKhongPhaiNoiBo();
            if (chan != null) return chan;
            try
            {
                var n = await _nb.RutDonKhoiGoi(TenantCode(), FiscalYear(), dsMaHd, CurrentUser());
                return Ok(new { message = $"Đã rút {n} đơn khỏi gói", soDon = n });
            }
            catch (ArgumentException ex) { return BadRequest(new { message = ex.Message }); }
        }

        // CHỐT GÓI -> sinh phiếu soạn hàng (snapshot) + khóa sửa đơn con
        [HttpPost("goi/{maGoi}/chot")]
        public async Task<IActionResult> ChotGoi(string maGoi)
        {
            var chan = ChanNeuKhongPhaiNoiBo();
            if (chan != null) return chan;
            try
            {
                return Ok(await _nb.ChotGoi(TenantCode(), FiscalYear(), maGoi, CurrentUser()));
            }
            catch (ArgumentException ex) { return BadRequest(new { message = ex.Message }); }
        }

        // XUẤT GÓI -> đóng dấu ngay_nh hàng loạt (BR-NB-07: lúc này mới trừ kho)
        [HttpPost("goi/{maGoi}/xuat")]
        public async Task<IActionResult> XuatGoi(string maGoi, [FromQuery] DateTime? ngayXuat)
        {
            var chan = ChanNeuKhongPhaiNoiBo();
            if (chan != null) return chan;
            try
            {
                return Ok(await _nb.XuatGoi(TenantCode(), FiscalYear(), maGoi, ngayXuat,
                                            CurrentUser()));
            }
            catch (ArgumentException ex) { return BadRequest(new { message = ex.Message }); }
        }

        // Ô tìm để trống thì coi như không lọc, khỏi phải kiểm ở từng câu SQL
        private static string? Rong(string? s) => string.IsNullOrWhiteSpace(s) ? null : s.Trim();
    }
}
