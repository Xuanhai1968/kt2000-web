-- 018_dm_hang_sua_kieu.sql — sửa KIỂU DỮ LIỆU của DM_HANG trong KT2000_Base
--
-- CHẠY CHO: database KT2000_Base (DÙNG CHUNG cho khối khai thuế). KHÔNG chạy cho
-- database đơn vị-năm — ở đó không có bảng DM_HANG.
-- Vì chỉ có MỘT database nên chạy tay; cố ý không nhúng vào VaCauTrucService, thứ đó
-- sinh ra để khỏi phải chạy tay trên hàng trăm database đơn vị-năm.
--
-- VÌ SAO: script 006 khai bốn cột này là DECIMAL(18,2), nhưng cả bốn đều chứa CHỮ:
--
--   ghi_chu   DECIMAL -> NVARCHAR(500)   Chỗ để tên hàng gốc lấy từ hóa đơn, chờ kế
--                                        toán định khoản. DECIMAL thì không nhét nổi
--                                        "Sữa chua uống Zinzin Kids 110ml" vào.
--   tk_kho    DECIMAL -> NVARCHAR(20)    Tài khoản kho ('156', '641') là CHUỖI. Để số
--   tk_gv     DECIMAL -> NVARCHAR(20)    thì '1561' và '1561.00' hóa một, lại chặn luôn
--                                        tài khoản có chữ mai sau.
--   ma_ncc    DECIMAL -> NVARCHAR(50)    Mã nhà cung cấp, cùng dạng với ma_kh.
--
--   ten_hang  NVARCHAR(100) -> (500)     Tên hàng thật từ cổng vượt 100 ký tự thường
--                                        xuyên; đã gặp tên người bán 79 ký tự và tên
--                                        hàng kèm chú thích khuyến mại còn dài hơn.
--
-- AN TOÀN: DM_HANG và DM_KH hiện RỖNG (0 dòng — kiểm ngày 13/08) nên đổi kiểu không có
-- dữ liệu nào để mất. Nếu chạy muộn hơn, khi đã có dữ liệu, phải kiểm lại: DECIMAL sang
-- NVARCHAR luôn chuyển được, nhưng số sẽ thành chuỗi kiểu '641.00'.
--
-- Chạy lại nhiều lần vô hại: mỗi lệnh tự kiểm kiểu hiện tại trước khi đổi.

-- Chỉ đổi khi cột ĐANG là decimal — chạy lần hai thì nó đã nvarchar, bỏ qua.
IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id = c.user_type_id
           WHERE c.object_id = OBJECT_ID('DM_HANG') AND c.name = 'ghi_chu' AND t.name = 'decimal')
    ALTER TABLE DM_HANG ALTER COLUMN ghi_chu NVARCHAR(500) NULL;
GO

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id = c.user_type_id
           WHERE c.object_id = OBJECT_ID('DM_HANG') AND c.name = 'tk_kho' AND t.name = 'decimal')
    ALTER TABLE DM_HANG ALTER COLUMN tk_kho NVARCHAR(20) NULL;
GO

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id = c.user_type_id
           WHERE c.object_id = OBJECT_ID('DM_HANG') AND c.name = 'tk_gv' AND t.name = 'decimal')
    ALTER TABLE DM_HANG ALTER COLUMN tk_gv NVARCHAR(20) NULL;
GO

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id = c.user_type_id
           WHERE c.object_id = OBJECT_ID('DM_HANG') AND c.name = 'ma_ncc' AND t.name = 'decimal')
    ALTER TABLE DM_HANG ALTER COLUMN ma_ncc NVARCHAR(50) NULL;
GO

-- Nới ten_hang. So theo max_length: NVARCHAR đếm BYTE nên 100 ký tự = 200 byte.
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('DM_HANG')
           AND name = 'ten_hang' AND max_length < 1000 AND max_length > 0)
    ALTER TABLE DM_HANG ALTER COLUMN ten_hang NVARCHAR(500) NULL;
GO

-- Tra DM_HANG theo tên hàng là việc thường xuyên khi khớp danh mục về sau.
IF NOT EXISTS (SELECT 1 FROM sys.indexes
               WHERE name = 'IX_DM_HANG_ten' AND object_id = OBJECT_ID('DM_HANG'))
    CREATE INDEX IX_DM_HANG_ten ON DM_HANG(ten_hang);
GO
