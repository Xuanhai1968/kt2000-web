// SO KHỚP CHỮ TIẾNG VIỆT — bê từ USA_Meva (utils/searchMatch.ts).
//
// Gõ "sua chua" phải ra "Sữa chua", gõ "dg" phải ra "Đường". Người bán hàng gõ nhanh,
// không bỏ dấu, nên tìm kiếm phải bỏ dấu cả hai phía rồi mới so.
//
// Bỏ so với bản gốc: searchFilterOption (dành cho antd Select — bên NB không dùng Select).
// Giữ lại phần đánh dấu chữ trùng vì danh sách gợi ý của NB có tô đậm chỗ khớp.

const DAU_THANH = /[̀-ͯ]/g;

// Bỏ dấu + về chữ thường. "Đường" -> "duong"
export function boDau(s: string | null | undefined): string {
  if (!s) return "";
  return String(s)
    .toLowerCase()
    .normalize("NFD")
    .replace(DAU_THANH, "")
    .replace(/đ/g, "d")
    .trim();
}

export interface MucTim {
  chuan: string;        // đã bỏ dấu
  tu: string[];         // tách thành từng từ
}

// Bỏ dấu tốn CPU mà danh mục thì lặp đi lặp lại — nhớ lại kết quả. Chạm trần thì dọn
// sạch (đơn giản hơn LRU và ở cỡ này không khác gì nhau).
const NHO = new Map<string, MucTim>();
const TRAN_NHO = 5000;

export function dungMuc(chu: string): MucTim {
  const co = NHO.get(chu);
  if (co) return co;
  const chuan = boDau(chu);
  const m: MucTim = { chuan, tu: chuan.split(/[^a-z0-9]+/).filter(Boolean) };
  if (NHO.size >= TRAN_NHO) NHO.clear();
  NHO.set(chu, m);
  return m;
}

// Gõ một cụm -> tìm cụm đó ở bất kỳ đâu.
// Gõ nhiều cụm -> phải khớp ĐỦ mọi cụm (không cần đúng thứ tự): "sua vinamilk" ra
// "Sữa tươi Vinamilk". Cụm ngắn (<=2 ký tự) chỉ tính khi đứng ĐẦU một từ, nếu không
// thì gõ "tv" sẽ quét trúng vô số dòng chẳng liên quan.
export function khop(tu: string, m: MucTim): boolean {
  const q = boDau(tu);
  if (!q) return true;
  const cum = q.split(/\s+/).filter(Boolean);
  if (cum.length === 1) return m.chuan.includes(cum[0]);
  return cum.every((c) =>
    c.length <= 2 ? m.tu.some((w) => w.startsWith(c)) : m.chuan.includes(c));
}

export const khopChu = (tu: string, dich: string) => khop(tu, dungMuc(dich));

// ---------- Cắt chuỗi thành đoạn trùng / không trùng để tô đậm ----------
export interface DoanChu { chu: string; trung: boolean; }

export function catDoanTrung(tu: string, dich: string): DoanChu[] {
  if (!dich) return [];
  const q = boDau(tu);
  const t = boDau(dich);
  if (!q || !t) return [{ chu: dich, trung: false }];

  // Chỉ số của chuỗi ĐÃ BỎ DẤU khớp 1-1 với chuỗi gốc: normalize("NFD") tách dấu thành
  // ký tự riêng rồi bị xóa, nên mỗi chữ cái gốc vẫn còn đúng một ký tự. Nhờ vậy cắt
  // theo chỉ số của bản bỏ dấu vẫn ra đúng đoạn trên chuỗi CÓ dấu.
  const khoang: [number, number][] = [];
  const nguyenCum = t.indexOf(q);
  if (nguyenCum !== -1) {
    khoang.push([nguyenCum, nguyenCum + q.length]);
  } else {
    for (const c of q.split(/\s+/).filter(Boolean)) {
      let tu0 = 0, tai: number;
      while ((tai = t.indexOf(c, tu0)) !== -1) {
        const truoc = tai === 0 ? "" : t[tai - 1];
        const dauTu = truoc === "" || !/[a-z0-9]/.test(truoc);
        if (c.length > 2 || dauTu) khoang.push([tai, tai + c.length]);
        tu0 = tai + c.length;
      }
    }
  }
  if (khoang.length === 0) return [{ chu: dich, trung: false }];

  // Gộp các khoảng chồng nhau, nếu không sẽ cắt trùng và chữ bị nhân đôi
  khoang.sort((a, b) => a[0] - b[0]);
  const gop: [number, number][] = [];
  let nay = khoang[0];
  for (let i = 1; i < khoang.length; i++) {
    if (khoang[i][0] <= nay[1]) nay[1] = Math.max(nay[1], khoang[i][1]);
    else { gop.push(nay); nay = khoang[i]; }
  }
  gop.push(nay);

  const ra: DoanChu[] = [];
  let cuoi = 0;
  for (const [d, c] of gop) {
    if (d > cuoi) ra.push({ chu: dich.slice(cuoi, d), trung: false });
    ra.push({ chu: dich.slice(d, c), trung: true });
    cuoi = c;
  }
  if (cuoi < dich.length) ra.push({ chu: dich.slice(cuoi), trung: false });
  return ra;
}
