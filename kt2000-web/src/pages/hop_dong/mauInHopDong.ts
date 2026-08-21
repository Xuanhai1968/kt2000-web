// Mẫu in HỢP ĐỒNG LAO ĐỘNG — chép nguyên văn từ khuôn Excel kế toán đang dùng
// (test/hopdong/Copy of HDLD_2025_VINH_HOAN.xlsx). Mỗi nhân sự một sheet, cùng một
// mẫu; so hai sheet chỉ 7 ô đổi theo người nên phần chữ dưới đây là cố định, chỉ
// thay chỗ có biến.
//
// GIỮ NGUYÊN CÂU CHỮ của bản gốc, kể cả những chỗ đọc hơi lạ ("Phụ cấpđiện thoại"
// thiếu dấu cách, "ngh" bị cắt cụt cuối Điều 3): đây là văn bản pháp lý kế toán đã
// dùng nhiều năm, sửa cho "đẹp" là làm hợp đồng in ra khác hợp đồng đã ký.
import { esc, inGiay, xemTruocGiay } from "../inGiay";
import type { HopDong } from "../../api";

const ngayVn = (s: string | null | undefined) => {
  const p = (s ?? "").slice(0, 10).split("-");
  return p.length === 3 && p[0] ? `${p[2]}/${p[1]}/${p[0]}` : "";
};

// "ngày 02 tháng 01 năm 2025" — dạng chữ trên tờ hợp đồng
const ngayChu = (s: string | null | undefined) => {
  const p = (s ?? "").slice(0, 10).split("-");
  return p.length === 3 && p[0]
    ? `ngày ${p[2]} tháng ${p[1]} năm ${p[0]}`
    : "ngày …… tháng …… năm ……";
};

const tienVn = (v: number | null | undefined) =>
  v == null ? "" : v.toLocaleString("vi-VN", { maximumFractionDigits: 0 });

/**
 * CSS của tờ hợp đồng. XUẤT RA NGOÀI để màn Tạo hợp đồng dùng lại y nguyên cho khung
 * xem trước sống bên phải form — cùng một bộ luật trình bày thì thứ nhìn trên màn
 * đúng bằng thứ in ra giấy. Có hai bản CSS là bắt đầu lệch nhau.
 */
export const CSS_HD = `
  .hdld { font-family: "Times New Roman", serif; color: #000; font-size: 13px;
          line-height: 1.5; }
  .hdld + .hdld { page-break-before: always; }
  .hdld__top { width: 100%; border-collapse: collapse; margin-bottom: 2px; }
  .hdld__top td { vertical-align: top; padding: 0; }
  .hdld__top .r { text-align: center; }
  .hdld__cty { font-weight: 700; text-transform: uppercase; }
  .hdld__qh { font-weight: 700; text-transform: uppercase; }
  .hdld__tt { font-weight: 700; }
  .hdld__title { text-align: center; font-size: 18px; font-weight: 700;
                 margin: 14px 0 12px; letter-spacing: 0.5px; }
  .hdld p { margin: 2px 0; }
  .hdld__dieu { font-weight: 700; margin-top: 8px; }
  .hdld__in { display: inline-block; min-width: 120px; border-bottom: 1px dotted #666;
              padding: 0 4px; font-weight: 700; }
  .hdld__sigs { width: 100%; border-collapse: collapse; margin-top: 18px; }
  .hdld__sigs th { text-align: center; font-weight: 700; text-transform: uppercase;
                   padding: 4px; }
  .hdld__sigs td { text-align: center; padding: 2px 4px; }
  .hdld__sigs .khoang td { height: 70px; }
  .hdld__sigs .ten td { font-weight: 700; }
  /* Không để Điều nào bị cắt ngang giữa hai trang */
  .hdld__khoi { page-break-inside: avoid; }
`;

/** Một ô có giá trị thì in đậm, trống thì để dấu chấm chấm như bản Excel. */
const o = (v: string | number | null | undefined, rong = 120) =>
  `<span class="hdld__in" style="min-width:${rong}px">${
    v == null || v === "" ? "……………" : esc(v)}</span>`;

export function htmlHopDong(x: HopDong, tenDonVi?: string | null): string {
  const cty = x.nsdldDaiDien || tenDonVi || "";
  const soHd = x.soHd || "";

  return `
<div class="hdld">
  <table class="hdld__top">
    <tr>
      <td style="width:48%">
        <div class="hdld__cty">${esc(cty)}</div>
        <div>Số : ${esc(soHd)}</div>
      </td>
      <td class="r">
        <div class="hdld__qh">Cộng hoà xã hội chủ nghĩa Việt Nam</div>
        <div class="hdld__tt">Độc lập - Tự do - Hạnh Phúc</div>
        <div>.……….o0o…………</div>
      </td>
    </tr>
  </table>

  <div class="hdld__title">HỢP ĐỒNG LAO ĐỘNG</div>

  <div class="hdld__khoi">
    <p>Chúng tôi, một bên là Ông/Bà: ${o(x.nsdldHoTen, 200)}
       &nbsp;&nbsp;Quốc tịch: ${o("Việt Nam", 90)}</p>
    <p>Chức vụ: ${o(x.nsdldChucVu, 200)}</p>
    <p>Đại diện cho: ${o(cty, 380)}</p>
    <p>Địa chỉ: ${o(x.nsdldDiaChi, 420)}</p>
    <p>Và một bên là Ông/Bà: ${o(x.hoTen, 200)}
       &nbsp;&nbsp;Quốc tịch: ${o(x.quocTich || "Việt Nam", 90)}</p>
    <p>Sinh ngày: ${o(ngayVn(x.ngaySinh), 120)}</p>
    <p>Nghề nghiệp: ${o(x.ngheNghiep, 200)}</p>
    <p>Số CMTND: ${o(x.soCmnd, 160)}</p>
    <p>Thoả thuận ký kết hợp đồng lao động và cam kết làm đúng những điều khoản sau đây:</p>
  </div>

  <div class="hdld__khoi">
    <div class="hdld__dieu">Điều 1: Thời hạn và công việc hợp đồng</div>
    <p>- Loại hợp đồng lao động: ${o(x.loaiHd, 160)}</p>
    <p>- Thời gian từ: ${o(ngayVn(x.tuNgay), 120)} đến ngày ${o(ngayVn(x.denNgay), 120)}</p>
    <p>- Địa điểm làm việc: ${o(x.diaDiemLv, 420)}</p>
    <p>Và Các địa điểm khác được ${esc(cty)}</p>
    <p>- Chức danh chuyên môn(Vị trí công việc): ${o(x.chucDanh, 200)}
       &nbsp;&nbsp;Chức vụ (nếu có): ${o(null, 120)}</p>
    <p>- Công việc phải làm:</p>
    <p>${x.congViec ? esc(x.congViec) : "+ Các công việc khác khi được công ty phân công"}</p>
  </div>

  <div class="hdld__khoi">
    <div class="hdld__dieu">Điều 2: Chế độ làm việc</div>
    <p>- Thời gian làm việc: ${o(x.thoiGianLv || "48 giờ/tuần.", 140)}</p>
    <p>- Ngoài ra, theo nhu cầu sản xuất kinh doanh của Công ty, người sử dụng lao động
       có quyền yêu cầu người lao động làm thêm giờ theo quy định của Bộ Luật Lao động.</p>
    <p>- Được cấp phát những dụng cụ làm việc gồm: Các dụng cụ làm việc phù hợp với công
       việc được phân công.</p>
  </div>

  <div class="hdld__khoi">
    <div class="hdld__dieu">Điều 3: Nghĩa vụ và quyền lợi của người lao động.</div>
    <p><b>1. Quyền lợi:</b></p>
    <p>- Phương tiện đi lại làm việc: ${o(x.phuongTien || "Cá nhân tự túc", 180)}</p>
    <p>- Mức lương chính hoặc tiền công: ${o(
        x.luongChinh == null ? null : `${tienVn(x.luongChinh)}đ/1 tháng`, 200)}</p>
    <p>+ Mức lương chính làm cơ sở đóng BHXH, BHYT, BH Thất nghiệp, tính các chế độ trợ
       cấp thôi việc, mất việc, bồi thường do đơn phương chấm dứt hợp đồng lao động trái
       luật, bồi thường tại nạn lao động, bệnh nghề nghiệp, ngày nghỉ hàng năm, ngày nghỉ
       lễ, ngh</p>
    <p>- Các khoản phụ cấp và chế độ khác:</p>
    <p>+ Phụ cấp ăn ca: ${o(
        x.pcAnCa == null ? null : `${tienVn(x.pcAnCa)}đ/1 ngày công đi làm thực tế`, 240)}</p>
    <p>+ Phụ cấpđiện thoại : ${o(
        x.pcDienThoai == null ? null : `${tienVn(x.pcDienThoai)}đ/1 tháng`, 180)}</p>
    <p>+ Phụ cấp xăng xe : ${o(
        x.pcXangXe == null ? null : `${tienVn(x.pcXangXe)}đ/1 tháng`, 180)}</p>
    <p>+ Tuỳ tình hình hoạt động kinh doanh của công ty, mức thưởng lễ ,tết này có thể
       thay đổi</p>
    <p>- Hình thức trả lương: ${
        x.hinhThucTra
          ? esc(x.hinhThucTra)
          : "Thanh toán lương theo tháng từ ngày 03 đến ngày 10 hàng tháng."}</p>
    <p>- Chế độ nâng lương: Theo quy định của Công ty hoặc quy định của pháp luật lao động</p>
    <p>- Được trang bị bảo hộ lao động gồm: ${esc(x.baoHoLd || "Không")}</p>
    <p>- Chế độ nghỉ ngơi: Theo Bộ luật lao động hoặc thoả ước lao động tập thể ( nếu có)
       của ${esc(cty)}</p>
    <p>- Bảo hiểm xã hội và bảo hiểm y tế, bảo hiểm thất nghiệp theo quy định</p>
    <p>- Chế độ đào tạo: Theo Thoả ước lao động tập thể của ${esc(cty)} (nếu có) hoặc theo
       thoả thuận giữa người sử dụng lao động và người lao động.</p>
    <p>- Những thoả thuận khác:</p>
    ${x.thoaThuan
      ? `<p>${esc(x.thoaThuan)}</p>`
      : `<p>+ Nhân viên phải tuân thủ chấp hành luật của nhà nước như luật giao thông
             đường bộ… Công ty không chịu trách nhiệm thanh toán các khoản phạt vi phạm
             giao thông (nếu có)</p>
         <p>+ Khi nhân viên có nhu cầu nghỉ quá 02 ngày phải báo trước với bộ phận quản lý
             của công ty trước 02 ngày. Tuy nhiên, vẫn phải đảm bảo bàn giao công việc cho
             những nhân viên khác và vẫn giữ liên lạc thường xuyên với bộ phận quản lý của
             công ty.</p>
         <p>+ Người lao động cam kết làm thêm giờ khi công ty có nhu cầu.</p>`}
    <p><b>2. Nghĩa vụ</b></p>
    <p>- Hoàn thành những công việc đã cam kết trong hợp đồng.</p>
    <p>- Chấp hành lệnh điều hành sản xuất kinh doanh, nội quy kỷ luật lao động, an toàn
       lao động…</p>
    <p>- Bồi thường vi phạm về vật chất: Theo quy định Bộ luật lao động hoặc theo quy định
       ${esc(cty)}. Giá trị bồi thường căn cứ vào giá trị thiệt hại về tài sản theo giá
       thị trường tại thời điểm bồi thường cho Công ty.</p>
  </div>

  <div class="hdld__khoi">
    <div class="hdld__dieu">Điều 4: Nghĩa vụ và quyền hạn của người sử dụng lao động</div>
    <p><b>1. Nghĩa vụ:</b></p>
    <p>- Đảm bảo việc làm và thực hiện đầy đủ những điều đã cam kết trong Hợp đồng lao động.</p>
    <p>- Thanh toán đầy đủ, đúng thời hạn các chế độ và quyền lợi cho người lao động theo
       hợp đồng lao động, thoả ước lao động tập thể (nếu có).</p>
    <p><b>2. Quyền hạn:</b></p>
    <p>- Điều hành người lao động hoàn thành công việc theo hợp đồng (bố trí, điều chuyển,
       tạm ngừng việc…)</p>
    <p>- Tạm hoãn, chấm dứt hợp đồng lao động, kỷ luật người lao động theo quy định của
       pháp luật, thoả ước lao động tập thể (nếu có) và nội quy lao động của doanh nghiệp.</p>
  </div>

  <div class="hdld__khoi">
    <div class="hdld__dieu">Điều 5: Điều khoản thi hành</div>
    <p>- Những vấn đề về lao động không ghi trong hợp đồng này thì áp dụng quy định của
       Thoả ước lao động tập thể (nếu có), trừ trường hợp Thoả ước chưa quy định thì áp
       dụng theo quy định của bộ luật lao động</p>
    <p>- Hợp đồng lao động được lập thành 02 bản có giá trị ngang nhau, mỗi bên giữ một bản
       và có hiệu lực kể từ ngày ký hợp đồng. Khi hai bên ký kết phụ lục hợp đồng thì nội
       dung của phụ lục hợp đồng cũng có giá trị như các nội dung của bản hợp đồng lao động</p>
    <p>- Hợp đồng này làm tại ${esc(cty)} ${ngayChu(x.ngayKy)}.</p>
  </div>

  <table class="hdld__sigs hdld__khoi">
    <tr><th style="width:50%">Người lao động</th><th>Người sử dụng lao động</th></tr>
    <tr class="khoang"><td></td><td></td></tr>
    <tr class="ten">
      <td>${esc(x.hoTen ?? "")}</td>
      <td>${esc(x.nsdldHoTen ?? "")}</td>
    </tr>
  </table>
</div>`;
}

const tenFile = (x: HopDong) =>
  `HDLD_${(x.soHd || "").replace(/[^\w.]/g, "_")}_${(x.hoTen || "").replace(/\s+/g, "_")}`;

export function inHopDong(x: HopDong, tenDonVi?: string | null) {
  inGiay(tenFile(x), `<style>${CSS_HD}</style>${htmlHopDong(x, tenDonVi)}`);
}

export function xemTruocHopDong(x: HopDong, tenDonVi?: string | null) {
  xemTruocGiay(tenFile(x), `<style>${CSS_HD}</style>${htmlHopDong(x, tenDonVi)}`);
}
