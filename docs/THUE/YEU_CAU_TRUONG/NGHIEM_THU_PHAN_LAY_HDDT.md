# SPEC — NGHIỆM THU PHẦN LẤY HĐ ĐT 
- Phiên bản V1 
- Người viết: Leader (Hiu) — cấu trúc lại cùng Claude 07/08/2026

## 0. Mục tiêu & phạm vi

Chạy thử từ đầu Thêm đơn vị mới, tạo năm mới, nhập pass 78 chạy lấy HĐ của đơn vị lấy HĐ từ TCT từ tháng 1 đến tháng 6 năm 2026 Tên đơn vị là XUAN_QUYNH

- **Bước 1**: Tạo đơn vị XUAN_QUYNH, tạo năm 2026.
- **Bước 2**: Lấy HĐ từ TCT, nạp vào HOA_DON / HOA_DON_LINE.


## 1. Tiến hành bước 1 và ghi nhận những cái cần sửa
- Trong giao diện "Lấy hóa đơn điện tử" không có các đơn vị NB , danh sách tất cả các đơn vị chỉ xuất hiện ở "Đơn vị khách hàng", một số giao diện về sau này như giao diện "Báo cáo thuế" cũng sẽ không có.

- Trong giao diện "Lấy hóa đơn điện tử" khi user chọn "Cả Vào và Ra" thì ghi nhớ luôn cho đến khi user bỏ chọn (ghi nhớ trạng thái checkbox khi thoát)

- Trong giao diện "Lấy hóa đơn điện tử" cột "Còn ở raw" thêm cột V và R riêng thể hiện các HĐ lỗi không vào được DB (để chạy tay), và hiện số không dùng chữ "Đã vào hết" như hiện nay, nếu không có để số 0

- Chuyển cặp Từ tháng - Đến tháng lên trên, góc phải, không có cột "Lệch tổng Line và Master (Những file còn lại không vào được DB có form riêng hiển thị lệch bao nhiêu)

- Mầu nền đỏ nhạt khi chọn "Hóa đơn GTGT Đầu vào", mầu xanh Blue nhạt khi chọn "Hóa đơn GTGT Đầu ra" (Trong giao diện "Lấy hóa đơn điện tử")

- Khi bấm nút "Lấy HĐ Điện tử" cột "Diễn biến" sửa font tiếng Việt, hợp nhất luôn vào nút "Nạp vào Database".

- Các nút "Đánh dấu tất cả đơn vị khai Tháng", "Đánh dấu tất cả đơn vị khai Quý", "Bỏ đánh dấu" đưa lên cùng dòng với "Lấy hóa đơn điện tử", Co ngắn chiều cao thanh Bar này, bỏ text giải thích "Đơn vị chữ đỏ là khai THÁNG", Co hẹp chiều cao tất cả các dòng, dùng Scroll cho phần danh sách chỉ hiển thị 10 đơn vị, không dùng dạng chuyển trang.

- Phần trạng thái của việc lấy HĐ khi khởi động form có luôn thông tin lấy trước thời điểm hiện tại (Mới nhất lên trước, cũ dần bên dưới) , Thông tin này có thêm cột ngày và account nào lấy (hôm nay lấy XUAN_QUYNH, HOA_SANG đến Vào MTT lấy thiếu HOA_SANG 13/16, XUAN_QUYNH 2/7)

- Tất cả dòng "Từ tháng - Đến tháng ..." đưa hết lên trên, có gọn các nút, các textbox