import { useCallback, useEffect, useRef, useState } from "react";

// Điều hướng lưới bằng bàn phím theo
//   ↑ ↓        đổi DÒNG
//   ← →        đổi Ô trong cùng dòng
//   Enter/F2   vào chế độ sửa ô đang đứng
//   Esc        thoát chế độ sửa
//   Đúp chuột  vào chế độ sửa ô vừa đúp
//
export interface ViTriO {
  dong: number;
  cot: number;
}

interface ThamSo {
  soDong: number;
  soCot: number;
  // Bật/tắt toàn bộ điều hướng — dùng để tắt khi modal đóng
  bat?: boolean;
  // Gọi khi con trỏ nhảy sang dòng khác (để đồng bộ dòng đang chọn của bảng)
  onDoiDong?: (dong: number) => void;
}

export function useDieuHuongLuoi({ soDong, soCot, bat = true, onDoiDong }: ThamSo) {
  const [oDangDung, setODangDung] = useState<ViTriO>({ dong: 0, cot: 0 });
  const [oDangSua, setODangSua] = useState<ViTriO | null>(null);
  const khungRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const id = setTimeout(() => {
      setODangDung((v) => {
        const dong = Math.min(v.dong, Math.max(0, soDong - 1));
        const cot = Math.min(v.cot, Math.max(0, soCot - 1));
        return dong === v.dong && cot === v.cot ? v : { dong, cot };
      });
      setODangSua(null);
    }, 0);
    return () => clearTimeout(id);
  }, [soDong, soCot]);

  const onDoiDongRef = useRef(onDoiDong);
  useEffect(() => { onDoiDongRef.current = onDoiDong; }, [onDoiDong]);
  const hetGioRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dat = useCallback((v: ViTriO) => {
    setODangDung(v);
    if (hetGioRef.current) clearTimeout(hetGioRef.current);
    hetGioRef.current = setTimeout(() => onDoiDongRef.current?.(v.dong), 150);
  }, []);

  useEffect(() => () => {
    if (hetGioRef.current) clearTimeout(hetGioRef.current);
  }, []);

  const viTriRef = useRef(oDangDung);
  useEffect(() => { viTriRef.current = oDangDung; }, [oDangDung]);
  const suaRef = useRef(oDangSua);
  useEffect(() => { suaRef.current = oDangSua; }, [oDangSua]);
  const bienRef = useRef({ soDong, soCot, bat });
  useEffect(() => { bienRef.current = { soDong, soCot, bat }; }, [soDong, soCot, bat]);

  const xuLyPhim = useCallback((e: React.KeyboardEvent) => {
    const { soDong, soCot, bat } = bienRef.current;
    if (!bat || soDong === 0) return;
    if (suaRef.current) {
      if (e.key === "Escape" || e.key === "Enter") {
        e.preventDefault();
        setODangSua(null);
        khungRef.current?.focus();
      }
      return;
    }

    const { dong, cot } = viTriRef.current;
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        dat({ dong: Math.min(dong + 1, soDong - 1), cot });
        break;
      case "ArrowUp":
        e.preventDefault();
        dat({ dong: Math.max(dong - 1, 0), cot });
        break;
      case "ArrowRight":
        e.preventDefault();
        dat({ dong, cot: Math.min(cot + 1, soCot - 1) });
        break;
      case "ArrowLeft":
        e.preventDefault();
        dat({ dong, cot: Math.max(cot - 1, 0) });
        break;
      case "PageDown":
        e.preventDefault();
        dat({ dong: Math.min(dong + 10, soDong - 1), cot });
        break;
      case "PageUp":
        e.preventDefault();
        dat({ dong: Math.max(dong - 10, 0), cot });
        break;
      case "Home":
        e.preventDefault();
        dat(e.ctrlKey ? { dong: 0, cot: 0 } : { dong, cot: 0 });
        break;
      case "End":
        e.preventDefault();
        dat(e.ctrlKey ? { dong: soDong - 1, cot: soCot - 1 } : { dong, cot: soCot - 1 });
        break;
      case "Enter":
      case "F2":
        e.preventDefault();
        setODangSua({ dong, cot });
        break;
      default:
        break;
    }
  }, [dat]);

  useEffect(() => {
    if (!bat) return;
    const id = requestAnimationFrame(() => {
      khungRef.current
        ?.querySelector<HTMLElement>(`[data-dong="${oDangDung.dong}"]`)
        ?.scrollIntoView({ block: "nearest", inline: "nearest" });
    });
    return () => cancelAnimationFrame(id);
  }, [oDangDung.dong, bat]);

  return {
    oDangDung, setODangDung: dat,
    oDangSua, setODangSua,
    khungRef, xuLyPhim,
  } as const;
}
