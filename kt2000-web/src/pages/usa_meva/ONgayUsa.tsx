// Ô NGÀY gõ kiểu VFP — bê từ USA_Meva (components/DateInput.tsx).
//
// Không bắt bấm lịch: gõ "5" ra ngày 5 tháng này, "512" ra 5/12 năm nay, "05122026" ra
// đủ ngày. Phần đọc/ghi ngày nằm ở ngayThang.ts.
//
// Chuẩn hóa lúc RỜI Ô (blur/Enter), không phải lúc gõ: sửa ngay trong lúc người ta đang
// gõ dở "512" thành "5/12/2026" là con trỏ nhảy lung tung, gõ tiếp không được.

import { useState } from "react";
import { Input } from "antd";
import { docNgayUsa, ngayRaChuoiUsa } from "./ngayThang";

export default function ONgayUsa({ giaTri, onDoi, onXong, goiY }: {
  giaTri: string;
  onDoi: (v: string) => void;
  onXong?: () => void;
  goiY?: string;
}) {
  const [dangGo, setDangGo] = useState<string | null>(null);

  const chuanHoa = () => {
    if (dangGo == null) return;
    const d = docNgayUsa(dangGo);
    // Gõ sai thì GIỮ NGUYÊN chữ người ta gõ, không tự xóa: xóa trắng thì họ không biết
    // mình gõ sai chỗ nào, tưởng máy nuốt mất.
    onDoi(d ? ngayRaChuoiUsa(d) : dangGo);
    setDangGo(null);
  };

  return (
    <Input
      size="small"
      value={dangGo ?? giaTri}
      placeholder={goiY ?? "dd/mm/yyyy"}
      onChange={(e) => setDangGo(e.target.value)}
      onBlur={chuanHoa}
      onKeyDown={(e) => {
        if (e.key === "Enter") { e.preventDefault(); chuanHoa(); onXong?.(); }
      }}
    />
  );
}
