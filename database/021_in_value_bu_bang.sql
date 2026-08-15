-- 021_in_value_bu_bang.sql — bù hai bảng IN_VALUE / IN_VALUE_LINE (SCHEMA_VERSION = 15)
--
-- CHẠY CHO: mọi database ĐƠN VỊ-NĂM. VaCauTrucService tự chạy khi nạp.
--
-- VÌ SAO: hai bảng này có trong script 007 và trong khuôn 010, nhưng bốn database
-- dựng sớm hơn (HA_THAI_2025, HA_THAI_2026, HA_THAI_CN1_2025, CONG_TY_B_2025) chưa
-- hề có — chúng ra đời trước khi 007 được viết. Nay có hàm ghi đối chiếu bản gốc TCT
-- nên thiếu bảng là nạp hỏng, mà hỏng ở đúng bốn đơn vị chứ không phải cả loạt: loại
-- lỗi khó thấy nhất.
--
-- Khuôn dưới đây PHẢI khớp từng cột với 010_tenant_template_v6.sql. Sửa một bên mà
-- quên bên kia thì database mới và database cũ lệch nhau, và không ai biết cho tới
-- lúc một câu SELECT chết trên đúng một nửa số đơn vị.
--
-- Chạy lại nhiều lần vô hại: chỉ tạo khi bảng chưa tồn tại.

IF OBJECT_ID('IN_VALUE') IS NULL
BEGIN
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
END
GO

IF OBJECT_ID('IN_VALUE_LINE') IS NULL
BEGIN
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
    CREATE INDEX IX_IVL_hd   ON IN_VALUE_LINE(khhd, so_hd, mst);
    CREATE INDEX IX_IVL_mahd ON IN_VALUE_LINE(ma_hd);
END
GO

-- Số 15: tra database thật trước khi đặt (cao nhất đang là 14 — pt_vat INT).
-- Phải KHỚP với mảng CAC_BAN_VA trong VaCauTrucService.cs.
-- Điều kiện IN_VALUE_LINE: database TRỐNG RỖNG (chưa có bảng nào) thì không đóng dấu
-- version — bài học script 017, đóng dấu sớm là bản vá sau bỏ qua database đó vĩnh viễn.
IF OBJECT_ID('IN_VALUE_LINE') IS NOT NULL
   AND OBJECT_ID('SCHEMA_VERSION') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM SCHEMA_VERSION WHERE Ver = 15)
    INSERT INTO SCHEMA_VERSION (Ver) VALUES (15);
GO
