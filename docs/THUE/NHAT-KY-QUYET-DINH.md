24-07: DB per tenant-năm + TenantDbResolver duy nhất — giữ mental model VFP, vẫn mở đường gộp sau.
26-07: Bỏ tiền tố KT_ trong tên DB — thừa, MA_DONVI tự đủ định danh.
27-07: DM_HANG/DM_DVT không import — dữ liệu bẩn, xây sạch từ HĐĐT rẻ hơn dọn.
27-07: DM_TK giữ 17 cột BIT — mỗi cờ gắn một nhánh engine, thêm cờ = sửa code.
27-07: Pass cổng HĐĐT mã hóa 2 chiều trong TenantCredentials — máy phải đọc lại được, khác pass user (băm 1 chiều).
27-07: Tồn đầu (CONG_NO/TON_KHO) tạo structure ngay, nạp số + chuyển năm lùi WP-08 — thông tuyến HĐĐT trước.
27-07: bỏ nhóm bảng *_e/err — di sản ghi lỗi cũ, không dùng (| Nhóm staging HĐĐT | hdon_e, hd_line_e, tchi_e, tc_line_e, hd_err… )
27-07: THU_CHI 23 cột / THU_CHI_LINE 22 cột, cùng họ với HOA_DON (khóa ma_phieu, cặp ghi_no/ghi_co, cặp đối tượng chi tiết ma_ct_no/ma_ct_co, đuôi audit ai-sửa-lúc-nào).
