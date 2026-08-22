using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using KT2000.Api.Data;
using KT2000.Api.Services;

namespace KT2000.Api.Controllers
{
    // Chấm công + bảng thanh toán lương. Dữ liệu ở database ĐƠN VỊ-NĂM
    // (database/027_tenant_chamcong_bangluong.sql), xem ChamCongService.
    //
    // Gate giống HopDongController (BR-HD-02): đơn vị thường chỉ dùng chính mình,
    // MDN_NB chọn được đơn vị khách để làm hộ, đơn vị nội bộ không có màn này.
    [Route("api/cham-cong")]
    [ApiController]
    [Authorize]
    public class ChamCongController : ControllerBase
    {
        private readonly ChamCongService _cc;
        private readonly ExcelLuongService _nhap;
        private readonly AppDbContext _db;

        public ChamCongController(ChamCongService cc, ExcelLuongService nhap,
                                  AppDbContext db)
        {
            _cc = cc;
            _nhap = nhap;
            _db = db;
        }

        private string CurrentUser() => User.FindFirst("login_name")?.Value ?? "?";

        private string TenantCode() =>
            User.FindFirst("tenant_code")?.Value
            ?? throw new UnauthorizedAccessException("Token không có thông tin đơn vị");

        private int FiscalYear() =>
            int.TryParse(User.FindFirst("fiscal_year")?.Value, out var y)
                ? y
                : throw new UnauthorizedAccessException("Token không có năm làm việc");

        private async Task<(string? Code, int Year, string? Loi)> DonViThaoTac(string? ma)
        {
            var cuaToi = TenantCode();
            var nam = FiscalYear();

            if (User.FindFirst("tenant_type")?.Value == "noibo")
                return (null, nam, "Đơn vị nội bộ không dùng màn Chấm công / Lương");

            var xin = (ma ?? "").Trim().ToUpperInvariant();
            if (xin.Length == 0 || xin == cuaToi) return (cuaToi, nam, null);

            if (User.FindFirst("tenant_type")?.Value != "internal")
                return (null, nam, "Chỉ đơn vị quản trị nội bộ mới làm hộ đơn vị khác");

            if (!TenantDbResolver.IsValidCode(xin))
                return (null, nam, "Mã đơn vị không hợp lệ");

            return await _db.Tenants.AnyAsync(t => t.Code == xin)
                ? (xin, nam, null)
                : (null, nam, $"Không có đơn vị {xin}");
        }

        private static bool ThangHopLe(int t) => t is >= 1 and <= 12;

        /// <summary>
        /// Kiểm file tải lên. Trả câu báo lỗi, null nếu hợp lệ.
        ///
        /// Nhận CẢ .xls lẫn .xlsx: khuôn lương gốc của kế toán là .xls (Excel 97-2003) —
        /// `test/hopdong/BANG_LUONG_2025_VINH_HOAN_BAN_IN.xls`. DocFileExcel tự chuyển
        /// .xls sang .xlsx trong bộ nhớ, không bắt người dùng mở Excel lưu lại tay.
        /// </summary>
        private static string? KiemFile(IFormFile? file)
        {
            if (file == null || file.Length == 0) return "Chưa chọn file Excel";

            return DocFileExcel.DuoiHopLe(file.FileName)
                ? null
                : "Chỉ nhận file Excel (.xls hoặc .xlsx)";
        }

        /// <summary>
        /// Danh sách đơn vị dùng để đối chiếu tên đọc từ file.
        ///
        /// Đơn vị thường chỉ so với CHÍNH MÌNH: đưa cả danh sách khách hàng cho nó thì
        /// một file lạ cũng đủ để dò ra tên các đơn vị khác trong hệ thống.
        /// </summary>
        private async Task<List<SuyDonViTuFile.DonVi>> DsDonViDoiChieu()
        {
            var loaiDv = User.FindFirst("tenant_type")?.Value;
            var cuaToi = TenantCode();

            var truyVan = _db.Tenants.AsNoTracking().Where(t => t.IsActive);
            truyVan = loaiDv == "internal"
                ? truyVan.Where(t => t.TenantType != "noibo")
                : truyVan.Where(t => t.Code == cuaToi);

            return await truyVan
                .Select(t => new SuyDonViTuFile.DonVi(t.Code, t.Name))
                .ToListAsync(HttpContext.RequestAborted);
        }

        // ===================== CHẤM CÔNG =====================

        [HttpGet]
        public async Task<IActionResult> DanhSach(
            [FromQuery] int thang, [FromQuery] string? maDonVi)
        {
            if (!ThangHopLe(thang))
                return BadRequest(new { message = "Tháng phải từ 1 đến 12" });

            var (dv, nam, loi) = await DonViThaoTac(maDonVi);
            if (dv == null) return StatusCode(403, new { message = loi });

            try { return Ok(await _cc.DanhSachChamCong(dv, nam, thang)); }
            catch (SoChuaMoException ex) { return Conflict(new { message = ex.Message }); }
        }

        /// <summary>
        /// Sinh dòng trống cho nhân sự đang làm mà tháng này chưa có, điền sẵn 'CN' vào
        /// chủ nhật. Ngày lễ KHÔNG tự điền — lịch nghỉ lễ mỗi năm một khác và còn phụ
        /// thuộc lịch nghỉ bù do Chính phủ công bố.
        /// </summary>
        [HttpPost("khoi-tao")]
        public async Task<IActionResult> KhoiTao(
            [FromQuery] int thang, [FromQuery] string? maDonVi)
        {
            if (!ThangHopLe(thang))
                return BadRequest(new { message = "Tháng phải từ 1 đến 12" });

            var (dv, nam, loi) = await DonViThaoTac(maDonVi);
            if (dv == null) return StatusCode(403, new { message = loi });

            try
            {
                var n = await _cc.KhoiTao(dv, nam, thang, CurrentUser());
                return Ok(new
                {
                    message = n == 0
                        ? "Mọi nhân sự đang làm đều đã có dòng chấm công tháng này"
                        : $"Đã tạo {n} dòng chấm công, điền sẵn chủ nhật",
                    soDong = n,
                });
            }
            catch (SoChuaMoException ex) { return Conflict(new { message = ex.Message }); }
        }

        [HttpPut]
        public async Task<IActionResult> Luu(
            [FromQuery] int thang, [FromQuery] string? maDonVi,
            [FromBody] List<Models.ChamCongDto>? ds)
        {
            if (!ThangHopLe(thang))
                return BadRequest(new { message = "Tháng phải từ 1 đến 12" });

            var (dv, nam, loi) = await DonViThaoTac(maDonVi);
            if (dv == null) return StatusCode(403, new { message = loi });

            var dong = ds ?? new List<Models.ChamCongDto>();
            if (dong.Count > 1000)
                return BadRequest(new
                { message = "Một tháng không thể có quá 1000 dòng chấm công" });

            try
            {
                var n = await _cc.LuuChamCong(dv, nam, thang, dong, CurrentUser());
                return Ok(new { message = $"Đã lưu chấm công {n} người", soDong = n });
            }
            catch (SoChuaMoException ex) { return Conflict(new { message = ex.Message }); }
        }

        /// <summary>
        /// Đọc bảng chấm công từ file Excel kế toán đang dùng tay, trả bản NHÁP để soát
        /// trên lưới. KHÔNG ghi DB — cùng nhịp POST /bang-luong/tinh: người dùng soát rồi
        /// mới bấm Lưu (PUT). Nhập xong ghi thẳng thì một file chọn nhầm là mất cả tháng
        /// công đã gõ.
        /// </summary>
        [HttpPost("nhap-excel")]
        [RequestSizeLimit(30 * 1024 * 1024)]
        public async Task<IActionResult> NhapExcelChamCong(
            IFormFile? file, [FromQuery] int thang, [FromQuery] string? maDonVi)
        {
            if (!ThangHopLe(thang))
                return BadRequest(new { message = "Tháng phải từ 1 đến 12" });

            var loiFile = KiemFile(file);
            if (loiFile != null) return BadRequest(new { message = loiFile });

            var (dv, nam, loi) = await DonViThaoTac(maDonVi);
            if (dv == null) return StatusCode(403, new { message = loi });

            try
            {
                var dsDv = await DsDonViDoiChieu();
                using var luong = file!.OpenReadStream();
                return Ok(await _nhap.NhapChamCong(
                    dv, nam, thang, luong, file.FileName, dsDv));
            }
            catch (SoChuaMoException ex) { return Conflict(new { message = ex.Message }); }
            catch (InvalidOperationException ex)
            {
                // Lỗi hình dạng file (thiếu cột, sai sheet) — câu chữ đã đủ để kế toán tự
                // sửa file, đưa thẳng ra màn.
                return BadRequest(new { message = ex.Message });
            }
            catch (Exception ex)
            {
                return BadRequest(new
                { message = $"Không đọc được file: {ex.Message}" });
            }
        }

        // ===================== BẢNG LƯƠNG =====================

        [HttpGet("/api/bang-luong")]
        public async Task<IActionResult> BangLuong(
            [FromQuery] int thang, [FromQuery] string? maDonVi)
        {
            if (!ThangHopLe(thang))
                return BadRequest(new { message = "Tháng phải từ 1 đến 12" });

            var (dv, nam, loi) = await DonViThaoTac(maDonVi);
            if (dv == null) return StatusCode(403, new { message = loi });

            try { return Ok(await _cc.DanhSachBangLuong(dv, nam, thang)); }
            catch (SoChuaMoException ex) { return Conflict(new { message = ex.Message }); }
        }

        /// <summary>
        /// Dựng bản NHÁP bảng lương từ chấm công + hợp đồng. KHÔNG ghi vào DB — kế toán
        /// soát rồi mới PUT. Tính xong ghi đè thẳng thì một lần bấm nhầm là mất số đã
        /// chỉnh tay của cả tháng.
        /// </summary>
        [HttpPost("/api/bang-luong/tinh")]
        public async Task<IActionResult> TinhLuong(
            [FromQuery] int thang, [FromQuery] decimal ngayCongChuan,
            [FromQuery] string? maDonVi)
        {
            if (!ThangHopLe(thang))
                return BadRequest(new { message = "Tháng phải từ 1 đến 12" });

            // BR-BL-01: ngày công chuẩn do doanh nghiệp tự chọn (Điều 54 NĐ 145/2020),
            // nhưng phải > 0 vì nó là mẫu số. Chặn cả số vô lý: hơn 31 thì chắc chắn gõ
            // nhầm, mà để lọt thì lương thực tế co lại vô cớ và không ai để ý.
            if (ngayCongChuan is <= 0 or > 31)
                return BadRequest(new { message = "Ngày công chuẩn phải từ 1 đến 31" });

            var (dv, nam, loi) = await DonViThaoTac(maDonVi);
            if (dv == null) return StatusCode(403, new { message = loi });

            try { return Ok(await _cc.TinhBangLuong(dv, nam, thang, ngayCongChuan)); }
            catch (SoChuaMoException ex) { return Conflict(new { message = ex.Message }); }
        }

        [HttpPut("/api/bang-luong")]
        public async Task<IActionResult> LuuBangLuong(
            [FromQuery] int thang, [FromQuery] string? maDonVi,
            [FromBody] List<Models.BangLuongDto>? ds)
        {
            if (!ThangHopLe(thang))
                return BadRequest(new { message = "Tháng phải từ 1 đến 12" });

            var (dv, nam, loi) = await DonViThaoTac(maDonVi);
            if (dv == null) return StatusCode(403, new { message = loi });

            var dong = ds ?? new List<Models.BangLuongDto>();
            if (dong.Count > 1000)
                return BadRequest(new { message = "Một tháng không thể có quá 1000 dòng lương" });

            // Ngày công chuẩn 0 làm CHECK constraint của DB từ chối cả transaction —
            // bắt ở đây để báo được dòng nào sai thay vì ném lỗi SQL thô.
            var xau = dong.FirstOrDefault(x => x.NgayCongChuan <= 0);
            if (xau != null)
                return BadRequest(new
                { message = $"Dòng {xau.HoTen ?? xau.NhanSuId.ToString()} thiếu ngày công chuẩn" });

            try
            {
                var n = await _cc.LuuBangLuong(dv, nam, thang, dong, CurrentUser());
                return Ok(new { message = $"Đã lưu bảng lương {n} người", soDong = n });
            }
            catch (SoChuaMoException ex) { return Conflict(new { message = ex.Message }); }
        }

        /// <summary>
        /// Đọc bảng thanh toán lương từ file Excel, trả bản NHÁP để soát. KHÔNG ghi DB.
        ///
        /// Khác hẳn POST /tinh: đường này lấy NGUYÊN SỐ TRONG FILE, không chạy công thức.
        /// Người dùng nhập file lên là để nhìn số của bản Excel đang dùng; tính lại thì
        /// màn hiện số của hệ thống chứ không phải số trong file.
        /// </summary>
        [HttpPost("/api/bang-luong/nhap-excel")]
        [RequestSizeLimit(30 * 1024 * 1024)]
        public async Task<IActionResult> NhapExcelBangLuong(
            IFormFile? file, [FromQuery] int thang, [FromQuery] decimal ngayCongChuan,
            [FromQuery] string? maDonVi)
        {
            if (!ThangHopLe(thang))
                return BadRequest(new { message = "Tháng phải từ 1 đến 12" });

            // BR-BL-01 — khuôn Excel không có ô ngày công chuẩn (nó là tham số), nên vẫn
            // phải nhận từ thanh công cụ và kiểm y như đường /tinh.
            if (ngayCongChuan is <= 0 or > 31)
                return BadRequest(new { message = "Ngày công chuẩn phải từ 1 đến 31" });

            var loiFile = KiemFile(file);
            if (loiFile != null) return BadRequest(new { message = loiFile });

            var (dv, nam, loi) = await DonViThaoTac(maDonVi);
            if (dv == null) return StatusCode(403, new { message = loi });

            try
            {
                var dsDv = await DsDonViDoiChieu();
                using var luong = file!.OpenReadStream();
                return Ok(await _nhap.NhapBangLuong(
                    dv, nam, thang, ngayCongChuan, luong, file.FileName, dsDv));
            }
            catch (SoChuaMoException ex) { return Conflict(new { message = ex.Message }); }
            catch (InvalidOperationException ex)
            {
                return BadRequest(new { message = ex.Message });
            }
            catch (Exception ex)
            {
                return BadRequest(new
                { message = $"Không đọc được file: {ex.Message}" });
            }
        }
    }
}
