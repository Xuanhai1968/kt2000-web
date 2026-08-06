-- 017_goi_hd_line_tri_gia.sql — thêm cột tri_gia cho GOI_HD_LINE (SCHEMA_VERSION = 10)
--
-- Phiếu gói bê nốt 3 cột giá của Hoa_Sang (BẢNG TỔNG HỢP HOÁ ĐƠN THEO GÓI):
--   G.đơn 3   = giá bình quân thực bán  = tri_gia / so_luong
--   G.chuẩn 4 = giá niêm yết trong danh mục (DM_HANG_NB.gia_ban, quy về đơn vị nhỏ)
--   3-4       = chênh lệch, để chủ hàng soi ngay trên giấy xem bán dưới giá chuẩn chỗ nào
--
-- VÌ SAO tri_gia PHẢI CHỐT VÀO SNAPSHOT (không JOIN sống như he_so_lon):
--   - tri_gia là TIỀN CỦA CHUYẾN HÀNG NÀY — cộng từ các đơn con lúc chốt gói. Nó là
--     sự thật lịch sử, y như so_luong. Sửa giá trong danh mục về sau KHÔNG được làm
--     biến hình tờ phiếu đã in.
--   - Còn he_so_lon (1 thùng = mấy lon) là thuộc tính ĐÓNG GÓI của mặt hàng, không phải
--     con số của chuyến — nên cái đó vẫn đọc sống từ DM_HANG_NB.
--   Cùng nguyên tắc với ten_kh nguyên văn trên HOA_DON.
--
-- Chạy cho MỌI tenant (bảng rỗng vô hại với tenant thuế — AD-NB-09). Chạy lại được
-- nhiều lần. Chạy sau 015.

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

-- Trị giá gộp của mặt hàng trong gói = SUM(so_luong × don_gia) của mọi đơn con,
-- ĐÃ LOẠI hàng tặng (khớp cách tính tiền hàng ở mọi nơi khác).
IF COL_LENGTH('GOI_HD_LINE', 'tri_gia') IS NULL
    ALTER TABLE GOI_HD_LINE ADD tri_gia DECIMAL(18,2) NULL;
GO

IF NOT EXISTS (SELECT 1 FROM SCHEMA_VERSION WHERE Ver = 10)
    INSERT INTO SCHEMA_VERSION (Ver) VALUES (10);
GO
