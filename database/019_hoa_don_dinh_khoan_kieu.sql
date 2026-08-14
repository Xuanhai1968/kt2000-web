-- 019_hoa_don_dinh_khoan_kieu.sql — sửa KIỂU 4 cột định khoản (SCHEMA_VERSION = 13)
--
-- CHẠY CHO: mọi database ĐƠN VỊ-NĂM. VaCauTrucService tự chạy khi nạp, không phải gọi tay.
--
-- VÌ SAO: trong cùng bảng HOA_DON, cặp tiền hàng là CHUỖI còn cặp thuế và cặp chiết khấu
-- lại là SỐ — cùng một thứ (số hiệu tài khoản) mà hai kiểu khác nhau:
--
--     ghi_no      nvarchar(20)   OK
--     ghi_co      nvarchar(20)   OK
--     ghi_no_vat  decimal(18,2)  ->  nvarchar(20)
--     ghi_co_vat  decimal(18,2)  ->  nvarchar(20)
--     ghi_no_ck   decimal(18,2)  ->  nvarchar(20)
--     ghi_co_ck   decimal(18,2)  ->  nvarchar(20)
--
-- Tài khoản kế toán là CHUỖI. Để số thì '1331' và '1331.00' hóa làm một, không đối chiếu
-- được với DM_TK.ma_tk (vốn nvarchar), lại chặn luôn tài khoản có chữ mai sau.
-- Cùng họ lỗi với DM_HANG đã vá bằng script 018.
--
-- KHÁC 018 Ở CHỖ: bảng này ĐANG CÓ DỮ LIỆU. ALTER từ decimal sang nvarchar biến 1331.00
-- thành chuỗi '1331.00' chứ không phải '1331', nên phải cắt đuôi ngay sau đó. Cắt an toàn
-- vì số hiệu tài khoản luôn là số nguyên — phần sau dấu chấm chỉ có thể là số 0.
--
-- Chạy lại nhiều lần vô hại: mỗi lệnh tự kiểm kiểu hiện tại trước khi đổi.

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id = c.user_type_id
           WHERE c.object_id = OBJECT_ID('HOA_DON') AND c.name = 'ghi_no_vat' AND t.name = 'decimal')
    ALTER TABLE HOA_DON ALTER COLUMN ghi_no_vat NVARCHAR(20) NULL;
GO

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id = c.user_type_id
           WHERE c.object_id = OBJECT_ID('HOA_DON') AND c.name = 'ghi_co_vat' AND t.name = 'decimal')
    ALTER TABLE HOA_DON ALTER COLUMN ghi_co_vat NVARCHAR(20) NULL;
GO

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id = c.user_type_id
           WHERE c.object_id = OBJECT_ID('HOA_DON') AND c.name = 'ghi_no_ck' AND t.name = 'decimal')
    ALTER TABLE HOA_DON ALTER COLUMN ghi_no_ck NVARCHAR(20) NULL;
GO

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id = c.user_type_id
           WHERE c.object_id = OBJECT_ID('HOA_DON') AND c.name = 'ghi_co_ck' AND t.name = 'decimal')
    ALTER TABLE HOA_DON ALTER COLUMN ghi_co_ck NVARCHAR(20) NULL;
GO

-- Cắt đuôi thập phân do phép đổi kiểu để lại: '1331.00' -> '1331'.
-- Chỉ đụng dòng THỰC SỰ có dấu chấm, nên chạy lần hai không còn gì để sửa.
IF COL_LENGTH('HOA_DON', 'ghi_no_vat') IS NOT NULL
UPDATE HOA_DON SET
    ghi_no_vat = CASE WHEN ghi_no_vat LIKE '%.%'
                      THEN LEFT(ghi_no_vat, CHARINDEX('.', ghi_no_vat) - 1) ELSE ghi_no_vat END,
    ghi_co_vat = CASE WHEN ghi_co_vat LIKE '%.%'
                      THEN LEFT(ghi_co_vat, CHARINDEX('.', ghi_co_vat) - 1) ELSE ghi_co_vat END,
    ghi_no_ck  = CASE WHEN ghi_no_ck  LIKE '%.%'
                      THEN LEFT(ghi_no_ck,  CHARINDEX('.', ghi_no_ck)  - 1) ELSE ghi_no_ck  END,
    ghi_co_ck  = CASE WHEN ghi_co_ck  LIKE '%.%'
                      THEN LEFT(ghi_co_ck,  CHARINDEX('.', ghi_co_ck)  - 1) ELSE ghi_co_ck  END
WHERE ghi_no_vat LIKE '%.%' OR ghi_co_vat LIKE '%.%'
   OR ghi_no_ck  LIKE '%.%' OR ghi_co_ck  LIKE '%.%';
GO

-- Số 13: đã TRA DATABASE THẬT trước khi đặt (cao nhất đang là 12 — bản vá loai_thue).
-- Phải KHỚP với mảng CAC_BAN_VA trong VaCauTrucService.cs.
IF OBJECT_ID('HOA_DON') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM SCHEMA_VERSION WHERE Ver = 13)
    INSERT INTO SCHEMA_VERSION (Ver) VALUES (13);
GO
