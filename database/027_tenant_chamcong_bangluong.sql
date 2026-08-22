-- 027_tenant_chamcong_bangluong.sql — CHAM_CONG + BANG_LUONG trong database ĐƠN VỊ-NĂM
--                                      (SCHEMA_VERSION = 20)
--
-- CHẠY CHO: mọi database ĐƠN VỊ-NĂM <MÃ>_<NĂM>. VaCauTrucService tự chạy khi vào màn.
--     sqlcmd -S <server> -d <MÃ>_<NĂM> -i 027_tenant_chamcong_bangluong.sql
--
-- Spec: docs/THUE/HOPDONG/SPEC-HOP-DONG-CHAM-CONG-LUONG.md (mục 6.3, 6.4).
-- Đi cùng script 026 (NHAN_SU + HOP_DONG) — hai bảng dưới đây đều trỏ về NHAN_SU.
--
-- CẤU TRÚC lấy từ khuôn Excel kế toán đang dùng:
--   test/hopdong/BANG_LUONG_2025_VINH_HOAN_BAN_IN.xls — 26 sheet:
--     DS_NV · THANG 1..12 (bảng lương) · cc01..cc12 (chấm công) · tonghop
--
-- AN TOÀN: chỉ TẠO MỚI hai bảng chưa từng có. Chạy lại nhiều lần vô hại.

IF DB_NAME() NOT IN ('KT2000_Base', 'KT2000_Master', 'master', 'msdb', 'model', 'tempdb')
   AND OBJECT_ID('CHAM_CONG') IS NULL
BEGIN
    -- BR-CC-01: MỘT DÒNG = (nhân sự, tháng). 31 cột ngày nằm NGANG trên một dòng,
    -- không phải 31 dòng dọc. Khuôn Excel là ma trận người × ngày; tách dòng thì
    -- không in ra đúng mẫu được và mọi câu tổng hợp phải PIVOT.
    CREATE TABLE CHAM_CONG (
        id            INT IDENTITY(1,1) PRIMARY KEY,
        nhan_su_id    INT NOT NULL,
        thang         INT NOT NULL,          -- 1..12

        -- Ký hiệu chấm công theo Thông tư 200 mẫu 01a-LĐTL (spec mục 5.2).
        -- NVARCHAR(4) chứ không CHAR(1): bộ ký hiệu có 'Cô', 'TS', 'NB', 'LĐ' —
        -- hai ký tự tiếng Việt có dấu. Đơn vị VĨNH HOÀN dùng khuôn rút gọn
        -- '1' / '0' / 'CN' / 'L', vẫn nằm gọn trong 4 ký tự.
        --
        -- 31 cột RỜI chứ không một cột JSON: kế toán phải lọc/sửa từng ngày trên
        -- lưới, và câu SELECT phải đọc được bằng SSMS khi đối chiếu tay với Excel.
        ngay_01 NVARCHAR(4) NULL, ngay_02 NVARCHAR(4) NULL, ngay_03 NVARCHAR(4) NULL,
        ngay_04 NVARCHAR(4) NULL, ngay_05 NVARCHAR(4) NULL, ngay_06 NVARCHAR(4) NULL,
        ngay_07 NVARCHAR(4) NULL, ngay_08 NVARCHAR(4) NULL, ngay_09 NVARCHAR(4) NULL,
        ngay_10 NVARCHAR(4) NULL, ngay_11 NVARCHAR(4) NULL, ngay_12 NVARCHAR(4) NULL,
        ngay_13 NVARCHAR(4) NULL, ngay_14 NVARCHAR(4) NULL, ngay_15 NVARCHAR(4) NULL,
        ngay_16 NVARCHAR(4) NULL, ngay_17 NVARCHAR(4) NULL, ngay_18 NVARCHAR(4) NULL,
        ngay_19 NVARCHAR(4) NULL, ngay_20 NVARCHAR(4) NULL, ngay_21 NVARCHAR(4) NULL,
        ngay_22 NVARCHAR(4) NULL, ngay_23 NVARCHAR(4) NULL, ngay_24 NVARCHAR(4) NULL,
        ngay_25 NVARCHAR(4) NULL, ngay_26 NVARCHAR(4) NULL, ngay_27 NVARCHAR(4) NULL,
        ngay_28 NVARCHAR(4) NULL, ngay_29 NVARCHAR(4) NULL, ngay_30 NVARCHAR(4) NULL,
        ngay_31 NVARCHAR(4) NULL,

        -- BR-CC-03: hệ thống tính, KHÔNG cho gõ tay. Để kế toán gõ thì bảng lương và
        -- bảng chấm công lệch nhau mà không ai biết dòng nào sai.
        -- DECIMAL(9,2) chứ không INT: nửa công (0,5) là chuyện thường.
        tong_cong     DECIMAL(9,2) NULL,

        -- Giờ làm thêm (Điều 98 BLLĐ: 150% ngày thường / 200% ngày nghỉ / 300% lễ).
        -- Khuôn VĨNH HOÀN CHƯA có cột này — chừa sẵn để bật khi có đơn vị thật cần,
        -- khỏi phải thêm bản vá mới lúc đó. Xem spec mục 9.
        cong_them_gio DECIMAL(9,2) NULL,

        ghi_chu       NVARCHAR(500) NULL,

        created_by    NVARCHAR(50)  NULL,
        created_at    DATETIME2     NOT NULL DEFAULT SYSDATETIME(),
        updated_by    NVARCHAR(50)  NULL,
        updated_at    DATETIME2     NULL,

        CONSTRAINT FK_CHAM_CONG_NHAN_SU FOREIGN KEY (nhan_su_id)
            REFERENCES NHAN_SU (id),
        CONSTRAINT CK_CHAM_CONG_thang CHECK (thang BETWEEN 1 AND 12),
        -- Một người một tháng CHỈ MỘT dòng. Thiếu ràng buộc này thì bấm "Khởi tạo"
        -- hai lần là có hai bảng chấm công cùng tháng, bảng lương lấy nhầm bản nào
        -- cũng không ai biết.
        CONSTRAINT UQ_CHAM_CONG UNIQUE (nhan_su_id, thang)
    );

    -- Mở màn là lọc theo tháng — index đúng cột đó.
    CREATE INDEX IX_CHAM_CONG_thang ON CHAM_CONG (thang);
END
GO

IF DB_NAME() NOT IN ('KT2000_Base', 'KT2000_Master', 'master', 'msdb', 'model', 'tempdb')
   AND OBJECT_ID('BANG_LUONG') IS NULL
BEGIN
    CREATE TABLE BANG_LUONG (
        id             INT IDENTITY(1,1) PRIMARY KEY,
        nhan_su_id     INT NOT NULL,
        thang          INT NOT NULL,

        -- Chụp lại tại thời điểm tính: người có thể đổi bộ phận giữa năm, mà bảng
        -- lương tháng 3 phải in ra đúng bộ phận hồi tháng 3.
        bo_phan        NVARCHAR(200) NULL,

        -- BR-BL-01: NGÀY CÔNG CHUẨN là THAM SỐ của từng bảng, KHÔNG phải hằng số.
        -- Khuôn VĨNH HOÀN tháng 01/2025 dùng 21; tháng khác sẽ khác. Điều 54 NĐ
        -- 145/2020 cho doanh nghiệp tự chọn (24, 26, hoặc số ngày làm việc bình
        -- thường của tháng). Viết cứng 21 hay 26 vào code là sai với mọi tháng khác.
        ngay_cong_chuan DECIMAL(9,2) NOT NULL,
        ngay_cong_tt    DECIMAL(9,2) NULL,     -- NCTT — lấy từ CHAM_CONG.tong_cong

        luong_chinh    DECIMAL(18,0) NULL,

        -- BR-BL-02: luong_thuc_te = luong_chinh × ngay_cong_tt / ngay_cong_chuan.
        -- Cột DUY NHẤT dùng scale 2 — đây là chỗ phép chia sinh phần lẻ. Đối chiếu
        -- số thật (THANG 1/2025, chuẩn 21): Hiền 20 công → 5.310.000 × 20/21 =
        -- 5.057.142,857 (khớp ô F10). Làm tròn sớm ở đây thì Tổng lương lệch vài
        -- đồng so với bản kế toán đang phát cho người lao động.
        luong_thuc_te  DECIMAL(18,2) NULL,

        -- BR-BL-03: ăn ca theo NGÀY CÔNG THỰC TẾ (19 × 25.000 = 475.000, khớp ô G14);
        -- các phụ cấp còn lại trọn tháng, không chia theo công.
        pc_an_ca       DECIMAL(18,0) NULL,
        pc_dien_thoai  DECIMAL(18,0) NULL,
        pc_xang_xe     DECIMAL(18,0) NULL,
        pc_chuyen_can  DECIMAL(18,0) NULL,
        pc_hieu_qua    DECIMAL(18,0) NULL,
        tien_thuong    DECIMAL(18,0) NULL,
        tong_phu_cap   DECIMAL(18,0) NULL,

        tong_luong     DECIMAL(18,0) NULL,

        tam_ung        DECIMAL(18,0) NULL,

        -- BR-BL-04: BHXH 8% + BHYT 1,5% + BHTN 1% = 10,5% tính trên LƯƠNG CHÍNH,
        -- KHÔNG trên lương thực tế. Đây là chỗ dễ code sai nhất của cả module: nhìn
        -- qua tưởng phải nhân theo ngày công như lương.
        --   Bằng chứng trong khuôn: Hồi chỉ 19 công (lương thực tế 4.804.285) nhưng
        --   ô P14 vẫn là 557.550 = 5.310.000 × 10,5%, đúng bằng người đủ công.
        -- BR-BL-05: lương vượt trần (20 lần mức tham chiếu = 46,8 triệu/tháng theo
        -- mức 2026) thì lấy TRẦN để tính, không lấy lương thật.
        khau_tru_bh    DECIMAL(18,0) NULL,

        -- BR-BL-08: mặc định 0, kế toán tự nhập. KHÔNG tự tính — muốn đúng cần số
        -- người phụ thuộc và thu nhập lũy kế từ đầu năm, khuôn Excel không có.
        -- Khuôn VĨNH HOÀN không có cột này vì lương ~10,3 triệu, dưới ngưỡng chịu
        -- thuế sau giảm trừ bản thân 15,5 triệu (mức 2026).
        thue_tncn      DECIMAL(18,0) NULL,

        tong_khau_tru  DECIMAL(18,0) NULL,
        thuc_linh      DECIMAL(18,0) NULL,

        ghi_chu        NVARCHAR(500) NULL,

        created_by     NVARCHAR(50)  NULL,
        created_at     DATETIME2     NOT NULL DEFAULT SYSDATETIME(),
        updated_by     NVARCHAR(50)  NULL,
        updated_at     DATETIME2     NULL,

        CONSTRAINT FK_BANG_LUONG_NHAN_SU FOREIGN KEY (nhan_su_id)
            REFERENCES NHAN_SU (id),
        CONSTRAINT CK_BANG_LUONG_thang CHECK (thang BETWEEN 1 AND 12),
        -- Ngày công chuẩn 0 thì phép chia của BR-BL-02 nổ; chặn từ DB thay vì tin
        -- tầng trên luôn kiểm.
        CONSTRAINT CK_BANG_LUONG_chuan CHECK (ngay_cong_chuan > 0),
        CONSTRAINT UQ_BANG_LUONG UNIQUE (nhan_su_id, thang)
    );

    CREATE INDEX IX_BANG_LUONG_thang ON BANG_LUONG (thang);
END
GO

-- SCHEMA_VERSION là DANH SÁCH các bản đã chạy, mỗi bản một dòng (xem VaCauTrucService).
-- Số 19 nối tiếp 18 của script 025 — cả hai cùng lên trong đợt này, chưa phát hành
-- riêng lẻ nên không có database nào đang giữ 19 với nghĩa khác.
IF DB_NAME() NOT IN ('KT2000_Base', 'KT2000_Master', 'master', 'msdb', 'model', 'tempdb')
   AND OBJECT_ID('SCHEMA_VERSION') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM SCHEMA_VERSION WHERE Ver = 20)
    INSERT INTO SCHEMA_VERSION (Ver) VALUES (20);
GO
