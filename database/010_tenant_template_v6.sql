-- 010_tenant_template_v6.sql — KHUÔN ĐẦY ĐỦ cho database đơn vị-năm (SCHEMA_VERSION = 6)
--
-- Đây là hợp nhất của 004 (v2) + 005 (v3) + 007 (v4) + 009 (v5) + vá v6, dựng một lần
-- trên database RỖNG. Trích ngược từ TUAN_NGA_2025 (database duy nhất đã dựng đủ tay)
-- nên nó là bản sao đúng của thứ đang chạy thật, không phải bản suy diễn từ script.
--
-- v6 vá gì so với 009: HOA_DON_LINE.auto_num và THU_CHI_LINE.auto_num trong 004 khai
-- BIGINT NOT NULL nhưng KHÔNG IDENTITY, trong khi Importer không hề truyền cột này —
-- mọi INSERT dòng hàng đều chết "Cannot insert the value NULL". Nay để IDENTITY(1,1).
--
-- AI CHẠY FILE NÀY: backend tự chạy (AdminService.CreateTenantDatabase) mỗi khi thêm
-- đơn vị / mở năm. Chạy tay trong SSMS cũng được — chọn đúng database rồi F5.
-- Bản thân file được nhúng vào KT2000.Api.dll lúc build (EmbeddedResource trong .csproj),
-- nên SỬA FILE NÀY = phải build lại backend. Đây là NGUỒN SỰ THẬT DUY NHẤT của
-- schema đơn vị-năm; 004/005/007/009 giữ lại chỉ để tra lịch sử.

-- BẮT BUỘC đứng riêng một mẻ và đứng đầu: HOA_DON có index trên cột tính (huong),
-- SQL Server từ chối CREATE TABLE nếu QUOTED_IDENTIFIER đang tắt. SqlClient (backend)
-- mặc định bật, nhưng sqlcmd mặc định TẮT — thiếu dòng này thì chạy tay sẽ hỏng.
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

IF OBJECT_ID('SCHEMA_VERSION') IS NULL
    CREATE TABLE SCHEMA_VERSION (
        Ver       INT       NOT NULL,
        AppliedAt DATETIME2 NOT NULL DEFAULT SYSDATETIME());
GO

-- ===================== HÓA ĐƠN (004 + 009) =====================
CREATE TABLE HOA_DON (
    ma_hd                     NVARCHAR(50)   NOT NULL,
    ngay                      DATE           NULL,
    thang                     INT            NULL,
    ngay_nh                   DATE           NULL,
    so_ptc                    NVARCHAR(20)   NULL,
    ma_kh                     NVARCHAR(50)   NULL,
    ma_tv                     NVARCHAR(20)   NULL,
    ten_tv                    NVARCHAR(200)  NULL,
    khhd                      NVARCHAR(20)   NULL,
    vat                       INT            NULL,
    tien_vat                  DECIMAL(18,2)  NULL,
    tien_ck                   DECIMAL(18,2)  NULL,
    mst                       NVARCHAR(20)   NULL,
    so_hd                     NVARCHAR(20)   NULL,
    dia_chi                   NVARCHAR(200)  NULL,
    nguoi_giao_dich           NVARCHAR(100)  NULL,
    ghi_chu                   NVARCHAR(500)  NULL,
    ghi_no                    NVARCHAR(20)   NULL,
    ghi_co                    NVARCHAR(20)   NULL,
    ghi_no_vat                DECIMAL(18,2)  NULL,
    ghi_co_vat                DECIMAL(18,2)  NULL,
    ghi_no_ck                 DECIMAL(18,2)  NULL,
    ghi_co_ck                 DECIMAL(18,2)  NULL,
    ma_ct_nck                 NVARCHAR(50)   NULL,
    ma_ct_cck                 NVARCHAR(50)   NULL,
    edit_vat                  BIT            NULL,
    edit_ck                   BIT            NULL,
    ma_ct_no                  NVARCHAR(50)   NULL,
    ma_ct_co                  NVARCHAR(50)   NULL,
    tich_chat_hd_lienquan     NVARCHAR(50)   NULL,
    loai_hd_lienquan          NVARCHAR(50)   NULL,
    mau_so_hd_lienquan        NVARCHAR(20)   NULL,
    khhd_lienquan             NVARCHAR(20)   NULL,
    sohd_lienquan             NVARCHAR(20)   NULL,
    ngay_lienquan             DATE           NULL,
    trang_thai_hd_lien_quan   NVARCHAR(50)   NULL,
    created_by                NVARCHAR(50)   NULL,
    created_at                DATETIME2      NOT NULL DEFAULT SYSDATETIME(),
    updated_by                NVARCHAR(50)   NULL,
    updated_at                DATETIME2      NULL,
    -- v5: tên đối tác nguyên văn trên HĐ + trạng thái HĐ từ TCT
    ten_kh                    NVARCHAR(500)  NULL,
    tthai_hd                  NVARCHAR(50)   NULL,
    -- Hướng: CỘT TÍNH TỰ ĐỘNG từ prefix MA_HD — không ai nạp, không thể lệch
    huong AS (CASE WHEN ma_hd LIKE N'VAO_%' THEN N'VAO'
                   WHEN ma_hd LIKE N'RA_%'  THEN N'RA' END) PERSISTED,
    CONSTRAINT PK_HOA_DON PRIMARY KEY (ma_hd)
);
GO
CREATE INDEX IX_HOA_DON_ngay  ON HOA_DON(ngay);
CREATE INDEX IX_HOA_DON_ma_kh ON HOA_DON(ma_kh);
CREATE INDEX IX_HOA_DON_so_hd ON HOA_DON(so_hd);
CREATE INDEX IX_HOA_DON_huong ON HOA_DON(huong, thang);
CREATE INDEX IX_HOA_DON_tthai ON HOA_DON(tthai_hd);
-- BR-HD-01: lưới đỡ danh tính tự nhiên (khhd lưu dạng GHÉP kiểu+ký hiệu)
CREATE UNIQUE INDEX UX_HOA_DON_BR01 ON HOA_DON(huong, mst, khhd, so_hd);
GO

CREATE TABLE HOA_DON_LINE (
    ma_hd                     NVARCHAR(50)   NULL,
    stt_line                  INT            NULL,
    ma_hang                   NVARCHAR(50)   NULL,
    ma_dvt                    NVARCHAR(20)   NULL,
    dvt                       NVARCHAR(50)   NULL,
    sl_qd                     DECIMAL(18,3)  NULL,
    sl_le                     DECIMAL(18,3)  NULL,
    dg_qd                     DECIMAL(18,2)  NULL,
    dg_in                     DECIMAL(18,2)  NULL,
    so_luong                  DECIMAL(18,3)  NULL,
    don_gia                   DECIMAL(18,2)  NULL,
    gia_von                   DECIMAL(18,2)  NULL,
    ghi_chu                   NVARCHAR(500)  NULL,
    ghi_no                    NVARCHAR(20)   NULL,
    ghi_co                    NVARCHAR(20)   NULL,
    ma_tv                     NVARCHAR(20)   NULL,
    ma_ct_no                  NVARCHAR(50)   NULL,
    ma_ct_co                  NVARCHAR(50)   NULL,
    pt_ck                     DECIMAL(18,3)  NULL,
    tien_ck                   DECIMAL(18,2)  NULL,
    dg_tt                     BIT            NULL,
    pt_vat                    DECIMAL(18,3)  NULL,
    tien_vat_l                DECIMAL(18,2)  NULL,
    quy_cach                  NVARCHAR(200)  NULL,
    tinh_chat                 NVARCHAR(10)   NULL,
    ma_ngan                   NVARCHAR(100)  NULL,
    is_predict                BIT            NULL,
    dk_goc                    NVARCHAR(50)   NULL,
    good_pred                 BIT            NULL,
    is_pred_hh                BIT            NULL,
    pred_hh_ok                BIT            NULL,
    proba                     FLOAT          NULL,
    created_by                NVARCHAR(50)   NULL,
    created_at                DATETIME2      NOT NULL DEFAULT SYSDATETIME(),
    updated_by                NVARCHAR(50)   NULL,
    updated_at                DATETIME2      NULL,
    -- v5: bộ "sự thật gốc" của dòng hàng (nguyên liệu TIM_TEN_HANG)
    ten_hang_goc              NVARCHAR(500)  NULL,
    -- v6: IDENTITY — Importer không truyền cột này
    auto_num                  BIGINT         IDENTITY(1,1) NOT NULL,
    CONSTRAINT PK_HOA_DON_LINE PRIMARY KEY (auto_num),
    CONSTRAINT FK_HOA_DON_LINE_HOA_DON FOREIGN KEY (ma_hd) REFERENCES HOA_DON(ma_hd)
);
GO
CREATE INDEX IX_HOA_DON_LINE_ma_hd   ON HOA_DON_LINE(ma_hd);
CREATE INDEX IX_HOA_DON_LINE_ma_hang ON HOA_DON_LINE(ma_hang);
GO

-- ===================== THU / CHI (004) =====================
CREATE TABLE THU_CHI (
    ma_tv                     NVARCHAR(20)   NULL,
    ma_phieu                  NVARCHAR(50)   NOT NULL,
    ngay                      DATE           NULL,
    ma_ct_co                  NVARCHAR(50)   NULL,
    ghi_no                    NVARCHAR(20)   NULL,
    ghi_co                    NVARCHAR(20)   NULL,
    so_tien                   DECIMAL(18,2)  NULL,
    ghi_chu                   NVARCHAR(500)  NULL,
    ma_ct_no                  NVARCHAR(50)   NULL,
    has_line                  BIT            NULL,
    created_by                NVARCHAR(50)   NULL,
    created_at                DATETIME2      NOT NULL DEFAULT SYSDATETIME(),
    updated_by                NVARCHAR(50)   NULL,
    updated_at                DATETIME2      NULL,
    CONSTRAINT PK_THU_CHI PRIMARY KEY (ma_phieu)
);
GO
CREATE INDEX IX_THU_CHI_ngay   ON THU_CHI(ngay);
CREATE INDEX IX_THU_CHI_ghi_no ON THU_CHI(ghi_no);
CREATE INDEX IX_THU_CHI_ghi_co ON THU_CHI(ghi_co);
GO

CREATE TABLE THU_CHI_LINE (
    ma_phieu                  NVARCHAR(50)   NULL,
    stt_line                  INT            NULL,
    ma_hang                   NVARCHAR(50)   NULL,
    dvt                       NVARCHAR(50)   NULL,
    so_luong                  DECIMAL(18,3)  NULL,
    don_gia                   DECIMAL(18,2)  NULL,
    ghi_chu                   NVARCHAR(500)  NULL,
    ghi_no                    NVARCHAR(20)   NULL,
    ghi_co                    NVARCHAR(20)   NULL,
    ma_tv                     NVARCHAR(20)   NULL,
    ma_ct_no                  NVARCHAR(50)   NULL,
    ma_ct_co                  NVARCHAR(50)   NULL,
    created_by                NVARCHAR(50)   NULL,
    created_at                DATETIME2      NOT NULL DEFAULT SYSDATETIME(),
    updated_by                NVARCHAR(50)   NULL,
    updated_at                DATETIME2      NULL,
    -- v6: IDENTITY, cùng lý do với HOA_DON_LINE
    auto_num                  BIGINT         IDENTITY(1,1) NOT NULL,
    CONSTRAINT PK_THU_CHI_LINE PRIMARY KEY (auto_num),
    CONSTRAINT FK_THU_CHI_LINE_THU_CHI FOREIGN KEY (ma_phieu) REFERENCES THU_CHI(ma_phieu)
);
GO
CREATE INDEX IX_THU_CHI_LINE_ma_phieu ON THU_CHI_LINE(ma_phieu);
GO

-- ===================== TỒN KHO / CÔNG NỢ (005) =====================
-- Bảng dẫn xuất, tính bị động: dòng tháng N = LŨY KẾ từ đầu năm (tồn/dư đầu ở tháng 0).
-- Dữ liệu do nút "Tính lại cả năm" sinh từ HOA_DON/THU_CHI — không nhập tay.
CREATE TABLE TON_KHO (
    auto_num       BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    ma_tk          NVARCHAR(10)  NOT NULL,   -- TK có cờ ton_kho trong DM_TK
    ma_chitiet     NVARCHAR(50)  NOT NULL,   -- mã hàng / mã tài sản
    ma_kho         NVARCHAR(20)  NULL,
    thang          INT           NOT NULL CHECK (thang BETWEEN 0 AND 12),
    so_luong_no    DECIMAL(18,3) NOT NULL DEFAULT 0,
    so_luong_co    DECIMAL(18,3) NOT NULL DEFAULT 0,
    ps_no          DECIMAL(18,2) NOT NULL DEFAULT 0,
    ps_co          DECIMAL(18,2) NOT NULL DEFAULT 0
);
GO
CREATE UNIQUE INDEX UX_TON_KHO ON TON_KHO(ma_tk, ma_chitiet, thang, ma_kho);
CREATE INDEX IX_TON_KHO_chitiet ON TON_KHO(ma_chitiet);
GO

CREATE TABLE CONG_NO (
    auto_num       BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    ma_tk          NVARCHAR(10)  NOT NULL,   -- mọi TK không phải ton_kho
    ma_chitiet     NVARCHAR(50)  NULL,       -- NULL với TK không chi tiết (111...)
    thang          INT           NOT NULL CHECK (thang BETWEEN 0 AND 12),
    ps_no          DECIMAL(18,2) NOT NULL DEFAULT 0,
    ps_co          DECIMAL(18,2) NOT NULL DEFAULT 0
);
GO
CREATE UNIQUE INDEX UX_CONG_NO ON CONG_NO(ma_tk, thang, ma_chitiet);
GO

-- ===================== ĐỐI CHIẾU BẢN GỐC TCT (007) =====================
CREATE TABLE IN_VALUE (
    ma_input     NVARCHAR(20)  NOT NULL PRIMARY KEY,   -- IP1, IP2...
    thang        INT           NOT NULL CHECK (thang BETWEEN 1 AND 12),
    loai_ct      NVARCHAR(5)   NOT NULL,               -- V = vào, R = ra
    input_from   NVARCHAR(30)  NOT NULL,               -- TO_KHAI / TCT_CM / TCT_KM / TCT_MTT...
    tong_value   DECIMAL(18,2) NOT NULL DEFAULT 0,
    tong_vat     DECIMAL(18,2) NOT NULL DEFAULT 0,
    tang_vat     DECIMAL(18,2) NOT NULL DEFAULT 0,
    giam_vat     DECIMAL(18,2) NOT NULL DEFAULT 0,
    tang_value   DECIMAL(18,2) NOT NULL DEFAULT 0,
    giam_value   DECIMAL(18,2) NOT NULL DEFAULT 0,
    ke_khai      NVARCHAR(10)  NULL,                   -- Thang / Quy
    created_by   NVARCHAR(50)  NULL,
    created_at   DATETIME2     NOT NULL DEFAULT SYSDATETIME(),
    updated_by   NVARCHAR(50)  NULL,
    updated_at   DATETIME2     NULL
);
GO
CREATE INDEX IX_IN_VALUE_thang ON IN_VALUE(thang, loai_ct);
GO

CREATE TABLE IN_VALUE_LINE (
    ma_input     NVARCHAR(20)  NOT NULL REFERENCES IN_VALUE(ma_input),
    line_num     NVARCHAR(20)  NOT NULL,               -- L1, L2...
    stt          INT           NULL,
    khhd         NVARCHAR(20)  NULL,
    so_hd        NVARCHAR(20)  NULL,
    ngay         DATE          NULL,
    mst          NVARCHAR(20)  NULL,                   -- MST đối tác (BR-HD-01 dùng cột này)
    ten_kh       NVARCHAR(500) NULL,
    value1       DECIMAL(18,2) NOT NULL DEFAULT 0,     -- tiền hàng theo TCT
    tax          DECIMAL(18,2) NOT NULL DEFAULT 0,     -- VAT theo TCT
    ck           DECIMAL(18,2) NOT NULL DEFAULT 0,
    ma_hd        NVARCHAR(80)  NULL,                   -- link sang HOA_DON khi khớp (NULL = chưa khớp!)
    checked      BIT           NOT NULL DEFAULT 0,
    ghi_chu_m    NVARCHAR(200) NULL,                   -- 'Hóa đơn mới' / trạng thái đối chiếu
    ghi_chu      NVARCHAR(500) NULL,
    old_value    DECIMAL(18,2) NOT NULL DEFAULT 0,
    old_vat      DECIMAL(18,2) NOT NULL DEFAULT 0,
    created_by   NVARCHAR(50)  NULL,
    created_at   DATETIME2     NOT NULL DEFAULT SYSDATETIME(),
    CONSTRAINT PK_IN_VALUE_LINE PRIMARY KEY (ma_input, line_num)
);
GO
CREATE INDEX IX_IVL_hd   ON IN_VALUE_LINE(khhd, so_hd, mst);
CREATE INDEX IX_IVL_mahd ON IN_VALUE_LINE(ma_hd);
GO

DELETE FROM SCHEMA_VERSION;
INSERT INTO SCHEMA_VERSION (Ver) VALUES (6);
GO
