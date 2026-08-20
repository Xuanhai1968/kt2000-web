
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
 * @param le     lề trang. Mặc định 12mm cho mẫu A4 dọc sẵn có.
 *               Mẫu hai liên (noibo/usa_meva/mauInHaiLien.ts) tự kẻ khung và tự chừa lề
 *               trong thân nên truyền "0" — để 12mm thì hai liên bị bóp lại, tràn cột.
 *               PHẢI là tham số chứ không sửa cứng: @page của hai <style> khác nhau
 *               HỢP NHẤT chứ không đè nhau, nên mẫu kia không tự ghi đè được từ ngoài.
 */
export function inGiay(tieuDe: string, than: string, kho = "A4", le = "12mm") {
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
    <style>@page{size:${kho};margin:${le}}
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

/**
 * XEM TRƯỚC trong cửa sổ mới — KHÔNG bung hộp thoại in.
 *
 * Khác inGiay() ở chỗ đó: inGiay dựng iframe ẩn rồi gọi print() ngay, hợp cho tờ giấy
 * đã chốt. Còn bản xem trước là để ĐỌC và ĐỐI CHIẾU trước khi quyết định in, nên phải
 * hiện ra màn hình; ép hộp thoại in lên là bắt người dùng bấm Hủy mỗi lần chỉ muốn nhìn.
 *
 * Nút "In" nằm ngay trong trang xem trước, và nó tự ẩn khi in (@media print).
 */
export function xemTruocGiay(tieuDe: string, than: string, kho = "A4", le = "12mm") {
  const win = window.open("", "_blank");
  // Trình duyệt chặn cửa sổ bật lên thì báo cho biết, đừng im lặng không làm gì —
  // người dùng bấm nút mà không thấy phản ứng sẽ tưởng chức năng hỏng.
  if (!win) {
    alert("Trình duyệt đang chặn cửa sổ bật lên.\n"
        + "Cho phép pop-up với trang này rồi bấm lại.");
    return;
  }
  win.document.open();
  win.document.write(`<!doctype html><html><head><meta charset="utf-8">
    <title>${esc(tieuDe)}</title>
    <style>@page{size:${kho};margin:${le}}
    html,body{margin:0;padding:0;background:#f1f5f9}
    ${CSS_IN}
    /* Khung giấy giả lập trên nền xám để thấy rõ mép trang khi xem trên màn hình */
    .xt__giay{background:#fff;max-width:210mm;margin:14px auto;padding:12mm;
              box-shadow:0 2px 12px rgba(15,23,42,.15)}
    .xt__thanh{position:sticky;top:0;z-index:9;display:flex;gap:8px;align-items:center;
               background:#0f172a;color:#fff;padding:8px 14px;font:600 13px/1.4 system-ui}
    .xt__thanh button{font:600 13px/1 system-ui;padding:7px 14px;border:0;border-radius:6px;
                      background:#2563eb;color:#fff;cursor:pointer}
    .xt__thanh button:hover{background:#1d4ed8}
    .xt__nhan{margin-left:auto;font-weight:400;opacity:.8}
    @media print{
      html,body{background:#fff}
      .xt__thanh{display:none}
      .xt__giay{max-width:none;margin:0;padding:0;box-shadow:none}
    }</style>
    </head><body>
      <div class="xt__thanh">
        <button onclick="window.print()">In tờ này</button>
        <span class="xt__nhan">${esc(tieuDe)}</span>
      </div>
      <div class="xt__giay">${than}</div>
    </body></html>`);
  win.document.close();
  win.focus();
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
