-- 020_hoa_don_line_pt_vat_int.sql — pt_vat thành INT (SCHEMA_VERSION = 14)
--
-- CHẠY CHO: mọi database ĐƠN VỊ-NĂM. VaCauTrucService tự chạy khi nạp.
--
-- VÌ SAO: pt_vat chỉ chứa thuế suất (0, 5, 8, 10) và hai mã loại (-1 không kê khai,
-- -2 không chịu thuế) — toàn số nguyên. Để DECIMAL(18,3) thì mọi chỗ hiện ra thành
-- '8.000', '-2.000': đọc rối mà chẳng thêm thông tin gì.
-- Cột `vat` bên HOA_DON vốn đã là INT, nay hai bên thống nhất.
--
-- AN TOÀN: đã đếm trên dữ liệu thật TRƯỚC khi đổi — 0 dòng có giá trị lẻ trên 4.366
-- dòng (HOA_SANG 2.958 + HUY_THANH 1.408), nên phép đổi không cắt mất số nào.
--   Kiểm lại bất cứ lúc nào:
--   SELECT COUNT(*) FROM HOA_DON_LINE WHERE pt_vat <> ROUND(pt_vat, 0);
--
-- CẨN THẬN nếu mai kia cổng khai thuế suất lẻ (vd 7,5%): INT CẮT phần thập phân chứ
-- không báo lỗi. Lúc đó phải quay lại DECIMAL, và nhớ gỡ mấy câu CAST đã thêm trong
-- ThueService / NoiBoService.
--
-- Chạy lại nhiều lần vô hại: tự kiểm kiểu hiện tại trước khi đổi.

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id = c.user_type_id
           WHERE c.object_id = OBJECT_ID('HOA_DON_LINE') AND c.name = 'pt_vat'
             AND t.name = 'decimal')
    ALTER TABLE HOA_DON_LINE ALTER COLUMN pt_vat INT NULL;
GO

-- Số 14: đã tra database thật trước khi đặt (cao nhất đang là 13 — bản vá định khoản).
-- Phải KHỚP với mảng CAC_BAN_VA trong VaCauTrucService.cs.
IF OBJECT_ID('HOA_DON_LINE') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM SCHEMA_VERSION WHERE Ver = 14)
    INSERT INTO SCHEMA_VERSION (Ver) VALUES (14);
GO
