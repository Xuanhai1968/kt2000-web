-- 012_master_tenant_credentials.sql — Mật khẩu cổng Tổng cục Thuế, lưu ngay trong Tenants
--
-- Vì sao gộp vào Tenants thay vì bảng riêng (chốt với Trường 04/08): quan hệ vốn 1-1,
-- MST đã nằm sẵn ở Tenants.TaxCode, thêm bảng chỉ tổ thêm một join và một migration.
--
-- Mật khẩu lưu dạng ĐÃ MÃ HÓA bằng Data Protection API của ASP.NET Core (mã hóa hai
-- chiều — bắt buộc, vì phải giải ra đưa cho TRA_CUU_HDDT_2_0.py). Không API nào trả
-- mật khẩu ra ngoài: màn hình chỉ hiện "đã khai / chưa khai", đổi thì nhập đè.
--
-- CHẶN RÒ RỈ: phía C#, thuộc tính Tenant.MatKhauHddt gắn [JsonIgnore] — vì Tenants là
-- bảng bị đọc nhiều nhất, chỉ cần một chỗ lỡ trả nguyên thực thể là chuỗi mã hóa đi
-- thẳng ra trình duyệt. [JsonIgnore] chặn cả trường hợp sơ ý đó.
--
-- Hệ quả cần biết: ai đọc được database VÀ lấy được khóa Data Protection (thư mục
-- dp-keys cạnh file thực thi) thì giải mã được. Siết quyền vào KT2000_Master ngang
-- quyền vào cổng thuế, và sao lưu dp-keys cùng database.

USE KT2000_Master;
GO

-- Dọn bảng riêng của phương án cũ nếu lỡ tạo
IF OBJECT_ID('TenantCredential') IS NOT NULL DROP TABLE TenantCredential;
GO

IF COL_LENGTH('Tenants', 'MatKhauHddt') IS NULL
    ALTER TABLE Tenants ADD MatKhauHddt NVARCHAR(MAX) NULL;
GO
IF COL_LENGTH('Tenants', 'MkHddtCapNhatLuc') IS NULL
    ALTER TABLE Tenants ADD MkHddtCapNhatLuc DATETIME2 NULL;
GO
IF COL_LENGTH('Tenants', 'MkHddtCapNhatBoi') IS NULL
    ALTER TABLE Tenants ADD MkHddtCapNhatBoi NVARCHAR(50) NULL;
GO

SELECT Code, TaxCode,
       CASE WHEN MatKhauHddt IS NULL THEN N'chưa khai' ELSE N'đã khai' END AS MatKhauTCT
FROM Tenants ORDER BY Code;
GO
