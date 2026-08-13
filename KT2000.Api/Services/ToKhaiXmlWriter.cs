using System.Globalization;
using System.Xml.Linq;
using KT2000.Api.Models;

namespace KT2000.Api.Services
{
    // ============ SINH XML TỜ KHAI 01/GTGT ĐỂ NẠP VÀO HTKK ============
    //
    // Spec: docs/NB/SPEC-TO-KHAI-01-GTGT.md §6
    //
    // CÁCH LÀM: lấy XML tờ khai kỳ TRƯỚC của chính đơn vị đó làm KHUÔN, rồi chỉ thay
    // kỳ kê khai và các chỉ tiêu tiền. KHÔNG dựng cây XML từ số không.
    //
    // Vì sao phải bám khuôn: tờ khai HTKK có hàng chục nút thông tin đơn vị (maCQTNoiNop,
    // maTinhNNT, tieuMucHachToan, ttinNhaCCapDVu…) mà sổ KHÔNG lưu ở đâu cả. Dựng lại từ
    // đầu thì hoặc phải bịa, hoặc để trống — cả hai đều làm HTKK từ chối file. Khuôn kỳ
    // trước đã có sẵn đúng những giá trị đó, chép lại là chắc chắn đúng.
    //
    // Khi không có khuôn: vẫn dựng được cây tối thiểu, nhưng ToKhaiService đã chặn từ
    // trước bằng LK-02 (không có XML kỳ trước thì không cho lập tờ khai).
    public static class ToKhaiXmlWriter
    {
        /// <summary>
        /// Dựng XML tờ khai kỳ này TỪ tờ khai kỳ trước của chính đơn vị đó.
        /// </summary>
        /// <param name="khuon">
        /// Tờ khai kỳ trước — BẮT BUỘC. ToKhaiService đã kiểm đúng mẫu 842, đúng MST và
        /// đủ nút bắt buộc trước khi gọi vào đây.
        /// </param>
        public static XDocument Dung(ToKhaiGtgtDto tk, XDocument khuon)
        {
            // Sao chép SÂU: mọi thao tác bên dưới ghi đè giá trị nút, không sao chép thì
            // sửa thẳng vào cây của file gốc mà người dùng vừa tải lên.
            var doc = new XDocument(khuon);

            var goc = doc.Root ?? throw new InvalidOperationException("Khuôn tờ khai rỗng");

            CapNhatKyKhai(goc, tk);
            CapNhatChiTieu(goc, tk);
            CapNhatPhuLuc(goc, tk);

            return doc;
        }

        // Tìm phần tử theo tên cục bộ, bỏ qua namespace — khuôn có thể khai prefix khác.
        private static XElement? Tim(XElement goc, string ten) =>
            goc.Descendants().FirstOrDefault(x => x.Name.LocalName == ten);

        private static void Dat(XElement goc, string ten, string giaTri)
        {
            var e = Tim(goc, ten);
            if (e != null) e.Value = giaTri;
        }

        // Số tiền trong tờ khai LUÔN là số nguyên, không dấu phân cách, không phần lẻ.
        // Dùng InvariantCulture: máy đặt vi-VN sẽ sinh "1.986.635.640" nếu để mặc định,
        // HTKK đọc vào thành rác.
        private static void DatSo(XElement goc, string ten, decimal giaTri) =>
            Dat(goc, ten, Math.Round(giaTri, 0, MidpointRounding.AwayFromZero)
                              .ToString("0", CultureInfo.InvariantCulture));

        private static void CapNhatKyKhai(XElement goc, ToKhaiGtgtDto tk)
        {
            var dauKy = new DateTime(tk.Nam, tk.Thang, 1);
            var cuoiKy = dauKy.AddMonths(1).AddDays(-1);

            Dat(goc, "kyKKhai", $"{tk.Thang:00}/{tk.Nam}");
            Dat(goc, "kyKKhaiTuNgay", dauKy.ToString("dd/MM/yyyy", CultureInfo.InvariantCulture));
            Dat(goc, "kyKKhaiDenNgay", cuoiKy.ToString("dd/MM/yyyy", CultureInfo.InvariantCulture));

            // Ngày lập/ký = hôm nay. Tờ khai nộp muộn vẫn ghi ngày lập thật, không lùi
            // về trong kỳ — cơ quan thuế đối chiếu ngày này với ngày tiếp nhận.
            var homNay = DateTime.Now.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
            Dat(goc, "ngayLapTKhai", homNay);
            Dat(goc, "ngayKy", homNay);

            // Tờ khai CHÍNH THỨC lần đầu. Khuôn chép từ kỳ trước có thể đang là bản
            // bổ sung (loaiTKhai=B, soLan>0) — phải đặt lại, không thì kỳ mới bị hiểu
            // nhầm thành tờ khai bổ sung của kỳ cũ.
            Dat(goc, "loaiTKhai", "C");
            Dat(goc, "soLan", "0");
        }

        private static void CapNhatChiTieu(XElement goc, ToKhaiGtgtDto tk)
        {
            DatSo(goc, "ct21", tk.Ct21);
            DatSo(goc, "ct22", tk.Ct22);
            DatSo(goc, "ct23", tk.Ct23);
            DatSo(goc, "ct24", tk.Ct24);
            DatSo(goc, "ct23a", tk.Ct23a);
            DatSo(goc, "ct24a", tk.Ct24a);
            DatSo(goc, "ct25", tk.Ct25);
            DatSo(goc, "ct26", tk.Ct26);
            DatSo(goc, "ct27", tk.Ct27);
            DatSo(goc, "ct28", tk.Ct28);
            DatSo(goc, "ct29", tk.Ct29);
            DatSo(goc, "ct30", tk.Ct30);
            DatSo(goc, "ct31", tk.Ct31);
            DatSo(goc, "ct32", tk.Ct32);
            DatSo(goc, "ct33", tk.Ct33);
            DatSo(goc, "ct32a", tk.Ct32a);
            DatSo(goc, "ct34", tk.Ct34);
            DatSo(goc, "ct35", tk.Ct35);
            DatSo(goc, "ct36", tk.Ct36);
            DatSo(goc, "ct37", tk.Ct37);
            DatSo(goc, "ct38", tk.Ct38);
            DatSo(goc, "ct39a", tk.Ct39a);
            DatSo(goc, "ct40a", tk.Ct40a);
            DatSo(goc, "ct40b", tk.Ct40b);
            DatSo(goc, "ct40", tk.Ct40);
            DatSo(goc, "ct41", tk.Ct41);
            DatSo(goc, "ct42", tk.Ct42);
            DatSo(goc, "ct43", tk.Ct43);
        }

        // Phụ lục NQ142 — bảng kê hàng được giảm thuế 10% → 8%.
        private static void CapNhatPhuLuc(XElement goc, ToKhaiGtgtDto tk)
        {
            var pl = Tim(goc, "PL_NQ142_GTGT");

            if (tk.PhuLucNq142 == null)
            {
                // Kỳ này không có hàng giảm thuế: BỎ HẲN phụ lục khỏi tờ khai. Để lại
                // với số 0 thì HTKK vẫn coi là có kê khai phụ lục, lệch với thực tế.
                pl?.Remove();
                return;
            }
            if (pl == null) return;      // khuôn không có phụ lục — không tự dựng

            var p = tk.PhuLucNq142;

            // --- Mua vào ---
            var muaVao = Tim(pl, "HH_DV_MuaVaoTrongKy");
            if (muaVao != null)
            {
                DatSo(muaVao, "giaTriHHDVMuaVao", p.GiaTriHhdvMuaVao);
                DatSo(muaVao, "thueGTGTHHDV", p.ThueGtgtHhdvMuaVao);
                DatSo(muaVao, "tongCongGiaTriHHDVMuaVao", p.GiaTriHhdvMuaVao);
                DatSo(muaVao, "tongCongThueGTGTHHDV", p.ThueGtgtHhdvMuaVao);
            }

            // --- Bán ra ---
            var banRa = Tim(pl, "HH_DV_BanRaTrongKy");
            if (banRa != null)
            {
                DatSo(banRa, "giaTriHHDV", p.GiaTriHhdvBanRa);
                DatSo(banRa, "thueSuatTheoQuyDinh", p.ThueSuatTheoQuyDinh);
                DatSo(banRa, "thueSuatSauGiam", p.ThueSuatSauGiam);
                DatSo(banRa, "thueGTGTDuocGiam", p.ThueGtgtDuocGiam);
                DatSo(banRa, "tongCongGiaTriHHDV", p.GiaTriHhdvBanRa);
                DatSo(banRa, "tongCongThueGTGTDuocGiam", p.ThueGtgtDuocGiam);
            }

            // ct9 của phụ lục KHÁC ct9 tờ khai chính — phải tìm trong nhánh ChenhLech,
            // không dùng Tim() trên cả cây kẻo vớ nhầm nút cùng tên ở chỗ khác.
            var chenh = Tim(pl, "ChenhLech");
            if (chenh != null) DatSo(chenh, "ct9", p.ChenhLechCt9);
        }

        // Ở đây từng có KhuonToiThieu() dựng cây XML từ số không khi thiếu tờ khai kỳ
        // trước. ĐÃ BỎ (13/08): file dựng tay thiếu maCQTNoiNop / maTinhNNT /
        // tieuMucHachToan nên HTKK từ chối, mà nhìn bằng mắt vẫn thấy "có vẻ đúng" —
        // người dùng chỉ phát hiện lúc nộp. Nay ToKhaiService.SinhXml chặn tường minh
        // và yêu cầu tải tờ khai kỳ trước lên, thay vì lặng lẽ sinh file dùng không được.
    }
}
