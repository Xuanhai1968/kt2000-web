USE KT2000_Master;
GO
DECLARE @Mdn UNIQUEIDENTIFIER = NEWID();

INSERT INTO Tenants (Id, Code, Name, DbName, TenantType)
VALUES (@Mdn, N'MDN_NB', N'Công ty MDN Nội bộ', N'MDN_NB', N'internal');

INSERT INTO FiscalYears (TenantId, [Year]) VALUES (@Mdn, 2026);

INSERT INTO UserTenantAccess (UserId, TenantId, Role)
SELECT Id, @Mdn, N'admin' FROM Users WHERE LoginName = N'admin';
GO