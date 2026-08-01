-- 004_tenant_schema_v2.sql — Khuôn schema v2 cho database đơn vị-năm
-- Sinh từ bảng rà soát Leader duyệt 29/07/2026 + biên bản xử lý HỎI LẠI (docs/BienBan_RaSoat.md)
-- Cách chạy: trong SSMS chọn đúng database (TUAN_NGA_2025, TUAN_NGA_2026...) rồi F5 toàn file.
-- Bộ tứ audit created/updated_by/at do BACKEND tự điền từ claim login_name — thay 10 cột vết VFP.

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
    CONSTRAINT PK_HOA_DON PRIMARY KEY (ma_hd)
);
CREATE INDEX IX_HOA_DON_ngay ON HOA_DON(ngay);
CREATE INDEX IX_HOA_DON_ma_kh ON HOA_DON(ma_kh);
CREATE INDEX IX_HOA_DON_so_hd ON HOA_DON(so_hd);
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
    auto_num                  BIGINT         NOT NULL,
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
    CONSTRAINT PK_HOA_DON_LINE PRIMARY KEY (auto_num)
    ,CONSTRAINT FK_HOA_DON_LINE_HOA_DON FOREIGN KEY (ma_hd) REFERENCES HOA_DON(ma_hd)
);
CREATE INDEX IX_HOA_DON_LINE_ma_hd ON HOA_DON_LINE(ma_hd);
CREATE INDEX IX_HOA_DON_LINE_ma_hang ON HOA_DON_LINE(ma_hang);
GO

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
CREATE INDEX IX_THU_CHI_ngay ON THU_CHI(ngay);
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
    auto_num                  BIGINT         NOT NULL,
    ma_ct_no                  NVARCHAR(50)   NULL,
    ma_ct_co                  NVARCHAR(50)   NULL,
    created_by                NVARCHAR(50)   NULL,
    created_at                DATETIME2      NOT NULL DEFAULT SYSDATETIME(),
    updated_by                NVARCHAR(50)   NULL,
    updated_at                DATETIME2      NULL,
    CONSTRAINT PK_THU_CHI_LINE PRIMARY KEY (auto_num)
    ,CONSTRAINT FK_THU_CHI_LINE_THU_CHI FOREIGN KEY (ma_phieu) REFERENCES THU_CHI(ma_phieu)
);
CREATE INDEX IX_THU_CHI_LINE_ma_phieu ON THU_CHI_LINE(ma_phieu);
GO

UPDATE SCHEMA_VERSION SET Ver = 2;
GO