
export const tien = (v: number | null | undefined) =>
  v == null || v === 0 ? "" : Number(v).toLocaleString("vi-VN",
    { maximumFractionDigits: 0 });

export const ngayNgan = (s: string | null | undefined) => {
  const p = (s ?? "").slice(0, 10).split("-");
  return p.length === 3 && p[0] ? `${p[2]}/${p[1]}/${p[0]}` : "";
};
