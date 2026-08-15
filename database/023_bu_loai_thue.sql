-- 023_bu_loai_thue.sql — bù cột HOA_DON_LINE.loai_thue (SCHEMA_VERSION = 16)
--
-- CHẠY CHO: mọi database ĐƠN VỊ-NĂM. VaCauTrucService tự chạy khi nạp.
--
-- ============================================================================
-- VÌ SAO PHẢI CÓ, TRONG KHI 017 ĐÃ LÀM ĐÚNG VIỆC NÀY
--
-- 017_hoa_don_line_loai_thue.sql thêm cột và đóng dấu Ver = 12.
-- 022_base_tokhai.sql (nhánh tờ khai, gộp từ 020_hoa_don_index_thang.sql) CŨNG đóng
-- dấu Ver = 12 cho database đơn vị-năm, vì hai nhánh chọn số cùng lúc mà không biết
-- nhau. Hai bản vá khác hẳn nội dung lại mang chung một số.
--
-- Hệ quả: database nào bị chạy 022 TRƯỚC thì SCHEMA_VERSION đã có 12, nên
-- VaCauTrucService coi bản vá 017 là "đã áp" và BỎ QUA VĨNH VIỄN. Cột loai_thue không
-- bao giờ được thêm, mà nạp thì vẫn chạy bình thường (ImportService dò cột trước khi
-- ghi) — hỏng hoàn toàn im lặng.
--
-- Đo trên máy chủ 15/08: 9 database có Ver 12 mà THIẾU loai_thue, và cả 9 đều đã có
-- IX_HOA_DON_thang_huong — dấu vân tay xác nhận chúng nhận số 12 từ 022 chứ không
-- phải từ 017:
--   BAO_HAN_2026   TAY_DO_2026        THAI_TUAN_2026   THUAN_AN_2026
--   TUAN_NGA_2026  TUAN_NGA_NB_2026   USA_MEVA_2026    USA_MEVA_NB_2026
--   XUAN_QUYNH_2026
--
-- KHÔNG sửa được bằng cách đổi số của 017 hay 022: cả hai đã phát hành, số 12 đang
-- nằm trong SCHEMA_VERSION của khách. Cách duy nhất là bản vá MỚI mang số RIÊNG (16),
-- làm lại đúng việc của 017 nhưng thoát khỏi cái số đang bị hai bên tranh.
--
-- Database nào đã có cột rồi thì câu ALTER tự bỏ qua — chạy vô hại, chỉ đóng dấu 16.
--
-- BÀI HỌC, ghi ở đây vì đây là chỗ người sau sẽ đọc khi gặp lại: số SCHEMA_VERSION
-- phải TRA TRONG DATABASE THẬT và trong MỌI script của MỌI nhánh trước khi đặt —
--   SELECT Ver FROM SCHEMA_VERSION   +   grep "VALUES (n)" database/*.sql
-- Đây là lần thứ hai lỗi này xảy ra: lần đầu 14/08 (Ver 10 và 11 đã bị chiếm sẵn).
-- ============================================================================

IF OBJECT_ID('HOA_DON_LINE') IS NOT NULL
   AND COL_LENGTH('HOA_DON_LINE', 'loai_thue') IS NULL
    ALTER TABLE HOA_DON_LINE ADD loai_thue NVARCHAR(10) NULL;
GO

-- Database dựng tay đời đầu có thể chưa có bảng phiên bản.
IF OBJECT_ID('HOA_DON_LINE') IS NOT NULL AND OBJECT_ID('SCHEMA_VERSION') IS NULL
    CREATE TABLE SCHEMA_VERSION (
        Ver       INT       NOT NULL,
        AppliedAt DATETIME2 NOT NULL DEFAULT SYSDATETIME());
GO

-- Chỉ đóng dấu khi cột đã THẬT SỰ có mặt, và chỉ trên database ĐƠN VỊ (có HOA_DON_LINE).
-- Database trống rỗng mà đóng dấu sớm thì bản vá sau bỏ qua nó vĩnh viễn — đúng cái
-- bẫy vừa mắc ở trên, đừng lặp lại ngay trong file sửa nó.
IF OBJECT_ID('HOA_DON_LINE') IS NOT NULL
   AND COL_LENGTH('HOA_DON_LINE', 'loai_thue') IS NOT NULL
   AND OBJECT_ID('SCHEMA_VERSION') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM SCHEMA_VERSION WHERE Ver = 16)
    INSERT INTO SCHEMA_VERSION (Ver) VALUES (16);
GO
