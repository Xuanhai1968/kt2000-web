// MẪU IN chuẩn cho phần nội bộ — dựng theo đúng khuôn Hoa_Sang (PHIẾU XUẤT/NHẬP KHO).
//
// Gom vào MỘT chỗ vì cùng một tờ phiếu được in từ HAI nơi: nút In trên form đang gõ, và
// nút In trên màn Danh sách phiếu. Trước đây mỗi nơi tự ghép HTML riêng — hai bản chắc
// chắn lệch nhau dần, mà tờ giấy giao cho khách thì phải giống nhau tuyệt đối.

import type { DonNb, GoiHd } from "../../api";
import {
  inGiay, xemTruocGiay, esc, soTienIn, ngayIn, khoiDau, khoiChuKy, khoiChan,
} from "../inGiay";

// Lấy phần số của mã đơn (R125 -> 125) để in "Đơn hàng số: 125 /T8-2026" kiểu Hoa_Sang
const soDon = (ma: string | null | undefined) => {
  const s = String(ma ?? "");
  const so = s.replace(/\D/g, "").replace(/^0+/, "");
  return so || s;
};

export interface ThongTinDonVi {
  ten?: string | null;
  diaChi?: string | null;
  dienThoai?: string | null;
}

/**
 * IN MỘT PHIẾU XUẤT / NHẬP.
 *
 * Cột tiền in là THÀNH TIỀN SAU THUẾ theo từng dòng — giống Hoa_Sang, vì tờ giấy này
 * đưa cho khách nên con số họ cần thấy là số phải trả, không phải số trước thuế.
 * Hàng tặng: có số lượng nhưng thành tiền 0 (khớp cách backend tính).
 */
export function inPhieuDon(don: DonNb, dv: ThongTinDonVi) {
  const laVao = don.huong === "VAO";
  const tieuDe = laVao ? "PHIẾU NHẬP KHO" : "PHIẾU XUẤT KHO";
  const nhanDoiTac = laVao ? "Người bán" : "Tên khách hàng";

  // Hàng đi RA: người của mình chở đi, khách ký nhận.
  // Hàng đi VÀO: bên bán mang tới, thủ kho MÌNH ký nhận -> đảo vai hai ô cuối.
  // Ký sai vai là tờ phiếu vô giá trị khi đối chiếu công nợ.
  const nhanKy = laVao
    ? ["Người bán giao", "NV Vận chuyển", "Kế toán", "Thủ kho nhận"]
    : ["KH ký nhận", "NV Giao hàng", "Kế toán", "Người nhận hàng"];
  const tenKy = laVao
    ? ["", don.tenNvvc, don.tenNvkd, ""]
    : ["", don.tenNvvc, don.tenNvkd, ""];

  const lines = don.lines ?? [];
  let tongSauThue = 0;
  let tongSl = 0;

  const hang = lines.map((l, i) => {
    const sl = Number(l.soLuong) || 0;
    const dg = Number(l.donGia) || 0;
    const vat = Number(l.ptVat) || 0;
    const tinh = Number(l.tienTinhMau) || 0;
    const truocThue = l.laHangTang ? 0 : sl * dg + tinh;
    const sauThue = truocThue * (1 + vat / 100);
    tongSauThue += sauThue;
    tongSl += sl;
    return `<tr>
      <td class="c"><b>${i + 1}</b></td>
      <td>${esc(l.tenHang)}${l.laHangTang ? " <i>(hàng tặng)</i>" : ""}</td>
      <td class="c">${esc(l.dvt)}</td>
      <td class="c">${esc(l.maMau)}</td>
      <td class="c">${soTienIn(sl)}</td>
      <td class="c">${soTienIn(dg)}</td>
      <td class="r">${tinh ? soTienIn(tinh) : ""}</td>
      <td class="c">${vat}</td>
      <td class="r">${soTienIn(sauThue)}</td>
      <td>${esc(l.ghiChu)}</td>
    </tr>`;
  }).join("");

  const ng = don.ngay ? new Date(don.ngay) : new Date();
  const than = `<div class="pxk">
    ${khoiDau(
      `${dv.ten ?? ""}${dv.dienThoai ? " - Tel : " + dv.dienThoai : ""}`,
      "Trang: 1",
      `Nhân viên giao hàng : ${don.tenNvvc ?? ""}`)}

    <h1 class="pxk__title">${esc(tieuDe)}</h1>
    <div class="pxk__subtitle"><strong>Đơn hàng số: ${esc(soDon(don.maHd))}
      /T${ng.getMonth() + 1}-${ng.getFullYear()}</strong></div>

    <table class="pxk__info"><tbody>
      <tr><td class="pxk__lbl">Ngày tháng :</td><td>${esc(ngayIn(don.ngay))}</td></tr>
      <tr><td class="pxk__lbl">${esc(nhanDoiTac)} :</td><td>${esc(don.tenKh)}</td></tr>
      <tr><td class="pxk__lbl">Mã số thuế :</td><td>${esc(don.mst)}</td></tr>
      <tr><td class="pxk__lbl">Địa chỉ :</td><td>${esc(don.diaChi)}</td></tr>
      <tr><td class="pxk__lbl">${laVao ? "Ngày nhập kho" : "Ngày xuất kho"} :</td>
          <td>${don.ngayNh ? esc(ngayIn(don.ngayNh))
                           : "<i>chưa giao — kho chưa bị trừ</i>"}</td></tr>
      ${don.maGoi ? `<tr><td class="pxk__lbl">Thuộc gói :</td>
                         <td>${esc(don.maGoi)}</td></tr>` : ""}
    </tbody></table>

    <table class="pxk__items">
      <colgroup>
        <col style="width:4%"/><col style="width:25%"/><col style="width:7%"/>
        <col style="width:9%"/><col style="width:8%"/><col style="width:10%"/>
        <col style="width:9%"/><col style="width:6%"/>
        <col style="width:13%"/><col style="width:9%"/>
      </colgroup>
      <thead><tr>
        <th>STT</th><th>Tên sản phẩm</th><th>ĐVT</th><th>Mã màu</th><th>SL</th>
        <th>Đơn giá</th><th>Tiền tinh màu</th>
        <th>VAT (%)</th><th>Thành tiền sau thuế</th><th>Ghi chú</th>
      </tr></thead>
      <tbody>
        ${hang}
        <tr class="pxk__total">
          <td colspan="4" class="r"><strong>TỔNG :</strong></td>
          <td class="c"><strong>${soTienIn(tongSl)}</strong></td>
          <td></td><td></td><td></td>
          <td class="r"><strong>${soTienIn(tongSauThue)}</strong></td>
          <td></td>
        </tr>
      </tbody>
    </table>

    ${khoiChuKy(nhanKy, tenKy)}
    ${khoiChan(dv.diaChi ?? "")}
  </div>`;

  inGiay(`${tieuDe} - ${don.maHd}`, than);
}

/**
 * XEM TRƯỚC HÓA ĐƠN — bản nháp để ĐỐI CHIẾU trước khi đẩy sang hóa đơn điện tử.
 *
 * Khác PHIẾU XUẤT/NHẬP KHO ở đúng một chỗ, và đó là mục đích của tờ này:
 * cột tên hàng in **ten_hd** (tên chuẩn trên hóa đơn) thay vì ten_hang (tên đánh đơn
 * mang ghi chú thực địa như "nắp trắng", "V1"). Ví dụ thật của USA_Meva:
 *
 *     ten_hang (phiếu kho)                      ten_hd (hóa đơn)
 *     Sơn lót nội V1( nắp trắng )               Sơn lót nội thất
 *     Kiềm nội cao cấp (nắp xanh)               Sơn lót kháng kiềm nội thất
 *
 * 35/50 mặt hàng có hai tên khác nhau, nên nhìn tờ này mới biết hóa đơn sắp xuất ra
 * mang tên gì. Dòng nào ten_hd trống thì lùi về ten_hang (mặt hàng chỉ có một tên) —
 * và ĐÁNH DẤU để người xem biết đó là tên chưa khai riêng, không phải tên chuẩn.
 *
 * CHƯA phải hóa đơn thật: chưa có số hóa đơn, chưa ký số, chưa gửi Viettel. Đây chỉ là
 * bản xem để soát tên hàng — nên tờ giấy ghi rõ "BẢN XEM TRƯỚC" tránh ai đó cầm nhầm
 * đi giao cho khách.
 */
export function xemTruocHoaDon(don: DonNb, dv: ThongTinDonVi) {
  const lines = don.lines ?? [];
  let tongTruocThue = 0;
  let tongVat = 0;
  // Đếm số dòng chưa khai tên hóa đơn riêng — hiện thành cảnh báo ở cuối tờ, vì đó
  // chính là thứ người dùng cần phát hiện khi soát.
  let soDongThieuTenHd = 0;

  const hang = lines.map((l, i) => {
    const sl = Number(l.soLuong) || 0;
    const dg = Number(l.donGia) || 0;
    const vat = Number(l.ptVat) || 0;
    const tinh = Number(l.tienTinhMau) || 0;
    const truocThue = l.laHangTang ? 0 : sl * dg + tinh;
    const tienVat = truocThue * (vat / 100);
    tongTruocThue += truocThue;
    tongVat += tienVat;

    // Đây là điểm cần soi: lấy ten_hd, thiếu thì lùi về ten_hang và đánh dấu.
    const coTenHd = !!(l.tenHd && l.tenHd.trim());
    if (!coTenHd) soDongThieuTenHd += 1;
    const tenIn = coTenHd ? l.tenHd : l.tenHang;

    return `<tr>
      <td class="c"><b>${i + 1}</b></td>
      <td>${esc(tenIn)}${l.laHangTang ? " <i>(hàng tặng)</i>" : ""}
        ${coTenHd ? "" : `<span class="hd__canh">(chưa khai tên HĐ)</span>`}</td>
      <td class="c">${esc(l.dvt)}</td>
      <td class="c">${soTienIn(sl)}</td>
      <td class="r">${soTienIn(dg)}</td>
      <td class="r">${soTienIn(truocThue)}</td>
      <td class="c">${vat}</td>
      <td class="r">${soTienIn(tienVat)}</td>
    </tr>`;
  }).join("");

  const ng = don.ngay ? new Date(don.ngay) : new Date();
  const than = `<div class="pxk">
    <style>
      .hd__nhan{display:inline-block;border:2px solid #b91c1c;color:#b91c1c;
        font-weight:700;letter-spacing:.08em;padding:3px 10px;border-radius:4px;
        font-size:12px;margin-bottom:6px}
      .hd__canh{color:#b45309;font-size:11px;font-style:italic;white-space:nowrap}
      .hd__doi{margin-top:8px;font-size:12px}
      .hd__doi td{padding:1px 0}
      .hd__canhbao{margin-top:10px;padding:6px 10px;border:1px solid #fde68a;
        background:#fffbeb;color:#92400e;font-size:12px;border-radius:4px}
    </style>
    ${khoiDau(`${dv.ten ?? ""}${dv.dienThoai ? " - Tel : " + dv.dienThoai : ""}`,
              "Trang: 1", "")}

    <div class="c"><span class="hd__nhan">BẢN XEM TRƯỚC — CHƯA PHẢI HÓA ĐƠN</span></div>
    <h1 class="pxk__title">HÓA ĐƠN GIÁ TRỊ GIA TĂNG</h1>
    <div class="pxk__subtitle">Lập từ đơn hàng số:
      <strong>${esc(soDon(don.maHd))} /T${ng.getMonth() + 1}-${ng.getFullYear()}</strong></div>

    <table class="pxk__info"><tbody>
      <tr><td class="pxk__lbl">Ngày tháng :</td><td>${esc(ngayIn(don.ngay))}</td></tr>
      <tr><td class="pxk__lbl">Đơn vị bán :</td><td>${esc(dv.ten)}</td></tr>
      <tr><td class="pxk__lbl">Người mua :</td><td>${esc(don.tenKh)}</td></tr>
      <tr><td class="pxk__lbl">Mã số thuế :</td><td>${esc(don.mst)}</td></tr>
      <tr><td class="pxk__lbl">Địa chỉ :</td><td>${esc(don.diaChi)}</td></tr>
    </tbody></table>

    <table class="pxk__items">
      <colgroup>
        <col style="width:5%"/><col style="width:34%"/><col style="width:8%"/>
        <col style="width:9%"/><col style="width:12%"/><col style="width:13%"/>
        <col style="width:7%"/><col style="width:12%"/>
      </colgroup>
      <thead><tr>
        <th>STT</th><th>Tên hàng hóa, dịch vụ</th><th>ĐVT</th><th>Số lượng</th>
        <th>Đơn giá</th><th>Thành tiền</th><th>Thuế suất (%)</th><th>Tiền thuế</th>
      </tr></thead>
      <tbody>
        ${hang}
      </tbody>
    </table>

    <table class="hd__doi" align="right"><tbody>
      <tr><td class="pxk__lbl">Cộng tiền hàng :</td>
          <td class="r"><strong>${soTienIn(tongTruocThue)}</strong></td></tr>
      <tr><td class="pxk__lbl">Tiền thuế GTGT :</td>
          <td class="r"><strong>${soTienIn(tongVat)}</strong></td></tr>
      <tr><td class="pxk__lbl">Tổng tiền thanh toán :</td>
          <td class="r"><strong>${soTienIn(tongTruocThue + tongVat)}</strong></td></tr>
    </tbody></table>

    ${soDongThieuTenHd > 0
      ? `<div class="hd__canhbao">Có <strong>${soDongThieuTenHd}</strong> dòng chưa khai
         tên hóa đơn riêng (ten_hd) — đang tạm dùng tên đánh đơn. Khai bổ sung trong
         Danh mục hàng hóa nếu tên trên hóa đơn phải khác tên xuất kho.</div>`
      : ""}

    ${khoiChan(dv.diaChi ?? "")}
  </div>`;

  xemTruocGiay(`Xem trước hóa đơn - ${don.maHd}`, than);
}

/**
 * IN PHIẾU GÓI (BR-NB-08) — dựng theo đúng khuôn "BẢNG TỔNG HỢP HOÁ ĐƠN THEO GÓI"
 * của Hoa_Sang (InvoicePackageListPage.renderPackagePrint).
 *
 * Thứ tự hai bảng giống bản gốc:
 *   A. Danh sách hoá đơn trong gói — STT / Mã KH / Khách hàng / Tổng tiền / Mã HĐ,
 *      GOM THEO KHÁCH (cùng khách xếp liền nhau) rồi dòng "Cộng:".
 *   B. Chi tiết hàng hoá — STT / Mặt hàng / Thùng / Lẻ / Trị giá, dòng "Tổng".
 *
 * Số liệu bảng B đọc từ GOI_HD_LINE — snapshot chốt lúc CHỐT GÓI, KHÔNG tính lại từ
 * đơn con lúc in: tính lại thì tờ giấy có thể khác lúc chốt, kho gom sai.
 *
 * ===== KHÁC BIỆT CÓ CHỦ Ý so với Hoa_Sang, cần biết =====
 * Bản gốc tách cột **Thùng / Lẻ** bằng cách quy hết về đơn vị nhỏ nhất rồi chia cho hệ
 * số của bậc đơn vị lớn nhất (`Math.Floor(totalBaseQty / bigExchange)`). Việc đó cần
 * ProductUnits.exchangeValue — bên mình là `DM_HANG_NB.he_so_lon`, mà cột đó ĐANG TRỐNG
 * 100% (quy đổi đơn vị nằm NGOÀI phạm vi v1 — SPEC mục 1).
 *
 * Nên ở đây làm ĐÚNG như chính Hoa_Sang làm khi mặt hàng không có bậc lớn:
 *   "Không có bậc lớn (SP 1 ĐVT): dồn hết vào cột Lẻ. Tách thùng/lẻ với bigExchange=1
 *    chỉ ra phần nguyên/phần thập phân — con số vô nghĩa."
 * Tức cột Thùng để trống, số lượng dồn vào Lẻ kèm ĐVT. Khi nào làm quy đổi (cột
 * he_so_lon có dữ liệu) thì chỉ phải sửa đúng hàm tachThungLe() dưới đây.
 *
 * Ba cột "G.đơn 3 / G.chuẩn 4 / 3-4" của bản gốc KHÔNG bê sang: chúng so giá bán thực
 * với giá chuẩn theo bậc đơn vị — cũng phụ thuộc hệ số quy đổi, và thuộc mảng chính sách
 * giá đã tách SPEC riêng (chốt 9.6).
 */

// Tách số lượng thành (thùng, lẻ) theo hệ số quy đổi.
// heSo <= 1 (chưa có quy đổi) -> dồn hết vào lẻ, đúng cách Hoa_Sang xử lý SP một ĐVT.
function tachThungLe(sl: number, heSo?: number | null) {
  const h = Number(heSo) || 0;
  if (h <= 1) return { thung: 0, le: sl };
  const thung = Math.floor(sl / h);
  return { thung, le: sl - thung * h };
}

export function inPhieuSoanGoi(g: GoiHd, dv: ThongTinDonVi) {
  const lines = g.lines ?? [];
  const donCon = g.donCon ?? [];

  // ---- Bảng A: hoá đơn trong gói, GOM THEO KHÁCH ----
  // Hoa_Sang gom bằng Map theo customer.id rồi flat() — cùng khách xếp liền nhau,
  // để người giao hàng ghé một chỗ giao hết mấy đơn của khách đó.
  const nhom = new Map<string, typeof donCon>();
  for (const d of donCon) {
    const khoa = d.maKh ?? `__le__${d.maHd}`;
    const cu = nhom.get(khoa);
    if (cu) cu.push(d); else nhom.set(khoa, [d]);
  }
  const donXep = [...nhom.values()].flat();

  let tongTien = 0;
  const bangDon = donXep.map((d, i) => {
    const t = Number(d.tongTien) || 0;
    tongTien += t;
    return `<tr>
      <td class="c"><b>${i + 1}</b></td>
      <td class="c"><b>${esc(d.maKh)}</b></td>
      <td><b>${esc(d.tenKh)}</b></td>
      <td class="r">${soTienIn(t)}</td>
      <td class="c">${esc(d.maHd)}</td>
    </tr>`;
  }).join("");

  // ---- Bảng B: chi tiết hàng hoá (thùng / lẻ / trị giá / 3 cột giá) ----
  //
  // Ba cột giá bê đúng công thức Hoa_Sang (ShipmentPackagesController.GetPrintDetail):
  //   G.đơn 3   = trị giá / tổng SL  -> giá bình quân THỰC BÁN của mặt hàng trong gói
  //               (bản gốc: avgUnitPrice = value / totalBaseQty)
  //   G.chuẩn 4 = giá NIÊM YẾT quy về đơn vị nhỏ nhất
  //               (bản gốc: bigPu.SellingPrice / bigExchange, không có bậc lớn thì lấy
  //                giá của đơn vị gốc)
  //   3-4       = chênh lệch. Số ÂM = đang bán DƯỚI giá niêm yết -> chủ hàng soi ngay
  //               trên giấy, không phải mở máy tra.
  let tongThung = 0, tongLe = 0, tongTriGia = 0;
  const hang = lines.map((l, i) => {
    const sl = Number(l.soLuong) || 0;
    const { thung, le } = tachThungLe(sl, l.heSoLon);
    tongThung += thung;
    tongLe += le;

    const triGia = Number(l.triGia) || 0;
    tongTriGia += triGia;

    const gDon = sl !== 0 ? triGia / sl : 0;           // giá bình quân thực bán
    const heSo = Number(l.heSoLon) || 0;
    // Giá niêm yết trong DM_HANG_NB là giá theo ĐVT của mặt hàng. Có bậc lớn thì quy
    // về đơn vị nhỏ để so cùng thước đo với gDon — đúng phép chia của bản gốc.
    const gChuanRaw = Number(l.giaChuan) || 0;
    const gChuan = heSo > 1 ? gChuanRaw / heSo : gChuanRaw;
    const lech = gDon && gChuan ? gDon - gChuan : 0;

    return `<tr>
      <td class="c"><b>${i + 1}</b></td>
      <td>${esc(l.tenHang)}${l.soDonGop
        ? ` <small>(${l.soDonGop} đơn)</small>` : ""}</td>
      <td class="c">${thung > 0 ? soTienIn(thung) : ""}</td>
      <td class="c sl">${soTienIn(le)}${l.dvt ? " " + esc(l.dvt) : ""}</td>
      <td class="r">${soTienIn(triGia)}</td>
      <td class="r">${gDon ? soTienIn(gDon) : ""}</td>
      <td class="r">${gChuan ? soTienIn(gChuan) : ""}</td>
      <td class="r${lech < 0 ? " pxk__am" : ""}">${
        gDon && gChuan ? soTienIn(lech) : ""}</td>
    </tr>`;
  }).join("");

  const than = `<div class="pxk">
    ${khoiDau(
      `${dv.ten ?? ""}${dv.dienThoai ? " - Tel : " + dv.dienThoai : ""}`,
      "Trang: 1",
      `Nhân viên giao hàng : ${g.tenNvvc ?? ""}`)}

    <h1 class="pxk__title">BẢNG TỔNG HỢP PHIẾU THEO GÓI</h1>
    <div class="pxk__subtitle"><strong>Mã gói: ${esc(g.maGoi)}${
      g.tenGoi ? " — " + esc(g.tenGoi) : ""} — ${donXep.length} phiếu</strong></div>

    <div class="pxk__info-line">
      <span class="pxk__lbl">Ngày:</span> ${esc(ngayIn(g.ngay))}
      ${g.khuVuc ? ` &nbsp;&nbsp; <span class="pxk__lbl">Khu vực:</span> ${esc(g.khuVuc)}` : ""}
      ${g.ngayXuat ? ` &nbsp;&nbsp; <span class="pxk__lbl">Ngày xuất kho:</span> ${
        esc(ngayIn(g.ngayXuat))}` : ""}
    </div>

    <table class="pxk__items">
      <colgroup>
        <col style="width:6%"/><col style="width:14%"/><col style="width:42%"/>
        <col style="width:20%"/><col style="width:18%"/>
      </colgroup>
      <thead><tr>
        <th>STT</th><th>Mã KH</th><th>Khách hàng</th><th>Tổng tiền phiếu</th><th>Số phiếu</th>
      </tr></thead>
      <tbody>
        ${bangDon}
        <tr class="pxk__total">
          <td colspan="3" class="r"><strong>Cộng:</strong></td>
          <td class="r"><strong>${soTienIn(tongTien)}</strong></td>
          <td></td>
        </tr>
      </tbody>
    </table>

    <div class="pxk__h2">Chi tiết hàng hoá</div>
    <table class="pxk__items">
      <colgroup>
        <col style="width:5%"/><col style="width:29%"/><col style="width:8%"/>
        <col style="width:13%"/><col style="width:13%"/><col style="width:11%"/>
        <col style="width:11%"/><col style="width:10%"/>
      </colgroup>
      <thead><tr>
        <th>STT</th><th>Mặt hàng</th><th>Thùng</th><th>Lẻ</th><th>Trị giá</th>
        <th>G.đơn 3</th><th>G.chuẩn 4</th><th>3-4</th>
      </tr></thead>
      <tbody>
        ${hang}
        <tr class="pxk__total">
          <td colspan="2" class="r"><strong>Tổng</strong></td>
          <td class="c"><strong>${tongThung > 0 ? soTienIn(tongThung) : ""}</strong></td>
          <td class="c"><strong>${soTienIn(tongLe)}</strong></td>
          <td class="r"><strong>${soTienIn(tongTriGia)}</strong></td>
          <td></td><td></td><td></td>
        </tr>
      </tbody>
    </table>

    ${khoiChuKy(
      ["Người lập phiếu", "Thủ kho soạn hàng", "Kế toán", "NV giao hàng"],
      ["", "", "", g.tenNvvc])}
    ${khoiChan(dv.diaChi ?? "")}
  </div>`;

  inGiay(`PHIEU GOI - ${g.maGoi}`, than);
}
