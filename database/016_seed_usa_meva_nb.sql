USE KT2000_Master;
GO

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

SET NOCOUNT ON;
GO

-- ======================= THAM SỐ =======================
DECLARE @MaDonVi        NVARCHAR(30)  = N'USA_MEVA_NB';
DECLARE @TenDonVi       NVARCHAR(200) = N'Công ty Cổ phần Sơn USAMEVA Việt nam - Nội bộ';
DECLARE @NamDau         INT           = 2026;
DECLARE @LoginName      NVARCHAR(50)  = N'ketoan03';
DECLARE @TenThat        NVARCHAR(100) = N'Kế toán 03';
DECLARE @VaiTro         NVARCHAR(20)  = N'accountant';   -- admin | accountant | viewer
DECLARE @MaThueLienKet  NVARCHAR(30)  = N'USA_MEVA';
DECLARE @TenThue        NVARCHAR(200) = N'Công ty Cổ phần Sơn USAMEVA Việt nam';
DECLARE @MstThue        NVARCHAR(20)  = N'0107130530';
DECLARE @DiaChiThue     NVARCHAR(300) =
        N'Số nhà 42, ngách 8/174, tổ 1, đường Lê Quang Đạo - Phường Phú Đô - Quận Nam Từ Liêm - Hà Nội.';
DECLARE @SortNameThue   NVARCHAR(50)  = N'Chỗ Lê';   -- tên gọi tắt để sắp xếp/tìm
DECLARE @NamThueDau     INT           = 2026;        -- năm mở cho SỔ THUẾ
DECLARE @KhaiQuyThue    BIT           = 0;

DECLARE @MatKhauHash    NVARCHAR(200) =
        N'$2a$11$Fou/y.8EruXYyKGDHR4K2eeoPiFhPaW70UosybAHGblFef44XDqSm';
-- =============================================================================

DECLARE @TenantId UNIQUEIDENTIFIER;   -- tenant NB
DECLARE @ThueId   UNIQUEIDENTIFIER;   -- tenant thuế (khai ở đây để mục 6 gắn quyền được
                                      -- cả khi tenant thuế vốn đã có sẵn từ trước)
DECLARE @UserId   UNIQUEIDENTIFIER;

BEGIN TRY
    BEGIN TRAN;

    IF @MaDonVi NOT LIKE N'[A-Z][A-Z0-9_]%[A-Z0-9]'
       OR LEN(@MaDonVi) < 3 OR LEN(@MaDonVi) > 30
       OR @MaDonVi LIKE N'%[^A-Z0-9_]%'
        THROW 50001, N'Mã đơn vị không hợp lệ theo BR-DB-01 (A-Z đầu, chỉ A-Z 0-9 _, 3-30 ký tự, không kết thúc bằng _)', 1;
    SELECT @ThueId = Id FROM Tenants WHERE Code = @MaThueLienKet;

    IF @ThueId IS NULL
    BEGIN
        SET @ThueId = NEWID();
        -- TenantType = 'headquarter' (công ty mẹ, không phải chi nhánh) nên ParentId NULL.
        -- LinkedTenantCode để NULL: cột đó chỉ dành cho tenant 'noibo' trỏ ngược về đây;
        -- tenant thuế mang mã liên kết là sai chiều (AdminService.CreateTenant cũng ép NULL).
        INSERT INTO Tenants (Id, Code, Name, DbName, TenantType, ParentId,
                             TaxCode, Address, SortName, KhaiQuy,
                             LinkedTenantCode, IsActive)
        VALUES (@ThueId, @MaThueLienKet, @TenThue, @MaThueLienKet, N'headquarter', NULL,
                @MstThue, @DiaChiThue, @SortNameThue, @KhaiQuyThue,
                NULL, 1);
        PRINT N'[+] Đã đăng ký đơn vị thuế ' + @MaThueLienKet + N' — ' + @TenThue;

        INSERT INTO FiscalYears (TenantId, [Year], IsClosed)
        VALUES (@ThueId, @NamThueDau, 0);
        PRINT N'    mở năm ' + CAST(@NamThueDau AS NVARCHAR(10)) + N' cho sổ thuế';
    END
    ELSE PRINT N'[=] Đơn vị thuế ' + @MaThueLienKet + N' đã có, bỏ qua';

    ---------------------------------------------------------------------------
    -- 3. Đăng ký tenant nội bộ (bỏ qua nếu đã có)
    ---------------------------------------------------------------------------
    SELECT @TenantId = Id FROM Tenants WHERE Code = @MaDonVi;

    IF @TenantId IS NULL
    BEGIN
        SET @TenantId = NEWID();
        -- DbName giữ đúng bằng Code như AdminService.CreateTenant đang làm: tên database
        -- thật (CODE_NĂM) do TenantDbResolver ghép, cột này không tham gia vào việc đó.
        INSERT INTO Tenants (Id, Code, Name, DbName, TenantType, LinkedTenantCode, IsActive)
        VALUES (@TenantId, @MaDonVi, @TenDonVi, @MaDonVi, N'noibo', @MaThueLienKet, 1);
        PRINT N'[+] Đã đăng ký đơn vị ' + @MaDonVi + N' (noibo -> ' + @MaThueLienKet + N')';
    END
    ELSE
    BEGIN
        PRINT N'[=] Đơn vị ' + @MaDonVi + N' đã có, bỏ qua';
        -- Đã có nhưng khai sai kiểu thì nói ra, đừng để lệch âm thầm: tenant không phải
        -- 'noibo' sẽ không nhận được bộ màn hình NB (BR-NB-06) dù người dùng vẫn vào được.
        IF EXISTS (SELECT 1 FROM Tenants WHERE Id = @TenantId AND TenantType <> N'noibo')
            PRINT N'    CẢNH BÁO: đơn vị này đang KHÔNG phải loại noibo — kiểm tra lại TenantType';
        IF EXISTS (SELECT 1 FROM Tenants WHERE Id = @TenantId AND ISNULL(LinkedTenantCode, N'') = N'')
            PRINT N'    CẢNH BÁO: chưa khai LinkedTenantCode — tra cứu xuyên DB (BR-NB-03) sẽ không chạy';
    END

    ---------------------------------------------------------------------------
    -- 4. Ghi nhận năm làm việc
    ---------------------------------------------------------------------------
    -- Chỉ ghi vào SỔ (bảng FiscalYears). DATABASE USA_MEVA_NB_2026 chưa được dựng ở
    -- bước này — xem ghi chú (4) đầu file.
    IF NOT EXISTS (SELECT 1 FROM FiscalYears WHERE TenantId = @TenantId AND [Year] = @NamDau)
    BEGIN
        INSERT INTO FiscalYears (TenantId, [Year], IsClosed) VALUES (@TenantId, @NamDau, 0);
        PRINT N'[+] Đã mở năm ' + CAST(@NamDau AS NVARCHAR(10)) + N' trong sổ';
    END
    ELSE PRINT N'[=] Năm ' + CAST(@NamDau AS NVARCHAR(10)) + N' đã có trong sổ';

    ---------------------------------------------------------------------------
    -- 5. Tài khoản ketoan03
    ---------------------------------------------------------------------------
    SELECT @UserId = Id FROM Users WHERE LoginName = @LoginName;

    IF @UserId IS NULL
    BEGIN
        SET @UserId = NEWID();
        INSERT INTO Users (Id, LoginName, PasswordHash, RealName,
                           IsAdmin, IsActive, MustChangePassword,
                           MatKhauBanDauMaHoa, CreatedAt)
        VALUES (@UserId, @LoginName, @MatKhauHash, @TenThat,
                0,          -- KHÔNG phải quản trị viên: đây là nhân viên của khách
                1,
                0,          -- xem ghi chú (3) đầu file
                NULL,
                SYSDATETIME());
        PRINT N'[+] Đã tạo tài khoản ' + @LoginName + N' / 123456';
    END
    ELSE
    BEGIN
        -- Đã có thì ĐẶT LẠI mật khẩu về 123456 cho đúng ý "tạo tài khoản ... pass ...",
        -- thay vì bỏ qua rồi để người chạy tưởng đã xong mà đăng nhập không được.
        UPDATE Users
        SET PasswordHash = @MatKhauHash, MustChangePassword = 0,
            MatKhauBanDauMaHoa = NULL, IsActive = 1
        WHERE Id = @UserId;
        PRINT N'[~] Tài khoản ' + @LoginName + N' đã có — đã đặt lại mật khẩu về 123456';
    END

    ---------------------------------------------------------------------------
    -- 6. Gắn quyền vào đơn vị
    ---------------------------------------------------------------------------
    -- Không có dòng này thì đăng nhập được nhưng combobox chọn đơn vị rỗng (SPEC mục 5).
    IF NOT EXISTS (SELECT 1 FROM UserTenantAccess
                   WHERE UserId = @UserId AND TenantId = @TenantId)
    BEGIN
        INSERT INTO UserTenantAccess (UserId, TenantId, Role)
        VALUES (@UserId, @TenantId, @VaiTro);
        PRINT N'[+] Đã gắn ' + @LoginName + N' vào ' + @MaDonVi + N' (vai trò ' + @VaiTro + N')';
    END
    ELSE PRINT N'[=] Quyền vào đơn vị đã có';

    ---------------------------------------------------------------------------
    -- 7. Ghi nhật ký (luật #7 CLAUDE.md — mọi thao tác phải có vết)
    ---------------------------------------------------------------------------
    IF OBJECT_ID('ActivityLog') IS NOT NULL
        INSERT INTO ActivityLog (UserName, Action, Detail)
        VALUES (N'(script 018)', N'TAO_USER',
                N'Seed tài khoản ' + @LoginName + N' cho đơn vị ' + @MaDonVi
                + N' năm ' + CAST(@NamDau AS NVARCHAR(10)));

    COMMIT;
    PRINT N'';
    PRINT N'==> XONG. Bước tiếp theo: dựng database ' + @MaDonVi + N'_'
          + CAST(@NamDau AS NVARCHAR(10))
          + N' qua màn "Mở năm làm việc" (đăng nhập MDN_NB) — xem ghi chú (4).';
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK;
    PRINT N'!!! LỖI, đã hoàn tác toàn bộ: ' + ERROR_MESSAGE();
    THROW;
END CATCH
GO

-- ======================= KIỂM TRA LẠI SAU KHI CHẠY =======================
SELECT t.Code, t.Name, t.TenantType,
       ISNULL(t.LinkedTenantCode, N'--') AS LienKetThue,
       (SELECT COUNT(*) FROM FiscalYears f WHERE f.TenantId = t.Id) AS SoNamDaMo
FROM Tenants t WHERE t.Code = N'USA_MEVA_NB';

SELECT u.LoginName, u.RealName, u.IsAdmin, u.IsActive, u.MustChangePassword,
       t.Code AS DonVi, a.Role AS VaiTro
FROM Users u
LEFT JOIN UserTenantAccess a ON a.UserId = u.Id
LEFT JOIN Tenants t ON t.Id = a.TenantId
WHERE u.LoginName = N'ketoan03';
GO


USE USA_MEVA_NB_2026;
GO

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO
IF OBJECT_ID('DM_MAU') IS NULL
BEGIN
    CREATE TABLE DM_MAU (
        ma_mau     NVARCHAR(50)  NOT NULL,   -- = ColorCode, vd "2532-P"
        nhom_mau   NVARCHAR(30)  NOT NULL,   -- = ColorGroup, vd "Yellow" / "Pastel"
        ma_hex     NVARCHAR(10)  NULL,       -- = HexValue, vd "#f8ebbf" — để tô ô chọn màu
        thu_tu     INT           NULL,       -- = SortOrder, giữ đúng thứ tự bảng màu giấy
        ghi_chu    NVARCHAR(255) NULL,
        ngung_dung BIT           NOT NULL DEFAULT 0,   -- = NOT IsActive
        created_by NVARCHAR(50)  NULL,
        created_at DATETIME2     NOT NULL DEFAULT SYSDATETIME(),
        updated_by NVARCHAR(50)  NULL,
        updated_at DATETIME2     NULL,
        CONSTRAINT PK_DM_MAU PRIMARY KEY (ma_mau, nhom_mau)
    );
    PRINT N'[+] Đã tạo bảng DM_MAU';
END
ELSE PRINT N'[=] DM_MAU đã có';
GO

-- Gõ mã màu để tìm là việc làm nhiều nhất, mà cột này đứng THỨ HAI trong khóa chính
-- nên index của khóa chính không đỡ được — cần index riêng theo ma_mau.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_DM_MAU_ma' AND object_id=OBJECT_ID('DM_MAU'))
    CREATE INDEX IX_DM_MAU_ma ON DM_MAU(ma_mau);
GO

-- Lọc theo nhóm màu ("cho tôi xem ngăn Pastel") — 1131 dòng, không index thì quét cả bảng
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_DM_MAU_nhom' AND object_id=OBJECT_ID('DM_MAU'))
    CREATE INDEX IX_DM_MAU_nhom ON DM_MAU(nhom_mau);
GO

IF OBJECT_ID('DM_DVT_NB') IS NULL
BEGIN
    CREATE TABLE DM_DVT_NB (
        ma_dvt     NVARCHAR(20)   NOT NULL,   -- = UnitCode, vd "DV0001"
        ten_dvt    NVARCHAR(200)  NOT NULL,   -- = UnitName, vd "Thùng 18 lít"
        ghi_chu    NVARCHAR(500)  NULL,       -- = Note,     vd "Quy cách 18L"
        ten_tat    NVARCHAR(100)  NULL,       -- = SortName, vd "18L" — gõ tắt để tìm
        dvt_goc    NVARCHAR(20)   NULL,       -- = BaseUnit, vd "L" / "KG"
        he_so_qd   DECIMAL(18,3)  NULL,
        created_by NVARCHAR(50)   NULL,
        created_at DATETIME2      NOT NULL DEFAULT SYSDATETIME(),
        updated_by NVARCHAR(50)   NULL,
        updated_at DATETIME2      NULL,
        CONSTRAINT PK_DM_DVT_NB PRIMARY KEY (ma_dvt)
    );
    PRINT N'[+] Đã tạo bảng DM_DVT_NB';
END
ELSE PRINT N'[=] DM_DVT_NB đã có';
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_DM_DVT_NB_ten' AND object_id=OBJECT_ID('DM_DVT_NB'))
    CREATE INDEX IX_DM_DVT_NB_ten ON DM_DVT_NB(ten_dvt);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_DM_DVT_NB_tat' AND object_id=OBJECT_ID('DM_DVT_NB'))
    CREATE INDEX IX_DM_DVT_NB_tat ON DM_DVT_NB(ten_tat);
GO

--
-- Chưa bê sang (chốt): bảng giá theo KHÁCH (UserProductPrices) và lịch sử giá
-- (ProductPriceHistory) — chính sách giá là SPEC riêng, không gộp vào đây.
IF OBJECT_ID('DM_QUY_CACH_NB') IS NULL
BEGIN
    CREATE TABLE DM_QUY_CACH_NB (
        ma_hang    NVARCHAR(50)   NOT NULL,   -- -> DM_HANG_NB.ma_hang (mã GỐC, không đuôi)
        ma_dvt     NVARCHAR(20)   NOT NULL,   -- -> DM_DVT_NB.ma_dvt
        la_dvt_goc BIT            NOT NULL DEFAULT 0,
        gia_ban    DECIMAL(18,2)  NULL,
        gia_mua    DECIMAL(18,2)  NULL,
        ma_vach    NVARCHAR(100)  NULL,       -- = Barcode, quét tem theo từng quy cách
        sl_thung   INT            NULL,       -- = UnitsPerBox, số hộp xếp trong một thùng
        ghi_chu    NVARCHAR(500)  NULL,
        created_by NVARCHAR(50)   NULL,
        created_at DATETIME2      NOT NULL DEFAULT SYSDATETIME(),
        updated_by NVARCHAR(50)   NULL,
        updated_at DATETIME2      NULL,
        CONSTRAINT PK_DM_QUY_CACH_NB PRIMARY KEY (ma_hang, ma_dvt)
    );
    PRINT N'[+] Đã tạo bảng DM_QUY_CACH_NB';
END
ELSE PRINT N'[=] DM_QUY_CACH_NB đã có';
GO

SET QUOTED_IDENTIFIER ON;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='UQ_DM_QUY_CACH_NB_goc' AND object_id=OBJECT_ID('DM_QUY_CACH_NB'))
    CREATE UNIQUE INDEX UQ_DM_QUY_CACH_NB_goc
        ON DM_QUY_CACH_NB(ma_hang) WHERE la_dvt_goc = 1;
GO

-- Tra ngược "ĐVT này đang dùng cho những mặt hàng nào" (vd sắp ngưng một quy cách).
-- Khóa chính dẫn đầu bằng ma_hang nên không đỡ được chiều tra này.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_DM_QUY_CACH_NB_dvt' AND object_id=OBJECT_ID('DM_QUY_CACH_NB'))
    CREATE INDEX IX_DM_QUY_CACH_NB_dvt ON DM_QUY_CACH_NB(ma_dvt);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_DM_QUY_CACH_NB_vach' AND object_id=OBJECT_ID('DM_QUY_CACH_NB'))
    CREATE INDEX IX_DM_QUY_CACH_NB_vach
        ON DM_QUY_CACH_NB(ma_vach) WHERE ma_vach IS NOT NULL;
GO

-- ================= DM_KM_NB — KHUYẾN MÃI (mua N tặng M) =================
-- Nguồn: USA_MEVA.dbo.Promotions (27 dòng, soi ngày 10/08/2026).
--
-- SOI DỮ LIỆU RỒI MỚI CẮT CỘT — bên nguồn có 26 cột, ở đây giữ 8. Bỏ đi cái gì và vì sao:
--
-- * Type            : 27/27 dòng đều 'BUY_GET'. Cột hằng số thì không phải là dữ liệu.
--                     Khi nào có kiểu KM thứ hai (giảm giá) thì thêm cột lúc đó.
-- * DiscountPrice / DiscountPct / MinOrderQty / DiscountMode : NULL cả 27/27 — đó là
--                     bộ cột của KM GIẢM GIÁ, chưa dùng bao giờ.
-- * GroupId         : NULL 27/27. KM khai theo từng mặt hàng, không theo nhóm hàng.
-- * ColorId         : NULL 27/27. KM không phân biệt màu pha.
-- * IsForCustomer   : 0 cả 27/27 (không có dòng nào riêng cho khách mới).
-- * StartDate/EndDate: NULL 27/27 — KM hiện chạy vô thời hạn. Vẫn GIỮ hai cột này:
--                     KM có mùa vụ là chuyện bình thường sẽ tới, mà thêm cột ngày vào
--                     bảng đã có dữ liệu thì tốn một script nữa.
-- * IsActive        : bỏ. KM hết hiệu lực thì XÓA DÒNG hoặc đặt den_ngay, không giữ
--                     thêm một cờ bật/tắt song song. Bên nguồn chỉ 1/27 dòng tắt.
--
-- KM GẮN THEO QUY CÁCH, KHÔNG PHẢI THEO MẶT HÀNG — điểm dễ làm sai nhất:
--     H00021 có BA khuyến mãi: mua 10 thùng tặng 2, mua 5 thùng tặng 1,
--                              và mua 3 hộp 5L tặng 1 hộp 5L.
-- Nên khóa chính phải gồm cả ma_dvt. Gộp về mặt hàng là ba dòng đè nhau còn một.
--
-- QUY CÁCH TẶNG CÓ THỂ KHÁC QUY CÁCH MUA: KM0018 mua 3 thùng 18L tặng 1 hộp 5L.
-- Vì vậy có RIÊNG ma_dvt_tang, không dùng lại ma_dvt.
IF OBJECT_ID('DM_KM_NB') IS NULL
BEGIN
    CREATE TABLE DM_KM_NB (
        ma_km       NVARCHAR(20)   NOT NULL,   -- = PromotionCode, vd "KM0001"
        ten_km      NVARCHAR(255)  NOT NULL,   -- = PromotionName, vd "Mua 10 tặng 4"
        ma_hang     NVARCHAR(50)   NOT NULL,   -- -> DM_HANG_NB.ma_hang
        ma_dvt      NVARCHAR(20)   NOT NULL,   -- quy cách PHẢI MUA  -> DM_DVT_NB
        ma_dvt_tang NVARCHAR(20)   NOT NULL,   -- quy cách ĐƯỢC TẶNG -> DM_DVT_NB
        sl_mua      DECIMAL(18,3)  NOT NULL,   -- = BuyQty
        sl_tang     DECIMAL(18,3)  NOT NULL,   -- = GetQty
        tu_ngay     DATE           NULL,       -- = StartDate. NULL = không giới hạn
        den_ngay    DATE           NULL,       -- = EndDate.   NULL = không giới hạn
        ghi_chu     NVARCHAR(500)  NULL,
        created_by  NVARCHAR(50)   NULL,
        created_at  DATETIME2      NOT NULL DEFAULT SYSDATETIME(),
        updated_by  NVARCHAR(50)   NULL,
        updated_at  DATETIME2      NULL,
        CONSTRAINT PK_DM_KM_NB PRIMARY KEY (ma_km)
    );
    PRINT N'[+] Đã tạo bảng DM_KM_NB';
END
ELSE PRINT N'[=] DM_KM_NB đã có';
GO

-- Tra "mặt hàng + quy cách này đang có KM nào" — đây là câu form đánh đơn hỏi mỗi lần
-- bấm F4, nên phải có index. Khóa chính là ma_km nên không đỡ được chiều tra này.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_DM_KM_NB_hang' AND object_id=OBJECT_ID('DM_KM_NB'))
    CREATE INDEX IX_DM_KM_NB_hang ON DM_KM_NB(ma_hang, ma_dvt);
GO

-- ============ USER_HANG — mặt hàng ai hay dùng (xếp ô gợi ý) ============
-- Nguồn: USA_MEVA.dbo.UserProductUsages.
--
-- KHÔNG PHẢI DANH MỤC nên KHÔNG mang tiền tố DM_: các bảng DM_* trong repo này là thứ
-- người dùng KHAI TAY và có màn hình quản lý (DM_HANG_NB, DM_KM_NB...). Bảng này do
-- MÁY tự ghi mỗi lần lưu đơn, không ai nhập, không có màn hình. Xóa sạch bảng cũng
-- không mất dữ liệu nghiệp vụ — chỉ là ô gợi ý mất thứ tự ưu tiên vài hôm rồi tự học lại.
--
-- CÔNG DỤNG: người bán quen tay chỉ đánh đi đánh lại chục mặt hàng trong số 50. Ô gợi ý
-- xếp theo số lần đã dùng thì gõ một hai chữ là mặt hàng quen nhảy lên đầu, đỡ phải
-- đọc hết danh sách. Bên nguồn ProductsController có tham số sortByUsage đúng để làm việc này.
--
-- KHÁC NGUỒN MỘT CHỖ: nguồn khóa theo UserId (GUID) vì bảng Users nằm cùng database.
-- Bên kt2000, user sống ở KT2000_Master còn bảng này ở database ĐƠN VỊ-NĂM — hai
-- database khác nhau, không tham chiếu GUID xuyên qua được (và cũng không nên: luật #9).
-- Nên khóa theo login_name, đúng thứ token mang sẵn (claim login_name).
--
-- Không có bộ tứ audit created_by/updated_by: bảng chỉ có MỘT người ghi là chính chủ,
-- mà so_lan/lan_cuoi đã tự nói ai làm gì lúc nào.
IF OBJECT_ID('USER_HANG') IS NULL
BEGIN
    CREATE TABLE USER_HANG (
        login_name NVARCHAR(50)  NOT NULL,   -- = UserId, nhưng theo tên đăng nhập
        ma_hang    NVARCHAR(50)  NOT NULL,   -- -> DM_HANG_NB.ma_hang
        so_lan     INT           NOT NULL DEFAULT 0,          -- = UseCount
        lan_cuoi   DATETIME2     NOT NULL DEFAULT SYSDATETIME(),  -- = LastUsedAt
        CONSTRAINT PK_USER_HANG PRIMARY KEY (login_name, ma_hang)
    );
    PRINT N'[+] Đã tạo bảng USER_HANG';
END
ELSE PRINT N'[=] USER_HANG đã có';
GO

-- Xếp hạng "hàng hay dùng của TÔI": lọc theo login_name rồi sắp theo số lần giảm dần,
-- cùng số lần thì lấy cái vừa dùng gần đây. INCLUDE ma_hang để câu này đọc xong index
-- là đủ, không phải quay lại bảng (bê đúng IX_UserProductUsages_User_Rank bên nguồn).
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_USER_HANG_xep' AND object_id=OBJECT_ID('USER_HANG'))
    CREATE INDEX IX_USER_HANG_xep ON USER_HANG(login_name, so_lan DESC, lan_cuoi DESC)
        INCLUDE (ma_hang);
GO

IF OBJECT_ID('DM_NHAN') IS NULL
BEGIN
    CREATE TABLE DM_NHAN (
        ma_nhan    NVARCHAR(20)  NOT NULL,   -- = BrandCode, vd "DUBAI_MEVA"
        ten_nhan   NVARCHAR(100) NOT NULL,   -- = BrandName, vd "DUBAI MEVA"
        ten_cty    NVARCHAR(255) NULL,       -- = CompanyName — pháp nhân in trên phiếu
        mst        NVARCHAR(20)  NULL,       -- = TaxCode
        ten_tat    NVARCHAR(20)  NULL,       -- = SortName, vd "CB0008" — gõ tắt để tìm
        ngung_dung BIT           NOT NULL DEFAULT 0,
        created_by NVARCHAR(50)  NULL,
        created_at DATETIME2     NOT NULL DEFAULT SYSDATETIME(),
        updated_by NVARCHAR(50)  NULL,
        updated_at DATETIME2     NULL,
        CONSTRAINT PK_DM_NHAN PRIMARY KEY (ma_nhan)
    );
    PRINT N'[+] Đã tạo bảng DM_NHAN';
END
ELSE PRINT N'[=] DM_NHAN đã có';
GO

IF COL_LENGTH('DM_KH_NB', 'ma_tinh') IS NULL
BEGIN

    ALTER TABLE DM_KH_NB ADD ma_tinh NVARCHAR(50) NULL;
    PRINT N'[+] DM_KH_NB += ma_tinh';
END
ELSE PRINT N'[=] DM_KH_NB.ma_tinh đã có';
GO

IF COL_LENGTH('DM_KH_NB', 'ten_cty') IS NULL
BEGIN

    ALTER TABLE DM_KH_NB ADD ten_cty NVARCHAR(255) NULL;
    PRINT N'[+] DM_KH_NB += ten_cty';
END
ELSE PRINT N'[=] DM_KH_NB.ten_cty đã có';
GO

IF COL_LENGTH('DM_KH_NB', 'dien_thoai2') IS NULL
BEGIN
    -- = Phone2. Khách hay có hai số (chủ cửa hàng + người nhận hàng tại kho).
    ALTER TABLE DM_KH_NB ADD dien_thoai2 NVARCHAR(50) NULL;
    PRINT N'[+] DM_KH_NB += dien_thoai2';
END
ELSE PRINT N'[=] DM_KH_NB.dien_thoai2 đã có';
GO

IF COL_LENGTH('DM_KH_NB', 'ma_nhan') IS NULL
BEGIN
    ALTER TABLE DM_KH_NB ADD ma_nhan NVARCHAR(20) NULL;
    PRINT N'[+] DM_KH_NB += ma_nhan';
END
ELSE PRINT N'[=] DM_KH_NB.ma_nhan đã có';
GO

IF COL_LENGTH('DM_KH_NB', 'la_kh_moi') IS NULL
BEGIN

    ALTER TABLE DM_KH_NB ADD la_kh_moi BIT NULL;
    PRINT N'[+] DM_KH_NB += la_kh_moi';
END
ELSE PRINT N'[=] DM_KH_NB.la_kh_moi đã có';
GO

IF COL_LENGTH('DM_KH_NB', 'thang_bat_dau') IS NULL
BEGIN
    -- = StartMonth. Mốc khách bắt đầu mua — dùng khi soi công nợ đầu kỳ.
    ALTER TABLE DM_KH_NB ADD thang_bat_dau DATE NULL;
    PRINT N'[+] DM_KH_NB += thang_bat_dau';
END
ELSE PRINT N'[=] DM_KH_NB.thang_bat_dau đã có';
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_DM_KH_NB_tinh' AND object_id=OBJECT_ID('DM_KH_NB'))
    CREATE INDEX IX_DM_KH_NB_tinh ON DM_KH_NB(ma_tinh);
GO

IF COL_LENGTH('DM_HANG_NB', 'ten_hd') IS NULL
BEGIN
    ALTER TABLE DM_HANG_NB ADD ten_hd NVARCHAR(500) NULL;
    PRINT N'[+] DM_HANG_NB += ten_hd (tên đưa lên hóa đơn)';
END
ELSE PRINT N'[=] DM_HANG_NB.ten_hd đã có';
GO

IF COL_LENGTH('HOA_DON', 'dia_chi_giao') IS NULL
BEGIN
    ALTER TABLE HOA_DON ADD dia_chi_giao NVARCHAR(500) NULL;
    PRINT N'[+] HOA_DON += dia_chi_giao';
END
ELSE PRINT N'[=] HOA_DON.dia_chi_giao đã có';
GO

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

-- Mã màu khách chọn, vd "2532-P". NULL = hàng bán nguyên trạng, không pha màu.
-- Rộng 50 khớp DM_MAU.ma_mau.
IF COL_LENGTH('HOA_DON_LINE', 'ma_mau') IS NULL
    ALTER TABLE HOA_DON_LINE ADD ma_mau NVARCHAR(50) NULL;
GO

-- Tiền công pha màu CỦA CẢ DÒNG (không nhân số lượng — xem đầu file).
-- DECIMAL(18,2) khớp các cột tiền khác của HOA_DON_LINE (tien_ck, tien_vat_l).
IF COL_LENGTH('HOA_DON_LINE', 'tien_tinh_mau') IS NULL
    ALTER TABLE HOA_DON_LINE ADD tien_tinh_mau DECIMAL(18,2) NULL;
GO
    -- (N'DV0001', N'Thùng 18 lít', N'18L',  N'L',  18.000, N'Quy cách 18L'),
    -- (N'DV0002', N'Hộp 5 lít',    N'5L',   N'L',   5.000, N'Quy cách 5L'),
    -- (N'DV0003', N'Hộp 1 lít',    N'1L',   N'L',   1.000, N'Quy cách 1L'),
    -- (N'DV0004', N'Lon 1 Kg',     N'1 KG', N'KG',  1.000, N'Quy cách 1kg'),
    -- (N'DV0005', N'Bao 5 Kg',     N'5KG',  N'KG',  5.000, N'Quy cách 5kg'),
    -- (N'DV0006', N'Bao 40 Kg',    N'40KG', N'KG', 40.000, N'Quy cách 40kg')

IF EXISTS (SELECT 1 FROM DM_HANG_NB
           WHERE ma_hang LIKE N'%-[0-9]' OR ma_hang LIKE N'%-[0-9][0-9]')
BEGIN
    BEGIN TRAN;

    -- Bảng tạm: mã đuôi -> mã gốc. Chỉ nhận cặp mà MÃ GỐC CÓ THẬT trong danh mục;
    -- mã đuôi mồ côi (không có gốc) thì GIỮ NGUYÊN, không dám tự bịa gốc cho nó.
    SELECT h.ma_hang AS ma_duoi,
           LEFT(h.ma_hang, LEN(h.ma_hang) - CHARINDEX(N'-', REVERSE(h.ma_hang))) AS ma_goc
    INTO #doi_ma
    FROM DM_HANG_NB h
    WHERE h.ma_hang LIKE N'%-[0-9]' OR h.ma_hang LIKE N'%-[0-9][0-9]';

    DELETE d FROM #doi_ma d
    WHERE NOT EXISTS (SELECT 1 FROM DM_HANG_NB g WHERE g.ma_hang = d.ma_goc);

    DECLARE @so_moi_coi INT = (
        SELECT COUNT(*) FROM DM_HANG_NB h
        WHERE (h.ma_hang LIKE N'%-[0-9]' OR h.ma_hang LIKE N'%-[0-9][0-9]')
          AND NOT EXISTS (SELECT 1 FROM #doi_ma d WHERE d.ma_duoi = h.ma_hang));
    IF @so_moi_coi > 0
        PRINT N'    CẢNH BÁO: ' + CAST(@so_moi_coi AS NVARCHAR(10))
            + N' mã đuôi KHÔNG tìm thấy mã gốc — giữ nguyên, cần xem tay';

    UPDATE l SET l.ma_hang = d.ma_goc
    FROM HOA_DON_LINE l JOIN #doi_ma d ON d.ma_duoi = l.ma_hang;
    PRINT N'    HOA_DON_LINE: đã trỏ ' + CAST(@@ROWCOUNT AS NVARCHAR(10)) + N' dòng về mã gốc';

    IF OBJECT_ID('GOI_HD_LINE') IS NOT NULL
    BEGIN
        UPDATE l SET l.ma_hang = d.ma_goc
        FROM GOI_HD_LINE l JOIN #doi_ma d ON d.ma_duoi = l.ma_hang;
        PRINT N'    GOI_HD_LINE: đã trỏ ' + CAST(@@ROWCOUNT AS NVARCHAR(10)) + N' dòng về mã gốc';
    END

    -- B3. Xóa dòng đuôi khỏi danh mục — giờ mới an toàn vì không còn ai trỏ tới.
    DELETE h FROM DM_HANG_NB h JOIN #doi_ma d ON d.ma_duoi = h.ma_hang;
    PRINT N'[+] DM_HANG_NB: đã bỏ ' + CAST(@@ROWCOUNT AS NVARCHAR(10)) + N' mã đuôi -2/-3';

    DROP TABLE #doi_ma;
    COMMIT;
END
ELSE PRINT N'[=] DM_HANG_NB: không có mã đuôi -2/-3, bỏ qua bước gộp';
GO

IF NOT EXISTS (SELECT 1 FROM SCHEMA_VERSION WHERE Ver = 11)
    INSERT INTO SCHEMA_VERSION (Ver) VALUES (11);
GO
