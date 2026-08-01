# SPEC-WP03 — Lấy hóa đơn điện tử từ TCT (tích hợp TRA_CUU_HDDT)

| | |
|---|---|
| **Trạng thái** | 🟡 CHỜ LEADER DUYỆT + trả lời 4 câu hỏi mở |
| **Nguyên liệu** | TRA_CUU_HDDT_1_3.py (2.318 dòng, CLI sẵn, status/events JSON, captcha tự xử ≤4 lần) |
| **Thay thế bên VFP** | Quy trình MDN_NB: đi từng đơn vị → lấy 1 tháng → đưa vào HOA_DON → tháng/đơn vị kế |

## 1. Mục tiêu & phạm vi

Từ console MDN_NB: tick đơn vị → chọn khoảng tháng + hướng (ra/vào) → bấm chạy →
hệ thống tải HĐĐT và đổ vào HOA_DON/HOA_DON_LINE của database `<MÃ>_<NĂM>`,
hiện tiến độ từng đơn vị. Giữ nguyên Python làm "công nhân"; C# làm "đốc công".

**Ngoài phạm vi:** làm kho (WP-04), THU_CHI từ ngân hàng, sửa nội dung Python
(chỉ cho phép vá nhỏ nếu bắt buộc, có ghi chú).

## 2. Kiến trúc — 6 mắt xích

```
Console (React) ──► API enqueue ──► bảng DownloadJobs (Master)
                                        │  nhặt tuần tự
                                War ker (BackgroundService C#)
                                        │  Process.Start
                          TRA_CUU_HDDT_1_3.py (server 192.168.0.106)
                            │ status.json / events.jsonl        │ kết quả
                Console poll tiến độ ◄──┘            Importer C# ──► HOA_DON/_LINE
```

- **(1) TenantCredentials** (Master): TenantId, CredType='hoadondientu',
  LoginName=MST, PasswordEncrypted (Data Protection API — hai chiều), UpdatedAt.
  Màn hình Đơn vị khách hàng thêm nút "TK Hóa đơn điện tử": chỉ hiện trạng thái
  đã-có/chưa-có; đổi = nhập đè; không bao giờ hiển thị lại password.
- **(2) DownloadJobs** (Master): Id, TenantId, Nam, ThangBd, ThangKt, Loai
  (ra/vao/all), Status (queued→running→done/error), Message, SoHdTai,
  CreatedBy/At, StartedAt, FinishedAt, JobFolder.
- **(3) Worker**: BackgroundService trong KT2000.Api, nhặt job tuần tự (1 Chrome
  một lúc — đúng nhịp VFP, tránh TCT nghi ngờ). Giải mã credential → chạy:
  `python TRA_CUU_HDDT_1_3.py --run --mst .. --password .. --thang_bd .. --thang_kt ..
  --nam .. --loai .. --ma_donvi .. --job_id .. --save_dir D:\HDDT_JOBS
  --status <job>\status.json --events <job>\events.jsonl --stagedir <job>\stage --xml_map <đường dẫn>`
  (KHÔNG dùng --to_dbf — DBF là quá khứ).
- **(4) Tiến độ**: API đọc status.json của job đang chạy trả cho console
  (poll 3–5 giây) — tận dụng đúng cái móc "theo dõi qua API từ xa" đã viết sẵn.
- **(5) Importer**: khi Python kết thúc tháng/job, đọc bộ kết quả (Excel tổng +
  XML) → ghi HOA_DON/HOA_DON_LINE qua TenantDbResolver. **Idempotent**: khóa
  ma_hd — đã có thì UPDATE trạng thái, không nhân đôi; chạy lại job không phá gì.
  Song song hóa v1 theo kiểu **băng chuyền**: worker tải tháng N+1 trong lúc
  importer nạp tháng N (stream từng XML là tối ưu hóa v1.1, ghi nhận chưa làm).
  Không còn bước UNI→TCVN.
- **(6) Console 2-trong-1** (trang Hóa đơn GTGT đầu vào, ruột internal) nâng cấp:
  bảng tick đơn vị (đã có) + hàng điều khiển: Combobox **Từ tháng / Đến tháng**,
  năm; Checkbox **Đầu ra / Đầu vào** (map --loai: cả hai=all); Checkbox **Chỉ lấy
  Excel tổng hợp** (xem câu hỏi mở 3); nút chạy; bảng tiến độ per-đơn-vị
  (queued/running %/done + số HĐ/error) theo khuôn màu của Mở năm.

## 3. Điều kiện hạ tầng — QUYẾT ĐỊNH CẦN DUYỆT

Python + Chrome chạy tại **server 192.168.0.106** (Leader đã chọn). Hệ quả bắt
buộc: **backend C# phải chạy trên server** (Process.Start chỉ chạy được tiến
trình cùng máy). → Sinh gói con **WP-03a — Triển khai backend lên server**:
`dotnet publish` + chạy như Windows Service; frontend build tĩnh; máy Leader/dev
vẫn giữ bản dev riêng. (Đằng nào cũng phải làm trước khi kế toán viên dùng thật —
làm sớm ở đây.) Cài trên server: Python 3.x + pip packages theo file .py,
Google Chrome, thư mục `D:\HDDT_JOBS`, file `XML_MAP.xlsx`.

## 4. An toàn

- Password cổng TCT: mã hóa hai chiều trong DB; **vá nhỏ đề xuất cho .py**: nhận
  password qua biến môi trường thay vì tham số dòng lệnh (tham số lộ trong danh
  sách tiến trình Windows) — 5 dòng sửa, chờ Leader gật.
- Ngưỡng captcha ≤4 giữ nguyên (TCT khóa ở 5). Job lỗi đăng nhập → status=error
  kèm message rõ, KHÔNG tự retry đăng nhập vô hạn.
- Chỉ phiên internal thấy/điều khiển toàn bộ WP-03 (claim gate như cũ).

## 5. Câu hỏi mở (trả lời xong mới code)

1. **Bộ kết quả cuối của một job** nằm thế nào trong thư mục job: tên file Excel
   tổng (sheet nào là master, sheet nào là line?), thư mục XML đặt tên ra sao —
   Leader gửi ảnh chụp 1 thư mục kết quả thật của VFP là đủ.
2. **XML_MAP.xlsx** — file này là gì, lấy ở đâu, có theo đơn vị không?
3. Checkbox "Chỉ lấy Excel tổng hợp": CLI hiện chưa có cờ này — xác nhận nhu cầu
   (nếu cần: vá .py thêm --skip_xml, ~vài dòng).
4. Leader gửi **ảnh giao diện màn lấy HĐ của VFP** để đối chiếu layout console.

## 6. Trình tự làm (sau khi duyệt)

WP-03a triển khai backend lên server → mắt xích 1 (TenantCredentials + UI) →
2+3 (DownloadJobs + Worker, chạy được 1 đơn vị 1 tháng end-to-end) → 4 (tiến
độ) → 5 (Importer idempotent) → 6 (đủ điều khiển) → nghiệm thu: TUAN_NGA 2025,
tải trọn 12 tháng, số HĐ trong SQL khớp số trên cổng TCT.
