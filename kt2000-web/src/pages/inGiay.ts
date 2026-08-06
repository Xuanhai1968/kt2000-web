// Tiện ích IN GIẤY dùng chung cho mọi mẫu in của phần nội bộ.
//
// Khuôn mẫu bê từ Hoa_Sang (utils/printInvoice.ts + components/PrintInvoice.tsx) để tờ
// giấy in ra giống hệt bản người dùng đang quen: khối đầu công ty, tiêu đề giữa trang,
// khối thông tin nhãn-giá trị, bảng hàng có viền, dòng TỔNG, bảng 4 ô chữ ký, chân trang
// có giờ in. Lớp CSS giữ nguyên tiền tố .pxk__ của bản gốc cho dễ đối chiếu.
//
// VÌ SAO IFRAME CHỨ KHÔNG window.open: cửa sổ bật lên hay bị trình duyệt chặn
// (popup blocker), nhất là khi lệnh in không nằm ngay trong cú bấm chuột. Iframe ẩn thì
// không bị chặn, không nhá cửa sổ trắng, và in xong tự dọn. Hoa_Sang cũng làm vậy.
//
// KHÔNG có bước xem trước: bấm In là ra thẳng hộp thoại in của trình duyệt (hộp thoại đó
// vốn đã có khung xem trước sẵn).

// Rào ký tự đặc biệt trước khi ghép vào HTML.
// BẮT BUỘC: tên hàng / tên khách do người dùng tự gõ, mà app này sắp phơi ra internet
// (AD-NB-06). Đặt tên khách là "<script>..." mà ghép thẳng chuỗi thì mã đó chạy thật.
// React tự rào cho phần giao diện, nhưng document.write thì KHÔNG.
export const esc = (s: unknown) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

export const soTienIn = (n: number) =>
  (Number(n) || 0).toLocaleString("vi-VN",
    { minimumFractionDigits: 0, maximumFractionDigits: 4 });

// Giờ in đóng ở chân trang — đúng kiểu Hoa_Sang, để biết tờ giấy in lúc nào.
export const gioIn = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  const h = d.getHours();
  const sa = h < 12 ? "AM" : "PM";
  const h12 = ((h + 11) % 12) + 1;
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} `
       + `${p(h12)}:${p(d.getMinutes())}:${p(d.getSeconds())} ${sa}`;
};

export const ngayIn = (v: string | Date | null | undefined) => {
  if (!v) return "";
  const d = typeof v === "string" ? new Date(v) : v;
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
};

// CSS bê từ PRINT_CSS của Hoa_Sang, thêm phần vá lỗi phân trang mà bản gốc không có.
export const CSS_IN = `
  .pxk { font-family: "Times New Roman", serif; color: #000; padding: 12px 16px; font-size: 13px; }
  .pxk + .pxk { page-break-before: always; }
  .pxk__top { width: 100%; border-collapse: collapse; margin-bottom: 4px; }
  .pxk__top td { padding: 1px 0; vertical-align: top; }
  .pxk__top-right { text-align: right; white-space: nowrap; }
  .pxk__title { text-align: center; font-size: 22px; font-weight: 700; margin: 14px 0 4px; letter-spacing: 0.5px; }
  .pxk__subtitle { text-align: center; margin-bottom: 10px; font-size: 13px; }
  .pxk__info { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
  .pxk__info td { padding: 2px 4px; vertical-align: top; }
  .pxk__lbl { font-weight: 700; width: 160px; white-space: nowrap; }
  /* Dòng thông tin một hàng (phiếu gói dùng, thay cho bảng nhãn-giá trị) */
  .pxk__info-line { margin: 4px 0 8px; }
  .pxk__info-line .pxk__lbl { width: auto; display: inline; }
  .pxk__items { width: 100%; border-collapse: collapse; }
  .pxk__items th, .pxk__items td { border: 1px solid #000; padding: 4px 6px; vertical-align: middle; }
  .pxk__items th { font-weight: 700; text-align: center; background: #f0f0f0; height: 28px; }
  .pxk__items td.c { text-align: center; }
  .pxk__items td.r { text-align: right; }
  .pxk__items td.sl { text-align: right; font-weight: 700; font-size: 15px; }
  .pxk__total td { font-weight: 700; height: 22px; }
  .pxk__sigs { width: 100%; border-collapse: collapse; margin-top: 14px; }
  .pxk__sigs th { font-weight: 700; text-align: center; padding: 6px 4px; }
  .pxk__sigs td { text-align: center; padding: 2px 4px; }
  .pxk__sigs-space td { height: 50px; }
  .pxk__footer { margin-top: 16px; text-align: center; font-style: italic; font-size: 12px; }
  .pxk__tick { width: 70px; }
  /* Chênh lệch ÂM = đang bán DƯỚI giá niêm yết. In đậm cho đập vào mắt; KHÔNG dùng
     màu đỏ vì phần lớn máy in ở đây in đen trắng, màu thành xám nhạt càng khó thấy. */
  .pxk__am { font-weight: 700; }
  .pxk__h2 { font-size: 14px; font-weight: 700; margin: 14px 0 4px; }

  /* ---- Vá phân trang (bản Hoa_Sang thiếu, nên tờ in bị tách rời khối) ---- */
  /* Dòng hàng không được cắt ngang giữa hai trang */
  .pxk__items tr { page-break-inside: avoid; }
  /* Nhiều trang thì lặp lại dòng tiêu đề bảng, không thì trang 2 mất tên cột */
  .pxk__items thead { display: table-header-group; }
  /* Dòng TỔNG và bảng chữ ký phải đi liền với bảng hàng — trước đây chúng bị
     đẩy sang trang 2 trơ trọi, nhìn như tờ phiếu bị mất phần cuối */
  .pxk__total, .pxk__sigs, .pxk__tong-tien { page-break-inside: avoid; }
  .pxk__tong-tien { margin-top: 6px; }
  .pxk__tong-tien div { text-align: right; }
`;

/**
 * Dựng iframe ẩn, nạp HTML vào rồi gọi in luôn.
 * @param tieuDe tên hiện trên tab / tên file khi "in ra PDF"
 * @param than   phần thân tờ giấy — PHẢI tự bọc trong <div class="pxk">
 * @param kho    khổ giấy, mặc định A4 dọc như Hoa_Sang
 */
export function inGiay(tieuDe: string, than: string, kho = "A4") {
  const frame = document.createElement("iframe");
  // Ẩn hẳn nhưng KHÔNG dùng display:none — Chrome không in được iframe display:none
  frame.style.position = "fixed";
  frame.style.right = "0";
  frame.style.bottom = "0";
  frame.style.width = "0";
  frame.style.height = "0";
  frame.style.border = "0";
  document.body.appendChild(frame);

  const doc = frame.contentDocument ?? frame.contentWindow?.document;
  if (!doc) { frame.remove(); return; }
  doc.open();
  // margin:12mm và KHÔNG có header/footer của trình duyệt — người dùng vẫn phải tắt
  // "Headers and footers" trong hộp thoại in nếu không muốn thấy URL/giờ của Chrome,
  // CSS không tắt được phần đó.
  doc.write(`<!doctype html><html><head><meta charset="utf-8">
    <title>${esc(tieuDe)}</title>
    <style>@page{size:${kho};margin:12mm}
    html,body{margin:0;padding:0}
    ${CSS_IN}</style>
    </head><body>${than}</body></html>`);
  doc.close();

  const win = frame.contentWindow;
  if (!win) { frame.remove(); return; }
  win.focus();
  // Chờ một nhịp cho trình duyệt dựng xong layout, không thì in ra trang trắng.
  // Dọn iframe sau khi hộp thoại in đã đóng — xóa sớm là lệnh in mất nội dung.
  setTimeout(() => {
    win.print();
    setTimeout(() => frame.remove(), 500);
  }, 250);
}

// ============================ KHỐI DÙNG CHUNG CHO MỌI MẪU ============================

/** Khối đầu trang: tên đơn vị + số trang + người giao hàng (kiểu Hoa_Sang). */
export function khoiDau(tenDonVi: string, phai1 = "Trang: 1", phai2 = "") {
  return `<table class="pxk__top"><tbody>
    <tr><td><strong>${esc(tenDonVi)}</strong></td>
        <td class="pxk__top-right">${esc(phai1)}</td></tr>
    <tr><td></td><td class="pxk__top-right">${esc(phai2)}</td></tr>
  </tbody></table>`;
}

/** Bảng 4 ô chữ ký. Truyền đúng 4 nhãn theo loại phiếu. */
export function khoiChuKy(nhan: string[], ten: (string | null | undefined)[] = []) {
  return `<table class="pxk__sigs">
    <thead><tr>${nhan.map((n) => `<th>${esc(n)}</th>`).join("")}</tr></thead>
    <tbody>
      <tr>${nhan.map(() => `<td>(Ký , Họ tên)</td>`).join("")}</tr>
      <tr class="pxk__sigs-space">${nhan.map((_, i) =>
        `<td>${esc(ten[i] ?? "")}</td>`).join("")}</tr>
    </tbody></table>`;
}

/** Chân trang: giờ in + địa chỉ đơn vị. */
export function khoiChan(diaChi = "") {
  return `<div class="pxk__footer">Giờ in ${esc(gioIn())}${diaChi ? "    " + esc(diaChi) : ""}</div>`;
}
