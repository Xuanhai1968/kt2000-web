# SPEC-SCHEMA-UPGRADER — Tự kiểm tra & nâng cấp schema DB tenant

| Version | Ngày | Thay đổi |
|---|---|---|
| v0.1 | 18/08/2026 | Bản đầu (Hiu + Claude chốt hướng thiết kế) |
| v0.2 | 18/08/2026 | Hiu chốt cả 4 câu §4: chia bộ script THUE/NB, deploy cạnh app, không rà idempotent trước, KHÔNG startup scan (lazy theo resolver) |

## 1. Bối cảnh & mục tiêu

Bên VFP, Hiu có sẵn đoạn code bắt buộc chạy khi đăng nhập: kiểm tra cột
thiếu và thêm luôn trước khi open database. Bản web kế thừa Ý ĐỊNH đó
(hệ thống tự lành — user không bao giờ gặp lỗi thiếu cột/thiếu bảng)
nhưng đổi CÁCH LÀM cho môi trường nhiều user đồng thời.

Drift schema đã xảy ra thật: HUY_THANH_2025 từng sinh ra chỉ có
SCHEMA_VERSION phải chạy tay 004-010; TUAN_NGA_2026 vẫn ở v1. Với 64
đơn vị × nhiều năm, lệch là chắc chắn nếu không có cơ chế tự động.

**Mục tiêu:** một viên gạch `SchemaUpgrader` (LUẬT 12) đảm bảo mọi DB
tenant + KT2000_Base luôn đạt SCHEMA_VERSION mới nhất, kích hoạt được
từ nhiều chỗ, an toàn khi nhiều request đồng thời.

## 2. Phạm vi

- **Trong phạm vi:** các DB tenant (`<MA_DONVI>_<NĂM>`) + KT2000_Base.
- **Ngoài phạm vi:** KT2000_Master và KT2000_PUB (ít DB, thay đổi hiếm,
  nâng tay bằng script như hiện nay; xét đưa vào ở version sau).

## 3. Business Rules

**BR-SU-01 — MỘT nguồn sự thật.** Upgrader KHÔNG giữ danh sách cột/bảng
trong code (khác bản VFP). Tri thức schema nằm DUY NHẤT ở bộ script đánh
số trong `database/` của repo, chia theo loại tenant: `database/THUE/`
và `database/NB/`, MỖI LOẠI MỘT DẢI SỐ RIÊNG và SCHEMA_VERSION so trong
phạm vi loại đó — DB thuộc loại nào chạy bộ đó (KT2000_Base là template
thuế nên theo bộ THUE; khi khởi công app NB, Base của NB theo bộ NB).
Upgrader chỉ làm hai việc: đọc SCHEMA_VERSION của DB, chạy lần lượt các
script có số lớn hơn trong bộ tương ứng. Thấy code C# nào tự kiểm tra
`COL_LENGTH`/`IF EXISTS` cho một cột nghiệp vụ cụ thể là vi phạm — sửa
schema thì viết script, không viết checker.

**BR-SU-02 — Viên gạch (LUẬT 12).** `SchemaUpgrader` là một service duy
nhất với 2 method: `Check(db)` (trả về: đủ / thiếu từ Ver nào đến Ver
nào) và `Upgrade(db)` (chạy phần còn nợ). Gọi chung từ 2 chỗ, chỉ khác
cách kích hoạt: (1) TenantDbResolver, (2) màn console MDN_NB. KHÔNG có
startup scan (xem §4.4): triết lý là lazy — "đăng nhập đơn vị nào, năm
nào thì làm database đó", DB không ai đụng tới thì không tốn công nâng.

**BR-SU-03 — Điểm gác = TenantDbResolver.** Mọi kết nối tenant đều qua
resolver (luật nhà số 1), nên đặt Check tại đây phủ CẢ đăng nhập trực
tiếp vào đơn vị LẪN MDN_NB thao tác hộ đơn vị — không cần hai nhánh.

**BR-SU-04 — Check rẻ.** Kết quả Check cache trong RAM theo vòng đời app
(key = tên DB). Sau lần đầu, mỗi resolve không tốn thêm query nào. Nâng
cấp thành công hoặc thất bại đều cập nhật cache. Restart service = xóa
cache (chấp nhận, mỗi DB tốn 1 query đầu tiên).

**BR-SU-05 — Nâng cấp an toàn đồng thời.** `Upgrade` phải giành
`sp_getapplock` (tên khóa = `SCHEMA_UPGRADE_<tên DB>`, scope toàn
instance) trước khi chạy script. Kẻ đến sau chờ khóa, lấy được thì ĐỌC
LẠI SCHEMA_VERSION — nếu đã đủ (người trước nâng xong) thì thoát êm,
không chạy lại.

**BR-SU-06 — Từng script một transaction, dừng đúng chỗ khi lỗi.** Chạy
script theo thứ tự số tăng dần; mỗi script gói trong 1 transaction, xong
thì cập nhật SCHEMA_VERSION rồi mới sang script kế. Script lỗi →
rollback script đó, DỪNG, SCHEMA_VERSION đứng ở script cuối thành công,
báo lỗi rõ (tên script + message SQL). Không bao giờ nuốt lỗi chạy tiếp.

**BR-SU-07 — Van an toàn.** Config `"AutoUpgradeSchema": true/false`
(appsettings, mặc định true). Khi false: resolver chỉ Check; DB thiếu →
trả lỗi rõ ràng cho frontend ("Đơn vị X cần nâng cấp dữ liệu, liên hệ
quản trị") thay vì tự ALTER. Dùng khi đang nghiệm thu hoặc nghi ngờ một
script.

**BR-SU-08 — KT2000_Base nâng như một DB thường**, và
CreateTenantDatabase phải chạy ĐỦ bộ script đánh số cho DB mới sinh
(đóng tận gốc Issue #1 — template gap). Tenant mới sinh ra đã đạt Ver
mới nhất, không có ngoại lệ.

**BR-SU-09 — Ghi vết (luật nhà số 7).** Mỗi lần Upgrade ghi
ActivityLog: tên DB, Ver từ → đến, danh sách script đã chạy, thời gian,
nguồn kích hoạt (resolver/console), kết quả. Lỗi cũng ghi.

**BR-SU-10 — Màn console MDN_NB "Schema đơn vị"** (chỉ internal admin,
gate 403 như AdminController): grid mọi DB tenant × SCHEMA_VERSION hiện
tại × Ver mới nhất × trạng thái (Đủ/Thiếu/Lỗi lần nâng gần nhất), nút
"Nâng cấp" từng DB + "Nâng cấp tất cả" (gọi cùng viên gạch, chạy tuần
tự từng DB, hiện tiến độ).

**BR-SU-11 — Số script duy nhất toàn cục.** Tiền đề bắt buộc trước khi
bật upgrader: xử lý xong va chạm đánh số hiện có (hai bộ 013/014 song
song, LinkedTenantCode trùng 2 lần) theo quy tắc claim số. Upgrader gặp
hai file cùng số phải TỪ CHỐI chạy và báo lỗi cấu hình — không tự chọn.

## 4. Quyết định đã chốt (Hiu, 18/08 — nâng từ §4 "câu hỏi as-built" của v0.1)

1. **Bộ script chia theo tenant_type:** thư mục con `database/THUE/`,
   `database/NB/`, mỗi loại một dải số + SCHEMA_VERSION riêng phạm vi
   loại đó; DB thuộc loại nào chạy bộ đó (đã đưa thành luật trong
   BR-SU-01). Việc di chuyển các script hiện có vào thư mục con làm
   CÙNG PR với cleanup đánh số 013/014 (BR-SU-11) — dọn một lần cho xong.
2. **Deploy script:** thư mục `database\` nằm cạnh app (robocopy của
   update.bat mang theo), upgrader đọc từ `AppContext.BaseDirectory`.
   Lưu ý dev: kiểm tra `deploy_build.bat` có đưa `database\` vào gói
   build không — thiếu thì server không có script để chạy.
3. **KHÔNG rà idempotent trước — làm luôn, có vấn đề sửa tiếp.** Lý do
   Hiu: để sau thêm phức tạp, và cũng là cho dev quen dần với kỷ luật
   không tự viết `COL_LENGTH`/`IF EXISTS` cho cột nghiệp vụ trong code
   C#. Rủi ro thấp vì upgrader chạy theo version nên mỗi script vốn chỉ
   chạy đúng 1 lần, và mỗi script gói 1 transaction (BR-SU-06) — lỗi
   giữa chừng là rollback nguyên script, không có chuyện nửa vời.
4. **KHÔNG startup scan.** Đăng nhập đơn vị nào, năm nào thì làm
   database đó — DB không ai đụng thì không nâng. Hệ quả chấp nhận
   được: lần đăng nhập ĐẦU TIÊN vào một đơn vị sau đợt deploy có nhiều
   script mới sẽ chậm hơn vài giây (các lần sau đã có cache, BR-SU-04).
   Ai muốn "nâng trước cho êm" thì dùng nút "Nâng cấp tất cả" ở màn
   console (BR-SU-10) — đó chính là startup scan phiên bản chủ động.

## 5. Gợi ý triển khai (GỢI Ý — acceptance mục 6 là trọng tài)

```csharp
// Viên gạch — đăng ký singleton
public sealed class SchemaUpgrader
{
    // cache: tên DB -> Ver đã xác nhận đủ (ConcurrentDictionary)
    public SchemaCheckResult Check(string dbName);   // đọc SCHEMA_VERSION, so LatestVer
    public UpgradeResult Upgrade(string dbName, string triggeredBy);
}

// Trong TenantDbResolver, SAU khi ghép tên DB, TRƯỚC khi trả connection:
var check = _upgrader.Check(dbName);
if (!check.UpToDate)
{
    if (_options.AutoUpgradeSchema)
        _upgrader.Upgrade(dbName, "resolver");      // bên trong có applock
    else
        throw new SchemaOutdatedException(dbName, check);
}
```

Khóa chống đua (bên trong Upgrade, trên connection tới chính DB đó):
```sql
EXEC sp_getapplock @Resource = @LockName, @LockMode = 'Exclusive',
     @LockOwner = 'Session', @LockTimeout = 60000;
-- lấy được khóa -> ĐỌC LẠI SCHEMA_VERSION rồi mới quyết định chạy gì
```

Điểm dễ sai dev cần tránh: (a) chạy script bằng cách split theo dòng
`GO` — GO không phải lệnh SQL, phải tách batch trước khi Execute;
(b) quên đọc lại version sau khi lấy khóa; (c) cache "Thiếu" mà không
cache "Lỗi" → mỗi request lại thử nâng lại DB đang hỏng, dội log.

## 6. Nghiệm thu (ngôn ngữ end-user, có thể test tay)

- A1. Hạ SCHEMA_VERSION của 1 DB test xuống Ver cũ → đăng nhập đơn vị
  đó → vào được bình thường; kiểm tra DB đã đạt Ver mới nhất; ActivityLog
  có 1 dòng nâng cấp ghi đủ from/to/scripts.
- A2. Hai người đăng nhập cùng đơn vị (DB đang thiếu) cùng lúc → cả hai
  vào được; ActivityLog chỉ có MỘT lần nâng.
- A3. Gài 1 script lỗi cú pháp → đăng nhập → nhận thông báo lỗi rõ (tên
  script); SCHEMA_VERSION đứng đúng ở script cuối thành công; sửa script
  → đăng nhập lại → nâng tiếp từ đúng chỗ dừng.
- A4. AutoUpgradeSchema=false + DB thiếu → không có ALTER nào chạy
  (soi bằng trace/log), frontend nhận thông báo "cần nâng cấp".
- A5. Tạo đơn vị mới từ console → DB sinh ra đạt Ver mới nhất ngay,
  không cần chạy tay script nào (Issue #1 đóng).
- A6. Màn "Schema đơn vị" liệt kê đúng Ver mọi DB; nút "Nâng cấp tất cả"
  đưa toàn bộ về Ver mới nhất.
- A7. Đăng nhập lần 2 trở đi vào DB đã đủ: soi SQL profiler không thấy
  query SCHEMA_VERSION nào nữa (cache hoạt động).
- A8. `grep` toàn repo: không có chuỗi ALTER TABLE nào trong code C#
  ngoài SchemaUpgrader đọc từ file script (BR-SU-01).
