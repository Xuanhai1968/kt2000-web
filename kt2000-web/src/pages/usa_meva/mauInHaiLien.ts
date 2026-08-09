// MẪU IN HAI LIÊN — bê từ USA_Meva (components/PrintInvoice.tsx, 698 dòng).
//
// KHÁC HẲN mẫu in sẵn có (../mauInPhieu.ts): bản kia in MỘT liên trên A4 DỌC.
// Bản này in HAI LIÊN CẠNH NHAU trên A4 NGANG, cắt đôi theo đường đứt nét ở giữa:
//
//   ┌───────────────────────┬┄┄┬───────────────────────┐
//   │      ĐƠN HÀNG         ┊  ┊   PHIẾU XUẤT KHO      │
//   │  (liên có TIỀN)       ┊  ┊  (liên KHÔNG có tiền) │
//   │  - giá, thành tiền    ┊  ┊  - ô "Ký nhận" từng   │
//   │  - bảng công nợ I→VI  ┊  ┊    dòng cho thủ kho   │
//   │  - đọc tiền bằng chữ  ┊  ┊  - tổng SL theo ĐVT   │
//   │                       ┊  ┊  - 4 ô chữ ký + số TK │
//   └───────────────────────┴┄┄┴───────────────────────┘
//
// Vì sao hai liên khác nội dung: liên trái đưa KHÁCH (họ cần biết tiền), liên phải
// đưa THỦ KHO/NGƯỜI GIAO (họ chỉ cần đếm hàng và ký nhận — không được thấy giá vốn,
// và ô ký từng dòng để đối chiếu lúc bốc hàng lên xe).
//
// DÙNG LẠI từ ../inGiay.ts (không viết lại): esc() chống XSS, inGiay() dựng iframe ẩn,
// soTienIn(), gioIn(). Riêng CSS phải viết mới vì khổ giấy và bố cục khác hẳn.
//
// esc() BẮT BUỘC ở mọi chỗ chèn dữ liệu người dùng: tên hàng/tên khách do họ tự gõ,
// mà bản NB sắp phơi ra internet (AD-NB-06). Đây là document.write, React không rào hộ.

import { esc, soTienIn, gioIn, ngayIn, inGiay } from "../inGiay";
import type { DonNb, DonNbLine } from "../../api";

// ============================ ĐỌC TIỀN BẰNG CHỮ ============================
// Bê nguyên thuật toán của bản gốc (numberToVietnamese). Dòng VI của bảng công nợ đọc
// số thành chữ — tờ giấy có chữ ký nên con số phải có bản chữ đi kèm để khỏi sửa được.
const CHU = ["", "một", "hai", "ba", "bốn", "năm", "sáu", "bảy", "tám", "chín"];

function docTram(n: number): string {
  if (n === 0) return "";
  const tr = Math.floor(n / 100), ch = Math.floor((n % 100) / 10), dv = n % 10;
  let s = tr > 0 ? CHU[tr] + " trăm" : "";
  if (ch === 0 && dv > 0 && tr > 0) s += " lẻ " + CHU[dv];
  else if (ch === 1) s += (tr > 0 ? " " : "") + "mười" + (dv === 5 ? " lăm" : dv > 0 ? " " + CHU[dv] : "");
  else if (ch > 1) s += (tr > 0 ? " " : "") + CHU[ch] + " mươi"
                      + (dv === 1 ? " mốt" : dv === 5 ? " lăm" : dv > 0 ? " " + CHU[dv] : "");
  else if (tr === 0 && dv > 0) s = CHU[dv];
  return s.trim();
}

function docNhom(n: number): string {
  if (n === 0) return "";
  if (n >= 1_000_000_000_000) {
    const t = Math.floor(n / 1_000_000_000_000), r = n % 1_000_000_000_000;
    return docNhom(t) + " nghìn tỷ" + (r > 0 ? " " + docNhom(r) : "");
  }
  if (n >= 1_000_000_000) {
    const t = Math.floor(n / 1_000_000_000), r = n % 1_000_000_000;
    return docNhom(t) + " tỷ" + (r > 0 ? " " + docNhom(r) : "");
  }
  if (n >= 1_000_000) {
    const t = Math.floor(n / 1_000_000), r = n % 1_000_000;
    return docNhom(t) + " triệu" + (r > 0 ? " " + docNhom(r) : "");
  }
  if (n >= 1_000) {
    const t = Math.floor(n / 1_000), r = n % 1_000;
    // "một nghìn" chứ không "một nghìn" -> giữ nguyên cách đọc của bản gốc.
    // r < 100 phải chèn "không trăm" để 1_005 đọc là "một nghìn không trăm lẻ năm".
    return (t === 1 ? "một nghìn" : docNhom(t) + " nghìn")
         + (r > 0 ? (r < 100 ? " không trăm " : " ") + docTram(r) : "");
  }
  return docTram(n);
}

export function tienBangChu(n: number): string {
  const so = Math.floor(Math.abs(Number(n) || 0));
  if (so === 0) return "Không đồng";
  const s = docNhom(so).trim();
  return (n < 0 ? "Âm " : "") + s.charAt(0).toUpperCase() + s.slice(1) + " đồng";
}

// ============================ CSS ============================
// Viết mới hoàn toàn: bản ../inGiay.ts CSS_IN dựng cho A4 dọc một liên, không dùng lại
// được. Tiền tố .hl__ (hai liên) để không đụng .pxk__ của mẫu cũ khi hai mẫu cùng nằm
// trong một tài liệu in.
//
// Cỡ chữ 7.5pt và Times New Roman giữ đúng bản gốc: hai liên phải lọt trong 287mm,
// to hơn là tràn cột.
const CSS_HAI_LIEN = `
  @page { size: A4 landscape; margin: 0; }
  html, body { margin: 0; padding: 0; background: #fff;
               font-family: "Times New Roman", Times, serif; }
  body { width: 297mm; padding: 5mm; }

  /* Một tờ = một đơn hàng = hai liên nằm ngang */
  .hl { display: flex; flex-direction: row; gap: 3mm; width: 287mm; }
  /* Mỗi đơn một trang. Không cho cắt ngang giữa hai trang. */
  .hl + .hl { page-break-before: always; }
  .hl { page-break-inside: avoid; }

  .hl__lien { flex: 1; min-width: 0; border: 1px solid #000;
              padding: 2.5mm 3.5mm; display: flex; flex-direction: column;
              font-size: 7.5pt; line-height: 1.25; }

  .hl__top { display: flex; justify-content: space-between; align-items: flex-start;
             margin-bottom: 1mm; }
  .hl__cty { font-weight: 700; font-size: 8pt; text-transform: uppercase; }
  .hl__top-phai { text-align: right; white-space: nowrap; font-size: 7pt; }
  .hl__nv-o { display: inline-block; min-width: 22mm; border-bottom: 1px solid #000; }

  .hl__tieu-de { text-align: center; font-size: 12pt; font-weight: 700;
                 margin: 1mm 0 0.5mm; letter-spacing: 0.3px; }
  .hl__so-don { text-align: center; font-weight: 700; margin-bottom: 0.5mm; }
  .hl__meta { display: flex; justify-content: space-between; margin-bottom: 1mm; }

  .hl__info { margin-bottom: 1mm; }
  .hl__info-dong { display: flex; gap: 1mm; }
  .hl__info-nhan { font-weight: 700; white-space: nowrap; }
  .hl__info-gt { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis;
                 white-space: nowrap; }

  .hl__bang { width: 100%; border-collapse: collapse; margin-bottom: 1mm; }
  .hl__bang th, .hl__bang td { border: 1px solid #000; padding: 0.6mm 1mm; }
  /* Nền vàng chữ đỏ giữ đúng bản gốc — người dùng nhận ra tờ giấy quen thuộc.
     print-color-adjust bắt buộc, không có thì Chrome bỏ nền khi in. */
  .hl__bang th { background: #ffff00; color: #c00000; font-weight: 700;
                 text-align: center; font-size: 7pt;
                 -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .hl__bang td.c { text-align: center; }
  .hl__bang td.r { text-align: right; }
  /* Dòng hàng không bị cắt ngang trang */
  .hl__bang tr { page-break-inside: avoid; }
  /* Tràn sang trang sau thì lặp lại tiêu đề cột, không thì trang 2 mất tên cột.
     Bản gốc THIẾU chỗ này — đơn nhiều dòng in ra trang 2 không biết cột nào là cột nào. */
  .hl__bang thead { display: table-header-group; }

  /* Ô ký nhận trên liên xuất kho phải đủ cao để ký tay */
  .hl__bang td.ky { height: 4.5mm; }

  .hl__tong { margin: 1mm 0; }
  .hl__tong-dong { display: flex; justify-content: space-between; }
  .hl__tong-dong--dam { font-weight: 700; }

  .hl__cn { width: 100%; border-collapse: collapse; margin-top: 1mm; }
  .hl__cn td { border: 1px solid #000; padding: 0.6mm 1mm; }
  .hl__cn-so { width: 6mm; text-align: center; font-weight: 700; }
  .hl__cn-gt { width: 26mm; text-align: right; }
  .hl__cn-dam td { font-weight: 700; }
  .hl__cn-vang td { background: #ffff00;
                    -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .hl__cn-chu { white-space: normal; font-style: italic; }

  .hl__sl { margin: 1mm 0; }
  .hl__sl-nhan { font-weight: 700; }
  .hl__sl-vien { display: inline-block; border: 1px solid #000; padding: 0 1.5mm;
                 margin: 0 1mm; font-weight: 700; }

  .hl__ky { display: flex; margin-top: 2mm; }
  .hl__ky-o { flex: 1; text-align: center; }
  .hl__ky-o strong { display: block; font-size: 7pt; }
  .hl__ky-o em { display: block; font-size: 6.5pt; }
  .hl__ky-cho { height: 11mm; }

  .hl__bank { width: 100%; border-collapse: collapse; margin-top: 1mm; font-size: 6.8pt; }
  .hl__bank td { border: 1px solid #000; padding: 0.4mm 1mm; }
  .hl__bank-nhan { width: 24mm; }

  /* Đẩy chân trang xuống đáy liên để hai liên bằng nhau */
  .hl__chan { margin-top: auto; padding-top: 1mm; font-style: italic; font-size: 6.5pt; }
`;

// ============================ THAM SỐ MẪU IN ============================
export interface ThongTinInHaiLien {
  /** Tên công ty in ở góc trái. Thiếu thì lấy tên đơn vị đang đăng nhập. */
  tenCty?: string;
  /** Nhãn hàng dự phòng, chỉ dùng khi ĐƠN không mang tenNhan. Ưu tiên nhãn của đơn:
   *  in nhiều đơn một lượt thì mỗi đơn một khách, mỗi khách một nhãn — truyền chung
   *  một giá trị từ ngoài là mọi tờ giấy mang cùng một nhãn, sai hết trừ tờ đầu. */
  nhanHang?: string;
  /** Tên gọi tắt của khách, in trước tên đầy đủ ở dòng "Tên Đại lý". */
  tenTatKh?: string;
  diaChiGiao?: string;
  dienThoai?: string;
  taiKhoan?: { ten: string; so: string; nganHang: string }[];
}

// ============================ DỰNG MỘT LIÊN ============================
// coTien = true  -> liên ĐƠN HÀNG (khách giữ): có giá, thành tiền, bảng công nợ
// coTien = false -> liên PHIẾU XUẤT KHO (kho giữ): có ô ký nhận, tổng SL theo ĐVT
function dungLien(d: DonNb, tt: ThongTinInHaiLien, tieuDe: string,
                  trang: number, coTien: boolean): string {
  const dong = d.lines ?? [];
  const tong = Number(d.tongTien) || 0;
  const ngay = ngayIn(d.ngay);

  // ---- Đầu trang ----
  const dau = `<div class="hl__top">
      <div class="hl__cty">${esc(tt.tenCty ?? "")}</div>
      <div class="hl__top-phai">
        <div>Trang: ${trang}</div>
        ${!coTien
          ? `<div>Nhân viên giao hàng: <span class="hl__nv-o">${esc(d.tenNvvc ?? "")}</span></div>`
          : ""}
      </div>
    </div>`;

  // ---- Thông tin khách ----
  const tenDayDu = `${tt.tenTatKh ? esc(tt.tenTatKh) + " - " : ""}${esc(d.tenKh ?? "")}`;
  const info = `<div class="hl__info">
      <div class="hl__info-dong"><span class="hl__info-nhan">Tên Đại lý :</span>
        <span class="hl__info-gt">${tenDayDu}</span></div>
      <div class="hl__info-dong"><span class="hl__info-nhan">Địa chỉ cửa hàng :</span>
        <span class="hl__info-gt">${esc(d.diaChi ?? "")}</span></div>
      <div class="hl__info-dong"><span class="hl__info-nhan">Địa chỉ gửi hàng :</span>
        <span class="hl__info-gt">${esc(d.diaChiGiao || tt.diaChiGiao || d.diaChi || "")}</span></div>
      <div class="hl__info-dong"><span class="hl__info-nhan">Nhãn hàng :</span>
        <span class="hl__info-gt">${esc(d.tenNhan || tt.nhanHang || "")}</span>
        <span class="hl__info-nhan">SĐT :</span>
        <span class="hl__info-gt">${esc(tt.dienThoai ?? "")}</span></div>
    </div>`;

  // ---- Bảng hàng ----
  // Cột "Mã màu/base" nay lấy MÃ MÀU THẬT của dòng hàng (DM_MAU). Trước đây chỗ này in
  // nhầm ĐVT — bản gốc USA_Meva in colorCode, không phải đơn vị tính.
  //
  // Cột "Tính thêm tinh màu" CHỈ có trên liên CÓ TIỀN, đúng bản gốc (PrintInvoice.tsx:501
  // — cả tint lẫn giá đều nằm sau `showMoney &&`). Liên xuất kho không được thấy tiền:
  // thủ kho chỉ đếm hàng và ký nhận.
  const cotTieuDe = coTien
    ? `<th style="width:6mm">STT</th><th>Tên sản phẩm</th>
       <th style="width:12mm">Quy cách</th><th style="width:14mm">Mã màu/base</th>
       <th style="width:14mm">Tính thêm<br/>tinh màu</th>
       <th style="width:16mm">Giá net giao<br/>tại nhà máy</th>
       <th style="width:11mm">Số<br/>lượng</th><th style="width:19mm">Thành Tiền</th>`
    : `<th style="width:6mm">STT</th><th>Tên sản phẩm</th>
       <th style="width:12mm">Quy cách</th><th style="width:14mm">Mã màu/base</th>
       <th style="width:11mm">Số<br/>lượng</th><th style="width:22mm">Ký nhận</th>`;

  const hangDong = dong.map((l: DonNbLine, i: number) => {
    const sl = Number(l.soLuong) || 0;
    const gia = Number(l.donGia) || 0;
    const tinh = Number(l.tienTinhMau) || 0;
    // Thành tiền = sl × giá + tiền tinh màu (KHÔNG nhân số lượng) — đúng công thức bản
    // gốc (PrintInvoice.tsx:522) và backend (script 019).
    const tt2 = sl * gia + tinh;
    return coTien
      ? `<tr><td class="c">${i + 1}</td><td>${esc(l.tenHang ?? "")}</td>
         <td class="c">${esc(l.quyCach ?? "")}</td><td class="c">${esc(l.maMau ?? "")}</td>
         <td class="r">${tinh ? esc(soTienIn(tinh)) : ""}</td>
         <td class="r">${gia ? esc(soTienIn(gia)) : ""}</td>
         <td class="c">${sl || ""}</td>
         <td class="r">${tt2 ? esc(soTienIn(tt2)) : ""}</td></tr>`
      : `<tr><td class="c">${i + 1}</td><td>${esc(l.tenHang ?? "")}</td>
         <td class="c">${esc(l.quyCach ?? "")}</td><td class="c">${esc(l.maMau ?? "")}</td>
         <td class="c">${sl || ""}</td><td class="ky"></td></tr>`;
  }).join("");

  const bang = `<table class="hl__bang">
      <thead><tr>${cotTieuDe}</tr></thead>
      <tbody>${hangDong}</tbody></table>`;

  // ---- Phần cuối: khác hẳn giữa hai liên ----
  let cuoi: string;
  if (coTien) {
    // Bảng công nợ I→VI. Cột II/III/IV để TRỐNG có chủ ý — số dư công nợ do người bán
    // điền tay lúc giao hàng (engine công nợ NB chưa làm tới, SPEC mục 8 còn nợ).
    cuoi = `
      <div class="hl__tong">
        <div class="hl__tong-dong"><span>Tổng tiền hàng :</span>
          <span>${esc(soTienIn(Number(d.tienHang) || 0))}</span></div>
        <div class="hl__tong-dong"><span>Thuế GTGT :</span>
          <span>${esc(soTienIn(Number(d.tienVat) || 0))}</span></div>
        <div class="hl__tong-dong hl__tong-dong--dam"><span>Tổng tiền thanh toán :</span>
          <span>${esc(soTienIn(tong))}</span></div>
      </div>
      <table class="hl__cn"><tbody>
        <tr class="hl__cn-dam"><td class="hl__cn-so">I</td>
          <td>Tổng đơn hàng phát sinh &nbsp; ${esc(ngay)}</td>
          <td class="hl__cn-gt">${esc(soTienIn(tong))}</td></tr>
        <tr><td class="hl__cn-so">II</td><td>Công nợ tính hết</td>
          <td class="hl__cn-gt"></td></tr>
        <tr><td class="hl__cn-so">III</td><td>Tổng công nợ cả đơn hàng phát sinh</td>
          <td class="hl__cn-gt"></td></tr>
        <tr><td class="hl__cn-so">IV</td><td>Thanh toán</td>
          <td class="hl__cn-gt"></td></tr>
        <tr class="hl__cn-dam hl__cn-vang"><td class="hl__cn-so">V</td>
          <td>Tổng công nợ đến hết &nbsp; ${esc(ngay)}</td>
          <td class="hl__cn-gt">${esc(soTienIn(tong))}</td></tr>
        <tr><td class="hl__cn-so">VI</td><td>Bằng chữ</td>
          <td class="hl__cn-gt hl__cn-chu">${esc(tienBangChu(tong))}</td></tr>
      </tbody></table>`;
  } else {
    // Tổng số lượng gộp theo ĐVT — thủ kho đếm "20 thùng, 5 lon" chứ không đếm 25 dòng.
    const theoDvt = new Map<string, number>();
    let tongSl = 0;
    for (const l of dong) {
      const sl = Number(l.soLuong) || 0;
      if (!sl) continue;
      tongSl += sl;
      const dv = (l.dvt ?? "").trim();
      if (dv) theoDvt.set(dv, (theoDvt.get(dv) ?? 0) + sl);
    }
    const mucSl = Array.from(theoDvt.entries())
      .map(([dv, sl]) => `<span class="hl__sl-vien">${sl} ${esc(dv)}</span>`).join("");

    const bank = (tt.taiKhoan?.length ?? 0) > 0
      ? `<table class="hl__bank"><tbody>${tt.taiKhoan!.map((tk) => `
          <tr><td class="hl__bank-nhan">Tên tài khoản</td><td><strong>${esc(tk.ten)}</strong></td></tr>
          <tr><td class="hl__bank-nhan">Số tài khoản</td><td><strong>${esc(tk.so)}</strong></td></tr>
          <tr><td class="hl__bank-nhan">Ngân hàng</td><td><strong>${esc(tk.nganHang)}</strong></td></tr>`
        ).join("")}</tbody></table>`
      : "";

    cuoi = `
      <div class="hl__sl"><span class="hl__sl-nhan">TỔNG :</span>
        <span class="hl__sl-vien">${tongSl} đơn vị</span>${mucSl}</div>
      <div class="hl__ky">
        <div class="hl__ky-o"><strong>Khách hàng ký nhận</strong>
          <em>(Đã nhận đủ hàng và khuyến mại)</em><div class="hl__ky-cho"></div></div>
        <div class="hl__ky-o"><strong>NV Giao hàng</strong>
          <em>(Ký, Họ tên)</em><div class="hl__ky-cho"></div></div>
        <div class="hl__ky-o"><strong>Kế toán BH</strong>
          <em>(Ký, Họ tên)</em><div class="hl__ky-cho"></div></div>
        <div class="hl__ky-o"><strong>Người nhận hàng</strong>
          <em>(Ký, Họ tên)</em><div class="hl__ky-cho"></div></div>
      </div>
      ${bank}`;
  }

  return `<div class="hl__lien">
      ${dau}
      <div class="hl__tieu-de">${esc(tieuDe)}</div>
      <div class="hl__so-don">Đơn hàng số: ${esc(d.maHd ?? "")}</div>
      <div class="hl__meta"><span>Ngày tháng: <strong>${esc(ngay)}</strong></span>
        <span>${esc(d.tenNvkd ? "NVKD: " + d.tenNvkd : "")}</span></div>
      ${info}
      ${bang}
      ${cuoi}
      <div class="hl__chan">Giờ in ${esc(gioIn())}</div>
    </div>`;
}

// ============================ HÀM DÙNG NGOÀI ============================
/**
 * In một hoặc nhiều đơn theo mẫu HAI LIÊN trên A4 ngang.
 * Mỗi đơn một tờ; nhiều đơn thì nhiều trang (dùng cho in cả gói hàng).
 */
export function inHaiLien(don: DonNb | DonNb[], tt: ThongTinInHaiLien = {}) {
  const ds = Array.isArray(don) ? don : [don];
  if (ds.length === 0) return;

  const than = ds.map((d) => `<div class="hl">
      ${dungLien(d, tt, "ĐƠN HÀNG", 1, true)}
      ${dungLien(d, tt, "PHIẾU XUẤT KHO", 2, false)}
    </div>`).join("");

  // Dùng lại inGiay() của ../inGiay.ts (iframe ẩn, chống popup blocker, tự dọn).
  // Lề "0" vì mẫu này tự kẻ khung và tự chừa lề bên trong — để lề mặc định 12mm thì
  // hai liên bị bóp lại và tràn cột. CSS_IN mặc định của inGiay vẫn được chèn nhưng
  // vô hại: nó chỉ nhắm tiền tố .pxk__ của mẫu A4 dọc, không đụng .hl__ ở đây.
  inGiay(
    ds.length === 1 ? `Đơn hàng ${ds[0].maHd ?? ""}` : `In ${ds.length} đơn hàng`,
    `<style>${CSS_HAI_LIEN}</style>${than}`,
    "A4 landscape",
    "0",
  );
}
