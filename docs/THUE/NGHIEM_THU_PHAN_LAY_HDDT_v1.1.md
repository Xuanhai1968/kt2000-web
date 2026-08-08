# NGHIỆM THU — PHẦN LẤY HÓA ĐƠN ĐIỆN TỬ (FRM_LAY_HDDT)

- **Phiên bản:** V1.1 (cấu trúc lại từ V1 — **đã chốt Q1–Q3 ngày 08/08/2026, không còn câu hỏi mở**)
- **Người viết:** Leader (Hiu) — cấu trúc lại cùng Claude, 08/08/2026
- **Người nhận:** dev1 (mảng Thuế)
- **Spec gốc liên quan:** `docs/THUE/SPEC-FRM-LAY-HDDT.md` v2 — **spec gốc giữ nguyên, không sửa**. File này là biên bản nghiệm thu vòng 1; mục nào sau khi làm xong trở thành hành vi chính thức sẽ gộp ngược vào spec bằng PR "spec v3".

---

## 0. Mục tiêu & phạm vi nghiệm thu

Chạy thử **từ đầu đến cuối** với đơn vị mới hoàn toàn:

- Đơn vị: **XUAN_QUYNH** — tạo mới đơn vị, tạo năm **2026**
- Nhập mật khẩu tra cứu (pass 78), lấy HĐ từ TCT **tháng 1 → tháng 6/2026**, nạp vào HOA_DON / HOA_DON_LINE

| Bước | Nội dung | Trạng thái nghiệm thu |
|---|---|---|
| Bước 1 | Tạo đơn vị XUAN_QUYNH, tạo năm 2026, thao tác trên form Lấy HĐĐT | ✅ Đã chạy — phát sinh các mục NT bên dưới |
| Bước 2 | Lấy HĐ từ TCT, nạp vào DB | ⏳ **CHƯA nghiệm thu** — sẽ bổ sung NT vòng 2 |

> **Lưu ý cho dev1:** danh sách dưới đây KHÔNG có nghĩa là làm sai spec. Phần lớn là **yêu cầu mới phát sinh khi chạy thật** — đã gắn nhãn rõ từng mục.

---

## 1. Quy ước nhãn & ưu tiên

**Nhãn phân loại:**
- `[LỖI]` — sai so với mong đợi / spec, phải sửa
- `[LUỒNG]` — thay đổi luồng nghiệp vụ, đọc kỹ mô tả hành vi
- `[YÊU CẦU MỚI]` — spec gốc không có, phát sinh sau khi chạy thật
- `[UI]` — chỉnh bố cục / hiển thị, không đổi nghiệp vụ

**Ưu tiên:**
- `P1` — phải xong thì vòng nghiệm thu này mới ĐẠT
- `P2` — làm sau được, không chặn nghiệm thu

**Cách làm việc:** mỗi PR ghi rõ `Fixes NT-xx` trong mô tả. Trao đổi qua Issue tổng "Nghiệm thu vòng 1 FRM_LAY_HDDT" (task-list checkbox từng mục).

---

## 2. Danh sách mục nghiệm thu

### NT-01 `[LỖI]` `P1` — Font tiếng Việt cột "Diễn biến"

- **Hiện tại:** khi bấm "Lấy HĐ Điện tử", chữ tiếng Việt trong cột "Diễn biến" hiển thị lỗi font.
- **Mong muốn:** hiển thị tiếng Việt Unicode chuẩn.
- **Tiêu chí đạt:** chạy lấy HĐ thật, mọi dòng tiến trình trong "Diễn biến" đọc được tiếng Việt có dấu.

---

### NT-02 `[LỖI]` `P1` — Form Lấy HĐĐT không được hiển thị đơn vị NB

- **Hiện tại:** danh sách đơn vị trên form "Lấy hóa đơn điện tử" hiển thị cả đơn vị NB.
- **Mong muốn:** form Lấy HĐĐT **chỉ hiển thị đơn vị khách hàng (mảng thuế)**. Danh sách ĐẦY ĐỦ mọi đơn vị chỉ xuất hiện ở màn hình "Đơn vị khách hàng".
- **Quy tắc chung (đề xuất ghi thành BR):** các màn hình nghiệp vụ THUẾ về sau (ví dụ "Báo cáo thuế") cũng áp cùng bộ lọc này. Lọc theo cột phân loại tenant trong bảng `Tenants` (Master) — **một chỗ lọc dùng chung**, không hard-code danh sách từng form.
- **Tiêu chí đạt:** mở form Lấy HĐĐT không thấy đơn vị NB nào; màn hình "Đơn vị khách hàng" vẫn thấy đủ.

---

### NT-03 `[LUỒNG]` `P1` — Hợp nhất nút "Lấy HĐ Điện tử" và "Nạp vào Database"

- **Hiện tại:** 2 nút, 2 bước tách rời (lấy về xong phải bấm nạp).
- **Mong muốn:** 1 nút duy nhất — lấy HĐ xong **tự động nạp vào DB** trong cùng một tiến trình, cột "Diễn biến" hiển thị liền mạch cả 2 pha (đang lấy → đang nạp → kết quả).
- **Hành vi với file lỗi:** file không nạp được (lệch Σ, lệch năm...) **vẫn nằm lại raw như hiện nay** — hiển thị số lượng ở cột V/R (xem NT-04), xem chi tiết và chạy tay qua form riêng (xem NT-05). Gộp nút KHÔNG thay đổi cơ chế khay file lỗi.
- **ĐÃ CHỐT (Q1):** **bỏ hẳn** tùy chọn "chỉ lấy về, chưa nạp" — đã lấy về là nạp luôn, không có chế độ trung gian. Ca đặc biệt xử lý qua đường chạy tay sẵn có.
- **Tiêu chí đạt:** bấm 1 nút → HĐ hợp lệ vào DB, HĐ lỗi đếm đúng ở cột V/R, không cần thao tác thứ hai.

---

### NT-04 `[YÊU CẦU MỚI]` `P1` — Cột "Còn ở raw" tách thành 2 cột V và R, hiển thị bằng SỐ

- **Hiện tại:** một cột chung, khi không còn file hiển thị chữ "Đã vào hết".
- **Mong muốn:**
  - Tách thành 2 cột riêng: **V** (HĐ đầu vào lỗi còn ở raw) và **R** (HĐ đầu ra lỗi còn ở raw) — đây là số HĐ không vào được DB, chờ xử lý tay.
  - Luôn hiển thị **con số**: có lỗi hiện số lượng, không có hiện **0**. Bỏ hẳn chữ "Đã vào hết".
- **Tiêu chí đạt:** sau một lần lấy + nạp có file lỗi, cột V/R hiện đúng số đếm khớp số file trong `raw\VAO` / `raw\RA`; đơn vị sạch hiện 0/0.

---

### NT-05 `[YÊU CẦU MỚI]` `P2` — Bỏ cột "Lệch tổng Line và Master" trên lưới; xem chi tiết lệch bằng form riêng

- **Hiện tại:** lưới chính có cột "Lệch tổng Line và Master".
- **Mong muốn:**
  - **Bỏ cột này** khỏi lưới chính (lưới chỉ cần biết SỐ LƯỢNG lỗi — NT-04).
  - Thêm **form riêng** (mở từ cột V/R hoặc nút xem chi tiết): liệt kê từng file/HĐ còn ở raw, hiển thị **lệch bao nhiêu tiền** (Σ line so với master), để Leader/kế toán quyết xử lý tay.
- **Tiêu chí đạt:** với HĐ lệch Σ thật (đã có ca Viettel/EVN), form riêng hiện đúng MA_HD + số tiền lệch.

---

### NT-06 `[YÊU CẦU MỚI]` `P2` — Ghi nhớ trạng thái checkbox "Cả Vào và Ra"

- **Hiện tại:** thoát form là mất lựa chọn.
- **Mong muốn:** user chọn "Cả Vào và Ra" thì **ghi nhớ qua các lần mở form**, cho đến khi chính user bỏ chọn.
- **ĐÃ CHỐT (Q2):** ghi nhớ **theo MÁY**, không theo user — lưu bằng **localStorage của trình duyệt**. Ai đăng nhập trên máy đó cũng đọc lên cùng trạng thái (đúng hành vi VFP cũ: trạng thái nằm trên máy, không phụ thuộc người đăng nhập). Không gọi DB, không tạo bảng.
- **Lưu ý chấp nhận được:** localStorage gắn với trình duyệt trên máy đó — nếu user xóa dữ liệu duyệt web hoặc đổi sang trình duyệt khác thì trạng thái về mặc định. Với mô hình mỗi người một máy của mảng thuế, chấp nhận.
- **Tiêu chí đạt:** chọn checkbox → đóng form, đăng xuất, user KHÁC đăng nhập cùng máy → mở form vẫn được chọn; bỏ chọn → mở lại vẫn bỏ.

---

### NT-07 `[YÊU CẦU MỚI]` `P2` — Hiển thị lịch sử lấy HĐ ngay khi mở form

- **Hiện tại:** mở form không thấy thông tin các lần lấy trước.
- **Mong muốn:** vùng trạng thái hiển thị sẵn lịch sử các lần lấy **trước thời điểm hiện tại**, mới nhất trên cùng, cũ dần xuống dưới. Mỗi dòng có thêm:
  - **Cột ngày** lấy
  - **Cột account** (user nào chạy)
  - Nội dung: đơn vị nào, kết quả/thiếu bao nhiêu — ví dụ thực tế: *"08/08 · admin · Lấy XUAN_QUYNH, HOA_SANG — Vào MTT thiếu: HOA_SANG 13/16, XUAN_QUYNH 2/7"*
- **Gợi ý kỹ thuật:** dữ liệu lấy từ các bảng theo dõi đã thiết kế trong spec v2 (`DOWNLOAD_BATCH`/`DOWNLOAD_JOB` + `ActivityLog`) — **không tạo bảng mới**.
- **Tiêu chí đạt:** mở form thấy ngay các lần chạy gần nhất đúng ngày, đúng account, đúng số thiếu; không phải bấm gì thêm.

---

### NT-08 `[UI]` `P2` — Bố cục vùng điều khiển: dồn hết lên trên

- **Mong muốn:**
  - Cặp **"Từ tháng – Đến tháng"** chuyển lên **trên, góc phải**.
  - Tất cả các dòng điều khiển dạng "Từ tháng – Đến tháng ..." hiện rải rác đưa hết lên vùng trên của form.
  - Co gọn kích thước các nút, textbox trong vùng này.
- **Tiêu chí đạt:** toàn bộ điều khiển nằm ở khối trên; vùng dưới dành trọn cho danh sách đơn vị + trạng thái.

---

### NT-09 `[UI]` `P2` — Thanh nút đánh dấu: gộp dòng, co chiều cao, bỏ text thừa

- **Mong muốn:**
  - Các nút "Đánh dấu tất cả đơn vị khai Tháng", "Đánh dấu tất cả đơn vị khai Quý", "Bỏ đánh dấu" đưa lên **cùng dòng** với nút "Lấy hóa đơn điện tử".
  - **Co ngắn chiều cao** thanh bar này.
  - **Bỏ** dòng text giải thích "Đơn vị chữ đỏ là khai THÁNG" (giữ quy ước màu chữ đỏ, chỉ bỏ chữ giải thích).
- **Tiêu chí đạt:** một dòng thanh công cụ gọn chứa đủ 4 nút; không còn text giải thích.

---

### NT-10 `[UI]` `P2` — Danh sách đơn vị: co dòng, scroll cố định 10 dòng, bỏ phân trang

- **Mong muốn:**
  - **Co hẹp chiều cao tất cả các dòng** trong danh sách.
  - Danh sách hiển thị **10 đơn vị**, phần còn lại cuộn bằng **scroll**.
  - **Bỏ** kiểu chuyển trang (pagination) hiện nay.
- **Tiêu chí đạt:** ~20 đơn vị nhìn thấy 10 dòng + scroll mượt; không còn nút chuyển trang.

---

### NT-11 `[UI]` `P2` — Màu nền theo hướng hóa đơn

- **Mong muốn:** trong form Lấy HĐĐT:
  - Chọn **"Hóa đơn GTGT Đầu vào"** → nền **đỏ nhạt**
  - Chọn **"Hóa đơn GTGT Đầu ra"** → nền **xanh blue nhạt**
- (Khớp quy ước V = đỏ, R = xanh dùng xuyên suốt hệ thống.)
- **ĐÃ CHỐT (Q3):** vùng áp màu = **tất cả vùng tiêu đề của form + header lưới**, KHÔNG nhuộm toàn form. Độ đậm: **rất nhạt** — đỏ chỉ ở mức hồng hồng, xanh chỉ đủ nhận ra là màu xanh; mục đích là bật form user ý thức ngay đang ở đầu vào hay đầu ra, không phải trang trí.
- **Định hướng mở rộng (chưa giao, sẽ ra NT riêng khi Leader mô tả cụ thể):** cùng nguyên tắc "nhìn màu biết ngữ cảnh" sẽ áp cho việc nhận biết đang đăng nhập ở đơn vị tenant thường hay đơn vị NB (MDN_NB).
- **Tiêu chí đạt:** đổi lựa chọn Đầu vào/Đầu ra là toàn bộ vùng tiêu đề + header lưới đổi màu tương ứng ngay; màu đủ nhạt để chữ vẫn dễ đọc, nhìn thoáng qua vẫn phân biệt được hồng/xanh.

---

## 3. Các quyết định đã chốt (Leader, 08/08/2026)

| # | Mục | Quyết định |
|---|---|---|
| Q1 | NT-03 | **Bỏ hẳn** tùy chọn "chỉ lấy chưa nạp" — lấy về là nạp luôn. Ca đặc biệt đi đường chạy tay. |
| Q2 | NT-06 | Ghi nhớ **theo máy** (localStorage trình duyệt), như hành vi VFP cũ — ai đăng nhập máy nào đọc trạng thái máy đó. |
| Q3 | NT-11 | Màu áp cho **tất cả vùng tiêu đề + header lưới**, không nhuộm toàn form. Độ đậm rất nhạt (hồng hồng / xanh chỉ đủ nhận ra). |

> Dev1 làm theo các quyết định này, không cần hỏi lại. Nội dung chi tiết đã gộp thẳng vào từng mục NT tương ứng.

---

## 4. Tổng hợp & quy trình

| Mã | Nhãn | Ưu tiên | Tóm tắt |
|---|---|---|---|
| NT-01 | LỖI | P1 | Font tiếng Việt cột Diễn biến |
| NT-02 | LỖI | P1 | Lọc đơn vị NB khỏi form Lấy HĐĐT (+ quy tắc chung cho màn hình thuế) |
| NT-03 | LUỒNG | P1 | Gộp nút Lấy + Nạp thành 1, tự nạp sau khi lấy |
| NT-04 | YÊU CẦU MỚI | P1 | Cột raw tách V/R, hiển thị số, 0 thay chữ |
| NT-05 | YÊU CẦU MỚI | P2 | Bỏ cột lệch Σ trên lưới; form riêng xem chi tiết lệch |
| NT-06 | YÊU CẦU MỚI | P2 | Ghi nhớ checkbox "Cả Vào và Ra" theo máy (localStorage) |
| NT-07 | YÊU CẦU MỚI | P2 | Lịch sử lấy HĐ hiện khi mở form (ngày + account + số thiếu) |
| NT-08 | UI | P2 | Dồn điều khiển lên trên, Từ/Đến tháng góc phải |
| NT-09 | UI | P2 | Gộp dòng nút đánh dấu, co bar, bỏ text giải thích |
| NT-10 | UI | P2 | Co dòng danh sách, scroll 10 dòng, bỏ phân trang |
| NT-11 | UI | P2 | Nền đỏ nhạt/xanh nhạt theo Đầu vào/Đầu ra |

**Quy trình thực hiện:**
1. File này commit vào `docs/THUE/` (biên bản lưu vết).
2. Mở Issue tổng **"Nghiệm thu vòng 1 FRM_LAY_HDDT"** với task-list checkbox 11 mục.
3. Dev1 làm theo nhánh `fix/*`, mỗi PR ghi `Fixes NT-xx`, đi đúng vòng 5 nhịp.
4. **Điều kiện ĐẠT vòng 1:** toàn bộ mục P1 xong + Leader chạy lại kịch bản XUAN_QUYNH xác nhận.
5. Nghiệm thu **Bước 2** (lấy + nạp thật T1–T6/2026) sẽ ra biên bản NT vòng 2 — dự kiến sẽ dày hơn vòng này.
6. Sau khi các mục thành hành vi chính thức → PR cập nhật spec gốc lên v3 (dev thấy diff, không ai bất ngờ).
