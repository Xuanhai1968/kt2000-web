/* ===========================================================================
   0XX_doi_ten_proba_pred_conf.sql  (dev CLAIM SỐ theo quy tắc đánh số script,
   rồi đổi tên file + tăng SCHEMA_VERSION tương ứng)
   ===========================================================================
   Chạy trên KT2000_Base (template) + TẤT CẢ DB tenant hiện có.
   Đã có sẵn 4 cột cũ: is_predict, good_pred (DINH_KHOAN),
                       is_pred_hh, pred_hh_ok (TIM_TEN_HANG) -> GIỮ, dùng lại.

   QUYẾT ĐỊNH (Hiu, 18/08): KHÔNG thêm pred_label. Nhãn máy đoán ghi thẳng
   vào GHI_NO (HĐ đầu vào) / GHI_CO (HĐ đầu ra) như bản VFP - các cột này
   trống khi lấy XML về, máy đoán xong ghi luôn + is_predict = 1.
   Phát hiện "user sửa" xảy ra NGAY TRONG transaction chốt: C# so giá trị
   user gửi lên với giá trị hiện tại trong DB -> không cần cột snapshot.
   Định khoản lại: WHERE is_predict = 1 AND good_pred = 0.

   Confidence: VFP vẫn ghi vào cột proba của HOA_DON_LINE, cột này đã có
   trong schema web -> ĐỔI TÊN proba -> pred_conf (ngữ nghĩa rõ hơn, cùng
   họ với is_predict/good_pred), KHÔNG thêm cột mới. Đổi bây giờ là rẻ
   nhất - càng để lâu càng nhiều code C# tham chiếu proba.
   LƯU Ý DEV: sửa entity C# đang map proba trong CÙNG PR với script này.
   pred_conf phục vụ:
   - Màn chốt tô màu dòng máy KHÔNG CHẮC (conf < 0.70) để user ưu tiên soi
   - Luật audit: dòng chốt OK nhưng conf < 0.85 vẫn đưa vào DATA_TRAIN
   =========================================================================== */
-- An toàn chạy lại nhiều lần:
IF COL_LENGTH('dbo.HOA_DON_LINE', 'proba') IS NOT NULL
   AND COL_LENGTH('dbo.HOA_DON_LINE', 'pred_conf') IS NULL
    EXEC sp_rename 'dbo.HOA_DON_LINE.proba', 'pred_conf', 'COLUMN';
GO
-- Nếu DB nào chưa hề có cột (schema quá cũ):
IF COL_LENGTH('dbo.HOA_DON_LINE', 'pred_conf') IS NULL
    ALTER TABLE dbo.HOA_DON_LINE ADD pred_conf DECIMAL(5,4) NULL;
GO
