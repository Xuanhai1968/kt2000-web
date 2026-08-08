// Ô GỢI Ý (autocomplete) — bê từ USA_Meva (components/AutocompleteInput/*, 5 file gộp 1).
//
// Gộp 5 file gốc (index/types/AutocompleteDropdown/useAutocompleteSearch/useDropdownPosition)
// vào một file theo nếp của kt2000 (PhieuXuatNhap.tsx cũng gộp cả form vào một file).
//
// BỎ so với bản gốc: nhánh web-worker (WORKER_THRESHOLD=500). Bên NB, danh mục hàng/khách
// lọc ở BACKEND rồi mới trả về (nbTimHang trả tối đa 60 dòng), nên mảng options tại chỗ
// không bao giờ chạm 500 — mang worker sang chỉ thừa một file bundle không bao giờ chạy.
//
// GIỮ nguyên các nét quan trọng của bản gốc:
//   - Dropdown vẽ bằng PORTAL ra document.body + position:fixed. Lưới hàng nằm trong
//     khung overflow:auto; vẽ dropdown tại chỗ thì nó bị khung cắt cụt ở dòng cuối.
//   - Tự LẬT LÊN TRÊN khi dưới chật (gõ tới dòng cuối phiếu).
//   - Enter chọn dòng đang tô; Enter khi không có gì tô thì nhường onCommit -> nhảy ô
//     kế tiếp (nhịp gõ VFP, BR-NB-05).
//   - Tô đậm khúc chữ trùng với từ đang gõ.

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { dungMuc, khop, catDoanTrung, type MucTim } from "./timKiemChu";
import "./usa-meva.css";

export type GiaTriChon = string | number;

export interface LuaChon<V extends GiaTriChon = GiaTriChon> {
  giaTri: V;
  nhan: string;           // chữ dùng để TÌM (gộp mọi cột)
  nhanHien?: string;      // chữ hiện trong ô sau khi chọn; thiếu thì lấy nhan
  cot?: string[];         // các cột hiện trong danh sách xổ xuống
  mau?: string;           // chấm màu (dành cho danh mục có màu)
  dam?: boolean;
}

const TOI_DA = 60;

// Số dòng xin server mỗi lượt khi CUỘN VÔ TẬN. Danh mục có thể vài nghìn dòng; lấy hết
// một lượt thì combobox đứng hình mà người dùng chỉ đọc chục dòng đầu.
const MOI_LUOT = 100;

// Mảng rỗng dùng chung: để mặc định `= []` thì mỗi lần render lại sinh mảng mới,
// phá sạch mọi useMemo/useEffect ăn theo options.
const RONG: LuaChon<GiaTriChon>[] = [];

interface Props<V extends GiaTriChon> {
  giaTri: V | null;
  cac?: LuaChon<V>[];                                  // danh sách có sẵn (lọc tại chỗ)
  /** Hỏi server mỗi lần gõ. boQua = số dòng đã có, dùng cho cuộn vô tận: lượt đầu
   *  boQua=0, cuộn tới đáy thì gọi tiếp boQua=100, 200...
   *  Hàm PHẢI tôn trọng boQua, nếu không cuộn xuống sẽ nạp lại đúng 100 dòng đầu. */
  timKiem?: (tu: string, boQua: number) => Promise<LuaChon<V>[]>;
  layNhan?: (v: V) => string | undefined;
  layMau?: (v: V) => string | undefined;
  onChon: (v: V | null) => void;
  onXong?: () => void;                                 // Enter đã chốt -> nhảy ô kế
  onGoTuDo?: (chu: string) => void;                    // gõ tên chưa có trong danh mục
  goiY?: string;
  khoa?: boolean;
  tuMoKhiFocus?: boolean;
  tuChonDongDau?: boolean;
  rongToiThieu?: number;
  lopDrop?: string;
  /** Bộ bề rộng cột cho danh sách xổ xuống (usa-meva.css).
   *  "hang" (mặc định) = tên hàng | ĐVT | giá — cột giá căn phải.
   *  "kh"              = tên | điện thoại | địa chỉ — địa chỉ để rộng vì dài nhất.
   *  Khai tường minh chứ không đoán theo số cột: hai bộ đều 3 cột nhưng bề rộng
   *  hợp lý cho mỗi bộ khác hẳn nhau. */
  kieuCot?: "hang" | "kh";
}

export default function OGoiYUsa<V extends GiaTriChon = GiaTriChon>({
  giaTri, cac = RONG as LuaChon<V>[], timKiem, layNhan, layMau,
  onChon, onXong, onGoTuDo, goiY, khoa,
  tuMoKhiFocus = true, tuChonDongDau = false, rongToiThieu, lopDrop,
  kieuCot = "hang",
}: Props<V>) {
  const [dangGo, setDangGo] = useState(false);
  const [nhap, setNhap] = useState("");
  const [ds, setDs] = useState<LuaChon<V>[]>([]);
  const [chiSo, setChiSo] = useState(-1);
  const [mo, setMo] = useState(false);
  const [kieuDrop, setKieuDrop] = useState<CSSProperties>({});
  // Nhớ nhãn của mục vừa chọn từ SERVER: danh sách server thay đổi theo từ khóa, lần
  // tìm sau không còn mục cũ trong đó nữa -> ô sẽ trắng trơn dù đã chọn.
  const [nhanXa, setNhanXa] = useState<{ v: V; chu: string } | null>(null);
  // ---- Cuộn vô tận (chỉ khi hỏi server) ----
  const [hetDs, setHetDs] = useState(false);      // đã tới cuối danh mục
  const [dangThem, setDangThem] = useState(false);
  const tuKhoaRef = useRef("");                   // từ khóa của lượt đang hiện

  const oRef = useRef<HTMLInputElement>(null);
  const khungRef = useRef<HTMLDivElement>(null);
  const dsRef = useRef<HTMLUListElement>(null);
  const chanBlur = useRef(false);
  const hoan = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const luot = useRef(0);

  // ---------- Chữ hiện trong ô ----------
  const daChon = giaTri != null ? cac.find((x) => x.giaTri === giaTri) : undefined;
  const nhanTuXa = (nhanXa && nhanXa.v === giaTri) ? nhanXa.chu : "";
  const nhanChot = timKiem
    ? (nhanTuXa || (giaTri != null ? (layNhan?.(giaTri) ?? "") : ""))
    : (daChon ? (daChon.nhanHien ?? daChon.nhan)
              : (giaTri != null ? (layNhan?.(giaTri) ?? "") : ""));
  const hienThi = dangGo ? nhap : nhanChot;
  const mauChot = daChon?.mau ?? (giaTri != null ? layMau?.(giaTri) : undefined);

  // ---------- Chỉ mục tìm kiếm tại chỗ ----------
  const chuKy = cac.map((o) => `${o.giaTri}${o.nhan}`).join("");
  const chiMuc = useMemo<{ o: LuaChon<V>; m: MucTim }[]>(
    () => cac.map((o) => ({ o, m: dungMuc(o.nhan) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chuKy],
  );

  // ---------- Đo chỗ đặt dropdown ----------
  const doChoDat = () => {
    const r = khungRef.current?.getBoundingClientRect();
    if (!r) return;
    const LE = 8, HO = 3;
    const rongMan = window.innerWidth, caoMan = window.innerHeight;
    let rong = Math.min(rongToiThieu ?? Math.max(r.width, 340), rongMan - LE * 2);
    let trai = r.left;
    if (trai + rong > rongMan - LE) trai = rongMan - LE - rong;
    if (trai < LE) trai = LE;
    rong = Math.min(rong, rongMan - LE - trai);

    // Dưới chật mà trên rộng hơn thì lật lên — gõ tới dòng cuối lưới là gặp ngay
    const duoi = caoMan - r.bottom - HO - LE;
    const tren = r.top - HO - LE;
    const lat = duoi < 200 && tren > duoi;
    setKieuDrop({
      position: "fixed",
      ...(lat ? { bottom: caoMan - r.top + HO } : { top: r.bottom + HO }),
      left: trai, width: rong, maxWidth: rong,
      maxHeight: Math.max(120, Math.floor(lat ? tren : duoi)),
      boxSizing: "border-box",
      zIndex: 99999,
    });
  };

  // ---------- Chạy tìm ----------
  const chay = (chu: string, toDongDau = true) => {
    doChoDat();
    const chonDau = (n: number) => (n > 0 && toDongDau ? 0 : -1);
    if (timKiem) {
      // Đánh số lượt: gõ nhanh thì lượt cũ về sau lượt mới, không kiểm thì kết quả
      // của từ khóa cũ đè lên kết quả mới.
      const id = ++luot.current;
      tuKhoaRef.current = chu;
      setHetDs(false);
      timKiem(chu, 0).then((kq) => {
        if (id !== luot.current) return;
        setDs(kq); setChiSo(chonDau(kq.length)); setMo(true);
        // Trả về ít hơn một lượt = đã tới cuối danh mục, đừng gọi thêm nữa
        setHetDs(kq.length < MOI_LUOT);
      }).catch(() => { if (id === luot.current) { setDs([]); setMo(true); setHetDs(true); } });
      return;
    }
    const loc: LuaChon<V>[] = [];
    if (!chu.trim()) {
      for (let i = 0; i < chiMuc.length && loc.length < TOI_DA; i++) loc.push(chiMuc[i].o);
    } else {
      for (let i = 0; i < chiMuc.length && loc.length < TOI_DA; i++) {
        if (khop(chu, chiMuc[i].m)) loc.push(chiMuc[i].o);
      }
    }
    setDs(loc); setChiSo(chonDau(loc.length)); setMo(true);
  };

  // Nạp THÊM khi cuộn tới đáy danh sách. Chỉ có nghĩa với nguồn server (timKiem);
  // danh sách tại chỗ đã nằm sẵn trong bộ nhớ, không có gì để nạp thêm.
  const napThem = () => {
    if (!timKiem || hetDs || dangThem) return;
    setDangThem(true);
    const id = luot.current;                 // KHÔNG tăng: vẫn là lượt tìm hiện tại
    timKiem(tuKhoaRef.current, ds.length)
      .then((kq) => {
        // Người dùng gõ tiếp trong lúc chờ -> kết quả này đã cũ, vứt đi
        if (id !== luot.current) return;
        if (kq.length === 0) { setHetDs(true); return; }
        setDs((cu) => {
          // Lọc trùng: dòng mới thêm ở đầu danh mục có thể đẩy dòng cũ sang trang sau,
          // không lọc thì cùng một mục hiện hai lần.
          const daCo = new Set(cu.map((x) => x.giaTri));
          return [...cu, ...kq.filter((x) => !daCo.has(x.giaTri))];
        });
        if (kq.length < MOI_LUOT) setHetDs(true);
      })
      .catch(() => setHetDs(true))          // lỗi mạng -> dừng nạp, không thử vô hạn
      .finally(() => { if (id === luot.current) setDangThem(false); });
  };

  const chot = (o: LuaChon<V>) => {
    onChon(o.giaTri);
    const chu = o.nhanHien ?? o.nhan;
    setNhap(chu);
    if (timKiem) setNhanXa({ v: o.giaTri, chu });
    setMo(false); setChiSo(-1);
    onXong?.();
  };

  // Kéo dòng đang tô vào tầm nhìn, "nearest" để chỉ nhích vừa đủ (không giật danh sách)
  useEffect(() => {
    if (!mo || chiSo < 0) return;
    (dsRef.current?.children[chiSo] as HTMLElement | undefined)
      ?.scrollIntoView({ block: "nearest" });
  }, [chiSo, mo]);

  // Bấm ra ngoài thì đóng
  useEffect(() => {
    const ngoai = (e: MouseEvent) => {
      if (!mo) return;
      if (!khungRef.current?.contains(e.target as Node)) setMo(false);
    };
    document.addEventListener("mousedown", ngoai);
    return () => document.removeEventListener("mousedown", ngoai);
  }, [mo]);

  useEffect(() => () => clearTimeout(hoan.current), []);

  return (
    <div ref={khungRef} className={`umv-ac${mauChot ? " umv-ac--co-mau" : ""}`}>
      {mauChot && <span className="umv-ac__cham" style={{ background: mauChot }} aria-hidden />}
      <input
        ref={oRef}
        className="umv-ac__o"
        type="text"
        value={hienThi}
        placeholder={goiY}
        autoComplete="off"
        disabled={khoa}
        readOnly={khoa}
        onFocus={() => {
          setNhap(nhanChot);
          setDangGo(true);
          doChoDat();
          if (tuMoKhiFocus) chay("", tuChonDongDau);
          setTimeout(() => oRef.current?.select(), 0);
        }}
        onChange={(e) => {
          const chu = e.target.value;
          setNhap(chu);
          clearTimeout(hoan.current);
          // Hỏi server thì hoãn 200ms (gõ 10 ký tự không bắn 10 lượt);
          // lọc tại chỗ thì chạy ngay, chờ chỉ làm chậm.
          if (timKiem) hoan.current = setTimeout(() => chay(chu), 200);
          else chay(chu);
          if (chu === "") { onChon(null); if (timKiem) setNhanXa(null); }
        }}
        onBlur={() => {
          if (chanBlur.current) return;
          setDangGo(false); setMo(false); setChiSo(-1);
          // Gõ tên chưa có trong danh mục -> báo ra ngoài để mở modal thêm nhanh
          if (nhap.trim() && giaTri == null) onGoTuDo?.(nhap.trim());
        }}
        onKeyDown={(e) => {
          if (!mo) {
            if (e.key === "ArrowDown") { chay(nhap); return; }
            if (e.key === "Enter") { e.preventDefault(); onXong?.(); return; }
            return;
          }
          if (e.key === "ArrowDown") {
            e.preventDefault();
            if (ds.length) setChiSo((i) => (i < ds.length - 1 ? i + 1 : 0));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            if (ds.length) setChiSo((i) => (i > 0 ? i - 1 : ds.length - 1));
          } else if (e.key === "Enter") {
            e.preventDefault();
            const c = chiSo >= 0 && chiSo < ds.length ? ds[chiSo] : null;
            // Không có dòng nào đang tô: coi như gõ xong ô này, nhảy ô kế tiếp
            if (c) { e.stopPropagation(); chot(c); }
            else { setMo(false); setChiSo(-1); onXong?.(); }
          } else if (e.key === "Escape") {
            // Chặn nổi bọt: ESC ở đây là ĐÓNG DANH SÁCH, không phải bỏ dở cả phiếu
            if (mo) e.stopPropagation();
            setNhap(nhanChot); setMo(false); setChiSo(-1);
          } else if (e.key === "Tab") {
            chanBlur.current = true;
            if (chiSo >= 0 && chiSo < ds.length) chot(ds[chiSo]);
            setMo(false);
            queueMicrotask(() => { chanBlur.current = false; });
          }
        }}
      />

      {mo && createPortal(
        ds.length > 0 ? (
          <ul
            ref={dsRef}
            className={`umv-drop${lopDrop ? " " + lopDrop : ""}`}
            style={kieuDrop}
            // Cuộn tới gần đáy (còn 60px) thì nạp thêm — nạp sớm một nhịp để danh sách
            // đã dài ra trước khi người dùng chạm đáy, không bị khựng.
            onScroll={(e) => {
              const el = e.currentTarget;
              if (el.scrollHeight - el.scrollTop - el.clientHeight < 60) napThem();
            }}
          >
            {ds.map((o, i) => (
              <li
                key={String(o.giaTri)}
                className={`umv-drop__dong${i === chiSo ? " umv-drop__dong--chon" : ""}`
                  + `${o.giaTri === giaTri ? " umv-drop__dong--dang-chon" : ""}`
                  + `${o.dam ? " umv-drop__dong--dam" : ""}`}
                onMouseEnter={() => setChiSo(i)}
                onPointerDown={(e) => { e.preventDefault(); chanBlur.current = true; }}
                onClick={() => { chanBlur.current = false; chot(o); oRef.current?.focus(); }}
              >
                {/* Lớp --n<số cột> + --kh quyết định bề rộng từng cột (usa-meva.css).
                    Khai theo SỐ CỘT THẬT chứ không để flex tự chia, nếu không mỗi dòng
                    một bề rộng và các cột không thẳng hàng nhau. */}
                <span className={`umv-drop__hang umv-drop__hang--n${(o.cot?.length ?? 1)}`
                  + `${o.mau ? " umv-drop__hang--co-cham" : ""}`
                  + `${kieuCot === "kh" ? " umv-drop__hang--kh" : ""}`}>
                  {o.mau && <span className="umv-drop__cham" style={{ background: o.mau }} aria-hidden />}
                  {(o.cot?.length ? o.cot : [o.nhan]).map((c, k) => (
                    <span key={k} className={`umv-drop__cot umv-drop__cot--${k}`}>
                      {catDoanTrung(nhap, c).map((d, j) =>
                        d.trung ? <mark key={j} className="umv-drop__to">{d.chu}</mark>
                                : <span key={j}>{d.chu}</span>)}
                    </span>
                  ))}
                </span>
              </li>
            ))}
            {/* Chân danh sách: nói rõ còn nạp hay đã hết. Không có dòng này thì người
                dùng cuộn tới đáy, thấy dừng lại, tưởng danh mục chỉ có bấy nhiêu. */}
            {timKiem && dangThem && (
              <li className="umv-drop__chan">Đang tải thêm…</li>
            )}
            {timKiem && hetDs && ds.length >= MOI_LUOT && (
              <li className="umv-drop__chan">— hết danh sách ({ds.length} dòng) —</li>
            )}
          </ul>
        ) : (
          nhap.trim() !== "" ? (
            <div className="umv-drop umv-drop--rong" style={kieuDrop}>
              Không có trong danh mục — bấm <b>F2</b> để thêm mới
            </div>
          ) : null
        ),
        document.body,
      )}
    </div>
  );
}
