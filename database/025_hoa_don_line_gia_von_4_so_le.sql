-- 025_hoa_don_line_gia_von_4_so_le.sql — giá vốn lên 4 số thập phân (SCHEMA_VERSION = 18)
--
-- CHẠY CHO: mọi database ĐƠN VỊ-NĂM. VaCauTrucService tự chạy khi nạp.
--
-- VÌ SAO: từ 21/08 trình nạp đặt gia_von = don_gia cho hàng VÀO (hàng mua về thì đơn giá
-- mua chính là giá vốn). Nhưng don_gia là DECIMAL(18,4) sau bản vá 024 còn gia_von vẫn
-- DECIMAL(18,2), nên SQL Server CẮT BỚT ngay lúc gán — hai cột mang cùng một con số mà
-- giá trị lại khác nhau.
--   Ví dụ đơn giá xăng dầu 22.249,4159 vào gia_von hóa 22.249,42. Chênh lẻ tẻ, nhưng
--   nhân với số lượng vài chục nghìn lít là ra tiền thật, và không phép kiểm nào bắt
--   được vì cả hai cột đều "có số".
--
-- Đây đúng loại lỗi mà bản vá 024 đã chữa cho so_luong / don_gia: màn hình và code cho
-- gõ thứ mà cột không giữ nổi. Lần đó bỏ sót gia_von vì lúc ấy chưa ai ghi vào nó — cả
-- 7.337 dòng đều NULL.
--
-- AN TOÀN: nới scale là MỞ RỘNG, không cắt số nào — mọi giá trị đang có đều biểu diễn
-- được. Precision giữ 18 nên phần nguyên còn 14 chữ số, dư xa cho một đơn giá.
--   Kiểm 21/08: KHÔNG index, KHÔNG ràng buộc, KHÔNG cột tính toán nào bám vào gia_von.
--   Kiểm lại bất cứ lúc nào:
--   SELECT i.name FROM sys.indexes i
--     JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id
--     JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
--    WHERE i.object_id = OBJECT_ID('HOA_DON_LINE') AND c.name = 'gia_von';
--
-- Chạy lại nhiều lần vô hại: tự kiểm scale hiện tại trước khi đổi.

IF EXISTS (SELECT 1 FROM sys.columns
            WHERE object_id = OBJECT_ID('HOA_DON_LINE') AND name = 'gia_von' AND scale < 4)
    ALTER TABLE HOA_DON_LINE ALTER COLUMN gia_von DECIMAL(18,4) NULL;
GO

-- Số 18: cao nhất đang là 17 (bản vá 024). Phải KHỚP với mảng CAC_BAN_VA trong
-- VaCauTrucService.cs — thiếu một trong hai thì bản vá không chạy mà không báo gì.
--
-- CẢNH BÁO SỐ HIỆU: Leader có một script chưa đánh số nằm ngoài thư mục này —
-- tools/dinh_khoan/0XX_doi_ten_proba_pred_conf.sql (đổi tên proba → pred_conf). Khi
-- nhánh đó vào, số 18 có thể đã bị chiếm. Xem đầu file 023 để biết chuyện gì xảy ra khi
-- hai nhánh đặt trùng số: bản vá bị coi là "đã áp" ở 9 database chưa hề có cột.
-- TRA CẢ database THẬT LẪN script của MỌI nhánh trước khi đặt số tiếp theo.
IF OBJECT_ID('HOA_DON_LINE') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM SCHEMA_VERSION WHERE Ver = 18)
    INSERT INTO SCHEMA_VERSION (Ver) VALUES (18);
GO
