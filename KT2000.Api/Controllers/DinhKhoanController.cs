using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using KT2000.Api.Data;
using KT2000.Api.Services;

namespace KT2000.Api.Controllers
{
    // ===================== ĐỊNH KHOẢN =====================
    //
    // GATE CHẶT HƠN MỌI CONTROLLER KHÁC, và đây là lý do:
    // các endpoint khác chỉ đọc database của ĐƠN VỊ ĐANG ĐĂNG NHẬP (lấy từ claim), nên
    // kể cả gate hỏng thì người dùng cũng chỉ thấy dữ liệu của chính mình. Còn ở đây
    // danh sách đơn vị đến TỪ THAM SỐ — gate hỏng là một khách hàng đọc được sổ của
    // khách hàng khác. Vì vậy chặn theo MÃ ĐƠN VỊ, không chỉ theo tenant_type.
    //
    // Ẩn menu và chặn route ở frontend chỉ là lớp tiện dụng; đây mới là lớp thật.
    [Route("api/dinh-khoan")]
    [ApiController]
    [Authorize]
    public class DinhKhoanController : ControllerBase
    {
        private readonly DinhKhoanService _dk;
        private readonly DkPubService _pub;
        private readonly DkPredictService _predict;
        private readonly DkTrainService _train;
        private readonly AppDbContext _db;

        public DinhKhoanController(DinhKhoanService dk, DkPubService pub,
                                   DkPredictService predict, DkTrainService train,
                                   AppDbContext db)
        { _dk = dk; _pub = pub; _predict = predict; _train = train; _db = db; }

        // PHẢI khớp CO_DINH_KHOAN ở AppShell.tsx và DinhKhoan.tsx.
        private static readonly string[] CO_DINH_KHOAN = { "MDN_NB" };

        private IActionResult? ChanNeuKhongDuocPhep()
        {
            string? code = User.FindFirst("tenant_code")?.Value;
            return CO_DINH_KHOAN.Contains(code, StringComparer.OrdinalIgnoreCase)
                 ? null
                 : StatusCode(403, new { message = "Đơn vị này không có chức năng định khoản" });
        }

        private int FiscalYear() =>
            int.TryParse(User.FindFirst("fiscal_year")?.Value, out var y)
                ? y : throw new UnauthorizedAccessException("Token không có năm làm việc");

        /// <summary>
        /// GET api/dinh-khoan/ten-hang?maDonVi=A,B&amp;huong=VAO — mặt hàng gốc duy nhất.
        /// </summary>
        [HttpGet("ten-hang")]
        public async Task<IActionResult> TenHang([FromQuery] string? maDonVi,
                                                 [FromQuery] string? huong)
        {
            var chan = ChanNeuKhongDuocPhep();
            if (chan != null) return chan;

            var ds = TachDs(maDonVi);
            if (ds.Count == 0)
                return BadRequest(new { message = "Chưa chọn đơn vị nào (tick cột Run)" });

            // Chặn số đơn vị một lượt: tick nhầm cả trăm đơn vị thì mỗi cái là một kết
            // nối database, treo cả máy chủ mà không ai hiểu vì sao.
            if (ds.Count > 50)
                return BadRequest(new { message = "Chọn tối đa 50 đơn vị một lượt" });

            return Ok(await _dk.LayTenHangAsync(ds, FiscalYear(), ChuanHuong(huong)));
        }

        /// <summary>
        /// GET api/dinh-khoan/dong-hoa-don?maDonVi=A&amp;tenHang=…&amp;huong=VAO
        /// </summary>
        [HttpGet("dong-hoa-don")]
        public async Task<IActionResult> DongHoaDon([FromQuery] string? maDonVi,
                                                    [FromQuery] string? tenHang,
                                                    [FromQuery] string? huong)
        {
            var chan = ChanNeuKhongDuocPhep();
            if (chan != null) return chan;

            if (string.IsNullOrWhiteSpace(maDonVi))
                return BadRequest(new { message = "Thiếu mã đơn vị" });

            return Ok(await _dk.LayDongHoaDonAsync(
                maDonVi.Trim(), FiscalYear(), tenHang ?? "", ChuanHuong(huong)));
        }

        /// <summary>
        /// PUT api/dinh-khoan/cap-nhat — sửa định khoản và/hoặc xác nhận đúng.
        /// Một endpoint cho cả hai vì chúng luôn đi cùng nhau: người dùng soi một lượt
        /// rồi bấm ghi, có dòng sửa có dòng chỉ xác nhận. Tách đôi thì màn hình phải gọi
        /// hai lần và tự lo chuyện một cái thành công một cái hỏng.
        /// </summary>
        [HttpPut("cap-nhat")]
        public async Task<IActionResult> CapNhat(
            [FromBody] List<DinhKhoanService.ThayDoiDto>? ds)
        {
            var chan = ChanNeuKhongDuocPhep();
            if (chan != null) return chan;

            var list = ds ?? new List<DinhKhoanService.ThayDoiDto>();
            if (list.Count == 0)
                return BadRequest(new { message = "Không có thay đổi nào để ghi" });
            if (list.Count > 2000)
                return BadRequest(new { message = "Quá 2.000 mặt hàng một lượt — chia nhỏ ra" });

            // Chặn tài khoản rác NGAY Ở CỬA. Để lọt xuống thì nó nằm im trong sổ tới lúc
            // lên báo cáo mới lộ, và lúc đó không ai nhớ nó vào bằng đường nào.
            var xau = list
                .Where(x => !string.IsNullOrWhiteSpace(x.TkMoi))
                .Select(x => x.TkMoi!.Trim())
                .Where(t => !t.All(char.IsAsciiDigit) || t.Length is < 3 or > 10)
                .Distinct()
                .ToList();
            if (xau.Count > 0)
                return BadRequest(new
                { message = $"Tài khoản không hợp lệ: {string.Join(", ", xau.Take(5))}" });

            string user = NguoiDung();
            int soDong = await _dk.CapNhatAsync(list, FiscalYear(), user);

            // Luật #7: chức năng nghiệp vụ nào cũng phải để lại vết. Ghi số MẶT HÀNG lẫn
            // số DÒNG — một mặt hàng sửa một lần có thể chạm hàng trăm dòng hoá đơn, và
            // sáu tháng sau nhìn lại chỉ thấy "đã ghi 812 dòng" thì không ai đoán ra
            // người dùng đã bấm những gì.
            await GhiNhatKy("DK_CAP_NHAT",
                $"{list.Count} mặt hàng → {soDong} dòng hàng "
              + $"({list.Count(x => !string.IsNullOrWhiteSpace(x.TkMoi))} sửa định khoản)");
            return Ok(new { message = $"Đã ghi {soDong} dòng hàng", soDong });
        }

        // ===================== NHÓM C — Data Training CHUNG (KT2000_PUB) =====================

        public sealed class AutoNewReq
        {
            public List<string> MaDonVi { get; set; } = new();
            public string? Huong { get; set; }
        }

        /// <summary>
        /// POST api/dinh-khoan/auto-new — Auto Accounting New: máy tự định khoản toàn bộ.
        ///
        /// Chạy model cho MỌI mặt hàng chưa ai xác nhận rồi ghi nhãn thẳng vào
        /// ghi_no/ghi_co (chụp dk_goc trước). Mặt hàng đã xác nhận đúng thì không đụng —
        /// đó là chữ "New" trong tên nút.
        /// </summary>
        [HttpPost("auto-new")]
        public async Task<IActionResult> AutoNew([FromBody] AutoNewReq? req)
        {
            var chan = ChanNeuKhongDuocPhep();
            if (chan != null) return chan;

            var ds = (req?.MaDonVi ?? new List<string>())
                .Where(x => !string.IsNullOrWhiteSpace(x)).Select(x => x.Trim()).ToList();
            if (ds.Count == 0)
                return BadRequest(new { message = "Chưa chọn đơn vị nào (tick cột Run)" });
            if (ds.Count > 50)
                return BadRequest(new { message = "Chọn tối đa 50 đơn vị một lượt" });

            var kq = await _predict.ChayAsync(ds, FiscalYear(), ChuanHuong(req?.Huong),
                                              NguoiDung(), HttpContext.RequestAborted);
            await GhiNhatKy("DK_MAY_DOAN",
                $"{string.Join(",", ds)} — {kq.SoMatHang} mặt hàng → {kq.SoDong} dòng "
              + $"({kq.SoCanSoi} dưới ngưỡng {DkPredictService.NGUONG_TIN_CAY:0.00}, "
              + $"{kq.SoBoQua} tên hàng ghi chú → {kq.SoGhiChu} dòng)");

            string tin = kq.SoMatHang == 0
                ? "Không còn mặt hàng nào chưa xác nhận"
                : $"Máy đoán {kq.SoMatHang} mặt hàng → ghi {kq.SoDong} dòng hàng · "
                + $"{kq.SoCanSoi} cái máy không chắc, nên soi trước";
            if (kq.SoBoQua > 0)
                tin += $" · {kq.SoBoQua} tên hàng ghi chú đã đóng vào 154 "
                     + $"({kq.SoGhiChu} dòng), không đưa vào huấn luyện";

            return Ok(new
            {
                message = tin,
                kq.SoMatHang, kq.SoDong, kq.SoChac, kq.SoCanSoi,
                kq.SoBoQua, kq.SoGhiChu, kq.TinCayTb, kq.CanhBao,
            });
        }

        /// <summary>
        /// POST api/dinh-khoan/day-train — Update về Data Training.
        /// Đẩy mặt hàng đã chốt vào KT2000_PUB.DK_DATA_TRAIN.
        /// </summary>
        [HttpPost("day-train")]
        public async Task<IActionResult> DayTrain([FromBody] List<DkPubService.ChotDto>? ds)
        {
            var chan = ChanNeuKhongDuocPhep();
            if (chan != null) return chan;

            var list = ds ?? new List<DkPubService.ChotDto>();
            if (list.Count == 0)
                return BadRequest(new { message = "Chưa chọn mặt hàng nào để đẩy về dữ liệu huấn luyện" });
            if (list.Count > 2000)
                return BadRequest(new { message = "Quá 2.000 mặt hàng một lượt — chia nhỏ ra" });

            var xau = list.Select(x => (x.Label ?? "").Trim())
                          .Where(t => t.Length > 0 && (!t.All(char.IsAsciiDigit)
                                                    || t.Length is < 3 or > 10))
                          .Distinct().ToList();
            if (xau.Count > 0)
                return BadRequest(new
                { message = $"Tài khoản không hợp lệ: {string.Join(", ", xau.Take(5))}" });

            var kq = await _pub.ChotAsync(list, NguoiDung(), HttpContext.RequestAborted);

            int moi = kq.Count(x => x.TrangThai == "NEW");
            int trung = kq.Count(x => x.TrangThai == "DUPLICATE");
            int xungDot = kq.Count(x => x.TrangThai == "CONFLICT");
            int loai = kq.Count(x => x.TrangThai.StartsWith("REJECT"));
            await GhiNhatKy("DK_DAY_TRAIN",
                $"{moi} mới · {trung} đã có · {xungDot} xung đột · {loai} bị loại");

            return Ok(new
            {
                message = $"{moi} mới · {trung} đã có · {xungDot} xung đột · {loai} bị loại",
                moi, trung, xungDot, loai,
                chiTiet = kq,
            });
        }

        /// <summary>
        /// POST api/dinh-khoan/huan-luyen — huấn luyện lại model từ Data Training.
        ///
        /// KHÁC HẲN auto-new: cái kia ĐỌC model, cái này GHI ĐÈ model. Và nó ảnh hưởng
        /// MỌI đơn vị chứ không riêng đơn vị đang chọn — model là model chung.
        /// </summary>
        [HttpPost("huan-luyen")]
        public async Task<IActionResult> HuanLuyen()
        {
            var chan = ChanNeuKhongDuocPhep();
            if (chan != null) return chan;

            DkTrainService.KetQuaTrain kq;
            try
            {
                kq = await _train.HuanLuyenAsync(NguoiDung(), HttpContext.RequestAborted);
            }
            catch (InvalidOperationException ex)
            {
                // 409 chứ không 500: người dùng bấm trùng lượt hoặc Data Training rỗng là
                // chuyện bình thường, không phải máy chủ hỏng.
                return Conflict(new { message = ex.Message });
            }

            await GhiNhatKy("DK_HUAN_LUYEN",
                $"{kq.SoMau} mẫu · {kq.SoLop} tài khoản · độ chính xác {kq.DoChinhXac:0.0000} "
              + $"· {kq.GiaySo:0.0}s");

            return Ok(new
            {
                message = $"Đã huấn luyện lại: {kq.SoMau:N0} mẫu · {kq.SoLop} tài khoản "
                        + $"({string.Join(", ", kq.Lop)}) · độ chính xác {kq.DoChinhXac:0.0000} "
                        + $"· {kq.GiaySo:0.0} giây",
                kq.SoMau, kq.SoLop, kq.DoChinhXac, kq.GiaySo, kq.Lop,
            });
        }

        /// <summary>
        /// GET api/dinh-khoan/danh-muc-tk — 93 tài khoản trong KT2000_Base.DM_TK.
        /// Ô chọn định khoản phải hiện được TÊN tài khoản: gõ trần "156" thì người mới
        /// vào nghề không biết mình vừa chọn cái gì.
        /// </summary>
        [HttpGet("danh-muc-tk")]
        public async Task<IActionResult> DanhMucTk()
        {
            var chan = ChanNeuKhongDuocPhep();
            if (chan != null) return chan;
            return Ok(await _dk.LayDanhMucTkAsync(HttpContext.RequestAborted));
        }

        /// <summary>GET api/dinh-khoan/cho-giai-thich — xung đột đang chờ người dùng viết lý do.</summary>
        [HttpGet("cho-giai-thich")]
        public async Task<IActionResult> ChoGiaiThich()
        {
            var chan = ChanNeuKhongDuocPhep();
            if (chan != null) return chan;
            return Ok(await _pub.LayChoGiaiThichAsync(HttpContext.RequestAborted));
        }

        public sealed class GiaiThichReq
        {
            public long Id { get; set; }
            public string MoTa { get; set; } = "";
        }

        /// <summary>
        /// PUT api/dinh-khoan/giai-thich — viết lý do cho một dòng xung đột.
        /// Có lý do thì dòng đó mới được vào model (status ACTIVE).
        /// </summary>
        [HttpPut("giai-thich")]
        public async Task<IActionResult> GiaiThich([FromBody] GiaiThichReq? req)
        {
            var chan = ChanNeuKhongDuocPhep();
            if (chan != null) return chan;

            string moTa = (req?.MoTa ?? "").Trim();
            if (req == null || req.Id <= 0)
                return BadRequest(new { message = "Thiếu dòng cần giải thích" });
            // Ngưỡng 10 ký tự là cố ý. Cho phép gõ "ok" thì ô giải thích thành thủ tục
            // bấm cho xong, mà nó lại chính là thứ duy nhất chặn dữ liệu bẩn vào model.
            if (moTa.Length < 10)
                return BadRequest(new
                { message = "Giải thích quá ngắn — viết rõ vì sao lần này định khoản khác (tối thiểu 10 ký tự)" });

            int n = await _pub.GiaiThichAsync(req.Id, moTa, NguoiDung(),
                                              HttpContext.RequestAborted);
            if (n == 0)
                return BadRequest(new { message = "Dòng này không còn chờ giải thích (có thể đã được xử lý)" });

            await GhiNhatKy("DK_GIAI_THICH", $"id {req.Id}: {moTa}");
            return Ok(new { message = "Đã ghi giải thích — dòng này sẽ vào dữ liệu huấn luyện" });
        }

        // ===================== PHỤ TRỢ =====================

        // Claim tên đăng nhập là "login_name" (AuthService dòng 131), KHÔNG phải
        // "unique_name", và Identity.Name luôn null vì MapInboundClaims = false ở
        // Program.cs. Dùng sai tên claim thì mọi vết để lại là dấu "?" — vẫn ghi được,
        // vẫn không lỗi, chỉ là không truy được ai làm. Cùng hàm với ThueController.
        private string NguoiDung() => User.FindFirst("login_name")?.Value ?? "?";

        // Nuốt lỗi CÓ CHỦ ĐÍCH: việc nghiệp vụ đã ghi xong rồi, hỏng một dòng nhật ký mà
        // ném tiếp thì người dùng tưởng thất bại và bấm lại. Cùng cách AdminService làm.
        private async Task GhiNhatKy(string hanhDong, string chiTiet)
        {
            try
            {
                string? code = User.FindFirst("tenant_code")?.Value;
                var tid = await _db.Tenants.AsNoTracking()
                    .Where(t => t.Code == code).Select(t => (Guid?)t.Id)
                    .FirstOrDefaultAsync(HttpContext.RequestAborted);
                await _db.Database.ExecuteSqlRawAsync(
                    @"INSERT INTO ActivityLog (UserName, TenantId, Nam, Action, Detail)
                      VALUES ({0}, {1}, {2}, {3}, {4})",
                    NguoiDung(), (object?)tid ?? DBNull.Value, FiscalYear(),
                    hanhDong, chiTiet);
            }
            catch { /* mất một dòng nhật ký còn hơn báo hỏng một việc đã xong */ }
        }

        // Lưới dùng nhãn V/R cho gọn, cột huong trong DB là VAO/RA. Đổi ở một chỗ.
        private static string? ChuanHuong(string? h)
        {
            string s = (h ?? "").Trim().ToUpperInvariant();
            return s switch { "V" or "VAO" => "VAO", "R" or "RA" => "RA", _ => null };
        }

        // Danh sách dạng "MDN_NB,HOA_SANG". Bỏ phần tử rỗng để "A," không sinh ra một mã
        // rỗng rồi đi mở database tên rỗng.
        private static List<string> TachDs(string? s)
            => string.IsNullOrWhiteSpace(s)
             ? new List<string>()
             : s.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                .ToList();
    }
}
