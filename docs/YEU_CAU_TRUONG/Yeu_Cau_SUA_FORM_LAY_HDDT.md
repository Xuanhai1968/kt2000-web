Sửa form lấy HĐ điện tử từ TCT - Form này gọi là FRM_LAY_HDDT.
Làm theo mẫu của VFP cũ cho các USER khác quen dùng :
1 - Sau khi đăng nhập User chọn "Hóa đơn GTGT Đầu vào" sẽ hiển thị Danh sách các đơn vị cần lấy HĐ 
    1.1 Có thể lấy chỉ HĐ vào hoặc lấy tất cả đầu ra đầu vào 

    1.2 Khi lấy chia làm 2 bước, bước 1 : Lấy HĐ từ TCT , bước 2 : Đưa HĐ và HOA_DON và HOA_DON_LINE (Đã có code sẵn tham khảo và sửa), khi lấy về để theo path chuẩn như sau :\\Severnew\data_hddt\TUAN_NGA\NAM2026\T1_2026_TUAN_NGA\raw\VAO\TUAN_NGA_VAO_0109120136_T1_C26TAP_181.xml và .html (Lưu ý phần MST trong tên - code đã có trong bản lấy từ Git ban đầu)

    1.3 Đối với 1 HĐ sau khi ghi dữ liệu sẽ tạm thời thay servernew bằng C:\test
        1 - Move file .html vào mẫu sau : \\Severnew\scan_doc\TUAN_NGA\NAM2026\VAO_T1_2026\v_tuan_nga_0103753943_t1_2026_0000005.html để user có thể xem HĐ gốc (Có bao gồm MST của người bán với HĐ vào, người bán với HĐ ra tránh trùng và bị ghi đè như tháng 1 nhà HUY_THANH)
        2 - Move file .xml vào mẫu sau \\Severnew\scan_doc\TUAN_NGA\NAM2026\xmls_only\vao\t1\v_tuan_nga_0103753943_t1_2026_0000005.xml (giống với file .html)
        3 - Những file lỗi do lệch line và Master sẽ nằm lại \\Severnew\data_hddt\TUAN_NGA\NAM2026\T1_2026_TUAN_NGA\raw\VAO\ và cho hiển thị lên 1 cột trong giao diện danh sách đơn vị lấy HĐ (FRM_LAY_HDDT) - Có thêm nút chạy bằng tay (Bước 2 : Đưa HĐ và HOA_DON và HOA_DON_LINE)
        4 - Code đang có sẵn chưa lấy chính xác các HĐ không có gốc (Điện, viễn thông , ngân hàng ...) Chú ý phần này
        5 - Đọc lại cách kiểm tra dữ liệu (cộng tổng line so sánh với Master) của VFP (hỏi Leader để lấy code mầu của VFP)

    1.4 Quá trình làm đều có LOG để biết HĐ tháng 1 của TUAN_NGA được lấy ngày nào , đưa vào OK bao nhiêu, bỏ lại bao nhiêu , ai chạy đưa vào bằng tay (Có nhưng thông tin gì của phần này Trường tự thiết kế đưa thêm)
        1 - LOG được ghi theo hướng mô tả được 1 phiên lấy dữ liệu đã thực hiện được bao nhiêu đơn vị, Đơn vị nào thời điểm vừa lấy xong và xem được những lần lấy dữ liệu vào thời điểm nào đó (Ví dụ hôm này là 2/8/2026 có thể lại lịch sử lấy dữ liệu của 1 đơn vị từ tháng 1 - lấy bao nhiêu lần account nào do dữ liệu có thể bị lấy đè nhiều lần )
        2 - LOG ghi nhận công việc lấy HĐ điện tử trong chuỗi công việc tổng thể (Lấy HĐ, Định khoản, ghép tên hàng ...) LOG này cho biết một đơn vị đã hoàn thành được bao nhiêu việc (Đã lấy HĐ chưa, đã định khoản tự động chưa ...)


    1.5 Hiển thị Progress bar đang lấy đơn vị nào đến đâu (giống VFP cũ)

    1.6 Hiện tai code cho việc đưa dữ liệu từ xml vào HOA_DON và HOA_DON_LINE , nếu thêm mới thì như trên, trong trường hợp bấm nút lấy nhưng có dữ liệu cũ (Lấy lại trong 1 số trường hợp) máy sẽ sử lý như sau, không xóa HĐ đi như VFP đang làm mà update những gì có từ xml , có nghĩa là các trường như ghi chú của user là không bị mất (áp dụng cho HOA_DON và không áp dụng cho HOA_DON_LINE).

2 -  Trong giao diện FRM_LAY_HDDT
    - Đánh dấu bằng mầu đỏ nhưng đơn vị khai tháng
    - Thêm nút "Đánh dấu tất cả các đơn vị khai Tháng" và nút "Đánh dấu tất cả các đơn vị khai Quý".
    - Thêm Combobox Từ tháng / Đến tháng năm mặc định là năm đăng nhập của MDN_NB (Bỏ nút chọn năm hiện tại)
    - Nếu cần có thể phải thêm nút Refresh để đọc các thông tin như file lỗi chưa vào, đã vào bao nhiêu.
    - Có hướng thiết kế cho chức năng lấy HĐ điện tử này chạy tự động vào thứ 7 chủ nhật hàng tuần 