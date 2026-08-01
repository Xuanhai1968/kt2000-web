USE KT2000_Master;
GO
CREATE TABLE TenantChangeLog (
    Id        INT IDENTITY(1,1) PRIMARY KEY,
    TenantId  UNIQUEIDENTIFIER NOT NULL REFERENCES Tenants(Id),
    ChangedBy NVARCHAR(50)  NOT NULL,   -- login_name người sửa
    ChangedAt DATETIME2     NOT NULL DEFAULT SYSDATETIME(),
    Changes   NVARCHAR(1000) NOT NULL   -- "Name: 'A' -> 'B'; Address: ..."
);
GO