using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using KT2000.Api.Data;
using KT2000.Api.Services;

namespace KT2000.Api.Controllers
{
    // Nhân sự + hợp đồng lao động. Hai bảng nằm trong database ĐƠN VỊ-NĂM
    // (database/025_tenant_nhansu_hopdong.sql), xem HopDongService.
    //
    // BR-HD-02 — AI DÙNG ĐƯỢC (luật #2 — gate bằng claim):
    //   • Đơn vị thường  → chỉ nhân sự CỦA CHÍNH MÌNH. Truyền maDonVi khác là 403.
    //   • MDN_NB ('internal') → chọn được đơn vị khách để làm hộ, vì đó là kế toán
    //     DỊCH VỤ lập hợp đồng cho khách.
    //   • Đơn vị nội bộ ('noibo') → không có, dùng màn Phiếu xuất/nhập.
    [Route("api/hop-dong")]
    [ApiController]
    [Authorize]
    public class HopDongController : ControllerBase
    {
        private readonly HopDongService _hd;
        private readonly ExcelLuongService _excel;
        // Nhập Excel ở màn này nhận cả file chấm công / bảng lương, nên phải ghi được
        // vào hai bảng đó — dùng lại đúng hai hàm lưu (một transaction) của ChamCongService.
        private readonly ChamCongService _cc;
        private readonly AppDbContext _db;

        public HopDongController(HopDongService hd, ExcelLuongService excel,
                                 ChamCongService cc, AppDbContext db)
        {
            _hd = hd;
            _excel = excel;
            _cc = cc;
            _db = db;
        }

        private string CurrentUser() => User.FindFirst("login_name")?.Value ?? "?";

        private string TenantCode() =>
            User.FindFirst("tenant_code")?.Value
            ?? throw new UnauthorizedAccessException("Token không có thông tin đơn vị");

        // Lùi về năm hiện tại khi thiếu claim là sai âm thầm: sẽ mở nhầm database của
        // một năm khác rồi báo "chưa mở năm". Ném lỗi rõ, cùng cách ThueController.
        private int FiscalYear() =>
            int.TryParse(User.FindFirst("fiscal_year")?.Value, out var y)
                ? y
                : throw new UnauthorizedAccessException("Token không có năm làm việc");

        /// <summary>
        /// Đơn vị + năm sẽ thao tác. Trả null kèm lý do nếu không được phép.
        ///
        /// Đơn vị thường KHÔNG được truyền mã khác mã của mình: bảng nằm trong database
        /// riêng từng đơn vị, nên một mã đoán được là mở thẳng sổ nhân sự của khách khác.
        /// Chỉ MDN_NB mới đi xuyên đơn vị, và mã vẫn phải có thật trong Master.
        /// </summary>
        private async Task<(string? Code, int Year, string? Loi)> DonViThaoTac(string? ma)
        {
            var cuaToi = TenantCode();
            var nam = FiscalYear();

            if (User.FindFirst("tenant_type")?.Value == "noibo")
                return (null, nam, "Đơn vị nội bộ không dùng màn Hợp đồng lao động");

            var xin = (ma ?? "").Trim().ToUpperInvariant();
            if (xin.Length == 0 || xin == cuaToi) return (cuaToi, nam, null);

            if (User.FindFirst("tenant_type")?.Value != "internal")
                return (null, nam, "Chỉ đơn vị quản trị nội bộ mới lập hợp đồng cho đơn vị khác");

            if (!TenantDbResolver.IsValidCode(xin))
                return (null, nam, "Mã đơn vị không hợp lệ");

            // Mã phải có thật trong Master. Không kiểm thì resolver vẫn dựng ra tên
            // database và SqlClient ném 4060 — người dùng chỉ thấy "chưa mở năm" thay vì
            // "gõ sai mã đơn vị".
            return await _db.Tenants.AnyAsync(t => t.Code == xin)
                ? (xin, nam, null)
                : (null, nam, $"Không có đơn vị {xin}");
        }

        // ===================== LƯỚI CHỌN ĐƠN VỊ =====================

        /// <summary>
        /// Danh sách đơn vị cho trang Hợp đồng. Trả NGAY, KHÔNG đếm gì cả — chỉ một câu
        /// SELECT trên Master.
        ///
        /// Số nhân sự / hợp đồng lấy riêng qua /don-vi/{ma}/dem, mỗi đơn vị một request:
        /// đếm gộp trong đây phải mở 17 database rồi mới trả, người dùng ngồi nhìn màn
        /// trắng cả chục giây (gặp thật 20/08). Tách ra thì lưới hiện ngay, con số nhỏ
        /// dần điền vào — đơn vị nào xong trước hiện trước.
        ///
        /// BR-HD-02: MDN_NB thấy MỌI đơn vị khách; đơn vị thường chỉ thấy CHÍNH MÌNH —
        /// một dòng, để màn vẫn cùng một nhịp thao tác thay vì phải dựng hai giao diện.
        /// </summary>
        [HttpGet("don-vi")]
        public async Task<IActionResult> LuoiDonVi()
        {
            var loaiDv = User.FindFirst("tenant_type")?.Value;
            if (loaiDv == "noibo")
                return StatusCode(403, new
                { message = "Đơn vị nội bộ không dùng màn Hợp đồng lao động" });

            var nam = FiscalYear();
            var cuaToi = TenantCode();

            var truyVan = _db.Tenants.AsNoTracking().Where(t => t.IsActive);

            // Đơn vị thường: CHỈ mình nó. Không lọc thì lưới bày ra mã của mọi khách
            // khác — bấm vào tuy bị 403 nhưng danh sách khách hàng đã lộ rồi.
            truyVan = loaiDv == "internal"
                ? truyVan.Where(t => t.TenantType != "internal" && t.TenantType != "noibo")
                : truyVan.Where(t => t.Code == cuaToi);

            var donVi = await truyVan
                .OrderBy(t => t.Code)
                .Select(t => new Models.DonViHopDongDto
                {
                    MaDonVi = t.Code,
                    TenDonVi = t.Name,
                    Mst = t.TaxCode,
                })
                .ToListAsync(HttpContext.RequestAborted);

            return Ok(new { nam, dong = donVi });
        }

        /// <summary>
        /// Đếm nhân sự + hợp đồng của MỘT đơn vị. Frontend gọi song song cho từng dòng
        /// trên lưới, dòng nào xong trước điền số trước.
        /// </summary>
        [HttpGet("don-vi/{ma}/dem")]
        public async Task<IActionResult> DemDonVi(string ma)
        {
            var (dv, nam, loi) = await DonViThaoTac(ma);
            if (dv == null) return StatusCode(403, new { message = loi });

            var kq = await _hd.DemMotDonVi(dv, nam);
            return Ok(kq);
        }

        /// <summary>
        /// Danh sách đơn vị dùng để đối chiếu tên đọc từ file. Đơn vị thường chỉ so với
        /// CHÍNH MÌNH — đưa cả danh sách khách hàng thì một file lạ cũng đủ để dò ra tên
        /// mọi đơn vị khác trong hệ thống.
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

        /// <summary>
        /// NHẬP EXCEL cho đơn vị đang chọn — cửa vào duy nhất của cả module.
        ///
        /// Nhận BỐN loại file, tự đoán loại rồi đưa đúng bộ đọc:
        ///   1. HĐLĐ (mỗi nhân sự một sheet)  -> NHAN_SU + HOP_DONG
        ///   2. DS_NV (danh sách nhân sự)     -> NHAN_SU + HOP_DONG dựng từ mức lương
        ///   3. Chấm công (ccNN)              -> CHAM_CONG
        ///   4. Bảng lương (THANG n)          -> BANG_LUONG
        ///
        /// Tự đoán chứ không bắt người dùng chọn loại: kế toán thả cả nắm file vào một
        /// ô, bắt phân loại trước từng file là đẩy việc của máy sang cho người. Đoán
        /// không ra thì báo rõ, không ghi bậy.
        ///
        /// GHI THẲNG vào sổ, khác nút "Nhập Excel" trong hai màn Chấm công / Bảng lương
        /// (trả nháp để soát): ở đây người dùng đang nạp DỮ LIỆU GỐC cho một đơn vị vừa
        /// mở, chưa có gì để đối chiếu.
        ///
        /// File cả năm (26 sheet) nhập TRỌN mọi tháng có trong file — thả một lần thay
        /// vì mười hai lần cùng một file.
        /// </summary>
        [HttpPost("nhap-excel")]
        [RequestSizeLimit(30 * 1024 * 1024)]
        public async Task<IActionResult> NhapExcel(
            IFormFile? file, [FromQuery] string? maDonVi,
            [FromQuery] decimal ngayCongChuan = 26)
        {
            if (file == null || file.Length == 0)
                return BadRequest(new { message = "Chưa chọn file Excel" });
            if (!DocFileExcel.DuoiHopLe(file.FileName))
                return BadRequest(new { message = "Chỉ nhận file Excel (.xls hoặc .xlsx)" });

            var (dv, nam, loi) = await DonViThaoTac(maDonVi);
            if (dv == null) return StatusCode(403, new { message = loi });

            try
            {
                var dsDv = await DsDonViDoiChieu();

                using var luong = file.OpenReadStream();
                using var wb = DocFileExcel.Mo(luong, file.FileName);

                var loai = ExcelLuongService.DoanLoaiFile(wb);
                if (loai == ExcelLuongService.LoaiFile.KhongRo)
                    return BadRequest(new
                    {
                        message = $"Không nhận ra \"{file.FileName}\" là loại gì. Nhận: "
                                + "hợp đồng lao động (mỗi nhân sự một sheet), danh sách "
                                + "nhân sự (sheet DS_NV), bảng chấm công (sheet ccNN), "
                                + "bảng lương (sheet THANG n).",
                    });

                // Tên đơn vị ở đầu sheet phải khớp đơn vị đang chọn — kiểm TRƯỚC khi ghi
                // dòng nào. Đường HopDong đã tự kiểm bên trong, ba đường kia kiểm ở đây.
                if (loai != ExcelLuongService.LoaiFile.HopDong)
                {
                    var ws0 = wb.Worksheets.First();
                    var tenDv = SuyDonViTuFile.TimTenDonVi(ws0);
                    var kqDv = SuyDonViTuFile.DoiChieu(
                        tenDv, dv, dsDv, out var maSuy, out var loiDv);
                    bool dung = kqDv is SuyDonViTuFile.KetQua.Khop
                                     or SuyDonViTuFile.KetQua.KhongThayTen;
                    if (!dung)
                        return Ok(new Models.KetQuaNhapDto<object>
                        {
                            TenDonViFile = tenDv,
                            MaDonViFile = maSuy,
                            CanhBaoDonVi = loiDv,
                            DungDonVi = false,
                            Sheet = ws0.Name,
                        });
                }

                return loai switch
                {
                    ExcelLuongService.LoaiFile.HopDong =>
                        Ok(await NhapHopDong(wb, dv, nam, dsDv)),
                    ExcelLuongService.LoaiFile.DanhSachNhanSu =>
                        Ok(await NhapDsNhanSu(wb, dv, nam)),
                    ExcelLuongService.LoaiFile.ChamCong =>
                        Ok(await NhapChamCongFile(wb, dv, nam)),
                    ExcelLuongService.LoaiFile.LuongCaNam =>
                        Ok(await NhapLuongCaNam(wb, dv, nam, ngayCongChuan)),
                    _ => Ok(await NhapBangLuongFile(wb, dv, nam, ngayCongChuan)),
                };
            }
            catch (SoChuaMoException ex) { return Conflict(new { message = ex.Message }); }
            catch (InvalidOperationException ex)
            {
                return BadRequest(new { message = ex.Message });
            }
            catch (Exception ex)
            {
                return BadRequest(new { message = $"Không đọc được file: {ex.Message}" });
            }
        }


        [HttpPost("nhap-excel/doc")]
        [RequestSizeLimit(30 * 1024 * 1024)]
        public async Task<IActionResult> DocNhapExcel(
            IFormFile? file, [FromQuery] string? maDonVi,
            [FromQuery] decimal ngayCongChuan = 26)
        {
            if (file == null || file.Length == 0)
                return BadRequest(new { message = "Chưa chọn file Excel" });
            if (!DocFileExcel.DuoiHopLe(file.FileName))
                return BadRequest(new { message = "Chỉ nhận file Excel (.xls hoặc .xlsx)" });

            var (dv, nam, loi) = await DonViThaoTac(maDonVi);
            if (dv == null) return StatusCode(403, new { message = loi });

            try
            {
                var dsDv = await DsDonViDoiChieu();
                using var luong = file.OpenReadStream();
                using var wb = DocFileExcel.Mo(luong, file.FileName);

                var loai = ExcelLuongService.DoanLoaiFile(wb);
                if (loai == ExcelLuongService.LoaiFile.KhongRo)
                    return BadRequest(new
                    {
                        message = $"Không nhận ra \"{file.FileName}\" là loại gì. Nhận: "
                                + "hợp đồng lao động (mỗi nhân sự một sheet), danh sách "
                                + "nhân sự (sheet DS_NV), bảng chấm công (sheet ccNN), "
                                + "bảng lương (sheet THANG n).",
                    });

                var nh = new Models.NhapNhapDto
                {
                    TenFile = file.FileName,
                    Loai = loai.ToString(),
                    NgayCongChuan = ngayCongChuan,
                };

                // Kiểm đơn vị TRƯỚC khi đọc dòng nào — đường HopDong tự kiểm bên trong.
                if (loai != ExcelLuongService.LoaiFile.HopDong)
                {
                    var ws0 = wb.Worksheets.First();
                    var tenDv = SuyDonViTuFile.TimTenDonVi(ws0);
                    var kqDv = SuyDonViTuFile.DoiChieu(
                        tenDv, dv, dsDv, out var maSuy, out var loiDv);
                    nh.TenDonViFile = tenDv;
                    nh.MaDonViFile = maSuy;
                    nh.CanhBaoDonVi = loiDv;
                    nh.DungDonVi = kqDv is SuyDonViTuFile.KetQua.Khop
                                        or SuyDonViTuFile.KetQua.KhongThayTen;
                    if (!nh.DungDonVi) return Ok(nh);
                }

                switch (loai)
                {
                    case ExcelLuongService.LoaiFile.HopDong:
                        DocNhapHopDong(wb, dv, dsDv, nh);
                        break;
                    case ExcelLuongService.LoaiFile.DanhSachNhanSu:
                        DocNhapDsNhanSu(wb, nh);
                        break;
                    case ExcelLuongService.LoaiFile.LuongCaNam:
                        DocNhapDsNhanSu(wb, nh);
                        await DocNhapChamCong(wb, dv, nam, nh);
                        await DocNhapBangLuong(wb, dv, nam, ngayCongChuan, nh);
                        break;
                    case ExcelLuongService.LoaiFile.ChamCong:
                        await DocNhapChamCong(wb, dv, nam, nh);
                        break;
                    default:
                        await DocNhapBangLuong(wb, dv, nam, ngayCongChuan, nh);
                        break;
                }

                return Ok(nh);
            }
            catch (SoChuaMoException ex) { return Conflict(new { message = ex.Message }); }
            catch (InvalidOperationException ex)
            {
                return BadRequest(new { message = ex.Message });
            }
            catch (Exception ex)
            {
                return BadRequest(new { message = $"Không đọc được file: {ex.Message}" });
            }
        }

        /// <summary>
        /// Ghi nháp vào sổ. Nhận nguyên vật frontend giữ, không đọc lại file.
        /// </summary>
        [HttpPost("nhap-excel/luu")]
        [RequestSizeLimit(30 * 1024 * 1024)]
        public async Task<IActionResult> LuuNhapExcel(
            [FromBody] List<Models.NhapNhapDto> ds, [FromQuery] string? maDonVi)
        {
            if (ds == null || ds.Count == 0)
                return BadRequest(new { message = "Không có gì để lưu" });

            var (dv, nam, loi) = await DonViThaoTac(maDonVi);
            if (dv == null) return StatusCode(403, new { message = loi });

            try
            {

                var xau = ds.FirstOrDefault(x => !x.DungDonVi);
                if (xau != null)
                    return BadRequest(new
                    {
                        message = $"\"{xau.TenFile}\" không phải của đơn vị đang mở"
                                + (xau.CanhBaoDonVi is { Length: > 0 } c ? $" — {c}" : ""),
                    });

                var xep = ds.OrderBy(x => x.Nguoi.Count > 0 ? 0 : 1).ToList();

                int soNs = 0, soHd = 0, soCc = 0, soBl = 0;
                var bo = new List<Models.DongBoDto>();

                foreach (var nh in xep)
                {
                    // Đọc lại bảng tra SAU mỗi file: file trước vừa thêm người thì file
                    // sau phải nhìn thấy, nếu không lại bỏ dòng "không có ai tên đó".
                    var daCo = await NhanSuTheoTen(dv, nam);

                    foreach (var ng in nh.Nguoi)
                    {
                        var khoa = ExcelLuongService.ChuanTen(ng.NhanSu.HoTen);
                        if (khoa.Length == 0) continue;

                        if (!daCo.TryGetValue(khoa, out var nsId))
                        {
                            nsId = await _hd.ThemNhanSu(dv, nam, ng.NhanSu, CurrentUser());
                            daCo[khoa] = nsId;
                            soNs++;
                        }

                        foreach (var hd in ng.HopDong)
                        {
                            hd.NhanSuId = nsId;
                            await _hd.ThemHopDong(dv, nam, hd, CurrentUser());
                            soHd++;
                        }
                    }

                    // Chấm công / bảng lương: nháp giữ TÊN, id khớp lại lúc này vì người
                    // có thể vừa được tạo ở ngay vòng trên.
                    if (nh.ChamCong.Count > 0 || nh.BangLuong.Count > 0)
                        daCo = await NhanSuTheoTen(dv, nam);

                    foreach (var t in nh.ChamCong)
                    {
                        var dong = GanNhanSuId(t.Dong, x => x.HoTen, (x, id) => x.NhanSuId = id,
                                               daCo, bo, $"chấm công tháng {t.Thang}");
                        if (dong.Count > 0)
                            soCc += await _cc.LuuChamCong(dv, nam, t.Thang, dong, CurrentUser());
                    }

                    foreach (var t in nh.BangLuong)
                    {
                        var dong = GanNhanSuId(t.Dong, x => x.HoTen, (x, id) => x.NhanSuId = id,
                                               daCo, bo, $"bảng lương tháng {t.Thang}");
                        if (dong.Count > 0)
                            soBl += await _cc.LuuBangLuong(dv, nam, t.Thang, dong, CurrentUser());
                    }
                }

                return Ok(new
                {
                    soNhanSu = soNs,
                    soHopDong = soHd,
                    soChamCong = soCc,
                    soBangLuong = soBl,
                    bo,
                });
            }
            catch (SoChuaMoException ex) { return Conflict(new { message = ex.Message }); }
            catch (InvalidOperationException ex)
            {
                return BadRequest(new { message = ex.Message });
            }
        }

        /// <summary>
        /// Khớp tên trong nháp về nhan_su_id thật. Dòng không khớp được thì BỎ kèm lý do
        /// chứ không ghi với id 0 — ghi bừa là dòng lương treo vào người không tồn tại.
        /// </summary>
        private static List<T> GanNhanSuId<T>(
            List<T> dong, Func<T, string?> layTen, Action<T, int> ganId,
            IReadOnlyDictionary<string, int> daCo, List<Models.DongBoDto> bo, string nhan)
        {
            var ra = new List<T>();
            foreach (var x in dong)
            {
                var ten = layTen(x) ?? "";
                var khoa = ExcelLuongService.ChuanTen(ten);
                if (khoa.Length > 0 && daCo.TryGetValue(khoa, out var id))
                {
                    ganId(x, id);
                    ra.Add(x);
                }
                else
                {
                    bo.Add(new Models.DongBoDto
                    {
                        HoTen = ten,
                        LyDo = $"{nhan}: không có nhân sự nào tên \"{ten}\" trong sổ",
                    });
                }
            }
            return ra;
        }

        // ---- Đọc nháp: HĐLĐ (mỗi sheet một hợp đồng của một người) ----
        private void DocNhapHopDong(
            ClosedXML.Excel.XLWorkbook wb, string dv,
            IReadOnlyList<SuyDonViTuFile.DonVi> dsDv, Models.NhapNhapDto nh)
        {
            var doc = _excel.DocFileHopDong(wb, 0, dv, dsDv);
            nh.TenDonViFile = doc.TenDonViFile;
            nh.MaDonViFile = doc.MaDonViFile;
            nh.CanhBaoDonVi = doc.CanhBaoDonVi;
            nh.DungDonVi = doc.DungDonVi;
            nh.Sheet = doc.Sheet;
            nh.Bo.AddRange(doc.Bo);
            if (!doc.DungDonVi) return;
            foreach (var d in doc.Dong)
            {
                var khoa = ExcelLuongService.ChuanTen(d.NhanSu.HoTen);
                var ng = nh.Nguoi.FirstOrDefault(
                    x => ExcelLuongService.ChuanTen(x.NhanSu.HoTen) == khoa);
                if (ng == null)
                {
                    ng = new Models.NhapNguoiDto { NhanSu = d.NhanSu };
                    nh.Nguoi.Add(ng);
                }
                ng.HopDong.Add(d.HopDong);
            }
        }

        // ---- Đọc nháp: DS_NV (danh sách nhân sự + mức lương chuẩn) ----
        private void DocNhapDsNhanSu(
            ClosedXML.Excel.XLWorkbook wb, Models.NhapNhapDto nh)
        {
            var doc = _excel.DocDanhSachNhanSu(wb);
            nh.Sheet ??= doc.Sheet;
            nh.Bo.AddRange(doc.Bo);

            foreach (var d in doc.Dong)
            {
                var khoa = ExcelLuongService.ChuanTen(d.NhanSu.HoTen);
                if (nh.Nguoi.Any(x => ExcelLuongService.ChuanTen(x.NhanSu.HoTen) == khoa))
                    continue;

                var ng = new Models.NhapNguoiDto { NhanSu = d.NhanSu };

                if (d.LuongChinh is > 0)
                    ng.HopDong.Add(new Models.HopDongDto
                    {
                        CongViec = d.NhanSu.ChucDanh,
                        LuongChinh = d.LuongChinh,
                        PcAnCa = d.PcAnCa,
                        PcDienThoai = d.PcDienThoai,
                        PcXangXe = d.PcXangXe,
                        PcKhac = d.PcHieuQua,
                        GhiChu = "Dựng tự động khi nhập DS_NV từ Excel",
                    });

                nh.Nguoi.Add(ng);
            }
        }

        private async Task DocNhapChamCong(
            ClosedXML.Excel.XLWorkbook wb, string dv, int nam, Models.NhapNhapDto nh)
        {
            var tra = await BangTraKemNhap(dv, nam, nh);

            foreach (var t in ExcelLuongService.CacThangTrongFile(wb, "cc"))
            {
                var kq = _excel.DocChamCongTuWorkbook(wb, nam, t, tra);
                if (kq.Dong.Count > 0)
                    nh.ChamCong.Add(new Models.NhapChamCongThangDto
                    { Thang = t, Dong = kq.Dong });
                foreach (var b in kq.Bo)
                    nh.Bo.Add(new Models.DongBoDto
                    { Dong = b.Dong, HoTen = b.HoTen, LyDo = $"chấm công tháng {t}: {b.LyDo}" });
            }
            nh.Sheet ??= string.Join(", ", nh.ChamCong.Select(x => $"cc{x.Thang:00}"));
        }

        // ---- Đọc nháp: bảng lương ----
        private async Task DocNhapBangLuong(
            ClosedXML.Excel.XLWorkbook wb, string dv, int nam,
            decimal ngayCongChuan, Models.NhapNhapDto nh)
        {
            var tra = await BangTraKemNhap(dv, nam, nh);

            var thang = ExcelLuongService.CacThangTrongFile(wb, "thang");
            if (thang.Count == 0) thang = ExcelLuongService.CacThangTrongFile(wb, "t");

            foreach (var t in thang)
            {
                var kq = _excel.DocBangLuongTuWorkbook(wb, t, ngayCongChuan, tra);
                if (kq.Dong.Count > 0)
                    nh.BangLuong.Add(new Models.NhapBangLuongThangDto
                    { Thang = t, Dong = kq.Dong });
                foreach (var b in kq.Bo)
                    nh.Bo.Add(new Models.DongBoDto
                    { Dong = b.Dong, HoTen = b.HoTen, LyDo = $"bảng lương tháng {t}: {b.LyDo}" });
            }
            nh.Sheet ??= string.Join(", ", nh.BangLuong.Select(x => $"THANG {x.Thang}"));
        }

        /// <summary>
        /// Người trong sổ + người vừa đọc ở nháp này. Người mới nhận id ÂM làm chỗ giữ.
        /// </summary>
        private async Task<Dictionary<string, int>> BangTraKemNhap(
            string dv, int nam, Models.NhapNhapDto nh)
        {
            var tra = await NhanSuTheoTen(dv, nam);
            int gia = -1;
            foreach (var ng in nh.Nguoi)
            {
                var khoa = ExcelLuongService.ChuanTen(ng.NhanSu.HoTen);
                if (khoa.Length > 0 && !tra.ContainsKey(khoa)) tra[khoa] = gia--;
            }
            return tra;
        }

        /// <summary>
        /// Tra nhân sự đang có trong sổ, khóa theo tên đã chuẩn hóa (bỏ dấu, gộp khoảng
        /// trắng) — cùng luật với mọi đường nhập khác.
        /// </summary>
        private async Task<Dictionary<string, int>> NhanSuTheoTen(string dv, int nam)
            => (await _hd.DanhSachNhanSu(dv, nam, caNguoiDaNghi: true))
                .GroupBy(x => ExcelLuongService.ChuanTen(x.HoTen))
                .ToDictionary(g => g.Key, g => g.First().Id);

        // ---- 1. File HĐLĐ: mỗi nhân sự một sheet ----
        private async Task<object> NhapHopDong(
            ClosedXML.Excel.XLWorkbook wb, string dv, int nam,
            IReadOnlyList<SuyDonViTuFile.DonVi> dsDv)
        {
            var doc = _excel.DocFileHopDong(wb, nam, dv, dsDv);
            if (!doc.DungDonVi || doc.Dong.Count == 0) return doc.KemSo(0, 0);

            var daCo = await NhanSuTheoTen(dv, nam);

            int soNs = 0, soHd = 0;
            foreach (var x in doc.Dong)
            {
                var khoa = ExcelLuongService.ChuanTen(x.NhanSu.HoTen);
                if (!daCo.TryGetValue(khoa, out var nsId))
                {
                    nsId = await _hd.ThemNhanSu(dv, nam, x.NhanSu, CurrentUser());
                    daCo[khoa] = nsId;
                    soNs++;
                }
                x.HopDong.NhanSuId = nsId;
                await _hd.ThemHopDong(dv, nam, x.HopDong, CurrentUser());
                soHd++;
            }
            return doc.KemSo(soNs, soHd);
        }

        // ---- 2. File DS_NV: danh sách nhân sự + mức lương chuẩn ----
        private async Task<object> NhapDsNhanSu(
            ClosedXML.Excel.XLWorkbook wb, string dv, int nam)
        {
            var doc = _excel.DocDanhSachNhanSu(wb);
            if (doc.Dong.Count == 0) return doc.KemSo(0, 0);

            var daCo = await NhanSuTheoTen(dv, nam);

            int soNs = 0, soHd = 0;
            foreach (var x in doc.Dong)
            {
                var khoa = ExcelLuongService.ChuanTen(x.NhanSu.HoTen);
                if (daCo.ContainsKey(khoa)) continue;   // đã có người này, không tạo trùng

                var nsId = await _hd.ThemNhanSu(dv, nam, x.NhanSu, CurrentUser());
                daCo[khoa] = nsId;
                soNs++;

                // DS_NV mang MỨC LƯƠNG chuẩn của từng người (spec 4.2) mà bảng lương lại
                // lấy mức từ HOP_DONG — nên dựng luôn một hợp đồng cho khỏi đứt mạch:
                // nhập DS_NV xong bấm Tính lương là ra số, không phải gõ tay 12 hợp đồng.
                if (x.LuongChinh is > 0)
                {
                    await _hd.ThemHopDong(dv, nam, new Models.HopDongDto
                    {
                        NhanSuId = nsId,
                        CongViec = x.NhanSu.ChucDanh,
                        LuongChinh = x.LuongChinh,
                        PcAnCa = x.PcAnCa,
                        PcDienThoai = x.PcDienThoai,
                        PcXangXe = x.PcXangXe,
                        // pc_khac của hợp đồng rót vào "hiệu quả công việc" của bảng
                        // lương — cùng đường ánh xạ với ChamCongService.TinhBangLuong.
                        PcKhac = x.PcHieuQua,
                        GhiChu = "Dựng tự động khi nhập DS_NV từ Excel",
                    }, CurrentUser());
                    soHd++;
                }
            }
            return doc.KemSo(soNs, soHd);
        }

        /// <summary>
        /// File LƯƠNG CẢ NĂM: một file mang cả DS_NV + ccNN + THANG n.
        ///
        /// Chạy BA BƯỚC THEO ĐÚNG THỨ TỰ PHỤ THUỘC — đây là toàn bộ lý do loại file này
        /// tồn tại riêng:
        ///   1. DS_NV     -> tạo NHAN_SU (+ HOP_DONG từ mức lương)
        ///   2. ccNN      -> CHAM_CONG, khớp người theo tên
        ///   3. THANG n   -> BANG_LUONG, khớp người theo tên
        ///
        /// Bước 2 và 3 tra nhân sự THEO TÊN trong sổ, nên nếu chạy trước bước 1 thì sổ
        /// còn rỗng và MỌI dòng bị bỏ với lý do "không có nhân sự tên đó" — đúng lỗi gặp
        /// 21/08: nhập file lương báo "144 sheet không nhập được".
        ///
        /// Bảng tra nhân sự phải ĐỌC LẠI sau bước 1, không dùng bản chụp lúc đầu.
        /// </summary>
        private async Task<object> NhapLuongCaNam(
            ClosedXML.Excel.XLWorkbook wb, string dv, int nam, decimal ngayCongChuan)
        {
            var gop = new Models.KetQuaNhapDto<object> { DungDonVi = true };
            var phan = new List<string>();

            // ---- Bước 1: DS_NV -> nhân sự + hợp đồng ----
            int soNs = 0, soHd = 0;
            if (wb.Worksheets.Any(w => ExcelLuongService.ChuanTen(w.Name).Replace(" ", "")
                    is "dsnv" or "danhsachnv" or "danhsachnhansu" or "nhansu"))
            {
                var ds = _excel.DocDanhSachNhanSu(wb);
                var daCo = await NhanSuTheoTen(dv, nam);

                foreach (var x in ds.Dong)
                {
                    var khoa = ExcelLuongService.ChuanTen(x.NhanSu.HoTen);
                    if (daCo.ContainsKey(khoa)) continue;

                    var nsId = await _hd.ThemNhanSu(dv, nam, x.NhanSu, CurrentUser());
                    daCo[khoa] = nsId;
                    soNs++;

                    if (x.LuongChinh is > 0)
                    {
                        await _hd.ThemHopDong(dv, nam, new Models.HopDongDto
                        {
                            NhanSuId = nsId,
                            CongViec = x.NhanSu.ChucDanh,
                            LuongChinh = x.LuongChinh,
                            PcAnCa = x.PcAnCa,
                            PcDienThoai = x.PcDienThoai,
                            PcXangXe = x.PcXangXe,
                            PcKhac = x.PcHieuQua,
                            GhiChu = "Dựng tự động khi nhập DS_NV từ Excel",
                        }, CurrentUser());
                        soHd++;
                    }
                }
                foreach (var b in ds.Bo)
                    gop.Bo.Add(new Models.DongBoDto
                    { Dong = b.Dong, HoTen = b.HoTen, LyDo = $"DS_NV: {b.LyDo}" });

                if (soNs > 0) phan.Add($"{soNs} nhân sự");
            }

            // ĐỌC LẠI sau bước 1 — bước 2 và 3 phải thấy người vừa tạo.
            var nsTheoTen = await NhanSuTheoTen(dv, nam);

            if (nsTheoTen.Count == 0)
            {
                gop.CanhBaoDonVi =
                    "File không có sheet DS_NV và sổ chưa có nhân sự nào — nhập file hợp "
                  + "đồng lao động (HDLD_....xlsx) trước, rồi nhập lại file này.";
                return gop.KemSo(0, 0);
            }

            // ---- Bước 2: chấm công ----
            int soCc = 0;
            foreach (var t in ExcelLuongService.CacThangTrongFile(wb, "cc"))
            {
                var kq = _excel.DocChamCongTuWorkbook(wb, nam, t, nsTheoTen);
                if (kq.Dong.Count > 0)
                    soCc += await _cc.LuuChamCong(dv, nam, t, kq.Dong, CurrentUser());
                foreach (var b in kq.Bo)
                    gop.Bo.Add(new Models.DongBoDto
                    { Dong = b.Dong, HoTen = b.HoTen, LyDo = $"chấm công tháng {t}: {b.LyDo}" });
            }
            if (soCc > 0) phan.Add($"{soCc} dòng chấm công");

            // ---- Bước 3: bảng lương ----
            var thangL = ExcelLuongService.CacThangTrongFile(wb, "thang");
            if (thangL.Count == 0) thangL = ExcelLuongService.CacThangTrongFile(wb, "t");

            int soBl = 0;
            foreach (var t in thangL)
            {
                var kq = _excel.DocBangLuongTuWorkbook(wb, t, ngayCongChuan, nsTheoTen);
                if (kq.Dong.Count > 0)
                    soBl += await _cc.LuuBangLuong(dv, nam, t, kq.Dong, CurrentUser());
                foreach (var b in kq.Bo)
                    gop.Bo.Add(new Models.DongBoDto
                    { Dong = b.Dong, HoTen = b.HoTen, LyDo = $"bảng lương tháng {t}: {b.LyDo}" });
            }
            if (soBl > 0) phan.Add($"{soBl} dòng bảng lương");

            gop.Sheet = phan.Count > 0 ? string.Join(" · ", phan) : null;
            return gop.KemSo(soNs, soHd + soCc + soBl);
        }

        // ---- 3. File chấm công: sheet ccNN, nhập TRỌN các tháng có trong file ----
        private async Task<object> NhapChamCongFile(
            ClosedXML.Excel.XLWorkbook wb, string dv, int nam)
        {
            var thang = ExcelLuongService.CacThangTrongFile(wb, "cc");
            if (thang.Count == 0) thang.Add(1);

            var gop = new Models.KetQuaNhapDto<object>
            {
                DungDonVi = true,
                Sheet = string.Join(", ", thang.Select(t => $"cc{t:00}")),
            };

            int soDong = 0;
            foreach (var t in thang)
            {
                var kq = _excel.DocChamCongTuWorkbook(wb, nam, t,
                                                      await NhanSuTheoTen(dv, nam));
                if (kq.Dong.Count > 0)
                    soDong += await _cc.LuuChamCong(dv, nam, t, kq.Dong, CurrentUser());
                foreach (var b in kq.Bo)
                    gop.Bo.Add(new Models.DongBoDto
                    { Dong = b.Dong, HoTen = b.HoTen, LyDo = $"tháng {t}: {b.LyDo}" });
            }

            // Chấm công không sinh nhân sự/hợp đồng — mượn SoHopDong làm "số dòng đã
            // ghi" để frontend có con số mà hiện; nhãn trên màn nói rõ nghĩa.
            return gop.KemSo(0, soDong);
        }

        // ---- 4. File bảng lương: sheet THANG n, nhập TRỌN các tháng có trong file ----
        private async Task<object> NhapBangLuongFile(
            ClosedXML.Excel.XLWorkbook wb, string dv, int nam, decimal ngayCongChuan)
        {
            var thang = ExcelLuongService.CacThangTrongFile(wb, "thang");
            if (thang.Count == 0) thang = ExcelLuongService.CacThangTrongFile(wb, "t");
            if (thang.Count == 0) thang.Add(1);

            var gop = new Models.KetQuaNhapDto<object>
            {
                DungDonVi = true,
                Sheet = string.Join(", ", thang.Select(t => $"THANG {t}")),
            };

            var nsTheoTen = await NhanSuTheoTen(dv, nam);

            int soDong = 0;
            foreach (var t in thang)
            {
                var kq = _excel.DocBangLuongTuWorkbook(wb, t, ngayCongChuan, nsTheoTen);
                if (kq.Dong.Count > 0)
                    soDong += await _cc.LuuBangLuong(dv, nam, t, kq.Dong, CurrentUser());
                foreach (var b in kq.Bo)
                    gop.Bo.Add(new Models.DongBoDto
                    { Dong = b.Dong, HoTen = b.HoTen, LyDo = $"tháng {t}: {b.LyDo}" });
            }
            return gop.KemSo(0, soDong);
        }

        // ===================== NHÂN SỰ =====================

        [HttpGet("nhan-su")]
        public async Task<IActionResult> DanhSachNhanSu(
            [FromQuery] string? maDonVi, [FromQuery] bool caNguoiDaNghi = false)
        {
            var (dv, nam, loi) = await DonViThaoTac(maDonVi);
            if (dv == null) return StatusCode(403, new { message = loi });

            try { return Ok(await _hd.DanhSachNhanSu(dv, nam, caNguoiDaNghi)); }
            catch (SoChuaMoException ex) { return Conflict(new { message = ex.Message }); }
        }

        [HttpPost("nhan-su")]
        public async Task<IActionResult> ThemNhanSu(
            [FromQuery] string? maDonVi, [FromBody] Models.NhanSuDto? x)
        {
            var (dv, nam, loi) = await DonViThaoTac(maDonVi);
            if (dv == null) return StatusCode(403, new { message = loi });
            if (x == null || string.IsNullOrWhiteSpace(x.HoTen))
                return BadRequest(new { message = "Phải có họ tên nhân sự" });

            try
            {
                var id = await _hd.ThemNhanSu(dv, nam, x, CurrentUser());
                return Ok(new { message = $"Đã thêm {x.HoTen}", id });
            }
            catch (SoChuaMoException ex) { return Conflict(new { message = ex.Message }); }
        }

        [HttpPut("nhan-su/{id:int}")]
        public async Task<IActionResult> SuaNhanSu(
            int id, [FromQuery] string? maDonVi, [FromBody] Models.NhanSuDto? x)
        {
            var (dv, nam, loi) = await DonViThaoTac(maDonVi);
            if (dv == null) return StatusCode(403, new { message = loi });
            if (x == null || string.IsNullOrWhiteSpace(x.HoTen))
                return BadRequest(new { message = "Phải có họ tên nhân sự" });

            try
            {
                return await _hd.SuaNhanSu(dv, nam, id, x, CurrentUser())
                    ? Ok(new { message = $"Đã lưu {x.HoTen}" })
                    : NotFound(new { message = "Không tìm thấy nhân sự này" });
            }
            catch (SoChuaMoException ex) { return Conflict(new { message = ex.Message }); }
        }

        [HttpDelete("nhan-su/{id:int}")]
        public async Task<IActionResult> XoaNhanSu(int id, [FromQuery] string? maDonVi)
        {
            var (dv, nam, loi) = await DonViThaoTac(maDonVi);
            if (dv == null) return StatusCode(403, new { message = loi });

            try
            {
                if (await _hd.XoaNhanSu(dv, nam, id))
                    return Ok(new { message = "Đã xóa nhân sự" });

                // BR-HD-04: false = còn hợp đồng nên không xóa. Phân biệt với "không tìm thấy":
                // hai tình huống này người dùng phải xử lý khác nhau.
                return await _hd.MotNhanSu(dv, nam, id) != null
                    ? Conflict(new { message =
                        "Nhân sự này đã có hợp đồng — xóa hợp đồng trước, hoặc đánh dấu đã nghỉ" })
                    : NotFound(new { message = "Không tìm thấy nhân sự này" });
            }
            catch (SoChuaMoException ex) { return Conflict(new { message = ex.Message }); }
        }

        // ===================== HỢP ĐỒNG =====================

        [HttpGet]
        public async Task<IActionResult> DanhSachHopDong(
            [FromQuery] string? maDonVi, [FromQuery] int? nhanSuId)
        {
            var (dv, nam, loi) = await DonViThaoTac(maDonVi);
            if (dv == null) return StatusCode(403, new { message = loi });

            try { return Ok(await _hd.DanhSachHopDong(dv, nam, nhanSuId)); }
            catch (SoChuaMoException ex) { return Conflict(new { message = ex.Message }); }
        }

        [HttpGet("{id:int}")]
        public async Task<IActionResult> MotHopDong(int id, [FromQuery] string? maDonVi)
        {
            var (dv, nam, loi) = await DonViThaoTac(maDonVi);
            if (dv == null) return StatusCode(403, new { message = loi });

            try
            {
                var x = await _hd.MotHopDong(dv, nam, id);
                return x == null
                    ? NotFound(new { message = "Không tìm thấy hợp đồng này" })
                    : Ok(x);
            }
            catch (SoChuaMoException ex) { return Conflict(new { message = ex.Message }); }
        }

        [HttpPost]
        public async Task<IActionResult> ThemHopDong(
            [FromQuery] string? maDonVi, [FromBody] Models.HopDongDto? x)
        {
            var (dv, nam, loi) = await DonViThaoTac(maDonVi);
            if (dv == null) return StatusCode(403, new { message = loi });
            if (x == null || x.NhanSuId <= 0)
                return BadRequest(new { message = "Phải chọn nhân sự cho hợp đồng" });

            try
            {
                if (await _hd.MotNhanSu(dv, nam, x.NhanSuId) == null)
                    return BadRequest(new { message = "Nhân sự không thuộc đơn vị này" });

                var id = await _hd.ThemHopDong(dv, nam, x, CurrentUser());
                return Ok(new { message = "Đã tạo hợp đồng", id });
            }
            catch (SoChuaMoException ex) { return Conflict(new { message = ex.Message }); }
        }

        [HttpPut("{id:int}")]
        public async Task<IActionResult> SuaHopDong(
            int id, [FromQuery] string? maDonVi, [FromBody] Models.HopDongDto? x)
        {
            var (dv, nam, loi) = await DonViThaoTac(maDonVi);
            if (dv == null) return StatusCode(403, new { message = loi });
            if (x == null || x.NhanSuId <= 0)
                return BadRequest(new { message = "Phải chọn nhân sự cho hợp đồng" });

            try
            {
                if (await _hd.MotNhanSu(dv, nam, x.NhanSuId) == null)
                    return BadRequest(new { message = "Nhân sự không thuộc đơn vị này" });

                return await _hd.SuaHopDong(dv, nam, id, x, CurrentUser())
                    ? Ok(new { message = "Đã lưu hợp đồng" })
                    : NotFound(new { message = "Không tìm thấy hợp đồng này" });
            }
            catch (SoChuaMoException ex) { return Conflict(new { message = ex.Message }); }
        }

        [HttpDelete("{id:int}")]
        public async Task<IActionResult> XoaHopDong(int id, [FromQuery] string? maDonVi)
        {
            var (dv, nam, loi) = await DonViThaoTac(maDonVi);
            if (dv == null) return StatusCode(403, new { message = loi });

            try
            {
                return await _hd.XoaHopDong(dv, nam, id)
                    ? Ok(new { message = "Đã xóa hợp đồng" })
                    : NotFound(new { message = "Không tìm thấy hợp đồng này" });
            }
            catch (SoChuaMoException ex) { return Conflict(new { message = ex.Message }); }
        }
    }
}
