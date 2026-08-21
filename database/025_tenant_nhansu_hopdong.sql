-- 025_tenant_nhansu_hopdong.sql — NHAN_SU + HOP_DONG trong database ĐƠN VỊ-NĂM
--                                  (SCHEMA_VERSION = 18)
--
-- CHẠY CHO: mọi database ĐƠN VỊ-NĂM <MÃ>_<NĂM>. VaCauTrucService tự chạy khi vào màn.
--     sqlcmd -S <server> -d <MÃ>_<NĂM> -i 025_tenant_nhansu_hopdong.sql
--
-- VÌ SAO NẰM Ở DATABASE ĐƠN VỊ-NĂM chứ không phải KT2000_Base: nhân sự là dữ liệu CỦA
-- đơn vị, không phải danh mục tham khảo dùng chung như DM_TK. Base chỉ giữ những thứ
-- mọi đơn vị cùng tra (tài khoản, hàng hóa) hoặc thứ kế toán DỊCH VỤ theo dõi chéo
-- nhiều đơn vị trên một lưới (TOKHAI). Hồ sơ lao động không thuộc hai loại đó.
--
-- HỆ QUẢ PHẢI BIẾT: database tách theo NĂM nên nhân sự cũng theo năm. Mở năm 2027 thì
-- <MÃ>_2027 có hai bảng RỖNG, không tự mang nhân sự 2026 sang. Đây là đánh đổi đã chấp
-- nhận (chốt Trường 20/08) — khuôn Excel gốc cũng một file một năm (HDLD_2024,
-- HDLD_2025), nên đúng thói quen kế toán đang làm. Muốn dùng lại thì sao chép sang năm
-- mới. Nếu sau này thấy vướng, chỗ sửa là đọc/ghi luôn ở năm gốc của đơn vị chứ không
-- phải chuyển bảng sang Base.
--
-- CẤU TRÚC lấy từ khuôn Excel kế toán đang dùng:
--   test/hopdong/Copy of HDLD_2025_VINH_HOAN.xlsx — mỗi nhân sự MỘT sheet, cùng một
--   mẫu HĐLĐ. So hai sheet thì chỉ 7 ô đổi theo người: số HĐ (A2), họ tên (D10 và C66),
--   ngày sinh (C11), nghề nghiệp (C12 và F20), số CMND (C13). Phần còn lại là mẫu cố
--   định của đơn vị — vì vậy tách làm hai bảng: NHAN_SU giữ phần thuộc về NGƯỜI,
--   HOP_DONG giữ phần thuộc về LẦN KÝ (lương, thời hạn, phụ cấp).
--
-- KHÔNG có cột ma_donvi: cả database đã là của một đơn vị rồi, thêm cột đó là thừa và
-- mở đường cho dữ liệu đơn vị khác lọt vào nhầm chỗ.
--
-- AN TOÀN: chỉ TẠO MỚI hai bảng chưa từng có. Không sửa, không xóa bảng nào đang chạy.
-- Chạy lại nhiều lần vô hại (có rào IF ... IS NULL).
--
-- RÀO DB_NAME(): chặn chạy nhầm vào KT2000_Base hay KT2000_Master — hai database đó
-- không phải sổ đơn vị.

IF DB_NAME() NOT IN ('KT2000_Base', 'KT2000_Master', 'master', 'msdb', 'model', 'tempdb')
   AND OBJECT_ID('NHAN_SU') IS NULL
BEGIN
    CREATE TABLE NHAN_SU (
        id            INT IDENTITY(1,1) PRIMARY KEY,

        -- Mã nhân sự do kế toán tự đặt (NV001…). Cho NULL vì khuôn Excel không có cột
        -- này: nhập từ file cũ sang thì chưa có mã, bắt buộc thì không nhập nổi.
        ma_ns         NVARCHAR(30)  NULL,

        ho_ten        NVARCHAR(200) NOT NULL,
        ngay_sinh     DATE          NULL,
        gioi_tinh     NVARCHAR(10)  NULL,
        quoc_tich     NVARCHAR(100) NULL,       -- khuôn Excel K10, mặc định N'Việt Nam'

        -- CMND/CCCD: NVARCHAR chứ không số. Số CMND có thể bắt đầu bằng 0 (khuôn Excel
        -- có '010190004409') — để kiểu số là mất chữ số đầu.
        so_cmnd       NVARCHAR(20)  NULL,
        ngay_cap      DATE          NULL,
        noi_cap       NVARCHAR(200) NULL,

        dia_chi       NVARCHAR(400) NULL,
        dien_thoai    NVARCHAR(50)  NULL,
        email         NVARCHAR(200) NULL,
        so_bhxh       NVARCHAR(50)  NULL,
        mst_ns        NVARCHAR(20)  NULL,       -- MST cá nhân, để tính thuế TNCN sau

        -- Nghề nghiệp (C12) và chức danh chuyên môn (F20) trong khuôn Excel LUÔN bằng
        -- nhau ở cả 12 sheet đã kiểm, nhưng vẫn tách hai cột: đó là hai khái niệm khác
        -- nhau trên tờ HĐLĐ, gộp lại thì lúc cần khác nhau không tách ra được nữa.
        nghe_nghiep   NVARCHAR(200) NULL,
        chuc_danh     NVARCHAR(200) NULL,
        chuc_vu       NVARCHAR(200) NULL,       -- J20 'Chức vụ (nếu có)'
        bo_phan       NVARCHAR(200) NULL,

        dang_lam      BIT           NOT NULL DEFAULT 1,
        ngay_vao      DATE          NULL,
        ngay_nghi     DATE          NULL,
        ghi_chu       NVARCHAR(500) NULL,

        created_by    NVARCHAR(50)  NULL,
        created_at    DATETIME2     NOT NULL DEFAULT SYSDATETIME(),
        updated_by    NVARCHAR(50)  NULL,
        updated_at    DATETIME2     NULL
    );

    -- Mở màn là lọc người đang làm rồi sắp theo tên — index đúng thứ tự đó.
    CREATE INDEX IX_NHAN_SU_dang_lam ON NHAN_SU (dang_lam, ho_ten);
END
GO

IF DB_NAME() NOT IN ('KT2000_Base', 'KT2000_Master', 'master', 'msdb', 'model', 'tempdb')
   AND OBJECT_ID('HOP_DONG') IS NULL
BEGIN
    CREATE TABLE HOP_DONG (
        id            INT IDENTITY(1,1) PRIMARY KEY,

        -- Trỏ sang NHAN_SU. KHÔNG dùng ON DELETE CASCADE: xóa một người mà kéo theo
        -- hợp đồng đã ký là mất chứng từ — hợp đồng phải giữ kể cả khi người đã nghỉ.
        nhan_su_id    INT           NOT NULL,

        -- 'Số : 01.2025' trong khuôn Excel (ô A2). Giữ nguyên chuỗi kế toán gõ thay vì
        -- tách số/năm: mỗi đơn vị đánh số một kiểu, tách ra là ép họ theo khuôn của mình.
        so_hd         NVARCHAR(50)  NULL,
        ngay_ky       DATE          NULL,

        loai_hd       NVARCHAR(100) NULL,       -- D16 'Có thời hạn' / 'Không thời hạn'
        tu_ngay       DATE          NULL,
        den_ngay      DATE          NULL,

        dia_diem_lv   NVARCHAR(400) NULL,       -- C18
        cong_viec     NVARCHAR(1000) NULL,      -- A21/A22 'Công việc phải làm'
        thoi_gian_lv  NVARCHAR(100) NULL,       -- C24 '48 giờ/tuần.'
        phuong_tien   NVARCHAR(200) NULL,       -- E29 'Cá nhân tự túc'

        -- TIỀN: DECIMAL(18,0) — đồng VN không có phần lẻ, nhưng để kiểu tiền cho cộng
        -- trừ với các cột tiền khác khỏi phải ép kiểu. Cùng lối bảng TOKHAI.
        luong_chinh   DECIMAL(18,0) NULL,       -- F30
        pc_an_ca      DECIMAL(18,0) NULL,       -- F33
        pc_dien_thoai DECIMAL(18,0) NULL,       -- F34
        pc_xang_xe    DECIMAL(18,0) NULL,       -- F35
        pc_khac       DECIMAL(18,0) NULL,

        hinh_thuc_tra NVARCHAR(300) NULL,
        bao_ho_ld     NVARCHAR(300) NULL,
        thoa_thuan    NVARCHAR(2000) NULL,

        -- Bên sử dụng lao động: chụp lại tại thời điểm ký, KHÔNG tra sang Master lúc in.
        -- Giám đốc đổi người thì hợp đồng cũ vẫn phải in ra đúng tên người đã ký.
        nsdld_ho_ten  NVARCHAR(200) NULL,       -- D6
        nsdld_chuc_vu NVARCHAR(200) NULL,       -- B7
        nsdld_dai_dien NVARCHAR(400) NULL,      -- B8 tên công ty
        nsdld_dia_chi NVARCHAR(400) NULL,       -- B9

        trang_thai    NVARCHAR(30)  NULL,       -- 'hieu_luc' | 'het_han' | 'da_huy'
        ghi_chu       NVARCHAR(500) NULL,

        created_by    NVARCHAR(50)  NULL,
        created_at    DATETIME2     NOT NULL DEFAULT SYSDATETIME(),
        updated_by    NVARCHAR(50)  NULL,
        updated_at    DATETIME2     NULL,

        CONSTRAINT FK_HOP_DONG_NHAN_SU FOREIGN KEY (nhan_su_id)
            REFERENCES NHAN_SU (id)
    );

    CREATE INDEX IX_HOP_DONG_ngay_ky ON HOP_DONG (ngay_ky DESC);
    CREATE INDEX IX_HOP_DONG_ns      ON HOP_DONG (nhan_su_id);
END
GO

-- SCHEMA_VERSION là DANH SÁCH các bản đã chạy, mỗi bản một dòng (xem VaCauTrucService),
-- không phải một ô đè lên nhau. Chèn 18 nếu chưa có.
--
-- Số 18 lấy từ việc TRA DATABASE THẬT ngày 20/08: cao nhất đang là 17
-- (USA_MEVA_2026, DAT_VIET_THANH_2026 — bản vá 024 bốn số lẻ). Xem cảnh báo dài ở đầu
-- VaCauTrucService.CAC_BAN_VA để hiểu vì sao KHÔNG được suy số từ thư mục database/.
IF DB_NAME() NOT IN ('KT2000_Base', 'KT2000_Master', 'master', 'msdb', 'model', 'tempdb')
   AND OBJECT_ID('SCHEMA_VERSION') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM SCHEMA_VERSION WHERE Ver = 18)
    INSERT INTO SCHEMA_VERSION (Ver) VALUES (18);
GO
