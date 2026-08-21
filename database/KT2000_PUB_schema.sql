/* ===========================================================================
   KT2000_PUB - Database CHUNG cho máy học (DINH_KHOAN, sau này TIM_TEN_HANG)
   ===========================================================================
   - Model định khoản là model CHUNG toàn hệ thống (MA_DONVI là 1 feature)
     -> training data KHÔNG nằm trong DB tenant, nằm ở đây.
   - Thay thế DATA_TRAIN.xlsx (Sheet1 -> DK_DATA_TRAIN, BLACKLIST ->
     DK_BLACKLIST, 3.AUDIT_LOG -> DK_AUDIT_LOG).
   - Chạy từng bước, đọc kỹ comment trước khi chạy.
   - Việc đổi tên cột proba -> pred_conf trong HOA_DON_LINE (mọi DB tenant)
     nằm ở SCRIPT ĐÁNH SỐ RIÊNG trong database/ của repo (xem file
     0XX_doi_ten_proba_pred_conf.sql kèm theo - dev claim số theo quy tắc).
   =========================================================================== */

-- BƯỚC 1: Tạo database (chạy 1 lần)
IF DB_ID('KT2000_PUB') IS NULL
    CREATE DATABASE KT2000_PUB;
GO
USE KT2000_PUB;
GO

/* ---------------------------------------------------------------------------
   BẢNG 1: DK_DATA_TRAIN  (thay Sheet1 của DATA_TRAIN.xlsx - hiện ~53.7K dòng)
   ---------------------------------------------------------------------------
   ten_norm: bản normalize của ten_uni do C# tính (NFC + lower + gộp space,
   port từ dk_core.normalize_for_match), dùng làm key check DUPLICATE/CONFLICT
   lúc user chốt cuối tuần.
   KHÔNG unique index (ten_norm, vao_ra, ma_donvi): record CONFLICT được phép
   append thêm dòng mới cùng key khác label - lúc train, dedup "last write
   wins" sẽ lấy bản mới nhất (vì vậy C# export train phải ORDER BY id ASC).
--------------------------------------------------------------------------- */
CREATE TABLE dbo.DK_DATA_TRAIN (
    id          BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    ten_uni     NVARCHAR(500)  NOT NULL,
    ten_norm    NVARCHAR(500)  NOT NULL,
    vao_ra      CHAR(1)        NOT NULL CONSTRAINT CK_DKDT_vao_ra CHECK (vao_ra IN ('V','R')),
    ma_donvi    NVARCHAR(50)   NOT NULL,
    label       NVARCHAR(10)   NOT NULL,
    mo_ta       NVARCHAR(500)  NULL,     -- user ghi: giải thích tại sao ĐK như vậy
    is_conflict BIT            NOT NULL CONSTRAINT DF_DKDT_conflict DEFAULT (0),
    notes       NVARCHAR(500)  NULL,     -- máy ghi: "CONFLICT: was X, now Y"
    status      VARCHAR(16)    NOT NULL CONSTRAINT DF_DKDT_status DEFAULT ('ACTIVE')
                    CONSTRAINT CK_DKDT_status CHECK (status IN ('ACTIVE','CHO_GIAI_THICH')),
    created_at  DATETIME2(0)   NOT NULL CONSTRAINT DF_DKDT_created DEFAULT (SYSDATETIME()),
    created_by  NVARCHAR(50)   NULL,     -- username web đã chốt dòng này
    last_hit_at DATE           NULL      -- lần cuối tầng LOOKUP dùng dòng này (đo để 2 năm nữa quyết lọc train bằng số liệu)
);
/* LUẬT CHÚ THÍCH BẮT BUỘC (Hiu, 18/08):
   Dòng CONFLICT (cùng tên, lúc ĐK thế này lúc ĐK thế khác) insert với
   status = 'CHO_GIAI_THICH'. User phải điền giải thích vào mo_ta
   ("tại sao lần này ĐK khác") -> C# chuyển status = 'ACTIVE'.
   Export train CHỈ lấy status = 'ACTIVE' -> dòng chưa giải thích
   KHÔNG BAO GIỜ vào model. */
GO
CREATE INDEX IX_DKDT_lookup ON dbo.DK_DATA_TRAIN (ten_norm, vao_ra, ma_donvi)
    INCLUDE (label);
CREATE INDEX IX_DKDT_donvi  ON dbo.DK_DATA_TRAIN (ma_donvi);
GO

/* ---------------------------------------------------------------------------
   BẢNG 2: DK_BLACKLIST  (thay sheet BLACKLIST + DEFAULT_BLACKLIST hardcode)
   ---------------------------------------------------------------------------
   LƯU Ý QUAN TRỌNG: sheet BLACKLIST trong DATA_TRAIN.xlsx hiện tại RỖNG -
   danh sách đang chạy thực tế là DEFAULT_BLACKLIST hardcode trong
   05_audit_data_train.py. Seed bên dưới chép đúng từ đó để hành vi
   không đổi khi sang web.
   pattern lưu ở dạng ĐÃ NORMALIZE (lowercase) - C# so với ten_norm.
--------------------------------------------------------------------------- */
CREATE TABLE dbo.DK_BLACKLIST (
    id          INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    [type]      VARCHAR(12)    NOT NULL CONSTRAINT CK_DKBL_type
                    CHECK ([type] IN ('EXACT','CONTAINS','TRIM_AFTER')),
    pattern     NVARCHAR(200)  NOT NULL,
    description NVARCHAR(200)  NULL,
    is_active   BIT            NOT NULL CONSTRAINT DF_DKBL_active DEFAULT (1),
    created_at  DATETIME2(0)   NOT NULL CONSTRAINT DF_DKBL_created DEFAULT (SYSDATETIME())
);
GO

INSERT INTO dbo.DK_BLACKLIST ([type], pattern, description) VALUES
-- CONTAINS: chua cum nay -> loai khoi training
(N'CONTAINS', N'hóa đơn điều chỉnh giảm',    N'Cau ghi chu HD dieu chinh giam'),
(N'CONTAINS', N'hóa đơn điều chỉnh tăng',    N'Cau ghi chu HD dieu chinh tang'),
(N'CONTAINS', N'hóa đơn thay thế cho',       N'Cau ghi chu HD thay the'),
(N'CONTAINS', N'điều chỉnh cho hóa đơn',     N'Ghi chu dieu chinh'),
(N'CONTAINS', N'phần mềm hóa đơn điện tử',   N'Phan mem HDDT'),
(N'CONTAINS', N'tổng cộng tiền hàng',        N'Dong tong cong'),
(N'CONTAINS', N'tổng cộng:',                 N'Dong tong cong'),
(N'CONTAINS', N'tổng tiền hàng',             N'Dong tong tien'),
(N'CONTAINS', N'thành tiền:',                N'Dong thanh tien'),
(N'CONTAINS', N'thuế suất gtgt',             N'Ghi chu thue'),
(N'CONTAINS', N'số tiền viết bằng chữ',      N'Ghi chu so tien chu'),
(N'CONTAINS', N'người mua hàng',             N'Phan ky nguoi mua'),
(N'CONTAINS', N'người bán hàng',             N'Phan ky nguoi ban'),
(N'CONTAINS', N'mã số thuế người mua',       N'Thong tin MST'),
-- EXACT: bang dung -> loai
(N'EXACT', N'????',  N'Ky tu rac'),
(N'EXACT', N'kddv',  N'Viet tat noi bo'),
(N'EXACT', N'sxxd',  N'Viet tat noi bo'),
(N'EXACT', N'hdh',   N'Viet tat noi bo'),
(N'EXACT', N'hdck',  N'Viet tat noi bo'),
(N'EXACT', N'hđck',  N'Viet tat noi bo'),
(N'EXACT', N'hđhck', N'Viet tat noi bo'),
(N'EXACT', N'sxkp',  N'Viet tat noi bo'),
(N'EXACT', N'tsca',  N'Viet tat noi bo'),
(N'EXACT', N'#n/a',  N'Loi Excel'),
(N'EXACT', N'11',    N'So rac'),
(N'EXACT', N'60',    N'So rac'),
(N'EXACT', N'90',    N'So rac'),
-- TRIM_AFTER: cat tu cum nay ve sau (thu tu dai -> ngan de match dung)
(N'TRIM_AFTER', N'điều chỉnh tăng từ vnd', N'Cat phan dieu chinh gia'),
(N'TRIM_AFTER', N'điều chỉnh giảm từ vnd', N'Cat phan dieu chinh gia'),
(N'TRIM_AFTER', N'điều chỉnh tăng từ',     N'Cat phan dieu chinh gia'),
(N'TRIM_AFTER', N'điều chỉnh giảm từ',     N'Cat phan dieu chinh gia');
GO

/* ---------------------------------------------------------------------------
   BẢNG 3: DK_AUDIT_LOG  (thay sheet 3.AUDIT_LOG)
--------------------------------------------------------------------------- */
CREATE TABLE dbo.DK_AUDIT_LOG (
    id          BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    ts          DATETIME2(0)   NOT NULL CONSTRAINT DF_DKAL_ts DEFAULT (SYSDATETIME()),
    action      VARCHAR(20)    NOT NULL,   -- NEW/CONFLICT/REJECT_BLACKLIST/TRIMMED/REJECT_INVALID
    vao_ra      CHAR(1)        NULL,
    ten_uni     NVARCHAR(500)  NULL,
    label_new   NVARCHAR(10)   NULL,
    label_old   NVARCHAR(10)   NULL,
    ma_donvi    NVARCHAR(50)   NULL,
    reason      NVARCHAR(400)  NULL,
    user_name   NVARCHAR(50)   NULL
);
GO
CREATE INDEX IX_DKAL_ts ON dbo.DK_AUDIT_LOG (ts);
GO
