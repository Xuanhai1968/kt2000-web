/* ===========================================================================
   DK_PUB_capnhat_01_lookup.sql — vá KT2000_PUB đã tạo TRƯỚC 19/08
   (bản KT2000_PUB_schema.sql mới nhất đã có sẵn cột này — DB tạo mới
   bằng bản mới thì KHÔNG cần chạy file này)
   ===========================================================================
   Bổ sung cho TẦNG LOOKUP trước model (README mục 1):
   last_hit_at = lần cuối lookup dùng dòng này. Mục đích: tích số liệu
   để sau này (vd 2028) quyết định có lọc đầu vào TRAIN theo "cụm không
   dùng N năm" hay không — bằng số liệu, không bằng cảm giác.
   KHÔNG BAO GIỜ dùng cột này để DELETE dòng: lookup là trí nhớ vĩnh
   viễn, muốn giảm cân thì lọc lúc EXPORT TRAIN, không đốt sổ.
   =========================================================================== */
USE KT2000_PUB;
GO
IF COL_LENGTH('dbo.DK_DATA_TRAIN', 'last_hit_at') IS NULL
    ALTER TABLE dbo.DK_DATA_TRAIN ADD last_hit_at DATE NULL;
GO
