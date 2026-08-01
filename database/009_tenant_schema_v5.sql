-- 009_tenant_schema_v5.sql — cột mới theo biên bản duyệt Bảng ánh xạ (31/07/2026)
-- Chạy trên từng database đơn vị-năm (sau 007). SCHEMA_VERSION → 5.

-- HOA_DON: tên đối tác nguyên văn trên HĐ (không suy từ DM_KH — danh mục có thể cũ)
ALTER TABLE HOA_DON ADD ten_kh NVARCHAR(500) NULL;
-- Trạng thái HĐ từ TCT (hủy / thay thế / điều chỉnh...) — lọc khi hạch toán
ALTER TABLE HOA_DON ADD tthai_hd NVARCHAR(50) NULL;
-- Hướng: CỘT TÍNH TỰ ĐỘNG từ prefix MA_HD (VAO_/RA_) — không ai nạp, không thể lệch
ALTER TABLE HOA_DON ADD huong AS
    (CASE WHEN ma_hd LIKE N'VAO_%' THEN N'VAO'
          WHEN ma_hd LIKE N'RA_%'  THEN N'RA' END) PERSISTED;
GO

-- HOA_DON_LINE: bộ "sự thật gốc" của dòng hàng (nguyên liệu TIM_TEN_HANG)
ALTER TABLE HOA_DON_LINE ADD ten_hang_goc NVARCHAR(500) NULL;
GO

-- BR-HD-01: lưới đỡ danh tính tự nhiên (khhd lưu dạng GHÉP kiểu+ký hiệu → đủ 5 thành phần)
CREATE UNIQUE INDEX UX_HOA_DON_BR01 ON HOA_DON(huong, mst, khhd, so_hd);
CREATE INDEX IX_HOA_DON_huong ON HOA_DON(huong, thang);
CREATE INDEX IX_HOA_DON_tthai ON HOA_DON(tthai_hd);
GO

UPDATE SCHEMA_VERSION SET Ver = 5;
GO

-- Biên bản kèm (không phải SQL):
-- * khhd nạp dạng ghép: str(KIEU_HD) + KHHD (vd '1C25TCS') — quyết định Leader.
-- * ten_kh/dia_chi = nguyên văn trên HĐ theo hướng (VAO: bên bán, RA: bên mua).
-- * dvt ← DVT_G, ten_hang_goc ← TEN_HANG_G, ma_ngan ← MA_NGAN_G (bộ gốc).
-- * tinh_chat ← LOAI_HH (bảng mã TCT: 1=hàng hóa, 2=KM?, 3=chiết khấu... — BR chi tiết ở spec Importer).
-- * BR-IMP-01: trước khi nạp, đối chiếu MST_TRA_CU (và MA_DONVI) với tenant đích — lệch → từ chối cả job.
-- * Bản thể hiện HTML: importer copy sang E:\SCAN_DOC\<MA>\NAM<năm>\<MA_HD>.html (đường dẫn theo quy ước, không lưu cột).
-- * MA_HD giữ nguyên dạng dài tự-mang-danh-tính (không quay lại số đếm V123 — mầm lỗi đè HĐ cũ).
