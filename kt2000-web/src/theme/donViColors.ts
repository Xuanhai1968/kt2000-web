// BR-GD-01 — quy ước màu đánh dấu đơn vị, khai MỘT CHỖ DUY NHẤT.
// Mọi màn hình có danh sách đơn vị import từ đây. Cấm component tự gõ mã hex:
// spec đã nêu thẳng lý do — mỗi dev một sắc đỏ thì nhìn hai màn tưởng hai nghĩa.
//
// Màu áp lên CHỮ của cột Mã + Tên đơn vị, không tô nền cả dòng.

export const MAU_KHAI_THANG = "#f5222d";   // red-6
export const MAU_NOI_BO     = "#a0522d";   // nâu, ngoài palette Ant

// Khai QUÝ cố tình KHÔNG có màu riêng (chốt Leader 10/08, sửa lại BR-GD-01 bản đầu).
// Hai lý do: cột "Kỳ khai" đã nói rõ tháng hay quý rồi nên màu không thêm thông tin
// gì; và tô xanh cả cột thì màu chiếm gần hết bảng, đỏ hết nổi bật — mà đỏ mới là
// thứ cần đập vào mắt (khai tháng = có việc mỗi tháng).
// Màu ở đây chỉ để BÁO NGOẠI LỆ, không phải để phân loại đủ mọi trường hợp.

// Chỉ cần hai trường này để quyết màu — nhận kiểu rộng để dùng được cho cả
// AdminTenant lẫn bất kỳ khuôn dữ liệu đơn vị nào sau này.
export interface DonViCoMau {
  tenantType: string;
  khaiQuy: boolean;
}

// NB NÂU THẮNG (spec mục 3, quy tắc ưu tiên): đơn vị *_NB dù gắn kỳ khai gì cũng
// hiện nâu, vì kỳ khai vô nghĩa với NB. Phải xét TRƯỚC khaiQuy — cột khaiQuy của
// tenant nội bộ mặc định false, để nguyên thì cả đám hiện đỏ như khai tháng.
//
// 'internal' (MDN_NB) cũng nâu: nó cũng không phải đơn vị khai thuế. Nó chỉ lọt vào
// danh sách ở màn Mở năm làm việc (QT-02), các màn khác đã lọc sẵn.
// Trả về undefined = để nguyên màu chữ mặc định (khai quý — trường hợp thường gặp).
export function mauDonVi(t: DonViCoMau): string | undefined {
  if (t.tenantType === "noibo" || t.tenantType === "internal") return MAU_NOI_BO;
  return t.khaiQuy ? undefined : MAU_KHAI_THANG;
}

// Chữ đậm cũng chỉ dành cho ngoại lệ. Bôi đậm hết thì chẳng còn gì đậm.
export function damDonVi(t: DonViCoMau): 600 | undefined {
  return mauDonVi(t) ? 600 : undefined;
}
