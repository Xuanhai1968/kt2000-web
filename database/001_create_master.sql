CREATE DATABASE KT2000_Master;
GO
USE KT2000_Master;
GO

-- ============ 1. Users ============
CREATE TABLE Users (
    Id            UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
    LoginName     NVARCHAR(50)  NOT NULL UNIQUE,
    PasswordHash  NVARCHAR(200) NOT NULL,
    RealName      NVARCHAR(100) NULL,
    IsAdmin       BIT NOT NULL DEFAULT 0,
    IsActive      BIT NOT NULL DEFAULT 1,
    CreatedAt     DATETIME2 NOT NULL DEFAULT SYSDATETIME()
);

-- ============ 2. Tenants (DM_DONVI cũ + 6 cột mở rộng) ============
CREATE TABLE Tenants (
    Id            UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
    Code          NVARCHAR(30)  NOT NULL UNIQUE,   -- MA_DONVI
    Name          NVARCHAR(200) NOT NULL,           -- TEN_DONVI
    DbName        NVARCHAR(100) NOT NULL,           -- ten database rieng: KT_<Code>
    TenantType    NVARCHAR(20)  NOT NULL DEFAULT 'headquarter', -- headquarter | branch
    ParentId      UNIQUEIDENTIFIER NULL REFERENCES Tenants(Id), -- chi nhanh -> cong ty me
    TaxCode       NVARCHAR(20)  NULL,               -- MST
    Address       NVARCHAR(300) NULL,
    IsActive      BIT NOT NULL DEFAULT 1,
    -- 6 cot mo rong da chot (script ALTER cu):
    VonDK         DECIMAL(18,0) NULL,               -- von dieu le
    Email         NVARCHAR(100) NULL,
    SortName      NVARCHAR(50)  NULL,               -- ten viet tat de sap xep/tim
    TkCongNo      NVARCHAR(20)  NULL,               -- TK cong no mac dinh
    NamQuyetToan  INT NULL,                          -- nam da quyet toan
    KhaiQuy       BIT NOT NULL DEFAULT 0            -- khai thue theo quy
);

-- ============ 3. UserTenantAccess ============
CREATE TABLE UserTenantAccess (
    UserId    UNIQUEIDENTIFIER NOT NULL REFERENCES Users(Id),
    TenantId  UNIQUEIDENTIFIER NOT NULL REFERENCES Tenants(Id),
    Role      NVARCHAR(20) NOT NULL DEFAULT 'accountant', -- admin | accountant | viewer
    PRIMARY KEY (UserId, TenantId)
);

-- ============ 4. FiscalYears ============
CREATE TABLE FiscalYears (
    TenantId  UNIQUEIDENTIFIER NOT NULL REFERENCES Tenants(Id),
    [Year]    INT NOT NULL,
    IsClosed  BIT NOT NULL DEFAULT 0,
    PRIMARY KEY (TenantId, [Year])
);

-- ============ 5. UserPreferences (thay KT2000.INI) ============
CREATE TABLE UserPreferences (
    UserId  UNIQUEIDENTIFIER NOT NULL REFERENCES Users(Id),
    [Key]   NVARCHAR(50)  NOT NULL,
    [Value] NVARCHAR(200) NULL,
    PRIMARY KEY (UserId, [Key])
);
GO

-- ============ SEED DU LIEU TEST ============
-- Password da hash san bang BCrypt:
--   admin    / admin123
--   ketoan01 / ketoan123
DECLARE @AdminId  UNIQUEIDENTIFIER = NEWID();
DECLARE @KetoanId UNIQUEIDENTIFIER = NEWID();
DECLARE @T1 UNIQUEIDENTIFIER = NEWID();
DECLARE @T2 UNIQUEIDENTIFIER = NEWID();
DECLARE @T3 UNIQUEIDENTIFIER = NEWID();

INSERT INTO Users (Id, LoginName, PasswordHash, RealName, IsAdmin) VALUES
(@AdminId,  N'admin',    N'$2b$11$mVdKVCCx.diDYeN7x3zE0OBNNnBuzOvHXlv60TK3zyjhTHp3dW4PK', N'Quản trị viên', 1),
(@KetoanId, N'ketoan01', N'$2b$11$jNqa2AO6ENMPIMhM1mRb4O75h4rryXM0WcidJn1wqzVTAGCvVxupG', N'Kế toán 01',    0);

INSERT INTO Tenants (Id, Code, Name, DbName, TenantType) VALUES
(@T1, N'HA_THAI',     N'Công ty TNHH Hà Thái',      N'KT_HA_THAI',     N'headquarter'),
(@T2, N'HA_THAI_CN1', N'Chi nhánh 1 - Hà Thái',     N'KT_HA_THAI_CN1', N'branch'),
(@T3, N'CONG_TY_B',   N'Công ty CP Sản Xuất B',     N'KT_CONG_TY_B',   N'headquarter');
UPDATE Tenants SET ParentId = @T1 WHERE Id = @T2;

INSERT INTO UserTenantAccess (UserId, TenantId, Role) VALUES
(@AdminId, @T1, N'admin'), (@AdminId, @T2, N'admin'), (@AdminId, @T3, N'admin'),
(@KetoanId, @T1, N'accountant');

INSERT INTO FiscalYears (TenantId, [Year]) VALUES
(@T1, 2025),(@T1, 2026),(@T2, 2026),(@T3, 2025),(@T3, 2026);
GO