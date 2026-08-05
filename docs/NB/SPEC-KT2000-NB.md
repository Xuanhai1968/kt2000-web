# SPEC-KT2000-NB — Phần Nội Bộ trên nền kt2000-web

> **Phiên bản:** v0.2 (BẢN NHÁP — chờ Leader duyệt)
> **Ngày:** 05/08/2026
> **Người quyết định:** Hiu (Leader). Người chấp bút: Claude.
> **Luật sửa đổi:** mọi thay đổi yêu cầu sau khi duyệt phải đi qua PR sửa file này (anti-"sao không nói trước").

---

## 1. Mục tiêu & phạm vi

Viết lại **kt2000_nb** (phần mềm nội bộ VFP: tạo đơn hàng, giao hàng, thu tiền, nộp tiền, tồn kho, công nợ, lỗ lãi — định khoản/hạch toán chạy ngầm sau giao diện) thành **một phần của codebase kt2000-web**, KHÔNG fork repo.

- Người dùng NB = nhân viên của khách hàng thuế (bán hàng, thủ kho, thu ngân) — KHÔNG phải kế toán.
- Truy cập qua **internet** bằng trình duyệt → khai tử UltraViewer.
- Nguyên tắc gốc: **một vỏ nhiều ruột** — dùng chung login, Master, resolver, khuôn schema, engine định khoản; chỉ khác `tenant_type` và bộ màn hình.

**Ngoài phạm vi v1:** hệ số quy đổi đơn vị tính; sinh hóa đơn VAT tự động từ đơn hàng (chỉ chuẩn bị dữ liệu liên kết); dashboard cho chủ đơn vị.

---

## 2. Quyết định kiến trúc (AD-NB)

| Mã | Quyết định |
|----|-----------|
| **AD-NB-01** | **Một codebase duy nhất** (repo kt2000-web). Không fork. Hai sản phẩm = hai `tenant_type`. |
| **AD-NB-02** | Mỗi khách dùng NB = **một tenant mới** mã `<MA>_NB` (vd `TUAN_NGA_NB`), `tenant_type = 'noibo'`, tuân BR-DB-01. DB theo công thức sẵn có: `TUAN_NGA_NB_2026`. TenantDbResolver **không sửa gì**. |
| **AD-NB-03** | Bảng `Tenants` (Master) thêm cột **`LinkedTenantCode`** (nullable): tenant NB trỏ về tenant thuế tương ứng (`TUAN_NGA_NB` → `TUAN_NGA`). Đây là sợi dây DUY NHẤT nối hai thế giới. |
| **AD-NB-04** | **Một bản publish, hai instance Windows Service**: `KT2000Api` (cổng 5000, LAN+VPN, như hiện nay) và `KT2000NbApi` (cổng 5001, appsettings riêng, cờ `Mode=NB`). Cùng EXE, khác cấu hình. |
| **AD-NB-05** | Instance NB bị **cắt gọt**: chỉ chấp nhận login của user thuộc tenant `noibo`; toàn bộ endpoint admin/console thuế trả 403/404. Instance NB là bản duy nhất phơi ra internet. |
| **AD-NB-06** | Ra internet qua **reverse proxy HTTPS** (ưu tiên Cloudflare Tunnel — không mở port trên ER7206, không phụ thuộc IP WAN; phương án dự phòng: Caddy + mở port). KHÔNG BAO GIỜ mở thẳng 5000/5001/1433. |
| **AD-NB-07** | Domain `ndnew.net`. Giai đoạn 1: một địa chỉ chung `nb.ndnew.net` (user chọn đơn vị theo flow login sẵn có — thực tế combobox chỉ hiện 1 đơn vị của họ). Giai đoạn 2: subdomain riêng `tuannga.ndnew.net` qua DNS wildcard + middleware đọc Host header → **tra bảng mapping trong Master** (cấm ghép chuỗi Host thành tên DB — vi phạm BR-DB-01/resolver-only). |
| **AD-NB-08** | Hạ tầng: production tập trung trên server .106 (đủ tải với quy mô ~20 khách). Server 2 = backup tự động hàng đêm + dự phòng nóng. Server 3 = staging/test. KHÔNG load-balance 3 server. |
| **AD-NB-09** | Schema NB = **cùng dòng script đánh số** trong `database/`, không có thư mục script riêng. Bảng riêng NB đánh dấu chạy theo tenant_type (hoặc chạy cho mọi tenant — bảng rỗng vô hại; chốt khi làm Issue #1 CreateTenantDatabase). |
| **AD-NB-10** | Engine định khoản/kết chuyển (WP-06) thiết kế **nhận chứng từ từ mọi nguồn** (HĐĐT nạp về HOẶC đơn hàng/phiếu thu NB), không hard-code cho luồng hóa đơn thuế. Viết một lần, hai sản phẩm dùng. |

---

## 3. Luật nghiệp vụ (BR-NB)

### BR-NB-01 — DM_KH nội bộ: riêng hoàn toàn
- Mỗi tenant NB có `DM_KH` **của riêng mình** (nằm trong DB tenant NB, không dùng chung với bên thuế).
- Tên khách phục vụ NGƯỜI GIAO HÀNG (vd "Chị Kim chợ đầu mối") — được phép khác tên trên hóa đơn VAT.
- Có cột tùy chọn `ma_kh_hd` (khách xuất hóa đơn tương ứng bên thuế) — không bắt buộc, để dành cho luồng đơn hàng → hóa đơn RA sau này.
- User NB được tự thêm/sửa khách trong danh mục của mình.

### BR-NB-02 — DM_HANG nội bộ: "danh mục của ai người nấy giữ"
- Mỗi tenant NB có `DM_HANG` **của riêng mình**. Không ngoại lệ (sản xuất hay thương mại đều vậy).
- Bên thuế chỉ đóng vai **từ điển tra cứu chỉ-đọc**. Chọn từ từ điển = **CHÉP** về danh mục NB (không tham chiếu sống): tên (+ `dvt`, `ma_ngan` nếu có) được sao thành bản ghi mới, kèm cột liên kết `ma_hang_thue`.
- Lý do CHÉP không đọc-sống: (1) đơn hàng là sự thật lịch sử — dọn mã bên thuế không được làm biến hình đơn cũ (cùng nguyên tắc `ten_kh` nguyên văn trên HOA_DON); (2) user NB không có quyền ghi sổ thuế; (3) app NB sống độc lập khi endpoint tra cứu trục trặc.
- Đơn vị sản xuất: gõ tên mới trực tiếp, `ma_hang_thue` để trống. Cùng màn hình, không có "chế độ" riêng.
- `dvt` chép về được phép sửa trên bản ghi NB (mua thùng bán lon). Quy đổi hệ số = phiên bản sau.

### BR-NB-03 — Tra cứu xuyên DB: một cửa, chỉ đọc, hai nguồn
- **Một endpoint duy nhất** cho mọi tra cứu từ NB sang thuế; gate bằng claim tenant_type `noibo` + tra `LinkedTenantCode`; SQL tham số hóa; **chỉ SELECT**.
- Nguồn dữ liệu (trong DB thuế của tenant liên kết, cùng SQL instance):
  - **Nguồn A** — dòng `HOA_DON_LINE` hướng VAO **đã được gán `ma_hang`** (kết quả WP-04): nhãn "đã có mã".
  - **Nguồn B** — `ten_hang_goc` của `HOA_DON_LINE` hướng VAO chưa gán mã: nhãn "tên trên HĐ" (phủ hàng mới mua chưa kịp làm kho).
- Kết quả chỉ gồm: tên hàng, dvt, ma_ngan, ma_hang (nếu có). Không trả bất kỳ dữ liệu nào khác của sổ thuế (giá, số tiền, đối tác...) trong v1.
- *(Câu hỏi mở 9.3: có tra thêm DM_HANG trong KT2000_Base không — xem mục 9.)*

### BR-NB-04 — Ranh giới hai sổ
- User NB **không bao giờ** thấy dữ liệu kế toán thuế (ngoài kết quả tra tên hàng theo BR-NB-03) và không bao giờ thấy chữ "Nợ/Có" trên giao diện.
- Định khoản của chứng từ NB chạy ngầm phía backend (engine AD-NB-10), ghi vào DB tenant NB — không đụng DB thuế.

### BR-NB-05 — UX bàn phím kiểu VFP (luật thiết kế frontend NB)
- **Enter** nhảy ô kế tiếp (không phải Tab); Enter ở ô cuối dòng lưới = thêm dòng mới.
- Phím tắt cố định: F2 = Lưu, ESC = Hủy, Ctrl+T = tra tên hàng (tinh thần BR-TIM-01).
- Lưới nhập liệu dày, ít khoảng trắng; mở form là con trỏ nằm sẵn ở ô cần gõ đầu tiên.
- Tra tên hàng = incremental search ngay trong ô (gõ vài ký tự → danh sách hai nguồn BR-NB-03 hiện xuống, kèm nhãn nguồn).
- Mỗi form NB phải có spec riêng kiểu "walkthrough form VFP" (chụp màn hình/mô tả từng phím) + acceptance checklist, giao qua GitHub Issue — như đã làm với SPEC-FRM-LAY-HDDT.

### BR-NB-06 — Rẽ nhánh màn hình theo `tenant_type` (AppShell) — HAI LỚP
- Sau login, AppShell đọc claim `tenant_type` và dựng đúng MỘT bộ menu/route:
  - `internal` (MDN_NB — tenant quản lý): menu QUẢN TRỊ + console thuế (hiện trạng).
  - loại thường (khách thuế): bộ màn hình kế toán thuế (sổ sách, báo cáo).
  - `noibo`: CHỈ bộ menu NB (Tạo đơn hàng, Giao hàng, Thu tiền, Báo cáo NB) — không render bất kỳ route/menu nào của hai loại trên.
- Rẽ nhánh frontend chỉ là lớp TIỆN DỤNG; lớp AN TOÀN thật là backend: mọi endpoint gate bằng claim (luật CLAUDE.md #2), và instance `Mode=NB` chỉ chấp nhận session `noibo` (AD-NB-05) → trên internet chỉ tồn tại bộ màn hình NB dù frontend có lỗi rẽ nhánh.
- Lưu ý đặt tên (ghi vào tu-dien-viet-tat): "NB" trong **MDN_NB** = nội bộ CÔNG TY MÌNH (tenant quản trị, type `internal`); "NB" trong **kt2000_nb / tenant `*_NB`** = sản phẩm nội bộ CHO KHÁCH (type `noibo`). Hai nghĩa khác nhau.

---

## 4. Schema dự kiến (phác thảo — chốt chi tiết cột khi viết script)

Trong DB tenant NB (`<MA>_NB_<năm>`), ngoài các bảng lõi dùng chung khuôn (THU_CHI, TON_KHO, CONG_NO...):

| Bảng | Vai trò | Ghi chú |
|------|---------|---------|
| `DM_KH` | Khách của NB | + `ma_kh_hd` (BR-NB-01); bộ tứ audit created/updated_by/at như 004 |
| `DM_HANG` | Hàng của NB | + `ma_hang_thue` (BR-NB-02); `dvt` sửa được |
| `DON_HANG` | Đơn hàng (master) | trạng thái: nháp → chốt → đã giao → đã thu?; móc TaskStatus/ActivityLog (luật 008) |
| `DON_HANG_LINE` | Dòng đơn | IDENTITY(1,1) ngay từ đầu (bài học script 010) |
| `GIAO_HANG`? | Phiếu giao | **chờ danh sách form VFP** — có thể gộp vào trạng thái DON_HANG |

Bảng Master sửa: `Tenants` + `LinkedTenantCode` (AD-NB-03); bảng mapping subdomain (giai đoạn 2, AD-NB-07).

---

## 5. Phân quyền & bảo mật (khung — chi tiết theo form)

- User NB gắn tenant qua `UserTenantAccess` như hiện nay → combobox login chỉ hiện đơn vị của họ (auto-chọn nếu chỉ có 1).
- Vai trò trong đơn vị NB (tối thiểu v1): `nhap_don` (tạo/sửa đơn của mình), `quan_ly` (thấy tất cả, sửa giá, xem lỗ lãi). Chi tiết chốt theo từng form.
- Instance NB dùng SQL login **quyền hẹp riêng** (không sa): chỉ đọc/ghi các DB `*_NB_*` + Master (phần cần) + SELECT giới hạn trên DB thuế liên kết cho BR-NB-03.
- Backup SQL tự động hàng đêm sang server 2 là **điều kiện tiên quyết** trước khi mở internet (AD-NB-08).
- **Tạo/sửa tenant NB, cấp user, mở năm: CHỈ qua console quản trị** (đăng nhập MDN_NB, màn DonViKhachHang + MoNamLamViec) trên instance thuế trong LAN. Instance NB không có các endpoint này. Tiền đề: MoNamLamViec phải cho chọn cả MDN_NB để mở năm cho chính tenant quản lý (Issue phía thuế).

---

## 6. Vận hành & triển khai

- Chuỗi deploy giữ nguyên (deploy_build.bat → update.bat), thêm restart service thứ hai `KT2000NbApi`.
- appsettings instance NB: cổng 5001, `Mode=NB`, connection string login quyền hẹp.
- Cloudflare Tunnel (hoặc Caddy) cài trên .106, trỏ vào 5001. Thuế vẫn LAN + WireGuard, không đổi.
- Staging trên server 3: dev NB thử schema/form, Leader nghiệm thu Issue trước khi merge.

---

## 7. Tổ chức đội & tiến độ

- Dev A = chuyên thuế (kt2000-web hiện tại). Dev B = chuyên NB.
- **Luật lõi chung** (ghi vào CLAUDE.md): danh sách file/thư mục lõi (resolver, auth, engine, `database/`, service dùng chung) — PR chạm lõi = Leader review kỹ + tag dev còn lại; schema là MỘT dòng số duy nhất; review chéo định kỳ.
- **Trình tự**: TUAN_NGA 2025 ra sổ A-Z trước (WP-04→08). Trong lúc đó NB chỉ chạy tầng giấy: spec này hoàn thiện, dev B đọc codebase + làm Issue nhỏ để thạo quy trình 5 nhịp. Thuế cán mốc → NB khởi công có bản vẽ sẵn.
- Quy trình mỗi tính năng: bàn kiến trúc (Leader+Claude) → Claude nháp spec → **Leader duyệt/sửa (bước quyết định)** → commit docs/ → Issue → dev code → PR → Leader review + Claude review diff → merge → nghiệm thu staging.

---

## 8. Lộ trình Issue dự kiến (sau mốc thuế)

1. **NB-#1**: Master — cột `LinkedTenantCode` + đăng ký tenant `TUAN_NGA_NB` + mở năm (dựa CreateTenantDatabase đã sửa ở Issue #1 của dev).
2. **NB-#2**: cờ `Mode=NB` + instance thứ hai + cắt gọt endpoint (AD-NB-04/05).
3. **NB-#3**: script schema DM_KH/DM_HANG/DON_HANG/DON_HANG_LINE.
4. **NB-#4**: endpoint tra cứu xuyên DB (BR-NB-03).
5. **NB-#5**: form Tạo đơn hàng (spec walkthrough riêng — form quan trọng nhất, làm chuẩn UX cho các form sau).
6. **NB-#6**: Cloudflare Tunnel + nb.ndnew.net + backup hàng đêm (điều kiện mở internet).
7. Tiếp theo: thu tiền, giao hàng, báo cáo... theo danh sách form VFP (mục 9.1).

---

## 9. CÂU HỎI MỞ (Leader điền/chốt)

1. **Danh sách form chính của kt2000_nb bản VFP**: form dùng hằng ngày? form thỉnh thoảng? (→ quyết định phạm vi v1 và thứ tự Issue #5 trở đi, và bảng GIAO_HANG có cần riêng không).
2. Tenant NB đầu tiên mở năm nào: `TUAN_NGA_NB_2026` (làm sống) hay lùi 2025 (chạy song song đối chiếu với VFP)?
3. Tra cứu BR-NB-03 có thêm nguồn `DM_HANG` trong KT2000_Base không? (DM_HANG Base mọc từ HĐĐT của NHIỀU đơn vị — cần cách lọc về đúng hàng của đơn vị liên kết; tạm thời v1 chỉ dùng HOA_DON_LINE của tenant thuế liên kết cho sạch.)
4. Dữ liệu cũ từ kt2000_nb VFP (DBF): có nạp lịch sử vào bản web không, hay chạy mới từ ngày go-live? (nếu nạp → cần importer DBF + chuyển TCVN3, tái dụng kinh nghiệm sẵn có).
5. Phân vai dev: dev nào (Python / C#) về bên nào? (NB nặng frontend; thuế nặng Python tooling.)
6. Chính sách giá trên đơn: user tự gõ giá hay có bảng giá? ai được sửa giá? (ảnh hưởng DM_HANG có cột giá bán hay bảng giá riêng.)

---

*Lịch sử: v0.1 — 04/08/2026 — bản nháp đầu, tổng hợp buổi trao đổi kiến trúc NB.*
*v0.2 — 05/08/2026 — thêm BR-NB-06 (rẽ nhánh màn hình theo tenant_type, hai lớp FE/BE + phân biệt hai nghĩa "NB"); mục 5: tạo tenant NB/mở năm chỉ qua console MDN_NB, kèm tiền đề MoNamLamViec mở năm được cho chính MDN_NB.*
