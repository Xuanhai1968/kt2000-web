import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Modal, Table, Typography, Empty, Upload, Button, Tag, message,
         Input, Checkbox } from "antd";
import { FileTextOutlined, InboxOutlined, FileExcelOutlined,
         FileDoneOutlined, DownloadOutlined, FilePdfOutlined,
         ReloadOutlined, EyeOutlined, DeleteOutlined,
         ExclamationCircleFilled, SearchOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { thueBaoCao, thueBaoCaoDonVi, thueDocBangKe, thueKhoBangKe, thueRaSoat,
         thueLapToKhai, thueToKhaiXml, thueHtmlHoaDon, thueXoaHoaDon,
         loiApi } from "../api";
import HtmlHoaDon from "./HtmlHoaDon";
import type { BaoCaoThue, BangKeHoaDon, DongBangKe, HoaDonFile, KetQuaRaSoat,
              NhomSuat, NhomSuatHd, ToKhaiGtgt } from "../api";
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

const tronRaXa = (v: number) =>
  v < 0 ? -Math.round(-v) : Math.round(v);

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

interface BoChon {
  co: (maHd: string) => boolean;
  doiMot: (maHd: string, tick: boolean) => void;
  doiTatCa: (tick: boolean) => void;
  tatCa: boolean;       // mọi dòng ĐANG HIỆN đều được chọn
  motPhan: boolean;     // chọn một phần — ô đầu cột hiện gạch ngang
}

const cotHoaDon = (
  vaiTro: string,
  xem: (m: BangKeHoaDon) => void,
  xoa: (m: BangKeHoaDon) => void,
  chon: BoChon,
): ColumnsType<BangKeHoaDon> => [
  { title: "STT", dataIndex: "stt", width: 44, align: "center", fixed: "left" },
  {
    title: (
      <Checkbox checked={chon.tatCa} indeterminate={chon.motPhan}
                onChange={(e) => chon.doiTatCa(e.target.checked)}
                title="Chọn / bỏ chọn hết hóa đơn đang hiện trong lưới" />
    ),
    dataIndex: "chon", width: 40, align: "center", fixed: "left",
    render: (_: unknown, m: BangKeHoaDon) => (
      <Checkbox checked={chon.co(m.maHd)}
                onChange={(e) => chon.doiMot(m.maHd, e.target.checked)}
                title={`Đưa ${m.khHd ?? ""}/${m.soHd ?? ""} vào tờ khai`} />
    ),
  },
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

const RONG_LUOI = 44 + 40 + 80 + 86 + 76 + 230 + 120 + 170 + 130 + 50 + 120 + 160 + 76;

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
  dong: DongBangKe[];
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

// Ba mã ÂM là ba loại hàng KHÔNG có thuế suất phần trăm — cổng dùng số âm để đánh
// dấu, không phải "thuế suất âm":
//   -1 = KKKNT  Không Kê Khai Nộp Thuế (TT219 Điều 5) — xăng dầu, hàng đã nộp thuế
//               ở khâu đầu nguồn                            → tờ khai chỉ tiêu [32a]
//   -2 = KCT    Không Chịu Thuế (Điều 5 Luật GTGT) — thiết bị y tế, bảo hiểm,
//               dịch vụ tài chính                            → tờ khai chỉ tiêu [26]
//   -3 = CTTC   Chiết khấu thương mại
const SUAT_HOP_LE = new Set([-3, -2, -1, 0, 5, 8, 10]);
const suatLa = (s: number) => !SUAT_HOP_LE.has(s);
const SUAT_LA_KHONG_DONG = -99;
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

  const [hdDaChon, setHdDaChon] = useState<Set<string>>(new Set());
  const khoaKy = `${maDonVi}|${nam}|${thang}`;
  const [khoaKyCu, setKhoaKyCu] = useState(khoaKy);
  if (khoaKyCu !== khoaKy) {
    setKhoaKyCu(khoaKy);
    setHdDaChon(new Set());
  }

  const tong = useMemo(() => {
    const loc = hdDaChon.size > 0;
    const giu = (m: BangKeHoaDon) => !loc || hdDaChon.has(m.maHd);
    const ra = (bc?.banRa ?? []).filter(giu);
    const vao = (bc?.muaVao ?? []).filter(giu);
    const lay = (ds: NhomSuat[] | undefined, s: number) => {
      const n = (ds ?? []).find((x) => x.thueSuat === s);
      return { dt: n?.doanhThu ?? 0, vat: n?.thue ?? 0 };
    };

    const gomTheoChon = (chiTiet: NhomSuatHd[] | undefined,
                         dsSo: BangKeHoaDon[]): NhomSuat[] => {
      const theoSuat = new Map<number, { dt: number; hd: Set<string> }>();
      const coPhanRa = new Set<string>();
      const them = (thueSuat: number, maHd: string, dt: number) => {
        let n = theoSuat.get(thueSuat);
        if (!n) theoSuat.set(thueSuat, n = { dt: 0, hd: new Set() });
        n.dt += dt;
        n.hd.add(maHd);
      };

      for (const x of chiTiet ?? []) {
        if (!hdDaChon.has(x.maHd)) continue;
        coPhanRa.add(x.maHd);
        them(x.thueSuat, x.maHd, x.doanhThu);
      }

      for (const m of dsSo) {
        if (!hdDaChon.has(m.maHd) || coPhanRa.has(m.maHd)) continue;
        them(SUAT_LA_KHONG_DONG, m.maHd, m.doanhThuChuaVat);
      }

      return [...theoSuat.entries()]
        .map(([thueSuat, n]) => {
          const doanhThu = tronRaXa(n.dt);
          return {
            thueSuat,
            soHd: n.hd.size,
            doanhThu,

            thue: thueSuat <= 0 ? 0 : tronRaXa(doanhThu * thueSuat / 100),
          };
        })
        .sort((a, b) => a.thueSuat - b.thueSuat);
    };

    const nhomRa = loc
      ? gomTheoChon(bc?.nhomBanRaTheoHd, bc?.banRa ?? [])
      : bc?.nhomBanRa;

    const raKct = lay(nhomRa, -2);      // Không Chịu Thuế
    const raKkknt = lay(nhomRa, -1);    // Không Kê Khai Nộp Thuế
    const raCttc = lay(nhomRa, -3);     // Chiết khấu thương mại

    const raLa = (nhomRa ?? []).filter((x) => suatLa(x.thueSuat))
      .reduce((t, x) => ({ dt: t.dt + x.doanhThu, vat: t.vat + x.thue, soHd: t.soHd + x.soHd }),
              { dt: 0, vat: 0, soHd: 0 });
    return {
      ra0: lay(nhomRa, 0), ra5: lay(nhomRa, 5),
      ra8: lay(nhomRa, 8), ra10: lay(nhomRa, 10),
      raKct, raKkknt, raCttc, raLa,
      raDt: ra.reduce((t, x) => t + x.doanhThuChuaVat, 0),
      raVat: ra.reduce((t, x) => t + x.thueGtgt, 0),
      vaoDt: vao.reduce((t, x) => t + x.doanhThuChuaVat, 0),
      vaoVat: vao.reduce((t, x) => t + x.thueGtgt, 0),
      soRa: ra.length, soVao: vao.length,
      locTheoChon: loc,
    };
  }, [bc, hdDaChon]);

  const [dangSoat, setDangSoat] = useState(false);
  const oFileVao = useRef<HTMLInputElement | null>(null);
  const oFileRa = useRef<HTMLInputElement | null>(null);
  const [tongExcelRa, setTongExcelRa] = useState<TongExcel | null>(null);
  const [dangTuSoat, setDangTuSoat] = useState(false);
  const luotSoatRef = useRef(0);
  const [hdDangXem, setHdDangXem] = useState<BangKeHoaDon | null>(null);

  const [locLech, setLocLech] = useState<{
    huong: "VAO" | "RA";
    nhan: string;                 // tên file / "kho bán ra / 3 file" — hiện trên đầu lưới
    maHd: Set<string>;            // mã hóa đơn CÓ TRONG SỔ mà lệch
    thieuTrongSo: HdLech[];       // có trong bảng kê, sổ chưa có ⇒ không có dòng để lọc
  } | null>(null);

  const bcRef = useRef(bc);
  useEffect(() => { bcRef.current = bc; }, [bc]);

  const dungLocLech = useCallback(
    (huong: "VAO" | "RA", nhan: string, dc: KetQuaRaSoat) => {
      const so = bcRef.current;
      const soSach = (huong === "VAO" ? so?.muaVao : so?.banRa) ?? [];
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

  const doiMotHd = useCallback((maHd: string, tick: boolean) => {
    setHdDaChon((cu) => {
      const m = new Set(cu);
      if (tick) m.add(maHd); else m.delete(maHd);
      return m;
    });
  }, []);

  const dungBoChon = (dsHien: BangKeHoaDon[]): BoChon => {
    const soChon = dsHien.reduce((n, m) => n + (hdDaChon.has(m.maHd) ? 1 : 0), 0);
    return {
      co: (maHd) => hdDaChon.has(maHd),
      doiMot: doiMotHd,
      doiTatCa: (tick) => setHdDaChon((cu) => {
        const m = new Set(cu);
        for (const x of dsHien) { if (tick) m.add(x.maHd); else m.delete(x.maHd); }
        return m;
      }),
      tatCa: dsHien.length > 0 && soChon === dsHien.length,
      motPhan: soChon > 0 && soChon < dsHien.length,
    };
  };

  const hdVaoHien = locHd(bc?.muaVao, timVao, "VAO");
  const hdRaHien = locHd(bc?.banRa, timRa, "RA");

  // eslint-disable-next-line react-hooks/refs
  const COT_VAO = cotHoaDon("người bán", setHdDangXem, xoaHoaDon,
                            dungBoChon(hdVaoHien));
  // eslint-disable-next-line react-hooks/refs
  const COT_RA = cotHoaDon("người mua", setHdDangXem, xoaHoaDon,
                           dungBoChon(hdRaHien));

  const tongChon = (ds: BangKeHoaDon[] | undefined) => {
    let soHd = 0, dt = 0, vat = 0;
    for (const m of ds ?? []) {
      if (!hdDaChon.has(m.maHd)) continue;
      soHd++;
      dt += m.doanhThuChuaVat;
      vat += m.thueGtgt;
    }
    return { soHd, dt, vat };
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

      if (d.loi.length > 0) message.error(`Không đọc được: ${d.loi.join(" / ")}`, 8);

      const nhan = `kho ${huong === "VAO" ? "mua vào" : "bán ra"} / ${d.soFile} file`;
      if (huong === "RA") {
        setTongExcelRa({
          tenFile: nhan, dt: d.tong.tienHang, vat: d.tong.tienVat, soHd: d.tong.soHd,
          dong: d.dong ?? [],
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
        dong: [...mFile.values()].map((x) => ({
          khhd: x.khhd, soHd: x.soHd, tienHang: x.tienHang, tienVat: x.tienVat,
        })),
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

  const dsChon = () => (hdDaChon.size > 0 ? [...hdDaChon] : undefined);

  const lapToKhai = async () => {
    setDangLapTk(true);
    try {
      const r = await thueLapToKhai(thang, xmlKyTruoc ?? undefined,
                                    maDonVi || undefined, dsChon());
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
                                    maDonVi || undefined, dsChon());
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

  const o = (nhan: string, gia: number | null | undefined,
             lop = "", nhanLop = "") => (
    <div className="o-so">
      <span className={`o-nhan ${nhanLop}`}>{nhan}</span>
      <span className={`o-gia ${lop}`}>{tien(gia)}</span>
    </div>
  );

  const locExcelTheoChon = (tx: TongExcel, huong: "VAO" | "RA"): TongExcel => {
    const soSach = (huong === "VAO" ? bc?.muaVao : bc?.banRa) ?? [];
    const khoaChon = new Set(soSach
      .filter((m) => hdDaChon.has(m.maHd))
      .map((m) => khoaHd(m.khHd, m.soHd)));

    let dt = 0, vat = 0, soHd = 0;
    for (const d of tx.dong) {
      if (!khoaChon.has(khoaHd(d.khhd, d.soHd))) continue;
      dt += d.tienHang;
      vat += d.tienVat;
      soHd++;
    }
    return { ...tx, dt, vat, soHd };
  };

  const oDoiChieuExcel = (
    nhan: string, tongSo: number, tx: TongExcel | null,
    layGia: (t: TongExcel) => number,
    huong: "VAO" | "RA",
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

    const excelTheoChon = tx.dong.length > 0 && tong.locTheoChon
      ? locExcelTheoChon(tx, huong)
      : tx;

    const giaExcel = layGia(excelTheoChon);
    const lech = tongSo - giaExcel;
    return (
      <>
        <div className="o-so"
             title={`${tx.tenFile} / ${excelTheoChon.soHd} hóa đơn`
                    + (tong.locTheoChon ? " (theo phần đã chọn)" : "")}>
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
    dsHien: BangKeHoaDon[],          // đã qua lọc lệch + ô tìm nhanh
    cot: ColumnsType<BangKeHoaDon>, dt: number, vat: number, so: number,
    tuTim: string, doiTuTim: (v: string) => void,
    phuThem?: React.ReactNode,
  ) => (
    <div className="khoi-luoi">
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
            placeholder="Tìm ký hiệu, số HĐ, tên, MST, mặt hàng"
          />
        </div>
      </div>

      {locLech?.huong === huong && (
        <div className="dai-loc-lech">
          <Tag color="orange">Đang lọc HĐ lệch</Tag>
          <span className="loc-nguon">{locLech.nhan}</span>
          <span className="loc-dem">
            {locLech.maHd.size} hóa đơn lệch trong sổ
          </span>

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
        dataSource={dsHien}
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
              {dsHien.length}/{so} hóa đơn — đang lọc
            </span>
          : <span className="dem-hd">{so} hóa đơn</span>}
        {(() => {
          const tc = tongChon(ds);
          if (tc.soHd === 0) return null;
          return (
            <span className="dem-chon"
                  title="Phần sẽ đưa vào tờ khai — tổng trên cả kỳ, không phụ thuộc bộ lọc đang bật">
              <Tag color="blue">{tc.soHd} HĐ đã chọn</Tag>
              {tien(tc.dt)} / VAT {tien(tc.vat)}
            </span>
          );
        })()}
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
          {tenDonVi && <span className="ten-dv"> - {tenDonVi}</span>}
          <span className="ky-tk"> - {String(thang).padStart(2, "0")}/{nam}</span>
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
                      {" "}/ khấu trừ chuyển sang <b>{tien(vatKhauTruKyTruoc)}</b>)
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
                Tải XML
              </Button>
            </>
          )}

          <Button type="primary" size="large"
                  icon={toKhai ? <ReloadOutlined /> : <FileDoneOutlined />}
                  loading={dangLapTk} onClick={lapToKhai}
                  title={hdDaChon.size > 0
                    ? `Chỉ tính ${hdDaChon.size} hóa đơn đã tick — bỏ hết tick để lấy cả kỳ`
                    : toKhai ? "Tính lại từ dữ liệu sổ hiện tại (toàn bộ hóa đơn của kỳ)"
                             : `Lập tờ khai tháng ${thang} từ toàn bộ hóa đơn của kỳ`}>
            {hdDaChon.size > 0
              ? `${toKhai ? "Tạo lại" : "Tạo"} tờ khai T${thang} từ ${hdDaChon.size} HĐ chọn`
              : toKhai ? `Tạo lại tờ khai tháng ${thang}`
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
            {o("Doanh thu KCT", tong.raKct.dt)}
            {o("Doanh thu KKKNT", tong.raKkknt.dt)}
            {o("Doanh thu CTTC", tong.raCttc.dt)}
            {tong.raLa.soHd > 0
              && o(`Doanh thu thuế suất LẠ (${tong.raLa.soHd} HĐ)`,
                   tong.raLa.dt, "", "nhan-do")}
            {o("Tổng doanh thu", tong.raDt, "gia-dam")}
            {oDoiChieuExcel("Tổng doanh thu", tong.raDt, tongExcelRa, (t) => t.dt,
                            "RA")}
          </div>

          <div className="cot-ct">
            <div className="tieu-de-ct">Thuế GTGT bán ra</div>
            {o("VAT 0%", tong.ra0.vat)}
            {o("VAT 5%", tong.ra5.vat)}
            {o("VAT 8%", tong.ra8.vat)}
            {o("VAT 10%", tong.ra10.vat)}
            {o("VAT KCT", tong.raKct.vat)}
            {o("VAT KKKNT", tong.raKkknt.vat)}
            {o("VAT CTTC", tong.raCttc.vat)}
            {tong.raLa.soHd > 0
              && o("VAT thuế suất lạ", tong.raLa.vat, "", "nhan-do")}
            {o("Tổng VAT bán ra", tong.raVat, "gia-dam")}
            {oDoiChieuExcel("Tổng VAT bán ra", tong.raVat, tongExcelRa, (t) => t.vat,
                            "RA")}
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
                XML hóa đơn / XML tờ khai kỳ trước / bảng kê Excel
              </p>
            </Upload.Dragger>

            {!tenFileTk && vatKhauTruKyTruoc != null && (
              <div className="da-doc-tk">
                <div className="so-doc-duoc">
                  Lấy từ <b>sổ</b> (bảng tờ khai) / kỳ <b>{kyLienTruoc}</b>
                  <br />
                  chỉ tiêu 22: <b className="gia-xanh">{tien(vatKhauTruKyTruoc)}</b>
                </div>
              </div>
            )}

            {tenFileTk && (
              <div className="da-doc-tk">
                <div className="ten-file" title={tenFileTk}>{tenFileTk}</div>
                <div className="so-doc-duoc">
                  {kyTruoc && <>Kỳ <b>{kyTruoc}</b> / </>}
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

        {luoi("Mua vào", "MV", "VAO", bc?.muaVao, hdVaoHien, COT_VAO,
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
                    <b>{k.soVao}</b> HĐ / {tienTron(k.hangVao)} / VAT <b>{tienTron(k.vatVao)}</b>
                  </span>
                  <span className="ky-nhom">
                    <span className="ky-mo">Bán ra</span>
                    <b>{k.soRa}</b> HĐ / {tienTron(k.hangRa)} / VAT <b>{tienTron(k.vatRa)}</b>
                  </span>
                </div>
              </div>
            ))}

            {kqRaSoat && (
              <div className="ky-tomtat">
                {tongVanDe === 0
                  ? <span className="ky-ok">Dữ liệu file khớp với sổ</span>
                  : <span className="ky-loi">
                      {tongVanDe} điểm lệch giữa file và sổ
                      {kqRaSoat.thieuTrongSo.length > 0 && <> / thiếu trong sổ: {kqRaSoat.thieuTrongSo.length}</>}
                      {kqRaSoat.lechTien.length > 0 && <> / lệch tiền: {kqRaSoat.lechTien.length}</>}
                      {kqRaSoat.trung.length > 0 && <> / trùng: {kqRaSoat.trung.length}</>}
                    </span>}
                {soFileHong > 0 && <span className="ky-bo"> / bỏ qua {soFileHong} file</span>}
              </div>
            )}
          </div>
        )}

        {luoi("Bán ra", "BR", "RA", bc?.banRa, hdRaHien, COT_RA,
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
