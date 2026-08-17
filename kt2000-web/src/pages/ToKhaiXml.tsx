import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Modal, Table, Typography, Empty, Upload, Button, Tag, message,
         Input } from "antd";
import { FileTextOutlined, InboxOutlined, FileExcelOutlined,
         FileDoneOutlined, DownloadOutlined, FilePdfOutlined,
         ReloadOutlined, EyeOutlined, DeleteOutlined,
         ExclamationCircleFilled, SearchOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { thueBaoCao, thueBaoCaoDonVi, thueDocBangKe, thueKhoBangKe, thueRaSoat,
         thueLapToKhai, thueToKhaiXml, thueHtmlHoaDon, thueXoaHoaDon,
         loiApi } from "../api";
import HtmlHoaDon from "./HtmlHoaDon";
import type { BaoCaoThue, BangKeHoaDon, HoaDonFile, KetQuaRaSoat, NhomSuat,
              ToKhaiGtgt } from "../api";
import BangToKhai from "./BangToKhai";
import "./bang-to-khai.css";
import "./to-khai-xml.css";

const tien = (v: number | null | undefined) =>
  v == null ? "" : v.toLocaleString("vi-VN", { minimumFractionDigits: 2,
                                               maximumFractionDigits: 2 });

const boDau = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "")
   .replace(/đ/g, "d").replace(/Đ/g, "D")
   .toLowerCase().trim();

const tienTron = (v: number | null | undefined) =>
  v == null ? "" : v.toLocaleString("vi-VN", { maximumFractionDigits: 0 });

function docXmlHoaDon(noiDung: string, tenFile: string): HoaDonFile | null {
  try {
    const doc = new DOMParser().parseFromString(noiDung, "text/xml");
    if (doc.querySelector("parsererror")) return null;

    const lay = (cha: Element | null, ten: string) =>
      cha?.getElementsByTagName(ten)[0]?.textContent?.trim() ?? "";
    const so = (cha: Element | null, ten: string) => {
      const v = Number(lay(cha, ten));
      return Number.isFinite(v) ? v : 0;
    };

    const dl = doc.getElementsByTagName("DLHDon")[0] ?? null;
    const chung = dl?.getElementsByTagName("TTChung")[0] ?? null;
    const nd = dl?.getElementsByTagName("NDHDon")[0] ?? null;
    if (!chung || !nd) return null;

    const ban = nd.getElementsByTagName("NBan")[0] ?? null;
    const tt = nd.getElementsByTagName("TToan")[0] ?? null;

    const tienVat = so(tt, "TgTThue");
    const tongTien = so(tt, "TgTTTBSo");
    let tienHang = so(tt, "TgTCThue");
    if (tienHang === 0) tienHang = tongTien - tienVat;

    return {
      tenFile,
      huong: "",
      mst: lay(ban, "MST"),
      khhd: lay(chung, "KHHDon"),
      soHd: lay(chung, "SHDon"),
      ngay: lay(chung, "NLap"),
      tenDoiTac: lay(ban, "Ten"),
      tienHang,
      tienVat,
    };
  } catch {
    return null;
  }
}

const ngayNgan = (s: string | null) => {
  const p = (s ?? "").slice(0, 10).split("-");
  return p.length === 3 && p[0] ? `${p[2]}/${p[1]}/${p[0].slice(2)}` : "";
};

const cotHoaDon = (
  vaiTro: string,
  xem: (m: BangKeHoaDon) => void,
  xoa: (m: BangKeHoaDon) => void,
): ColumnsType<BangKeHoaDon> => [
  { title: "STT", dataIndex: "stt", width: 44, align: "right", fixed: "left" },
  { title: "KHHD", dataIndex: "khHd", width: 80 },
  { title: "Số HĐ", dataIndex: "soHd", width: 86 },
  { title: "Ngày", dataIndex: "ngay", width: 76,
    render: (v: string | null) => ngayNgan(v) },
  { title: `Tên ${vaiTro}`, dataIndex: "tenDoiTac", width: 230, ellipsis: true,
    render: (v: string | null) => <span title={v ?? ""}>{v}</span> },
  { title: "MST", dataIndex: "mstDoiTac", width: 120 },
  { title: "Tên hàng", dataIndex: "matHang", width: 170, ellipsis: true,
    render: (v: string | null) => <span title={v ?? ""}>{v}</span> },
  { title: "Tiền hàng", dataIndex: "doanhThuChuaVat", width: 130, align: "right",
    render: (v: number) => tien(v) },
  { title: "VAT", dataIndex: "thueSuat", width: 50, align: "right",
    render: (v: number | null) => v == null ? "" : String(v) },
  { title: "Tiền VAT", dataIndex: "thueGtgt", width: 120, align: "right",
    render: (v: number) => tien(v) },
  { title: "Ghi chú", dataIndex: "ghiChu", width: 160, ellipsis: true,
    render: (v: string | null) => <span title={v ?? ""}>{v}</span> },
  { title: "", dataIndex: "xem", width: 76, align: "center", fixed: "right",
    render: (_: unknown, m: BangKeHoaDon) => (
      <>
        <Button type="text" size="small" icon={<EyeOutlined />}
                title={`Xem hóa đơn ${m.khHd ?? ""}/${m.soHd ?? ""}`}
                onClick={() => xem(m)} />
        <Button type="text" size="small" danger icon={<DeleteOutlined />}
                className="nut-xoa-hd"
                title={`Xóa hóa đơn ${m.khHd ?? ""}/${m.soHd ?? ""}`}
                onClick={() => xoa(m)} />
      </>
    ) },
];

const RONG_LUOI = 44 + 80 + 86 + 76 + 230 + 120 + 170 + 130 + 50 + 120 + 160 + 76;

interface HdLech {
  khhd: string;
  soHd: string;
  ten: string;
  tienHang: number;
  tienVat: number;
}

interface KetQuaSoat {
  tenFile: string;
  huong: string;                  // VAO | RA — bảng kê của cổng chỉ một hướng
  thieuTrongSo: HdLech[];         // có trong file, chưa nạp vào sổ
  thieuTrongFile: HdLech[];       // có trong sổ, không thấy trong bảng kê
  lechTien: {
    khhd: string; soHd: string; ten: string;
    soHang: number; fileHang: number; soVat: number; fileVat: number;
  }[];
}

interface TongExcel {
  tenFile: string;
  dt: number;    // Σ tiền hàng chưa VAT
  vat: number;   // Σ tiền VAT
  soHd: number;
}

const chuanSoHd = (tho: string) => {
  const s = (tho ?? "").trim();
  if (!s || !/^\d+$/.test(s)) return s;
  const loi = s.replace(/^0+/, "") || "0";
  return loi.length >= 7 ? loi : loi.padStart(7, "0");
};

const chuanKhhd = (kh: string | null) =>
  (kh ?? "").trim().toUpperCase().replace(/^\d+/, "");

const khoaHd = (khhd: string | null, soHd: string | null) =>
  `${chuanKhhd(khhd)}|${chuanSoHd(soHd ?? "")}`;

// Thuế suất HỢP LỆ theo luật GTGT hiện hành, cộng các mã ÂM mà cổng dùng cho hàng
// không có thuế suất thông thường (-1, -2 đo được trên sổ thật).
//
// Ngoài danh sách này là bất thường — thường là %VAT BÌNH QUÂN của hóa đơn trộn nhiều
// mức (6% = trộn 5 và 8, 7% = trộn 5 và 10). Nay số lấy từ nhóm gom theo DÒNG nên
// chuyện đó hết xảy ra, nhưng vẫn giữ phép kiểm: gặp mức lạ là dữ liệu có vấn đề,
// phải nói ra thay vì lặng lẽ bỏ khỏi bảng.
const SUAT_HOP_LE = new Set([-2, -1, 0, 5, 8, 10]);
const suatLa = (s: number) => !SUAT_HOP_LE.has(s);

interface Props {
  mo: boolean;
  onDong: () => void;
  maDonVi: string;
  tenDonVi?: string | null;
  nam: number;
  thang: number;
  vatKhauTruKyTruoc?: number | null;
  bcCoSan?: BaoCaoThue | null;
}

export default function ToKhaiXml(
  { mo, onDong, maDonVi, tenDonVi, nam, thang, vatKhauTruKyTruoc,
    bcCoSan }: Props) {

  const [bc, setBc] = useState<BaoCaoThue | null>(null);
  const [tai, setTai] = useState(false);

  // ----- File XML tờ khai kỳ trước (thả vào ô bên phải khối chỉ tiêu) -----
  const [tenFileTk, setTenFileTk] = useState<string | null>(null);
  const [ct43, setCt43] = useState<number | null>(null);
  const [kyTruoc, setKyTruoc] = useState<string | null>(null);
  const kyLienTruoc = useMemo(() => {
    const t = thang <= 1 ? 12 : thang - 1;
    const n = thang <= 1 ? nam - 1 : nam;
    return `${String(t).padStart(2, "0")}/${n}`;
  }, [nam, thang]);

  const docToKhaiKyTruocTuChuoi = (noiDung: string, tenFile: string) => {
    setXmlKyTruoc(noiDung);
    setTenFileTk(tenFile);
    try {
      const x = new DOMParser().parseFromString(noiDung, "text/xml");
      const lay = (t: string) =>
        x.getElementsByTagName(t)[0]?.textContent?.trim() ?? "";
      const v = lay("ct43");
      setCt43(v ? Number(v) : null);
      setKyTruoc(lay("kyKKhai") || null);
    } catch {
      setCt43(null);
      setKyTruoc(null);
      message.error(`${tenFile} không đọc được — có đúng là XML tờ khai không?`);
    }
  };

  const luotRef = useRef(0);
  const [timVao, setTimVao] = useState("");
  const [timRa, setTimRa] = useState("");
  const napBaoCao = useCallback(async () => {
    const luot = ++luotRef.current;
    setTai(true);
    try {
      const r = await (maDonVi ? thueBaoCaoDonVi(maDonVi, nam, thang)
                               : thueBaoCao(thang));
      if (luot === luotRef.current) setBc(r.data);
    } catch (e) {
      if (luot !== luotRef.current) return;
      setBc(null);
      message.error(loiApi(e, maDonVi
        ? `Không đọc được sổ thuế của ${maDonVi}` : "Không đọc được sổ thuế"));
    } finally {
      if (luot === luotRef.current) setTai(false);
    }
  }, [maDonVi, nam, thang]);

  useEffect(() => {
    if (!mo) return;
    if (bcCoSan) {
      const id = setTimeout(() => {
        luotRef.current++;
        setBc(bcCoSan);
        setTai(false);
      }, 0);
      return () => clearTimeout(id);
    }
    const id = setTimeout(() => void napBaoCao(), 0);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mo, maDonVi, nam, thang, bcCoSan]);

  const tong = useMemo(() => {
    const ra = bc?.banRa ?? [];
    const vao = bc?.muaVao ?? [];
    // SÁU DÒNG CỐ ĐỊNH, luôn hiện đủ kể cả khi kỳ đó không phát sinh — bảng đứng yên
    // giữa các kỳ nên mắt quen chỗ, và số 0 cũng là một thông tin ("kỳ này không có
    // hàng 10%") khác hẳn việc dòng đó biến mất.
    //
    // Số lấy từ nhomBanRa của SERVER — gom theo pt_vat của DÒNG hàng, KHÔNG theo
    // thueSuat ở header. Header là %VAT bình quân của cả hóa đơn: hóa đơn trộn nhiều
    // mức cho ra con số không có trong luật thuế. Đo thật DAT_VIET_THANH kỳ 7 (18/08)
    // ba hóa đơn 0000766/0000777 (5%+8% → header 6%) và 0000778 (5%+8% → header 7%);
    // gom theo header thì mọc ra hai nhóm 6%/7% không có thật, còn 5% và 8% thì thiếu
    // đúng phần đó. Đây là BR-TK-18 mà engine tờ khai đã áp — nay màn này dùng chung
    // một cách tính, nên hai nơi không còn ra hai số khác nhau.
    const lay = (ds: NhomSuat[] | undefined, s: number) => {
      const n = (ds ?? []).find((x) => x.thueSuat === s);
      return { dt: n?.doanhThu ?? 0, vat: n?.thue ?? 0 };
    };
    const nhomRa = bc?.nhomBanRa;
    // Mọi mức ÂM gộp vào một dòng "không chịu thuế": -1 và -2 đều là hàng không có
    // thuế suất thông thường, tách ra chỉ thêm dòng mà không thêm thông tin.
    const raKct = (nhomRa ?? []).filter((x) => x.thueSuat < 0)
      .reduce((t, x) => ({ dt: t.dt + x.doanhThu, vat: t.vat + x.thue }),
              { dt: 0, vat: 0 });
    // Mức LẠ (không nằm trong bộ hợp lệ): gộp riêng để không âm thầm biến mất khỏi
    // bảng. Bình thường bằng 0 — khác 0 là dấu hiệu dữ liệu có vấn đề, phải nhìn ra.
    const raLa = (nhomRa ?? []).filter((x) => suatLa(x.thueSuat))
      .reduce((t, x) => ({ dt: t.dt + x.doanhThu, vat: t.vat + x.thue, soHd: t.soHd + x.soHd }),
              { dt: 0, vat: 0, soHd: 0 });
    return {
      ra0: lay(nhomRa, 0), ra5: lay(nhomRa, 5),
      ra8: lay(nhomRa, 8), ra10: lay(nhomRa, 10),
      raKct, raLa,
      raDt: ra.reduce((t, x) => t + x.doanhThuChuaVat, 0),
      raVat: ra.reduce((t, x) => t + x.thueGtgt, 0),
      vaoDt: vao.reduce((t, x) => t + x.doanhThuChuaVat, 0),
      vaoVat: vao.reduce((t, x) => t + x.thueGtgt, 0),
      soRa: ra.length, soVao: vao.length,
    };
  }, [bc]);

  const [dangSoat, setDangSoat] = useState(false);
  const oFileVao = useRef<HTMLInputElement | null>(null);
  const oFileRa = useRef<HTMLInputElement | null>(null);
  const [tongExcelRa, setTongExcelRa] = useState<TongExcel | null>(null);
  const [dangTuSoat, setDangTuSoat] = useState(false);
  const luotSoatRef = useRef(0);
  const [hdDangXem, setHdDangXem] = useState<BangKeHoaDon | null>(null);

  // ----- LỌC LƯỚI THEO KẾT QUẢ SOÁT -----
  // Bấm "Tìm HĐ lệch" xong thì CHÍNH lưới hóa đơn của bảng đó chỉ còn dòng lệch, thay
  // vì dựng thêm một danh sách thứ hai bên dưới. Hai danh sách trong một màn hình buộc
  // người dùng đối chiếu qua lại bằng mắt: bảng dưới nêu số hóa đơn, muốn xem chi tiết
  // (ngày, thuế suất, tiền hàng…) lại phải cuộn lên lưới trên dò lại từng cái.
  //
  // Giữ MÃ hóa đơn chứ không giữ bản sao dòng: lưới vẫn đọc từ `bc` như thường, nên
  // xóa/sửa hóa đơn xong nạp lại là số trên lưới tự đúng, không phải đồng bộ hai nơi.
  //
  // null = chưa soát, hiện đủ. Set rỗng = đã soát và KHỚP HẾT (khác hẳn chưa soát).
  const [locLech, setLocLech] = useState<{
    huong: "VAO" | "RA";
    nhan: string;                 // tên file / "kho bán ra · 3 file" — hiện trên đầu lưới
    maHd: Set<string>;            // mã hóa đơn CÓ TRONG SỔ mà lệch
    thieuTrongSo: HdLech[];       // có trong bảng kê, sổ chưa có ⇒ không có dòng để lọc
  } | null>(null);

  /**
   * Đổi kết quả đối chiếu của server thành bộ lọc cho lưới.
   *
   * Hai loại vấn đề CÓ dòng trong sổ (lệch tiền, có sổ mà thiếu trong bảng kê) thì tra
   * ra mã hóa đơn để lọc lưới. Riêng "có trong bảng kê, sổ CHƯA CÓ" thì không có dòng
   * nào để lọc — giữ riêng và hiện thành dải cảnh báo trên đầu lưới, vì đây lại đúng
   * là loại nghiêm trọng nhất (khai thiếu hẳn hóa đơn).
   */
  // Sổ đọc qua REF: hàm này chỉ chạy lúc người dùng bấm soát, mà để `bc` vào deps thì
  // mỗi lần nạp lại sổ là soatKho đổi theo → effect tự soát chạy lại → thừa một lượt
  // quét đĩa + đọc Excel. Cùng lý lẽ với namRef.
  const bcRef = useRef(bc);
  useEffect(() => { bcRef.current = bc; }, [bc]);

  const dungLocLech = useCallback(
    (huong: "VAO" | "RA", nhan: string, dc: KetQuaRaSoat) => {
      const so = bcRef.current;
      const soSach = (huong === "VAO" ? so?.muaVao : so?.banRa) ?? [];
      // Tra theo (ký hiệu, số HĐ) đã chuẩn hóa — cùng khóa mà nhánh chọn file tay dùng,
      // vì sổ ghi ký hiệu kèm mẫu số ('1C26TNT') còn cổng chỉ ghi ký hiệu ('C26TNT').
      const theoKhoa = new Map(soSach.map((x) => [khoaHd(x.khHd, x.soHd), x.maHd]));
      const ma = new Set<string>();
      for (const x of [...dc.lechTien, ...dc.thieuTrongFile]) {
        // maHd server trả sẵn với nhánh lệch tiền; nhánh kia phải tra ngược.
        const m = x.maHd ?? theoKhoa.get(khoaHd(x.khhd ?? "", x.soHd ?? ""));
        if (m) ma.add(m);
      }
      return {
        huong, nhan, maHd: ma,
        thieuTrongSo: dc.thieuTrongSo.map((x) => ({
          khhd: x.khhd ?? "", soHd: x.soHd ?? "", ten: x.tenDoiTac ?? "",
          tienHang: x.tienHangFile ?? 0, tienVat: x.tienVatFile ?? 0,
        })),
      };
    }, []);

  const xoaHoaDon = useCallback((m: BangKeHoaDon) => {
    Modal.confirm({
      title: "Xóa hóa đơn khỏi sổ?",
      icon: <ExclamationCircleFilled style={{ color: "#cf1322" }} />,
      width: 520,
      content: (
        <div style={{ fontSize: 13, lineHeight: 1.6 }}>
          <div>
            <b>{m.khHd ?? ""}/{m.soHd ?? ""}</b>
            {m.tenDoiTac ? ` — ${m.tenDoiTac}` : ""}
          </div>
          <div style={{ color: "#8c8c8c" }}>{m.maHd}</div>
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
          await thueXoaHoaDon(m.maHd, maDonVi || undefined);
          message.success(`Đã xóa ${m.khHd ?? ""}/${m.soHd ?? ""}`);
          await napBaoCao();
        } catch (e) {
          message.error(loiApi(e, "Không xóa được hóa đơn"));
        }
      },
    });
  }, [maDonVi, napBaoCao]);

  // eslint-disable-next-line react-hooks/refs
  const COT_VAO = cotHoaDon("người bán", setHdDangXem, xoaHoaDon);
  // eslint-disable-next-line react-hooks/refs
  const COT_RA = cotHoaDon("người mua", setHdDangXem, xoaHoaDon);
  // HAI tầng lọc, cộng dồn:
  //   1. lọc LỆCH — chỉ giữ hóa đơn mà lượt "Tìm HĐ lệch" chỉ ra, và chỉ áp cho đúng
  //      bảng đã soát (soát bán ra không được làm rỗng lưới mua vào);
  //   2. ô tìm nhanh của từng bảng, gõ tới đâu lọc tới đó.
  // Gõ tìm trong lúc đang lọc lệch thì tìm TRONG tập lệch — đúng cái người dùng chờ đợi.
  const locHd = (ds: BangKeHoaDon[] | undefined, tu: string,
                 huong?: "VAO" | "RA") => {
    let kq = ds ?? [];
    if (huong && locLech?.huong === huong)
      kq = kq.filter((m) => locLech.maHd.has(m.maHd));
    const k = boDau(tu);
    if (!k) return kq;
    return kq.filter((m) =>
      boDau(`${m.khHd ?? ""} ${m.soHd ?? ""} ${m.tenDoiTac ?? ""} `
          + `${m.mstDoiTac ?? ""} ${m.matHang ?? ""} ${m.ghiChu ?? ""}`).includes(k));
  };

  const [xmlKyTruoc, setXmlKyTruoc] = useState<string | null>(null);
  const [kqRaSoat, setKqRaSoat] = useState<KetQuaRaSoat | null>(null);
  const [soFileHong, setSoFileHong] = useState(0);
  const [kyDaSoat, setKyDaSoat] = useState<{
    thang: number; soHd: number; soVao: number; soRa: number;
    hangVao: number; vatVao: number; hangRa: number; vatRa: number;
  }[]>([]);

  const [dangLapTk, setDangLapTk] = useState(false);
  const [toKhai, setToKhai] = useState<ToKhaiGtgt | null>(null);
  const [dangXuatPdf, setDangXuatPdf] = useState(false);
  const tkRef = useRef<HTMLDivElement | null>(null);

  const namRef = useRef(nam);
  useEffect(() => { namRef.current = nam; }, [nam]);

  const soatKho = useCallback(async (huong: "VAO" | "RA", tuDong = false) => {
    if (tuDong) setDangTuSoat(true); else setDangSoat(true);
    const luot = ++luotSoatRef.current;
    try {
      const r = await thueKhoBangKe(thang, huong, maDonVi || undefined, tuDong);
      if (luot !== luotSoatRef.current) return;
      const d = r.data;

      if (d.soFile === 0) {
        if (!tuDong) {
          message.warning(
            `Không thấy file Excel bảng kê ${huong === "VAO" ? "mua vào" : "bán ra"} `
            + `của kỳ ${thang}/${namRef.current} trong kho`);
          setLocLech(null);
        }
        if (huong === "RA") setTongExcelRa(null);
        return;
      }

      if (d.loi.length > 0) message.error(`Không đọc được: ${d.loi.join(" · ")}`, 8);

      const nhan = `kho ${huong === "VAO" ? "mua vào" : "bán ra"} · ${d.soFile} file`;
      if (huong === "RA") {
        setTongExcelRa({
          tenFile: nhan, dt: d.tong.tienHang, vat: d.tong.tienVat, soHd: d.tong.soHd,
        });
      }

      const dc = d.doiChieu;
      if (!dc) {
        if (!tuDong) {
          message.warning(`${nhan}: không đọc được dòng hóa đơn nào`);
          setLocLech(null);
        }
        return;
      }

      if (tuDong) return;

      setLocLech(dungLocLech(huong, nhan, dc));

      const tongVd = dc.thieuTrongSo.length + dc.thieuTrongFile.length
                   + dc.lechTien.length;
      if (tongVd === 0) message.success(`Khớp hoàn toàn với ${nhan}`);
      else message.warning(`Tìm thấy ${tongVd} hóa đơn lệch trong ${nhan}`);
    } catch (e) {
      if (tuDong || luot !== luotSoatRef.current) return;
      setLocLech(null);
      message.error(loiApi(e, "Không đọc được bảng kê trong kho"));
    } finally {

      if (luot === luotSoatRef.current) {
        if (tuDong) setDangTuSoat(false); else setDangSoat(false);
      }
    }
    // `nam` cố tình KHÔNG có ở đây (chỉ đi vào chuỗi thông báo — xem namRef).
    // dungLocLech deps rỗng nên ổn định, thêm vào không kéo theo lượt chạy thừa nào.
  }, [thang, maDonVi, dungLocLech]);

  useEffect(() => {
    if (!mo) return;

    let huy = false;
    const chay = () => {
      if (huy) return;
      setTongExcelRa(null);
      void soatKho("RA", true);
    };

    const coRic = typeof window.requestIdleCallback === "function";
    const id = coRic ? window.requestIdleCallback(chay, { timeout: 2000 })
                     : window.setTimeout(chay, 300);
    return () => {
      huy = true;
      if (coRic) window.cancelIdleCallback(id);
      else clearTimeout(id);
    };
  }, [mo, soatKho]);

  const soatBangKe = async (f: File, huongMong: "VAO" | "RA") => {
    setDangSoat(true);
    try {
      const r = await thueDocBangKe(f, maDonVi);
      const tuFile = r.data.hoaDon ?? [];
      if (tuFile.length === 0) {
        message.warning(`${f.name}: không đọc được dòng hóa đơn nào`);
        setLocLech(null);
        return;
      }
      const soVao = tuFile.filter((x) => x.huong === "VAO").length;
      const huongFile = soVao >= tuFile.length - soVao ? "VAO" : "RA";
      if (huongFile !== huongMong) {
        message.error(
          `${f.name} là bảng kê ${huongFile === "VAO" ? "MUA VÀO" : "BÁN RA"}, `
          + `không phải ${huongMong === "VAO" ? "mua vào" : "bán ra"} — chọn lại file`);
        setLocLech(null);
        return;
      }

      const huong = huongMong;
      const laVao = huong === "VAO";
      const soSach = (laVao ? bc?.muaVao : bc?.banRa) ?? [];

      const mFile = new Map(tuFile
        .filter((x) => x.huong === huong)
        .map((x) => [khoaHd(x.khhd, x.soHd), x]));
      const mSo = new Map(soSach.map((x) => [khoaHd(x.khHd, x.soHd), x]));

      const thieuTrongSo: KetQuaSoat["thieuTrongSo"] = [];
      const lechTien: KetQuaSoat["lechTien"] = [];

      for (const [k, f2] of mFile) {
        const s = mSo.get(k);
        if (!s) {
          thieuTrongSo.push({
            khhd: f2.khhd, soHd: f2.soHd, ten: f2.tenDoiTac ?? "",
            tienHang: f2.tienHang, tienVat: f2.tienVat,
          });
          continue;
        }
        const lh = Math.abs(s.doanhThuChuaVat - f2.tienHang);
        const lv = Math.abs(s.thueGtgt - f2.tienVat);
        if (lh >= 1 || lv >= 1) {
          lechTien.push({
            khhd: f2.khhd, soHd: f2.soHd, ten: f2.tenDoiTac ?? "",
            soHang: s.doanhThuChuaVat, fileHang: f2.tienHang,
            soVat: s.thueGtgt, fileVat: f2.tienVat,
          });
        }
      }

      const thieuTrongFile: KetQuaSoat["thieuTrongFile"] = [];
      // Mã hóa đơn lệch, thu ngay trong lúc so — nhánh này chạy ở client nên đã cầm sẵn
      // dòng sổ, không phải tra ngược như nhánh soatKho.
      const maLech = new Set<string>();
      for (const [k, s] of mSo) {
        if (mFile.has(k)) continue;
        thieuTrongFile.push({
          khhd: s.khHd ?? "", soHd: s.soHd ?? "", ten: s.tenDoiTac ?? "",
          tienHang: s.doanhThuChuaVat, tienVat: s.thueGtgt,
        });
        if (s.maHd) maLech.add(s.maHd);
      }
      for (const x of lechTien) {
        const s = mSo.get(khoaHd(x.khhd, x.soHd));
        if (s?.maHd) maLech.add(s.maHd);
      }

      setLocLech({ huong, nhan: f.name, maHd: maLech, thieuTrongSo });

      let dtFile = 0, vatFile = 0;
      for (const x of mFile.values()) { dtFile += x.tienHang; vatFile += x.tienVat; }
      const tongFile: TongExcel = {
        tenFile: f.name, dt: dtFile, vat: vatFile, soHd: mFile.size,
      };
      if (!laVao) setTongExcelRa(tongFile);

      const tong = thieuTrongSo.length + thieuTrongFile.length + lechTien.length;
      if (tong === 0) message.success(`Khớp hoàn toàn với ${f.name}`);
      else message.warning(`Tìm thấy ${tong} hóa đơn lệch`);
    } catch (e) {
      setLocLech(null);
      message.error(loiApi(e, "Không đọc được bảng kê Excel"));
    } finally {
      setDangSoat(false);
    }
  };

  const soatNhieuKy = async (theoKy: Map<number, HoaDonFile[]>, hong: number) => {
    if (theoKy.size === 0) {
      message.warning("Không đọc được hóa đơn nào từ các file đã chọn");
      return;
    }
    setDangSoat(true);
    try {
      const gop: KetQuaRaSoat = {
        nam: 0, thang: null, soHdFile: 0, soHdSo: 0,
        thieuTrongSo: [], thieuTrongFile: [], lechTien: [], trung: [], saiKy: [],
      };
      for (const [ky, ds] of [...theoKy.entries()].sort((a, b) => a[0] - b[0])) {
        const r = await thueRaSoat(ky, ds, maDonVi || undefined);
        const k = r.data;
        gop.nam = k.nam;
        gop.soHdFile += k.soHdFile;
        gop.soHdSo += k.soHdSo;
        gop.thieuTrongSo.push(...k.thieuTrongSo);
        gop.thieuTrongFile.push(...k.thieuTrongFile);
        gop.lechTien.push(...k.lechTien);
        gop.trung.push(...k.trung);
        gop.saiKy.push(...k.saiKy);
      }
      setKqRaSoat(gop);
      setSoFileHong(hong);
    } catch (e) {
      message.error(loiApi(e, "Không rà soát được"));
    } finally {
      setDangSoat(false);
    }
  };

  const nhanFile = async (files: File[]) => {
    const ds: HoaDonFile[] = [];
    let hong = 0;
    let daNhanTk = false;

    for (const f of files) {
      const ten = f.name.toLowerCase();
      if (ten.endsWith(".xlsx") || ten.endsWith(".xls")) {
        try {
          const r = await thueDocBangKe(f, maDonVi);
          ds.push(...r.data.hoaDon);
        } catch (e) {
          hong++;
          message.warning(loiApi(e, `Không đọc được ${f.name}`));
        }
        continue;
      }

      if (!ten.endsWith(".xml")) { hong++; continue; }
      const noiDung = await f.text();

      if (noiDung.includes("<HSoKhaiThue") || noiDung.includes("ct43")) {
        docToKhaiKyTruocTuChuoi(noiDung, f.name);
        daNhanTk = true;
        continue;
      }

      const hd = docXmlHoaDon(noiDung, f.name);
      if (hd) ds.push(hd); else hong++;
    }

    const theoKy = new Map<number, HoaDonFile[]>();
    for (const h of ds) {
      const m = Number((h.ngay ?? "").slice(5, 7));
      const k = m >= 1 && m <= 12 ? m : thang;
      const cu = theoKy.get(k);
      if (cu) cu.push(h); else theoKy.set(k, [h]);
    }

    setKyDaSoat([...theoKy.entries()].map(([m, v]) => {
      const vao = v.filter((x) => x.huong !== "RA");
      const ra = v.filter((x) => x.huong === "RA");
      const cong = (a: HoaDonFile[], f: (x: HoaDonFile) => number) =>
        a.reduce((s, x) => s + (f(x) || 0), 0);
      return {
        thang: m, soHd: v.length, soVao: vao.length, soRa: ra.length,
        hangVao: cong(vao, (x) => x.tienHang), vatVao: cong(vao, (x) => x.tienVat),
        hangRa: cong(ra, (x) => x.tienHang), vatRa: cong(ra, (x) => x.tienVat),
      };
    }).sort((a, b) => a.thang - b.thang));

    if (ds.length > 0 || hong > 0) await soatNhieuKy(theoKy, hong);
    else if (daNhanTk) message.success("Đã nhận tờ khai kỳ trước");
  };

  // ============ LẬP TỜ KHAI 01/GTGT ============
  const lapToKhai = async () => {
    setDangLapTk(true);
    try {
      const r = await thueLapToKhai(thang, xmlKyTruoc ?? undefined,
                                    maDonVi || undefined);
      setToKhai(r.data);
    } catch (e) {
      const loi = loiApi(e, "Không lập được tờ khai");
      if (loi.includes("tờ khai kỳ trước")) {
        setToKhai(null);
        Modal.warning({ title: "Cần tờ khai kỳ trước", content: loi,
                        okText: "Đã hiểu", width: 560 });
      } else message.error(loi);
    } finally {
      setDangLapTk(false);
    }
  };

  const tenFilePdf = () =>
    toKhai ? `TKGTGT_T${toKhai.thang}_${toKhai.nam}_${toKhai.mst}.pdf`
           : `to-khai-${thang}.pdf`;

  const taiPdf = async () => {
    const goc = tkRef.current;
    if (!goc) return;
    setDangXuatPdf(true);
    try {
      const { xuatPdfToKhai } = await import("./xuatPdfToKhai");
      await xuatPdfToKhai(goc, tenFilePdf());
    } catch (e) {
      message.error(e instanceof Error ? e.message : "Không xuất được PDF");
    } finally {
      setDangXuatPdf(false);
    }
  };

  const taiXml = async () => {
    try {
      const r = await thueToKhaiXml(thang, xmlKyTruoc ?? undefined,
                                    maDonVi || undefined);
      const url = URL.createObjectURL(r.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = toKhai?.tenFileXml ?? `to-khai-${thang}.xml`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      message.error(loiApi(e, "Không tải được XML tờ khai"));
    }
  };

  const tongVanDe = kqRaSoat
    ? kqRaSoat.thieuTrongSo.length + kqRaSoat.lechTien.length
      + kqRaSoat.trung.length + kqRaSoat.saiKy.length
    : 0;

  const tonDau = ct43 ?? vatKhauTruKyTruoc ?? 0;
  const phatSinh = tong.raVat - tong.vaoVat;
  const conPhaiNop = phatSinh - tonDau;

  // Ô số chỉ đọc kiểu VFP: nhãn trái, số phải, viền mảnh.
  const o = (nhan: string, gia: number | null | undefined,
             lop = "", nhanLop = "") => (
    <div className="o-so">
      <span className={`o-nhan ${nhanLop}`}>{nhan}</span>
      <span className={`o-gia ${lop}`}>{tien(gia)}</span>
    </div>
  );
  const oDoiChieuExcel = (
    nhan: string, tongSo: number, tx: TongExcel | null,
    // Lấy vế nào của bảng kê ra so — tiền hàng hay tiền VAT.
    layGia: (t: TongExcel) => number,
  ) => {
    if (!tx) {
      return (
        <>
          <div className="o-so"
               title={dangTuSoat
                 ? "Đang đọc bảng kê Excel trong kho…"
                 : "Không thấy bảng kê Excel của kỳ này trong kho — bấm 'Tìm HĐ lệch'"
                   + " ở bảng dưới để chọn file từ máy"}>
            <span className="o-nhan">{nhan} từ Excel</span>
            <span className="o-gia o-chua-co">
              {dangTuSoat ? "đang đọc…" : "chưa soát"}
            </span>
          </div>
          <div className="o-so">
            <span className="o-nhan">Lệch</span>
            <span className="o-gia o-chua-co">—</span>
          </div>
        </>
      );
    }
    const giaExcel = layGia(tx);
    const lech = tongSo - giaExcel;
    return (
      <>
        <div className="o-so" title={`${tx.tenFile} · ${tx.soHd} hóa đơn`}>
          <span className="o-nhan">{nhan} từ Excel</span>
          <span className="o-gia">{tien(giaExcel)}</span>
        </div>
        <div className="o-so">
          <span className="o-nhan">Lệch</span>
          <span className={`o-gia ${Math.abs(lech) < 1 ? "o-khop" : "o-lech"}`}>
            {tien(lech)}
          </span>
        </div>
      </>
    );
  };


  const luoi = (
    ten: string, viTat: string, huong: "VAO" | "RA",
    ds: BangKeHoaDon[] | undefined,
    cot: ColumnsType<BangKeHoaDon>, dt: number, vat: number, so: number,
    tuTim: string, doiTuTim: (v: string) => void,
    phuThem?: React.ReactNode,
  ) => (
    <div className="khoi-luoi">
      {/* Dải chỉ tiêu của khối — hàng trên cùng, đúng bố cục form gốc */}
      <div className="dai-chi-tieu">
        <div className="ct-o">
          <span className="ct-nhan">{viTat} Tờ khai</span>
          <span className="ct-gia">{tien(dt)}</span>
        </div>
        <div className="ct-o">
          <span className="ct-nhan">VAT {viTat} Tờ khai</span>
          <span className="ct-gia gia-xanh">{tien(vat)}</span>
        </div>
        <div className="ct-o" title="Chênh tiền hàng giữa tờ khai và bảng kê cổng TCT — chưa nối bảng kê nên tạm 0">
          <span className="ct-nhan">Lệch GT{viTat}</span>
          <span className="ct-gia">{tien(0)}</span>
        </div>
        <div className="ct-o" title="Chênh tiền VAT giữa tờ khai và bảng kê cổng TCT — chưa nối bảng kê nên tạm 0">
          <span className="ct-nhan">Lệch VAT{viTat}</span>
          <span className="ct-gia">{tien(0)}</span>
        </div>
        {phuThem}

        <span className="ct-o ct-nut-soat">
          <span className="ct-nhan">&nbsp;</span>
          <input type="file" accept=".xlsx" hidden
                 ref={huong === "VAO" ? oFileVao : oFileRa}
                 onChange={(e) => {
                   const f = e.target.files?.[0];
                   e.target.value = "";
                   if (f) void soatBangKe(f, huong);
                 }} />
          <Button size="small" icon={<FileExcelOutlined />} loading={dangSoat}
                  onClick={(e) => {
                    if (e.ctrlKey || e.metaKey) {
                      (huong === "VAO" ? oFileVao : oFileRa).current?.click();
                      return;
                    }
                    void soatKho(huong);
                  }}
                  title={`Đọc hết bảng kê Excel ${huong === "VAO" ? "mua vào" : "bán ra"}`
                         + ` của kỳ ${thang}/${nam} trong kho rồi so với sổ`
                         + "\nCtrl + bấm: chọn file Excel từ máy"}>
            Tìm HĐ lệch
          </Button>
        </span>

        <div className="ct-o ct-tim">
          <span className="ct-nhan">&nbsp;</span>
          <Input
            allowClear
            size="small"
            value={tuTim}
            onChange={(e) => doiTuTim(e.target.value)}
            prefix={<SearchOutlined />}
            placeholder="Tìm ký hiệu, số HĐ, tên, MST, mặt hàng…"
          />
        </div>
      </div>

      {/* DẢI TRẠNG THÁI LỌC LỆCH — chỉ hiện ở bảng vừa soát.
          Bắt buộc phải có: lưới đang giấu bớt dòng, không nói ra thì người dùng tưởng
          sổ mất hóa đơn. Kèm luôn nút bỏ lọc để quay về đủ danh sách. */}
      {locLech?.huong === huong && (
        <div className="dai-loc-lech">
          <Tag color="orange">Đang lọc HĐ lệch</Tag>
          <span className="loc-nguon">{locLech.nhan}</span>
          <span className="loc-dem">
            {locLech.maHd.size} hóa đơn lệch trong sổ
          </span>
          {/* Loại này KHÔNG có dòng nào trong lưới để lọc ra (sổ chưa nạp), mà lại là
              loại nặng nhất — nêu riêng ở đây chứ không để nó chìm mất. */}
          {locLech.thieuTrongSo.length > 0 && (
            <span className="loc-thieu"
                  title={locLech.thieuTrongSo
                    .map((x) => `${x.khhd}/${x.soHd} — ${x.ten}`).join("\n")}>
              + {locLech.thieuTrongSo.length} HĐ có trong bảng kê nhưng CHƯA nạp vào sổ
            </span>
          )}
          <span className="day" />
          <Button size="small" onClick={() => setLocLech(null)}>Bỏ lọc</Button>
        </div>
      )}

      <Table<BangKeHoaDon>
        className="luoi-tk"
        size="small"
        rowKey="maHd"
        dataSource={locHd(ds, tuTim, huong)}
        columns={cot}
        loading={tai}
        pagination={false}
        scroll={{ x: RONG_LUOI, y: "calc(50vh - 190px)" }}
        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE}
                                    description={tuTim
                                      ? `Không có hóa đơn nào khớp "${tuTim}"`
                                      : `Kỳ này chưa có hóa đơn ${ten.toLowerCase()}`} /> }}
      />


      <div className="dai-tong">
        <Typography.Text strong>{ten}</Typography.Text>
        {tuTim || locLech?.huong === huong
          ? <span className="dem-hd">
              {locHd(ds, tuTim, huong).length}/{so} hóa đơn — đang lọc
            </span>
          : <span className="dem-hd">{so} hóa đơn</span>}
        <span className="day" />
        <span className="tong-nhan">Tiền hàng{tuTim ? " (cả kỳ)" : ""}</span>
        <span className="tong-gia">{tien(dt)}</span>
        <span className="tong-nhan">Tiền VAT{tuTim ? " (cả kỳ)" : ""}</span>
        <span className="tong-gia tong-vat">{tien(vat)}</span>
      </div>
    </div>
  );

  return (
    <Modal
      title={
        <span>
          <FileTextOutlined style={{ marginRight: 8 }} />
          Rà soát &amp; lập tờ khai
          {maDonVi && <> — <b>{maDonVi}</b></>}
          {tenDonVi && <span className="ten-dv"> · {tenDonVi}</span>}
          <span className="ky-tk"> · kỳ {String(thang).padStart(2, "0")}/{nam}</span>
        </span>
      }
      open={mo}
      onCancel={onDong}
      footer={
        <div className="chan-to-khai">
          <span className="chan-nhan">
            {toKhai
              ? <>Đã lập tờ khai tháng <b>{toKhai.thang}/{toKhai.nam}</b>
                  {!toKhai.choXuat && <span className="chan-loi"> , còn lỗi phải xử lý</span>}</>
              : tenFileTk
                ? <>Đã nhận tờ khai kỳ trước, sẵn sàng lập tờ khai</>
                : vatKhauTruKyTruoc != null
                  ? <>Đã có tờ khai kỳ trước trong sổ (tháng {kyLienTruoc}
                      {" "}· khấu trừ chuyển sang <b>{tien(vatKhauTruKyTruoc)}</b>)
                      {" "}, sẵn sàng lập tờ khai</>
                  : <span className="chan-loi">
                      Chưa có tờ khai kỳ trước (tháng {kyLienTruoc})
                      {" "}, hãy thả file XML tờ khai kỳ đó vào ô trên
                    </span>}
          </span>

          {toKhai && (
            <>
              <Button icon={<FilePdfOutlined />} loading={dangXuatPdf}
                      onClick={taiPdf} title={`Tải ${tenFilePdf()}`}>
                Lưu PDF
              </Button>
              <Button icon={<DownloadOutlined />} disabled={!toKhai.choXuat}
                      onClick={taiXml}
                      title={toKhai.choXuat ? `Tải ${toKhai.tenFileXml}`
                                            : "Còn lỗi chặn — xử lý hết mới xuất được XML"}>
                Tải XML nạp HTKK
              </Button>
            </>
          )}

          <Button type="primary" size="large"
                  icon={toKhai ? <ReloadOutlined /> : <FileDoneOutlined />}
                  loading={dangLapTk} onClick={lapToKhai}
                  title={toKhai ? "Tính lại từ dữ liệu sổ hiện tại"
                                : `Lập tờ khai tháng ${thang} từ dữ liệu sổ`}>
            {toKhai ? `Tạo lại tờ khai tháng ${thang}`
                    : `Tạo tờ khai tháng ${thang}`}
          </Button>
        </div>
      }
      width="100vw"
      style={{ top: 0, paddingBottom: 0, maxWidth: "100vw" }}
      styles={{ body: { height: "calc(100vh - 148px)", overflow: "auto", padding: 8 } }}
    >
      <div className="to-khai-xml">
        {/* ===== KHỐI CHỈ TIÊU ===== */}
        <div className="khoi-chi-tieu">
          <div className="cot-ct">
            <div className="tieu-de-ct">Doanh thu bán ra theo thuế suất</div>
            {o("Doanh thu 0%", tong.ra0.dt)}
            {o("Doanh thu 5%", tong.ra5.dt)}
            {o("Doanh thu 8%", tong.ra8.dt)}
            {o("Doanh thu 10%", tong.ra10.dt)}
            {o("Doanh thu không chịu thuế", tong.raKct.dt)}
            {/* Chỉ hiện KHI CÓ: bình thường bằng 0 và không đáng chiếm một dòng, nhưng
                khác 0 thì phải đập vào mắt — đó là thuế suất không có trong luật. */}
            {tong.raLa.soHd > 0
              && o(`Doanh thu thuế suất LẠ (${tong.raLa.soHd} HĐ)`,
                   tong.raLa.dt, "", "nhan-do")}
            {o("Tổng doanh thu", tong.raDt, "gia-dam")}
            {oDoiChieuExcel("Tổng doanh thu", tong.raDt, tongExcelRa, (t) => t.dt)}
          </div>

          <div className="cot-ct">
            <div className="tieu-de-ct">Thuế GTGT bán ra</div>
            {o("VAT 0%", tong.ra0.vat)}
            {o("VAT 5%", tong.ra5.vat)}
            {o("VAT 8%", tong.ra8.vat)}
            {o("VAT 10%", tong.ra10.vat)}
            {o("VAT không chịu thuế", tong.raKct.vat)}
            {tong.raLa.soHd > 0
              && o("VAT thuế suất LẠ", tong.raLa.vat, "", "nhan-do")}
            {o("Tổng VAT bán ra", tong.raVat, "gia-dam")}
            {oDoiChieuExcel("Tổng VAT bán ra", tong.raVat, tongExcelRa, (t) => t.vat)}
          </div>

          <div className="cot-ct">
            <div className="tieu-de-ct">Mua vào &amp; khấu trừ</div>
            {o("VAT khấu trừ kỳ trước", ct43 ?? vatKhauTruKyTruoc,
               "gia-xanh", "nhan-do")}
            {o("Giá trị mua vào", tong.vaoDt)}
            {o("VAT mua vào", tong.vaoVat, "gia-xanh")}
            {o("VAT phát sinh trong kỳ", phatSinh)}
            {o(conPhaiNop >= 0 ? "VAT phải nộp" : "Còn khấu trừ kỳ sau",
               Math.abs(conPhaiNop), "gia-dam")}
          </div>

          <div className="cot-ct cot-tha-file">
            <div className="tieu-de-ct">Tờ khai kỳ trước</div>

            <Upload.Dragger
              accept=".xml,.xlsx,.xls"
              multiple
              showUploadList={false}
              disabled={dangSoat}
              className="tha-xml"
              beforeUpload={(_, danhSach) => {
                void nhanFile(danhSach as File[]);
                return Upload.LIST_IGNORE;
              }}
            >
              <p className="tha-icon"><InboxOutlined /></p>
              <p className="tha-chu">Kéo thả file để rà soát</p>
              <p className="tha-phu">
                XML hóa đơn · XML tờ khai kỳ trước · bảng kê Excel
              </p>
            </Upload.Dragger>

            {!tenFileTk && vatKhauTruKyTruoc != null && (
              <div className="da-doc-tk">
                <div className="so-doc-duoc">
                  Lấy từ <b>sổ</b> (bảng tờ khai) · kỳ <b>{kyLienTruoc}</b>
                  <br />
                  chỉ tiêu 22: <b className="gia-xanh">{tien(vatKhauTruKyTruoc)}</b>
                </div>
              </div>
            )}

            {tenFileTk && (
              <div className="da-doc-tk">
                <div className="ten-file" title={tenFileTk}>{tenFileTk}</div>
                <div className="so-doc-duoc">
                  {kyTruoc && <>Kỳ <b>{kyTruoc}</b> · </>}
                  chỉ tiêu 43: <b className="gia-xanh">{tien(ct43)}</b>
                </div>
                {kyTruoc && kyTruoc !== kyLienTruoc && (
                  <div className="canh-bao-ky">
                    File là kỳ {kyTruoc}, không phải kỳ liền trước ({kyLienTruoc})
                  </div>
                )}
              </div>
            )}

          </div>
        </div>

        {/* Panel "Hóa đơn lệch" chia ba nhóm đã BỎ (18/08): nó là danh sách THỨ HAI
            của cùng một tập hóa đơn — nêu mỗi ký hiệu/số, muốn xem ngày hay thuế suất
            lại phải cuộn lên lưới trên dò từng cái. Nay lượt soát lọc thẳng CHÍNH lưới
            đó (xem locLech + dải .dai-loc-lech trên đầu mỗi lưới), nên vẫn đủ cột như
            thường mà không phải đối chiếu qua lại bằng mắt. */}
        {luoi("Mua vào", "MV", "VAO", bc?.muaVao, COT_VAO,
              tong.vaoDt, tong.vaoVat, tong.soVao, timVao, setTimVao)}

        {kyDaSoat.length > 0 && (
          <div className="ds-ky">
            {kyDaSoat.map((k) => (
              <div key={k.thang}
                   className={`ky-dong ${k.thang === thang ? "ky-hientai" : ""}`}>
                <div className="ky-ten">
                  Tháng {k.thang}
                  {k.thang === thang && <span className="ky-nhan">đang lập tờ khai</span>}
                </div>
                <div className="ky-so">
                  <span className="ky-nhom">
                    <span className="ky-mo">Mua vào</span>
                    <b>{k.soVao}</b> HĐ · {tienTron(k.hangVao)} · VAT <b>{tienTron(k.vatVao)}</b>
                  </span>
                  <span className="ky-nhom">
                    <span className="ky-mo">Bán ra</span>
                    <b>{k.soRa}</b> HĐ · {tienTron(k.hangRa)} · VAT <b>{tienTron(k.vatRa)}</b>
                  </span>
                </div>
              </div>
            ))}

            {kqRaSoat && (
              <div className="ky-tomtat">
                {tongVanDe === 0
                  ? <span className="ky-ok">✓ Dữ liệu file khớp với sổ</span>
                  : <span className="ky-loi">
                      {tongVanDe} điểm lệch giữa file và sổ
                      {kqRaSoat.thieuTrongSo.length > 0 && <> · thiếu trong sổ: {kqRaSoat.thieuTrongSo.length}</>}
                      {kqRaSoat.lechTien.length > 0 && <> · lệch tiền: {kqRaSoat.lechTien.length}</>}
                      {kqRaSoat.trung.length > 0 && <> · trùng: {kqRaSoat.trung.length}</>}
                    </span>}
                {soFileHong > 0 && <span className="ky-bo"> · bỏ qua {soFileHong} file</span>}
              </div>
            )}
          </div>
        )}

        {luoi("Bán ra", "BR", "RA", bc?.banRa, COT_RA,
              tong.raDt, tong.raVat, tong.soRa, timRa, setTimRa,
              <>
                <div className="ct-o ct-nho">
                  <span className="ct-nhan">STT HĐ</span>
                  <span className="ct-gia">{tong.soRa || ""}</span>
                </div>
                <div className="ct-o ct-nho"
                     title="Số còn được khấu trừ chuyển kỳ sau (chỉ tiêu 43)">
                  <span className="ct-nhan">Khấu trừ cuối</span>
                  <span className="ct-gia gia-xanh">
                    {conPhaiNop < 0 ? tien(Math.abs(conPhaiNop)) : tien(0)}
                  </span>
                </div>
                <div className="ct-o ct-nho"
                     title="Chênh số hóa đơn giữa sổ và bảng kê cổng — chưa nối bảng kê">
                  <span className="ct-nhan">Lệch</span>
                  <span className="ct-gia">0</span>
                </div>
              </>)}

 
        {toKhai && (
          <div className="khoi-to-khai" ref={tkRef}>
            <BangToKhai tk={toKhai} />
          </div>
        )}
      </div>

      <HtmlHoaDon
        mo={hdDangXem != null}
        onDong={() => setHdDangXem(null)}
        nhan={hdDangXem ? `${hdDangXem.khHd ?? ""}/${hdDangXem.soHd ?? ""}` : undefined}
        tai={async () => {
          if (!hdDangXem) return { html: null, duongDan: null };
          try {
            return await thueHtmlHoaDon(hdDangXem.maHd, maDonVi || undefined);
          } catch (e: unknown) {
            const st = (e as { response?: { status?: number } })?.response?.status;
            if (st === 404) return { html: null, duongDan: null };
            throw e;
          }
        }}
      />
    </Modal>
  );
}
