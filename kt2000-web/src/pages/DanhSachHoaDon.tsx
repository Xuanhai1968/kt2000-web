import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Modal, Button, Input, Select, Checkbox, Radio, Typography, message,
} from "antd";
import { ExclamationCircleFilled } from "@ant-design/icons";
import { AgGridReact } from "ag-grid-react";
import type { ColDef, ValueFormatterParams } from "ag-grid-community";
import type { HoaDonThue, HoaDonLine, DoiChieuHd } from "../api";
import { layDoiChieuHd, dungBanGocTct, loiApi } from "../api";
import { thueXoaHoaDon, thueXuLyTtDc } from "../api";
import { MAU_HD_RA, MAU_HD_VAO } from "../AppShell";
import {
  themeVfp, luoiVfpProps, colVfp, dinhDangPhanTramVat, nhanThueSuat,
  dinhDang4SoLe, nhoDoRongCot,
} from "../theme/luoiVfp";
import "./mau-huong.css";          // .ag-row.dong-dang-chon — tô dòng đang chọn
import "./keo-cot.css";            // con trỏ ↔ ở mép cột, báo cho biết kéo được
import "./danh-sach-hoa-don.css";

// ============ DANH SÁCH HÓA ĐƠN GTGT — FRM_DS_HDDT ============
// Dựng lại form "Danh sách hóa đơn GTGT đầu vào/ra" của KT2000 VFP: lưới hóa đơn
// dày ở trên, ba tầng thanh công cụ nhồi kín ở dưới.
//
// Nguồn dữ liệu: dùng LẠI mảng HoaDonThue mà màn cha đã đọc từ sổ thuế — form này
// chỉ để TÌM và CHỌN, không tự gọi API. Làm vậy thì mở form là có ngay danh sách,
// không phải chờ tải lần hai, và không bao giờ lệch với thứ màn cha đang hiển thị.
//
// Dòng hàng: API danh sách không kèm lines cho nhẹ tải, nên bảng dưới chỉ có dữ
// liệu sau khi màn cha tải chi tiết hóa đơn đó (onChon -> taiChiTiet). Ở đây gọi
// onChon ngay khi bấm chọn dòng để bảng dưới đổ dữ liệu mà không phải đóng modal.

interface Props {
  mo: boolean;
  onDong: () => void;
  dsHd: HoaDonThue[];
  namLamViec: number;
  tenDonVi: string;
  laDauRa: boolean;
  onChon: (maHd: string, bucTaiLai?: boolean) => void;
  onXemHtml: (maHd: string) => void;
  // Nạp lại sổ từ server — màn cha giữ hàm này vì nó sở hữu dsHd.
  onLamMoi?: () => void | Promise<void>;
  dangTai?: boolean;
  // Bật bằng ô tích "So sánh dữ liệu" bên form: đổi lưới TRÊN sang chế độ đối chiếu
  // với bản gốc TCT. Lưới dưới (dòng hàng) giữ nguyên.
  soSanh?: boolean;
}

// Lệch bao nhiêu thì tính là lệch. 10đ — cùng ngưỡng phép kiểm Σ lúc nạp (chốt Trường
// 14/08), để một hóa đơn không thể "đạt" ở khâu nạp mà lại "lệch" ở khâu đối chiếu.
const NGUONG_LECH = 10;

// Nút chưa nối nghiệp vụ: giữ nguyên màu và vị trí như bản gốc nhưng để disabled,
// thà mờ còn hơn bấm vào im lặng không làm gì.
function NutCho({ nhan, lop = "" }: { nhan: string; lop?: string }) {
  return (
    <Button size="small" className={lop} disabled
            title="Nghiệp vụ này chưa xử lý">
      {nhan}
    </Button>
  );
}

export default function DanhSachHoaDon({
  mo, onDong, dsHd, namLamViec, tenDonVi, laDauRa, onChon, onXemHtml,
  onLamMoi, dangTai = false, soSanh = false,
}: Props) {
  // Bản gốc TCT, tra theo mã HĐ. Chỉ tải khi thật sự mở ở chế độ so sánh — bảng này
  // có thể trống trơn với đơn vị chưa nạp lại, và với đơn vị chưa chạy bản vá 021 thì
  // backend trả rỗng thay vì lỗi.
  const [goc, setGoc] = useState<Record<string, DoiChieuHd>>({});
  const [gocDangTai, setGocDangTai] = useState(false);
  const [dangDung, setDangDung] = useState(false);

  const taiDoiChieu = useCallback(() => {
    setGocDangTai(true);
    return layDoiChieuHd(laDauRa ? "ra" : "vao")
      .then((r) => {
        const m: Record<string, DoiChieuHd> = {};
        for (const x of r.data) m[x.maHd] = x;
        setGoc(m);
      })
      // Hỏng thì để bản đồ rỗng: mọi hóa đơn hiện "chưa có gốc" — thà trống còn hơn
      // dựng ra một cột lệch mà số liệu nền không có thật.
      .catch(() => setGoc({}))
      .finally(() => setGocDangTai(false));
  }, [laDauRa]);

  useEffect(() => {
    if (!mo || !soSanh) return;
    // Bọc trong hàm async: taiDoiChieu bật cờ "đang tải" NGAY khi được gọi, mà setState
    // đồng bộ trong thân effect thì React coi là render dây chuyền. Await một nhịp là
    // lời gọi rơi sang microtask, cờ bật ngoài thân effect.
    void (async () => { await Promise.resolve(); await taiDoiChieu(); })();
  }, [mo, soSanh, laDauRa, namLamViec, taiDoiChieu]);

  // Bù bản gốc cho hóa đơn nạp trước 15/08 (lúc IN_VALUE_LINE chưa được ghi). Đọc lại
  // chính file Excel mà lần nạp trước đã dùng, nên không phải vào cổng thuế lần nữa và
  // sổ hóa đơn không bị đụng tới. Xong thì tải lại ngay để lưới đổi số tại chỗ.
  const dungBanGoc = async () => {
    setDangDung(true);
    try {
      const r = await dungBanGocTct(laDauRa ? "ra" : "vao");
      const { soFile, them, sua, loi } = r.data;
      if (soFile === 0) {
        message.warning(
          "Không thấy file Excel danh sách nào trên đĩa — đơn vị/năm này chưa từng tải, "
          + "hoặc thư mục job đã bị dọn. Trường hợp đó phải tải lại từ cổng.");
      } else {
        message.success(`Đọc ${soFile} file Excel: thêm ${them} dòng gốc, thay ${sua} dòng`);
      }
      // Lỗi từng tháng báo riêng, KHÔNG nuốt: bù được 9/12 tháng mà im lặng thì người
      // dùng tưởng đã đủ, rồi ngồi tìm mãi vì sao ba tháng kia vẫn trống.
      if (loi.length > 0) message.error(`Không đọc được: ${loi.join(" · ")}`, 8);
      await taiDoiChieu();
    } catch (e) {
      message.error(loiApi(e, "Không dựng được bản gốc"));
    } finally {
      setDangDung(false);
    }
  };

  // Lệch của một hóa đơn. null = CHƯA CÓ BẢN GỐC, khác hẳn 0 (có gốc và khớp) — hóa
  // đơn nạp trước 15/08 chưa có dòng trong IN_VALUE_LINE, gọi nó là "lệch" thì cả sổ
  // đỏ rực vì một lý do chẳng liên quan gì tới số liệu.
  // Vế SỔ lấy từ chính lượt gọi đối chiếu (g.tienHangSo), KHÔNG lấy x.tienHang của
  // lưới: cột kia là Σ(SL×ĐG) chưa trừ chiết khấu nên hóa đơn nào có chiết khấu cũng
  // báo lệch đúng bằng số chiết khấu — 6/49 hóa đơn tháng 8 HOA_SANG dính, ca nặng
  // nhất 17.901.037đ, trong khi thực tế khớp tuyệt đối.
  // x có thể undefined: AG Grid gọi valueGetter cho cả hàng chưa có dữ liệu.
  const lechCuaHd = (x?: HoaDonThue) => {
    const g = x ? goc[x.maHd] : undefined;
    if (!g) return null;
    return {
      tienHangSo: g.tienHangSo,
      tienHangGoc: g.tienHangGoc,
      tienVatGoc: g.tienVatGoc,
      lechTien: g.tienHangSo - g.tienHangGoc,
      lechVat: g.tienVatSo - g.tienVatGoc,
    };
  };
  const coLech = (x?: HoaDonThue) => {
    const l = lechCuaHd(x);
    return l != null
        && (Math.abs(l.lechTien) >= NGUONG_LECH || Math.abs(l.lechVat) >= NGUONG_LECH);
  };

  // ColDef của lưới trên chỉ dựng lại khi BẬT/TẮT chế độ so sánh, không dựng lại mỗi
  // lần bản gốc về — nên valueGetter không được đóng gói (closure) state `goc`, bằng
  // không nó mãi đọc bản đồ rỗng của lượt render đầu. Giải: giữ `goc` trong một ref
  // DỮ LIỆU, ghi ở effect (ghi lúc render là sai luật hook), rồi cho hai hàm dùng
  // trong cột đọc qua ref đó — identity của chúng ổn định nên cột yên vị.
  const gocRef = useRef(goc);
  useEffect(() => {
    gocRef.current = goc;
    // Cột so sánh đọc qua gocRef nên AG Grid không tự biết số đã đổi — bảo nó vẽ lại.
    luoiTrenRef.current?.api?.refreshCells({
      columns: ["tienHangGoc", "tienVatGoc", "lechTien", "lechVat"], force: true,
    });
  }, [goc]);

  const lechCuaHdCot = useCallback((x?: HoaDonThue) => {
    const g = x ? gocRef.current[x.maHd] : undefined;
    if (!g) return null;
    return {
      // Chưa lên sổ thì vế SỔ là null, không phải 0 — cột hiện trống. In số 0 ở đây là
      // nói dối: 0 có nghĩa "sổ ghi bằng không", còn đây là "sổ không có dòng nào".
      tienHangSo: g.coTrongSo ? g.tienHangSo : null,
      tienHangGoc: g.tienHangGoc,
      tienVatGoc: g.tienVatGoc,
      // Lệch thì VẪN tính, và tính đúng bằng trọn số của cổng (0 − gốc). Đó chính là
      // độ lớn của phần đang thiếu trong sổ, nên dòng tự dồn xuống cuối cùng nhóm lệch.
      lechTien: g.tienHangSo - g.tienHangGoc,
      lechVat: g.tienVatSo - g.tienVatGoc,
    };
  }, []);

  // Bí danh của prop `soSanh`. Bên trong dsLoc có một biến cục bộ CŨNG tên soSanh (hàm
  // so sánh chuỗi để sắp xếp) che mất prop — dùng thẳng ở đó là so một hàm với boolean
  // mà TypeScript vẫn cho qua vì hàm luôn truthy.
  const soSanhMo = soSanh;
  const [thang, setThang] = useState<number | "all">("all");
  const [thangKT, setThangKT] = useState<number | "all">("all");
  // Vùng công cụ mặc định THU GỌN: phần lớn thời gian người dùng chỉ tra cứu và
  // chọn hóa đơn, mở sẵn cả rừng nút chỉ tổ ăn mất chiều cao của hai lưới.
  const [moCongCu, setMoCongCu] = useState(false);
  const [oTuKhoa, setOTuKhoa] = useState("");
  const [tuKhoa, setTuKhoa] = useState("");
  const timNgay = () => setTuKhoa(oTuKhoa);
  const [fileChon, setFileChon] = useState<string | null>(null);
  const [nhomDoi, setNhomDoi] = useState("ten_kh");
  const [nhomDoi2, setNhomDoi2] = useState("ten_hang");
  const [cb, setCb] = useState<Record<string, boolean>>({
    kiemTraThuTu: false, chiLayDanhDau: false, tatCa: false, ghiNho: true,
    themVaoDanhMuc: true, chuyenUnicode: true, nhomTheoTenHang: false,
    theoNgayNhapHang: false, dongBoBoQuaDuoi: false, duongDanKhac: false,
    themMoiCaKhiDaCo: false, nhapHangTraLai: false, layDuLieuTheoDuongDan: false,
    xoaDuLieuTruocKhiLay: false, chuyenSangGhiChuG: false,
    chuyenTenHangSangGhiChu: false, tongHopKhiDongBo: true,
    printPreview: false, inTatCa: false, nganHang: false,
    khongInHangKM: false, giaDaCoThue: false, lapRapCB1: true,
    chiLayFileExcelSP: true, chiInPDF: false, chiTrongBangKe: false,
  });
  const datCb = (k: string, v: boolean) => setCb((m) => ({ ...m, [k]: v }));

  // HAI BỘ LỌC THÁNG BỔ TRỢ NHAU, đọc hai nguồn khác nhau:
  //
  //   "Tháng"    -> tháng của cột NGAY (ngày ghi trên hóa đơn) — hóa đơn phát sinh
  //                 trong tháng nào.
  //   "Tháng KT" -> cột THANG của HOA_DON (tháng KÊ KHAI) — hóa đơn được đưa vào tờ
  //                 khai tháng nào.
  //
  // Hai cái lệch nhau là chuyện thường: hóa đơn ngày 28/6 về muộn thì vẫn kê khai
  // sang tháng 7. Chọn Tháng 6 + Tháng KT 7 là ra đúng nhóm hóa đơn đó — chính là
  // lý do phải tách làm hai ô chứ không gộp một.
  const thangCuaNgay = (x: HoaDonThue) => {
    const m = Number((x.ngay ?? "").slice(0, 10).split("-")[1]);
    return Number.isFinite(m) && m > 0 ? m : null;
  };

  // Dòng CHỈ CÓ Ở CỔNG: bản gốc TCT có, mà HOA_DON không có dòng nào.
  //
  // Dựng thành HoaDonThue "vỏ" để lưới đối xử y như mọi dòng khác — sắp xếp, lọc, tô
  // màu đều dùng lại được, không phải rẽ nhánh ở từng chỗ. Mọi cột thuộc SỔ để 0 và
  // soDongHang = 0; phần trình bày đọc coTrongSo để bỏ trống thay vì in số 0.
  //
  // Thiếu hai loại này thì bảng đối chiếu chỉ đối chiếu được đúng những hóa đơn vốn đã
  // không có vấn đề gì:
  //   • file XML tải hỏng — cổng liệt kê, sổ trống trơn (NHAT_TUAN T1 C26TMV/2451);
  //   • hóa đơn bị đá ra vì lệch Σ line.
  const dongChiCoOCong = useMemo<HoaDonThue[]>(() => {
    if (!soSanh) return [];
    const daCoTrenLuoi = new Set(dsHd.map((x) => x.maHd));
    return Object.values(goc)
      .filter((g) => !g.coTrongSo && !daCoTrenLuoi.has(g.maHd))
      .map((g) => ({
        maHd: g.maHd, huong: laDauRa ? "RA" : "VAO",
        ngay: g.ngay, ngayNh: null, thang: null,
        khhd: g.khhd, soHd: g.soHd, mst: g.mst, tenKh: g.tenKh,
        diaChi: null, nguoiGiaoDich: null, soPtc: null, maTv: null, tenTv: null,
        tienHang: 0, tienVat: 0, tienCk: 0, tongTien: 0, soDongHang: 0,
        ghiNo: null, ghiCo: null, maCtNo: null, maCtCo: null,
        ghiNoVat: null, ghiCoVat: null, ghiChu: null,
        tthaiHd: g.tthaiGoc, vat: null, vatLine: null,
        tichChatHdLienquan: null, loaiHdLienquan: null, mauSoHdLienquan: null,
        khhdLienquan: null, sohdLienquan: null, ngayLienquan: null,
        trangThaiHdLienQuan: null, lines: [],
      }));
  }, [goc, dsHd, soSanh, laDauRa]);

  // Hóa đơn KHÔNG có dòng nào trong sổ — dùng để bỏ trống vế sổ và chặn mở chi tiết.
  const chuaLenSo = (maHd?: string) =>
    !!maHd && gocRef.current[maHd]?.coTrongSo === false;

  const dsLoc = useMemo(() => {
    const k = tuKhoa.trim().toLowerCase();
    const loc = [...dsHd, ...dongChiCoOCong].filter((x) => {
      if (thang !== "all" && thangCuaNgay(x) !== thang) return false;
      if (thangKT !== "all" && x.thang !== thangKT) return false;
      if (!k) return true;
      return [x.soHd, x.khhd, x.mst, x.tenKh, x.maHd]
        .some((v) => (v ?? "").toLowerCase().includes(k));
    });

    // Sắp NGÀY TĂNG DẦN (1/1 -> 31/12) — đọc sổ theo trình tự phát sinh, giống
    // cách lật cuốn sổ giấy. API trả ngay DESC (hóa đơn mới nhất trước) nên phải
    // sắp lại ở đây; sắp tại chỗ này thì đổi thứ tự API về sau cũng không ảnh hưởng.
    //
    // Ngày dạng ISO yyyy-MM-dd nên so sánh chuỗi là ra đúng thứ tự thời gian,
    // không cần parse Date. HĐ thiếu ngày dồn xuống cuối thay vì lên đầu.
    // Cùng ngày thì xếp theo số HĐ để thứ tự cố định giữa các lần lọc.
    const soSanh = (a: string, b: string) =>
      a === b ? 0 : !a ? 1 : !b ? -1 : a < b ? -1 : 1;

    return [...loc].sort((a, b) => {
      // Chế độ đối chiếu: hóa đơn LỆCH dồn xuống cuối bảng (chốt Trường 15/08), cuộn
      // hết xuống là thấy trọn nhóm cần xử lý. Trong từng nhóm vẫn theo ngày như cũ.
      if (soSanhMo) {
        const la = coLech(a) ? 1 : 0;
        const lb = coLech(b) ? 1 : 0;
        if (la !== lb) return la - lb;
      }
      const d = soSanh((a.ngay ?? "").slice(0, 10), (b.ngay ?? "").slice(0, 10));
      return d !== 0 ? d : soSanh(a.soHd ?? "", b.soHd ?? "");
    });
    // coLech dựng mới mỗi render nên ESLint đòi nó; phụ thuộc THẬT của nó là `goc`,
    // đã có trong danh sách — thêm chính hàm vào chỉ tổ tính lại mỗi render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dsHd, dongChiCoOCong, thang, thangKT, tuKhoa, soSanhMo, goc]);

  // Hóa đơn đang chọn ở bảng trên — nguồn của bảng dòng hàng bên dưới
  const hdDangChon = useMemo(
    () => dsHd.find((x) => x.maHd === fileChon) ?? null, [dsHd, fileChon]);

  const soVn = (v: number) =>
    v.toLocaleString("vi-VN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // Cột thuộc vế SỔ. Dòng chỉ-có-ở-cổng thì bỏ trống chứ đừng in "0,00" — người soát
  // đọc số 0 là hiểu "sổ ghi bằng không", trong khi sự thật là sổ không có dòng nào.
  // Dấu — cùng ký hiệu với bốn cột đối chiếu, để cả hàng ngang nhất quán.
  const soSoTrongNeuChuaLenSo = (p: ValueFormatterParams<HoaDonThue>) =>
    chuaLenSo(p.data?.maHd) ? "—" : soVn(p.value ?? 0);

  // Ngày dd/MM/yy như lưới gốc. Backend trả ISO datetime nên cắt phần ngày trước.
  const ngayNgan = (s: string | null) => {
    const p = (s ?? "").slice(0, 10).split("-");
    return p.length === 3 && p[0] ? `${p[2]}/${p[1]}/${p[0].slice(2)}` : "";
  };

  const hoanRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const huyHoan = () => {
    if (hoanRef.current) { clearTimeout(hoanRef.current); hoanRef.current = null; }
  };
  useEffect(() => huyHoan, []);

  // Dòng chỉ-có-ở-cổng vẫn CHỌN được (tô sáng, đọc được số của cổng) nhưng KHÔNG gọi
  // onChon: bên kia sẽ đi tải chi tiết một mã hóa đơn không tồn tại trong sổ và nhận
  // 404, đá người dùng ra một thông báo lỗi trong khi họ chẳng làm gì sai.
  const chonDong = (maHd: string) => {
    huyHoan();
    setFileChon(maHd);
    if (!chuaLenSo(maHd)) onChon(maHd);
  };

  const chonDongHoan = (maHd: string) => {
    huyHoan();
    setFileChon(maHd);
    if (chuaLenSo(maHd)) return;
    hoanRef.current = setTimeout(() => {
      hoanRef.current = null;
      onChon(maHd);
    }, 250);
  };

  const chonVaDong = () => {
    if (fileChon) { onChon(fileChon); onDong(); }
  };

  // ===== Cột "In": TỰ tích theo dữ liệu, vẫn bấm được =====
  //
  // BR: hóa đơn ĐIỀU CHỈNH / THAY THẾ nhận biết bằng tich_chat_hd_lienquan khác
  // trống (docs/THUE/BienBan_RaSoat.md — cột hd_thay_the_dieu_chinh bị bỏ vì suy
  // ra được từ đây). Không dò theo chữ trong tthaiHd: giá trị đó là văn bản tự do
  // của TCT, đổi cách viết một cái là phép lọc câm lặng bỏ sót hóa đơn.
  //
  // Đánh dấu hóa đơn VỪA có chiết khấu VỪA là điều chỉnh/thay thế.
  const laDienDanhDau = (h: HoaDonThue) =>
    (h.tienCk ?? 0) !== 0 && (h.tichChatHdLienquan ?? "").trim() !== "";

  // MẶC ĐỊNH BAN ĐẦU = BỎ TRỐNG HẾT. Trước đây cột In tự tích theo laDienDanhDau,
  // nên vừa mở màn hình / vừa bấm Refresh đã thấy một loạt dòng có dấu — kế toán
  // không phân biệt được đâu là dấu mình đặt, đâu là dấu máy tự đặt. Giờ máy chỉ
  // GỢI Ý (đếm ở thanh trên, và bước 1 của xử lý TT/ĐC vẫn tự tích khi cần),
  // còn dấu trên lưới thì hoàn toàn do người dùng bấm.
  const laCanIn = () => false;

  // Chỉ giữ những mã người dùng TỰ BẤM ngược lại mặc định (mặc định giờ là bỏ trống,
  // nên thực tế đây là tập các mã đang được tích). Dấu chỉ sống trong phiên — chưa có
  // cột nào dưới DB để lưu — và Refresh xóa sạch bộ này.
  const [inGhiDe, setInGhiDe] = useState<Record<string, boolean>>({});

  const laDanhDauIn = (h: HoaDonThue) => inGhiDe[h.maHd] ?? laCanIn();

  const datIn = (h: HoaDonThue, tich: boolean) => {
    setInGhiDe((cu) => {
      // Bấm về đúng giá trị mặc định thì XÓA ghi đè, đừng lưu lại — để dòng đó
      // tiếp tục bám dữ liệu nếu chiết khấu đổi về sau.
      if (tich === laCanIn()) {
        const moi = { ...cu };
        delete moi[h.maHd];
        return moi;
      }
      return { ...cu, [h.maHd]: tich };
    });
  };

  const soDanhDau = useMemo(
    () => dsLoc.filter(laDanhDauIn).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dsLoc, inGhiDe]);

  // Số hóa đơn ĐÁNG chú ý theo dữ liệu (CK + điều chỉnh/thay thế). Chỉ để hiện gợi ý
  // ở thanh trên — không còn tự tích vào lưới nữa.
  const soDienDanhDau = useMemo(() => dsLoc.filter(laDienDanhDau).length, [dsLoc]);

  // ===== Kiểm tra thứ tự HĐ ra =====
  // HĐ đầu ra phải liên tục theo từng ký hiệu: thủng số là dấu hiệu mất hóa đơn
  // hoặc quên nạp. Gom theo khhd rồi dò chỗ đứt trong dãy số đã sắp tăng dần.
  // Chỉ so phần SỐ của so_hd, bỏ qua số 0 đệm đầu ("00003846" -> 3846).
  const thungSo = useMemo(() => {
    if (!cb.kiemTraThuTu) return [] as string[];
    const theoKh = new Map<string, number[]>();
    for (const x of dsLoc) {
      const so = Number((x.soHd ?? "").replace(/\D/g, ""));
      if (!Number.isFinite(so) || so <= 0) continue;
      const kh = x.khhd ?? "(không ký hiệu)";
      const ds = theoKh.get(kh);
      if (ds) ds.push(so); else theoKh.set(kh, [so]);
    }
    const bao: string[] = [];
    for (const [kh, ds] of theoKh) {
      const sap = [...new Set(ds)].sort((a, b) => a - b);
      for (let i = 1; i < sap.length; i++) {
        const truoc = sap[i - 1], sau = sap[i];
        if (sau - truoc > 1) {
          bao.push(sau - truoc === 2
            ? `${kh}: thiếu số ${truoc + 1}`
            : `${kh}: thiếu ${truoc + 1}–${sau - 1} (${sau - truoc - 1} số)`);
        }
      }
    }
    return bao;
  }, [cb.kiemTraThuTu, dsLoc]);

  // Cầu nối cho cell renderer của cột In: xem chú thích tại colId "in".
  const luoiTrenRef = useRef<AgGridReact<HoaDonThue> | null>(null);
  // XÓA HÓA ĐƠN — thao tác GHI và KHÔNG ĐẢO NGƯỢC ĐƯỢC, nên phải hỏi lại trước.
  // Hộp xác nhận nêu rõ ký hiệu/số hóa đơn và tên đối tác: chỉ hiện "mã hóa đơn"
  // thì kế toán không đối chiếu được mình đang xóa cái gì (mã dạng
  // RA_0101415995_C26TNT_0001120 nhìn na ná nhau cả trăm dòng).
  const xoaHoaDon = (hd: HoaDonThue) => {
    Modal.confirm({
      title: "Xóa hóa đơn khỏi sổ?",
      icon: <ExclamationCircleFilled style={{ color: "#cf1322" }} />,
      width: 520,
      content: (
        <div style={{ fontSize: 13, lineHeight: 1.6 }}>
          <div><b>{hd.khhd ?? ""}/{hd.soHd ?? ""}</b>{hd.tenKh ? ` — ${hd.tenKh}` : ""}</div>
          <div style={{ color: "#8c8c8c" }}>{hd.maHd}</div>
          <div style={{ marginTop: 8, color: "#cf1322" }}>
            Xóa cả dòng hàng của hóa đơn này và <b>không lấy lại được</b> —
            muốn có lại phải chạy nạp HĐĐT lần nữa.
          </div>
        </div>
      ),
      okText: "Xóa",
      okButtonProps: { danger: true },
      cancelText: "Hủy",
      onOk: async () => {
        try {
          await thueXoaHoaDon(hd.maHd);
          message.success(`Đã xóa ${hd.khhd ?? ""}/${hd.soHd ?? ""}`);
          // Nạp lại sổ từ server chứ không tự bỏ dòng khỏi mảng: màn cha sở hữu
          // dsHd, sửa cục bộ thì hai bên lệch nhau ngay lượt sau.
          await onLamMoi?.();
        } catch (e) {
          message.error(loiApi(e, "Không xóa được hóa đơn"));
        }
      },
    });
  };

  // ===== BR-TK-06: XỬ LÝ HÓA ĐƠN THAY THẾ / ĐIỀU CHỈNH =====
  // Spec: docs/THUE/TOKHAI/SPEC-TO-KHAI-01-GTGT.md §10
  //
  // HAI BƯỚC, cố ý tách rời:
  //   Lần 1 — TỰ TÍCH các hóa đơn liên quan vào cột In. KHÔNG ghi gì vào sổ.
  //           Đây là bước cho kế toán NHÌN THẤY phạm vi ảnh hưởng trước khi quyết.
  //   Lần 2 — Xử lý thật (đã tích đủ rồi thì bấm một lần là chạy luôn).
  const [dangXuLy, setDangXuLy] = useState(false);

  // Hóa đơn "liên quan" = HĐ thay thế/điều chỉnh VÀ hóa đơn gốc nó trỏ tới.
  // Ký hiệu hai bên ghi khác nhau: sổ '1C26TNT', liên kết 'C26TNT' — bỏ chữ số đầu
  // để so (đo thật 15/08).
  const boMauSo = (kh: string | null) =>
    (kh ?? "").replace(/^\d+/, "");

  const dsLienQuan = useMemo(() => {
    const tt = dsLoc.filter((x) => (x.tichChatHdLienquan ?? "").trim() !== "");
    const goc = new Set(tt.map((x) =>
      `${(x.khhdLienquan ?? "").trim()}|${(x.sohdLienquan ?? "").trim()}`));
    return dsLoc.filter((x) =>
      (x.tichChatHdLienquan ?? "").trim() !== ""
      || goc.has(`${boMauSo(x.khhd)}|${(x.soHd ?? "").trim()}`));
  }, [dsLoc]);

  const xuLyTtDc = async () => {
    if (dsLienQuan.length === 0) {
      message.info("Kỳ đang lọc không có hóa đơn thay thế/điều chỉnh nào");
      return;
    }

    // LẦN 1 — chưa tích đủ thì tích rồi dừng, KHÔNG ghi gì.
    const chuaTich = dsLienQuan.filter((x) => !laDanhDauIn(x));
    if (chuaTich.length > 0) {
      setInGhiDe((cu) => {
        const moi = { ...cu };
        for (const x of chuaTich) moi[x.maHd] = true;
        return moi;
      });
      message.info(
        `Đã tích ${chuaTich.length} hóa đơn liên quan (${dsLienQuan.length} tất cả) — `
        + "xem lại rồi bấm lần nữa để xử lý");
      return;
    }

    // LẦN 2 — xử lý thật. Hỏi lại vì có GHI vào sổ.
    Modal.confirm({
      title: "Xử lý hóa đơn thay thế / điều chỉnh?",
      icon: <ExclamationCircleFilled style={{ color: "#d46b08" }} />,
      width: 560,
      content: (
        <div style={{ fontSize: 13, lineHeight: 1.6 }}>
          <div>{dsLienQuan.length} hóa đơn liên quan trong kỳ đang lọc.</div>
          <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
            <li><b>Cùng kỳ</b>: tờ khai tự loại hóa đơn gốc khi tính —
              sổ <b>giữ nguyên</b>, không sửa gì.</li>
            <li><b>Khác kỳ</b>: ghi chú vào cột Ghi chú của hóa đơn để kế toán
              tự cập nhật kỳ gốc khi có dữ liệu.</li>
          </ul>
        </div>
      ),
      okText: "Xử lý",
      cancelText: "Hủy",
      onOk: async () => {
        setDangXuLy(true);
        try {
          // Tháng KT là kỳ kê khai — đúng trục mà tờ khai dùng.
          const ky = thangKT !== "all" ? thangKT
                   : thang !== "all" ? thang : null;
          if (ky == null) {
            message.warning("Chọn một tháng cụ thể ở ô lọc trước khi xử lý");
            return;
          }
          const r = await thueXuLyTtDc(ky);
          message.success(r.data.message);
          await onLamMoi?.();
        } catch (e) {
          message.error(loiApi(e, "Không xử lý được"));
        } finally {
          setDangXuLy(false);
        }
      },
    });
  };

  const hamRef = useRef({ laDanhDauIn, datIn });

  useEffect(() => {
    hamRef.current = { laDanhDauIn, datIn };
    luoiTrenRef.current?.api?.refreshCells({ columns: ["in"], force: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inGhiDe, dsLoc]);

  const cacThang = Array.from({ length: 12 }, (_, i) => i + 1);
  const optThang = [{ value: "all" as const, label: "Tất cả" },
                    ...cacThang.map((m) => ({ value: m, label: `Tháng ${m}` }))];

  const cotTren = useMemo<ColDef<HoaDonThue>[]>(() => [
    { colId: "stt", headerName: "STT", width: 48, pinned: "left",
      valueGetter: (p) => (p.node?.rowIndex ?? 0) + 1 },
    // Cột "Thao tác" đã bỏ: xem ảnh gốc và xóa giờ là hai nút ở thanh trên, chạy theo
    // hóa đơn ĐANG CHỌN. Một chỗ bấm thay vì lặp icon trên từng dòng.
    { colId: "in", headerName: "In", width: 46, pinned: "left",
      headerTooltip: "Tự đánh dấu: HĐ có chiết khấu và là HĐ điều chỉnh/thay thế",
      valueGetter: (p) => (p.data ? hamRef.current.laDanhDauIn(p.data) : false),
      cellStyle: { backgroundColor: "#f5f5f5", textAlign: "center" },
      cellRenderer: (p: { data?: HoaDonThue }) => p.data ? (
        <input type="checkbox"
               checked={hamRef.current.laDanhDauIn(p.data)}
               onClick={(e) => e.stopPropagation()}
               onChange={(e) => p.data && hamRef.current.datIn(p.data, e.target.checked)} />
      ) : null },
    // THAO TÁC — ghim TRÁI cạnh STT: cuộn ngang bao nhiêu vẫn bấm được. Để cột cuối
    // thì phải kéo hết sang phải mới thấy, đúng thứ hay dùng lại khó với tới nhất.
    //
    // stopPropagation ở cả hai nút: bấm icon KHÔNG được kéo theo việc chọn dòng —
    // chọn dòng làm bảng dòng hàng bên dưới tải lại, thừa một lượt gọi API.
    
    { colId: "maHd", headerName: "Mã HĐ", field: "maHd", width: 150,
      pinned: "left", tooltipField: "maHd" },
    { colId: "ngay", headerName: "Ngày", width: 74,
      valueGetter: (p) => ngayNgan(p.data?.ngay ?? null) },
    { colId: "ngayNh", headerName: "Ngày NH", width: 74,
      valueGetter: (p) => ngayNgan(p.data?.ngayNh ?? p.data?.ngay ?? null) },
    { colId: "soHd", headerName: "Số HĐ", field: "soHd", width: 82 },
    { colId: "nhanSu", headerName: "Nhân sự", width: 330,
      valueGetter: (p) => `${p.data?.tenKh ?? ""}_${p.data?.mst ?? ""}`,
      tooltipValueGetter: (p) => String(p.value ?? "") },
    { colId: "ghiNo", headerName: "Nợ", field: "ghiNo", width: 44 },
    { colId: "ghiCo", headerName: "Có", field: "ghiCo", width: 44 },
    // %VAT ưu tiên cột trên HEADER, TRỐNG thì lùi về thuế suất của DÒNG. Hai lý do đều
    // gặp thật: (1) có đơn vị ghi %VAT xuống dòng chứ không ghi ở header; (2) hóa đơn
    // KHUYẾT ĐƠN GIÁ thì tiền hàng = 0 nên lúc nạp không suy ngược ra thuế suất được,
    // header để trống trong khi dòng vẫn có pt_vat.
    // Đo 15/08 trên HOA_SANG_2026: 58 hóa đơn trống %VAT mà dòng có thuế suất.
    { colId: "ptVat", headerName: "%VAT", width: 56, type: "numericColumn",
      valueGetter: (p) => nhanThueSuat(p.data?.vat ?? p.data?.vatLine) },
    { colId: "noVat", headerName: "Nợ VAT", field: "ghiNoVat", width: 50 },
    { colId: "coVat", headerName: "Có VAT", field: "ghiCoVat", width: 46 },
    { colId: "kt", headerName: "KT", width: 44, field: "thang",
      type: "numericColumn",
      headerTooltip: "Tháng kê khai (HOA_DON.thang) — lọc bằng ô 'Tháng KT'" },
    // Từ 15/08 backend trả tienHang ĐÃ TRỪ CHIẾT KHẤU nên hai chế độ dùng chung một số,
    // không phải đổi nhãn hay lấy riêng từ bản đối chiếu nữa.
    // Trước đó cột này là Σ(SL×ĐG) thuần, tức CỘNG cả dòng chiết khấu thay vì trừ — hóa
    // đơn có chiết khấu vống lên đúng hai lần số chiết khấu.
    { colId: "tienHang", headerName: "Tiền HĐ", field: "tienHang", width: 130,
      type: "numericColumn", valueFormatter: (p) => soSoTrongNeuChuaLenSo(p) },
    // Chế độ so sánh THAY cột Tiền CK bằng bốn cột đối chiếu (chốt Trường 15/08):
    // chiết khấu không giúp gì cho việc soát số với cổng, mà giữ lại thì hàng ngang
    // dài thêm đúng lúc cần nhìn nhanh nhất.
    ...(soSanh ? [] : ([{
      colId: "tienCk", headerName: "Tiền CK", field: "tienCk", width: 110,
      type: "numericColumn",
      valueFormatter: (p: ValueFormatterParams<HoaDonThue>) => soVn(p.value ?? 0),
    }] as ColDef<HoaDonThue>[])),
    { colId: "tienVat", headerName: "Tiền VAT", field: "tienVat", width: 120,
      type: "numericColumn", valueFormatter: (p) => soSoTrongNeuChuaLenSo(p) },
    ...(!soSanh ? [] : ([
      { colId: "tienHangGoc", headerName: "T.Tiền gốc", width: 130,
        type: "numericColumn",
        headerTooltip: "Tiền hàng theo file Excel danh sách của cổng (IN_VALUE_LINE)",
        valueGetter: (p) => lechCuaHdCot(p.data)?.tienHangGoc ?? null,
        // Ô trống chứ không phải "0": chưa có bản gốc khác hẳn gốc bằng 0.
        valueFormatter: (p) => (p.value == null ? "—" : soVn(p.value)) },
      { colId: "tienVatGoc", headerName: "VAT gốc", width: 120,
        type: "numericColumn",
        headerTooltip: "Tiền VAT theo file Excel danh sách của cổng",
        valueGetter: (p) => lechCuaHdCot(p.data)?.tienVatGoc ?? null,
        valueFormatter: (p) => (p.value == null ? "—" : soVn(p.value)) },
      { colId: "lechTien", headerName: "Lệch T.Tiền", width: 120,
        type: "numericColumn",
        headerTooltip: `Tiền HĐ − T.Tiền gốc. Dưới ${NGUONG_LECH}đ coi như khớp.`,
        valueGetter: (p) => lechCuaHdCot(p.data)?.lechTien ?? null,
        valueFormatter: (p) => (p.value == null ? "—" : soVn(p.value)) },
      { colId: "lechVat", headerName: "Lệch VAT", width: 110,
        type: "numericColumn",
        headerTooltip: `Tiền VAT − VAT gốc. Dưới ${NGUONG_LECH}đ coi như khớp.`,
        valueGetter: (p) => lechCuaHdCot(p.data)?.lechVat ?? null,
        valueFormatter: (p) => (p.value == null ? "—" : soVn(p.value)) },
    ] as ColDef<HoaDonThue>[])),
    { colId: "maTv", headerName: "Thương vụ", field: "maTv", width: 90 },
    { colId: "tongTien", headerName: "Tổng G.Vốn", field: "tongTien", width: 130,
      type: "numericColumn", valueFormatter: (p) => soVn(p.value ?? 0) },
    { colId: "loLai", headerName: "Lỗ - Lãi", width: 90, type: "numericColumn",
      valueGetter: () => 0, valueFormatter: (p) => soVn(p.value ?? 0) },
          { colId: "ngayLienquan", headerName: "Ngày HĐLQ", width: 84,
      valueGetter: (p) => ngayNgan(p.data?.ngayLienquan ?? null) },
    { colId: "sohdLienquan", headerName: "Số HĐLQ", field: "sohdLienquan", width: 90 },
    { colId: "tichChatHdLienquan", headerName: "TC HĐLQ",
      field: "tichChatHdLienquan", width: 110 },
    { colId: "loaiHdLienquan", headerName: "Loại HĐLQ", field: "loaiHdLienquan", width: 80 },
    { colId: "mauSoHdLienquan", headerName: "Mã Số HĐLQ", field: "mauSoHdLienquan", width: 90 },
    { colId: "khhdLienquan", headerName: "KH HĐLQ", field: "khhdLienquan", width: 90 },
    { colId: "trangThaiHdLienQuan", headerName: "TT HĐLQ",
      field: "trangThaiHdLienQuan", width: 100,
      tooltipField: "trangThaiHdLienQuan" },
    { colId: "khhd", headerName: "Ký hiệu HĐ", field: "khhd", width: 100 },
    { colId: "tthaiHd", headerName: "Trạng thái", field: "tthaiHd", width: 100 },
    { colId: "ghiChu", headerName: "Ghi chú", field: "ghiChu", width: 120,
      tooltipField: "ghiChu" },
    // soSanh quyết định bộ cột: bật/tắt thì đổi hẳn. Bản gốc về sau đó KHÔNG dựng lại
    // cột — lechCuaHdCot ổn định (useCallback rỗng) và đọc `goc` qua gocRef nên tự có
    // số mới; refreshCells ở effect dưới lo phần vẽ lại.
  ], [soSanh, lechCuaHdCot]);

  const cotDuoi = useMemo<ColDef<HoaDonLine>[]>(() => [
    { colId: "sttLine", headerName: "STT", field: "sttLine", width: 48, pinned: "left" },
    { colId: "tenHang", headerName: "Tên hàng hoá dịch vụ", field: "tenHang",
      width: 300, tooltipField: "tenHang" },
    { colId: "dvt", headerName: "ĐVT", field: "dvt", width: 70 },
    // SL và ĐG giữ tới 4 số lẻ, khác các cột TIỀN chỉ giữ 2 (chốt Trường 17/08): hai cột
    // này là THỪA SỐ, cắt bớt số lẻ thì nhân ra không khớp Thành tiền ngay bên cạnh.
    { colId: "soLuong", headerName: "Số lượng", field: "soLuong", width: 96,
      type: "numericColumn", valueFormatter: (p) => dinhDang4SoLe(p.value ?? 0) },
    { colId: "donGia", headerName: "Đơn giá", field: "donGia", width: 120,
      type: "numericColumn", valueFormatter: (p) => dinhDang4SoLe(p.value ?? 0) },
    { colId: "thanhTien", headerName: "Thành tiền", field: "thanhTien", width: 130,
      type: "numericColumn", valueFormatter: (p) => soVn(p.value ?? 0),
      cellStyle: { backgroundColor: "#f5f5f5", fontWeight: 600 } },
    { colId: "ptVat", headerName: "% VAT", width: 66, type: "numericColumn",
      valueGetter: (p) => dinhDangPhanTramVat(p.data?.ptVat) },
    { colId: "ghiNo", headerName: "Nợ", width: 50,
      valueGetter: (p) => p.data?.ghiNo || "" },
    { colId: "ghiCo", headerName: "Có", width: 50,
      valueGetter: (p) => p.data?.ghiCo || "" },
    { colId: "tienCk", headerName: "C.Khấu", field: "tienCk", width: 80,
      type: "numericColumn", valueFormatter: (p) => soVn(p.value ?? 0) },
    { colId: "ghiChu", headerName: "Ghi chú", width: 200,
      valueGetter: (p) => p.data?.ghiChu || p.data?.tenHang || "",
      tooltipValueGetter: (p) => String(p.value ?? "") },
  ], []);

  const sumDuoi = useMemo(
    () => (hdDangChon?.lines ?? []).reduce((s, x) => s + x.thanhTien, 0),
    [hdDangChon]);

  // Đếm trên DANH SÁCH ĐÃ LỌC, không phải trên toàn sổ: người dùng đang lọc tháng 5 mà
  // báo số lệch của cả năm thì con số chẳng ăn nhập gì với cái đang nhìn.
  // "Chưa có bản gốc" đếm riêng — nó không phải lỗi số liệu, chỉ là tháng đó nạp trước
  // khi có bảng đối chiếu; nạp lại tháng đó là hết.
  const soLech = useMemo(
    () => (soSanhMo ? dsLoc.filter((x) => coLech(x)).length : 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dsLoc, soSanhMo, goc]);
  const soChuaCoGoc = useMemo(
    () => (soSanhMo ? dsLoc.filter((x) => !goc[x.maHd]).length : 0),
    [dsLoc, soSanhMo, goc]);

  return (
    <Modal
      title={
        <span>
          Danh sách hóa đơn GTGT{" "}
          {/* Tô đúng màu chiều (NT-11) để liếc tiêu đề là biết đang xem sổ nào */}
          <b style={{ color: laDauRa ? MAU_HD_RA : MAU_HD_VAO }}>
            {laDauRa ? "đầu ra" : "đầu vào"}
          </b>
          {" "}— {tenDonVi}
          {/* Dòng lệch nằm CUỐI bảng nên không tự đập vào mắt — con số ở tiêu đề là
              thứ cho biết có đáng cuộn xuống hay không, và cuộn xuống bao nhiêu. */}
          {soSanhMo && (
            <span style={{ marginLeft: 12, fontSize: 13, fontWeight: 400 }}>
              {gocDangTai ? "· đang lấy bản gốc…" : <>
                · đối chiếu bản gốc TCT:{" "}
                {soLech > 0
                  ? <b style={{ color: "#c00" }}>{soLech} hóa đơn lệch (ở cuối bảng)</b>
                  : <b style={{ color: "#080" }}>không hóa đơn nào lệch</b>}
                {soChuaCoGoc > 0 && (
                  <span style={{ color: "#888" }}>
                    {" "}· {soChuaCoGoc} chưa có bản gốc
                  </span>
                )}
              </>}
            </span>
          )}
        </span>
      }
      open={mo}
      onCancel={onDong}
      footer={null}
      width="100vw"
      style={{ top: 0, paddingBottom: 0, maxWidth: "100vw" }}
      styles={{
        body: {
          height: "calc(100vh - 88px)",
          overflow: "hidden",
          padding: 4,
        },
      }}
    >
      {/* NT-11: nhuộm theo chiều — VÀO đỏ, RA xanh. Modal mở toàn màn nên mất hẳn
          ngữ cảnh màu của màn cha, không đánh dấu thì không biết đang xem sổ nào. */}
      <div className={`ds-hoadon ${laDauRa ? "huong-ra" : "huong-vao"}`}>
        {/* ===== THANH LỌC TRÊN CÙNG ===== */}
        <div className="thanh-loc">
          <span className="nhan">
            Tháng
          </span>
          <Select size="small" style={{ width: 150 }} value={thang}
                  title="Tháng của cột Ngày — hóa đơn phát sinh trong tháng nào"
                  onChange={(v) => setThang(v)} options={optThang} />
          <span className="nhan">Năm {namLamViec}</span>
          {/* Refresh = về trạng thái ban đầu: đọc lại sổ VÀ bỏ hết dấu tích ở cột In.
              Giữ lại ghi đè cũ thì dấu của lượt trước bám sang danh sách vừa nạp,
              trong khi người dùng bấm Refresh chính là để làm lại từ đầu. */}
          <Button size="small" className="nut-xanhdg" loading={dangTai}
                  disabled={!onLamMoi}
                  onClick={() => { setInGhiDe({}); void onLamMoi?.(); }}
                  title={onLamMoi ? "Đọc lại sổ hóa đơn và bỏ hết dấu tích ở cột In"
                                  : "Màn cha chưa cấp hàm nạp lại"}>
            Refresh
          </Button>
          <span className="nhan">
            Tháng KT:
          </span>
          <Select size="small" style={{ width: 130 }} value={thangKT}
                  title="Tháng kê khai"
                  onChange={(v) => setThangKT(v)} options={optThang} />

          <Checkbox checked={cb.kiemTraThuTu}
                    onChange={(e) => datCb("kiemTraThuTu", e.target.checked)}>
            Kiểm tra thứ tự HĐ ra
          </Checkbox>

          <NutCho nhan="Cập nhật TV" lop="nut-hong" />
          <NutCho nhan="Xoá HĐ đánh dấu" />
          <NutCho nhan="Xem tờ khai gốc" />

          {/* Chỉ hiện ở chế độ so sánh: ngoài chế độ đó thì bản gốc không dùng vào việc
              gì, mà thanh này vốn đã chật. */}
          {soSanhMo && (
            <Button size="small" className="nut-xanh" loading={dangDung}
                    onClick={dungBanGoc}
                    title="Đọc lại file Excel danh sách đã tải sẵn trên đĩa để bù bản gốc.
Không vào mạng, không đụng vào sổ hóa đơn.">
              Lấy giá trị từ tờ khai
            </Button>
          )}
        </div>

        {/* Kết quả dò thứ tự — chỉ hiện khi đã tích ô kiểm tra */}
        {cb.kiemTraThuTu && (
          <div className={`bang-thung-so ${thungSo.length ? "co-loi" : "khong-loi"}`}>
            {thungSo.length === 0
              ? <>✓ Số hóa đơn liên tục, không có số nào bị thiếu
                  {" "}({dsLoc.length} HĐ đang xét)</>
              : <>⚠ Thủng số hóa đơn: {thungSo.join(" · ")}</>}
          </div>
        )}

        <div className="thanh-loc">
          <span className="nhan nhan-xanh">Tìm nhanh</span>
          <Input.Search size="small" allowClear style={{ width: 420 }}
                 placeholder="Số HĐ, ký hiệu, MST, tên đối tác, tên file. Enter để tìm"
                 value={oTuKhoa}
                 onChange={(e) => {
                   setOTuKhoa(e.target.value);
                   if (e.target.value === "") setTuKhoa("");
                 }}
                 onSearch={timNgay} />
          <Typography.Text type="secondary" style={{ fontSize: 14 }}>
            {dsLoc.length}/{dsHd.length} hóa đơn
            {soDanhDau > 0 && (
              <span title="Số hóa đơn bạn đang tích ở cột In">
                {" · "}<b>{soDanhDau}</b> HĐ đã tích ở cột In
              </span>
            )}
            {soDienDanhDau > 0 && (
              <span title="Hóa đơn vừa có chiết khấu vừa là HĐ điều chỉnh/thay thế — gợi ý, KHÔNG tự tích">
                {" · "}<b>{soDienDanhDau}</b> HĐ nên xem (CK + ĐC/TT)
              </span>
            )}
            {oTuKhoa !== tuKhoa && (
              <span style={{ color: "#d46b08" }}> Bấm Enter để tìm</span>
            )}
          </Typography.Text>
          <span style={{ flex: 1 }} />
          <Button size="small" className="nut-xanhla" disabled={!fileChon}
                  onClick={() => fileChon && onXemHtml(fileChon)}
                  title={fileChon ? `Mở bản HTML gốc của ${fileChon}`
                                  : "Chưa chọn hóa đơn"}>
            Xem ảnh gốc HĐ
          </Button>
          {/* Xóa hóa đơn ĐANG CHỌN. Phải tra lại dòng trong dsLoc chứ không truyền mỗi
              fileChon: hộp xác nhận cần khhd/soHd/tenKh để kế toán biết đang xóa cái gì. */}
          <Button size="small" danger disabled={!fileChon || dangXuLy}
                  onClick={() => {
                    const hd = dsLoc.find((x) => x.maHd === fileChon);
                    if (hd) xoaHoaDon(hd);
                  }}
                  title={fileChon ? `Xóa hóa đơn ${fileChon} khỏi sổ`
                                  : "Chưa chọn hóa đơn"}>
            Xóa HĐ
          </Button>
          <Button size="small" type="primary" disabled={!fileChon}
                  onClick={chonVaDong}>
            Chọn hóa đơn này
          </Button>
        </div>

        <div className="vung-luoi">
        <AgGridReact<HoaDonThue>
          ref={luoiTrenRef}
          theme={themeVfp}
          {...luoiVfpProps}
          {...nhoDoRongCot("ds_hoadon_tren")}
          rowData={dsLoc}
          getRowId={(p) => p.data.maHd}
          defaultColDef={colVfp}
          columnDefs={cotTren}
          overlayNoRowsTemplate="Không có hóa đơn nào khớp điều kiện lọc"
          rowClassRules={{ "dong-dang-chon": (p) => p.data?.maHd === fileChon }}
          onCellClicked={(e) => e.data && chonDong(e.data.maHd)}
          onRowDoubleClicked={(e) => {
            // Dòng chưa lên sổ: đóng modal rồi cũng chẳng có hóa đơn nào để mở.
            if (e.data && !chuaLenSo(e.data.maHd)) { onChon(e.data.maHd); onDong(); }
          }}
          onCellFocused={(e) => {
            if (e.rowIndex == null) return;
            const node = e.api.getDisplayedRowAtIndex(e.rowIndex);
            const maHd = node?.data?.maHd;
            if (maHd && maHd !== fileChon) chonDongHoan(maHd);
          }}

          onCellKeyDown={(e) => {
            const phim = (e.event as KeyboardEvent | null)?.key;
            if (phim !== "Enter") return;
            const maHd = e.data?.maHd;
            if (!maHd) return;
            huyHoan();               // bỏ lượt hoãn đang chờ, gọi thẳng
            setFileChon(maHd);
            onChon(maHd, true);      // buộc hỏi lại server
          }}
        />
        </div>

        <div className="vung-luoi-phu khoi-luoi-phu">
          <div className="hang-cong-cu">
            <Typography.Text strong style={{ fontSize: 14 }}>
              Chi tiết hàng hoá dịch vụ
            </Typography.Text>
            {hdDangChon ? (
              <Typography.Text style={{ fontSize: 14 }}>
                — {hdDangChon.khhd}/{hdDangChon.soHd} · {ngayNgan(hdDangChon.ngay)} ·{" "}
                {hdDangChon.tenKh} {" "}
                <b>{hdDangChon.lines.length || hdDangChon.soDongHang}</b> dòng
              </Typography.Text>
            ) : (
              <Typography.Text type="secondary" style={{ fontSize: 14 }}>
                Bấm một hóa đơn ở bảng trên để xem dòng hàng
              </Typography.Text>
            )}
            <span style={{ flex: 1 }} />
            <Typography.Text style={{ fontSize: 14 }}>
              Tổng thành tiền{" "}
              <b style={{ color: !hdDangChon
                            || Math.abs(hdDangChon.tienHang - sumDuoi) < 10
                              ? "#389e0d" : "#cf1322" }}>
                {soVn(sumDuoi)}
              </b>
            </Typography.Text>
          </div>
          <div className="khung-phu">
            <AgGridReact<HoaDonLine>
              theme={themeVfp}
              {...luoiVfpProps}
              {...nhoDoRongCot("ds_hoadon_duoi")}
              rowData={hdDangChon?.lines ?? []}
              getRowId={(p) => String(p.data.sttLine)}
              defaultColDef={colVfp}
              columnDefs={cotDuoi}
              overlayNoRowsTemplate={hdDangChon
                ? "Hóa đơn này không có dòng hàng"
                : "Chưa chọn hóa đơn"}
            />
          </div>
        </div>

        {/* ===== VÙNG CÔNG CỤ: 4 CỘT THEO CHỨC NĂNG =====
            Bản VFP gốc dàn nút theo thứ tự lịch sử, ai thêm gì thì nhét vào chỗ
            trống — nhìn không ra nhóm. Ở đây gom lại thành 4 nhóm nghiệp vụ, mỗi
            nhóm một cột có tiêu đề, để tìm nút theo VIỆC muốn làm chứ không phải
            quét cả vùng. Nội dung nút giữ nguyên, chỉ đổi chỗ ngồi.

            Cả vùng THU GỌN được và mặc định đóng — nhường hết chiều cao cho hai
            lưới, mở ra khi cần thao tác. */}
        {/* Thanh gồm HAI nút nên phải là div bọc ngoài — button lồng button là HTML
            không hợp lệ, trình duyệt tự tách ra và bố cục vỡ. */}
        <div className="thanh-thu-gon">
          <button type="button" className="nut-thu-gon"
                  aria-expanded={moCongCu}
                  onClick={() => setMoCongCu((v) => !v)}
                  title={moCongCu ? "Thu gọn vùng công cụ" : "Mở vùng công cụ"}>
            <span className={`mui-ten ${moCongCu ? "mo" : ""}`}>▶</span>
            <span>Công cụ nghiệp vụ</span>
            <span className="ghi-chu-thu-gon">
              Nạp dữ liệu · Định khoản · Hàng KM · Ghi chú &amp; In
            </span>
          </button>
          {/* Chỉ hiện khi đang mở: đóng rồi thì nút ✕ chẳng còn gì để đóng */}
          {moCongCu && (
            <button type="button" className="nut-dong-cong-cu"
                    onClick={() => setMoCongCu(false)}
                    aria-label="Đóng vùng công cụ"
                    title="Đóng vùng công cụ">
              ✕
            </button>
          )}
        </div>

        {moCongCu && (
        <div className="luoi-cong-cu">

          {/* --- CỘT 1: NẠP DỮ LIỆU & ĐỒNG BỘ --- */}
          <section className="nhom-cc">
            <h4>Nạp dữ liệu &amp; Đồng bộ</h4>
            <div className="hang-cong-cu">
              <NutCho nhan="Đọc HĐ PDF" lop="nut-xanhla" />
              <NutCho nhan="Đọc HĐ PDF cùng XML" lop="nut-xanhla" />
            </div>
            <div className="hang-cong-cu">
              <NutCho nhan="Đọc tờ khai Hải quan" lop="nut-xanhla" />
              <NutCho nhan="Đọc HĐ Hủy" />
            </div>
            <div className="hang-cong-cu">
              <NutCho nhan="Lấy XML 2015" lop="nut-xanhdg" />
              <NutCho nhan="Xóa HĐ lấy từ Excel" lop="nut-cam" />
            </div>
            <div className="hang-cong-cu">
              <NutCho nhan="Đồng bộ Khách hàng" lop="nut-xanhdg" />
              <NutCho nhan="Đồng bộ Hàng hóa" lop="nut-xanhdg" />
            </div>
            <Checkbox checked={cb.tongHopKhiDongBo}
                      onChange={(e) => datCb("tongHopKhiDongBo", e.target.checked)}>
              Tổng hợp khi đồng bộ
            </Checkbox>
            <Checkbox checked={cb.themVaoDanhMuc}
                      onChange={(e) => datCb("themVaoDanhMuc", e.target.checked)}>
              Thêm vào danh mục KH khi không có MST
            </Checkbox>
            <Checkbox checked={cb.dongBoBoQuaDuoi}
                      onChange={(e) => datCb("dongBoBoQuaDuoi", e.target.checked)}>
              Đồng bộ bỏ qua đuôi '_AD
            </Checkbox>
            <Checkbox checked={cb.themMoiCaKhiDaCo}
                      onChange={(e) => datCb("themMoiCaKhiDaCo", e.target.checked)}>
              Thêm mới cả khi đã có HĐ
            </Checkbox>
            <Checkbox checked={cb.xoaDuLieuTruocKhiLay}
                      onChange={(e) => datCb("xoaDuLieuTruocKhiLay", e.target.checked)}>
              Xóa dữ liệu trước khi lấy
            </Checkbox>
            <Checkbox checked={cb.duongDanKhac}
                      onChange={(e) => datCb("duongDanKhac", e.target.checked)}>
              Đường dẫn khác
            </Checkbox>
            <Checkbox checked={cb.layDuLieuTheoDuongDan}
                      onChange={(e) => datCb("layDuLieuTheoDuongDan", e.target.checked)}>
              Lấy dữ liệu theo đường dẫn gốc
            </Checkbox>
          </section>

          {/* --- CỘT 2: ĐỊNH KHOẢN & KIỂM TRA --- */}
          <section className="nhom-cc">
            <h4>Định khoản &amp; Kiểm tra</h4>
            <div className="hang-cong-cu">
              <NutCho nhan="Định khoản lại" lop="nut-xanhdg" />
              <NutCho nhan="Kiểm tra định khoản" lop="nut-xanhdg" />
            </div>
            <div className="hang-cong-cu">
              <NutCho nhan="Đổi ĐK theo TK kho" lop="nut-xanhdg" />
              <NutCho nhan="HĐ SX Tồn kho" lop="nut-xanhdg" />
            </div>
            <div className="hang-cong-cu">
              <NutCho nhan="Loại bỏ hạch 154" lop="nut-tim" />
              <NutCho nhan="Chuyển HĐ 154 sang H.Hóa" lop="nut-xanhdg" />
            </div>
            <div className="hang-cong-cu">
              <NutCho nhan="Các HĐ trên 20T" lop="nut-xanhdg" />
              <NutCho nhan="Kiểm tra tên trùng" lop="nut-xanhdg" />
            </div>
            <div className="hang-cong-cu">
              {/* BR-TK-06 — bấm lần 1 tự tích, lần 2 xử lý. Xem xuLyTtDc(). */}
              <Button size="small" className="nut-vang" loading={dangXuLy}
                      onClick={() => void xuLyTtDc()}
                      title={dsLienQuan.length === 0
                        ? "Kỳ đang lọc không có hóa đơn thay thế/điều chỉnh"
                        : `${dsLienQuan.length} hóa đơn liên quan — bấm để tích chọn, `
                          + "bấm lần nữa để xử lý"}>
                Xử lý HĐ TT-ĐC-XB
                {dsLienQuan.length > 0 && ` (${dsLienQuan.length})`}
              </Button>
              <NutCho nhan="Đổi thông tin HĐ" lop="nut-xanhdg" />
            </div>
            <div className="hang-cong-cu">
              <div className="o-tong" style={{ minWidth: 74 }}>{soVn(0)}</div>
              <NutCho nhan="Cập nhật % VAT" lop="nut-xanhdg" />
            </div>
            <div className="hang-cong-cu">
              <NutCho nhan="Đánh dấu HĐ có VAT" lop="nut-xanhla" />
              <NutCho nhan="Đánh dấu HĐ có CK" lop="nut-cam" />
            </div>
            {/* Nhóm "đổi hàng loạt": radio chọn cột, nút Đổi... áp cho HĐ đã lọc */}
            <Radio.Group size="small" value={nhomDoi}
                         onChange={(e) => setNhomDoi(e.target.value)}>
              <Radio value="ten_kh">Đổi tên KH</Radio>
              <Radio value="ghi_no">Đổi Ghi nợ</Radio>
              <Radio value="ghi_co">Đổi ghi có</Radio>
              <Radio value="thuong_vu">Thương vụ</Radio>
            </Radio.Group>
            <div className="hang-cong-cu">
              <NutCho nhan="Đổi hàng loạt" lop="nut-hong" />
              <Select size="small" style={{ flex: 1, minWidth: 120 }} placeholder=" " />
            </div>
            <div className="hang-cong-cu">
              <Checkbox checked={cb.chiLayDanhDau}
                        onChange={(e) => datCb("chiLayDanhDau", e.target.checked)}>
                Chỉ lấy HĐ đánh dấu
              </Checkbox>
              <Checkbox checked={cb.tatCa}
                        onChange={(e) => datCb("tatCa", e.target.checked)}>
                Tất Cả
              </Checkbox>
              <Checkbox checked={cb.ghiNho}
                        onChange={(e) => datCb("ghiNho", e.target.checked)}>
                Ghi nhớ
              </Checkbox>
            </div>
          </section>

          {/* --- CỘT 3: HÀNG KM & CHIẾT KHẤU --- */}
          <section className="nhom-cc">
            <h4>Hàng KM &amp; Chiết khấu</h4>
            <div className="hang-cong-cu">
              <NutCho nhan="Thêm hàng KM" lop="nut-xanhdg" />
              <NutCho nhan="Thêm hàng KM nhiều HĐ" lop="nut-xanhdg" />
            </div>
            <div className="hang-cong-cu">
              <NutCho nhan="Đổi hàng KM" lop="nut-xanhdg" />
              <NutCho nhan="Thêm KM cho HĐ Ra" lop="nut-xanhla" />
            </div>
            <div className="hang-cong-cu">
              <NutCho nhan="Tách hàng KM sang HĐ" lop="nut-xanhdg" />
              <NutCho nhan="Tách dòng hàng KM" lop="nut-xanhdg" />
            </div>
            <div className="hang-cong-cu">
              <NutCho nhan="Thêm KM theo DM hàng có sẵn" lop="nut-vang" />
            </div>
            <div className="hang-cong-cu">
              <NutCho nhan="Thêm C.Khấu" lop="nut-tim" />
              <div className="o-tong" style={{ minWidth: 74 }}>{soVn(0)}</div>
              <NutCho nhan="Chuyển C.Khấu" lop="nut-cam" />
            </div>
            <div className="hang-cong-cu">
              <NutCho nhan="Mark All Line" lop="nut-xanhdg" />
              <NutCho nhan="Mark 10 Line" lop="nut-xanhdg" />
              <Input size="small" style={{ width: 44 }} value="1" readOnly />
            </div>
            {/* Lỗ lãi: cần giá vốn nên xếp cùng nhóm giá, không nằm ở nhóm in */}
            <div className="hang-cong-cu">
              <NutCho nhan="Tính giá trị lãi lỗ" lop="nut-xanhla" />
              <NutCho nhan="Tìm Hàng lỗ theo HĐ" lop="nut-hong" />
            </div>
            <div className="hang-cong-cu">
              <NutCho nhan="Thay đổi ĐG theo GV" lop="nut-vang" />
              <div className="o-tong" style={{ minWidth: 74 }}>{soVn(0)}</div>
            </div>
            <div className="hang-cong-cu">
              <NutCho nhan="Tạo HĐ tự tính" lop="nut-xanhla" />
              <NutCho nhan="Tạo HĐ từ TK" lop="nut-xanhla" />
              <NutCho nhan="Tạo HĐ từ TK New" lop="nut-cam" />
            </div>
            <div className="hang-cong-cu">
              <NutCho nhan="Thêm GT cho HĐ lẻ" />
              <Checkbox checked={cb.giaDaCoThue}
                        onChange={(e) => datCb("giaDaCoThue", e.target.checked)}>
                Giá đã có thuế
              </Checkbox>
            </div>
            <div className="hang-cong-cu">
              <Checkbox checked={cb.lapRapCB1}
                        onChange={(e) => datCb("lapRapCB1", e.target.checked)}>
                Lắp ráp CB 1 (1521)
              </Checkbox>
              <Checkbox checked={cb.chiLayFileExcelSP}
                        onChange={(e) => datCb("chiLayFileExcelSP", e.target.checked)}>
                Chỉ lấy Excel SP Lỗ lãi
              </Checkbox>
            </div>
            <Radio.Group size="small" value={nhomDoi2}
                         onChange={(e) => setNhomDoi2(e.target.value)}>
              <Radio value="ten_hang">Đổi tên hàng</Radio>
              <Radio value="ghi_no">Đổi Ghi nợ</Radio>
              <Radio value="ghi_co">Đổi ghi có</Radio>
              <Radio value="tv">Đổi TV</Radio>
            </Radio.Group>
            <div className="hang-cong-cu">
              <NutCho nhan="Đổi..." lop="nut-vang" />
              <Select size="small" style={{ flex: 1, minWidth: 120 }} placeholder="Tên" />
            </div>
            <Checkbox checked={cb.nhapHangTraLai}
                      onChange={(e) => datCb("nhapHangTraLai", e.target.checked)}>
              Nhập hàng trả lại
            </Checkbox>
          </section>

          {/* --- CỘT 4: GHI CHÚ & IN ẤN --- */}
          <section className="nhom-cc">
            <h4>Ghi chú &amp; In ấn</h4>
            <Input.TextArea rows={2} placeholder="Nội dung ghi chú áp cho HĐ đã chọn" />
            <div className="hang-cong-cu">
              <NutCho nhan="Sửa ghi chú" lop="nut-vang" />
              <NutCho nhan="Thêm ghi chú" lop="nut-vang" />
              <NutCho nhan="Copy File ảnh" lop="nut-vang" />
            </div>
            <Checkbox checked={cb.chuyenSangGhiChuG}
                      onChange={(e) => datCb("chuyenSangGhiChuG", e.target.checked)}>
              Chuyển sang GHI_CHU
            </Checkbox>
            <Checkbox checked={cb.chuyenTenHangSangGhiChu}
                      onChange={(e) => datCb("chuyenTenHangSangGhiChu", e.target.checked)}>
              Chuyển Tên hàng sang ghi chú bỏ trống
            </Checkbox>

            <div className="vach-nhom" />

            <div className="hang-cong-cu">
              <NutCho nhan="In phiếu TC" lop="nut-vang" />
              <NutCho nhan="In Phiếu xuất kho" lop="nut-xanhla" />
            </div>
            <div className="hang-cong-cu">
              <NutCho nhan="In P.Xuất kèm File PDF" lop="nut-xanhla" />
              <NutCho nhan="Công cụ" />
            </div>
            <div className="hang-cong-cu">
              <Checkbox checked={cb.printPreview}
                        onChange={(e) => datCb("printPreview", e.target.checked)}>
                Print Preview
              </Checkbox>
              <Checkbox checked={cb.inTatCa}
                        onChange={(e) => datCb("inTatCa", e.target.checked)}>
                In tất cả
              </Checkbox>
              <Checkbox checked={cb.nganHang}
                        onChange={(e) => datCb("nganHang", e.target.checked)}>
                Ngân hàng
              </Checkbox>
            </div>
            <Checkbox checked={cb.khongInHangKM}
                      onChange={(e) => datCb("khongInHangKM", e.target.checked)}>
              Không in hàng KM khi in Bảng kê bán lẻ
            </Checkbox>
            <Checkbox checked={cb.nhomTheoTenHang}
                      onChange={(e) => datCb("nhomTheoTenHang", e.target.checked)}>
              Nhóm theo Tên hàng khi in chi tiết
            </Checkbox>
            <Checkbox checked={cb.theoNgayNhapHang}
                      onChange={(e) => datCb("theoNgayNhapHang", e.target.checked)}>
              Theo ngày nhập hàng
            </Checkbox>
          </section>
        </div>
        )}
      </div>
    </Modal>
  );
}
