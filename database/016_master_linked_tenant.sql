-- 016_master_linked_tenant.sql — Master: cột LinkedTenantCode (AD-NB-03)
--
-- SỢI DÂY DUY NHẤT nối hai thế giới: tenant NB trỏ về tenant thuế tương ứng
--   TUAN_NGA_NB  ->  TUAN_NGA
--
-- Dùng cho BR-NB-03 (tra cứu xuyên DB): endpoint tra tên hàng đọc claim tenant_code
-- của phiên NB, tra sang đây lấy mã tenant thuế, rồi mới mở database thuế để SELECT.
-- Không có cột này thì không có cách nào biết tenant NB được phép nhìn sổ của ai —
-- và ghép chuỗi tên tenant thành tên DB là vi phạm BR-DB-01/resolver-only.
--
-- LƯU Ý: đây là MÃ tenant (Code), không phải Id. Cố ý: mã đọc được bằng mắt khi soi
-- bảng Tenants, và resolver vốn nhận vào mã chứ không nhận Guid.
--
-- Chạy trên KT2000_Master. Chạy lại được nhiều lần.

USE KT2000_Master;
GO

IF COL_LENGTH('Tenants', 'LinkedTenantCode') IS NULL
    ALTER TABLE Tenants ADD LinkedTenantCode NVARCHAR(30) NULL;
GO

-- Tra ngược "tenant NB nào đang trỏ vào tenant thuế này" — dùng khi xóa/đổi mã tenant
IF NOT EXISTS (SELECT 1 FROM sys.indexes
               WHERE name = 'IX_Tenants_LinkedTenantCode' AND object_id = OBJECT_ID('Tenants'))
    CREATE INDEX IX_Tenants_LinkedTenantCode ON Tenants(LinkedTenantCode);
GO

-- Không đặt FK về chính Tenants(Code): Code là UNIQUE nên FK khả thi về mặt kỹ thuật,
-- nhưng tenant NB có thể được đăng ký TRƯỚC tenant thuế liên kết (dựng môi trường thử,
-- hoặc khách dùng NB trước rồi mới làm thuế). FK sẽ chặn oan thứ tự đó. Ràng buộc thật
-- nằm ở tầng ứng dụng: AdminService kiểm tra mã tồn tại lúc gán.
GO
