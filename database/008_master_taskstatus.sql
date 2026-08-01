-- 008_master_taskstatus.sql — Bảng tình hình công việc + nhật ký hoạt động (KT2000_Master)
-- Nền cho "bảng điều độ của kế toán trưởng": mỗi (đơn vị × năm × tháng × việc) một dòng
-- trạng thái hiện tại; mọi hành động đáng kể ghi thêm 1 dòng nhật ký append-only.
-- Nguyên tắc: DỮ LIỆU GHI VÀO DB, ĐỌC QUA API/WEB — không máy nào phải đi đọc file log.
USE KT2000_Master;
GO

-- Trạng thái HIỆN TẠI của từng đầu việc (upsert — bảng này để dashboard đọc)
CREATE TABLE TaskStatus (
    TenantId   UNIQUEIDENTIFIER NOT NULL REFERENCES Tenants(Id),
    Nam        INT              NOT NULL,
    Thang      INT              NOT NULL,   -- 0 = việc mức cả năm
    TaskCode   NVARCHAR(30)     NOT NULL,   -- LAY_HD / DOI_CHIEU_TCT / LAM_KHO / DINH_KHOAN
                                            -- / NGAN_HANG / TINH_LAI / KHOA_SO ... (mở rộng dần)
    Status     NVARCHAR(20)     NOT NULL,   -- pending / running / done / error / skipped
    SoLuong    INT              NULL,       -- con số kèm theo (vd số HĐ đã lấy/đã nạp)
    Message    NVARCHAR(500)    NULL,
    UpdatedBy  NVARCHAR(50)     NULL,       -- login_name hoặc 'SYSTEM' (job tự chạy)
    UpdatedAt  DATETIME2        NOT NULL DEFAULT SYSDATETIME(),
    CONSTRAINT PK_TaskStatus PRIMARY KEY (TenantId, Nam, Thang, TaskCode)
);
CREATE INDEX IX_TaskStatus_board ON TaskStatus(Nam, Thang, TaskCode, Status);
GO

-- Nhật ký hoạt động — CHỈ THÊM, không sửa/xóa (phân tích thời gian làm việc, truy vết)
CREATE TABLE ActivityLog (
    Id        BIGINT IDENTITY(1,1) PRIMARY KEY,
    At        DATETIME2      NOT NULL DEFAULT SYSDATETIME(),
    UserName  NVARCHAR(50)   NOT NULL,       -- login_name hoặc 'SYSTEM'
    TenantId  UNIQUEIDENTIFIER NULL REFERENCES Tenants(Id),
    Nam       INT            NULL,
    Thang     INT            NULL,
    Action    NVARCHAR(50)   NOT NULL,       -- LOGIN / LAY_HD_START / LAY_HD_DONE / SUA_HD / ...
    Detail    NVARCHAR(500)  NULL
);
CREATE INDEX IX_ActivityLog_user_time ON ActivityLog(UserName, At);
CREATE INDEX IX_ActivityLog_tenant ON ActivityLog(TenantId, At);
GO

-- Ghi chú thi hành (không phải SQL):
-- 1) Mỗi chức năng từ WP-03 trở đi PHẢI kèm 2-3 dòng code ghi TaskStatus/ActivityLog
--    ngay khi viết ("móc rẻ lúc xây, đắt lúc trang bị lại"). Móc đầu tiên: DownloadJobs
--    → TaskStatus(LAY_HD) + ActivityLog(LAY_HD_START/DONE).
-- 2) Trang dashboard /app/tinh-hinh (ma trận đơn vị × tháng, ô màu theo Status) làm
--    sau khi có ≥2 loại TaskCode phát sinh dữ liệu thật — WP riêng, ước 2-3 ngày.
-- 3) ActivityLog đủ suy "giờ làm việc trong ngày" (hành động đầu/cuối mỗi user mỗi
--    ngày) — minh bạch với user rằng hệ thống ghi vết thao tác.
