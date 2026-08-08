// Form PHIẾU GIAO HÀNG (đơn bán) / PHIẾU NHẬP HÀNG — phần nội bộ NB.
//
// DỮ LIỆU NẰM TRONG HOA_DON/HOA_DON_LINE, không phải bảng riêng (SPEC mục 4, chốt v0.3):
//   maHd   = SỐ ĐƠN hiển thị/in, kiểu V125 / R236 (chốt 9.7) — backend tự sinh
//   ngayNh = ngày hàng THẬT SỰ rời kho (BR-NB-07). Tạo đơn CHƯA trừ kho; thủ kho đánh
//            ngayNh thì engine mới trừ tồn. Vì vậy ô này để TRỐNG khi lập đơn là đúng,
//            không phải thiếu sót.
//
// Port UX từ Hoa_Sang (PurchaseOrderPage/SalesOrderPage) nhưng GỘP TRONG MỘT FILE theo
// yêu cầu: không tách ra ~20 component con như bên đó. Hai form chỉ khác nhau vài tham
// số (hướng, màu, nhãn, lấy giá bán hay giá mua) nên dùng chung một thân, khác nhau qua
// object CAU_HINH ở cuối file.
//
// Giữ nguyên các nét UX của bản gốc + luật BR-NB-05 (bàn phím kiểu VFP):
//   Enter    — nhảy ô kế tiếp; ở ô cuối dòng thì thêm dòng mới
//   Insert   — thêm dòng
//   F2       — tạo nhanh (mặt hàng nếu đang ở ô hàng, khách nếu đang ở ô khách)
//   Ctrl+T   — tra tên hàng bên sổ thuế (BR-NB-03), chọn = CHÉP về danh mục NB
//   F9/Ctrl+S— lưu đơn
//   ESC      — bỏ dở, quay về đơn trắng
// Ngoài ra: nháp tự lưu vào localStorage, in phiếu giao hàng (report từ đơn — mục 4:
// phiếu giao hàng KHÔNG phải bảng riêng, chỉ là cách nhìn dữ liệu).

import {
  useCallback, useEffect, useMemo, useRef, useState,
} from "react";
import {
  Card, Row, Col, Space, Button, Tag, Typography, Input, InputNumber, Modal,
  Tooltip, Table, message, Popconfirm, Empty, Radio,
} from "antd";
import {
  nbTimHang, nbLuuHang, nbTimKh, nbLuuKh, nbSoTiep, nbDanhSachDon, nbLayDon,
  nbLuuDon, nbXoaDon, nbTraHangThue, loiApi,
} from "../api";
import { EditOutlined, DeleteOutlined } from "@ant-design/icons";
import { useSearchParams } from "react-router-dom";
import type { DmHangNb, DmKhNb, DonNb, HuongDon, LoaiDoiTuong } from "../api";
import { useAuth } from "../AuthContext";
import { inPhieuDon } from "./mauInPhieu";
import "./phieu-xuat-nhap.css";

// ============================ KIỂU DỮ LIỆU TRONG FORM ============================
interface DongHang {
  id: number;            // khóa cục bộ của dòng trên lưới, không liên quan database
  maHang: string | null;
  tenHang: string;
  dvt: string;
  soLuong: number;
  donGia: number;
  ptVat: number;
  ghiChu: string;
}

const dongTrong = (id: number): DongHang => ({
  id, maHang: null, tenHang: "", dvt: "", soLuong: 0, donGia: 0, ptVat: 0, ghiChu: "",
});

interface BanNhap {
  maHd: string | null;
  ngay: string;
  ngayNh: string;          // BR-NB-07: để trống = chưa rời kho
  maKh: string | null;
  tenKh: string;
  mst: string;
  diaChi: string;
  maNvkd: string | null;   // -> DM_KH_NB (loaiDt='NV')
  tenNvkd: string;
  maNvvc: string | null;
  tenNvvc: string;
  ghiChu: string;
  dong: DongHang[];
}

// Thứ tự Enter chạy trong một dòng. Dừng ở donGia rồi nhảy dòng mới — đúng nhịp gõ
// của bản VFP: %VAT và ghi chú là thứ thỉnh thoảng mới sửa, không bắt đi qua mỗi dòng.
const CAC_O = ["hang", "dvt", "soLuong", "donGia", "ptVat", "ghiChu"] as const;
type ONhap = typeof CAC_O[number];
const O_ENTER: readonly ONhap[] = CAC_O.slice(0, CAC_O.indexOf("donGia") + 1);

// Chiều cao một dòng lưới (khớp .pxn__bang td { height: 28px } trong CSS).
// Dùng để tính xem còn hụt bao nhiêu dòng thì kẻ thêm cho kín khung.
const CAO_DONG = 28;


const soTien = (n: number) =>
  n.toLocaleString("vi-VN", { minimumFractionDigits: 0, maximumFractionDigits: 4 });

const kieuSo: React.CSSProperties = {
  fontFamily: 'ui-monospace, "JetBrains Mono", Consolas, monospace',
  fontVariantNumeric: "tabular-nums",
};

// ============================ NGÀY: gõ kiểu VFP ============================
// Người dùng gõ "5", "512", "5122026" đều ra ngày — không bắt bấm lịch.
const homNay = () => {
  const d = new Date();
  const p = (x: number) => String(x).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
};

const docNgay = (s: string): Date | null => {
  const t = (s || "").trim();
  if (!t) return null;
  const so = t.replace(/\D/g, "");
  const nay = new Date();
  let ng: number, th: number, nam: number;
  if (/^\d{1,2}$/.test(so)) {
    ng = +so; th = nay.getMonth() + 1; nam = nay.getFullYear();
  } else if (so.length === 3 || so.length === 4) {
    ng = +so.slice(0, so.length - 2); th = +so.slice(-2); nam = nay.getFullYear();
  } else if (so.length === 6) {
    ng = +so.slice(0, 2); th = +so.slice(2, 4); nam = 2000 + +so.slice(4);
  } else if (so.length === 8) {
    ng = +so.slice(0, 2); th = +so.slice(2, 4); nam = +so.slice(4);
  } else return null;
  if (th < 1 || th > 12 || ng < 1 || ng > 31) return null;
  const d = new Date(nam, th - 1, ng);
  return d.getMonth() === th - 1 && d.getDate() === ng ? d : null;
};

const ngayRaChuoi = (d: Date | null) => {
  if (!d) return "";
  const p = (x: number) => String(x).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
};

// Gửi lên API: chuỗi ISO ngày (không giờ) để backend đọc thành DATE không lệch múi giờ
const ngayRaIso = (d: Date | null) => {
  if (!d) return null;
  const p = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

// Ô ngày: gõ xong (blur/Enter) mới chuẩn hóa, đang gõ thì để yên cho người ta gõ tiếp
function ONgay({ value, onChange, onEnter }: {
  value: string;
  onChange: (v: string) => void;
  onEnter?: () => void;
}) {
  const [nhap, setNhap] = useState<string | null>(null);
  const chuanHoa = () => {
    if (nhap == null) return;
    const d = docNgay(nhap);
    onChange(d ? ngayRaChuoi(d) : nhap);
    setNhap(null);
  };
  return (
    <Input
      size="small"
      value={nhap ?? value}
      placeholder="dd/mm/yyyy"
      onChange={(e) => setNhap(e.target.value)}
      onBlur={chuanHoa}
      onKeyDown={(e) => {
        if (e.key === "Enter") { e.preventDefault(); chuanHoa(); onEnter?.(); }
      }}
    />
  );
}

// ============================ Ô GỢI Ý (autocomplete) ============================
// Bản rút gọn của AutocompleteInput bên Hoa_Sang: gõ vài ký tự -> danh sách hiện xuống,
// mũi tên lên/xuống chọn, Enter chốt, ESC đóng. Không dùng antd Select vì Select nuốt
// phím Enter và không cho vừa gõ tự do vừa chọn.
interface GoiY {
  giaTri: string;          // mã (ma_hang / ma_kh)
  nhan: string;            // chữ hiện khi đã chọn
  cot: string[];           // các cột hiện trong danh sách xổ xuống
}

function OGoiY({
  value, nhan, timKiem, onChon, onEnterQuaO, placeholder, autoFocus,
  moKhiFocus = true,
  onGoTuDo,
}: {
  value: string | null;
  nhan: string;
  timKiem: (tu: string) => Promise<GoiY[]>;
  onChon: (g: GoiY | null) => void;
  onEnterQuaO?: () => void;
  placeholder?: string;
  autoFocus?: boolean;
  // Bấm/tab vào ô là XỔ DANH SÁCH NGAY, không bắt gõ trước — người dùng hay chỉ nhớ
  // mang máng tên hàng, thấy danh sách mới chọn được. Mặc định BẬT cho mọi ô.
  moKhiFocus?: boolean;
  onGoTuDo?: (chu: string) => void;   // gõ tên mới không có trong danh mục
}) {
  const [tu, setTu] = useState<string | null>(null);
  const [ds, setDs] = useState<GoiY[]>([]);
  const [mo, setMo] = useState(false);
  const [chiSo, setChiSo] = useState(0);
  // Gõ ở mấy dòng cuối lưới thì phía dưới hết chỗ — danh sách phải LẬT LÊN TRÊN,
  // không thì nó đâm xuống ngoài khung, che mất hoặc phải cuộn mới thấy.
  const [latLen, setLatLen] = useState(false);
  const oRef = useRef<HTMLInputElement>(null);
  const boDem = useRef<number | undefined>(undefined);

  const hienThi = tu ?? nhan;

  // Đo chỗ trống dưới ô so với đáy cửa sổ, quyết định xổ xuống hay lật lên.
  // Đo ngay trước khi mở, vì cùng một ô nhưng cuộn tới đâu thì chỗ trống khác nhau.
  const chonHuong = useCallback(() => {
    const o = oRef.current;
    if (!o) return;
    const r = o.getBoundingClientRect();
    const duoi = window.innerHeight - r.bottom;
    // 280 = max-height của .pxn__ac-drop trong CSS
    // Chỉ lật khi phía TRÊN rộng hơn thật sự, tránh trường hợp trên cũng chật mà vẫn lật
    setLatLen(duoi < 280 && r.top > duoi);
  }, []);

  // chờ = 0 khi mở bằng cú bấm/mũi tên: lúc đó chỉ có MỘT lời gọi, hoãn thêm 180ms
  // chỉ làm danh sách hiện chậm như bị đơ. Gõ phím mới cần hoãn.
  const chay = useCallback((kw: string, cho = 180) => {
    window.clearTimeout(boDem.current);
    // Chờ 180ms mới gọi API: gõ nhanh 10 ký tự mà bắn 10 lượt thì danh sách nhảy loạn
    boDem.current = window.setTimeout(() => {
      timKiem(kw).then((r) => {
        setDs(r);
        setChiSo(0);
        chonHuong();      // đo lại ngay trước khi hiện: cuộn tới đâu chỗ trống khác đó
        setMo(true);
      }).catch(() => setDs([]));
    }, cho);
  }, [timKiem, chonHuong]);

  useEffect(() => () => window.clearTimeout(boDem.current), []);

  const chot = (g: GoiY) => {
    onChon(g);
    setTu(null);
    setMo(false);
  };

  // Danh sách tới 60 dòng mà khung chỉ cao 280px: bấm mũi tên xuống quá tầm nhìn là
  // mất dấu dòng đang chọn. Kéo dòng đó vào tầm — "nearest" để chỉ nhích vừa đủ,
  // không giật danh sách ra giữa khung.
  //
  // Làm ở đây chứ không trong ref callback: ref chạy cả khi rê chuột (onMouseEnter đổi
  // chiSo), thành ra danh sách rung theo con trỏ. Effect chỉ chạy khi chiSo thật sự đổi.
  const dropRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    dropRef.current
      ?.querySelector<HTMLElement>('[data-chon="1"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [chiSo, mo]);

  return (
    <div className="pxn__ac">
      <input
        ref={oRef}
        className="pxn__ac-input"
        value={hienThi}
        placeholder={placeholder}
        autoFocus={autoFocus}
        onChange={(e) => { setTu(e.target.value); chay(e.target.value); }}
        // Bấm chuột / tab tới là xổ danh sách ngay (không chờ, không cần gõ)
        onFocus={() => { if (moKhiFocus && !mo) chay(tu ?? "", 0); }}
        onMouseDown={() => { if (moKhiFocus && !mo) chay(tu ?? "", 0); }}
        onBlur={() => {
          // Đóng trễ để cú click vào dòng gợi ý kịp chạy trước khi danh sách biến mất
          setTimeout(() => {
            setMo(false);
            if (tu != null && tu.trim() && !value) onGoTuDo?.(tu.trim());
            setTu(null);
          }, 160);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            if (!mo) { chay(tu ?? "", 0); return; }
            setChiSo((i) => Math.min(i + 1, ds.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setChiSo((i) => Math.max(i - 1, 0));
          } else if (e.key === "Enter") {
            e.preventDefault();
            if (mo && ds[chiSo]) { chot(ds[chiSo]); return; }
            onEnterQuaO?.();
          } else if (e.key === "Escape") {
            if (mo) { e.stopPropagation(); setMo(false); }
          }
        }}
      />
      {mo && ds.length > 0 && (
        <div ref={dropRef} className={`pxn__ac-drop${latLen ? " pxn__ac-drop--tren" : ""}`}>
          {ds.map((g, i) => (
            <div
              key={g.giaTri}
              data-chon={i === chiSo ? "1" : undefined}
              className={`pxn__ac-item${i === chiSo ? " pxn__ac-item--chon" : ""}`}
              onMouseEnter={() => setChiSo(i)}
              onMouseDown={(e) => { e.preventDefault(); chot(g); }}
            >
              {g.cot.map((c, k) => (
                <span key={k} className="pxn__ac-cot">{c}</span>
              ))}
            </div>
          ))}
        </div>
      )}
      {mo && ds.length === 0 && (tu ?? "").trim() !== "" && (
        <div className={`pxn__ac-drop pxn__ac-drop--rong${latLen ? " pxn__ac-drop--tren" : ""}`}>
          Không có trong danh mục — bấm <b>F2</b> để thêm mới
        </div>
      )}
    </div>
  );
}

// ============================ NHÁP TRONG LOCALSTORAGE ============================
// Mất điện / lỡ đóng tab giữa chừng không được mất đơn đang gõ.
// Khóa đổi sang .v2: bản nháp của khuôn cũ (maDon/soDon/kho/nvKinhDoanh) đọc lên sẽ
// ra form lệch cột. Đổi khóa = nháp cũ bị bỏ qua một cách im lặng, đúng ý muốn.
const khoaNhap = (h: HuongDon) => `kt2000.nb.nhap.v2.${h}`;

const docNhap = (h: HuongDon): BanNhap | null => {
  try {
    const s = localStorage.getItem(khoaNhap(h));
    return s ? (JSON.parse(s) as BanNhap) : null;
  } catch { return null; }
};

const ghiNhap = (h: HuongDon, d: BanNhap) => {
  try { localStorage.setItem(khoaNhap(h), JSON.stringify(d)); } catch { /* hết chỗ */ }
};

const xoaNhap = (h: HuongDon) => {
  try { localStorage.removeItem(khoaNhap(h)); } catch { /* ignore */ }
};

// ============================ ĐỌC TIỀN BẰNG CHỮ ============================
const CHU_SO = ["không", "một", "hai", "ba", "bốn", "năm", "sáu", "bảy", "tám", "chín"];

const docBaSo = (n: number, day: boolean): string => {
  const tr = Math.floor(n / 100), ch = Math.floor((n % 100) / 10), dv = n % 10;
  const p: string[] = [];
  if (day || tr > 0) p.push(`${CHU_SO[tr]} trăm`);
  if (ch > 1) {
    p.push(`${CHU_SO[ch]} mươi`);
    if (dv === 1) p.push("mốt"); else if (dv === 5) p.push("lăm"); else if (dv > 0) p.push(CHU_SO[dv]);
  } else if (ch === 1) {
    p.push("mười");
    if (dv === 5) p.push("lăm"); else if (dv > 0) p.push(CHU_SO[dv]);
  } else if (ch === 0 && dv > 0) {
    if (day || tr > 0) p.push("lẻ");
    p.push(CHU_SO[dv]);
  }
  return p.join(" ");
};

const docTien = (n: number): string => {
  const s = Math.floor(Math.abs(n) || 0);
  if (s === 0) return "Không đồng";
  const ty = Math.floor(s / 1_000_000_000);
  const tr = Math.floor((s % 1_000_000_000) / 1_000_000);
  const ng = Math.floor((s % 1_000_000) / 1_000);
  const dv = s % 1000;
  const p: string[] = [];
  if (ty > 0) p.push(`${docBaSo(ty, false)} tỷ`);
  if (tr > 0) p.push(`${docBaSo(tr, ty > 0)} triệu`);
  if (ng > 0) p.push(`${docBaSo(ng, ty > 0 || tr > 0)} nghìn`);
  if (dv > 0) p.push(docBaSo(dv, ty > 0 || tr > 0 || ng > 0));
  const c = p.join(" ").replace(/\s+/g, " ").trim();
  return `${c.charAt(0).toUpperCase()}${c.slice(1)} đồng`;
};

// ============================ CẤU HÌNH HAI HƯỚNG ============================
interface CauHinh {
  huong: HuongDon;         // RA = đơn giao hàng, VAO = đơn nhập hàng
  tieuDe: string;
  mau: string;
  nhanDoiTac: string;      // "Khách hàng" / "Nhà cung cấp"
  nhanNgayNh: string;      // nhãn ô ngay_nh theo hướng
  giaTuDanhMuc: (h: DmHangNb) => number;   // đơn ra lấy giá bán, đơn vào lấy giá mua
  truongGia: "giaBan" | "giaMua";
  // --- Riêng cho MẪU IN: hai hướng là hai tờ giấy khác nhau ---
  // Phiếu giao: mình giao đi -> ký "Người giao hàng" / "Người nhận hàng"
  // Phiếu nhập: mình nhận về -> ký "Người giao hàng (bên bán)" / "Thủ kho nhận"
  // Chung một thân hàm in, chỉ khác bộ nhãn dưới đây.
  inNhanNgay: string;      // nhãn ngày kho trên tờ in
  inChuKy: [string, string, string];   // 3 ô chữ ký, trái -> phải
}

// ============================ THÂN FORM ============================
function Phieu({ ch }: { ch: CauHinh }) {
  const { session } = useAuth();
  const nhap0 = useMemo(() => docNhap(ch.huong), [ch.huong]);

  // maHd vừa là khóa vừa là số đơn hiển thị (chốt 9.7 — không còn cặp maDon/soDon).
  // soDuKien chỉ để HIỆN lúc lập đơn mới: số thật do backend cấp lúc lưu.
  const [maHd, setMaHd] = useState<string | null>(nhap0?.maHd ?? null);
  const [soDuKien, setSoDuKien] = useState("");
  const [ngay, setNgay] = useState(nhap0?.ngay ?? homNay());
  const [ngayNh, setNgayNh] = useState(nhap0?.ngayNh ?? "");
  const [maKh, setMaKh] = useState<string | null>(nhap0?.maKh ?? null);
  const [tenKh, setTenKh] = useState(nhap0?.tenKh ?? "");
  const [mst, setMst] = useState(nhap0?.mst ?? "");
  const [diaChi, setDiaChi] = useState(nhap0?.diaChi ?? "");
  const [maNvkd, setMaNvkd] = useState<string | null>(nhap0?.maNvkd ?? null);
  const [tenNvkd, setTenNvkd] = useState(nhap0?.tenNvkd ?? "");
  const [maNvvc, setMaNvvc] = useState<string | null>(nhap0?.maNvvc ?? null);
  const [tenNvvc, setTenNvvc] = useState(nhap0?.tenNvvc ?? "");
  const [ghiChu, setGhiChu] = useState(nhap0?.ghiChu ?? "");
  const [dong, setDong] = useState<DongHang[]>(
    nhap0?.dong?.length ? nhap0.dong : [dongTrong(1)]
  );
  const [dangLuu, setDangLuu] = useState(false);

  const bangRef = useRef<HTMLTableElement>(null);
  const dongRef = useRef<DongHang[]>([]);
  useEffect(() => { dongRef.current = dong; }, [dong]);

  // ---------- Kẻ dòng cho KÍN khung lưới ----------
  // Đo khung thật rồi tính còn hụt bao nhiêu dòng, thay vì ghim cứng một con số:
  // màn 24" và laptop 13" cao khác nhau, ghim cứng thì chỗ thừa chỗ thiếu.
  // ResizeObserver để kéo/thu cửa sổ hay đóng menu là tính lại ngay.
  const thanLuoiRef = useRef<HTMLDivElement>(null);
  const [soDongKe, setSoDongKe] = useState(14);
  useEffect(() => {
    const el = thanLuoiRef.current;
    if (!el) return;
    const doLai = () => {
      // ĐO Ô CHỨA, KHÔNG ĐO CHÍNH KHUNG CUỘN: .pxn__luoi-body có overflow:auto nên
      // chiều cao của nó phụ thuộc vào số dòng mình vừa vẽ ra -> đo nó là tự ăn đuôi
      // mình, vẽ bao nhiêu dòng cũng thấy "vừa khít" và không bao giờ kẻ thêm.
      // Ô chứa (.ant-card-body) do flex quyết định, độc lập với nội dung bên trong.
      const oChua = el.parentElement;
      const cao = oChua?.clientHeight ?? el.clientHeight;
      const caoDauBang = bangRef.current?.querySelector("thead")?.clientHeight ?? 0;
      // -1 cho chắc: thừa nửa dòng thì sinh thanh cuộn, nhìn như lưới bị hụt
      setSoDongKe(Math.max(0, Math.floor((cao - caoDauBang) / CAO_DONG) - 1));
    };
    doLai();
    // Quan sát Ô CHỨA — kéo/thu cửa sổ, đóng menu là tính lại ngay
    const ro = new ResizeObserver(doLai);
    if (el.parentElement) ro.observe(el.parentElement);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ---------- Số đơn kế tiếp ----------
  // Chỉ là số DỰ KIẾN hiện lên cho người dùng biết đơn sắp lưu mang số nào. Số thật
  // do backend cấp trong transaction lúc lưu, nên hai người gõ cùng lúc không đụng nhau.
  const laySoTiep = useCallback(async () => {
    try {
      const r = await nbSoTiep(ch.huong);
      setSoDuKien(r.data.maHd);
    } catch { /* chưa có bảng hoặc mất mạng — để trống, lưu xong backend tự sinh */ }
  }, [ch.huong]);

  const daXinSo = useRef(false);
  useEffect(() => {
    if (daXinSo.current || nhap0?.maHd) return;
    daXinSo.current = true;
    void laySoTiep();
  }, [nhap0?.maHd, laySoTiep]);

  // ---------- Tự lưu nháp ----------
  useEffect(() => {
    const t = setTimeout(() => {
      const coGi = !!maKh || dong.some((d) => d.maHang);
      if (coGi) {
        ghiNhap(ch.huong, {
          maHd, ngay, ngayNh, maKh, tenKh, mst, diaChi,
          maNvkd, tenNvkd, maNvvc, tenNvvc, ghiChu, dong,
        });
      }
    }, 400);
    return () => clearTimeout(t);
  }, [ch.huong, maHd, ngay, ngayNh, maKh, tenKh, mst, diaChi,
      maNvkd, tenNvkd, maNvvc, tenNvvc, ghiChu, dong]);

  // ---------- Tìm kiếm cho ô gợi ý ----------
  // Nhớ lại mặt hàng vừa tìm được: lúc chọn cần cả dvt/giá/%VAT chứ không chỉ mã,
  // giữ ở đây khỏi phải gọi API lần hai cho từng dòng.
  const hangTheoMa = useRef<Map<string, DmHangNb>>(new Map());
  const timHangCoNho = useCallback(async (tu: string): Promise<GoiY[]> => {
    const r = await nbTimHang(tu, 60);
    r.data.forEach((h) => { if (h.maHang) hangTheoMa.current.set(h.maHang, h); });
    return r.data.map((h) => ({
      giaTri: h.maHang!,
      nhan: h.tenHang,
      cot: [h.maHang ?? "", h.tenHang, h.dvt ?? "", soTien(ch.giaTuDanhMuc(h))],
    }));
  }, [ch]);

  // BR-NB-01: khách và nhân viên chung một danh mục, lọc bằng loaiDt.
  // Ô khách lọc 'KH', hai ô NVKD/NVVC lọc 'NV' — combobox ít dòng, gõ ra ngay.
  const khTheoMa = useRef<Map<string, DmKhNb>>(new Map());
  const timTheoLoai = useCallback(async (tu: string, loai: LoaiDoiTuong): Promise<GoiY[]> => {
    const r = await nbTimKh(tu, loai, 60);
    r.data.forEach((k) => { if (k.maKh) khTheoMa.current.set(k.maKh, k); });
    return r.data.map((k) => ({
      giaTri: k.maKh!,
      nhan: k.tenGiaoDich || k.tenKh,
      cot: [k.maKh ?? "", k.tenGiaoDich || k.tenKh, k.mst ?? "", k.dienThoai ?? ""],
    }));
  }, []);

  const timKh = useCallback((tu: string) => timTheoLoai(tu, "KH"), [timTheoLoai]);
  const timNv = useCallback((tu: string) => timTheoLoai(tu, "NV"), [timTheoLoai]);

  // ---------- Điều khiển lưới ----------
  const nhayO = useCallback((idDong: number, o: string) => {
    requestAnimationFrame(() => {
      const oDom = bangRef.current?.querySelector<HTMLElement>(
        `[data-dong="${idDong}"][data-o="${o}"]`
      );
      const inp = oDom?.querySelector<HTMLInputElement>("input");
      if (!inp) return;

      // GIỮ NGUYÊN CHỖ ĐANG CUỘN. focus() mặc định tự kéo ô vào tầm nhìn, mà lưới này
      // là khung cuộn riêng -> gõ tới dòng 19 rồi chọn hàng là cả bảng giật về chỗ khác,
      // mất dấu đang gõ tới đâu. preventScroll chặn hành vi đó.
      inp.focus({ preventScroll: true });
      inp.select?.();

      // Chỉ cuộn khi ô THẬT SỰ nằm ngoài tầm nhìn, và cuộn tối thiểu vừa đủ thấy —
      // trừ hẳn chiều cao dòng tiêu đề dính (sticky) để nó không che mất ô vừa nhảy tới.
      const khung = thanLuoiRef.current;
      if (!khung) return;
      const caoDau = bangRef.current?.querySelector("thead")?.clientHeight ?? 0;
      const oR = oDom!.getBoundingClientRect();
      const kR = khung.getBoundingClientRect();
      if (oR.top < kR.top + caoDau) {
        khung.scrollTop -= (kR.top + caoDau) - oR.top;
      } else if (oR.bottom > kR.bottom) {
        khung.scrollTop += oR.bottom - kR.bottom;
      }
    });
  }, []);

  const suaDong = useCallback((id: number, vas: Partial<DongHang>) => {
    setDong((ds) => ds.map((d) => (d.id === id ? { ...d, ...vas } : d)));
  }, []);

  const themDong = useCallback((): number => {
    const idMoi = (dongRef.current.at(-1)?.id ?? 0) + 1;
    setDong((ds) => [...ds, dongTrong((ds.at(-1)?.id ?? 0) + 1)]);
    return idMoi;
  }, []);

  const xoaDong = useCallback((id: number) => {
    setDong((ds) => (ds.length <= 1 ? ds : ds.filter((d) => d.id !== id)));
  }, []);

  // Dòng cuối vừa được điền thì đẻ sẵn dòng trắng phía dưới — gõ liên tục không phải
  // với tay bấm "Thêm dòng"
  const deSanDongCuoi = useCallback((id: number) => {
    setDong((ds) => (ds.at(-1)?.id !== id ? ds : [...ds, dongTrong((ds.at(-1)?.id ?? 0) + 1)]));
  }, []);

  const enterQuaO = useCallback((id: number, o: ONhap) => {
    const i = O_ENTER.indexOf(o);
    if (i !== -1 && i < O_ENTER.length - 1) { nhayO(id, O_ENTER[i + 1]); return; }
    setDong((ds) => {
      const cuoi = ds.at(-1)?.id === id;
      const kt = cuoi ? [...ds, dongTrong((ds.at(-1)?.id ?? 0) + 1)] : ds;
      const idKe = cuoi
        ? kt.at(-1)!.id
        : ds[ds.findIndex((x) => x.id === id) + 1]?.id ?? id;
      setTimeout(() => nhayO(idKe, "hang"), 0);
      return kt;
    });
  }, [nhayO]);

  // ---------- Tổng tiền ----------
  const tienHang = useMemo(
    () => dong.reduce((s, d) => s + d.soLuong * d.donGia, 0), [dong]);
  const tienVat = useMemo(
    () => dong.reduce((s, d) => s + (d.soLuong * d.donGia * (d.ptVat || 0)) / 100, 0), [dong]);
  const tongTien = tienHang + tienVat;

  // ---------- Đơn trắng ----------
  // NVKD giữ nguyên qua các đơn: cả buổi thường là một người gõ, xóa đi lại phải chọn lại.
  const phieuMoi = useCallback(async () => {
    xoaNhap(ch.huong);
    setMaHd(null);
    setDong([dongTrong(1)]);
    setMaKh(null); setTenKh(""); setMst(""); setDiaChi("");
    setNgay(homNay()); setNgayNh(""); setGhiChu("");
    setMaNvvc(null); setTenNvvc("");
    await laySoTiep();
    setTimeout(() => {
      document.querySelector<HTMLInputElement>("[data-o-khach] input")?.focus();
    }, 0);
  }, [ch.huong, laySoTiep]);

  const hoiPhieuMoi = useCallback(() => {
    const coGi = dongRef.current.some((d) => d.maHang) || !!maKh;
    if (!coGi) { void phieuMoi(); return; }
    Modal.confirm({
      title: "Lập đơn mới?",
      content: "Nội dung đang nhập sẽ bị xóa.",
      okText: "Lập mới", cancelText: "Thôi",
      onOk: () => { void phieuMoi(); },
    });
  }, [maKh, phieuMoi]);

  // ---------- Lưu ----------
  const luuPhieu = useCallback(async () => {
    if (!maKh) { message.warning(`Chưa chọn ${ch.nhanDoiTac.toLowerCase()}`); return; }
    const hopLe = dong.filter((d) => d.maHang && d.soLuong > 0);
    if (hopLe.length === 0) { message.warning("Phiếu chưa có dòng hàng nào hợp lệ"); return; }
    // Dòng có hàng mà quên số lượng là lỗi gõ thiếu, không phải dòng thừa — chặn lại
    // để người dùng biết, thay vì lặng lẽ bỏ qua khi lưu.
    const thieuSl = dong.find((d) => d.maHang && !(d.soLuong > 0));
    if (thieuSl) {
      message.error(`Dòng "${thieuSl.tenHang}" chưa nhập số lượng`);
      nhayO(thieuSl.id, "soLuong");
      return;
    }

    setDangLuu(true);
    try {
      const r = await nbLuuDon(ch.huong, {
        maHd,
        ngay: ngayRaIso(docNgay(ngay)),
        // BR-NB-07: để trống = hàng CHƯA rời kho, engine chưa trừ tồn.
        // Với đơn giao theo gói thì ô này do thao tác XUẤT GÓI đóng dấu hàng loạt.
        ngayNh: ngayRaIso(docNgay(ngayNh)),
        maKh, tenKh, mst, diaChi,
        maNvkd, maNvvc, ghiChu,
        lines: hopLe.map((d, i) => ({
          sttLine: i + 1,
          maHang: d.maHang,
          tenHang: d.tenHang,
          dvt: d.dvt,
          soLuong: d.soLuong,
          donGia: d.donGia,
          thanhTien: d.soLuong * d.donGia,
          ptVat: d.ptVat,
          tienVatL: (d.soLuong * d.donGia * d.ptVat) / 100,
          ghiChu: d.ghiChu || null,
          // v1 chưa có quy đổi đơn vị (ngoài phạm vi theo SPEC mục 1): hệ số luôn 1.
          // Cột đã dựng sẵn ở 015 nên khi làm tới chỉ phải sửa chỗ này.
          heSoQd: 1,
          slQuyDoi: d.soLuong,
          laHangTang: false,
          quyCach: null,
          ngayNhL: null,
        })),
      });
      message.success(`${maHd ? "Đã cập nhật" : "Đã lưu"} đơn ${r.data.maHd}`);
      await phieuMoi();
    } catch (e) {
      message.error(loiApi(e, "Không lưu được đơn"));
    } finally {
      setDangLuu(false);
    }
  }, [ch, maHd, ngay, ngayNh, maKh, tenKh, mst, diaChi, maNvkd, maNvvc,
      ghiChu, dong, nhayO, phieuMoi]);

  // ---------- Mở lại một đơn đã lưu ----------
  const moPhieu = useCallback(async (ma: string) => {
    try {
      const r = await nbLayDon(ma);
      const d = r.data;
      setMaHd(d.maHd);
      setNgay(d.ngay ? ngayRaChuoi(new Date(d.ngay)) : homNay());
      setNgayNh(d.ngayNh ? ngayRaChuoi(new Date(d.ngayNh)) : "");
      setMaKh(d.maKh); setTenKh(d.tenKh ?? "");
      setMst(d.mst ?? ""); setDiaChi(d.diaChi ?? "");
      setMaNvkd(d.maNvkd); setTenNvkd(d.tenNvkd ?? "");
      setMaNvvc(d.maNvvc); setTenNvvc(d.tenNvvc ?? "");
      setGhiChu(d.ghiChu ?? "");
      setDong(d.lines.length
        ? d.lines.map((l, i) => ({
            id: i + 1,
            maHang: l.maHang,
            tenHang: l.tenHang ?? "",
            dvt: l.dvt ?? "",
            soLuong: Number(l.soLuong) || 0,
            donGia: Number(l.donGia) || 0,
            ptVat: Number(l.ptVat) || 0,
            ghiChu: l.ghiChu ?? "",
          }))
        : [dongTrong(1)]);
      // BR-NB-08: đơn đã vào gói chốt thì backend chặn lưu — báo trước để người dùng
      // khỏi gõ xong mới biết, muốn sửa phải ra màn hình Gói rút đơn ra.
      if (d.maGoi)
        message.warning(`Đơn ${ma} đang thuộc gói ${d.maGoi}`);
      else
        message.success(`Đã mở đơn ${ma}`);
    } catch (e) {
      message.error(loiApi(e, "Không mở được đơn"));
    }
  }, []);

  // ---------- Mở sẵn một đơn theo ?maHd= trên URL ----------
  // Màn Danh sách chứng từ bấm "Mở" là nhảy sang đây kèm ?maHd=R125 — không có chỗ này
  // thì nó ra form trắng. Chỉ nạp MỘT lần cho mỗi mã: nạp lại sau khi người dùng đã gõ
  // dở là xóa mất công của họ.
  const [thamSo, datThamSo] = useSearchParams();
  const daMoUrl = useRef<string | null>(null);
  useEffect(() => {
    const ma = thamSo.get("maHd");
    if (!ma || daMoUrl.current === ma) return;
    daMoUrl.current = ma;
    void moPhieu(ma);
    // Dọn tham số khỏi URL sau khi nạp: để nguyên thì bấm "Lập mới" xong F5 lại lôi
    // đơn cũ lên, mà người dùng đang muốn phiếu trắng.
    datThamSo({}, { replace: true });
  }, [thamSo, datThamSo, moPhieu]);

  // ---------- Thêm nhanh mặt hàng / khách (F2) ----------
  const [themHang, setThemHang] = useState<{ dongId: number; ten: string } | null>(null);
  const [themKh, setThemKh] = useState<{ ten: string } | null>(null);

  // ---------- Tra tên hàng bên sổ thuế (Ctrl+T — BR-NB-03) ----------
  const [traThue, setTraThue] = useState<{ dongId: number; ten: string } | null>(null);

  // ---------- Danh sách phiếu ----------
  const [dsMo, setDsMo] = useState(false);

  // ---------- In phiếu giao hàng ----------
  // SPEC mục 4: phiếu giao hàng KHÔNG phải bảng riêng, nó là MẪU IN dựng từ đơn hàng —
  // "report là cách nhìn dữ liệu, không phải dữ liệu". Nên tờ giấy này sinh tại chỗ từ
  // state đang có, không gọi thêm API.
  //
  // Mở thẳng hộp thoại in, không có bước xem trước: người dùng đã nhìn cả phiếu trên
  // lưới rồi, xem lại lần nữa chỉ tốn thêm một cú bấm mỗi lần giao hàng.
  const inPhieu = useCallback(() => {
    // CHẶN IN ĐƠN CHƯA LƯU: lúc chưa lưu, số hiện trên form mới là số DỰ KIẾN
    // (xin từ /so-tiep). Backend cấp số thật trong transaction lúc lưu, nên hai người
    // gõ cùng lúc sẽ ra số khác. In trước = tờ giấy đưa khách mang số sai.
    if (!maHd) {
      message.warning("Lưu đơn trước khi in — số đơn chỉ được cấp chính thức lúc lưu");
      return;
    }
    const hopLe = dong.filter((d) => d.maHang);
    if (hopLe.length === 0) { message.warning("Đơn chưa có dòng hàng nào để in"); return; }

    // Dựng đúng khuôn DonNb rồi gọi MẪU IN DÙNG CHUNG với màn Danh sách phiếu —
    // hai nơi in phải ra tờ giấy y hệt nhau, không được có hai bản HTML rời nhau.
    inPhieuDon({
      maHd,
      huong: ch.huong,
      ngay: ngayRaIso(docNgay(ngay)),
      ngayNh: ngayRaIso(docNgay(ngayNh)),
      maKh, tenKh, mst, diaChi,
      // Form cũ này chỉ có MỘT ô địa chỉ. Bản mới (usa_meva/PhieuDanhDonUsa.tsx) tách
      // thành hai — cửa hàng và địa chỉ giao. Ở đây để null = giao tại địa chỉ trên.
      diaChiGiao: null,
      maNvkd, maNvvc, maGoi: null, ghiChu,
      tienHang, tienVat, tongTien,
      tthaiHd: "nhap",
      tenNvkd, tenNvvc,
      // Form cũ không có ô nhãn hàng (bản mới usa_meva/ mới có)
      tenNhan: null,
      lines: hopLe.map((d, i) => ({
        sttLine: i + 1,
        maHang: d.maHang,
        tenHang: d.tenHang,
        dvt: d.dvt,
        soLuong: d.soLuong,
        donGia: d.donGia,
        thanhTien: d.soLuong * d.donGia,
        ptVat: d.ptVat,
        tienVatL: (d.soLuong * d.donGia * d.ptVat) / 100,
        ghiChu: d.ghiChu || null,
        heSoQd: 1,
        slQuyDoi: d.soLuong,
        laHangTang: false,
        quyCach: null,
        ngayNhL: null,
      })),
    }, { ten: session?.tenant.name });
  }, [ch, dong, maHd, ngay, ngayNh, maKh, tenKh, mst, diaChi, maNvkd, maNvvc, ghiChu,
      tienHang, tienVat, tongTien, tenNvkd, tenNvvc, session]);

  // ---------- Phím tắt toàn form (BR-NB-05) ----------
  useEffect(() => {
    const bat = (e: KeyboardEvent) => {
      // F9 hoặc Ctrl+S: lưu
      if (e.key === "F9" || (e.ctrlKey && e.key.toLowerCase() === "s")) {
        e.preventDefault();
        if (!dangLuu) void luuPhieu();
        return;
      }
      if (e.key === "Insert") {
        e.preventDefault();
        const id = themDong();
        setTimeout(() => nhayO(id, "hang"), 0);
        return;
      }
      if (e.key === "F2") {
        const el = document.activeElement as HTMLElement | null;
        if (!el) return;
        const oDong = el.closest<HTMLElement>("[data-dong][data-o]");
        if (oDong?.getAttribute("data-o") === "hang") {
          e.preventDefault();
          const idDong = Number(oDong.getAttribute("data-dong"));
          setThemHang({ dongId: idDong, ten: (el as HTMLInputElement).value ?? "" });
          return;
        }
        if (el.closest("[data-o-khach]")) {
          e.preventDefault();
          setThemKh({ ten: (el as HTMLInputElement).value ?? "" });
        }
        return;
      }
      // Ctrl+T — tra tên hàng bên sổ thuế (BR-NB-05, tinh thần BR-TIM-01).
      // Chỉ có nghĩa khi con trỏ đang ở ô hàng: đây là cách tìm hàng CHƯA có trong
      // danh mục NB, chọn xong sẽ CHÉP về danh mục (BR-NB-02).
      if (e.ctrlKey && e.key.toLowerCase() === "t") {
        const el = document.activeElement as HTMLElement | null;
        const oDong = el?.closest<HTMLElement>("[data-dong][data-o]");
        if (oDong?.getAttribute("data-o") === "hang") {
          e.preventDefault();
          setTraThue({
            dongId: Number(oDong.getAttribute("data-dong")),
            ten: (el as HTMLInputElement).value ?? "",
          });
        }
        return;
      }
      if (e.key === "Escape") {
        // ESC khi không có danh sách gợi ý nào đang mở = bỏ dở phiếu
        if (document.querySelector(".pxn__ac-drop")) return;
        if (document.querySelector(".ant-modal-wrap")) return;
        e.preventDefault();
        hoiPhieuMoi();
      }
    };
    document.addEventListener("keydown", bat, true);
    return () => document.removeEventListener("keydown", bat, true);
  }, [dangLuu, luuPhieu, themDong, nhayO, hoiPhieuMoi]);

  // ============================ GIAO DIỆN ============================
  return (
    <div className="pxn">
      {/* ---------- Khối thông tin chung ---------- */}
      <Card
        size="small"
        className="pxn__info"
        style={{ borderTop: `4px solid ${ch.mau}` }}
        title={
          <Space size={8}>
            <Typography.Text strong style={{ fontSize: 19, color: ch.mau, letterSpacing: 0.4 }}>
              {ch.tieuDe}
            </Typography.Text>
            {maHd && <Tag color="warning">ĐANG SỬA {maHd}</Tag>}
          </Space>
        }
        extra={
          <Space>
            <Tooltip
              title={
                <div style={{ lineHeight: 1.7 }}>
                  <div><b>Enter</b> — sang ô kế tiếp, cuối dòng thì thêm dòng mới</div>
                  <div><b>Insert</b> — thêm dòng hàng</div>
                  <div><b>F2</b> — thêm nhanh mặt hàng / khách theo ô đang đứng</div>
                  <div><b>Ctrl+T</b> — tra tên hàng bên sổ thuế (đang ở ô hàng)</div>
                  <div><b>F9</b> hoặc <b>Ctrl+S</b> — lưu đơn</div>
                  <div><b>ESC</b> — bỏ dở, lập đơn trắng</div>
                </div>
              }
            >
              <Tag style={{ cursor: "help" }}>Phím tắt</Tag>
            </Tooltip>
            <Button onClick={() => setDsMo(true)}>Danh sách đơn</Button>
          </Space>
        }
        styles={{ body: { padding: "10px 14px 12px" } }}
      >
        <Row gutter={[10, 6]}>
          <Col xs={24} sm={8} md={4}>
            {/* Số đơn do backend cấp (chốt 9.7) — hiện để biết, không gõ tay được:
                sửa tay sẽ đụng khóa chính của HOA_DON. Chưa lưu thì đây mới là số
                DỰ KIẾN, nói thẳng ra để không ai chép số đó vào giấy tờ. */}
            <div className="pxn__nhan">Số đơn{maHd ? "" : " (dự kiến)"}</div>
            <Input size="small" readOnly value={maHd ?? soDuKien}
                   style={{ ...kieuSo, fontWeight: 600,
                            color: maHd ? undefined : "#8c8c8c" }} />
          </Col>
          <Col xs={12} sm={8} md={3}>
            <div className="pxn__nhan">Ngày</div>
            <ONgay value={ngay} onChange={setNgay} />
          </Col>
          <Col xs={12} sm={8} md={4}>
            {/* BR-NB-07: mốc TRỪ KHO. Để trống = hàng chưa rời kho. */}
            <div className="pxn__nhan">
              <Tooltip title="Ngày hàng thật sự rời kho. Để trống nếu chưa giao — kho chưa bị trừ.">
                <span style={{ cursor: "help" }}>{ch.nhanNgayNh} ⓘ</span>
              </Tooltip>
            </div>
            <ONgay value={ngayNh} onChange={setNgayNh} />
          </Col>
          <Col xs={12} sm={12} md={6}>
            <div className="pxn__nhan">NV kinh doanh</div>
            <OGoiY
              value={maNvkd}
              nhan={tenNvkd}
              timKiem={timNv}
              placeholder="Chọn nhân viên"
              onChon={(g) => {
                if (!g) { setMaNvkd(null); setTenNvkd(""); return; }
                setMaNvkd(g.giaTri);
                setTenNvkd(khTheoMa.current.get(g.giaTri)?.tenKh ?? g.nhan);
              }}
            />
          </Col>
          <Col xs={12} sm={12} md={7}>
            <div className="pxn__nhan">NV vận chuyển</div>
            <OGoiY
              value={maNvvc}
              nhan={tenNvvc}
              timKiem={timNv}
              placeholder="Chọn người giao hàng"
              onChon={(g) => {
                if (!g) { setMaNvvc(null); setTenNvvc(""); return; }
                setMaNvvc(g.giaTri);
                setTenNvvc(khTheoMa.current.get(g.giaTri)?.tenKh ?? g.nhan);
              }}
            />
          </Col>
        </Row>

        <div className="pxn__gach" />

        <Row gutter={[10, 6]}>
          <Col xs={24} md={9} data-o-khach>
            <div className="pxn__nhan">{ch.nhanDoiTac}</div>
            <OGoiY
              value={maKh}
              nhan={tenKh}
              timKiem={timKh}
              placeholder={`Gõ tên ${ch.nhanDoiTac.toLowerCase()} để tìm — F2 thêm mới`}
              onChon={(g) => {
                if (!g) { setMaKh(null); setTenKh(""); setMst(""); setDiaChi(""); return; }
                const k = khTheoMa.current.get(g.giaTri);
                setMaKh(g.giaTri);
                setTenKh(k?.tenGiaoDich || k?.tenKh || g.nhan);
                setMst(k?.mst ?? "");
                setDiaChi(k?.diaChi ?? "");
              }}
              onGoTuDo={(chu) => setThemKh({ ten: chu })}
              onEnterQuaO={() => {
                const id = dongRef.current[0]?.id;
                if (id != null) nhayO(id, "hang");
              }}
            />
          </Col>
          <Col xs={12} md={4}>
            <div className="pxn__nhan">MST</div>
            <Input size="small" value={mst} onChange={(e) => setMst(e.target.value)} />
          </Col>
          <Col xs={12} md={6}>
            <div className="pxn__nhan">Địa chỉ</div>
            <Input size="small" value={diaChi} onChange={(e) => setDiaChi(e.target.value)} />
          </Col>
          <Col xs={24} md={5}>
            <div className="pxn__nhan">Ghi chú</div>
            <Input size="small" value={ghiChu} onChange={(e) => setGhiChu(e.target.value)} />
          </Col>
        </Row>
      </Card>

      {/* ---------- Lưới hàng hóa ---------- */}
      <Card
        type="inner"
        size="small"
        className="pxn__luoi-card"
        title="Chi tiết hàng hóa"
        extra={
          <Button size="small" onClick={() => { const id = themDong(); setTimeout(() => nhayO(id, "hang"), 0); }}>
            Thêm dòng (Insert)
          </Button>
        }
        styles={{ body: { padding: 0 } }}
      >
        <div className="pxn__luoi-body" ref={thanLuoiRef}>
          <table className="pxn__bang" ref={bangRef}>
            <thead>
              <tr>
                <th style={{ width: 42 }}>STT</th>
                <th>Tên hàng hóa</th>
                <th style={{ width: 80 }}>ĐVT</th>
                <th style={{ width: 90 }}>Số lượng</th>
                <th style={{ width: 110 }}>Đơn giá</th>
                <th style={{ width: 120 }}>Thành tiền</th>
                <th style={{ width: 70 }}>%VAT</th>
                <th style={{ width: 150 }}>Ghi chú</th>
                <th style={{ width: 44 }} />
              </tr>
            </thead>
            <tbody>
              {dong.map((d, i) => (
                <tr key={d.id}>
                  <td className="pxn__c"><b>{i + 1}</b></td>
                  <td data-dong={d.id} data-o="hang">
                    <OGoiY
                      value={d.maHang}
                      nhan={d.tenHang}
                      timKiem={timHangCoNho}
                      placeholder="Gõ tên hàng — F2 thêm mới"
                      onChon={(g) => {
                        if (!g) { suaDong(d.id, { maHang: null, tenHang: "" }); return; }
                        const h = hangTheoMa.current.get(g.giaTri);
                        suaDong(d.id, {
                          maHang: g.giaTri,
                          tenHang: h?.tenHang ?? g.nhan,
                          dvt: h?.dvt ?? "",
                          donGia: h ? ch.giaTuDanhMuc(h) : 0,
                          ptVat: h?.ptVat != null ? Number(h.ptVat) : d.ptVat,
                        });
                        deSanDongCuoi(d.id);
                        nhayO(d.id, "dvt");
                      }}
                      onGoTuDo={(chu) => setThemHang({ dongId: d.id, ten: chu })}
                      onEnterQuaO={() => enterQuaO(d.id, "hang")}
                    />
                  </td>
                  <td data-dong={d.id} data-o="dvt">
                    <input
                      className="pxn__o"
                      value={d.dvt}
                      onChange={(e) => suaDong(d.id, { dvt: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") { e.preventDefault(); enterQuaO(d.id, "dvt"); }
                      }}
                    />
                  </td>
                  <td data-dong={d.id} data-o="soLuong">
                    <input
                      className="pxn__o pxn__o--so"
                      inputMode="decimal"
                      value={d.soLuong || ""}
                      onChange={(e) => suaDong(d.id, {
                        soLuong: Number(e.target.value.replace(/[^\d.,]/g, "").replace(",", ".")) || 0,
                      })}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") { e.preventDefault(); enterQuaO(d.id, "soLuong"); }
                      }}
                    />
                  </td>
                  <td data-dong={d.id} data-o="donGia">
                    <input
                      className="pxn__o pxn__o--so"
                      inputMode="decimal"
                      value={d.donGia ? soTien(d.donGia) : ""}
                      onChange={(e) => suaDong(d.id, {
                        donGia: Number(e.target.value.replace(/[^\d]/g, "")) || 0,
                      })}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") { e.preventDefault(); enterQuaO(d.id, "donGia"); }
                      }}
                    />
                  </td>
                  <td className="pxn__so-tt">{soTien(d.soLuong * d.donGia)}</td>
                  <td data-dong={d.id} data-o="ptVat">
                    <input
                      className="pxn__o pxn__o--so"
                      inputMode="decimal"
                      value={d.ptVat || ""}
                      onChange={(e) => suaDong(d.id, {
                        ptVat: Math.min(Math.max(Number(e.target.value.replace(/[^\d.]/g, "")) || 0, 0), 100),
                      })}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") { e.preventDefault(); enterQuaO(d.id, "ptVat"); }
                      }}
                    />
                  </td>
                  <td data-dong={d.id} data-o="ghiChu">
                    <input
                      className="pxn__o"
                      value={d.ghiChu}
                      onChange={(e) => suaDong(d.id, { ghiChu: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") { e.preventDefault(); enterQuaO(d.id, "ghiChu"); }
                      }}
                    />
                  </td>
                  <td className="pxn__c">
                    <Button size="small" danger type="text"
                            onClick={() => xoaDong(d.id)} title="Xóa dòng">✕</Button>
                  </td>
                </tr>
              ))}
              {/* DÒNG KẺ SẴN cho hết khung — lưới VFP luôn kín bảng, không để mảng
                  trắng hẫng dưới dòng cuối. Đây chỉ là ô trống vẽ ra cho đẹp, KHÔNG
                  phải dữ liệu: bấm vào là thêm một dòng nhập thật rồi nhảy con trỏ
                  vào ô tên hàng, đúng nhịp gõ liên tục. */}
              {Array.from({ length: Math.max(0, soDongKe - dong.length) }, (_, i) => (
                <tr key={`ke-${i}`} className="pxn__dong-ke"
                    onClick={() => { const id = themDong(); setTimeout(() => nhayO(id, "hang"), 0); }}
                    title="Bấm để thêm dòng">
                  <td className="pxn__c">{dong.length + i + 1}</td>
                  <td /><td /><td /><td /><td /><td /><td /><td />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* ---------- Thanh tổng cộng ---------- */}
      <Card size="small" className="pxn__tong" styles={{ body: { padding: "6px 14px" } }}>
        <div className="pxn__tong-wrap">
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {docTien(tongTien)}
          </Typography.Text>
          <div className="pxn__tong-phai">
            <span className="pxn__tong-o">
              <span className="pxn__tong-nhan">Tiền hàng</span>
              <span style={{ ...kieuSo, fontSize: 15 }}>{soTien(tienHang)}</span>
            </span>
            <span className="pxn__tong-o">
              <span className="pxn__tong-nhan">Thuế GTGT</span>
              <span style={{ ...kieuSo, fontSize: 15 }}>{soTien(tienVat)}</span>
            </span>
            <span className="pxn__tong-o">
              <span className="pxn__tong-nhan">Tổng cộng</span>
              <span style={{ ...kieuSo, fontSize: 21, fontWeight: 700, color: ch.mau }}>
                {soTien(tongTien)}
              </span>
            </span>
            <Space>
              <Button onClick={hoiPhieuMoi}>Lập mới</Button>
              {/* Chưa lưu thì số đơn mới là số dự kiến -> khóa nút, nói rõ lý do */}
              <Tooltip title={maHd ? "" : "Lưu đơn trước khi in — số đơn chỉ được cấp chính thức lúc lưu"}>
                <Button onClick={inPhieu} disabled={!maHd}>In phiếu</Button>
              </Tooltip>
              <Button type="primary" loading={dangLuu} onClick={luuPhieu}>
                {maHd ? "Cập nhật (F9)" : "Lưu (F9)"}
              </Button>
            </Space>
          </div>
        </div>
      </Card>

      {/* ---------- Modal thêm nhanh mặt hàng ---------- */}
      <ModalThemHang
        key={themHang ? `hang-${themHang.dongId}-${themHang.ten}` : "hang-dong"}
        mo={!!themHang}
        tenGoiY={themHang?.ten ?? ""}
        truongGia={ch.truongGia}
        onDong={() => setThemHang(null)}
        onXong={(h) => {
          if (themHang && h.maHang) {
            hangTheoMa.current.set(h.maHang, h);
            suaDong(themHang.dongId, {
              maHang: h.maHang,
              tenHang: h.tenHang,
              dvt: h.dvt ?? "",
              donGia: ch.giaTuDanhMuc(h),
              ptVat: h.ptVat != null ? Number(h.ptVat) : 0,
            });
            deSanDongCuoi(themHang.dongId);
            const id = themHang.dongId;
            setTimeout(() => nhayO(id, "soLuong"), 0);
          }
          setThemHang(null);
        }}
      />

      {/* ---------- Modal thêm nhanh đối tượng ---------- */}
      <ModalThemKh
        key={themKh ? `kh-${themKh.ten}` : "kh-dong"}
        mo={!!themKh}
        tenGoiY={themKh?.ten ?? ""}
        nhan={ch.nhanDoiTac}
        onDong={() => setThemKh(null)}
        onXong={(k) => {
          if (k.maKh) {
            khTheoMa.current.set(k.maKh, k);
            setMaKh(k.maKh);
            setTenKh(k.tenGiaoDich || k.tenKh);
            setMst(k.mst ?? "");
            setDiaChi(k.diaChi ?? "");
          }
          setThemKh(null);
        }}
      />

      {/* ---------- Modal tra tên hàng bên sổ thuế (Ctrl+T — BR-NB-03) ---------- */}
      <ModalTraThue
        key={traThue ? `thue-${traThue.dongId}-${traThue.ten}` : "thue-dong"}
        mo={!!traThue}
        tuGoiY={traThue?.ten ?? ""}
        onDong={() => setTraThue(null)}
        onXong={(h) => {
          if (traThue && h.maHang) {
            hangTheoMa.current.set(h.maHang, h);
            suaDong(traThue.dongId, {
              maHang: h.maHang,
              tenHang: h.tenHang,
              dvt: h.dvt ?? "",
              donGia: ch.giaTuDanhMuc(h),
              ptVat: h.ptVat != null ? Number(h.ptVat) : 0,
            });
            deSanDongCuoi(traThue.dongId);
            const id = traThue.dongId;
            setTimeout(() => nhayO(id, "soLuong"), 0);
          }
          setTraThue(null);
        }}
      />

      {/* ---------- Modal danh sách phiếu ---------- */}
      <ModalDanhSach
        mo={dsMo}
        huong={ch.huong}
        tieuDe={ch.tieuDe}
        onDong={() => setDsMo(false)}
        onChon={(ma) => { setDsMo(false); void moPhieu(ma); }}
      />
    </div>
  );
}

// ============================ MODAL: thêm nhanh mặt hàng ============================
function ModalThemHang({ mo, tenGoiY, truongGia, onDong, onXong }: {
  mo: boolean;
  tenGoiY: string;
  truongGia: "giaBan" | "giaMua";
  onDong: () => void;
  onXong: (h: DmHangNb) => void;
}) {
  // Không cần effect dọn form mỗi lần mở: nơi gọi truyền key={...} nên mỗi lần mở là
  // một component mới hoàn toàn, state khởi tạo lại từ đầu.
  const [ten, setTen] = useState(tenGoiY);
  const [dvt, setDvt] = useState("");
  const [gia, setGia] = useState<number>(0);
  const [vat, setVat] = useState<number>(0);
  const [dangLuu, setDangLuu] = useState(false);

  const luu = async () => {
    if (!ten.trim()) { message.warning("Chưa nhập tên hàng"); return; }
    setDangLuu(true);
    try {
      const r = await nbLuuHang({
        tenHang: ten.trim(),
        dvt: dvt.trim() || null,
        [truongGia]: gia,
        ptVat: vat,
      } as Partial<DmHangNb>);
      message.success(`Đã thêm mặt hàng ${r.data.maHang}`);
      onXong(r.data);
    } catch (e) {
      message.error(loiApi(e, "Không lưu được mặt hàng"));
    } finally {
      setDangLuu(false);
    }
  };

  return (
    <Modal
      title="Thêm nhanh mặt hàng (F2)"
      open={mo}
      onCancel={onDong}
      onOk={luu}
      okText="Lưu"
      cancelText="Thôi"
      confirmLoading={dangLuu}
      width={520}
    >
      <div className="pxn__nhan">Tên hàng</div>
      <Input autoFocus value={ten} onChange={(e) => setTen(e.target.value)}
             onPressEnter={luu} />
      <Row gutter={10} style={{ marginTop: 10 }}>
        <Col span={8}>
          <div className="pxn__nhan">ĐVT</div>
          <Input value={dvt} onChange={(e) => setDvt(e.target.value)} onPressEnter={luu} />
        </Col>
        <Col span={10}>
          <div className="pxn__nhan">
            {truongGia === "giaBan" ? "Giá bán" : "Giá mua"}
          </div>
          <InputNumber style={{ width: "100%" }} value={gia} min={0} controls={false}
                       onChange={(v) => setGia(Number(v) || 0)}
                       formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ".")}
                       parser={(v) => Number((v ?? "").replace(/\./g, "")) as 0} />
        </Col>
        <Col span={6}>
          <div className="pxn__nhan">%VAT</div>
          <InputNumber style={{ width: "100%" }} value={vat} min={0} max={100}
                       controls={false} onChange={(v) => setVat(Number(v) || 0)} />
        </Col>
      </Row>
    </Modal>
  );
}

// ============================ MODAL: thêm nhanh đối tượng ============================
// BR-NB-01: một danh mục cho cả khách lẫn nhân viên -> modal có ô chọn LOẠI.
// Thêm ngay từ đây được cả nhân viên, khỏi phải bỏ dở đơn đi mở màn hình danh mục.
function ModalThemKh({ mo, tenGoiY, nhan, onDong, onXong }: {
  mo: boolean;
  tenGoiY: string;
  nhan: string;
  onDong: () => void;
  onXong: (k: DmKhNb) => void;
}) {
  // Cùng lý do với ModalThemHang: remount bằng key thay cho effect dọn form
  const [ten, setTen] = useState(tenGoiY);
  const [loaiDt, setLoaiDt] = useState<LoaiDoiTuong>("KH");
  const [tenGiaoDich, setTenGiaoDich] = useState("");
  const [mst, setMst] = useState("");
  const [diaChi, setDiaChi] = useState("");
  const [dienThoai, setDienThoai] = useState("");
  const [dangLuu, setDangLuu] = useState(false);

  const luu = async () => {
    if (!ten.trim()) { message.warning("Chưa nhập tên"); return; }
    setDangLuu(true);
    try {
      const r = await nbLuuKh({
        tenKh: ten.trim(),
        loaiDt,
        tenGiaoDich: tenGiaoDich.trim() || null,
        mst: mst.trim() || null,
        diaChi: diaChi.trim() || null,
        dienThoai: dienThoai.trim() || null,
      });
      message.success(`Đã thêm ${r.data.maKh}`);
      onXong(r.data);
    } catch (e) {
      message.error(loiApi(e, "Không lưu được"));
    } finally {
      setDangLuu(false);
    }
  };

  return (
    <Modal
      title={`Thêm nhanh ${nhan.toLowerCase()} (F2)`}
      open={mo}
      onCancel={onDong}
      onOk={luu}
      okText="Lưu"
      cancelText="Thôi"
      confirmLoading={dangLuu}
      width={560}
    >
      <div className="pxn__nhan">Loại đối tượng</div>
      <Radio.Group value={loaiDt} onChange={(e) => setLoaiDt(e.target.value)}
                   optionType="button" buttonStyle="solid">
        <Radio.Button value="KH">Khách hàng</Radio.Button>
        <Radio.Button value="NV">Nhân viên</Radio.Button>
      </Radio.Group>

      <div className="pxn__nhan" style={{ marginTop: 10 }}>Tên</div>
      <Input autoFocus value={ten} onChange={(e) => setTen(e.target.value)} onPressEnter={luu} />

      {loaiDt === "KH" && (
        <>
          {/* BR-NB-01: tên phục vụ NGƯỜI GIAO HÀNG, được phép khác tên trên hóa đơn VAT */}
          <div className="pxn__nhan" style={{ marginTop: 10 }}>
            Tên giao dịch <span style={{ fontWeight: 400 }}>(tên người giao hàng hay gọi)</span>
          </div>
          <Input value={tenGiaoDich} onChange={(e) => setTenGiaoDich(e.target.value)}
                 placeholder="vd: Chị Kim chợ đầu mối" onPressEnter={luu} />
        </>
      )}

      <Row gutter={10} style={{ marginTop: 10 }}>
        {loaiDt === "KH" && (
          <Col span={12}>
            <div className="pxn__nhan">MST</div>
            <Input value={mst} onChange={(e) => setMst(e.target.value)} onPressEnter={luu} />
          </Col>
        )}
        <Col span={loaiDt === "KH" ? 12 : 24}>
          <div className="pxn__nhan">Điện thoại</div>
          <Input value={dienThoai} onChange={(e) => setDienThoai(e.target.value)} onPressEnter={luu} />
        </Col>
      </Row>
      <div className="pxn__nhan" style={{ marginTop: 10 }}>Địa chỉ</div>
      <Input value={diaChi} onChange={(e) => setDiaChi(e.target.value)} onPressEnter={luu} />
    </Modal>
  );
}

// ============================ MODAL: tra tên hàng bên sổ thuế ============================
// BR-NB-03 — một cửa, chỉ đọc, hai nguồn:
//   "đã có mã"   (nguồn A) = dòng HOA_DON_LINE hướng VAO đã được gán ma_hang
//   "tên trên HĐ" (nguồn B) = ten_hang_goc chưa gán mã (hàng mới mua chưa kịp làm kho)
//
// BR-NB-02: chọn một dòng ở đây = CHÉP về DM_HANG_NB (tạo bản ghi mới, giữ vết bằng
// maHangThue), KHÔNG tham chiếu sống. Bên thuế dọn mã về sau không làm biến hình đơn cũ.
function ModalTraThue({ mo, tuGoiY, onDong, onXong }: {
  mo: boolean;
  tuGoiY: string;
  onDong: () => void;
  onXong: (h: DmHangNb) => void;
}) {
  const [tu, setTu] = useState(tuGoiY);
  const [ds, setDs] = useState<Awaited<ReturnType<typeof nbTraHangThue>>["data"]>([]);
  const [tai, setTai] = useState(false);
  const [dangChep, setDangChep] = useState<string | null>(null);

  const tra = useCallback(async (kw: string) => {
    setTai(true);
    try {
      const r = await nbTraHangThue(kw, 100);
      setDs(r.data);
    } catch (e) {
      message.error(loiApi(e, "Không tra được sổ thuế"));
      setDs([]);
    } finally {
      setTai(false);
    }
  }, []);

  // Mở modal là tra luôn với chữ đang gõ dở trên ô hàng — khỏi phải gõ lại.
  // Hoãn sang microtask: gọi thẳng trong thân effect thì setTai(true) chạy đồng bộ
  // ngay trong lượt render, sinh render dây chuyền.
  useEffect(() => {
    if (!mo) return;
    let huy = false;
    void Promise.resolve().then(() => { if (!huy) void tra(tuGoiY); });
    return () => { huy = true; };
  }, [mo, tuGoiY, tra]);

  const chep = async (h: (typeof ds)[number]) => {
    setDangChep(h.tenHang);
    try {
      const r = await nbLuuHang({
        tenHang: h.tenHang,
        dvt: h.dvt,
        maNgan: h.maNgan,
        maHangThue: h.maHang,   // giữ vết nguồn gốc bên sổ thuế (BR-NB-02)
      });
      message.success(`Đã chép "${h.tenHang}" về danh mục (${r.data.maHang})`);
      onXong(r.data);
    } catch (e) {
      message.error(loiApi(e, "Không chép được mặt hàng"));
    } finally {
      setDangChep(null);
    }
  };

  return (
    <Modal
      title="Tra tên hàng bên sổ thuế (Ctrl+T)"
      open={mo}
      onCancel={onDong}
      footer={null}
      width={860}
    >
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        Chọn một dòng để <b>chép</b> mặt hàng về danh mục nội bộ. Danh mục của đơn vị mình
        vẫn là bản chính — sổ thuế chỉ dùng để tra tên.
      </Typography.Text>
      <Input.Search
        autoFocus
        placeholder="Gõ tên hàng cần tìm"
        value={tu}
        onChange={(e) => setTu(e.target.value)}
        onSearch={(v) => tra(v)}
        style={{ marginTop: 10, marginBottom: 10 }}
        allowClear
      />
      <Table
        rowKey={(r) => `${r.nguon}-${r.maHang ?? ""}-${r.tenHang}-${r.nam}`}
        size="small"
        loading={tai}
        dataSource={ds}
        pagination={{ pageSize: 10 }}
        locale={{ emptyText: <Empty description="Không tìm thấy trong sổ thuế" /> }}
        columns={[
          { title: "Tên hàng", dataIndex: "tenHang", ellipsis: true },
          { title: "ĐVT", dataIndex: "dvt", width: 80 },
          {
            title: "Nguồn", dataIndex: "nguon", width: 130,
            render: (v: string) => v === "da_co_ma"
              ? <Tag color="green">đã có mã</Tag>
              : <Tag>tên trên HĐ</Tag>,
          },
          { title: "Năm", dataIndex: "nam", width: 70 },
          {
            title: "", width: 90,
            render: (_: unknown, r: (typeof ds)[number]) => (
              <Button size="small" type="link"
                      loading={dangChep === r.tenHang}
                      onClick={() => chep(r)}>Chép về</Button>
            ),
          },
        ]}
      />
    </Modal>
  );
}

// ============================ MODAL: danh sách phiếu ============================
function ModalDanhSach({ mo, huong, tieuDe, onDong, onChon }: {
  mo: boolean;
  huong: HuongDon;
  tieuDe: string;
  onDong: () => void;
  onChon: (maHd: string) => void;
}) {
  const [ds, setDs] = useState<DonNb[]>([]);
  const [tai, setTai] = useState(false);
  const [tu, setTu] = useState("");

  const doc = useCallback(async (kw?: string) => {
    setTai(true);
    try {
      const r = await nbDanhSachDon(huong, undefined, kw, 200);
      setDs(r.data);
    } catch (e) {
      message.error(loiApi(e, "Không đọc được danh sách đơn"));
    } finally {
      setTai(false);
    }
  }, [huong]);

  // Hoãn sang microtask: gọi thẳng trong thân effect thì setTai(true) chạy đồng bộ
  // ngay trong lượt render, sinh render dây chuyền (cùng lý do với ModalTraThue).
  useEffect(() => {
    if (!mo) return;
    let huy = false;
    void Promise.resolve().then(() => { if (!huy) void doc(); });
    return () => { huy = true; };
  }, [mo, doc]);

  const xoa = async (ma: string) => {
    try {
      await nbXoaDon(ma);
      message.success(`Đã xóa đơn ${ma}`);
      void doc(tu);
    } catch (e) {
      message.error(loiApi(e, "Không xóa được đơn"));
    }
  };

  return (
    <Modal
      title={`Danh sách ${tieuDe.toLowerCase()}`}
      open={mo}
      onCancel={onDong}
      footer={null}
      width={1000}
    >
      <Space style={{ marginBottom: 10 }}>
        <Input.Search
          placeholder="Tìm theo số đơn hoặc tên khách"
          value={tu}
          onChange={(e) => setTu(e.target.value)}
          onSearch={(v) => doc(v)}
          style={{ width: 340 }}
          allowClear
        />
      </Space>
      <Table
        rowKey="maHd"
        size="small"
        loading={tai}
        dataSource={ds}
        pagination={{ pageSize: 15 }}
        locale={{ emptyText: <Empty description="Chưa có đơn nào" /> }}
        columns={[
          { title: "Số đơn", dataIndex: "maHd", width: 90 },
          {
            title: "Ngày", dataIndex: "ngay", width: 105,
            render: (v: string | null) => (v ? new Date(v).toLocaleDateString("vi-VN") : "—"),
          },
          {
            // BR-NB-07: có ngày này = hàng đã rời kho, engine đã trừ tồn
            title: "Ngày xuất kho", dataIndex: "ngayNh", width: 120,
            render: (v: string | null) => v
              ? new Date(v).toLocaleDateString("vi-VN")
              : <Tag color="orange">chưa giao</Tag>,
          },
          { title: "Khách", dataIndex: "tenKh", ellipsis: true },
          {
            title: "Gói", dataIndex: "maGoi", width: 90,
            render: (v: string | null) => (v ? <Tag color="blue">{v}</Tag> : "—"),
          },
          {
            title: "Tiền hàng", dataIndex: "tienHang", width: 120, align: "right",
            render: (v: number) => soTien(Number(v) || 0),
          },
          {
            title: "Tổng cộng", dataIndex: "tongTien", width: 130, align: "right",
            render: (v: number) => <b>{soTien(Number(v) || 0)}</b>,
          },
          {
            // Nút biểu tượng cho gọn cột; tooltip giữ chữ để không phải đoán hình vẽ.
            title: "", width: 80, align: "center" as const,
            render: (_: unknown, r: DonNb) => (
              <Space size={0}>
                <Tooltip title="Chỉnh sửa">
                  <Button size="small" type="link" icon={<EditOutlined />}
                          onClick={() => onChon(r.maHd!)} />
                </Tooltip>
                <Popconfirm title={`Xóa đơn ${r.maHd}?`} okText="Xóa" cancelText="Thôi"
                            onConfirm={() => xoa(r.maHd!)}>
                  <Tooltip title="Xóa">
                    <Button size="small" type="link" danger icon={<DeleteOutlined />} />
                  </Tooltip>
                </Popconfirm>
              </Space>
            ),
          },
        ]}
      />
    </Modal>
  );
}

// ============================ HAI MÀN HÌNH XUẤT RA ============================
// Hướng dùng đúng bộ giá trị của cột tính huong trên HOA_DON:
//   RA  = hàng đi ra (đơn bán / giao hàng), số đơn kiểu R236
//   VAO = hàng đi vào (đơn nhập hàng),      số đơn kiểu V125
const CH_GIAO: CauHinh = {
  huong: "RA",
  tieuDe: "PHIẾU XUẤT HÀNG",
  mau: "#b91c1c",
  nhanDoiTac: "Khách hàng",
  nhanNgayNh: "Ngày xuất kho",
  giaTuDanhMuc: (h) => Number(h.giaBan ?? 0) || 0,
  truongGia: "giaBan",
  // Hàng đi RA: người của mình chở đi, khách ký nhận. Tờ này theo xe.
  inNhanNgay: "Ngày xuất kho",
  inChuKy: ["Người lập phiếu", "Người giao hàng", "Người nhận hàng"],
};

const CH_NHAP: CauHinh = {
  huong: "VAO",
  tieuDe: "PHIẾU NHẬP HÀNG",
  mau: "#2563eb",
  nhanDoiTac: "Nhà cung cấp",
  nhanNgayNh: "Ngày nhập kho",
  giaTuDanhMuc: (h) => Number(h.giaMua ?? 0) || 0,
  truongGia: "giaMua",
  // Hàng đi VÀO: bên bán mang tới, thủ kho MÌNH ký nhận -> đảo vai hai ô cuối.
  // Ký sai vai là tờ phiếu vô giá trị khi đối chiếu công nợ với nhà cung cấp.
  inNhanNgay: "Ngày nhập kho",
  inChuKy: ["Người lập phiếu", "Người giao (bên bán)", "Thủ kho nhận"],
};

// Tên "Phiếu giao hàng" theo phạm vi màn hình v1 (SPEC mục 1). Giữ thêm bí danh
// PhieuXuatHang để route/menu cũ không gãy khi đổi tên.
export function PhieuXuatHang() { return <Phieu ch={CH_GIAO} />; }
// Bí danh cũ, giữ để chỗ nào còn import tên này không gãy
export const PhieuGiaoHang = PhieuXuatHang;
export function PhieuNhapHang() { return <Phieu ch={CH_NHAP} />; }
