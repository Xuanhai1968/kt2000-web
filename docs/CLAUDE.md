# CLAUDE.md — Luật nhà repo kt2000-web

> File này được Claude Code tự đọc mỗi phiên và là luật chung cho MỌI người/agent sửa code trong repo.
> Thay đổi file này = PR do Leader (Hiu) duyệt.

## Bối cảnh 30 giây

Hệ thống kế toán web thay thế KT2000 (VFP, chạy từ 2000). **Một codebase, HAI sản phẩm**:
- **Thuế** (`tenant_type` thường/internal): kế toán thuế cho ~20 khách B2B — nạp HĐĐT, lên sổ.
- **Nội bộ / NB** (`tenant_type = noibo`): đơn hàng, giao hàng, thu tiền cho chính các khách đó; định khoản chạy ngầm, user không thấy Nợ/Có.

Stack: ASP.NET Core (.NET 10) + EF Core + SQL Server Express | React + TS + Ant Design (Vite) | Python tools trong `tools/`.
Mô hình dữ liệu: **DB-per-tenant-per-year** `<MA_DONVI>_<NĂM>` + KT2000_Master + KT2000_Base.
Spec nghiệp vụ: `docs/` (thuế) và `docs/nb/` (nội bộ). Quyết định lịch sử: `docs/NHAT-KY-QUYET-DINH.md`. Checklist review PR: `docs/LUAT-REVIEW.md`.

## 10 LUẬT CỨNG (vi phạm = PR bị trả lại)

1. **Resolver-only**: mọi tên DB / connection string CHỈ được sinh qua `TenantDbResolver`. Cấm ghép chuỗi tên DB ở bất kỳ đâu khác (kể cả từ Host header/subdomain — phải tra bảng mapping trong Master). Mã đơn vị tuân BR-DB-01: A-Z 0-9 _, 3-30 ký tự.
2. **Claim gates**: endpoint nhạy cảm phải gate bằng claim (`is_admin`, `tenant_type`). Instance NB (`Mode=NB`) không được lộ endpoint admin/console thuế.
3. **SQL tham số hóa** 100%. Cấm nối chuỗi giá trị vào câu SQL.
4. **Không secret / không path cứng** trong code: mật khẩu, connection string, đường dẫn thư mục đều sống trong appsettings (`Paths`, connection). appsettings.json thật KHÔNG commit.
5. **Cột định khoản bất khả xâm phạm với hàm nguồn**: các hàm nạp/nhập từ nguồn ngoài (importer, worker) không được ghi đè `ghi_no/ghi_co`, `ma_ct_*`, `ma_kh`, `ngay_nh`, `ghi_chu` đã có. Chế độ mặc định = "cập nhật có chừa"; xóa trắng chỉ qua tùy chọn XoaTruocKhiGhi tường minh.
6. **Schema = MỘT dòng script đánh số** trong `database/` cho cả hai sản phẩm. Mỗi thay đổi DB = script mới đánh số tiếp + tăng SCHEMA_VERSION. Cấm sửa script đã chạy. Bảng LINE mới phải có IDENTITY(1,1) từ đầu (bài học script 010).
7. **Móc TaskStatus + ActivityLog**: mọi chức năng nghiệp vụ mới phải ghi vết theo khuôn 008.
8. **Comment BR**: chỗ code hiện thực một luật nghiệp vụ phải ghi mã luật (vd `// BR-HD-01`, `// BR-NB-02`) để truy ngược về spec.
9. **Ranh giới hai sổ (NB)**: code NB chỉ ĐỌC DB thuế qua endpoint tra cứu duy nhất (BR-NB-03, SELECT-only, gate claim + LinkedTenantCode). Cấm mọi lệnh ghi từ luồng NB sang DB thuế và ngược lại.
10. **Đụng vùng lõi chung = review đặc biệt**: sửa các vùng sau phải ghi rõ trong mô tả PR và chờ Leader duyệt kỹ (dev còn lại được tag để biết): `TenantDbResolver`, auth/JWT/login, engine định khoản + kết chuyển, `database/`, các service dùng chung (TaskStatus/ActivityLog, AdminService), file cấu hình deploy.

## Nếp làm việc

- **Spec trước code**: không code tính năng chưa có spec trong `docs/`. Yêu cầu đổi giữa chừng → PR sửa spec trước, code sau.
- Nhánh theo Issue, sống ngắn: `feat/nb-<số issue>-<mô tả>` hoặc `fix/thue-<số issue>-<mô tả>`; merge bằng Squash; xóa nhánh sau merge. KHÔNG có nhánh cá nhân dài hạn.
- PR nhỏ, một việc một PR, mô tả có "Fixes #n".
- Frontend NB tuân BR-NB-05 (nhịp bàn phím kiểu VFP: Enter nhảy ô, F2 lưu, ESC hủy, Ctrl+T tra cứu).
- Tên cột giữ theo VFP gốc; bộ tứ audit `created_by/created_at/updated_by/updated_at` trên bảng nghiệp vụ.
- Khi không chắc một quyết định nghiệp vụ: KHÔNG tự đoán — hỏi Leader hoặc tra `docs/NHAT-KY-QUYET-DINH.md`.
