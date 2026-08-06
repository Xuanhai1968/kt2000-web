-- 013_quan_tri_user_tenant.sql — Nền cho console quản trị (SPEC-QUAN-TRI, QT-#1)
--
-- Spec mục 3 viết "thêm cột Role trên UserTenantAccess" — nhưng cột đó ĐÃ CÓ SẴN từ
-- 001_create_master.sql, mặc định 'accountant', và đang được dùng thật: AuthService
-- đưa nó vào claim `role` của JWT, AdminService.CreateTenant gán 'admin' cho người
-- tạo đơn vị. Nên script này KHÔNG thêm cột đó, chỉ chuẩn hóa giá trị rỗng.
--
-- Việc thật còn lại chỉ hai cột:
--   Users.MustChangePassword  — QT-01: mật khẩu ban đầu / vừa reset thường đọc qua
--                               điện thoại hoặc Zalo, không được sống lâu.
--   Tenants.LinkedTenantCode  — AD-NB-03: tenant NB trỏ về tenant thuế tương ứng
--                               (TUAN_NGA_NB -> TUAN_NGA). Sợi dây duy nhất nối hai
--                               thế giới; để NULL với tenant thuế.

USE KT2000_Master;
GO

IF COL_LENGTH('Users', 'MustChangePassword') IS NULL
    ALTER TABLE Users ADD MustChangePassword BIT NOT NULL
        CONSTRAINT DF_Users_MustChangePassword DEFAULT 0;
GO

IF COL_LENGTH('Tenants', 'LinkedTenantCode') IS NULL
    ALTER TABLE Tenants ADD LinkedTenantCode NVARCHAR(30) NULL;
GO

-- Vai trò trống thì coi như kế toán viên; quyền quản trị vẫn nằm ở Users.IsAdmin
UPDATE UserTenantAccess SET Role = N'accountant'
WHERE Role IS NULL OR LTRIM(RTRIM(Role)) = N'';
GO

-- Tra nhanh tenant NB trỏ về đâu (rỗng ở giai đoạn này là đúng)
IF NOT EXISTS (SELECT 1 FROM sys.indexes
               WHERE name = 'IX_Tenants_LinkedTenantCode' AND object_id = OBJECT_ID('Tenants'))
    CREATE INDEX IX_Tenants_LinkedTenantCode ON Tenants(LinkedTenantCode)
        WHERE LinkedTenantCode IS NOT NULL;
GO

SELECT Code, TenantType, ISNULL(LinkedTenantCode, N'--') AS LienKet FROM Tenants ORDER BY Code;
SELECT LoginName, IsAdmin, IsActive, MustChangePassword FROM Users ORDER BY LoginName;
GO
