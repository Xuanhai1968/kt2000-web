-- 015_tenant_nb.sql — TOÀN BỘ khuôn NỘI BỘ (SCHEMA_VERSION = 9)
--
-- File này GỘP năm script NB rời trước đây thành một, chạy đúng một lượt là đủ khuôn:
--     016_master_linked_tenant.sql -> phần 0  (Master: cột LinkedTenantCode)
--     013_tenant_nb_donhang.sql    -> phần 1  (DM_KH_NB, DM_HANG_NB)
--     014_tenant_nb_bosung.sql     -> phần 2  (cột bổ sung cho hai danh mục)
--     015_nb_hoadon_goi.sql        -> phần 3-5, 7 (vá khuôn chung + GOI_HD/GOI_HD_LINE)
--     017_goi_hd_line_tri_gia.sql  -> phần 6  (cột tri_gia, gộp thẳng vào CREATE TABLE)
--
-- VÌ SAO GỘP: các file phải chạy đúng thứ tự mới ra khuôn đúng (014 sửa bảng của 013,
-- 017 sửa bảng của 015). Tách rời thì thứ tự nằm ở chỗ khác — trong danh sách của
-- AdminService.ApplyNbTables() — nên đọc file không thấy, mà xếp nhầm thì lỗi câm.
-- Gộp lại thì thứ tự nằm ngay trong file, đọc từ trên xuống là ra.
--
-- ============================ HAI DATABASE TRONG MỘT FILE ============================
-- CẨN THẬN khi sửa file này: phần 0 tác động lên KT2000_Master, các phần còn lại lên
-- database ĐƠN VỊ-NĂM. AdminService gọi file này kèm tiền tố "USE [<db đơn vị>]" nên
-- KHÔNG viết "USE KT2000_Master" được — nó sẽ bị tiền tố kia ghi đè và cột rơi nhầm vào
-- database đơn vị. Phần 0 vì vậy chỉ tên database ngay trong lệnh (KT2000_Master.dbo...)
-- và bọc trong sp_executesql để không đổi ngữ cảnh của cả mẻ.
--
-- ============================ CHỈ CHẠY CHO ĐƠN VỊ NỘI BỘ ============================
-- QUAN TRỌNG — đây là thay đổi so với bản cũ. Trước đây file NB chạy cho MỌI đơn vị
-- theo AD-NB-09 ("bảng rỗng vô hại với tenant thuế"). Thực tế KHÔNG vô hại:
--   - HOA_DON của sổ thuế phình thêm 3 cột, HOA_DON_LINE thêm 4 cột, chẳng ai ghi.
--   - Cột tính `huong` bị đổi định nghĩa sang dạng nhận cả mã đơn NB.
--   - Lẫn ranh giới hai sổ (luật 9).
-- Nay AdminService.CreateTenantDatabase(code, year, laNoiBo) chỉ gọi khuôn này khi
-- laNoiBo = true. Database thuế đã lỡ nhiễm thì đã dọn xong ngày 12/08/2026 — câu lệnh
-- dọn lưu tại docs/TACH-KHUON-THUE-VA-NOI-BO.md (chạy một lần, không giữ trong database/).
--
-- ============================ NGỮ NGHĨA CỘT VỚI ĐƠN NB ============================
--   ma_hd    = SỐ ĐƠN hiển thị/in, kiểu V125 / R236 (chốt 9.7)
--   so_hd    } vô nghĩa với NB — LUÔN TRỐNG (SPEC mục 4)
--   khhd     }
--   mst      }
--   ngay_nh  = ngày hàng THẬT SỰ rời kho (BR-NB-07) — mốc trừ tồn/tính giá vốn.
--              Tạo đơn CHƯA trừ kho; thủ kho đánh ngay_nh thì engine mới trừ.
--   tthai_hd = bộ trạng thái đơn NB
--
-- Đơn hàng NB KHÔNG có bảng riêng — dùng chung khuôn HOA_DON/HOA_DON_LINE (SPEC mục 4,
-- chốt v0.3). Đổi lại: TON_KHO, CONG_NO và engine định khoản chạy MỘT đường code cho
-- cả hai sản phẩm (AD-NB-10), khuôn template vẫn là MỘT (luật #6).
--
-- VÌ SAO DANH MỤC CÓ HẬU TỐ _NB: KT2000_Base đã có DM_KH và DM_HANG với cấu trúc khác
-- hẳn. Trùng tên khác cấu trúc là bẫy query nhầm CHẠY ÊM — không lỗi, chỉ ra số sai.
--
-- Chạy sau 010 (khuôn chung). Chạy lại được nhiều lần (mọi lệnh đều bọc IF).

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

-- ###########################################################################
-- PHẦN 0 — MASTER: cột LinkedTenantCode   (nguồn: 016_master_linked_tenant.sql)
--
-- SỢI DÂY DUY NHẤT nối hai thế giới: tenant NB trỏ về tenant thuế tương ứng
--     TUAN_NGA_NB  ->  TUAN_NGA
--
-- Dùng cho BR-NB-03 (tra cứu xuyên DB): endpoint tra tên hàng đọc claim tenant_code
-- của phiên NB, tra sang đây lấy mã tenant thuế, rồi mới mở database thuế để SELECT.
-- Không có cột này thì không có cách nào biết tenant NB được phép nhìn sổ của ai —
-- và ghép chuỗi tên tenant thành tên DB là vi phạm BR-DB-01/resolver-only.
--
-- LƯU Ý: đây là MÃ tenant (Code), không phải Id. Cố ý: mã đọc được bằng mắt khi soi
-- bảng Tenants, và resolver vốn nhận vào mã chứ không nhận Guid.
--
-- Không đặt FK về chính Tenants(Code): Code là UNIQUE nên FK khả thi về mặt kỹ thuật,
-- nhưng tenant NB có thể được đăng ký TRƯỚC tenant thuế liên kết (dựng môi trường thử,
-- hoặc khách dùng NB trước rồi mới làm thuế). FK sẽ chặn oan thứ tự đó. Ràng buộc thật
-- nằm ở tầng ứng dụng: AdminService kiểm tra mã tồn tại lúc gán.
--
-- Chỉ tên database ngay trong lệnh thay vì USE — xem ghi chú "HAI DATABASE TRONG MỘT
-- FILE" ở đầu file.
-- ###########################################################################

IF COL_LENGTH('KT2000_Master.dbo.Tenants', 'LinkedTenantCode') IS NULL
    EXEC KT2000_Master.sys.sp_executesql
        N'ALTER TABLE dbo.Tenants ADD LinkedTenantCode NVARCHAR(30) NULL;';
GO

-- Tra ngược "tenant NB nào đang trỏ vào tenant thuế này" — dùng khi xóa/đổi mã tenant
IF NOT EXISTS (SELECT 1 FROM KT2000_Master.sys.indexes
                WHERE name = 'IX_Tenants_LinkedTenantCode'
                  AND object_id = OBJECT_ID('KT2000_Master.dbo.Tenants'))
    EXEC KT2000_Master.sys.sp_executesql
        N'CREATE INDEX IX_Tenants_LinkedTenantCode ON dbo.Tenants(LinkedTenantCode);';
GO

-- ###########################################################################
-- PHẦN 1 — DANH MỤC NB          (nguồn: 013_tenant_nb_donhang.sql)
-- ###########################################################################

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

-- ###########################################################################
-- PHẦN 2 — CỘT BỔ SUNG CHO DANH MỤC   (nguồn: 014_tenant_nb_bosung.sql)
--
-- Bê nốt các trường form gốc bên Hoa_Sang có mà khung tối thiểu ở phần 1 chưa phủ:
--   Product.productCode       -> DM_HANG_NB.ma_vach      (mã vạch / mã in trên tem)
--   Product.sortName          -> DM_HANG_NB.ten_tat      (gõ tắt để tìm nhanh)
--   Product.groupId           -> DM_HANG_NB.nhom_hang
--   ProductUnit.exchangeValue -> DM_HANG_NB.dvt_lon / he_so_lon
--   Customer.sortName         -> DM_KH_NB.ten_tat
--   Customer.receiverAddress  -> DM_KH_NB.dia_chi_giao
--
-- KHÔNG bê sang (chốt 05/08): nhóm cột trạng thái giao hàng của Delivery bên Hoa_Sang
-- (isPrinted/isDelivered/deliveredAt/deliveredBy/brandId). Trạng thái đơn NB đã có
-- tthai_hd trên khuôn chung, và mốc giao hàng thật là ngay_nh (BR-NB-07).
-- ###########################################################################

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

-- ###########################################################################
-- PHẦN 3-5 — VÁ KHUÔN CHUNG CHO ĐƠN NB   (nguồn: 015_nb_hoadon_goi.sql)
-- ###########################################################################

-- ===================== 1. Ba cột mới trên khuôn HOA_DON =====================
-- BR-NB-01: nhân viên KHÔNG có bảng riêng — hai cột này trỏ về dòng loai_dt='NV'
-- trong DM_KH_NB. Không đặt FK: khuôn này còn chạy cho tenant thuế (nơi DM_KH_NB
-- rỗng), FK sẽ chặn oan mọi hóa đơn thuế có lỡ điền.
IF COL_LENGTH('HOA_DON', 'ma_nvkd') IS NULL
    ALTER TABLE HOA_DON ADD ma_nvkd NVARCHAR(50) NULL;   -- NV kinh doanh: ai order
GO
IF COL_LENGTH('HOA_DON', 'ma_nvvc') IS NULL
    ALTER TABLE HOA_DON ADD ma_nvvc NVARCHAR(50) NULL;   -- NV vận chuyển: ai giao
GO
-- BR-NB-08: đơn thuộc gói nào. Mỗi đơn thuộc TỐI ĐA MỘT gói (một đơn không lên hai xe)
-- — chính vì vậy thành viên gói là MỘT CỘT ở đây, không phải bảng danh sách riêng.
IF COL_LENGTH('HOA_DON', 'ma_goi') IS NULL
    ALTER TABLE HOA_DON ADD ma_goi NVARCHAR(50) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_HOA_DON_ma_goi' AND object_id = OBJECT_ID('HOA_DON'))
    CREATE INDEX IX_HOA_DON_ma_goi ON HOA_DON(ma_goi);
-- Lọc đơn theo người giao trong ngày là truy vấn thường trực của màn hình gói
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_HOA_DON_ma_nvvc' AND object_id = OBJECT_ID('HOA_DON'))
    CREATE INDEX IX_HOA_DON_ma_nvvc ON HOA_DON(ma_nvvc, ngay_nh);
GO

-- ===================== 2. Mở rộng cột tính huong cho đơn NB =====================
-- Khuôn 010 định nghĩa: VAO_% -> VAO, RA_% -> RA. Số đơn NB kiểu V125/R236 không khớp
-- prefix nào nên rơi vào NULL — mà IX_HOA_DON_huong và UX_HOA_DON_BR01 đều dựa vào cột
-- này, đơn NB sẽ nằm ngoài mọi truy vấn lọc theo hướng.
--
-- Sửa cột tính = phải DROP hai index phụ thuộc rồi dựng lại. Bọc trong kiểm tra
-- "đã vá chưa" để chạy lại file lần hai không đụng gì — QUAN TRỌNG vì khối này đập
-- và dựng lại UX_HOA_DON_BR01 trên bảng hóa đơn thuế đang chạy thật.
--
-- Dấu nhận biết bản ĐÃ VÁ: định nghĩa có chuỗi '[0-9]' (chỉ bản mới mới dùng).
-- CẨN THẬN VỚI LIKE: '[' và ']' là ký tự đặc biệt của LIKE nên phải ESCAPE, và
-- '[_]' KHÔNG có nghĩa "chữ V rồi chữ số" mà là "V rồi dấu gạch dưới" — dùng nhầm
-- thì guard luôn sai, khối này chạy lại mỗi lần mở năm.
-- ĐIỀU KIỆN CỬA: chỉ đụng vào khi HOA_DON chưa có hóa đơn THUẾ nào.
-- Hóa đơn thuế nhận ra bằng prefix VAO_/RA_ do ImportService sinh. Database thuế đang
-- chạy thật (TUAN_NGA_2025...) luôn có sẵn hàng nghìn dòng như vậy -> KHÔNG vào khối này,
-- index và cột tính của sổ thuế giữ nguyên si, không có chuyện rebuild index lúc mở năm.
-- Database NB thì rỗng phần thuế -> vào bình thường.
IF NOT EXISTS (SELECT 1 FROM HOA_DON WHERE ma_hd LIKE N'VAO[_]%' OR ma_hd LIKE N'RA[_]%')
AND (
    -- Cột tính đã nhận V/R chưa?
    NOT EXISTS (
        SELECT 1 FROM sys.computed_columns c
        WHERE c.object_id = OBJECT_ID('HOA_DON') AND c.name = 'huong'
          AND c.definition LIKE N'%\[0-9\]%' ESCAPE N'\')
    -- ...hoặc index còn chưa có bộ lọc (database vá dở bản 05/08)?
    OR EXISTS (
        SELECT 1 FROM sys.indexes i
        WHERE i.object_id = OBJECT_ID('HOA_DON') AND i.name = 'UX_HOA_DON_BR01'
          AND i.has_filter = 0)
)
BEGIN
    -- Hai index này dựa trên cột huong -> phải bỏ trước khi sửa cột
    IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_HOA_DON_BR01' AND object_id = OBJECT_ID('HOA_DON'))
        DROP INDEX UX_HOA_DON_BR01 ON HOA_DON;
    IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_HOA_DON_huong' AND object_id = OBJECT_ID('HOA_DON'))
        DROP INDEX IX_HOA_DON_huong ON HOA_DON;

    -- Chỉ dựng lại cột tính khi nó THẬT SỰ còn cũ. Khối này cũng chạy cho database
    -- chỉ thiếu mỗi bộ lọc trên index — khi đó cột đã đúng, DROP COLUMN sẽ thừa.
    IF NOT EXISTS (
        SELECT 1 FROM sys.computed_columns c
        WHERE c.object_id = OBJECT_ID('HOA_DON') AND c.name = 'huong'
          AND c.definition LIKE N'%\[0-9\]%' ESCAPE N'\')
    BEGIN
        ALTER TABLE HOA_DON DROP COLUMN huong;

        -- VAO_/RA_ = hóa đơn thuế (giữ nguyên). V/R + chữ số = đơn hàng NB (chốt 9.7).
        -- Vẫn PERSISTED và vẫn tự suy từ ma_hd: không ai nạp nên không thể lệch.
        EXEC sp_executesql N'
            ALTER TABLE HOA_DON ADD huong AS (
                CASE WHEN ma_hd LIKE N''VAO_%''   THEN N''VAO''
                     WHEN ma_hd LIKE N''RA_%''    THEN N''RA''
                     WHEN ma_hd LIKE N''V[0-9]%'' THEN N''VAO''
                     WHEN ma_hd LIKE N''R[0-9]%'' THEN N''RA''  END) PERSISTED;';
    END

    CREATE INDEX IX_HOA_DON_huong ON HOA_DON(huong, thang);

    -- BÀI HỌC ĐẮT (bắt được khi dựng thật TUAN_NGA_NB_2026): UNIQUE INDEX của
    -- SQL Server coi hai NULL là BẰNG NHAU (khác Oracle!). Đơn NB để trống cả
    -- mst/khhd/so_hd nên chỉ đơn ĐẦU TIÊN vào được, đơn thứ hai chết ngay:
    --     Msg 2601 — duplicate key (RA, NULL, NULL, NULL)
    --
    -- Bộ lọc dưới đây cho đơn NB rơi ra ngoài index -> bao nhiêu đơn cũng được.
    -- Giữ nguyên hình dạng BR-HD-01 (cùng 4 cột) để khuôn hai bên vẫn là MỘT: mai này
    -- có ai đổ hóa đơn thuế vào chính database này thì luật trùng vẫn hiệu lực ngay.
    -- Trong database NB thì mệnh đề lọc gần như không bao giờ đúng — index rỗng, không
    -- tốn gì. Đã thử cả hai chiều: cặp (mst,khhd,so_hd) trùng thật vẫn bị chặn.
    CREATE UNIQUE INDEX UX_HOA_DON_BR01 ON HOA_DON(huong, mst, khhd, so_hd)
        WHERE mst IS NOT NULL AND khhd IS NOT NULL AND so_hd IS NOT NULL;
END
GO

-- ===================== 3. Cột bổ sung trên dòng hàng =====================
-- Đối ứng với DM_HANG_NB.dvt_lon/he_so_lon ở 014. Hệ số CHỐT CỨNG vào dòng tại thời
-- điểm lập đơn: đổi hệ số trong danh mục về sau không được làm sai lệch tồn kho của
-- đơn đã lập (cùng nguyên tắc với ten_kh nguyên văn trên HOA_DON).
-- HOA_DON_LINE đã sẵn có sl_qd/dg_qd của bên thuế, nhưng đó là cặp cột phục vụ quy đổi
-- của sổ thuế — không mượn, để hai sổ không giẫm chân nhau khi engine đọc chung.
IF COL_LENGTH('HOA_DON_LINE', 'he_so_qd') IS NULL
    ALTER TABLE HOA_DON_LINE ADD he_so_qd DECIMAL(18,3) NULL;
GO
IF COL_LENGTH('HOA_DON_LINE', 'sl_quy_doi') IS NULL
    ALTER TABLE HOA_DON_LINE ADD sl_quy_doi DECIMAL(18,3) NULL;
GO
-- Hàng tặng kèm (isGift bên Hoa_Sang): có số lượng, tiền bằng 0
IF COL_LENGTH('HOA_DON_LINE', 'la_hang_tang') IS NULL
    ALTER TABLE HOA_DON_LINE ADD la_hang_tang BIT NOT NULL DEFAULT 0;
GO
-- BR-NB-07: trừ kho theo TỪNG DÒNG. Đơn có thể giao làm nhiều đợt, nên mốc rời kho
-- phải ghi được ở mức dòng; để trống thì lấy ngay_nh của đơn.
IF COL_LENGTH('HOA_DON_LINE', 'ngay_nh_l') IS NULL
    ALTER TABLE HOA_DON_LINE ADD ngay_nh_l DATE NULL;
GO

-- ###########################################################################
-- PHẦN 6 — GÓI HÀNG            (nguồn: 015 + 017_goi_hd_line_tri_gia.sql)
-- ###########################################################################

-- ===================== 4. GOI_HD — gói hàng (header) =====================
-- BR-NB-08: gói = nhóm đơn giao cùng chuyến / cùng khu vực (vd "gói phố Đại Từ"),
-- một ma_nvvc phụ trách. Gói là chứng từ TÁC NGHIỆP KHO: hạch toán tồn kho / giá vốn /
-- công nợ vẫn chạy theo TỪNG ĐƠN CON, vì mỗi đơn là nợ của một khách.
IF OBJECT_ID('GOI_HD') IS NULL
CREATE TABLE GOI_HD (
    ma_goi       NVARCHAR(50)   NOT NULL,
    ten_goi      NVARCHAR(200)  NULL,          -- "gói phố Đại Từ"
    khu_vuc      NVARCHAR(200)  NULL,
    ngay         DATE           NULL,          -- ngày lập gói
    thang        INT            NULL,          -- suy từ ngay lúc ghi, để lọc nhanh
    ma_nvvc      NVARCHAR(50)   NULL,          -- -> DM_KH_NB (loai_dt='NV')
    -- Vòng đời BR-NB-08: moi -> chot (sinh snapshot, khóa đơn con)
    --                        -> xuat (đóng dấu ngay_nh hàng loạt) -> huy
    trang_thai   NVARCHAR(20)   NOT NULL DEFAULT N'moi',
    so_don       INT            NULL,          -- số đơn con, chốt lại lúc CHỐT GÓI
    ngay_chot    DATETIME2      NULL,
    ngay_xuat    DATE           NULL,          -- ngày đóng dấu ngay_nh hàng loạt
    ghi_chu      NVARCHAR(500)  NULL,
    created_by   NVARCHAR(50)   NULL,
    created_at   DATETIME2      NOT NULL DEFAULT SYSDATETIME(),
    updated_by   NVARCHAR(50)   NULL,
    updated_at   DATETIME2      NULL,
    CONSTRAINT PK_GOI_HD PRIMARY KEY (ma_goi)
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_GOI_HD_ngay' AND object_id = OBJECT_ID('GOI_HD'))
    CREATE INDEX IX_GOI_HD_ngay ON GOI_HD(ngay);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_GOI_HD_nvvc' AND object_id = OBJECT_ID('GOI_HD'))
    CREATE INDEX IX_GOI_HD_nvvc ON GOI_HD(ma_nvvc, trang_thai);
GO

-- ===================== 5. GOI_HD_LINE — phiếu soạn hàng =====================
-- BR-NB-08: SNAPSHOT tổng hợp mặt hàng của MỌI đơn con, sinh lúc CHỐT GÓI.
-- 20 đơn × 1 thùng sữa chua -> MỘT dòng 20 thùng, kho soạn một lần, vào kho một lần.
--
-- VÌ SAO LÀ SNAPSHOT chứ không phải view tính động: đơn thuộc gói đã chốt bị KHÓA sửa;
-- muốn sửa phải rút đơn khỏi gói rồi chốt lại, khi đó snapshot tính lại. Nhờ vậy tờ
-- phiếu soạn cầm trên tay không bao giờ lệch với xe chở hàng.
IF OBJECT_ID('GOI_HD_LINE') IS NULL
CREATE TABLE GOI_HD_LINE (
    auto_num     BIGINT         IDENTITY(1,1) NOT NULL,   -- IDENTITY ngay từ đầu (bài học 010)
    ma_goi       NVARCHAR(50)   NOT NULL,
    stt_line     INT            NULL,
    ma_hang      NVARCHAR(50)   NULL,          -- -> DM_HANG_NB
    -- Tên/ĐVT nguyên văn lúc CHỐT gói: dọn danh mục về sau không làm biến hình
    -- phiếu soạn đã in
    ten_hang     NVARCHAR(500)  NULL,
    dvt          NVARCHAR(50)   NULL,
    so_luong     DECIMAL(18,3)  NULL,          -- TỔNG số lượng gộp từ mọi đơn con
    so_don_gop   INT            NULL,          -- gộp từ bao nhiêu đơn (để kho đối chiếu)
    -- (gộp từ 017) Trị giá gộp của mặt hàng trong gói = SUM(so_luong × don_gia) của
    -- mọi đơn con, ĐÃ LOẠI hàng tặng. Phiếu gói in ba cột giá của Hoa_Sang:
    --   G.đơn 3   = giá bình quân thực bán = tri_gia / so_luong
    --   G.chuẩn 4 = giá niêm yết (DM_HANG_NB.gia_ban, quy về đơn vị nhỏ)
    --   3-4       = chênh lệch, để chủ hàng soi ngay chỗ nào bán dưới giá chuẩn
    -- CHỐT VÀO SNAPSHOT chứ không JOIN sống: tri_gia là TIỀN CỦA CHUYẾN HÀNG NÀY, là
    -- sự thật lịch sử y như so_luong — sửa giá danh mục về sau không được làm biến hình
    -- tờ phiếu đã in. (Còn he_so_lon là thuộc tính ĐÓNG GÓI của mặt hàng, không phải
    -- con số của chuyến, nên cái đó vẫn đọc sống từ DM_HANG_NB.)
    tri_gia      DECIMAL(18,2)  NULL,
    ghi_chu      NVARCHAR(500)  NULL,
    created_by   NVARCHAR(50)   NULL,
    created_at   DATETIME2      NOT NULL DEFAULT SYSDATETIME(),
    CONSTRAINT PK_GOI_HD_LINE PRIMARY KEY (auto_num),
    CONSTRAINT FK_GOI_HD_LINE_GOI_HD FOREIGN KEY (ma_goi)
        REFERENCES GOI_HD(ma_goi) ON DELETE CASCADE
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_GOI_HD_LINE_ma_goi' AND object_id = OBJECT_ID('GOI_HD_LINE'))
    CREATE INDEX IX_GOI_HD_LINE_ma_goi ON GOI_HD_LINE(ma_goi);
GO

-- Database dựng bằng bản 015 CŨ đã có GOI_HD_LINE mà chưa có tri_gia -> vá thêm.
-- (CREATE TABLE ở trên chỉ chạy khi bảng chưa tồn tại.)
IF OBJECT_ID('GOI_HD_LINE') IS NOT NULL AND COL_LENGTH('GOI_HD_LINE', 'tri_gia') IS NULL
    ALTER TABLE GOI_HD_LINE ADD tri_gia DECIMAL(18,2) NULL;
GO

-- ###########################################################################
-- PHẦN 7 — DỌN DI SẢN BẢN v0.2   (nguồn: 015_nb_hoadon_goi.sql)
-- ###########################################################################

-- ===================== 6. Dọn di sản bản v0.2 =====================
-- Các database dựng trong khoảng 05/08 đã có DON_HANG/DON_HANG_LINE do bản 013 cũ
-- sinh ra. SPEC v0.3 khai tử hai bảng này. CHỈ xóa khi RỖNG: có dữ liệu thật thì để
-- nguyên và báo ra, việc chuyển dữ liệu sang HOA_DON phải làm tay có người nhìn,
-- không được lặng lẽ xóa sổ chứng từ của ai đó.
-- BẮT BUỘC DÙNG DYNAMIC SQL Ở ĐÂY. Viết thẳng
--     IF OBJECT_ID('DM_HANG') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM DM_HANG) DROP TABLE DM_HANG
-- thì trên database MỚI TINH (chưa từng có DM_HANG) cả mẻ lệnh CHẾT NGAY lúc biên dịch:
--     Msg 208 — Invalid object name 'DM_HANG'
-- SQL Server biên dịch trọn mẻ TRƯỚC khi chạy dòng nào, nên IF OBJECT_ID (chạy lúc
-- thực thi) không đỡ được. Deferred name resolution chỉ tha cho bảng KHÔNG hề bị
-- DROP trong cùng mẻ; có DROP TABLE là nó bind chặt tên ngay lúc biên dịch.
-- Đây là lỗi đã bắt được khi dựng thật TUAN_NGA_NB_2026 — mọi lần mở năm đều sẽ hỏng.
-- Bọc trong EXEC thì chuỗi chỉ được biên dịch lúc chạy, tức là sau khi IF đã lọc.

-- DON_HANG + DON_HANG_LINE: chỉ xóa khi RỖNG. Có dữ liệu thật thì để nguyên và báo ra
-- — chuyển sang HOA_DON phải làm tay có người nhìn, không lặng lẽ xóa sổ chứng từ của ai.
IF OBJECT_ID('DON_HANG') IS NOT NULL
BEGIN
    EXEC sp_executesql N'
        IF NOT EXISTS (SELECT 1 FROM DON_HANG)
        BEGIN
            IF OBJECT_ID(''DON_HANG_LINE'') IS NOT NULL DROP TABLE DON_HANG_LINE;
            DROP TABLE DON_HANG;
        END
        ELSE
            PRINT N''CẢNH BÁO: DON_HANG còn dữ liệu — giữ nguyên. Cần chuyển tay sang HOA_DON rồi xóa.'';';
END

-- DM_KH/DM_HANG (không hậu tố) của bản 013 cũ: cùng cách xử lý. Lưu ý đây là database
-- TENANT, không phải KT2000_Base — DM_KH/DM_HANG của Base nằm ở database khác, không
-- bị đụng tới.
IF OBJECT_ID('DM_HANG') IS NOT NULL
    EXEC sp_executesql
        N'IF NOT EXISTS (SELECT 1 FROM DM_HANG) DROP TABLE DM_HANG;';

IF OBJECT_ID('DM_KH') IS NOT NULL
    EXEC sp_executesql
        N'IF NOT EXISTS (SELECT 1 FROM DM_KH) DROP TABLE DM_KH;';
GO

IF NOT EXISTS (SELECT 1 FROM SCHEMA_VERSION WHERE Ver = 9)
    INSERT INTO SCHEMA_VERSION (Ver) VALUES (9);
GO
