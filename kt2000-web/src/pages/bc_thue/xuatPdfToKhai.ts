import jsPDF from "jspdf";
import html2canvas from "html2canvas";

// ============ XUẤT TỜ KHAI RA FILE PDF ============
//
// Chụp chính khối .to-khai đang hiển thị rồi ghép vào trang A4 — bản PDF vì thế
// giống hệt thứ người dùng vừa xem, không phải dựng lại bố cục lần hai rồi lệch nhau.
//
// Chạy TẠI TRÌNH DUYỆT (chốt với Trường 13/08): không phải thêm thư viện PDF vào
// server, không phải cài trình duyệt ngầm lên máy chủ.
//
// ĐÁNH ĐỔI đã biết: bản ra là ẢNH nên không bôi đen chọn chữ được và file nặng hơn
// PDF chữ thật. Bù lại chữ tiếng Việt luôn đúng dấu — html2canvas vẽ lại đúng những
// gì trình duyệt đã dựng, không phụ thuộc font nhúng trong PDF.

// A4 dọc, đơn vị mm
const A4_RONG = 210;
const A4_CAO = 297;
const LE = 10;

// Bề rộng chụp CỐ ĐỊNH, khớp .tk-trang trong bang-to-khai.css. Ép cứng để bản PDF
// luôn giống nhau bất kể cửa sổ trình duyệt đang rộng hay hẹp — không có bước này
// thì mở modal ở màn hình nhỏ sẽ ra tờ khai bị bóp, chữ chen chúc.
const RONG_CHUP = 780;

/** Chụp một khối DOM thành ảnh nét (tỷ lệ 2x cho khỏi rỗ khi in). */
async function chupKhoi(el: HTMLElement): Promise<HTMLCanvasElement> {
  return html2canvas(el, {
    scale: 2,
    useCORS: true,
    // Nền TRẮNG tường minh: khối nằm trong modal có nền riêng, để trong suốt thì
    // ảnh ra nền đen ở một số trình duyệt.
    backgroundColor: "#ffffff",
    logging: false,
    width: RONG_CHUP,
    windowWidth: RONG_CHUP,
    // Bỏ qua phần chỉ dành cho màn hình (cảnh báo, chú thích nguồn ct22) — cùng
    // quy ước với @media print trong bang-to-khai.css.
    ignoreElements: (e) => e.classList?.contains("khong-in"),
  });
}

/** Ghép một canvas vào tài liệu PDF, tự cắt trang khi dài quá một tờ A4. */
function ghepVaoPdf(pdf: jsPDF, canvas: HTMLCanvasElement, trangDau: boolean) {
  const rongMm = A4_RONG - LE * 2;
  // Giữ đúng tỷ lệ khung ảnh để chữ không bị kéo giãn
  const caoMm = (canvas.height * rongMm) / canvas.width;
  const caoTrang = A4_CAO - LE * 2;

  if (caoMm <= caoTrang) {
    if (!trangDau) pdf.addPage();
    pdf.addImage(canvas.toDataURL("image/jpeg", 0.92), "JPEG",
                 LE, LE, rongMm, caoMm);
    return;
  }

  // Khối cao hơn một tờ A4: CẮT ẢNH THÀNH TỪNG MẢNH RỜI, mỗi mảnh một trang.
  //
  // KHÔNG đặt cùng một ảnh ở nhiều trang rồi dịch tọa độ lên (cách cũ): jsPDF vẫn
  // vẽ trọn ảnh chứ không xén theo mép trang, nên phần thừa TRÀN XUỐNG trang sau và
  // nội dung hiện lại hai lần — đúng lỗi lặp dòng [41]/[42]/[43] Trường gặp 13/08.
  //
  // Cắt bằng canvas phụ thì mỗi trang chỉ chứa đúng phần của nó, không thể chồng lấn.
  const pxMoiTrang = Math.floor((caoTrang * canvas.width) / rongMm);
  let dauNguon = 0;
  let dau = trangDau;

  while (dauNguon < canvas.height) {
    const caoMieng = Math.min(pxMoiTrang, canvas.height - dauNguon);

    const mieng = document.createElement("canvas");
    mieng.width = canvas.width;
    mieng.height = caoMieng;

    const ctx = mieng.getContext("2d");
    if (!ctx) break;
    // Nền trắng trước khi vẽ: JPEG không có kênh trong suốt, thiếu bước này thì
    // vùng trống thành đen.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, mieng.width, mieng.height);
    ctx.drawImage(canvas, 0, dauNguon, canvas.width, caoMieng,
                          0, 0, canvas.width, caoMieng);

    if (!dau) pdf.addPage();
    dau = false;
    pdf.addImage(mieng.toDataURL("image/jpeg", 0.92), "JPEG",
                 LE, LE, rongMm, (caoMieng * rongMm) / canvas.width);

    dauNguon += caoMieng;
  }
}

/**
 * Xuất khối tờ khai đang hiển thị thành file PDF và tải về máy.
 * @param goc phần tử chứa tờ khai (khối .to-khai)
 * @param tenFile tên file tải về, không cần đuôi .pdf
 */
export async function xuatPdfToKhai(goc: HTMLElement, tenFile: string) {
  const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });

  // Khối tờ khai nằm trong thân modal có overflow:auto — html2canvas chỉ chụp được
  // phần đang lọt trong khung cuộn, nên tờ khai dài sẽ bị cắt cụt. Mở tạm overflow
  // của MỌI khối cha đang cắt, chụp xong trả lại nguyên trạng.
  const daSua: { el: HTMLElement; ovY: string; ovX: string; cao: string }[] = [];
  for (let p = goc.parentElement; p; p = p.parentElement) {
    const s = getComputedStyle(p);
    if (s.overflowY === "visible" && s.overflowX === "visible") continue;
    daSua.push({
      el: p,
      ovY: p.style.overflowY, ovX: p.style.overflowX, cao: p.style.height,
    });
    p.style.overflowY = "visible";
    p.style.overflowX = "visible";
    p.style.height = "auto";
  }

  try {
    // Mỗi .tk-trang là MỘT tờ của bản gốc (tờ khai chính, phụ lục NQ142). Chụp riêng
    // từng tờ rồi ghép, thay vì chụp cả khối: giữ đúng ranh giới trang như bản in
    // giấy, phụ lục luôn bắt đầu ở tờ mới chứ không dính đuôi tờ trước.
    const cacTrang = Array.from(goc.querySelectorAll<HTMLElement>(".tk-trang"));
    const ds = cacTrang.length > 0 ? cacTrang : [goc];

    for (let i = 0; i < ds.length; i++) {
      const canvas = await chupKhoi(ds[i]);
      ghepVaoPdf(pdf, canvas, i === 0);
    }

    pdf.save(tenFile.endsWith(".pdf") ? tenFile : `${tenFile}.pdf`);
  } finally {
    // Trả lại nguyên trạng kể cả khi chụp lỗi — không thì modal mất thanh cuộn và
    // người dùng kẹt luôn không xem tiếp được.
    for (const { el, ovY, ovX, cao } of daSua) {
      el.style.overflowY = ovY;
      el.style.overflowX = ovX;
      el.style.height = cao;
    }
  }
}
