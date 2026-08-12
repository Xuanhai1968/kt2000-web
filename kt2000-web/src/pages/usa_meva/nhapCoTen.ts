// NHÁP CÓ TÊN — bê từ USA_Meva (frontend/src/utils/orderDraft.ts).
//
// PHÂN VAI với nháp sẵn có, đừng lẫn hai thứ:
//   - Nháp TỰ ĐỘNG (docNhap/ghiNhap/xoaNhap trong PhieuXuatNhap.tsx) — MỘT bản duy nhất
//     cho mỗi hướng, ghi đè liên tục. Việc của nó là chống mất điện / lỡ đóng tab.
//   - Nháp CÓ TÊN (file này) — NHIỀU bản, người dùng tự đặt tên và tự xóa. Việc của nó
//     là gác đơn đang gõ dở lại đó ("chờ chị Kim gọi lại chốt số lượng"), lập đơn khác
//     trước, lát quay lại mở tiếp.
// Hai khóa localStorage tách rời nên bản này không đụng bản kia.
//
// Kiểu dữ liệu để ngỏ (generic T): file này chỉ lo cất/lấy, khuôn đơn là việc của form.

import type { HuongDon } from "../../api";

const KHOA = (h: HuongDon) => `kt2000.nb.nhap-ten.v1.${h}`;

export interface NhapCoTen<T> {
  id: string;
  ten: string;
  luuLuc: number;   // epoch ms
  duLieu: T;
}

// Mới nhất lên đầu — người dùng gần như luôn tìm bản vừa gác lại.
export function docDsNhap<T>(h: HuongDon): NhapCoTen<T>[] {
  try {
    const s = localStorage.getItem(KHOA(h));
    const ds = s ? (JSON.parse(s) as NhapCoTen<T>[]) : [];
    return Array.isArray(ds) ? ds.sort((a, b) => b.luuLuc - a.luuLuc) : [];
  } catch { return []; }
}

function ghiDs<T>(h: HuongDon, ds: NhapCoTen<T>[]) {
  try { localStorage.setItem(KHOA(h), JSON.stringify(ds)); } catch { /* hết chỗ */ }
}

export function themNhap<T>(h: HuongDon, ten: string, duLieu: T, luuLuc: number): NhapCoTen<T> {
  const ds = docDsNhap<T>(h);
  // randomUUID chỉ có trên HTTPS/localhost. Bản NB chạy sau Cloudflare Tunnel nên gần
  // như luôn có, nhưng rơi về mốc thời gian + số thứ tự để không vỡ ở môi trường HTTP.
  const duoi = (typeof crypto !== "undefined" && crypto.randomUUID)
    ? crypto.randomUUID()
    : `${ds.length}`;
  const b: NhapCoTen<T> = {
    id: `${luuLuc}-${duoi}`,
    ten: ten.trim() || "Nháp không tên",
    luuLuc,
    duLieu,
  };
  ghiDs(h, [b, ...ds]);
  return b;
}

export function xoaNhapTheoId<T>(h: HuongDon, cacId: string[]) {
  const bo = new Set(cacId);
  ghiDs(h, docDsNhap<T>(h).filter((b) => !bo.has(b.id)));
}
