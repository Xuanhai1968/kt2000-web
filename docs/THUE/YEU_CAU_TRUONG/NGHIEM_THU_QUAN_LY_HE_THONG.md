Nghiệm thu phần quản lý hệ thống
1 - Hiện tại trong mục "Đơn vị khách hàng" và "Mở năm làm việc" danh sách các đơn vị chưa đánh dấu theo chuẩn khai tháng mầu đỏ, khai quý mầu xanh , NB mầu nâu
2 - Khi thêm mới đơn vị có nên cho luôn thông tin nhập pass 78 vào TCT luôn ở đây không ?
3 - Giao diện khi đăng nhập MDN_NB nên đổi "Hóa đơn GTGT đầu vào" thành "Lấy HĐ GTGT đầu Vào" và "Hóa đơn GTGT đầu Ra" thành "Lấy HĐ GTGT đầu Ra (Đăng nhập vào 1 đơn vị bình thường vẫn giữ nguyên)
4 - Giao diện khi đăng nhập MDN_NB không nên có "Báo cáo tồn kho" và "Báo cáo công nợ" , "Phiếu thu", "Phiếu chi", những phần này chỉ dùng cho 1 đơn vị khách hàng bình thường, trong MDN_NB sau này sẽ thiết kế 1 giao diện theo dõi về phí dịch vụ
5 - Trong các giao diện có hiện danh sách đơn vị nên dùng scroll thay vì lật trang theo số 
6 - Giao diện khi đăng nhập MDN_NB, có những chức năng danh sách đơn vị lại khác nhau ví dụ, trong phần lấy HĐ điện tử có thể không có 1 đơn vị nào đó (vì đơn vị không phát sinh HĐ trong năm do tạm ngừng kinh doanh nhưng vẫn nộp tờ khai trắng) nhưng trong "Báo cáo thuế" vẫn phải xuất hiện để theo dõi xem nộp tờ khai hay chưa 

---

## SPEC — NGHIỆM THU PHẦN HỆ THỐNG (MDN_NB)
## 0. MỤC TIÊU & PHẠM VI
- Đăng nhập vào MDN_NB bằng tài khoản admin Chạy thử từng bước như tạo đơn vị mới, thay đổi thông tin về 1 đơn vị và ghi nhận các lỗi hoặc giao diện cần sửa.
## 1. TIẾN HÀNH CHẠY PHẦN MỀM VỚI CÁC CÔNG VIỆC SAU ĐÂY
1 . Thêm đơn vị mới (AL_GLOBAL) 

- Trong giao diện "Đơn vị khách hàng" không phân biệt được khai tháng và khai quý, nên tổ mầu đỏ các đơn vị khai tháng, mầu nâu với các đơn vị NB.

- Tất cả các giao diện có danh sách các đơn vị Thuế trong MDN_NB đều tô mầu như vậy (mầu đỏ các đơn vị khai tháng, mầu nâu với các đơn vị NB)

- Tất cả các giao diện có danh sách các đơn vị đều sắp xếp thứ tự chữ cái a,b,c theo mã đơn vị (HUY_THANH,TUAN_NGA, AK_GLOBAL)

- Trong giao diện "Thêm đơn vị mới" mặc nhiên chọn khai tháng cho đơn vị  (phải thêm mới xong bấm lưu rồi chọn "Sửa" ở giao diện "Danh sách đơn vị").Đề xuất khi thêm mới cho luôn option khai thuế tháng hay quý vào. Các đơn vị NB không có option này

- Mật khẩu cổng TCT (Pass 78) có thể thêm ở 2 nơi : Như hiện tại (Form lấy HĐ điện tử) và giao diện "Đơn vị khách hàng".
