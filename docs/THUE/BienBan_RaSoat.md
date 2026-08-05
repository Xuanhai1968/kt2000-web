# Biên bản rà soát cột — kết luận các mục HỎI LẠI (29/07/2026)

Đi kèm `database/004_tenant_schema_v2.sql`. Nguồn: RaSoat_Cot_4Bang đã duyệt.
Kết quả: HOA_DON 36 cột giữ / 38 bỏ · HOA_DON_LINE 33/17 · THU_CHI 10/13 ·
THU_CHI_LINE 13/9 (+ mỗi bảng 4 cột audit mới).

## 1. Bộ vết audit (câu hỏi lặp 22 lần: "SQL Server làm rồi?")

**KHÔNG — SQL Server không ghi ai-thêm-ai-sửa theo nghĩa nghiệp vụ.** Transaction
log chỉ phục vụ khôi phục, không đọc theo dòng; và web app kết nối DB bằng MỘT
tài khoản chung nên DB không biết kế toán viên nào thao tác (người dùng chỉ tồn
tại ở tầng JWT). → Bỏ 10 cột vết VFP, thay bằng **bộ tứ chuẩn** trên cả 4 bảng:
`created_by, created_at, updated_by, updated_at` — backend tự điền từ claim
`login_name`. `ten_nv_*` bỏ (JOIN Users ra tên), `pc_id*` bỏ (web không còn
"máy nào"), `ngay_nhap` bỏ vì `created_at` thay đúng vai.

## 2. Các mục HỎI LẠI khác

| Cột | Kết luận | Lý do |
|---|---|---|
| hd_thay_the_dieu_chinh | BỎ | Suy ra được: `tich_chat_hd_lienquan` khác trống ⇔ là HĐ thay thế/điều chỉnh |
| proba | GIỮ | 1 cột FLOAT rẻ; cần cho ngưỡng duyệt + huấn luyện lại model |
| same_proba | BỎ | Theo quyết định Leader (trùng proba) |
| get_pic | BỎ | Không rõ chức năng, trống 100% |
| THU_CHI_LINE ma_hang, dvt | GIỮ nguyên kiểu VFP | Tái thiết kế (nếu có) thuộc module TSCĐ/CCDC sau |
| THU_CHI so_luong | ĐỔI TÊN → `so_tien` DECIMAL(18,2) | Cột chứa tiền, tên cũ gây hiểu nhầm — pipeline mới viết mới nên đổi không đau |

## 3. Quy ước đã áp trong DDL

- Giữ **tên cột VFP** (ASCII snake_case) cho 4 bảng nghiệp vụ; chỉ đổi tên sai
  nghĩa (so_tien). Tên cột model (is_predict, proba…) giữ nguyên vì Python đang dùng.
- Khóa chính: HOA_DON(ma_hd), THU_CHI(ma_phieu), 2 bảng LINE(auto_num BIGINT);
  khóa ngoại LINE → bảng đầu; index: ngay, ma_kh, so_hd, ma_hang, ghi_no/ghi_co.
- Kiểu dữ liệu đo từ dữ liệu 2025 thật + ghi đè ngữ nghĩa cho cột trống 100%
  (nhóm *_lienquan là NVARCHAR/DATE dù ở TUAN_NGA chưa có dữ liệu).
- Tiền DECIMAL(18,2); số lượng DECIMAL(18,3); cờ BIT; ngày DATE.

## 4. "GIỮ nhưng lăn tăn" — nguyên tắc xử lý

Chuyển nhà trung thành trước, cải tạo theo từng module sau (khi làm engine sẽ
BIẾT cấu trúc hay hơn thay vì đoán). Các điểm hẹn xem lại đã ghi nhật ký:
- `ma_tv` (thương vụ) → xem lại ở module GIÁ THÀNH (HUY_THANH).
- `ma_hang` trong khấu hao/phân bổ → xem lại ở module TSCĐ/CCDC.
- Cách quản lý HĐ thay thế/điều chỉnh → xem lại khi làm màn hình HĐ (WP-04).

## 5. Việc tiếp theo

1. Chạy 004 trên TUAN_NGA_2025 và TUAN_NGA_2026 (SSMS, chọn đúng DB, F5) —
   SCHEMA_VERSION nhảy lên 2.
2. Nâng template trong AdminService lên v2 (hướng dẫn riêng) để đơn vị/năm tạo
   MỚI tự có đủ 4 bảng.
3. CONG_NO + TON_KHO: Leader xuất thêm cong_no.xlsx, ton_kho.xlsx (structure) —
   sẽ vào schema v3 cùng WP-08.
4. Ghi chú nghiệp vụ quý trong file rà soát (thang khai thuế, ngay_nh hàng
   không âm, cặp CK đảo chiều…) sẽ được đúc thành BR trong SPEC engine (WP-06).
