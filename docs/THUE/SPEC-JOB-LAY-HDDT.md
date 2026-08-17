# SPEC-JOB-LAY-HDDT — Pipeline "Lấy hóa đơn điện tử" (tải TCT → nạp database)

Phiên bản: v0.1 (draft — phần §4 chờ dev1 xác nhận as-built)
Vị trí đề nghị: docs/THUE/SPEC-JOB-LAY-HDDT.md
Quan hệ tài liệu: SPEC-FRM-LAY-HDDT = giao diện console (bộ lọc, cột đếm, nút). Tài liệu này = **hành vi pipeline** phía sau nút "Lấy hóa đơn điện tử". SPEC-DOC-HD-TAY = xử lý tay file còn lại sau pipeline.

---

## 0. Mục đích

Ghi lại trên giấy chức năng đang chạy (as-built) + chuẩn hóa các luật vận hành để: (a) dev sửa không phá hành vi ngầm, (b) chuẩn bị sẵn đề bài cho v2 chạy song song. Đây là bài học rút từ VFP: chức năng phức tạp không hồ sơ → sau này khảo cổ.

## 1. Thuật ngữ

- **Job** = 1 cặp *(đơn vị, tháng)*, gồm tối đa 2 **pha** theo hướng: VAO và RA (theo checkbox "Cả vào và ra").
- **Pipeline** = danh sách job sinh từ lựa chọn trên console: các đơn vị được tick × dải Từ tháng→Đến tháng.
- **Khay lỗi** = raw\VAO, raw\RA của job folder (file trượt importer nằm lại — theo BR importer).

## 2. Đầu vào & điều kiện chạy

1. Danh sách đơn vị tick + Từ/Đến tháng + checkbox hướng → sinh danh sách job.
2. Chế độ trùng: checkbox **"Gặp HĐ trùng: XÓA hẳn rồi ghi mới"** → truyền xuống importer (đè trắng vs cập-nhật-có-chừa).
3. **BR-JOB-01 — Mật khẩu cổng TCT:** mỗi đơn vị phải khai mật khẩu cổng trước. Đơn vị chưa khai → job của đơn vị đó **không chạy**, console cảnh báo (hành vi hiện có với TUAN_NGA). Mật khẩu lưu phía server, [Q4.7 — cách lưu/mã hóa].

## 3. Vòng đời job — as-built v1 (theo chú thích console + các phiên trước)

1. Pipeline chạy **tuần tự từng job** (từng đơn vị-tháng), không song song.
2. Trong 1 job: gọi Python/Selenium đăng nhập cổng TCT bằng mật khẩu đơn vị → tải XML (+ bản thể hiện HTML) về job folder.
3. Tải xong job → **importer chạy tự động** trên job folder đó: file đạt → nạp DB, move sang cây SCAN_DOC; file trượt → nằm lại raw\, đếm vào cột VÀO/RA.
4. Xong job → chuyển job kế tiếp; hết danh sách → pipeline kết thúc, console cập nhật số liệu.

Sơ đồ:

```
[Console] → sinh job list → (job 1) fetch TCT → raw files → import → move/đếm
                          → (job 2) …tuần tự…
                          → xong: cập nhật cột VÀO/RA + thông báo
```

## 4. Bảng câu hỏi as-built — dev1 điền, trả lời xong nâng spec lên v0.2

| # | Câu hỏi | Trả lời của dev1 |
|---|---|---|
| Q4.1 | **Log ra đâu?** Mỗi job có ghi log không (file? bảng? console F12?), nội dung gồm gì? | |
| Q4.2 | **Lỗi giữa chừng 1 job** (sai mật khẩu, cổng TCT treo, mạng đứt, Selenium chết): pipeline DỪNG cả chuỗi hay BỎ QUA chạy job sau? Người dùng thấy gì? | |
| Q4.3 | Trong 1 job, thứ tự pha VAO/RA? Pha VAO lỗi thì pha RA có chạy không? | |
| Q4.4 | Importer chạy **theo từng file ngay khi tải về** hay **một lần sau khi tải xong cả job**? | |
| Q4.5 | **Chống chạy chồng:** đang chạy mà bấm nút lần nữa (hoặc người dùng khác cùng tenant bấm) thì sao? Có khóa không? | |
| Q4.6 | Có **retry** khi tải lỗi tạm thời không? Mấy lần? Timeout mỗi job bao lâu? | |
| Q4.7 | Mật khẩu cổng TCT lưu ở đâu, dạng gì (plain/mã hóa)? Ai xem được? | |
| Q4.8 | Đang chạy, console hiển thị **tiến độ** gì (đang job nào, mấy/mấy)? Có nút Hủy không? | |
| Q4.9 | File tải về **trùng file đã có** trong job folder (chạy lại lần 2): ghi đè, bỏ qua, hay tải lại hết? | |
| Q4.10 | Cổng TCT có captcha / giới hạn tần suất không, hiện xử lý sao? | |

## 5. BR đề xuất chuẩn hóa (áp cho v1 nếu chưa có — đây là phần "tránh vết xe VFP")

- **BR-JOB-02 — Job độc lập:** lỗi ở job này KHÔNG được giết cả pipeline; ghi lỗi + chạy tiếp job sau. Cuối pipeline có bảng tổng kết: job nào xong (tải X HĐ, nạp Y, còn lại Z), job nào lỗi vì sao.
- **BR-JOB-03 — Dấu vết:** mỗi job ghi ActivityLog lúc bắt đầu và kết thúc (action `LAY_HDDT`, kèm đơn vị, tháng, kết quả đếm, thời lượng). Đây là nguồn để sau này đo "cổng TCT dạo này chậm" thay vì cảm tính.
- **BR-JOB-04 — Khóa chống chồng:** một tenant chỉ một pipeline chạy tại một thời điểm; nút đổi thành trạng thái "Đang chạy…" + Hủy. Chạy chồng lên cùng job folder là nguồn lỗi file khó tái hiện nhất.
- **BR-JOB-05 — Idempotent:** chạy lại cùng job phải an toàn (nhờ importer upsert theo MA_HD + MoveArtifacts) — đây là phao cứu sinh: gặp sự cố cứ chạy lại, không cần dọn tay.

## 6. v2 — Chạy song song (đề bài để sẵn, CHƯA làm)

Khi nâng cấp, phải trả lời trước các câu này:

- 6.1 Cổng TCT cho phép mấy phiên đăng nhập đồng thời *trên cùng 1 MST*? (nghi ngờ: chỉ 1 → song song chỉ khả thi GIỮA các đơn vị khác nhau, không trong 1 đơn vị).
- 6.2 Máy chạy chịu được mấy Chrome/Selenium instance (RAM, CPU)? → tham số "độ rộng" N job đồng thời.
- 6.3 Mô hình hàng đợi: bảng JOB_QUEUE trong DB (job, trạng thái chờ/chạy/xong/lỗi, worker nhận) — để sau này thêm máy chạy thứ hai chỉ là thêm worker.
- 6.4 Hai job cùng đơn vị khác tháng có được chạy đồng thời không (đụng phiên đăng nhập — liên quan 6.1)?
- 6.5 UI: nhiều thanh tiến độ theo job; cột VÀO/RA cập nhật dần theo từng job xong.
- 6.6 Importer có chịu được 2 job ghi DB đồng thời không (khóa bảng, transaction) — với SQL Server thì per-invoice transaction hiện tại về nguyên tắc là ổn, nhưng phải test thật.

## 7. Checklist nghiệm thu (cho v0.2, sau khi §4 được điền)

1. Chạy 2 đơn vị × 2 tháng → đúng 4 job tuần tự, tổng kết cuối khớp từng job.
2. Cố tình sai mật khẩu 1 đơn vị → job đơn vị đó báo lỗi, các job còn lại vẫn chạy (BR-JOB-02).
3. Rút mạng giữa chừng 1 job → job lỗi có log, chạy lại pipeline lần 2 ra kết quả đúng, không nhân đôi dữ liệu (BR-JOB-05).
4. Bấm nút lần 2 khi đang chạy → bị chặn (BR-JOB-04).
5. ActivityLog có đủ cặp bắt đầu/kết thúc cho từng job (BR-JOB-03).
6. Đơn vị chưa khai mật khẩu → không sinh job, cảnh báo đúng như hiện tại (BR-JOB-01).
