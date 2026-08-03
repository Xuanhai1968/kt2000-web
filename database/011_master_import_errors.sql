-- 011_master_import_errors.sql — Nhật ký LỖI NẠP từng hóa đơn (KT2000_Master)
--
-- Vì sao cần: nhìn thư mục raw\ chỉ đếm được "còn bao nhiêu file", KHÔNG phân biệt
-- được file chưa nạp với file lệch Σ line vs master phải xử lý tay. Lý do lỗi chỉ
-- biết đúng vào lúc Importer chạy, nên phải ghi lại ngay lúc đó.
--
-- Vòng đời: mỗi lần nạp (đơn vị × năm × tháng) thì XÓA hết dòng cũ của đúng bộ ba đó
-- rồi ghi lại theo kết quả lần chạy mới nhất — bảng luôn phản ánh hiện trạng, không
-- phình theo số lần chạy lại. Muốn xem lịch sử các lần chạy thì tra ActivityLog.

USE KT2000_Master;
GO

IF OBJECT_ID('ImportError') IS NOT NULL DROP TABLE ImportError;
GO

CREATE TABLE ImportError (
    Id        BIGINT IDENTITY(1,1) PRIMARY KEY,
    TenantId  UNIQUEIDENTIFIER NOT NULL REFERENCES Tenants(Id),
    Nam       INT           NOT NULL,
    Thang     INT           NOT NULL,
    Huong     NVARCHAR(3)   NOT NULL,   -- VAO / RA
    MaHd      NVARCHAR(80)  NOT NULL,
    LoaiLoi   NVARCHAR(20)  NOT NULL,   -- LECH_TONG / KHONG_RO_NGAY / LOI_GHI / LOI_DOI_FILE
    LyDo      NVARCHAR(500) NULL,
    TaoLuc    DATETIME2     NOT NULL DEFAULT SYSDATETIME(),
    TaoBoi    NVARCHAR(50)  NULL
);
GO

-- Cột "lệch Σ line" của FRM_LAY_HDDT đếm theo đúng chỉ mục này
CREATE INDEX IX_ImportError_ky ON ImportError(TenantId, Nam, Thang, LoaiLoi);
GO
