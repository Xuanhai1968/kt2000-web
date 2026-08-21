import jsPDF from "jspdf";
import html2canvas from "html2canvas";

const A4_RONG = 210;
const A4_CAO = 297;
const LE = 10;
const RONG_CHUP = 780;

async function chupKhoi(el: HTMLElement): Promise<HTMLCanvasElement> {
  return html2canvas(el, {
    scale: 2,
    useCORS: true,
    backgroundColor: "#ffffff",
    logging: false,
    width: RONG_CHUP,
    windowWidth: RONG_CHUP,
    ignoreElements: (e) => e.classList?.contains("khong-in"),
  });
}

function ghepVaoPdf(pdf: jsPDF, canvas: HTMLCanvasElement, trangDau: boolean) {
  const rongMm = A4_RONG - LE * 2;
  const caoMm = (canvas.height * rongMm) / canvas.width;
  const caoTrang = A4_CAO - LE * 2;

  if (caoMm <= caoTrang) {
    if (!trangDau) pdf.addPage();
    pdf.addImage(canvas.toDataURL("image/jpeg", 0.92), "JPEG",
                 LE, LE, rongMm, caoMm);
    return;
  }

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
    const cacTrang = Array.from(goc.querySelectorAll<HTMLElement>(".tk-trang"));
    const ds = cacTrang.length > 0 ? cacTrang : [goc];

    for (let i = 0; i < ds.length; i++) {
      const canvas = await chupKhoi(ds[i]);
      ghepVaoPdf(pdf, canvas, i === 0);
    }

    pdf.save(tenFile.endsWith(".pdf") ? tenFile : `${tenFile}.pdf`);
  } finally {
    for (const { el, ovY, ovX, cao } of daSua) {
      el.style.overflowY = ovY;
      el.style.overflowX = ovX;
      el.style.height = cao;
    }
  }
}
