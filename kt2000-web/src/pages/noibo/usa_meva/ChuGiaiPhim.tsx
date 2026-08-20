// BẢNG CHÚ GIẢI PHÍM TẮT — bê từ USA_Meva (components/HotkeyLegend.tsx).
//
// MỘT nhãn duy nhất "Phím tắt" trên thanh tiêu đề. Rê chuột vào là hiện bảng; bấm thì
// GHIM lại để đọc thong thả (rê chuột phải giữ tay đúng chỗ, đọc 5 dòng là mỏi).
//
// Trước đây bày cả 5 chip thành hàng ngang cho "thấy ngay không cần rê chuột", nhưng
// chúng ăn hết thanh tiêu đề và đẩy nút Mở nháp / Danh sách đơn đi. Phím tắt là thứ
// dùng vài lần đầu rồi thuộc, không đáng chiếm chỗ thường trực.

import { useState } from "react";
import { Tooltip, Tag } from "antd";
import "./usa-meva.css";

export interface MotPhim {
  phim: string;
  nhan: string;
  moTa?: string;   // câu giải thích đầy đủ; thiếu thì lấy nhan
}

export default function ChuGiaiPhim({ cac }: { cac: MotPhim[] }) {
  // null = để antd tự lo (hiện khi rê chuột). true = ghim mở sau khi bấm.
  const [ghim, setGhim] = useState(false);

  return (
    <Tooltip
      // Bấm -> ghim mở, bấm lần nữa -> thả. Khi KHÔNG ghim thì trả quyền cho antd
      // (undefined) để giữ nguyên hành vi rê-chuột-hiện.
      open={ghim ? true : undefined}
      onOpenChange={(mo) => { if (!mo) setGhim(false); }}
      placement="bottomRight"
      title={
        <div className="umv-phim-bang">
          {cac.map((p) => (
            <div key={p.phim} className="umv-phim-bang__dong">
              <kbd className="umv-phim__kbd">{p.phim}</kbd>
              <span>{p.moTa ?? p.nhan}</span>
            </div>
          ))}
        </div>
      }
    >
      <Tag
        className="umv-phim-nhan"
        onClick={() => setGhim((g) => !g)}
      >
        ⌨ Phím tắt
      </Tag>
    </Tooltip>
  );
}
