import { useCallback, useEffect, useMemo, useRef } from "react";
import type {
  ColumnState, ColumnResizedEvent, GridReadyEvent, GridApi,
} from "ag-grid-community";

const TIEN_TO = "kt2000_rong_cot";

type BanRong = Record<string, number>;

const RONG_TOI_THIEU = 30;
const RONG_TOI_DA = 1200;

function doc(khoa: string): BanRong {
  try {
    const raw = localStorage.getItem(khoa);
    if (!raw) return {};
    const o: unknown = JSON.parse(raw);
    if (!o || typeof o !== "object" || Array.isArray(o)) return {};
    const r: BanRong = {};
    for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
      if (typeof v === "number" && Number.isFinite(v)
          && v >= RONG_TOI_THIEU && v <= RONG_TOI_DA) {
        r[k] = Math.round(v);
      }
    }
    return r;
  } catch {
    return {};   // JSON hỏng hoặc trình duyệt chặn localStorage
  }
}

function ghi(khoa: string, ban: BanRong) {
  try {
    localStorage.setItem(khoa, JSON.stringify(ban));
  } catch { /* hết dung lượng / chế độ riêng tư — trong phiên vẫn kéo được bình thường */ }
}

interface ThamSo {
  // Tên lưới: phải KHÁC nhau giữa các lưới, kể cả hai lưới trong cùng màn hình
  tenLuoi: string;
  // Tên đăng nhập, lấy từ session. Chưa đăng nhập thì gom vào "khach"
  nguoiDung: string | undefined;
}

/**
 * Trả về các prop cắm thẳng vào <AgGridReact>: onGridReady + onColumnResized.
 * Dùng kèm colDef có `resizable: true` (colVfp đã bật sẵn).
 *
 *   const nho = useNhoRongCot({ tenLuoi: "ds-hoadon", nguoiDung: session?.user.loginName });
 *   <AgGridReact {...nho.props} … />
 *   <Button onClick={nho.datLai}>Đặt lại bề rộng cột</Button>
 */
export function useNhoRongCot({ tenLuoi, nguoiDung }: ThamSo) {
  const khoa = `${TIEN_TO}:${tenLuoi}:${nguoiDung || "khach"}`;

  const apiRef = useRef<GridApi | null>(null);

  const apDung = useCallback((api: GridApi) => {
    const ban = doc(khoa);
    const ds = Object.entries(ban);
    if (ds.length === 0) return;
    api.applyColumnState({
      state: ds.map(([colId, width]): ColumnState => ({ colId, width })),
    });
  }, [khoa]);

  const onGridReady = useCallback((e: GridReadyEvent) => {
    apiRef.current = e.api;
    apDung(e.api);
  }, [apDung]);

  const khoaCu = useRef(khoa);
  useEffect(() => {
    if (khoaCu.current === khoa) return;
    khoaCu.current = khoa;
    const api = apiRef.current;
    if (!api) return;
    api.resetColumnState();
    apDung(api);
  }, [khoa, apDung]);

  const onColumnResized = useCallback((e: ColumnResizedEvent) => {
    if (!e.finished) return;
    if (e.source !== "uiColumnResized") return;

    const ban: BanRong = {};
    for (const c of e.api.getColumnState()) {
      const w = c.width;
      if (c.colId && typeof w === "number"
          && w >= RONG_TOI_THIEU && w <= RONG_TOI_DA) {
        ban[c.colId] = Math.round(w);
      }
    }
    ghi(khoa, ban);
  }, [khoa]);

  const datLai = useCallback(() => {
    try {
      localStorage.removeItem(khoa);
    } catch { /* ignore */ }
    apiRef.current?.resetColumnState();
  }, [khoa]);

  const props = useMemo(() => ({ onGridReady, onColumnResized }), [onGridReady, onColumnResized]);

  return { props, datLai } as const;
}
