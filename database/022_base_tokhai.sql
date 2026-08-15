-- 022_base_tokhai.sql — bảng TOKHAI ở KT2000_Base + index (thang, huong) cho HOA_DON
--
-- ============================================================================
-- SCRIPT NÀY CHẠY TRÊN HAI LOẠI DATABASE KHÁC NHAU — ĐỌC KỸ TRƯỚC KHI CHẠY:
--
--   PHẦN 1 (bảng TOKHAI) ....... chỉ KT2000_Base
--   PHẦN 2 (index HOA_DON) ..... MỌI database ĐƠN VỊ-NĂM <MÃ>_<NĂM>
--   PHẦN 3 (cột ct*_xml) ....... chỉ KT2000_Base
--
-- Vì vậy KHÔNG chạy được cả file trong một lượt bằng một connection. Cách chạy:
--   1. Chạy nguyên file này một lần (bất kỳ database nào) → phần 1 xong, phần 2
--      tự bỏ qua vì KT2000_Base không có bảng HOA_DON.
--   2. Chạy LẠI file này cho TỪNG database đơn vị-năm (-d <MÃ>_<NĂM>) → phần 1 tự
--      bỏ qua vì đã có bảng, phần 2 tạo index.
-- Cả hai phần đều có rào IF nên chạy lại nhiều lần vô hại, chạy nhầm chỗ cũng không
-- hỏng gì — chỉ đơn giản là không làm gì.
--
-- (Gộp từ hai script nháp 14–15/08 — bảng index HOA_DON và cột ct*_xml. Giữ nguyên
--  nội dung, chỉ thêm phần rào để các phần không giẫm chân nhau.)
--
-- ĐÁNH SỐ LẠI 019 → 022 (15/08): nhánh main đã có 019_hoa_don_dinh_khoan_kieu.sql,
-- 020_hoa_don_line_pt_vat_int.sql và 021_in_value_bu_bang.sql lên trước. Hai script
-- khác nhau cùng số là vi phạm luật 6 của repo và làm hỏng thứ tự chạy trên máy khác,
-- nên script này lùi xuống số còn trống kế tiếp.
-- ============================================================================
--
--
-- ############################ PHẦN 1 — BẢNG TOKHAI ##########################
--
-- VÌ SAO NẰM Ở BASE CHỨ KHÔNG PHẢI DATABASE ĐƠN VỊ-NĂM:
-- màn "Báo cáo thuế & rà soát" của MDN_NB liệt kê MỌI đơn vị trên MỘT lưới (một dòng
-- một đơn vị, xem BaoCaoThue.tsx). Nếu tờ khai nằm rải trong <MÃ>_<NĂM> thì mỗi lần
-- mở màn phải mở ~30 connection sang 30 database rồi gộp lại — vừa chậm vừa vỡ ngay
-- khi một đơn vị chưa mở năm (SqlException 4060). Để chung một bảng ở Base thì chỉ
-- một câu SELECT, và đơn vị chưa có sổ vẫn hiện dòng trống bình thường.
--
-- Base là database DÙNG CHUNG của khối khai thuế (xem TenantDbResolver.GetBaseConnection)
-- nên đây đúng chỗ: tờ khai là dữ liệu của kế toán DỊCH VỤ theo dõi chéo các đơn vị,
-- không phải sổ riêng của một đơn vị.
--
-- CẤU TRÚC lấy nguyên từ khuôn Excel kế toán đang dùng:
--   docs/THUE/TOKHAI/tkhai_2026_mau_xls.xls — 55 cột, mỗi dòng MỘT tờ khai của
--   (ma_donvi, ky_kekhai). Giữ NGUYÊN tên cột của khuôn (ct22_nnt, mst_nnt…) để đối
--   chiếu tay với file Excel gốc không phải dịch tên qua lại — cùng lối "giữ tên cột
--   VFP" của repo.
--
-- AN TOÀN: chỉ TẠO MỚI một bảng chưa từng có. Không sửa, không xóa bảng nào đang chạy.
-- Chạy lại nhiều lần vô hại (có IF NOT EXISTS).

-- PHẦN 1 chỉ chạy khi phiên ĐANG ĐỨNG Ở KT2000_Base.
--
-- KHÔNG dùng `USE KT2000_Base` ở đây: `USE` không thể đảo ngược trong cùng một file
-- (biến DECLARE không sống qua GO nên không nhớ được database ban đầu để quay về).
-- Chạy file với -d <MÃ>_<NĂM> mà có USE thì phiên kẹt lại ở Base, và PHẦN 2 bên dưới
-- đi tạo index trên Base thay vì trên database đơn vị — sai hoàn toàn mà im lặng.
--
-- Rào bằng DB_NAME() thì mỗi lượt chạy tự làm đúng phần của nó:
--   sqlcmd -d KT2000_Base    → phần 1 chạy, phần 2 tự bỏ qua (Base không có HOA_DON)
--   sqlcmd -d THAI_TUAN_2026 → phần 1 tự bỏ qua, phần 2 tạo index
IF DB_NAME() = 'KT2000_Base' AND OBJECT_ID('TOKHAI') IS NULL
BEGIN
    CREATE TABLE TOKHAI (
        -- ----- Khóa nghiệp vụ -----
        -- ma_donvi + ky_kekhai + lan_nop: một đơn vị một kỳ có thể nộp nhiều lần
        -- (lần đầu 0, bổ sung 1, 2…). Thiếu lan_nop trong khóa thì tờ khai bổ sung
        -- ghi đè mất bản gốc — mà bản gốc là thứ phải giữ để đối chiếu.
        ma_donvi      NVARCHAR(30)  NOT NULL,
        ky_kekhai     NVARCHAR(7)   NOT NULL,   -- 'MM/yyyy' đúng như khuôn Excel
        lan_nop       INT           NOT NULL DEFAULT 0,

        -- thang tách riêng khỏi ky_kekhai để LỌC và SẮP XẾP bằng số.
        -- Lọc trên chuỗi 'MM/yyyy' thì '10/2026' đứng trước '02/2026', và mọi câu
        -- WHERE tháng đều phải SUBSTRING — chậm và không dùng được index.
        -- Đơn vị khai theo QUÝ ghi tháng CUỐI quý (3, 6, 9, 12), đúng như kỳ trên
        -- tờ khai; cột này vì vậy luôn có nghĩa cho cả hai kiểu kỳ.
        thang         INT           NULL,
        nam           INT           NULL,

        -- ----- Định danh tờ khai (khối đầu khuôn Excel) -----
        ma_tk         NVARCHAR(10)  NULL,       -- '842' = mẫu 01/GTGT
        ten_tk        NVARCHAR(200) NULL,
        xml_ver       NVARCHAR(20)  NULL,       -- '2.8.3'
        loai_tk       NVARCHAR(5)   NULL,       -- 'C' = chính thức
        ma_cct        NVARCHAR(20)  NULL,       -- mã cơ quan thuế
        ten_cct       NVARCHAR(200) NULL,
        ngay_lap      DATE          NULL,

        -- ----- Người nộp thuế -----
        mst_nnt       NVARCHAR(20)  NULL,
        ten_nnt       NVARCHAR(400) NULL,
        dia_chi_nnt   NVARCHAR(400) NULL,
        huyen_nnt     NVARCHAR(200) NULL,
        tinh_nnt      NVARCHAR(200) NULL,
        sdt_nnt       NVARCHAR(50)  NULL,
        email_nnt     NVARCHAR(200) NULL,
        ma_nganh_nnt  NVARCHAR(20)  NULL,
        ten_nganh_nnt NVARCHAR(400) NULL,
        tieu_muc_nnt  NVARCHAR(20)  NULL,

        -- ----- Chỉ tiêu tờ khai 01/GTGT -----
        -- DECIMAL(18,0) chứ không BIGINT: chỉ tiêu tờ khai là TIỀN. Đồng VN không có
        -- phần lẻ nên scale 0, nhưng để kiểu tiền thì cộng/trừ với các cột tiền khác
        -- (HOA_DON.tien_vat là DECIMAL) không phải ép kiểu.
        -- ct39 giữ đúng tên khuôn Excel — XML gốc gọi ct39a, KHÔNG đổi tên ở đây để
        -- một bảng chỉ theo MỘT nguồn; chỗ đọc XML tự ánh xạ.
        ct21_nnt      DECIMAL(18,0) NULL,
        ct22_nnt      DECIMAL(18,0) NULL,       -- khấu trừ kỳ trước chuyển sang
        ct23_nnt      DECIMAL(18,0) NULL,
        ct24_nnt      DECIMAL(18,0) NULL,
        ct25_nnt      DECIMAL(18,0) NULL,
        ct26_nnt      DECIMAL(18,0) NULL,
        ct27_nnt      DECIMAL(18,0) NULL,
        ct28_nnt      DECIMAL(18,0) NULL,
        ct29_nnt      DECIMAL(18,0) NULL,
        ct30_nnt      DECIMAL(18,0) NULL,
        ct31_nnt      DECIMAL(18,0) NULL,
        ct32_nnt      DECIMAL(18,0) NULL,
        ct33_nnt      DECIMAL(18,0) NULL,
        ct32a_nnt     DECIMAL(18,0) NULL,
        ct34_nnt      DECIMAL(18,0) NULL,
        ct35_nnt      DECIMAL(18,0) NULL,
        ct36_nnt      DECIMAL(18,0) NULL,
        ct37_nnt      DECIMAL(18,0) NULL,
        ct38_nnt      DECIMAL(18,0) NULL,
        ct39_nnt      DECIMAL(18,0) NULL,
        ct40a_nnt     DECIMAL(18,0) NULL,
        ct40b_nnt     DECIMAL(18,0) NULL,
        ct40_nnt      DECIMAL(18,0) NULL,
        ct41_nnt      DECIMAL(18,0) NULL,
        ct42_nnt      DECIMAL(18,0) NULL,
        ct43_nnt      DECIMAL(18,0) NULL,       -- còn khấu trừ chuyển kỳ sau

        -- ----- File XML -----
        -- xml_name/xml_path là XML ĐÃ NỘP do cổng trả về. Giai đoạn này CHƯA lấy được
        -- (chờ xử lý sau — chốt với anh Hiu 14/08), nên để NULL và cột "Tồn XML" trên
        -- màn hình bỏ trống. Khai sẵn cột để lúc có luồng đó không phải vá bảng.
        xml_name      NVARCHAR(255) NULL,
        xml_path      NVARCHAR(500) NULL,

        -- ----- Vết người nhập (khuôn Excel có sẵn) -----
        ma_nv         NVARCHAR(50)  NULL,
        ten_nv_add    NVARCHAR(200) NULL,
        time_add      DATETIME2     NULL,
        ghi_chu       NVARCHAR(500) NULL,
        line_id       NVARCHAR(20)  NULL,
        not_use       BIT           NOT NULL DEFAULT 0,

        -- Bộ tứ audit theo luật repo (tên cột giữ theo VFP gốc)
        created_by    NVARCHAR(50)  NULL,
        created_at    DATETIME2     NOT NULL DEFAULT SYSDATETIME(),
        updated_by    NVARCHAR(50)  NULL,
        updated_at    DATETIME2     NULL,

        CONSTRAINT PK_TOKHAI PRIMARY KEY (ma_donvi, ky_kekhai, lan_nop)
    );
END
GO

-- Màn báo cáo luôn lọc theo KỲ rồi mới trải các đơn vị (mỗi lần mở là một kỳ), nên
-- index dẫn đầu bằng (nam, thang). Đặt ma_donvi ở cuối để cùng lúc phục vụ cả câu
-- "một đơn vị xem nhiều kỳ" khi bấm vào một dòng.
IF DB_NAME() = 'KT2000_Base' AND OBJECT_ID('TOKHAI') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM sys.indexes
                    WHERE name = 'IX_TOKHAI_KY' AND object_id = OBJECT_ID('TOKHAI'))
    CREATE INDEX IX_TOKHAI_KY ON TOKHAI (nam, thang, ma_donvi);
GO


-- ################ PHẦN 2 — INDEX (thang, huong) CHO HOA_DON #################
--
-- CHẠY CHO: MỌI database ĐƠN VỊ-NĂM (<MÃ>_<NĂM>), cả thuế lẫn nội bộ — HOA_DON là
-- bảng dùng chung. Chạy nhầm trên KT2000_Base thì tự bỏ qua (Base không có HOA_DON).
--
-- VÌ SAO CẦN: mọi màn lọc theo KỲ đều lọc bằng cột thang (tháng kê khai), mà HOA_DON
-- chưa có index nào dẫn đầu bằng cột đó — đo thật 14/08 trên THAI_TUAN_2026: chỉ có
-- index theo ma_hd / ngay / ma_kh / so_hd / huong / tthai_hd. Nghĩa là câu nào lọc
-- theo thang cũng phải QUÉT TOÀN BỘ bảng.
--
-- Đau nhất ở màn "Tờ khai" của MDN_NB (BangToKhaiService): nó đếm hóa đơn theo thang
-- trên 16 database đơn vị cùng lúc. 16 lượt quét toàn bảng cộng lại là chỗ người dùng
-- ngồi đợi lâu nhất của cả màn hình.
--
-- VÌ SAO GHÉP (thang, huong) chứ không chỉ mình thang: câu đếm của màn đó GROUP BY
-- đúng hai cột này (SELECT thang, huong, COUNT(*) ... GROUP BY thang, huong). Index
-- phủ cả hai thì SQL Server đọc thẳng từ index, không phải tra ngược về bảng chính.
-- Màn Danh sách hóa đơn cũng lọc đúng cặp này (huong + thang) nên hưởng lợi theo.
--
-- AN TOÀN: chỉ THÊM một index. Không sửa dữ liệu, không đổi cấu trúc cột. Chạy lại
-- nhiều lần vô hại. Index làm câu INSERT chậm hơn một chút — chấp nhận được vì nạp
-- hóa đơn là việc chạy nền theo mẻ, còn mở màn hình là việc người dùng ngồi đợi.

-- BẮT BUỘC với cột TÍNH SẴN: huong là computed column
--   (case when ma_hd like 'VAO_%' then 'VAO' when ma_hd like 'RA_%' then 'RA' end)
-- SQL Server chỉ cho đánh index lên cột tính sẵn khi phiên đang bật đủ 6 tùy chọn
-- dưới đây và tắt NUMERIC_ROUNDABORT — thiếu một cái là lỗi 1934 và index KHÔNG được
-- tạo (gặp thật 14/08 khi chạy bằng sqlcmd, vì sqlcmd mặc định tắt QUOTED_IDENTIFIER).
-- Đặt ngay trong script để chạy ở đâu cũng đúng, không phụ thuộc công cụ.
SET ANSI_NULLS ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET QUOTED_IDENTIFIER ON;
SET NUMERIC_ROUNDABORT OFF;
GO

-- Kiểm BẢNG tồn tại trước: database dựng dở (HA_THAI_2026 gặp thật 14/08 — có DB mà
-- không có bảng HOA_DON) sẽ nổ "Cannot find the object" nếu chạy thẳng.
IF OBJECT_ID('HOA_DON') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM sys.indexes
                    WHERE name = 'IX_HOA_DON_thang_huong'
                      AND object_id = OBJECT_ID('HOA_DON'))
    CREATE INDEX IX_HOA_DON_thang_huong ON HOA_DON (thang, huong);
GO

-- Database dựng tay đời đầu có thể CHƯA có bảng SCHEMA_VERSION. Chỉ dựng khi ĐÚNG là
-- database đơn vị (có HOA_DON) — dựng cả ở Base thì Base có bảng phiên bản vô nghĩa.
IF OBJECT_ID('HOA_DON') IS NOT NULL AND OBJECT_ID('SCHEMA_VERSION') IS NULL
    CREATE TABLE SCHEMA_VERSION (
        Ver       INT       NOT NULL,
        AppliedAt DATETIME2 NOT NULL DEFAULT SYSDATETIME());
GO

-- Đóng dấu phiên bản 12. Bọc trong EXEC vì SQL Server dịch CẢ LÔ trước khi chạy: câu
-- INSERT viết thẳng sẽ nổ "Invalid object name 'SCHEMA_VERSION'" ngay lúc dịch khi
-- chạy trên KT2000_Base (Base không có bảng đó), dù rào IF bên ngoài đã chặn rồi —
-- rào chỉ chặn lúc CHẠY, không cứu được lúc DỊCH. EXEC hoãn việc dịch tới lúc thật sự
-- gọi, nên chạy nhầm trên Base chỉ đơn giản là không làm gì. (Gặp thật 14/08.)
IF OBJECT_ID('HOA_DON') IS NOT NULL
   AND OBJECT_ID('SCHEMA_VERSION') IS NOT NULL
   AND EXISTS (SELECT 1 FROM sys.indexes
                WHERE name = 'IX_HOA_DON_thang_huong'
                  AND object_id = OBJECT_ID('HOA_DON'))
    EXEC sp_executesql N'
        IF NOT EXISTS (SELECT 1 FROM SCHEMA_VERSION WHERE Ver = 12)
            INSERT INTO SCHEMA_VERSION (Ver) VALUES (12);';
GO
-- 021_tokhai_ct43_xml.sql — cột ct43_xml cho TOKHAI (KT2000_Base)
--
-- VÌ SAO CẦN: cột "Tồn XML" trên lưới rà soát chéo là ct43 đọc từ FILE CỔNG TRẢ VỀ
-- SAU KHI NỘP — số ĐÃ NỘP THẬT, khác với ct43_nnt là số mình TỰ LẬP. Hai số đó lệch
-- nhau nghĩa là bản nộp khác bản lập, phải soi lại; gộp chung một cột thì mất luôn
-- khả năng phát hiện điều đó.
--
-- Bảng 019 đã khai sẵn xml_name/xml_path cho file cổng trả về, nhưng thiếu chỗ chứa
-- CON SỐ đọc ra từ file đó — script này bù nốt.
--
-- CHẠY CHO: chỉ KT2000_Base (nơi có bảng TOKHAI).
--
-- AN TOÀN: chỉ THÊM một cột NULL. Không sửa, không xóa dữ liệu đang có. Chạy lại
-- nhiều lần vô hại. Chạy nhầm trên database khác thì tự bỏ qua (không có TOKHAI).

IF OBJECT_ID('TOKHAI') IS NOT NULL
   AND COL_LENGTH('TOKHAI', 'ct43_xml') IS NULL
    ALTER TABLE TOKHAI ADD ct43_xml DECIMAL(18,0) NULL;
GO


-- ############ PHẦN 3 — CỘT ct*_xml: BẢN TCT TRẢ VỀ (gộp từ 022) ############
--
-- CHẠY CHO: chỉ KT2000_Base. Chạy nhầm chỗ khác thì tự bỏ qua (không có TOKHAI).
--
-- VÌ SAO CẦN: bảng đang lưu bản MÌNH TỰ LẬP (ct*_nnt). Muốn tìm ra "lệch ở CHỈ TIÊU
-- NÀO" so với bản TCT trả về thì phải giữ CẢ 26 chỉ tiêu của bản đó — chỉ có ct43
-- thì biết tổng lệch mà không biết lệch vì đâu.
--
-- Đo thật 15/08 trên cặp file NHAT_TUAN kỳ 06/2026:
--   tự lập  : test	okhai\TKG_T6_20261415995000-01_GTGT_TT80-M062026-L00.xml
--   TCT trả : test	okhai\TKG_T6_2026iles_G12.18-260717-00226469.zip
-- Hai bản khớp 100% cả 26 chỉ tiêu — nhưng đó là kỳ làm đúng. Kỳ nào cổng chỉnh số
-- (hoặc kế toán nộp bản khác bản đã lập) thì phải chỉ ra được đúng dòng lệch.
--
-- VÌ SAO TÁCH CỘT RIÊNG chứ không thêm dòng: hai bản là hai GÓC NHÌN của CÙNG một
-- tờ khai, không phải hai tờ khai. Thêm dòng thì mọi câu đọc hiện có (lưới rà soát
-- chéo, tồn đầu kỳ sau) phải thêm điều kiện lọc "chỉ lấy bản tự lập" — sót một chỗ
-- là số liệu sai âm thầm.
--
-- AN TOÀN: chỉ THÊM cột NULL. Chạy lại nhiều lần vô hại.

IF OBJECT_ID('TOKHAI') IS NOT NULL
BEGIN
    -- ct43_xml đã có từ script 021 nên không khai lại ở đây.
    IF COL_LENGTH('TOKHAI','ct21_xml')  IS NULL ALTER TABLE TOKHAI ADD ct21_xml  DECIMAL(18,0) NULL;
    IF COL_LENGTH('TOKHAI','ct22_xml')  IS NULL ALTER TABLE TOKHAI ADD ct22_xml  DECIMAL(18,0) NULL;
    IF COL_LENGTH('TOKHAI','ct23_xml')  IS NULL ALTER TABLE TOKHAI ADD ct23_xml  DECIMAL(18,0) NULL;
    IF COL_LENGTH('TOKHAI','ct24_xml')  IS NULL ALTER TABLE TOKHAI ADD ct24_xml  DECIMAL(18,0) NULL;
    IF COL_LENGTH('TOKHAI','ct25_xml')  IS NULL ALTER TABLE TOKHAI ADD ct25_xml  DECIMAL(18,0) NULL;
    IF COL_LENGTH('TOKHAI','ct26_xml')  IS NULL ALTER TABLE TOKHAI ADD ct26_xml  DECIMAL(18,0) NULL;
    IF COL_LENGTH('TOKHAI','ct27_xml')  IS NULL ALTER TABLE TOKHAI ADD ct27_xml  DECIMAL(18,0) NULL;
    IF COL_LENGTH('TOKHAI','ct28_xml')  IS NULL ALTER TABLE TOKHAI ADD ct28_xml  DECIMAL(18,0) NULL;
    IF COL_LENGTH('TOKHAI','ct29_xml')  IS NULL ALTER TABLE TOKHAI ADD ct29_xml  DECIMAL(18,0) NULL;
    IF COL_LENGTH('TOKHAI','ct30_xml')  IS NULL ALTER TABLE TOKHAI ADD ct30_xml  DECIMAL(18,0) NULL;
    IF COL_LENGTH('TOKHAI','ct31_xml')  IS NULL ALTER TABLE TOKHAI ADD ct31_xml  DECIMAL(18,0) NULL;
    IF COL_LENGTH('TOKHAI','ct32_xml')  IS NULL ALTER TABLE TOKHAI ADD ct32_xml  DECIMAL(18,0) NULL;
    IF COL_LENGTH('TOKHAI','ct33_xml')  IS NULL ALTER TABLE TOKHAI ADD ct33_xml  DECIMAL(18,0) NULL;
    IF COL_LENGTH('TOKHAI','ct32a_xml') IS NULL ALTER TABLE TOKHAI ADD ct32a_xml DECIMAL(18,0) NULL;
    IF COL_LENGTH('TOKHAI','ct34_xml')  IS NULL ALTER TABLE TOKHAI ADD ct34_xml  DECIMAL(18,0) NULL;
    IF COL_LENGTH('TOKHAI','ct35_xml')  IS NULL ALTER TABLE TOKHAI ADD ct35_xml  DECIMAL(18,0) NULL;
    IF COL_LENGTH('TOKHAI','ct36_xml')  IS NULL ALTER TABLE TOKHAI ADD ct36_xml  DECIMAL(18,0) NULL;
    IF COL_LENGTH('TOKHAI','ct37_xml')  IS NULL ALTER TABLE TOKHAI ADD ct37_xml  DECIMAL(18,0) NULL;
    IF COL_LENGTH('TOKHAI','ct38_xml')  IS NULL ALTER TABLE TOKHAI ADD ct38_xml  DECIMAL(18,0) NULL;
    IF COL_LENGTH('TOKHAI','ct39_xml')  IS NULL ALTER TABLE TOKHAI ADD ct39_xml  DECIMAL(18,0) NULL;
    IF COL_LENGTH('TOKHAI','ct40a_xml') IS NULL ALTER TABLE TOKHAI ADD ct40a_xml DECIMAL(18,0) NULL;
    IF COL_LENGTH('TOKHAI','ct40b_xml') IS NULL ALTER TABLE TOKHAI ADD ct40b_xml DECIMAL(18,0) NULL;
    IF COL_LENGTH('TOKHAI','ct40_xml')  IS NULL ALTER TABLE TOKHAI ADD ct40_xml  DECIMAL(18,0) NULL;
    IF COL_LENGTH('TOKHAI','ct41_xml')  IS NULL ALTER TABLE TOKHAI ADD ct41_xml  DECIMAL(18,0) NULL;
    IF COL_LENGTH('TOKHAI','ct42_xml')  IS NULL ALTER TABLE TOKHAI ADD ct42_xml  DECIMAL(18,0) NULL;

    -- Ngày nạp bản TCT — để biết số đối chiếu lấy lúc nào, và phân biệt "chưa nạp"
    -- với "nạp rồi mà mọi chỉ tiêu đều 0".
    IF COL_LENGTH('TOKHAI','xml_nap_luc') IS NULL
        ALTER TABLE TOKHAI ADD xml_nap_luc DATETIME2 NULL;
END
GO
