# SPEC-000 — Giai đoạn 2: Từ Login đến bộ sổ hoàn chỉnh (v3)

| | |
|---|---|
| **Trạng thái** | 🟢 CHỜ LEADER DUYỆT LẦN CUỐI — v3 gộp comment 27/07 đợt 2 + khảo sát THU_CHI + ảnh giao diện |
| **Thay đổi so v2** | Thêm thiết kế "một vỏ nhiều ruột"; rút phạm vi WP-02 còn 6 bảng chính; chốt DM_TK dạng cột cờ; thêm TenantCredentials (pass cổng HĐĐT); thêm Nhật ký quyết định |

---

## 1. Quyết định nền (chốt)

- DB đơn vị-năm: **`<MA_DONVI>_<NĂM>`** (vd `TUAN_NGA_2025`); BR-DB-01: MA_DONVI
  chỉ A-Z, 0-9, `_`; kế toán trưởng đặt, hệ thống kiểm tra hợp lệ + không trùng.
- TenantDbResolver là cửa duy nhất ghép tên DB.
- TUAN_NGA 2025 trước; HUY_THANH 2026 (giá thành) giai đoạn 2b.

## 2. Giao diện: "MỘT VỎ, NHIỀU RUỘT" (theo ảnh VFP)

- **Một AppShell chung** cho mọi đơn vị: layout + menu giống nhau (kế thừa tinh
  thần LSTMENU data-driven của VFP; đợt đầu menu khai tĩnh trong React, chuyển
  data-driven sau).
- Hành vi phân nhánh **tại component đích** theo claim `tenant_type`:
  - Ví dụ mục "Hóa đơn GTGT Đầu vào": `internal` (MDN_NB) → màn hình danh sách
    đơn vị + tick chọn + nút Lấy HĐĐT (hàng đợi job, tiến độ từng đơn vị);
    tenant thường → form tìm/sửa hóa đơn của chính đơn vị đó.
- Console MDN_NB bổ sung 2 chức năng quản trị: Thêm đơn vị (BR-DB-01, tạo
  Tenants + FiscalYears + database mới) và Mở năm mới hàng loạt.

## 3. WP-01 — KT2000_Base (chiến lược từng danh mục — giữ như v2)

DM_HANG structure-only (giữ MA_NGAN, dữ liệu mọc từ HĐĐT + tồn đầu); DM_KH import
sau làm sạch (tách MST thật / khách lẻ KHx; gộp trùng theo MST; bỏ cột rác);
DM_DVT xây bộ chuẩn tinh gọn, không import; DM_KHO structure-only; DM_IN import
nguyên (60 sổ — Leader tick chọn bộ tối thiểu trên danh sách này); KET_CHUYEN
import nguyên (19 quy tắc); MA_NGAN chỉ còn ở DM_HANG.

**DM_TK — ĐÃ CHỐT CÁCH LÀM:** giữ mô hình **mỗi cờ một cột BIT** (17 cờ), đổi tên
sạch (vd `san_¬ham_do_dang` → `SanPhamDoDang`). Lý do: mỗi cờ gắn một nhánh xử
lý của engine hạch toán — thêm cờ đồng nghĩa sửa engine, ALTER TABLE đi kèm là
tự nhiên; cột BIT cho entity C# rõ ràng, query dễ đọc. **Buổi DM_TK** vẫn giữ:
Leader định nghĩa từng cờ → mỗi cờ một BR đánh số trong spec engine (WP-06).

## 4. WP-02 — Database `TUAN_NGA_2025` [RÚT GỌN PHẠM VI]

**Đợt này chỉ 6 bảng chính + nhóm staging:**

| Bảng | Nguồn cấu trúc | Ghi chú |
|---|---|---|
| HOA_DON (74 cột) / HOA_DON_LINE (50 cột) | hoa_don.xlsx, hoa_don_line.xlsx | Rà từng cột: giữ / bỏ / hỏi Leader. Giữ cụm HĐ thay thế-điều chỉnh và cụm predict |
| THU_CHI (23 cột) / THU_CHI_LINE (22 cột) | thu_chi.xlsx, thu_chi_line.xlsx | Khóa MA_PHIEU; lưu ý cột `so_luong` ở THU_CHI thực chất đang mang giá trị tiền — đặt lại tên đúng nghĩa khi thiết kế |
| CONG_NO / TON_KHO | kt2000.dbc | **Tạo structure ngay**; nạp số dư + chuyển năm vẫn ở WP-08 |
| Bỏ nhóm bảng *_e/err | kt2000.dbc | | Nhóm staging HĐĐT | hdon_e, hd_line_e, tchi_e, tc_line_e, hd_err… | Thiết kế cùng WP-03, được phép gọn hơn VFP |

HUY_THANH 2026 thêm HANG_DM + nhóm giá thành bằng script SQL đánh số mới —
không đập cái cũ.

## 5. [MỚI] TenantCredentials — pass cổng hoadondientu.gov.vn

- Bảng mới trong **KT2000_Master**: `TenantCredentials(TenantId, CredType
  ='hoadondientu', LoginName /*=MST*/, PasswordEncrypted, UpdatedAt)`.
- Mã hóa **hai chiều** (ASP.NET Data Protection / AES, khóa nằm server) — khác
  bản chất password user (BCrypt một chiều) vì máy phải đọc lại để đăng nhập hộ.
- Luật: chỉ API mang claim `internal` được truy cập; không bao giờ trả password
  về frontend (chỉ trạng thái đã-có/chưa-có, đổi = nhập đè); không ghi log.
- Import một lần từ cột pass cũ trong DM_DONVI; cột cũ không migrate; file Excel
  gốc không đưa vào repo.

## 6. Tồn đầu & chuyển năm: WP-08 (giữ nguyên — lùi có chủ đích)

## 7. Ưu tiên hiện tại

1. **WP-01a:** Console MDN_NB khung (danh sách đơn vị, thêm đơn vị, mở năm) +
   quy ước DbName mới → tạo được `TUAN_NGA_2025` rỗng đúng schema.
2. **WP-01b:** KT2000_Base + import DM_KH sạch, DM_IN, KET_CHUYEN, DM_TK (sau
   buổi định nghĩa cờ); structure Products/ĐVT/Kho.
3. **WP-02:** 6 bảng chính + staging trong `TUAN_NGA_2025`.
4. **WP-03:** Gắn Lấy HĐĐT (Python, đọc TenantCredentials) từ console → đổ dữ
   liệu 2025 thật.
5. Rồi WP-04 làm kho → WP-05 phân tích giá → WP-06 hạch toán + sổ.

## 8. [MỚI] Chống quên: Nhật ký quyết định

Lập file `docs/NHAT-KY-QUYET-DINH.md` — mỗi quyết định lớn 3 dòng (ngày / quyết
gì / vì sao). Bộ ba tra cứu khi quay lại sau 1 tháng: SPEC (cái gì) + Nhật ký
(tại sao) + `git log` (ai, khi nào). Nội dung khởi tạo:

- 24-07: DB per tenant-năm + TenantDbResolver duy nhất — giữ mental model VFP,
  vẫn mở đường gộp sau.
- 26-07: Bỏ tiền tố KT_ trong tên DB — thừa, MA_DONVI tự đủ định danh.
- 27-07: DM_HANG/DM_DVT không import — dữ liệu bẩn, xây sạch từ HĐĐT rẻ hơn dọn.
- 27-07: DM_TK giữ 17 cột BIT — mỗi cờ gắn một nhánh engine, thêm cờ = sửa code.
- 27-07: Pass cổng HĐĐT mã hóa 2 chiều trong TenantCredentials — máy phải đọc
  lại được, khác pass user (băm 1 chiều).
- 27-07: Tồn đầu (CONG_NO/TON_KHO) tạo structure ngay, nạp số + chuyển năm lùi
  WP-08 — thông tuyến HĐĐT trước.

## 9. Câu hỏi mở còn lại

1. Buổi DM_TK: định nghĩa 17 cờ (→ BR cho engine WP-06).
2. Leader tick bộ sổ tối thiểu trên 60 dòng DM_IN.
3. Quy trình làm kho hiện tại trên VFP (phục vụ WP-04).
