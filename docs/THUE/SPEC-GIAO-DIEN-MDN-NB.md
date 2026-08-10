# SPEC-GIAO-DIEN-MDN-NB — Giao diện vỏ (AppShell) khi đăng nhập MDN_NB

| | |
|---|---|
| Phiên bản | v0.2 (đã chốt 8.1–8.3; tên trạng thái đổi theo góp ý Leader) |
| Ngày | 10/08/2026 |
| Người viết | Leader (Hiu) + Claude |
| Người thực hiện | dev1 (instance thuế) — ranh giới với dev2 xem mục 7 |
| Vị trí | docs/THUE/SPEC-GIAO-DIEN-MDN-NB.md |
| Nguồn gốc | 6 mục "Nghiệm thu phần quản lý hệ thống" ngày 10/08/2026 + ảnh chụp màn hình MDN_NB (/app/hoa-don-vao) |

> **Luật sửa spec:** mọi thay đổi yêu cầu sau này đi qua PR sửa file này để dev thấy diff. Không trao đổi miệng rồi code.

---

## 1. Mục đích & phạm vi

Spec này là **chủ sở hữu duy nhất** của 4 nhóm quy tắc về giao diện vỏ:

1. **Menu nào hiện / ẩn / đổi nhãn** theo loại tenant đăng nhập (điền nội dung cụ thể cho BR-NB-06).
2. **Quy ước màu** đánh dấu đơn vị trong các danh sách.
3. **Trạng thái đơn vị** và quy tắc **màn hình nào hiện danh sách đơn vị nào**.
4. Chỗ dành sẵn cho các màn hình MDN_NB tương lai (theo dõi phí dịch vụ, console tiến độ Leader).

**KHÔNG thuộc phạm vi spec này** (đã có chủ khác):

| Nội dung | Chuyển về |
|---|---|
| Ô nhập mật khẩu TCT (pass 78) khi thêm/sửa đơn vị | SPEC-QUAN-TRI v1.1, mục QT-03 + thiết kế TenantCredentials. Hướng đã chốt: **có** ô nhập ngay trên form thêm/sửa đơn vị; ô là **write-only** (đặt mới/ghi đè, không bao giờ hiển thị lại), lưu bảng Master mã hóa 2 chiều, chỉ backend + claim internal đọc — giống cơ chế MatKhauBanDauMaHoa. |
| Danh sách đơn vị dùng **scroll ~10 dòng, không phân trang** | Quy ước UI toàn cục → CLAUDE.md (luật nhà). Spec này chỉ dẫn chiếu. |
| Menu và màn hình của tenant NB (khách dùng *_NB) | SPEC-KT2000-NB (dev2). Spec này chỉ ghi dòng tham chiếu trong bảng menu. |

---

## 2. Bối cảnh

- AppShell đã rẽ nhánh theo claim `tenant_type` (BR-NB-06): FE rẽ nhánh là tiện nghi, BE gate mới là an toàn thật.
- Hiện trạng (ảnh 10/08/2026): đăng nhập MDN_NB thấy **nguyên menu của tenant khách hàng** (Phiếu thu/chi, Báo cáo tồn kho/công nợ...) — sai ngữ cảnh; danh sách đơn vị chưa có mã màu; các đơn vị *_NB lẫn trong màn Lấy HĐ.
- Nguyên tắc "màu-ngữ-cảnh" đã chốt 08/08/2026 tại form Lấy HĐ (dòng đỏ = khai tháng; màu rất nhạt báo hướng Vào/Ra). Spec này mở rộng nguyên tắc đó thành quy ước chung.

---

## 3. BR-GD-01 — Quy ước màu đánh dấu đơn vị

**Áp dụng cho MỌI danh sách đơn vị** (Đơn vị khách hàng, Mở năm làm việc, Lấy HĐ điện tử, và mọi màn hình tương lai có danh sách đơn vị). Màu áp lên **chữ của cột Mã + Tên đơn vị**, không tô nền cả dòng.

| Loại đơn vị | Màu chữ | Token đề xuất (Ant Design) |
|---|---|---|
| Khách hàng, khai **Tháng** | Đỏ | `red-6` `#f5222d` |
| Khách hàng, khai **Quý** | Xanh | `blue-6` `#1677ff` |
| Tenant **NB** (`tenant_type = noibo`) | Nâu | `#a0522d` (ngoài palette Ant — dùng hằng số chung) |

Quy tắc ưu tiên: **NB nâu thắng** — đơn vị *_NB dù gắn kỳ khai gì cũng hiển thị nâu (kỳ khai vô nghĩa với NB).

**Bắt buộc:** 3 mã màu khai báo **một chỗ duy nhất** (vd `src/theme/donViColors.ts`), mọi màn hình import từ đó. Cấm mỗi component tự gõ mã hex — tránh "mỗi dev một sắc đỏ".

Chú giải màu (legend) hiển thị nhỏ ở đầu danh sách, theo mẫu đã có ở form Lấy HĐ ("Đơn vị chữ đỏ là khai THÁNG") — bổ sung xanh + nâu.

*Định hướng tương lai (chưa giao việc):* cùng nguyên tắc màu-ngữ-cảnh sẽ dùng để báo hiệu đang đăng nhập tenant NB vs tenant khách (đã ghi nhận 08/08) — khi làm sẽ bổ sung vào spec này qua PR.

---

## 4. BR-GD-02 — Bảng menu × loại tenant

Nguồn sự thật duy nhất cho việc hiện/ẩn/đổi nhãn menu. FE đọc `tenant_type` từ claim; BE giữ gate 403 như hiện hành (AdminController + gate internal).

| Menu | Tenant khách thuế (`khach_hang`) | MDN_NB (`internal`) | Tenant NB (`noibo`) |
|---|---|---|---|
| Hóa đơn GTGT đầu vào | ✅ nhãn gốc | ✅ đổi nhãn: **"Lấy HĐ GTGT đầu Vào"** | ❌ |
| Hóa đơn GTGT đầu ra | ✅ nhãn gốc | ✅ đổi nhãn: **"Lấy HĐ GTGT đầu Ra"** | ❌ |
| Phiếu thu | ✅ | ❌ ẩn | theo SPEC-KT2000-NB |
| Phiếu chi | ✅ | ❌ ẩn | theo SPEC-KT2000-NB |
| Báo cáo thuế | ✅ | ✅ (theo dõi nộp tờ khai toàn bộ khách) | ❌ |
| Báo cáo tồn kho | ✅ | ❌ ẩn | theo SPEC-KT2000-NB |
| Báo cáo công nợ | ✅ | ❌ ẩn | theo SPEC-KT2000-NB |
| QUẢN TRỊ (Đơn vị khách hàng, Mở năm làm việc, Quản lý người dùng, Nhật ký hệ thống) | ❌ | ✅ | ❌ |
| *(tương lai)* Phí dịch vụ | ❌ | 🔜 chỗ dành sẵn — spec riêng sau | ❌ |
| Menu nghiệp vụ NB (5 form nhập + 3 báo cáo + Gói hàng) | ❌ | ❌ | ✅ theo SPEC-KT2000-NB |

Ghi chú:
- Đổi nhãn **chỉ ở MDN_NB**: cùng một component đích (ConsoleLayHoaDon), chỉ khác chuỗi nhãn menu — vì với MDN_NB bản chất công việc là "đi lấy hộ HĐ cho khách", còn với 1 đơn vị khách đó là "hóa đơn của tôi".
- Ẩn menu ở FE **không thay** gate BE: user MDN_NB gõ thẳng URL /app/phieu-thu vẫn phải bị chặn (hoặc chuyển hướng) — thêm vào checklist nghiệm thu.

---

## 5. BR-GD-03 — Trạng thái đơn vị & danh sách theo từng màn hình

### 5.1 Vấn đề

Mỗi màn hình cần một danh sách đơn vị **khác nhau** (ví dụ: đơn vị tạm ngừng kinh doanh không phát sinh HĐ → không cần xuất hiện ở màn Lấy HĐ, nhưng vẫn nộp tờ khai trắng → **bắt buộc** xuất hiện ở Báo cáo thuế). Nếu để mỗi màn hình tự hard-code danh sách, nửa năm sau không ai giải thích được vì sao đơn vị X có ở màn này mà vắng ở màn kia.

### 5.2 Giải pháp: một cột dữ liệu, nhiều màn hình cùng tra

Thêm cột **`TrangThai`** vào bảng `Tenants` (KT2000_Master), kiểu `varchar(20)`, NOT NULL, default `HOAT_DONG`:

| Giá trị | Nghĩa |
|---|---|
| `HOAT_DONG` | Hoạt động bình thường |
| `TAM_NGUNG` | Tạm ngừng kinh doanh — không phát sinh HĐĐT (không có gì để lấy), nhưng vẫn nộp tờ khai trắng |
| `NGUNG_HAN` | Ngừng hẳn / thanh lý hợp đồng dịch vụ |

> **Vì sao đặt tên theo trạng thái, không theo hành vi:** tên giá trị ghi **bản chất nghiệp vụ của đơn vị** (đang tạm ngừng kinh doanh), còn hệ quả trên từng màn hình (ẩn khỏi Lấy HĐ, vẫn hiện ở Báo cáo thuế, worker cuối tuần bỏ qua, màn Phí dịch vụ sau này có thể tính phí khác...) tra ở bảng 5.3. Nếu đặt tên theo một hành vi (vd "tạm ngừng lấy HĐĐT") thì khi trạng thái này chi phối màn hình thứ ba, thứ tư, cái tên sẽ hết nghĩa. Giống bên VFP: cờ trong DM_DONVI ghi "đơn vị này là gì", chứ không ghi "form X ẩn đơn vị này".

- **`TrangThai` KHÔNG thay thế `IsActive`.** `IsActive` giữ vai trò công tắc đăng nhập (kill switch kỹ thuật); `TrangThai` là trạng thái nghiệp vụ dùng để lọc danh sách. Hai cột độc lập (thường `NGUNG_HAN` đi kèm `IsActive = 0`, nhưng không ràng buộc cứng). *(Tương tự bên VFP: một cờ trong DM_DONVI, mọi form cùng lọc theo cờ — không sửa từng form.)*
- Sửa `TrangThai` tại form **Đơn vị khách hàng** (màn sửa 5 khóa hiện có) → mỗi lần đổi ghi **TenantChangeLog** (nối vào cơ chế audit 003 sẵn có).
- Script migration: đánh số theo **luật claim số trong CLAUDE.md** — số kế tiếp còn trống sau khi dọn vụ trùng 013/014 (dự kiến `020_add_trang_thai_tenants.sql`; dev1 xác nhận số trước khi commit).

### 5.3 Bảng lọc chuẩn (nguồn sự thật duy nhất)

| Màn hình | `khach_hang` HOAT_DONG | `khach_hang` TAM_NGUNG | `khach_hang` NGUNG_HAN | `noibo` (*_NB) | MDN_NB |
|---|---|---|---|---|---|
| Lấy HĐ GTGT đầu Vào / Ra | ✅ | ❌ | ❌ | ❌ *(sửa hiện trạng — ảnh 10/08 đang lẫn TUAN_NGA_NB, USA_MEVA_NB)* | ❌ |
| Báo cáo thuế | ✅ | ✅ *(soi tờ khai trắng)* | ❌ | ❌ | ❌ |
| Đơn vị khách hàng (QT) | ✅ | ✅ | ✅ *(xem toàn cảnh để quản lý)* | ✅ | ✅ |
| Mở năm làm việc | ✅ | ✅ | ❌ | ✅ | ✅ *(giữ quyết định 05/08: MDN_NB tự mở năm được)* |

- BE cung cấp filter chuẩn (vd tham số `?scope=lay_hd | bao_cao_thue | quan_tri | mo_nam` trên endpoint danh sách đơn vị) — **quy tắc lọc nằm một chỗ ở BE**, FE chỉ gọi đúng scope. Không để mỗi màn hình FE tự filter mảng.
- Màn hình mới sau này **bắt buộc** thêm một dòng vào bảng 5.3 qua PR trước khi code.

---

## 6. Quy ước dẫn chiếu

- Danh sách đơn vị: **scroll ~10 dòng, không phân trang** — theo luật nhà CLAUDE.md (nâng từ quyết định 08/08 ở form Lấy HĐ thành quy ước toàn cục). Màn nào đang phân trang (ảnh 10/08: Lấy HĐ có nút lật trang số 1) → sửa về scroll.

---

## 7. Phân công & ranh giới dev1 / dev2

| Việc | Ai làm |
|---|---|
| Bảng menu × tenant_type trong AppShell (mục 4), gồm cả nhánh ẩn/hiện cho `noibo` | **dev1** (AppShell thuộc instance thuế) |
| Nội dung menu nghiệp vụ NB (những màn nào, nhãn gì) | **dev2** — nhưng **chỉ qua** SPEC-KT2000-NB; nếu cần đổi cấu trúc AppShell thì mở Issue cho dev1, **không tự sửa AppShell** |
| Cột TrangThai + migration + endpoint scope (mục 5) | **dev1** (bảng Master) |
| Mã màu dùng chung (mục 3) | **dev1** tạo file; dev2 import dùng lại |

> Điểm giao AppShell chính là loại chỗ đã từng va nhau (vụ LinkedTenantCode làm 2 lần). Luật: **AppShell một chủ = dev1**; dev2 muốn gì ở vỏ thì đi đường Issue.

---

## 8. Câu hỏi mở

| # | Câu hỏi | Đề xuất của Claude | Quyết định |
|---|---|---|---|
| 8.1 | Chi nhánh (vd HA_THAI_CN1, không có MST riêng) có trạng thái/màu riêng không, hay theo đơn vị mẹ? | Theo kỳ khai của chính nó như hiện tại, không thêm khái niệm mới ở v0.1 | ✅ Chốt 10/08: theo đề xuất |
| 8.2 | `NGUNG_HAN` có tự động set `IsActive = 0` không? | Không tự động — 2 công tắc độc lập, admin tự tắt đăng nhập khi cần | ✅ Chốt 10/08: theo đề xuất |
| 8.3 | User MDN_NB gõ thẳng URL màn bị ẩn (vd http://localhost:5173/app/phieu-thu): xử lý thế nào? | **Chặn, không cho vào** — 2 lớp: (a) FE route guard đọc `tenant_type`, gõ URL màn bị ẩn → tự đưa về trang chính /app + thông báo nhẹ "Chức năng không dùng cho đơn vị này" (không hiện màn hình lỗi thô); (b) kể cả lách qua FE, API của màn đó vẫn trả 403 theo gate BE → không có dữ liệu. Lớp (b) mới là an toàn thật, lớp (a) là lịch sự với người dùng. | ✅ Chốt 10/08: chặn theo 2 lớp như đề xuất |
| 8.4 | Màn "Phí dịch vụ" tương lai: spec riêng hay mục mới trong spec này? | Spec riêng (có nghiệp vụ tính phí), spec này chỉ giữ chỗ trên menu | ✅ Chốt 10/08: spec riêng, làm sau — hiện phí còn đơn giản (ít nợ cũ, cập nhật kỳ này sang kỳ sau). Ghi nhận trước 2 yêu cầu cho spec đó: (a) **quyền truy cập hạn chế** — có thể ẩn với đa số user, chỉ số ít quản lý / cổ đông làm việc trong đơn vị được xem; (b) tương lai có chi phí tính theo giờ / thu tiền theo giờ. |

---

## 9. Checklist nghiệm thu (ngôn ngữ người dùng cuối)

1. ⬜ Đăng nhập MDN_NB: menu chỉ còn "Lấy HĐ GTGT đầu Vào", "Lấy HĐ GTGT đầu Ra", "Báo cáo thuế" + nhóm QUẢN TRỊ. Không thấy Phiếu thu/chi, Báo cáo tồn kho/công nợ.
2. ⬜ Đăng nhập một đơn vị khách bình thường (vd TUAN_NGA): menu và nhãn **y nguyên như cũ**, không đổi gì.
3. ⬜ MDN_NB gõ thẳng địa chỉ /app/phieu-thu trên trình duyệt → không vào được (theo quyết định 8.3).
4. ⬜ Màn Đơn vị khách hàng: đơn vị khai tháng chữ đỏ, khai quý chữ xanh, *_NB chữ nâu; có chú giải màu.
5. ⬜ Màn Mở năm làm việc: mã màu y hệt màn Đơn vị khách hàng (cùng sắc độ).
6. ⬜ Màn Lấy HĐ: **không còn** TUAN_NGA_NB, USA_MEVA_NB trong danh sách.
7. ⬜ Đặt một đơn vị thành TAM_NGUNG → biến mất khỏi màn Lấy HĐ nhưng **vẫn có mặt** ở Báo cáo thuế (vì vẫn phải soi tờ khai trắng).
8. ⬜ Đổi TrangThai của một đơn vị → Nhật ký hệ thống (TenantChangeLog) có dòng ghi lại ai đổi, đổi lúc nào, từ giá trị nào sang giá trị nào.
9. ⬜ Mọi danh sách đơn vị cuộn trong khung ~10 dòng, không còn nút lật trang.
10. ⬜ Ba mã màu chỉ khai báo ở một file dùng chung (reviewer soi code: không có mã hex màu đơn vị rải trong component).

---

## 10. Lịch sử phiên bản

| Bản | Ngày | Nội dung |
|---|---|---|
| v0.1 | 10/08/2026 | Bản nháp đầu từ 6 mục nghiệm thu 10/08 + ảnh màn hình MDN_NB. Mục 2 (pass TCT) chuyển SPEC-QUAN-TRI v1.1; mục 5 (scroll) chuyển CLAUDE.md. |
| v0.2 | 10/08/2026 | Chốt 8.1, 8.2, 8.3 (chặn 2 lớp khi gõ thẳng URL). Đổi tên trạng thái `TAM_NGUNG_KE_KHAI` → `TAM_NGUNG` sau góp ý Leader (tên cũ đọc nhầm thành "ngừng kê khai" — ngược nghĩa); bổ sung ghi chú "đặt tên theo trạng thái, không theo hành vi". |
