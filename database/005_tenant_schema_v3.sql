-- 005_tenant_schema_v3.sql — thêm TON_KHO + CONG_NO (bảng dẫn xuất, tính bị động)
-- BR nền: dòng tháng N = LŨY KẾ từ đầu năm (gồm tồn/dư đầu ở tháng 0);
--         tồn/dư tại tháng N = ps_no - ps_co (và so_luong_no - so_luong_co) của CHÍNH dòng N.
-- Dữ liệu do nút "Tính lại cả năm" sinh từ HOA_DON/THU_CHI — không nhập tay.
-- Chạy trên từng database đơn vị-năm (sau khi đã chạy 004).

CREATE TABLE TON_KHO (
    auto_num       BIGINT IDENTITY(1,1) PRIMARY KEY,
    ma_tk          NVARCHAR(10)  NOT NULL,   -- TK có cờ ton_kho trong DM_TK
    ma_chitiet     NVARCHAR(50)  NOT NULL,   -- mã hàng / mã tài sản
    ma_kho         NVARCHAR(20)  NULL,
    thang          INT           NOT NULL CHECK (thang BETWEEN 0 AND 12),
    so_luong_no    DECIMAL(18,3) NOT NULL DEFAULT 0,
    so_luong_co    DECIMAL(18,3) NOT NULL DEFAULT 0,
    ps_no          DECIMAL(18,2) NOT NULL DEFAULT 0,
    ps_co          DECIMAL(18,2) NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX UX_TON_KHO ON TON_KHO(ma_tk, ma_chitiet, thang, ma_kho);
CREATE INDEX IX_TON_KHO_chitiet ON TON_KHO(ma_chitiet);
GO

CREATE TABLE CONG_NO (
    auto_num       BIGINT IDENTITY(1,1) PRIMARY KEY,
    ma_tk          NVARCHAR(10)  NOT NULL,   -- mọi TK không phải ton_kho
    ma_chitiet     NVARCHAR(50)  NULL,       -- NULL với TK không chi tiết (111...)
    thang          INT           NOT NULL CHECK (thang BETWEEN 0 AND 12),
    ps_no          DECIMAL(18,2) NOT NULL DEFAULT 0,
    ps_co          DECIMAL(18,2) NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX UX_CONG_NO ON CONG_NO(ma_tk, thang, ma_chitiet);
GO

UPDATE SCHEMA_VERSION SET Ver = 3;
GO
