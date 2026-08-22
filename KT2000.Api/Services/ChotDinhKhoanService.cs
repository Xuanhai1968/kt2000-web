namespace KT2000.Api.Services
{
    // ============ ĐỊNH KHOẢN — VIÊN GẠCH CHỐT (BR-CDK-08) ============
    //
    // Hai việc người dùng làm ở màn chốt, và CHỈ hai:
    //   ChotDungAsync  — "máy đoán đúng rồi"           (nút Mark Is Predict OK, cột Exp)
    //   SuaNhanAsync   — "sai, đổi sang tài khoản này" (nút Update về Data Training, cột Sửa)
    //
    // Vì sao phải có service này thay vì để controller tự gọi hai service kia: mỗi việc
    // trên chạm HAI database khác nhau theo một THỨ TỰ BẮT BUỘC, và thứ tự đó là luật
    // nghiệp vụ chứ không phải chi tiết kỹ thuật (yêu cầu Trường 22/08):
    //
    //   1. Sửa sổ (HOA_DON_LINE của đơn vị-năm) TRƯỚC
    //   2. ĐỌC LẠI nhãn vừa ghi TỪ SỔ
    //   3. Rồi mới đẩy nhãn đó vào kho học (KT2000_PUB.DK_DATA_TRAIN)
    //
    // Bước 2 là chỗ dễ bỏ nhất và cũng là chỗ hỏng nặng nhất. Nếu đẩy thẳng cái người
    // dùng gõ trên màn hình mà không đọc lại sổ, thì hễ lệnh sửa sổ không ăn dòng nào —
    // sai tên hàng một dấu cách, sai chiều V/R, đơn vị chưa mở sổ — kho học vẫn nhận
    // được nhãn mới trong khi sổ còn nguyên nhãn cũ. Model học một đằng, sổ ghi một
    // nẻo, và không có gì báo lỗi. Đọc lại sổ thì cái vào kho học luôn ĐÚNG BẰNG cái
    // đang nằm trong sổ.
    //
    // Để controller tự xâu chuỗi ba bước này là sớm muộn cũng có đường thứ hai làm
    // thiếu một bước (luật 14 — nguyên tắc viên gạch).
    //
    // CHIỀU VÀO/RA đi xuyên suốt cả ba bước (yêu cầu Trường 22/08): hàng VÀO sửa ghi_no,
    // hàng RA sửa ghi_co, và kho học lưu kèm vao_ra. Cùng một tên hàng ở hai chiều là
    // HAI dòng học khác nhau — gộp lại là dạy máy rằng mua và bán vào chung một tài khoản.
    //
    // CÒN LỆCH README_DK_WEB.md mục 2 (nêu ra, chưa sửa — cần Leader chốt): README đòi
    // "update HOA_DON_LINE và audit-insert DK_DATA_TRAIN nằm trong CÙNG MỘT transaction".
    // Ở đây là hai transaction rời (một cho sổ, một cho kho học) vì hai bên đi qua hai
    // connection khác database. Hệ quả thật: máy chủ chết đúng giữa bước 1 và bước 3 thì
    // sổ đã gật mà kho học chưa học. Không mất dữ liệu, nhưng mặt hàng đó biến khỏi lưới
    // (good_pred = 1) nên không ai gặp lại để dạy — phải tra DK_AUDIT_LOG mới thấy thiếu.
    public class ChotDinhKhoanService
    {
        private readonly DinhKhoanService _dk;
        private readonly DkPubService _pub;
        private readonly ILogger<ChotDinhKhoanService> _log;

        public ChotDinhKhoanService(DinhKhoanService dk, DkPubService pub,
                                    ILogger<ChotDinhKhoanService> log)
        { _dk = dk; _pub = pub; _log = log; }

        // BR-CDK-04 + README_DK_WEB.md mục 2: dòng đạt ngưỡng (BỊ SỬA **HOẶC**
        // pred_conf < 0.85) thì audit-insert vào Data Training.
        //
        // Vì sao 0,85 chứ không phải 0,70 như ngưỡng tô màu: hai con số trả lời hai câu
        // khác nhau. 0,70 là "người nên soi kỹ cái này"; 0,85 là "máy chưa vững ở vùng
        // này, một ví dụ được người gật sẽ củng cố nó". Vùng 0,70–0,85 chính là chỗ máy
        // đoán đúng nhưng chưa chắc — đúng thứ đáng học nhất.
        //
        // Đo NHAT_TUAN_2026 ngày 22/08 để biết luật này ăn bao nhiêu:
        //   >= 0,95        3 mặt hàng
        //   0,85 - 0,95  479 mặt hàng   <- KHÔNG vào Data Training
        //   0,70 - 0,85  126 mặt hàng   <- vào
        //   <  0,70      113 mặt hàng   <- vào
        // Tức khoảng một phần ba mặt hàng sẽ vào kho học mỗi lần kế toán gật. Không phải
        // vài ca lẻ — đây là con đường chính để kho học lớn lên.
        public const decimal NGUONG_VAO_TRAIN = 0.85m;

        public sealed class KetQuaChot
        {
            /// <summary>Số dòng HOA_DON_LINE đã ghi.</summary>
            public int SoDong { get; set; }
            /// <summary>Số mặt hàng người dùng gửi lên.</summary>
            public int SoMatHang { get; set; }
            /// <summary>Số mặt hàng đủ điều kiện đẩy sang kho học.</summary>
            public int SoDayTrain { get; set; }
            public int SoMoi { get; set; }
            public int SoTrung { get; set; }
            public int SoXungDot { get; set; }
            public int SoBiLoai { get; set; }
            public List<DkPubService.KetQuaChot> ChiTiet { get; } = new();
            public List<string> CanhBao { get; } = new();
        }

        /// <summary>
        /// Nút "Mark Is Predict OK" — máy đoán đúng, chỉ cần gật.
        /// good_pred = 1 cho MỌI dòng của các mặt hàng gửi lên; KHÔNG đổi định khoản.
        /// Mặt hàng nào máy còn yếu (pred_conf &lt; 0,85) thì đẩy luôn sang kho học.
        /// </summary>
        public async Task<KetQuaChot> ChotDungAsync(
            IEnumerable<DinhKhoanService.ThayDoiDto> ds, int nam, string user,
            CancellationToken ct)
        {
            // Ép XacNhanDung và bỏ TkMoi: đây là đường "gật", không phải đường "sửa".
            // Chặn ngay tại đây thay vì tin vào màn hình — một payload lạ mà đổi được
            // định khoản qua nút xác nhận thì đúng thứ hai cột tích sinh ra để chặn.
            var list = ds.Select(x => new DinhKhoanService.ThayDoiDto
            {
                MaDonVi = x.MaDonVi, Huong = x.Huong, TenHang = x.TenHang,
                TkMoi = null, XacNhanDung = true,
            }).ToList();

            return await ChayAsync(list, nam, user, chiLayDuoiNguong: true, ct);
        }

        /// <summary>
        /// Nút "Update về Data Training" — định khoản sai, đổi sang tài khoản người dùng
        /// chọn rồi dạy lại cho máy. Mọi mặt hàng đã sửa đều vào kho học, không xét ngưỡng
        /// (README mục 2: "bị sửa HOẶC pred_conf &lt; 0.85" — vế đầu đã đủ).
        /// </summary>
        public async Task<KetQuaChot> SuaNhanAsync(
            IEnumerable<DinhKhoanService.ThayDoiDto> ds, int nam, string user,
            CancellationToken ct)
        {
            // Mặt hàng không kèm tài khoản mới thì không có gì để sửa và cũng không có gì
            // để dạy. Bỏ ngay ở cửa, đừng để nó đi hết ba bước rồi mới rơi ra.
            var list = ds.Where(x => !string.IsNullOrWhiteSpace(x.TkMoi))
                         .Select(x => new DinhKhoanService.ThayDoiDto
                         {
                             MaDonVi = x.MaDonVi, Huong = x.Huong, TenHang = x.TenHang,
                             TkMoi = x.TkMoi!.Trim(), XacNhanDung = true,
                         }).ToList();

            return await ChayAsync(list, nam, user, chiLayDuoiNguong: false, ct);
        }

        // ===================== BA BƯỚC DÙNG CHUNG =====================
        //
        // Hai nút chỉ khác nhau ĐÚNG hai chỗ: có tài khoản mới hay không, và có lọc theo
        // ngưỡng hay không. Toàn bộ phần còn lại — thứ tự ghi, đọc lại sổ, giữ chiều V/R,
        // gom kết quả — là một. Viết hai bản là hai bản sẽ lệch nhau sau vài lần sửa.
        private async Task<KetQuaChot> ChayAsync(
            List<DinhKhoanService.ThayDoiDto> list, int nam, string user,
            bool chiLayDuoiNguong, CancellationToken ct)
        {
            var kq = new KetQuaChot { SoMatHang = list.Count };
            if (list.Count == 0) return kq;

            // ---- BƯỚC 1: SỬA SỔ TRƯỚC ----
            //
            // Ném lên nếu hỏng, KHÔNG nuốt: hỏng ở đây nghĩa là sổ chưa đổi, nên tuyệt
            // đối không được đi tiếp sang bước dạy máy.
            kq.SoDong = await _dk.CapNhatAsync(list, nam, user);

            // ---- BƯỚC 2: ĐỌC LẠI TỪ SỔ ----
            //
            // Nguồn sự thật DUY NHẤT cho cái sắp dạy máy. Xem khối comment đầu file.
            var trongSo = new Dictionary<string, DinhKhoanService.NhanTrongSoDto>();
            foreach (var nhom in list.GroupBy(x => x.MaDonVi, StringComparer.OrdinalIgnoreCase))
            {
                try
                {
                    foreach (var n in await _dk.LayNhanTrongSoAsync(nhom.Key, nam, ct))
                        trongSo[Khoa(nhom.Key, n.Huong, n.TenHang)] = n;
                }
                catch (Exception ex)
                {
                    // Đọc lại hỏng thì mặt hàng của đơn vị đó KHÔNG được dạy cho máy —
                    // nhưng sổ đã sửa xong rồi, nên không được ném để lùi cả lượt.
                    // Nói ra là bắt buộc: im lặng thì người dùng tưởng đã dạy xong.
                    kq.CanhBao.Add($"{nhom.Key}: sổ đã ghi nhưng không đọc lại được để "
                                 + $"đưa vào dữ liệu huấn luyện — {ex.Message}");
                    _log.LogError(ex, "Chốt định khoản: đọc lại sổ hỏng ở {Code}", nhom.Key);
                }
            }

            // ---- BƯỚC 3: LỌC THEO NGƯỠNG RỒI ĐẨY SANG KHO HỌC ----
            var mangDayTrain = new List<DkPubService.ChotDto>();
            foreach (var t in list)
            {
                // Chiều V/R giữ nguyên từ đầu tới cuối — khoá tra cứu, câu lệnh sửa sổ và
                // dòng ghi vào kho học đều dùng chung một chữ này.
                string vr = t.Huong.Trim().ToUpperInvariant().StartsWith('R') ? "R" : "V";
                if (!trongSo.TryGetValue(Khoa(t.MaDonVi, vr, t.TenHang), out var n))
                    continue;   // đơn vị đọc hỏng, hoặc mặt hàng không còn dòng nào

                // Nhãn RỖNG thì không có gì để học. Xảy ra thật khi hoá đơn chỉ có dòng
                // ghi chú: máy không đoán, sổ để trống, mà kho học không nhận nhãn rỗng.
                if (string.IsNullOrWhiteSpace(n.Nhan)) continue;

                // Ngưỡng chỉ áp cho đường "gật". pred_conf NULL = máy chưa từng đoán mặt
                // hàng này (nhãn do người gõ tay hoặc do luật cứng lúc nạp) — không có số
                // để so, nên KHÔNG đưa vào: đường "gật" chỉ nên củng cố chỗ MÁY còn yếu,
                // còn cái người tự gõ thì đã đi bằng đường "sửa" rồi.
                if (chiLayDuoiNguong &&
                    (n.TinCay is null || n.TinCay >= NGUONG_VAO_TRAIN)) continue;

                mangDayTrain.Add(new DkPubService.ChotDto
                {
                    MaDonVi = t.MaDonVi, Huong = vr, TenHang = t.TenHang,
                    Label = n.Nhan!.Trim(),
                });
            }

            kq.SoDayTrain = mangDayTrain.Count;
            if (mangDayTrain.Count == 0) return kq;

            // ChotAsync lo trọn phần audit: danh sách đen → NEW / DUPLICATE / CONFLICT →
            // DK_AUDIT_LOG. Xung đột (cùng tên, cùng chiều, cùng đơn vị mà khác nhãn) vào
            // CHO_GIAI_THICH và KHÔNG vào model cho tới khi có lý do — đúng BR-CDK-06 và
            // đúng yêu cầu Trường 22/08.
            kq.ChiTiet.AddRange(await _pub.ChotAsync(mangDayTrain, user, ct));
            kq.SoMoi     = kq.ChiTiet.Count(x => x.TrangThai == "NEW");
            kq.SoTrung   = kq.ChiTiet.Count(x => x.TrangThai == "DUPLICATE");
            kq.SoXungDot = kq.ChiTiet.Count(x => x.TrangThai == "CONFLICT");
            kq.SoBiLoai  = kq.ChiTiet.Count(x => x.TrangThai.StartsWith("REJECT"));
            return kq;
        }

        private static string Khoa(string dv, string vr, string ten)
            => $"{dv.Trim().ToUpperInvariant()}|{vr}|{ten.Trim()}";
    }
}
