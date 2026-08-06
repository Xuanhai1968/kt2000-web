-- 015_nb_hoadon_goi.sql — đơn hàng NB trên khuôn HOA_DON + gói hàng (SCHEMA_VERSION = 9)
--
-- SPEC-KT2000-NB mục 4 (chốt v0.3): đơn hàng NB KHÔNG có bảng riêng — dùng chung khuôn
-- HOA_DON/HOA_DON_LINE. File này vá khuôn chung cho đủ chỗ chứa đơn NB, rồi dựng bộ
-- bảng gói hàng (BR-NB-08).
--
-- ============================ PHẠM VI: KHÔNG DÍNH GÌ TỚI SỔ THUẾ ============================
-- SPEC mục 4 mở đầu bằng "TRONG DB TENANT NB (<MA>_NB_<năm>)" — toàn bộ mục 4 nói về
-- database RIÊNG của tenant NB. Trong đó KHÔNG hề có hóa đơn thuế: hóa đơn thuế chỉ vào
-- database qua ImportService, mà console nạp HĐ chỉ chạy trên instance thuế trong LAN
-- và chỉ ghi vào database của tenant thuế được chọn. NB là hai sổ tách bạch (BR-NB-04).
--
-- Vì vậy file này chỉ có nghĩa với database NB. Nó VẪN chạy cho mọi tenant theo AD-NB-09
-- (bảng/cột rỗng vô hại), nhưng mọi thao tác ĐỘNG CHẠM tới thứ đang có đều được rào lại
-- để database thuế đi qua mà không suy chuyển gì:
--   - Thêm cột mới: nullable, không đụng dữ liệu cũ -> chạy ở đâu cũng vô hại.
--   - Dựng bảng GOI_HD/GOI_HD_LINE: bảng mới toanh -> vô hại.
--   - Sửa cột tính `huong` + index UX_HOA_DON_BR01: CHỈ làm khi bảng HOA_DON CHƯA CÓ
--     hóa đơn thuế nào. Database thuế đang chạy thật sẽ KHÔNG bao giờ vào khối đó.
--
-- ============================ NGỮ NGHĨA CỘT VỚI ĐƠN NB ============================
--   ma_hd    = SỐ ĐƠN hiển thị/in, kiểu V125 / R236 (chốt 9.7)
--   so_hd    } vô nghĩa với NB — LUÔN TRỐNG (SPEC mục 4)
--   khhd     }
--   mst      }
--   ngay_nh  = ngày hàng THẬT SỰ rời kho (BR-NB-07) — mốc trừ tồn/tính giá vốn.
--              Tạo đơn CHƯA trừ kho; thủ kho đánh ngay_nh thì engine mới trừ.
--   tthai_hd = bộ trạng thái đơn NB (chốt khi viết spec form Tạo đơn)
--
-- Chạy lại được nhiều lần. Chạy sau 010 (khuôn) và 013/014 (danh mục NB).

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

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
