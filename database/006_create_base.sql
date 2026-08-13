-- 006_create_base.sql — KT2000_Base: database danh mục dùng chung
-- Chiến lược theo SPEC-000 v3 mục 3: DM_TK/DM_IN/KET_CHUYEN import nguyên;
-- DM_HANG/DM_KH/DM_KHO/DM_DVT chỉ structure (dữ liệu vào sau: làm sạch / mọc từ HĐĐT).
-- Quy ước tên: giữ tên bảng/cột VFP thống nhất với các bảng nghiệp vụ (chờ Leader duyệt).
-- CHỐT TỰ DỌN (giai đoạn dev — Base chưa có dữ liệu sống): tồn tại thì xóa dựng lại
USE master;
GO
IF DB_ID('KT2000_Base') IS NOT NULL
BEGIN
    ALTER DATABASE KT2000_Base SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
    DROP DATABASE KT2000_Base;
END
GO
CREATE DATABASE KT2000_Base;
GO
USE KT2000_Base;
GO

CREATE TABLE DM_TK (
    ma_tk        NVARCHAR(10)  NOT NULL PRIMARY KEY,
    ten_tk       NVARCHAR(200) NULL,
    displayname  NVARCHAR(200) NULL,
    chi_phi      BIT NOT NULL DEFAULT 0,
    gia_von      BIT NOT NULL DEFAULT 0,
    cong_no      BIT NOT NULL DEFAULT 0,
    ton_kho      BIT NOT NULL DEFAULT 0,
    tra_lai      BIT NOT NULL DEFAULT 0,
    du_cuoi_ky   BIT NOT NULL DEFAULT 0,
    san_pham_do_dang BIT NOT NULL DEFAULT 0,
    dt           BIT NOT NULL DEFAULT 0,
    gt           BIT NOT NULL DEFAULT 0,
    thue         BIT NOT NULL DEFAULT 0,
    tai_san_co_dinh BIT NOT NULL DEFAULT 0,
    ptk          BIT NOT NULL DEFAULT 0,
    ngan_hang    BIT NOT NULL DEFAULT 0,
    cong_cu_dung_cu BIT NOT NULL DEFAULT 0,
    chi_tiet     BIT NOT NULL DEFAULT 0,
    chiet_khau   BIT NOT NULL DEFAULT 0,
    ghi_chu      NVARCHAR(500) NULL
);
-- 93 tài khoản import nguyên trạng (Ý NGHĨA từng cờ chốt ở buổi DM_TK — dữ liệu không đổi):
INSERT INTO DM_TK VALUES (N'111', N'Tiền mặt', N'111 - Tiền mặt', 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, NULL);
INSERT INTO DM_TK VALUES (N'511', N'Doanh thu bán hàng nội địa', N'511 - Doanh thu bán hàng nội địa', 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, NULL);
INSERT INTO DM_TK VALUES (N'627', N'Chi phí SX Chung', N'627 - Chi phí SX Chung', 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, NULL);
INSERT INTO DM_TK VALUES (N'131', N'Phải thu của khách hàng', N'131 - Phải thu của khách hàng', 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, NULL);
INSERT INTO DM_TK VALUES (N'141', N'Tạm ứng', N'141 - Tạm ứng', 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, NULL);
INSERT INTO DM_TK VALUES (N'338', N'Phải trả phải nộp khác', N'338 - Phải trả phải nộp khác', 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, NULL);
INSERT INTO DM_TK VALUES (N'311', N'Vay ngắn hạn', N'311 - Vay ngắn hạn', 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, NULL);
INSERT INTO DM_TK VALUES (N'331', N'Phải trả cho người bán', N'331 - Phải trả cho người bán', 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, NULL);
INSERT INTO DM_TK VALUES (N'152', N'Nguyên liệu', N'152 - Nguyên liệu', 0, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, NULL);
INSERT INTO DM_TK VALUES (N'156', N'Hàng hoá', N'156 - Hàng hoá', 0, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, NULL);
INSERT INTO DM_TK VALUES (N'642', N'Chi phí quản lý', N'642 - Chi phí quản lý', 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, NULL);
INSERT INTO DM_TK VALUES (N'211', N'Tài sản cố định', N'211 - Tài sản cố định', 0, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 0, 0, 1, 0, NULL);
INSERT INTO DM_TK VALUES (N'632', N'Giá vốn hàng bán', N'632 - Giá vốn hàng bán', 0, 1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, NULL);
INSERT INTO DM_TK VALUES (N'155', N'Thành phẩm', N'155 - Thành phẩm', 0, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, NULL);
INSERT INTO DM_TK VALUES (N'154', N'Chi phí SXKD dở dang', N'154 - Chi phí SXKD dở dang', 0, 0, 0, 0, 0, 1, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, NULL);
INSERT INTO DM_TK VALUES (N'153', N'Công cụ dụng cụ', N'153 - Công cụ dụng cụ', 0, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 0, 0, 1, 1, 0, NULL);
INSERT INTO DM_TK VALUES (N'1421', N'Chi phí trả trước', N'1421 - Chi phí trả trước', 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 1, 1, 0, NULL);
INSERT INTO DM_TK VALUES (N'621', N'Chi phí nguyên vật liệu trực tiếp', N'621 - Chi phí nguyên vật liệu trực tiếp', 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, NULL);
INSERT INTO DM_TK VALUES (N'622', N'Chi phí nhân công trực tiếp', N'622 - Chi phí nhân công trực tiếp', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, NULL);
INSERT INTO DM_TK VALUES (N'531', N'Hàng bán bị trả lại', N'531 - Hàng bán bị trả lại', 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, NULL);
INSERT INTO DM_TK VALUES (N'911', N'Xác định kết quả kinh doanh', N'911 - Xác định kết quả kinh doanh', 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, NULL);
INSERT INTO DM_TK VALUES (N'1331', N'Thuế GTGT được khấu trừ', N'1331 - Thuế GTGT được khấu trừ', 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, NULL);
INSERT INTO DM_TK VALUES (N'3331', N'Thuế GTGT Đầu ra', N'3331 - Thuế GTGT Đầu ra', 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, NULL);
INSERT INTO DM_TK VALUES (N'1332', N'Thuế GTGT được khấu trừ  TSCĐ', N'1332 - Thuế GTGT được khấu trừ  TSCĐ', 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, NULL);
INSERT INTO DM_TK VALUES (N'421', N'Lãi chưa phân phối', N'421 - Lãi chưa phân phối', 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, NULL);
INSERT INTO DM_TK VALUES (N'3338', N'Thuế môn bài', N'3338 - Thuế môn bài', 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, NULL);
INSERT INTO DM_TK VALUES (N'3334', N'Thuế TNDN', N'3334 - Thuế TNDN', 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, NULL);
INSERT INTO DM_TK VALUES (N'411', N'Nguồn vốn kinh doanh', N'411 - Nguồn vốn kinh doanh', 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, NULL);
INSERT INTO DM_TK VALUES (N'214', N'Khấu hao TSCĐ', N'214 - Khấu hao TSCĐ', 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, NULL);
INSERT INTO DM_TK VALUES (N'334', N'Phải trả công nhân viên', N'334 - Phải trả công nhân viên', 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, NULL);
INSERT INTO DM_TK VALUES (N'112', N'Tiền gửi ngân hàng', N'112 - Tiền gửi ngân hàng', 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1, 0, 1, 0, NULL);
INSERT INTO DM_TK VALUES (N'711', N'Thu nhập khác', N'711 - Thu nhập khác', 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1, 0, NULL);
INSERT INTO DM_TK VALUES (N'811', N'Chi phí khác', N'811 - Chi phí khác', 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, NULL);
INSERT INTO DM_TK VALUES (N'144', N'Cầm cố, ký cược ngắn hạn', N'144 - Cầm cố, ký cược ngắn hạn', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, NULL);
INSERT INTO DM_TK VALUES (N'138', N'Phải thu khác', N'138 - Phải thu khác', 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, NULL);
INSERT INTO DM_TK VALUES (N'241', N'Xây dựng cơ bản dở dang', N'241 - Xây dựng cơ bản dở dang', 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, NULL);
INSERT INTO DM_TK VALUES (N'242', N'Chi phí trả trước dài hạn', N'242 - Chi phí trả trước dài hạn', 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 1, 1, 0, NULL);
INSERT INTO DM_TK VALUES (N'244', N'Cầm cố, ký cược dài hạn', N'244 - Cầm cố, ký cược dài hạn', 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, NULL);
INSERT INTO DM_TK VALUES (N'341', N'Vay dài hạn', N'341 - Vay dài hạn', 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, NULL);
INSERT INTO DM_TK VALUES (N'413', N'Chênh lệch tỷ giá', N'413 - Chênh lệch tỷ giá', 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, NULL);
INSERT INTO DM_TK VALUES (N'515', N'Doanh thu hoạt động tài chính', N'515 - Doanh thu hoạt động tài chính', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, NULL);
INSERT INTO DM_TK VALUES (N'635', N'Chi phí hoạt động tài chính', N'635 - Chi phí hoạt động tài chính', 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, NULL);
INSERT INTO DM_TK VALUES (N'623', N'Chi phí sử dụng máy thi công', N'623 - Chi phí sử dụng máy thi công', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, NULL);
INSERT INTO DM_TK VALUES (N'1541', N'Sản phẩm dở dang CĐ1', N'1541 - Sản phẩm dở dang CĐ1', 0, 0, 0, 0, 0, 1, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, NULL);
INSERT INTO DM_TK VALUES (N'1542', N'Chi phí NC trực tiếp', N'1542 - Chi phí NC trực tiếp', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, NULL);
INSERT INTO DM_TK VALUES (N'1543', N'Chi phí máy thi công', N'1543 - Chi phí máy thi công', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, NULL);
INSERT INTO DM_TK VALUES (N'1547', N'Chi phí chung', N'1547 - Chi phí chung', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, NULL);
INSERT INTO DM_TK VALUES (N'1521', N'Nguyên liệu CĐ2', N'1521 - Nguyên liệu CĐ2', 0, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, NULL);
INSERT INTO DM_TK VALUES (N'6211', N'Chi phí NVL cho CĐ1', N'6211 - Chi phí NVL cho CĐ1', 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, NULL);
INSERT INTO DM_TK VALUES (N'6271', N'Chi phí chung cho CĐ1', N'6271 - Chi phí chung cho CĐ1', 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, NULL);
INSERT INTO DM_TK VALUES (N'6221', N'Chi phí NC cho CĐ1', N'6221 - Chi phí NC cho CĐ1', 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, NULL);
INSERT INTO DM_TK VALUES (N'3383', N'Bảo Hiểm Xã Hội', N'3383 - Bảo Hiểm Xã Hội', 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, NULL);
INSERT INTO DM_TK VALUES (N'1122', N'Tiền USD ngân hàng', N'1122 - Tiền USD ngân hàng', 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1, 0, 1, 0, NULL);
INSERT INTO DM_TK VALUES (N'1112', N'Tiền  USD tại Quỹ', N'1112 - Tiền  USD tại Quỹ', 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0, NULL);
INSERT INTO DM_TK VALUES (N'3382', N'KPCĐ', N'3382 - KPCĐ', 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, NULL);
INSERT INTO DM_TK VALUES (N'335', N'Chi phí phải trả', N'335 - Chi phí phải trả', 1, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, NULL);
INSERT INTO DM_TK VALUES (N'212', N'TSCĐ thuê tài chính', N'212 - TSCĐ thuê tài chính', 0, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 0, 0, 1, 0, NULL);
INSERT INTO DM_TK VALUES (N'2142', N'KHTSCĐ thuê tài chính', N'2142 - KHTSCĐ thuê tài chính', 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, NULL);
INSERT INTO DM_TK VALUES (N'342', N'Nợ dài hạn', N'342 - Nợ dài hạn', 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, NULL);
INSERT INTO DM_TK VALUES (N'224', N'Ký quỹ, ký cược dài hạn', N'224 - Ký quỹ, ký cược dài hạn', 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, NULL);
INSERT INTO DM_TK VALUES (N'222', N'Góp vốn kinh doanh', N'222 - Góp vốn kinh doanh', 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, NULL);
INSERT INTO DM_TK VALUES (N'2413', N'Khấu hao TSCĐ vô hình', N'2413 - Khấu hao TSCĐ vô hình', 1, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, NULL);
INSERT INTO DM_TK VALUES (N'2131', N'TSCĐ vô hình (Quyền sử dụng đất)', N'2131 - TSCĐ vô hình (Quyền sử dụng đất)', 0, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 0, 0, 1, 0, NULL);
INSERT INTO DM_TK VALUES (N'1422', N'Chi phí chờ kết chuyển', N'1422 - Chi phí chờ kết chuyển', 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, NULL);
INSERT INTO DM_TK VALUES (N'641', N'Chi phí bán hàng', N'641 - Chi phí bán hàng', 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, NULL);
INSERT INTO DM_TK VALUES (N'721', N'Thu nhập bất thường', N'721 - Thu nhập bất thường', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, NULL);
INSERT INTO DM_TK VALUES (N'821', N'Chi phí Thuế TNDN', N'821 - Chi phí Thuế TNDN', 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, NULL);
INSERT INTO DM_TK VALUES (N'3333', N'Thuế xuất - nhập khẩu', N'3333 - Thuế xuất - nhập khẩu', 0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, NULL);
INSERT INTO DM_TK VALUES (N'5111', N'Doanh thu hàng xuất khẩu', N'5111 - Doanh thu hàng xuất khẩu', 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, NULL);
INSERT INTO DM_TK VALUES (N'3384', N'Bảo hiểm Y tế', N'3384 - Bảo hiểm Y tế', 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, NULL);
INSERT INTO DM_TK VALUES (N'2111', N'TSCĐ - Đất', N'2111 - TSCĐ - Đất', 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, NULL);
INSERT INTO DM_TK VALUES (N'2112', N'TSCĐ - Nhà cửa vật kiến trúc', N'2112 - TSCĐ - Nhà cửa vật kiến trúc', 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 0, 1, 0, NULL);
INSERT INTO DM_TK VALUES (N'2113', N'TSCĐ - Máy móc thiết bị', N'2113 - TSCĐ - Máy móc thiết bị', 0, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 0, 0, 1, 0, NULL);
INSERT INTO DM_TK VALUES (N'2114', N'TSCĐ - Phương tiện vận tải, truyền dẫn', N'2114 - TSCĐ - Phương tiện vận tải, truyền dẫn', 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, NULL);
INSERT INTO DM_TK VALUES (N'2115', N'TSCĐ - Thiết bị dụng cụ quản lý', N'2115 - TSCĐ - Thiết bị dụng cụ quản lý', 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, NULL);
INSERT INTO DM_TK VALUES (N'2116', N'TSCĐ - Cây lâu năm, súc vật làm việc', N'2116 - TSCĐ - Cây lâu năm, súc vật làm việc', 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, NULL);
INSERT INTO DM_TK VALUES (N'2118', N'TSCĐ - TSCĐ khác', N'2118 - TSCĐ - TSCĐ khác', 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, NULL);
INSERT INTO DM_TK VALUES (N'2218', N'Đầu tư dài hạn khác', N'2218 - Đầu tư dài hạn khác', 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, NULL);
INSERT INTO DM_TK VALUES (N'415', N'Quỹ khen thưởng - phúc lợi', N'415 - Quỹ khen thưởng - phúc lợi', 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, NULL);
INSERT INTO DM_TK VALUES (N'414', N'Quỹ phát triển sản xúât', N'414 - Quỹ phát triển sản xúât', 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, NULL);
INSERT INTO DM_TK VALUES (N'431', N'Quỹ dụ trữ', N'431 - Quỹ dụ trữ', 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, NULL);
INSERT INTO DM_TK VALUES (N'5211', N'Chiết khấu bán hàng', N'5211 - Chiết khấu bán hàng', 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, NULL);
INSERT INTO DM_TK VALUES (N'33312', N'Thuế GTGT hàng nhập khẩu', N'33312 - Thuế GTGT hàng nhập khẩu', 0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, NULL);
INSERT INTO DM_TK VALUES (N'157', N'Hàng gửi đại lý', N'157 - Hàng gửi đại lý', 0, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, NULL);
INSERT INTO DM_TK VALUES (N'3337', N'Thuế đất', N'3337 - Thuế đất', 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, NULL);
INSERT INTO DM_TK VALUES (N'1123', N'Tiền EUR ngân hàng', N'1123 - Tiền EUR ngân hàng', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, NULL);
INSERT INTO DM_TK VALUES (N'3335', N'Thuế TNCN', N'3335 - Thuế TNCN', 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, NULL);
INSERT INTO DM_TK VALUES (N'128', N'Đầu tư ngắn hạn', N'128 - Đầu tư ngắn hạn', 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, NULL);
INSERT INTO DM_TK VALUES (N'441', N'Nguồn vốn XDCB', N'441 - Nguồn vốn XDCB', 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, NULL);
INSERT INTO DM_TK VALUES (N'3389', N'Bảo hiểm Thất nghiệp', N'3389 - Bảo hiểm Thất nghiệp', 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, NULL);
INSERT INTO DM_TK VALUES (N'3339', N'Thuế thu nhập cá nhân', N'3339 - Thuế thu nhập cá nhân', 0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, NULL);
INSERT INTO DM_TK VALUES (N'139', N'Dự phòng phải thu khó đòi', N'139 - Dự phòng phải thu khó đòi', 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, NULL);
INSERT INTO DM_TK VALUES (N'5212', N'Hàng bán bị trả lại', N'5212 - Hàng bán bị trả lại', 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, NULL);
GO

CREATE TABLE DM_IN (
    ma_so_sach   NVARCHAR(20) NOT NULL PRIMARY KEY,
    ten_so_sach  NVARCHAR(200),
    ten_method   NVARCHAR(100),
    co_in        BIT,
    from_month   INT,
    to_month     INT,
    ghi_chu      NVARCHAR(500),
    theo_cd      BIT,
    cd_nguoc     BIT,
    fontsize     INT,
    width1       INT,
    width2       INT,
    columnwidth  NVARCHAR(500),
    is_bctc      BIT,
    stt_bctc     INT,
    is_indep     BIT,
    file_name    NVARCHAR(200)
);
-- 60 sổ/báo cáo — Leader tick bộ tối thiểu bằng cột co_in:
INSERT INTO DM_IN VALUES (N'IN2', N'Bảng định mức nguyên liệu', N'EXCEL_DinhMuc()', 0, 13, 13, NULL, 0, 0, 28, 17, 13, N'0', 0, 0, 0, N'DINHMUC_NL');
INSERT INTO DM_IN VALUES (N'IN3', N'Bảng tổng hợp chi phí SXKDDD', N'EXCEL_TH_154()', 0, 1, 12, NULL, 0, 0, 28, 17, 13, N'0', 0, 0, 0, N'TONGHOP_154');
INSERT INTO DM_IN VALUES (N'IN5', N'Thẻ tính giá thành', N'EXCEL_Phieu_TGT()', 0, 4, 4, NULL, 0, 0, 28, 17, 13, N'0', 0, 0, 0, N'THE_GIATHANH');
INSERT INTO DM_IN VALUES (N'IN6', N'Bảng cân đối tài khoản', N'EXCEL_CDTK("DbfCanDoiTK")', 0, 13, 13, NULL, 0, 0, 28, 17, 13, N'0', 1, 1, 0, NULL);
INSERT INTO DM_IN VALUES (N'IN7', N'Sổ nhật ký chung', N'EXCEL_NKC()', 0, 13, 13, NULL, 0, 0, 28, 17, 13, N'0', 0, 0, 1, N'NHATKYCHUNG');
INSERT INTO DM_IN VALUES (N'IN8', N'Sổ cái', N'EXCEL_SOCAI()', 0, 13, 13, NULL, 0, 0, 28, 17, 13, N'0', 0, 0, 0, N'SO_CAI');
INSERT INTO DM_IN VALUES (N'IN9', N'Doanh thu', N'EXCEL_DT()', 0, 1, 12, NULL, 0, 0, 28, 17, 13, N'0', 0, 0, 1, N'DOANH_THU');
INSERT INTO DM_IN VALUES (N'IN10', N'Bảng lỗ lãi', N'EXCEL_LOLAI()', 0, 12, 12, NULL, 0, 0, 28, 17, 13, N'0', 1, 2, 0, NULL);
INSERT INTO DM_IN VALUES (N'IN11', N'Bảng cân đối kế toán', N'EXCEL_CDKT()', 0, 13, 13, NULL, 0, 0, 28, 17, 13, N'0', 1, 3, 0, NULL);
INSERT INTO DM_IN VALUES (N'IN12', N'Sổ chi tiết XNT NL - TP - HH', N'EXCEL_ChiTiet_XNT("TON_KHO")', 1, 13, 13, NULL, 0, 0, 28, 17, 13, N'0', 0, 0, 1, N'CHITIET_XNT');
INSERT INTO DM_IN VALUES (N'IN14', N'Sổ Quỹ tiền mặt', N'EXCEL_SOQUYTM()', 1, 13, 13, NULL, 0, 0, 28, 17, 13, N'0', 0, 0, 1, N'SO_QUY');
INSERT INTO DM_IN VALUES (N'IN13', N'Báo cáo tài chính', N'EXCEL_BCTC()', 1, 13, 13, N'Không được thay đổi mã sổ sách của dòng này', 0, 0, 28, 17, 13, N'0', 0, 0, 1, N'BAOCAO_TC');
INSERT INTO DM_IN VALUES (N'IN15', N'Bảng lưu chuyển tiền tệ', N'EXCEL_LCTT()', 0, 13, 13, NULL, 0, 0, 28, 17, 13, N'0', 1, 4, 0, NULL);
INSERT INTO DM_IN VALUES (N'IN16', N'Lấy dữ liệu cho sơ đồ chữ T', N'GET_DATA_T()', 1, 13, 13, NULL, 0, 0, 28, 17, 13, N'0', 0, 0, 1, N'CHU_T');
INSERT INTO DM_IN VALUES (N'IN17', N'Tình hình thực hiện nghĩa vụ với nhà nước', N'EXCEL_NVVNN("B02DNII")', 0, 13, 13, NULL, 0, 0, 28, 17, 13, N'0', 0, 5, 0, NULL);
INSERT INTO DM_IN VALUES (N'IN18', N'Thuế GTGT được khấu trừ, được hoàn, được giảm, thuế GTGT hàng bán nội địa', N'EXCEL_TGTGT("B02DNIII")', 0, 12, 12, NULL, 0, 0, 28, 17, 13, N'0', 0, 6, 0, NULL);
INSERT INTO DM_IN VALUES (N'IN19', N'Quyết toán thuế GTGT', N'EXCEL_QTTGTGT("01/GTGT")', 0, 13, 13, NULL, 0, 0, 28, 17, 13, N'0', 0, 7, 0, NULL);
INSERT INTO DM_IN VALUES (N'IN20', N'Quyết toán thuế TNDN', N'EXCEL_QTTTN("B2ADN")', 0, 13, 13, NULL, 0, 0, 28, 17, 13, N'0', 0, 8, 0, NULL);
INSERT INTO DM_IN VALUES (N'IN21', N'Thuyết minh báo cáo tài chính', N'EXCEL_TMBCTC()', 0, 13, 13, NULL, 0, 0, 28, 17, 13, N'0', 1, 9, 0, NULL);
INSERT INTO DM_IN VALUES (N'IN22', N'Sổ chi tiết giao dịch ngân hàng', N'EXCEL_CT_CN("NGAN_HANG")', 1, 13, 13, NULL, 0, 0, 28, 17, 13, N'0', 0, 0, 1, N'SO_NGAN_HANG');
INSERT INTO DM_IN VALUES (N'IN23', N'Sổ chi tiết công nợ', N'EXCEL_CT_CN("CONG_NO")', 0, 13, 13, NULL, 0, 0, 28, 17, 13, N'0', 0, 0, 0, N'SO_CONG_NO');
INSERT INTO DM_IN VALUES (N'IN24', N'Sổ tổng hợp công nợ', N'EXCEL_CT_CN(.T.)', 0, 13, 13, NULL, 0, 0, 28, 17, 13, N'0', 0, 0, 0, NULL);
INSERT INTO DM_IN VALUES (N'IN25', N'Sổ tổng hợp ngân hàng', N'EXCEL_CT_NH(.T.)', 0, 13, 13, NULL, 0, 0, 28, 17, 13, N'0', 0, 0, 0, NULL);
INSERT INTO DM_IN VALUES (N'IN26', N'Sổ tổng hợp XNT kho', N'EXCEL_ChiTiet_XNT()', 0, 13, 13, NULL, 0, 0, 28, 17, 13, N'0', 0, 0, 0, NULL);
INSERT INTO DM_IN VALUES (N'IN27', N'Sổ theo dõi ngoại tệ', N'EXCEL_ChiTiet_XNT("NGAN_HANG")', 0, 13, 13, NULL, 0, 0, 28, 17, 13, N'0', 0, 0, 0, N'SO_NGOAI_TE');
INSERT INTO DM_IN VALUES (N'IN28', N'Sổ lương doanh nghiệp', N'EXCEL_BANGLUONG()', 0, 1, 12, NULL, 0, 0, 28, 17, 13, N'0', 0, 0, 0, N'SO_LUONG');
INSERT INTO DM_IN VALUES (N'IN29', N'Sổ theo dõi thuế GTGT', N'EXCEL_THUE_GTGT()', 0, 1, 12, NULL, 0, 0, 28, 17, 13, N'0', 0, 0, 0, N'SO_THUE_GTGT');
INSERT INTO DM_IN VALUES (N'IN30', N'Các chỉ tiêu tài chính', N'EXCEL_CHITIEU_TC()', 0, 13, 13, NULL, 0, 0, 28, 17, 13, N'0', 0, 11, 0, NULL);
INSERT INTO DM_IN VALUES (N'IN31', N'Sổ theo dõi KH TSCĐ', N'EXCEL_TSCD(1)', 1, 13, 13, NULL, 0, 0, 28, 17, 13, N'0', 0, 0, 1, N'KH_TSCD');
INSERT INTO DM_IN VALUES (N'IN32', N'Bảng tổng hợp thuế', N'RETURN', 0, 1, 12, NULL, 0, 0, 28, 17, 13, N'0', 0, 0, 0, NULL);
INSERT INTO DM_IN VALUES (N'IN33', N'Mục lục', N'RETURN', 0, 0, 0, NULL, 0, 0, 0, 0, 0, N'0', 0, 0, 0, NULL);
INSERT INTO DM_IN VALUES (N'IN34', N'Sổ chi tiết bán hàng', N'EXCEL_CT_DT()', 0, 13, 13, NULL, 0, 0, 28, 17, 13, N'0', 0, 0, 0, N'CHITIET_BH');
INSERT INTO DM_IN VALUES (N'IN35', N'Tờ khai chi tiết doanh thu chi phí thu nhập', N'EXCEL_MS2B()', 0, 13, 13, NULL, 0, 0, 28, 17, 13, N'0', 0, 10, 0, NULL);
INSERT INTO DM_IN VALUES (N'IN36', N'Bảng tổng hợp thanh toán Thuế', N'EXCEL_F01DN()', 0, 13, 13, NULL, 0, 0, 28, 17, 13, N'0', 0, 12, 0, NULL);
INSERT INTO DM_IN VALUES (N'IN37', N'Bảng tổng hợp tờ khai thuế năm', N'EXCEL_KHAITHUE()', 0, 1, 12, NULL, 0, 0, 28, 17, 13, N'0', 0, 13, 0, NULL);
INSERT INTO DM_IN VALUES (N'IN38', N'Bảng kê chứng từ NSNN', N'EXCEL_NTNS()', 0, 13, 13, NULL, 0, 0, 28, 17, 13, N'0', 0, 14, 0, NULL);
INSERT INTO DM_IN VALUES (N'IN39', N'Sổ theo dõi phân bổ CCDC', N'EXCEL_TSCD(0)', 1, 13, 13, NULL, 0, 0, 28, 17, 13, N'0', 0, 0, 1, N'PB_CCDC');
INSERT INTO DM_IN VALUES (N'IN40', N'Sổ chi tiết chi phí SXKD', N'EXCEL_CT_CP()', 1, 13, 13, NULL, 0, 0, 28, 17, 13, N'0', 0, 0, 1, N'CHI_TIET_154');
INSERT INTO DM_IN VALUES (N'IN41', N'Sổ cái - Chứng từ ghi sổ', N'EXCEL_SOCAI_CTGS()', 1, 13, 13, NULL, 0, 0, 28, 17, 13, N'0', 0, 0, 1, N'SO_CAI_CTGS');
INSERT INTO DM_IN VALUES (N'IN42', N'Chứng từ ghi sổ', N'EXCEL_CTGS()', 0, 13, 13, NULL, 0, 0, 28, 17, 13, N'0', 0, 0, 0, N'CHUNG_TU_GS');
INSERT INTO DM_IN VALUES (N'IN43', N'Phiếu thu chi', NULL, 0, 0, 0, NULL, 0, 0, 0, 0, 0, N'0', 0, 0, 0, NULL);
INSERT INTO DM_IN VALUES (N'IN44', N'Phiếu nhập xuất', NULL, 0, 0, 0, NULL, 0, 0, 0, 0, 0, N'0', 0, 0, 0, NULL);
INSERT INTO DM_IN VALUES (N'IN45', N'Bảng kê chi quỹ tiền mặt', N'EXCEL_BANGKE_SOQUY("GHI_CO","111")', 0, 1, 12, NULL, 0, 0, 28, 17, 13, N'0', 0, 0, 0, N'B_KE_CHI_QUY');
INSERT INTO DM_IN VALUES (N'IN46', N'Bảng kê thu quỹ tiền mặt', N'EXCEL_BANGKE_SOQUY("GHI_NO","111")', 0, 1, 12, NULL, 0, 0, 28, 17, 13, N'0', 0, 0, 0, N'B_KE_THU_QUY');
INSERT INTO DM_IN VALUES (N'IN47', N'Bảng kê thu tiền gửi ngân hàng', N'EXCEL_BANGKE_SOQUY("GHI_NO","112")', 0, 1, 12, NULL, 0, 0, 28, 17, 13, N'0', 0, 0, 0, N'B_KE_THU_112');
INSERT INTO DM_IN VALUES (N'IN48', N'Bảng kê thu ngoại tệ qua ngân hàng', N'EXCEL_BANGKE_SOQUY("GHI_NO","1122")', 0, 1, 12, NULL, 0, 0, 28, 17, 13, N'0', 0, 0, 0, N'B_KE_THU_1122');
INSERT INTO DM_IN VALUES (N'IN49', N'Bảng kê CT nhập nguyên liệu', N'EXCEL_BANGKE_NL("GHI_NO","152")', 0, 1, 12, NULL, 0, 0, 28, 17, 13, N'0', 0, 0, 0, N'B_KE_NHAP_NL');
INSERT INTO DM_IN VALUES (N'IN50', N'Bảng kê CT Xuất nguyên liệu', N'EXCEL_BANGKE_NL("GHI_CO","152")', 0, 1, 12, NULL, 0, 0, 28, 17, 13, N'0', 0, 0, 0, N'B_KE_XUAT_NL');
INSERT INTO DM_IN VALUES (N'IN51', N'Bảng kê doanh thu bán hàng', N'EXCEL_BANGKE_SOQUY("GHI_CO","511")', 0, 1, 12, NULL, 0, 0, 28, 17, 13, N'0', 0, 0, 0, N'B_KE_511');
INSERT INTO DM_IN VALUES (N'IN52', N'Bảng kê giá vốn hàng bán', N'EXCEL_BANGKE_NL("GHI_NO","632")', 0, 13, 13, NULL, 0, 0, 28, 17, 13, N'0', 0, 0, 0, N'B_KE_632');
INSERT INTO DM_IN VALUES (N'IN53', N'Sổ chi tiết tài khoản', N'EXCEL_SOCT("711")', 1, 13, 13, NULL, 0, 0, 28, 17, 13, N'0', 0, 0, 1, N'SO_CHI_TIET_TK');
INSERT INTO DM_IN VALUES (N'IN54', N'Bảng kê chi tiết nợ phải trả người bán', N'EXCEL_BANGKE_NL("GHI_CO","331")', 0, 1, 12, NULL, 0, 0, 28, 17, 13, N'0', 0, 0, 0, N'B_KE_331');
INSERT INTO DM_IN VALUES (N'IN55', N'Thẻ tính giá thành', N'EXCEL_Phieu_TGT_M()', 0, 11, 12, NULL, 0, 0, 28, 17, 13, N'0', 0, 0, 1, N'THE_GIATHANH_M');
INSERT INTO DM_IN VALUES (N'IN56', N'Sổ chi tiết thanh toán - với người mua, người bán', N'EXCEL_CT_NMNB("131,331")', 1, 13, 13, NULL, 0, 0, 28, 17, 13, N'0', 0, 0, 1, N'CHI_TIET_TT');
INSERT INTO DM_IN VALUES (N'IN57', N'Sổ chi tiết tiền vay', N'EXCEL_CT_TIENVAY("311,342,341")', 1, 13, 13, NULL, 0, 0, 28, 17, 13, N'0', 0, 0, 1, N'CHI_TIET_TV');
INSERT INTO DM_IN VALUES (N'IN58', N'Thẻ tính giá thành theo đơn hàng', N'EXCEL_Phieu_TGT_TheoDon()', 0, 1, 12, NULL, 0, 0, 28, 17, 13, N'0', 0, 0, 0, N'THE_GIATHANH_THEOHD');
INSERT INTO DM_IN VALUES (N'IN59', N'Bảng tổng hợp chi phí theo tháng', N'EXCEL_TH_TKCP()', 0, 1, 12, NULL, 0, 0, 28, 17, 13, N'0', 0, 0, 0, N'TK_154_MONTH');
INSERT INTO DM_IN VALUES (N'IN60', N'Biểu mẫu NXT theo tháng', N'EXCEL_NXT_Month()', 0, 1, 12, N'From 1 to 12', 0, 0, 28, 17, 13, N'0', 0, 0, 0, N'TH_NXT');
INSERT INTO DM_IN VALUES (N'IN61', N'Định mức TP theo dòng NL', N'EXCEL_DinhMuc_Vertical()', 0, 13, 13, NULL, 0, 0, 28, 17, 13, N'0', 0, 0, 0, N'DINHMUC_TP_THEO_NL');
INSERT INTO DM_IN VALUES (N'IN62', N'Giá thành so sánh', N'EXCEL_GT_SS()', 0, 1, 12, NULL, 0, 0, 28, 17, 13, N'0', 0, 0, 0, N'GIA_THANH_SS');
GO

CREATE TABLE KET_CHUYEN (
    ma_line       NVARCHAR(10) NOT NULL PRIMARY KEY,
    ghi_no        NVARCHAR(10) NULL,
    ghi_co        NVARCHAR(10) NULL,
    from_co_to_no BIT NOT NULL DEFAULT 0
);
INSERT INTO KET_CHUYEN VALUES (N'KC1', N'511', N'911', 0);
INSERT INTO KET_CHUYEN VALUES (N'KC2', N'911', N'642', 1);
INSERT INTO KET_CHUYEN VALUES (N'KC3', N'154', N'621', 1);
INSERT INTO KET_CHUYEN VALUES (N'KC4', N'911', N'632', 1);
INSERT INTO KET_CHUYEN VALUES (N'KC5', N'154', N'627', 1);
INSERT INTO KET_CHUYEN VALUES (N'KC6', N'154', N'622', 1);
INSERT INTO KET_CHUYEN VALUES (N'KC7', N'911', N'811', 1);
INSERT INTO KET_CHUYEN VALUES (N'KC8', N'711', N'911', 0);
INSERT INTO KET_CHUYEN VALUES (N'KC9', N'911', N'635', 1);
INSERT INTO KET_CHUYEN VALUES (N'KC10', N'515', N'911', 0);
INSERT INTO KET_CHUYEN VALUES (N'KC13', N'1541', N'6271', 1);
INSERT INTO KET_CHUYEN VALUES (N'KC14', N'1541', N'6221', 1);
INSERT INTO KET_CHUYEN VALUES (N'KC15', N'1541', N'6211', 1);
INSERT INTO KET_CHUYEN VALUES (N'KC16', N'911', N'641', 1);
INSERT INTO KET_CHUYEN VALUES (N'KC17', N'5111', N'911', 0);
INSERT INTO KET_CHUYEN VALUES (N'KC19', N'911', N'821', 1);
INSERT INTO KET_CHUYEN VALUES (N'KC20', N'911', N'5211', 1);
INSERT INTO KET_CHUYEN VALUES (N'KC21', N'911', N'5212', 1);
INSERT INTO KET_CHUYEN VALUES (N'KC22', N'154', N'623', 1);  -- ⚠ TRÙNG MÃ trong dữ liệu gốc (KC20 xuất hiện 2 lần) — tạm đặt KC22, LEADER XÁC NHẬN
GO

-- DM_KH: CHỈ STRUCTURE — import sau khi làm sạch 103k dòng (quy trình riêng WP-01b)
CREATE TABLE DM_KH (
    ma_kh          NVARCHAR(50) NOT NULL PRIMARY KEY,
    ten_kh         NVARCHAR(500) NULL,
    dia_chi        NVARCHAR(500) NULL,
    mst            NVARCHAR(20)  NULL,
    dien_thoai     NVARCHAR(50)  NULL
);
CREATE INDEX IX_DM_KH_mst ON DM_KH(mst);
CREATE INDEX IX_DM_KH_ten ON DM_KH(ten_kh);
GO

-- DM_HANG: CHỈ STRUCTURE — dữ liệu mọc từ HĐĐT + tồn đầu (không import bản cũ). GIỮ ma_ngan.
CREATE TABLE DM_HANG (
    ma_hang        NVARCHAR(50) NOT NULL PRIMARY KEY,
    ma_ngan        NVARCHAR(20),
    -- Tên hàng thật từ cổng TCT vượt 100 ký tự thường xuyên (đã gặp tên kèm chú thích
    -- khuyến mại còn dài hơn), nên để 500.
    ten_hang       NVARCHAR(500),
    ma_dvt         NVARCHAR(20),
    dvt            NVARCHAR(20),
    thue_suat      DECIMAL(18,2),
    ma_nh          NVARCHAR(20),
    gia_mua        DECIMAL(18,2),
    gia_ban        DECIMAL(18,2),
    -- Bốn cột dưới bản đầu khai nhầm là DECIMAL, nhưng cả bốn đều chứa CHỮ. Database đã
    -- dựng thì vá bằng 018_dm_hang_sua_kieu.sql; sửa luôn ở đây để cài mới đúng ngay.
    -- Hai file phải khớp nhau — sửa một bên là phải sửa bên kia.
    ghi_chu        NVARCHAR(500),   -- tên hàng gốc lấy từ hóa đơn, chờ kế toán định khoản
    tk_kho         NVARCHAR(20),    -- '156' / '641' — tài khoản là CHUỖI; để số thì
    tk_gv          NVARCHAR(20),    -- '1561' và '1561.00' hóa làm một
    ma_ncc         NVARCHAR(50)
);
GO

CREATE TABLE DM_KHO (
    ma_kho   NVARCHAR(20) NOT NULL PRIMARY KEY,
    ten_kho  NVARCHAR(200) NULL,
    ghi_chu  NVARCHAR(500) NULL
);
GO

-- DM_DVT: bộ ĐVT chuẩn XÂY MỚI tinh gọn (không import 1.396 dòng cũ)
CREATE TABLE DM_DVT (
    ma_dvt   NVARCHAR(20) NOT NULL PRIMARY KEY,
    ten_dvt  NVARCHAR(100) NULL,
    ghi_chu  NVARCHAR(500) NULL
);
GO