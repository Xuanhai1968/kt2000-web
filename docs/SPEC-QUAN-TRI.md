# SPEC-QUAN-TRI — Console quản trị chung (thuế + NB)

> **Phiên bản:** v0.1 (BẢN NHÁP — chờ Leader duyệt) — **Ngày:** 06/08/2026
> **Vị trí:** `docs/` (cấp chung, KHÔNG thuộc docs/nb/). Việc thi công chủ yếu phía thuế (dev1) vì console sống trong instance thuế.
> Luật sửa đổi: mọi thay đổi sau duyệt đi qua PR sửa file này.

---

## 1. Phạm vi

Bốn khối, tất cả nằm trong **console MDN_NB** (instance thuế, cổng 5000, LAN+VPN):
(1) Quản lý user + phân quyền · (2) Mở năm làm việc (gồm MDN_NB + mở hàng loạt) · (3) CRUD tenant (+LinkedTenantCode) · (4) Quy trình cuối năm.

**Ngoài phạm vi:** màn hình nghiệp vụ NB (SPEC-KT2000-NB), chính sách giá, chi tiết engine chuyển số dư (spec engine).

## 2. Quyết định chung (AD-QT)

| Mã | Quyết định |
|----|-----------|
| **AD-QT-01** | Mọi endpoint quản trị: gate claim `is_admin` + chỉ tồn tại trên instance thuế. Instance `Mode=NB` không có (AD-NB-05). **Ngoại lệ duy nhất**: endpoint *tự đổi mật khẩu của chính mình* phải sống ở CẢ HAI instance (user NB cũng cần đổi). |
| **AD-QT-02** | Mọi thao tác quản trị (tạo/khóa user, cấp quyền, reset mật khẩu, mở năm, sửa tenant) ghi **ActivityLog** (ai, làm gì, cho ai, lúc nào) — có chuyện là tra được. |
| **AD-QT-03** | Không tự động hóa ngầm việc tạo DB: mở năm luôn là hành động có người bấm, có log. |

## 3. QT-01 — Quản lý user & phân quyền

- Danh sách user (lọc theo tenant); tạo user: username, họ tên, **mật khẩu ban đầu**, gán tenant + vai trò; khóa/mở khóa; reset mật khẩu.
- Cờ **MustChangePassword**: bật khi tạo mới / reset → lần đăng nhập đầu bắt đổi mật khẩu (mật khẩu ban đầu thường đọc qua điện thoại/Zalo — không được sống lâu).
- **Vai trò**: thêm cột `Role` trên `UserTenantAccess` (quyền theo TỪNG tenant). v1: tenant `noibo` dùng `nhap_don` / `quan_ly` (theo mục 5 SPEC-KT2000-NB); tenant thuế tạm để trống, quyền quản trị vẫn là `is_admin` như hiện tại.
- Schema Master: script đánh số mới — `UserTenantAccess.Role` + `Users.MustChangePassword` (nullable/default, không phá dữ liệu cũ).

## 4. QT-02 — Mở năm làm việc

- **MoNamLamViec liệt kê cả MDN_NB** (bỏ filter loại tenant `internal`) — mở năm cho chính tenant quản lý đi chung đường `OpenYears`, DB rỗng sinh ra là chấp nhận được (không đặc cách).
- **Mở năm hàng loạt**: tick nhiều đơn vị → chọn năm → chạy TUẦN TỰ từng đơn vị, hiện kết quả từng dòng (OK / lỗi + lý do); đơn vị lỗi không chặn đơn vị sau. Ghi TenantChangeLog + ActivityLog từng đơn vị.
- Ước lượng cuối năm: ~30-40 lượt mở (khách thuế + tenant `*_NB` + MDN_NB) — đây là lý do tồn tại của tính năng hàng loạt.

## 5. QT-03 — CRUD tenant

- Giữ màn DonViKhachHang hiện có; bổ sung khi tạo/sửa tenant loại `noibo`: trường **`LinkedTenantCode`** (trỏ về tenant thuế tương ứng — AD-NB-03), validate mã tồn tại + đúng BR-DB-01.
- Mapping subdomain (`tuannga.ndnew.net` → tenant): bảng riêng trong Master, giai đoạn 2 (AD-NB-07) — chưa làm v1.

## 6. Quy trình cuối năm (checklist vận hành — không phải code)

1. Backup toàn bộ SQL sang server 2 (bắt buộc trước mọi bước).
2. Mở năm hàng loạt cho danh sách đơn vị còn hoạt động.
3. Chạy chuyển số dư kỳ trước (tồn kho, công nợ — engine chung; chi tiết thuộc spec engine).
4. Kiểm tra 2-3 đơn vị mẫu (số dư đầu khớp số cuối năm cũ).
5. Thông báo user năm mới đã sẵn sàng.

## 7. Lộ trình Issue (giao dev1)

1. **QT-#1**: script Master — `UserTenantAccess.Role` + `Users.MustChangePassword`.
2. **QT-#2**: endpoint + form Quản lý user (tạo/khóa/reset/gán quyền, ActivityLog) + endpoint tự đổi mật khẩu (cả 2 instance) + luồng bắt đổi lần đầu.
3. **QT-#3**: MoNamLamViec: hiện MDN_NB + chế độ mở hàng loạt.
4. **QT-#4**: DonViKhachHang: trường LinkedTenantCode cho tenant `noibo`.

## 8. Câu hỏi mở (chốt dần)

1. Chính sách mật khẩu tối thiểu (độ dài? bắt số/ký tự đặc biệt?) — đề xuất: ≥8 ký tự, có số, đủ dùng.
2. Ngoài Leader, ai là admin thứ hai (backup người vận hành)?
3. Tenant thuế có cần vai trò chi tiết hơn `is_admin` không, hay để đến khi có nhu cầu thật?

---

*Lịch sử: v0.1 — 06/08/2026 — bản nháp đầu (gộp quyết định phiên 06/08: user chung ở Master, một form quản lý; mở năm gồm MDN_NB + hàng loạt; chuyển nợ console; quy trình cuối năm).*
