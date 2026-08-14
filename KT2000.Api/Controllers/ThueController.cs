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
        private readonly IConfiguration _config;
        private readonly AppDbContext _db;
        public ThueController(ThueService thue, RaSoatService raSoat, ToKhaiService toKhai,
                              IConfiguration config, AppDbContext db)
        {
            _thue = thue;
            _raSoat = raSoat;
            _toKhai = toKhai;
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

        // ===================== TỜ KHAI 01/GTGT =====================
        // Spec: docs/NB/SPEC-TO-KHAI-01-GTGT.md

        // Thông tin đơn vị lấy từ Master để điền phần NNT của tờ khai.
        private async Task<(string Mst, string Ten, string? DiaChi)> HoSoDonVi()
        {
            var code = TenantCode();
            var t = await _db.Tenants
                .Where(x => x.Code == code)
                .Select(x => new { x.TaxCode, x.Name, x.Address })
                .FirstOrDefaultAsync();
            return (t?.TaxCode ?? "", t?.Name ?? code, t?.Address);
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
        [HttpPost("doc-bang-ke")]
        [RequestSizeLimit(30 * 1024 * 1024)]
        public async Task<IActionResult> DocBangKe(IFormFile? file)
        {
            var chan = ChanNeuLaNoiBo();
            if (chan != null) return chan;

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
                var mstDv = await MstDonVi();
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
                                                [FromBody] LapToKhaiRequest? req)
        {
            var chan = ChanNeuLaNoiBo();
            if (chan != null) return chan;

            if (thang is < 1 or > 12)
                return BadRequest(new { message = "Kỳ kê khai phải trong khoảng tháng 1..12" });

            var (mst, ten, diaChi) = await HoSoDonVi();
            if (string.IsNullOrWhiteSpace(mst))
                return BadRequest(new
                { message = "Đơn vị chưa khai mã số thuế — không lập được tờ khai" });

            var code = TenantCode();
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
                                                   [FromBody] LapToKhaiRequest? req)
        {
            var chan = ChanNeuLaNoiBo();
            if (chan != null) return chan;

            if (thang is < 1 or > 12)
                return BadRequest(new { message = "Kỳ kê khai phải trong khoảng tháng 1..12" });

            var (mst, ten, diaChi) = await HoSoDonVi();
            if (string.IsNullOrWhiteSpace(mst))
                return BadRequest(new
                { message = "Đơn vị chưa khai mã số thuế — không lập được tờ khai" });

            var code = TenantCode();
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
