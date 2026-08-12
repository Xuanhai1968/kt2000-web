// ĐỌC / GHI NGÀY kiểu VFP — bê từ USA_Meva (utils/dateParse.ts).
//
// Tách khỏi ONgayUsa.tsx vì luật của eslint (react-refresh/only-export-components):
// file component chỉ được export component, lẫn hàm thường vào là hỏng hot-reload.

// "5" | "512" | "0512" | "051226" | "05122026" -> Date
// Người bán hàng gõ số nhanh hơn rê chuột chọn lịch, nên nhận mọi kiểu gõ tắt.
export function docNgayUsa(s: string): Date | null {
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
  // Chặn 31/02: Date tự đẩy sang tháng sau, phải so lại mới biết ngày có thật không
  return d.getMonth() === th - 1 && d.getDate() === ng ? d : null;
}

export const ngayRaChuoiUsa = (d: Date | null) => {
  if (!d) return "";
  const p = (x: number) => String(x).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
};

// Gửi API dạng yyyy-MM-dd (không kèm giờ) để backend đọc thành DATE không lệch múi giờ.
// Dùng toISOString() sẽ quy về UTC, đơn gõ lúc 7h sáng bị lùi thành hôm trước.
export const ngayRaIsoUsa = (d: Date | null) => {
  if (!d) return null;
  const p = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

export const homNayUsa = () => ngayRaChuoiUsa(new Date());
