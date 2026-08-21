import { useEffect, useState } from "react";

/**
 * Chiều cao thân bảng (px) cho `scroll={{ y }}` của antd Table trong modal toàn màn.
 *
 * VÌ SAO PHẢI TÍNH BẰNG JS, không để CSS lo (chốt 21/08 sau ba lần thử hỏng):
 *   1. Nối chuỗi flex từ .ant-modal-body xuống .ant-table-body — KHÔNG ăn: rc-table
 *      còn vài lớp bọc trung gian; đứt một mắt là thân bảng co về 0.
 *   2. Ép `height` cứng bằng CSS — hộp to ra nhưng antd vẫn ĐO theo scroll.y đang là
 *      1px, nên nó chỉ dựng đúng số dòng vừa 1px: bảng TRẮNG TRƠN dù dữ liệu đã về đủ.
 *
 * antd dùng chính con số scroll.y để quyết định dựng bao nhiêu dòng, nên đưa số thật
 * vào đó là cách duy nhất nó hiểu.
 *
 * @param truDi tổng chiều cao phần KHÔNG phải thân bảng: lề modal + đầu modal +
 *              thanh nút + hàng tiêu đề bảng. Mỗi màn một khác nên truyền vào.
 */
export function useChieuCaoBang(truDi: number): number {
  const tinh = () => Math.max(160, window.innerHeight - truDi);
  const [cao, setCao] = useState(tinh);

  useEffect(() => {
    const doLai = () => setCao(tinh());
    window.addEventListener("resize", doLai);
    // Gọi ngay một lần: chiều cao lúc dựng component có thể khác lúc modal mở xong.
    doLai();
    return () => window.removeEventListener("resize", doLai);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [truDi]);

  return cao;
}
