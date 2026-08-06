-- 013_tenant_nb_donhang.sql — DANH MỤC nội bộ (NB) cho database đơn vị-năm (SCHEMA_VERSION = 7)
--
-- Dựng 2 bảng danh mục riêng của tenant NB:
--   DM_KH_NB    — danh mục ĐỐI TƯỢNG CÔNG NỢ: khách + toàn bộ nhân viên  (BR-NB-01)
--   DM_HANG_NB  — hàng của riêng tenant NB                               (BR-NB-02)
--
-- CHỨNG TỪ ĐƠN HÀNG KHÔNG NẰM Ở ĐÂY. SPEC mục 4 (chốt v0.3) dùng chung khuôn
-- HOA_DON/HOA_DON_LINE cho đơn hàng NB, KHÔNG dựng DON_HANG riêng. Ba cột thêm vào
-- khuôn chung (ma_nvkd/ma_nvvc/ma_goi) và bộ bảng gói hàng nằm ở 015.
--
-- VÌ SAO KHÔNG CÒN DON_HANG (bản trước file này từng dựng): lập luận cũ là "khóa
-- tự nhiên BR-HD-01 (huong+mst+khhd+so_hd) sẽ vỡ vì đơn NB không có mst/khhd/so_hd".
-- Lập luận đó SAI: index UX_HOA_DON_BR01 là UNIQUE thường, mà SQL Server coi mỗi NULL
-- là một giá trị KHÁC nhau, nên N đơn NB với cả ba cột NULL cùng tồn tại vô tư.
-- Đổi lại được cái lớn hơn nhiều: TON_KHO, CONG_NO và engine định khoản chạy MỘT
-- đường code cho cả hai sản phẩm (AD-NB-10), khuôn template vẫn là MỘT (luật #6).
--
-- VÌ SAO CÓ HẬU TỐ _NB: KT2000_Base đã có DM_KH và DM_HANG với cấu trúc khác hẳn.
-- Trùng tên khác cấu trúc là bẫy query nhầm CHẠY ÊM — không lỗi, chỉ ra số sai.
--
-- AI CHẠY FILE NÀY: chạy cho MỌI tenant (bảng rỗng vô hại với tenant thuế — AD-NB-09).
-- Chạy tay trong SSMS: chọn đúng database đơn vị-năm rồi F5. Chạy lại được nhiều lần
-- (mọi lệnh đều bọc IF OBJECT_ID) nên không sợ lỡ tay chạy hai lần.
--
-- QUY ƯỚC ĐẶT TÊN: y hệt 010 — snake_case tiếng Việt không dấu, khóa chính là mã chuỗi
-- do người dùng/hệ thống sinh (KHÔNG dùng Guid như Hoa_Sang), dòng chi tiết dùng
-- IDENTITY(1,1) ngay từ đầu (bài học v6: quên IDENTITY là mọi INSERT chết NULL).

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

-- ===================== DM_KH_NB — danh mục ĐỐI TƯỢNG CÔNG NỢ =====================
-- BR-NB-01: bảng này KHÔNG chỉ chứa khách. Nó chứa mọi ĐỐI TƯỢNG có thể mang công nợ,
-- gồm cả TOÀN BỘ nhân viên công ty — phân biệt bằng cột loai_dt.
--
-- Lý do thực địa (chốt v0.4): tạm ứng/chi lương, NV ứng tiền mua hàng, sửa xe, và nợ
-- đơn hàng chuyển từ khách sang NV — tất cả phải lên chung một bảng tổng hợp công nợ.
-- Gộp về một danh mục thì CONG_NO chỉ cần MỘT cột đối tượng (ma_chitiet trỏ về đây)
-- cho mọi loại nợ. Đây đúng là chỗ bản VFP chưa làm được.
--
-- Vì vậy KHÔNG có bảng DM_NV_NB riêng: ma_nvkd/ma_nvvc trên HOA_DON trỏ về dòng
-- loai_dt='NV' của chính bảng này (chốt 9.7).
IF OBJECT_ID('DM_KH_NB') IS NULL
CREATE TABLE DM_KH_NB (
    ma_kh        NVARCHAR(50)   NOT NULL,
    ten_kh       NVARCHAR(500)  NOT NULL,
    -- BR-NB-01: loại đối tượng. KH = khách hàng, NV = nhân viên công ty.
    -- Để NVARCHAR chứ không BIT vì SPEC ghi rõ "mở rộng được" (mai này có NCC, DOI_TAC...).
    -- CHECK cố tình KHÔNG đặt: thêm loại mới sẽ phải ALTER, trong khi combobox lọc
    -- theo giá trị nào là việc của tầng ứng dụng.
    loai_dt      NVARCHAR(10)   NOT NULL DEFAULT N'KH',
    -- Tên phục vụ NGƯỜI GIAO HÀNG (BR-NB-01) — được phép khác tên trên hóa đơn VAT
    -- (vd "Chị Kim chợ đầu mối"). Đây mới là tên hiện trên phiếu giao hàng.
    ten_giao_dich NVARCHAR(500) NULL,
    mst          NVARCHAR(20)   NULL,
    dia_chi      NVARCHAR(500)  NULL,
    dien_thoai   NVARCHAR(50)   NULL,
    nguoi_lien_he NVARCHAR(200) NULL,
    -- BR-NB-01: mã khách bên sổ THUẾ tương ứng — KHÔNG bắt buộc, để dành luồng
    -- đơn hàng NB -> hóa đơn RA sau này. Không có FK: khác database.
    ma_kh_hd     NVARCHAR(50)   NULL,
    cong_no_dau  DECIMAL(18,2)  NULL,
    ghi_chu      NVARCHAR(500)  NULL,
    ngung_dung   BIT            NOT NULL DEFAULT 0,
    created_by   NVARCHAR(50)   NULL,
    created_at   DATETIME2      NOT NULL DEFAULT SYSDATETIME(),
    updated_by   NVARCHAR(50)   NULL,
    updated_at   DATETIME2      NULL,
    CONSTRAINT PK_DM_KH_NB PRIMARY KEY (ma_kh)
);
GO
-- Chạy lại file được: index đã có thì bỏ qua (kiểm tra qua sys.indexes).
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_DM_KH_NB_ten' AND object_id = OBJECT_ID('DM_KH_NB'))
    CREATE INDEX IX_DM_KH_NB_ten ON DM_KH_NB(ten_kh);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_DM_KH_NB_mst' AND object_id = OBJECT_ID('DM_KH_NB'))
    CREATE INDEX IX_DM_KH_NB_mst ON DM_KH_NB(mst);
-- Combobox chọn NVKD/NVVC lọc loai_dt='NV' — ít dòng, phải nhanh (BR-NB-01)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_DM_KH_NB_loai' AND object_id = OBJECT_ID('DM_KH_NB'))
    CREATE INDEX IX_DM_KH_NB_loai ON DM_KH_NB(loai_dt, ten_kh);
GO

-- ===================== DM_HANG_NB — hàng hóa của NB =====================
-- BR-NB-02: danh mục của ai người nấy giữ. Chọn từ từ điển thuế = CHÉP về đây
-- (không tham chiếu sống), giữ vết bằng ma_hang_thue; đơn vị sản xuất gõ tay để trống.
IF OBJECT_ID('DM_HANG_NB') IS NULL
CREATE TABLE DM_HANG_NB (
    ma_hang      NVARCHAR(50)   NOT NULL,
    ten_hang     NVARCHAR(500)  NOT NULL,
    dvt          NVARCHAR(50)   NULL,          -- sửa được trên bản ghi NB (mua thùng bán lon)
    quy_cach     NVARCHAR(200)  NULL,
    -- Giá mặc định: đơn bán lấy gia_ban, phiếu nhập lấy gia_mua làm đơn giá gợi ý.
    -- v1 gõ giá tay (chốt 9.6) — đây chỉ là số mồi, chính sách giá tách SPEC riêng.
    gia_ban      DECIMAL(18,2)  NULL,
    gia_mua      DECIMAL(18,2)  NULL,
    pt_vat       DECIMAL(18,3)  NULL,          -- % VAT mặc định của mặt hàng
    ma_ngan      NVARCHAR(100)  NULL,          -- mã ngành/nhóm, chép từ sổ thuế nếu có
    -- BR-NB-02: mã hàng bên sổ THUẾ đã chép về. Không FK: khác database, và bên thuế
    -- dọn mã cũng không được làm biến hình đơn NB đã lập.
    ma_hang_thue NVARCHAR(50)   NULL,
    ton_dau      DECIMAL(18,3)  NULL,
    ngung_dung   BIT            NOT NULL DEFAULT 0,
    ghi_chu      NVARCHAR(500)  NULL,
    created_by   NVARCHAR(50)   NULL,
    created_at   DATETIME2      NOT NULL DEFAULT SYSDATETIME(),
    updated_by   NVARCHAR(50)   NULL,
    updated_at   DATETIME2      NULL,
    CONSTRAINT PK_DM_HANG_NB PRIMARY KEY (ma_hang)
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_DM_HANG_NB_ten' AND object_id = OBJECT_ID('DM_HANG_NB'))
    CREATE INDEX IX_DM_HANG_NB_ten ON DM_HANG_NB(ten_hang);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_DM_HANG_NB_thue' AND object_id = OBJECT_ID('DM_HANG_NB'))
    CREATE INDEX IX_DM_HANG_NB_thue ON DM_HANG_NB(ma_hang_thue);
GO

-- Ghi mốc schema. SCHEMA_VERSION là bảng nhiều dòng (mỗi lần vá thêm một dòng).
IF NOT EXISTS (SELECT 1 FROM SCHEMA_VERSION WHERE Ver = 7)
    INSERT INTO SCHEMA_VERSION (Ver) VALUES (7);
GO
