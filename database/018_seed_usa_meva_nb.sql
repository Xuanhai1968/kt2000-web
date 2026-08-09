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

-- ============================ DM_HANG_NB — cột bổ sung ============================
-- HAI TÊN cho một mặt hàng. Dữ liệu thật của USA_Meva: 35/50 mặt hàng có hai tên khác
-- nhau, nên đây không phải trường hợp hiếm:
--
--   ten_hang (đánh đơn)                            ten_hd (lên hóa đơn)
--   --------------------------------------------   -------------------------------
--   Sơn lót nội V1( nắp trắng )                    Sơn lót nội thất
--   Kiềm nội cao cấp (nắp xanh)                    Sơn lót kháng kiềm nội thất
--   Sơn lót kháng kiềm ngoại thất KV8( nắp vàng )  Sơn lót kháng kiềm ngoại thất
--
-- Tên đánh đơn mang ghi chú thực địa (màu nắp, mã lô) để thủ kho bốc đúng thùng — thứ
-- KHÔNG được xuất hiện trên hóa đơn thuế. ten_hd là tên chuẩn đưa lên hệ thống hóa đơn
-- điện tử (Viettel). Gộp làm một cột là mất một trong hai: lấy tên kho thì hóa đơn sai
-- chuẩn, lấy tên hóa đơn thì kho bốc nhầm nắp.
--
-- Để TRỐNG = "dùng luôn ten_hang", không bắt khai lại cho mặt hàng chỉ có một tên.
IF COL_LENGTH('DM_HANG_NB', 'ten_hd') IS NULL
BEGIN
    ALTER TABLE DM_HANG_NB ADD ten_hd NVARCHAR(500) NULL;
    PRINT N'[+] DM_HANG_NB += ten_hd (tên đưa lên hóa đơn)';
END
ELSE PRINT N'[=] DM_HANG_NB.ten_hd đã có';
GO

-- ============================ HOA_DON — cột bổ sung ============================
-- HAI địa chỉ trên một phiếu (theo form gốc USA_Meva):
--   dia_chi      — địa chỉ CỬA HÀNG của khách (nơi đặt hàng, ghi trên giấy tờ)
--   dia_chi_giao — địa chỉ GIAO hàng, khi khách muốn chở tới chỗ khác (kho, công trình)
--
-- Vì sao lưu xuống ĐƠN chứ không đọc sống từ DM_KH_NB: đơn hàng là sự thật lịch sử.
-- Khách đổi địa chỉ sang năm thì đơn CŨ in lại vẫn phải ra đúng chỗ đã giao hôm đó —
-- cùng nguyên tắc với ten_kh nguyên văn trên HOA_DON (BR-NB-02).
--
-- Để trống = giao đúng địa chỉ cửa hàng (thực tế 1626/1677 khách như vậy).
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

IF NOT EXISTS (SELECT 1 FROM SCHEMA_VERSION WHERE Ver = 11)
    INSERT INTO SCHEMA_VERSION (Ver) VALUES (11);
GO
