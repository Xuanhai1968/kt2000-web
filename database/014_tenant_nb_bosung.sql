-- 014_tenant_nb_bosung.sql — bổ sung cột cho bộ danh mục NB (SCHEMA_VERSION = 8)
--
-- 013 dựng khung tối thiểu. File này thêm nốt các trường mà form gốc bên Hoa_Sang có
-- nhưng khung tối thiểu chưa phủ, để bê sang cho đủ logic:
--
--   Nguồn (Hoa_Sang)              -> Ở đây
--   ---------------------------------------------------------------------------
--   Product.productCode           -> DM_HANG_NB.ma_vach     (mã vạch / mã in trên tem)
--   Product.sortName              -> DM_HANG_NB.ten_tat     (gõ tắt để tìm nhanh)
--   Product.groupId               -> DM_HANG_NB.nhom_hang
--   ProductUnit.exchangeValue     -> DM_HANG_NB.dvt_lon / he_so_lon
--   Customer.sortName             -> DM_KH_NB.ten_tat
--   Customer.receiverAddress      -> DM_KH_NB.dia_chi_giao
--
-- Cột tương ứng trên DÒNG chứng từ (he_so_qd, sl_quy_doi, la_hang_tang) nằm ở 015 —
-- dòng hàng của đơn NB là HOA_DON_LINE thuộc khuôn chung, không phải bảng riêng.
--
-- KHÔNG bê sang (chốt 05/08): nhóm cột trạng thái giao hàng của Delivery bên Hoa_Sang
-- (isPrinted/isDelivered/deliveredAt/deliveredBy/brandId). Trạng thái đơn NB đã có
-- tthai_hd trên khuôn chung, và mốc giao hàng thật là ngay_nh (BR-NB-07).
--
-- Quy đổi đơn vị (thùng/lon): SPEC-KT2000-NB mục 1 xếp "hệ số quy đổi đơn vị tính"
-- NGOÀI phạm vi v1. Ở đây chỉ dựng SẴN CỘT để không phải vá schema lần nữa khi làm
-- tới; form v1 vẫn nhập một đơn vị như cũ, he_so_qd để 1.
--
-- Chạy lại được nhiều lần. Chạy sau 013.

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

-- ===================== DM_HANG_NB =====================
IF COL_LENGTH('DM_HANG_NB', 'ten_tat') IS NULL
    ALTER TABLE DM_HANG_NB ADD ten_tat NVARCHAR(100) NULL;
GO
IF COL_LENGTH('DM_HANG_NB', 'ma_vach') IS NULL
    ALTER TABLE DM_HANG_NB ADD ma_vach NVARCHAR(50) NULL;
GO
IF COL_LENGTH('DM_HANG_NB', 'nhom_hang') IS NULL
    ALTER TABLE DM_HANG_NB ADD nhom_hang NVARCHAR(100) NULL;
GO
-- Đơn vị lớn + hệ số: 1 dvt_lon = he_so_lon × dvt. Để dành cho bản có quy đổi.
IF COL_LENGTH('DM_HANG_NB', 'dvt_lon') IS NULL
    ALTER TABLE DM_HANG_NB ADD dvt_lon NVARCHAR(50) NULL;
GO
IF COL_LENGTH('DM_HANG_NB', 'he_so_lon') IS NULL
    ALTER TABLE DM_HANG_NB ADD he_so_lon DECIMAL(18,3) NULL;
GO
IF COL_LENGTH('DM_HANG_NB', 'gia_ban_lon') IS NULL
    ALTER TABLE DM_HANG_NB ADD gia_ban_lon DECIMAL(18,2) NULL;
GO
-- Tìm theo tên tắt là thao tác gõ nhiều nhất trên form -> phải có index
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_DM_HANG_NB_ten_tat' AND object_id = OBJECT_ID('DM_HANG_NB'))
    CREATE INDEX IX_DM_HANG_NB_ten_tat ON DM_HANG_NB(ten_tat);
GO

-- ===================== DM_KH_NB =====================
IF COL_LENGTH('DM_KH_NB', 'ten_tat') IS NULL
    ALTER TABLE DM_KH_NB ADD ten_tat NVARCHAR(100) NULL;
GO
-- Địa chỉ GIAO HÀNG khác địa chỉ trên hóa đơn (Customer.receiverAddress bên Hoa_Sang)
IF COL_LENGTH('DM_KH_NB', 'dia_chi_giao') IS NULL
    ALTER TABLE DM_KH_NB ADD dia_chi_giao NVARCHAR(500) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_DM_KH_NB_ten_tat' AND object_id = OBJECT_ID('DM_KH_NB'))
    CREATE INDEX IX_DM_KH_NB_ten_tat ON DM_KH_NB(ten_tat);
GO

IF NOT EXISTS (SELECT 1 FROM SCHEMA_VERSION WHERE Ver = 8)
    INSERT INTO SCHEMA_VERSION (Ver) VALUES (8);
GO
