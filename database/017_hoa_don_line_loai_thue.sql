-- 017_hoa_don_line_loai_thue.sql — cột LOAI_THUE cho HOA_DON_LINE (SCHEMA_VERSION = 10)
--
-- VÌ SAO CẦN: pt_vat là DECIMAL nên "KHÔNG CHỊU THUẾ" (KCT) và "thuế suất 0%" cùng rơi
-- về một giá trị 0, không cách nào phân biệt. Hai loại đó khác nhau khi lên tờ khai
-- GTGT — KCT không vào chỉ tiêu hàng chịu thuế, còn 0% thì có. Mất phân biệt ở tầng
-- dòng là mất luôn ở mọi báo cáo dựng trên nó.
--   Đo thật HOA_SANG T4+T5: 42 dòng cổng khai TSuat = 'KCT' đang nằm lẫn với dòng 0%.
--
-- GIỮ NGUYÊN CHUỖI cổng trả ('KCT', '0%', '5%', '8%', '10%', 'KKKNT'…) chứ không quy
-- ước lại bằng số. Quy ước số nào cũng cần một bảng tra đi kèm, mà bảng tra là thứ
-- người đọc code sau này không nhìn thấy — còn chuỗi gốc thì tự nó nói ra nghĩa.
-- pt_vat giữ nguyên để TÍNH; cột này chỉ để PHÂN LOẠI.
--
-- CHẠY CHO: MỌI database ĐƠN VỊ-NĂM (<MÃ>_<NĂM>), cả thuế lẫn nội bộ — HOA_DON_LINE là
-- bảng dùng chung. Database tạo MỚI đã có sẵn cột này vì 010_tenant_template_v6.sql
-- được vá kèm; script này dành cho các database đã dựng từ trước.
--
-- AN TOÀN: chỉ THÊM một cột NULL. Không sửa, không xóa, không đụng dữ liệu đang có.
-- Chạy lại nhiều lần vô hại.

-- Kiểm bảng có tồn tại chứ không chỉ kiểm cột: COL_LENGTH trả NULL cả khi BẢNG không có,
-- nên thiếu vế này thì chạy nhầm vào database trắng sẽ nổ "Cannot find the object" ở lô
-- trên rồi vẫn đóng dấu phiên bản 10 ở lô dưới — database chẳng có gì mà khai là đã vá.
-- (Bắt được khi chạy thử trên database nháp — 13/08.)
IF OBJECT_ID('HOA_DON_LINE') IS NOT NULL
   AND COL_LENGTH('HOA_DON_LINE', 'loai_thue') IS NULL
    ALTER TABLE HOA_DON_LINE ADD loai_thue NVARCHAR(10) NULL;
GO

-- Database dựng tay đời đầu có thể CHƯA có bảng SCHEMA_VERSION. Không dựng trước thì lô
-- dưới chết với "Invalid object name 'SCHEMA_VERSION'" — mà lô trên đã chạy rồi, để lại
-- database nửa vời: cột đã thêm nhưng phiên bản chưa ghi. VaCauTrucService khi đó vá lại
-- mãi không thôi vì lần nào đọc phiên bản cũng thấy thiếu.
-- (Bắt được khi chạy thử trên database nháp — 13/08.)
IF OBJECT_ID('SCHEMA_VERSION') IS NULL
    CREATE TABLE SCHEMA_VERSION (
        Ver       INT       NOT NULL,
        AppliedAt DATETIME2 NOT NULL DEFAULT SYSDATETIME());
GO

-- Chỉ đóng dấu phiên bản khi ĐÚNG là database đơn vị-năm và cột đã vào thật.
IF OBJECT_ID('HOA_DON_LINE') IS NOT NULL
   AND COL_LENGTH('HOA_DON_LINE', 'loai_thue') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM SCHEMA_VERSION WHERE Ver = 10)
    INSERT INTO SCHEMA_VERSION (Ver) VALUES (10);
GO
