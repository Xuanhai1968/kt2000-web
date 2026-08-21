// Ký hiệu chấm công theo Thông tư 200/2014/TT-BTC, mẫu 01a-LĐTL.
// Spec: docs/THUE/HOPDONG/SPEC-MAN-HOP-DONG.md mục 16.2
//
// PHẢI KHỚP với KY_HIEU_TINH_CONG trong KT2000.Api/Services/ChamCongService.cs.
// Lệch một ký hiệu là màn hình hiện một số, sổ lưu một số khác — mà không báo lỗi gì.

/** Ký hiệu → ý nghĩa. Hiện ở tooltip ô chấm công và chú giải cuối bản in. */
export const KY_HIEU_CC: Record<string, string> = {
  "1": "Đi làm",
  "0": "Nghỉ không lương",
  "CN": "Chủ nhật",
  "L": "Nghỉ lễ",
  "P": "Nghỉ phép",
  "X": "Lương thời gian",
  "SP": "Lương sản phẩm",
  "H": "Hội nghị, học tập",
  "NB": "Nghỉ bù",
  "Ô": "Ốm, điều dưỡng",
  "CÔ": "Con ốm",
  "TS": "Thai sản",
  "T": "Tai nạn",
  "N": "Ngừng việc",
  "LĐ": "Lao động nghĩa vụ",
};

// Ký hiệu TÍNH CÔNG. Nghỉ lễ ('L') và chủ nhật ('CN') KHÔNG cộng công: người lao động
// vẫn hưởng nguyên lương ngày lễ, nhưng đó là chế độ riêng chứ không phải ngày công
// làm việc — cộng vào thì lương thực tế của tháng nhiều lễ vọt lên vô lý.
//   Bằng chứng trong khuôn: cc01 dòng Ngân có 5 ô 'L' cuối tháng mà Tổng = 21, đúng
//   bằng số ô mang '1'.
const TINH_CONG = new Set(["1", "X", "+", "SP", "P", "H", "NB"]);

/** Nửa công ghi '0.5' / '0,5' / '1/2'; ký hiệu chữ tính 1 công. */
export const congCuaO = (o: string | null | undefined): number => {
  const s = (o ?? "").trim();
  if (!s) return 0;
  if (s === "0.5" || s === "0,5" || s === "1/2") return 0.5;
  return TINH_CONG.has(s.toUpperCase()) ? 1 : 0;
};

/** BR-CC-03 — tổng công do hệ thống tính, không cho gõ tay. */
export const tongCongCua = (ngay: (string | null)[]): number =>
  ngay.slice(0, 31).reduce((s, o) => s + congCuaO(o), 0);

/** Thứ trong tuần, index theo Date.getDay() (0 = chủ nhật). */
export const THU_VN = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
