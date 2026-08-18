-- 024_hoa_don_line_4_so_le.sql — số lượng / đơn giá lên 4 số thập phân (SCHEMA_VERSION = 17)
--
-- CHẠY CHO: mọi database ĐƠN VỊ-NĂM. VaCauTrucService tự chạy khi nạp.
--
-- VÌ SAO: người bán làm tròn khi in hóa đơn, nên SL × ĐG không đúng bằng Thành tiền và
-- hóa đơn bị đá ra vì lệch Σ dù bản thân nó chẳng sai gì. Chữa bằng cách tính ngược một
-- trong hai số — nhưng chỉ chữa được nếu cột GIỮ nổi phần lẻ.
--   Ca thật DAT_VIET_THANH T7 K26THT/2578264: 22,988 × 21.750 = 499.989 còn cổng khai
--   500.000, chênh 11 (ngưỡng 10). Tính ngược ra 22,9885 — decimal(18,3) cắt còn 22,989,
--   nhân lại thành 500.010,75, lệch 10,75: vẫn bị đá ra, mà lần này màn hình hiện xanh
--   nên không ai hiểu vì sao.
--   Ca thật thứ hai (Trường gặp 18/08): đơn giá 361,905 vào sổ hóa 361,91.
--
-- Lưới đã hiện 4 số lẻ từ 17/08, nhưng đó thuần là ĐỊNH DẠNG — cột vẫn 3 và 2, nên màn
-- hình cho gõ thứ mà sổ không giữ được. Bản vá này khép lại chỗ vênh đó.
--
-- AN TOÀN: nới scale là MỞ RỘNG, không cắt số nào — mọi giá trị đang có đều biểu diễn
-- được. Precision giữ 18 nên phần nguyên còn 14 chữ số (tối đa ~99 nghìn tỷ một dòng
-- hàng), dư xa so với hóa đơn lớn nhất từng gặp.
--   Đã kiểm 18/08: KHÔNG index, KHÔNG ràng buộc, KHÔNG cột tính toán nào bám vào bốn
--   cột này, nên ALTER không kéo theo thứ gì. Bảng cũng nhỏ (đơn vị lớn nhất 439 dòng).
--   Kiểm lại bất cứ lúc nào:
--   SELECT i.name FROM sys.indexes i
--     JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id
--     JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
--    WHERE i.object_id = OBJECT_ID('HOA_DON_LINE')
--      AND c.name IN ('so_luong','don_gia','sl_qd','dg_qd');
--
-- sl_qd / dg_qd đổi CÙNG LÚC dù chưa dùng tới: để hai cặp cột cùng nghĩa mà khác độ
-- chính xác là cái bẫy cho người sửa sau, và gộp vào đây thì khỏi thêm một bản vá nữa.
--
-- Chạy lại nhiều lần vô hại: tự kiểm scale hiện tại trước khi đổi.

IF EXISTS (SELECT 1 FROM sys.columns
            WHERE object_id = OBJECT_ID('HOA_DON_LINE') AND name = 'so_luong' AND scale < 4)
    ALTER TABLE HOA_DON_LINE ALTER COLUMN so_luong DECIMAL(18,4) NULL;
GO

IF EXISTS (SELECT 1 FROM sys.columns
            WHERE object_id = OBJECT_ID('HOA_DON_LINE') AND name = 'don_gia' AND scale < 4)
    ALTER TABLE HOA_DON_LINE ALTER COLUMN don_gia DECIMAL(18,4) NULL;
GO

IF EXISTS (SELECT 1 FROM sys.columns
            WHERE object_id = OBJECT_ID('HOA_DON_LINE') AND name = 'sl_qd' AND scale < 4)
    ALTER TABLE HOA_DON_LINE ALTER COLUMN sl_qd DECIMAL(18,4) NULL;
GO

IF EXISTS (SELECT 1 FROM sys.columns
            WHERE object_id = OBJECT_ID('HOA_DON_LINE') AND name = 'dg_qd' AND scale < 4)
    ALTER TABLE HOA_DON_LINE ALTER COLUMN dg_qd DECIMAL(18,4) NULL;
GO

-- Số 17: đã tra database thật LẪN script của mọi nhánh trước khi đặt (cao nhất đang là
-- 16 — bản vá 023 bù loai_thue). Phải KHỚP với mảng CAC_BAN_VA trong VaCauTrucService.cs.
-- Xem đầu file 023 để biết chuyện gì xảy ra khi hai nhánh đặt trùng số.
IF OBJECT_ID('HOA_DON_LINE') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM SCHEMA_VERSION WHERE Ver = 17)
    INSERT INTO SCHEMA_VERSION (Ver) VALUES (17);
GO
