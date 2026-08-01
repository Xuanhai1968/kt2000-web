-- 007_tenant_schema_v4.sql — IN_VALUE / IN_VALUE_LINE (đối chiếu bản gốc TCT)
-- Nhánh 1 = HOA_DON (nạp từ Excel tổng API, user có thể sửa/xóa khi hạch toán)
-- Nhánh 2 = 5 file Excel gốc TCT trong raw\ (CM/KM/MTT + RA thường/MTT, dữ liệu từ dòng 7)
-- So nhau để phát hiện thiếu/lệch. Đã tinh gọn: bỏ 8 cột vết cũ (thay bộ tứ audit),
-- bỏ full_name, ma_kh. Chạy trên từng database đơn vị-năm (sau 005).

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
CREATE INDEX IX_IVL_hd ON IN_VALUE_LINE(khhd, so_hd, mst);
CREATE INDEX IX_IVL_mahd ON IN_VALUE_LINE(ma_hd);
GO

-- BR-HD-01 (ghi nhận tại đây, thi hành ở Importer + vá py #6):
-- Danh tính hóa đơn = (hướng, MST người phát hành, ký hiệu mẫu số, ký hiệu HĐ, số HĐ).
-- MA_HD mới = <HUONG>_<MST phát hành>_<KIEU>_<KHHD>_<SO_HD>.
-- Unique index tương ứng trên HOA_DON sẽ thêm ở script sau, cùng lúc viết Importer
-- (khi chốt tên cột mapping Excel tổng → HOA_DON).

UPDATE SCHEMA_VERSION SET Ver = 4;
GO
