# SPEC-KT2000-NB — Phần Nội Bộ trên nền kt2000-web

> **Phiên bản:** v0.5 (BẢN NHÁP — chờ Leader duyệt)
> **Ngày:** 05/08/2026
> **Người quyết định:** Hiu (Leader). Người chấp bút: Claude.
> **Luật sửa đổi:** mọi thay đổi yêu cầu sau khi duyệt phải đi qua PR sửa file này (anti-"sao không nói trước").

---

## 1. Mục tiêu & phạm vi

Viết lại **kt2000_nb** (phần mềm nội bộ VFP: tạo đơn hàng, giao hàng, thu tiền, nộp tiền, tồn kho, công nợ, lỗ lãi — định khoản/hạch toán chạy ngầm sau giao diện) thành **một phần của codebase kt2000-web**, KHÔNG fork repo.

- Người dùng NB = nhân viên của khách hàng thuế (bán hàng, thủ kho, thu ngân) — KHÔNG phải kế toán.
- Truy cập qua **internet** bằng trình duyệt → khai tử UltraViewer.
- Nguyên tắc gốc: **một vỏ nhiều ruột** — dùng chung login, Master, resolver, khuôn schema, engine định khoản; chỉ khác `tenant_type` và bộ màn hình.

**Phạm vi màn hình v1** (theo màn hình chính kt2000_nb VFP — chốt 9.1):
- Nhập liệu: **Phiếu giao hàng** (tạo đơn — form chuẩn UX), **Phiếu nhập hàng**, **Phiếu thu**, **Phiếu chi**, **Bút toán khác**.
- Báo cáo (suy ra từ input): **Tồn kho**, **Công nợ**, **Dòng tiền cuối ngày**.
- **Gói hàng**: mục RIÊNG trên màn hình chính (không nằm trong Phiếu giao hàng) — vòng đời gói kéo dài sang cả THU TIỀN theo gói (BR-NB-08).

**Ngoài phạm vi v1:** hệ số quy đổi đơn vị tính; chính sách giá (tách SPEC riêng, chốt 9.6 — v1 gõ giá tay); sinh hóa đơn VAT tự động từ đơn hàng (chỉ chuẩn bị dữ liệu liên kết); dashboard cho chủ đơn vị; nạp lịch sử DBF (chỉ nhập tồn đầu — chốt 9.4).

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

### BR-NB-01 — DM_KH_NB: riêng hoàn toàn
- Mỗi tenant NB có `DM_KH_NB` **của riêng mình** (nằm trong DB tenant NB, không dùng chung với `DM_KH` của KT2000_Base).
- Tên khách phục vụ NGƯỜI GIAO HÀNG (vd "Chị Kim chợ đầu mối") — được phép khác tên trên hóa đơn VAT.
- Có cột tùy chọn `ma_kh_hd` (khách xuất hóa đơn tương ứng bên thuế) — không bắt buộc, để dành cho luồng đơn hàng → hóa đơn RA sau này.
- User NB được tự thêm/sửa khách trong danh mục của mình.
- **DM_KH_NB = danh mục ĐỐI TƯỢNG CÔNG NỢ**, không chỉ khách: chứa cả TOÀN BỘ nhân viên công ty — cột **`loai_dt`** (`KH`/`NV`, mở rộng được). Lý do thực địa: tạm ứng/chi lương, NV ứng tiền mua hàng, sửa xe, và nợ đơn hàng chuyển sang NV — tất cả lên chung bảng tổng hợp công nợ. Nhờ vậy CONG_NO chỉ cần MỘT cột đối tượng (`ma_kh` trỏ DM_KH_NB) cho mọi loại nợ — giải đúng chỗ VFP chưa thỏa mãn.
- `ma_nvkd`/`ma_nvvc` trên đơn trỏ về dòng `loai_dt='NV'` (combobox lọc theo loai_dt — ít dòng, nhanh). KHÔNG có bảng DM_NV_NB riêng.
- **Chuyển công nợ khách → NV** = MỘT CHỨNG TỪ điều chuyển (giảm nợ đối tượng KH, tăng nợ đối tượng NV), KHÔNG sửa đơn gốc — giữ vết ai nợ trước, chuyển cho ai, ngày nào. Định khoản do engine lo sau bức màn (BR-NB-04).

### BR-NB-02 — DM_HANG_NB: "danh mục của ai người nấy giữ"
- Mỗi tenant NB có `DM_HANG_NB` **của riêng mình**. Không ngoại lệ (sản xuất hay thương mại đều vậy).
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

### BR-NB-07 — Trừ kho theo `ngay_nh`, không theo ngày tạo đơn
- Tạo đơn = CHƯA trừ kho (kho thực tế chưa mất gì). Thủ kho đánh `ngay_nh` = ngày hàng THẬT SỰ rời kho → engine mới trừ tồn / tính giá vốn, theo TỪNG DÒNG của đơn.
- Cho phép đánh đơn hôm trước, giao hôm sau (NVKD gom đơn cuối ngày, sáng mai xe chở đi).

### BR-NB-08 — Gói hàng (`GOI_HD`)
- Gói = nhóm đơn giao cùng chuyến / cùng khu vực (vd "gói phố Đại Từ"), một `ma_nvvc` phụ trách.
- Ghép gói: user tích chọn đơn theo `ma_hd` → đơn nhận `ma_goi` (cột trên HOA_DON; mỗi đơn thuộc TỐI ĐA MỘT gói — một đơn không lên hai xe).
- **CHỐT GÓI** sinh `GOI_HD_LINE` = SNAPSHOT tổng hợp mặt hàng của mọi đơn con (20 đơn × 1 thùng sữa chua → 1 dòng 20 thùng) — phiếu soạn hàng cho kho, vào kho MỘT lần.
- Đơn thuộc gói đã chốt bị **KHÓA sửa**; muốn sửa phải rút đơn khỏi gói, gói chốt lại thì snapshot tính lại — nhờ vậy phiếu soạn không bao giờ lệch xe chở.
- **XUẤT GÓI** = một thao tác đóng dấu `ngay_nh` hàng loạt cho mọi đơn con (rút được đơn không giao kịp trước khi xuất).
- Gói còn là đầu mối **THU TIỀN**: NVVC cuối ngày nộp tiền các đơn trong gói → màn hình Gói hàng đứng RIÊNG trên màn hình chính. Luật cứng: tiền thu theo gói phải **PHÂN BỔ VỀ TỪNG ĐƠN CON** (công nợ là của từng khách, không phải của gói) — chi tiết màn hình thu chốt trong spec form Gói.
- Nguyên tắc: gói là chứng từ **TÁC NGHIỆP KHO**; hạch toán tồn kho / giá vốn / công nợ vẫn chạy theo TỪNG ĐƠN CON (BR-NB-07) — vì mỗi đơn là nợ của một khách, lãi lỗ tính theo khách.

---

## 4. Schema dự kiến (phác thảo — chốt chi tiết cột khi viết script)

Trong DB tenant NB (`<MA>_NB_<năm>`): **tái dụng tối đa khuôn chung, chỉ thêm tối thiểu.**

| Bảng | Vai trò | Ghi chú |
|------|---------|---------|
| `HOA_DON` + `HOA_DON_LINE` | **Đơn hàng** — dùng chung khuôn, KHÔNG tạo DON_HANG riêng | Trong DB NB, HOA_DON chứa đơn hàng: thông tin cơ bản trùng khuôn (ma_kh, ngay, ngay_nh, dia_chi...). Thêm 3 cột mới vào KHUÔN CHUNG (script đánh số mới, nullable): `ma_nvkd` (NV kinh doanh — ai order), `ma_nvvc` (NV vận chuyển — ai giao), `ma_goi` (thuộc gói nào — BR-NB-08). Ngữ nghĩa cột: `ma_hd` = SỐ ĐƠN hiển thị/in (kiểu V125, R236); `so_hd`/`khhd` với NB vô nghĩa — luôn trống. `ngay_nh` = ngày xuất kho thật (BR-NB-07). `tthai_hd` mang bộ trạng thái đơn NB (chốt khi viết spec form Tạo đơn). |
| *(không có `GIAO_HANG`)* | Phiếu giao hàng = **mẫu in (report)** từ đơn hàng | Report là cách nhìn dữ liệu, không phải dữ liệu — không lưu bảng riêng. |
| `DM_KH_NB` | Danh mục ĐỐI TƯỢNG CÔNG NỢ (khách + TOÀN BỘ nhân viên) | + `loai_dt` (`KH`/`NV`), + `ma_kh_hd` (BR-NB-01); bộ tứ audit như 004. Hậu tố `_NB` để phân biệt rạch ròi với `DM_KH` trong KT2000_Base (trùng tên khác cấu trúc = bẫy query nhầm chạy êm). |
| `DM_HANG_NB` | Hàng của NB | + `ma_hang_thue` (BR-NB-02); `dvt` sửa được. Hậu tố `_NB` cùng lý do. |
| `GOI_HD` | Gói hàng (header) | Khu vực giao, `ma_nvvc`, ngày, số đơn con, trạng thái (BR-NB-08). Thành viên gói nằm ở cột `ma_goi` trên HOA_DON, không có bảng danh sách riêng. |
| `GOI_HD_LINE` | Phiếu soạn hàng: tổng hợp mặt hàng của MỌI đơn con | SNAPSHOT sinh lúc CHỐT GÓI (BR-NB-08); IDENTITY(1,1) từ đầu (bài học 010). |
| *(không có `DM_NV_NB`)* | Nhân viên = dòng `loai_dt='NV'` trong `DM_KH_NB` | `ma_nvkd`/`ma_nvvc` trỏ về đây; combobox lọc theo `loai_dt`. Đã chốt — đóng 9.7. |

Nguyên tắc chấp nhận: cột thừa để trống theo CẢ HAI CHIỀU — DB thuế mang `ma_nvkd/ma_nvvc` trống, DB NB mang `so_hd/khhd` trống; đổi lại engine định khoản, TON_KHO, CONG_NO chạy MỘT đường code cho cả hai sản phẩm (AD-NB-10), và khuôn template vẫn là MỘT (luật #6).

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
3. **NB-#3**: script schema: `DM_KH_NB` (+`loai_dt`) / `DM_HANG_NB` / `GOI_HD` / `GOI_HD_LINE` + 3 cột `ma_nvkd`/`ma_nvvc`/`ma_goi` vào khuôn HOA_DON chung.
4. **NB-#4**: endpoint tra cứu xuyên DB (BR-NB-03).
5. **NB-#5**: form Tạo đơn hàng (spec walkthrough riêng — form quan trọng nhất, làm chuẩn UX cho các form sau).
6. **NB-#6**: Cloudflare Tunnel + nb.ndnew.net + backup hàng đêm (điều kiện mở internet).
7. Tiếp theo (theo Phạm vi màn hình v1, mục 1): Phiếu nhập hàng (+ **import Excel tồn đầu** = "phiếu nhập từ kỳ trước", chốt 9.4), Phiếu thu / Phiếu chi / Bút toán khác, màn hình **Gói hàng** (ghép → chốt → xuất → thu tiền), 3 báo cáo (Tồn kho, Công nợ, Dòng tiền cuối ngày).

---

## 9. CÂU HỎI MỞ (chốt DẦN theo tiến trình thiết kế — không phải điền một lần; câu nào đến lượt sẽ tự chốt như 9.7)

1. **ĐÃ CHỐT (v0.5)**: danh sách màn hình v1 đưa vào mục 1 — 5 form nhập (Phiếu giao hàng, Phiếu nhập hàng, Phiếu thu, Phiếu chi, Bút toán khác) + 3 báo cáo (Tồn kho, Công nợ, Dòng tiền cuối ngày) + **Gói hàng đứng riêng** trên màn hình chính.
2. **ĐÃ CHỐT (v0.5)**: tenant NB chạy dữ liệu HIỆN TẠI từ ngày triển khai, không xử lý lại quá khứ; số dư đầu (tồn kho, công nợ) nhập tại go-live (xem 9.4).
3. **ĐÃ CHỐT (v0.5)**: CÓ — cần tra cả hàng CŨ (năm trước) lẫn HOA_DON_LINE mới chưa gán ma_hang. Phân kỳ: **v1** = tra HOA_DON_LINE của tenant thuế liên kết trên MỌI NĂM đã mở (danh sách DB từ FiscalYears); **giai đoạn 2** = thêm nguồn DM_HANG (KT2000_Base) sau khi Base có cột nguồn gốc **`mst_ncc`** (hàng này của nhà cung cấp MST nào) để lọc về đúng đơn vị — thay đổi Base thuộc vùng lõi chung + mảng WP-04 (dev1).
4. **ĐÃ CHỐT (v0.5)**: KHÔNG nạp lịch sử DBF. Chạy mới từ go-live; tồn đầu = import Excel thành MỘT "phiếu nhập hàng từ kỳ trước" (`ngay_nh` = ngày go-live → engine xử lý như phiếu nhập thường, không cần cơ chế số dư đặc cách); công nợ đầu nhập tương tự tại go-live. → Cần chức năng import Excel cho Phiếu nhập (mục 8.7).
5. **ĐÃ CHỐT (v0.5)**: dev1 = thuế (hoàn thiện lấy HĐĐT như VFP, cả Python + C#); dev2 = NB. Mỗi dev tự học nghiệp vụ mảng mình; phần dùng chung (tính tồn kho, công nợ chuyển kỳ, kết chuyển, tính giá xuất kho) = engine chung AD-NB-10, thuộc vùng lõi chung luật CLAUDE.md #10 — hai dev trao đổi, Leader duyệt.
6. **ĐÃ CHỐT (v0.5)**: chính sách giá tách SPEC RIÊNG (phức tạp, tránh nhiễu spec khung); v1 gõ giá tay.
7. **ĐÃ CHỐT (v0.4)**: nhân viên = dòng `loai_dt='NV'` trong DM_KH_NB, không có DM_NV_NB; số đơn = `ma_hd` (kiểu V125/R236), `so_hd` bỏ trống vĩnh viễn.

---

*Lịch sử: v0.1 — 04/08/2026 — bản nháp đầu, tổng hợp buổi trao đổi kiến trúc NB.*
*v0.2 — 05/08/2026 — thêm BR-NB-06 (rẽ nhánh màn hình theo tenant_type, hai lớp FE/BE + phân biệt hai nghĩa "NB"); mục 5: tạo tenant NB/mở năm chỉ qua console MDN_NB, kèm tiền đề MoNamLamViec mở năm được cho chính MDN_NB.*
*v0.3 — 05/08/2026 — (góp ý Leader) mục 4 viết lại: BỎ DON_HANG/DON_HANG_LINE/GIAO_HANG — đơn hàng dùng chung khuôn HOA_DON/HOA_DON_LINE (so_hd/khhd để trống, thêm ma_nvkd/ma_nvvc vào khuôn chung), phiếu giao hàng = mẫu in; danh mục đổi tên DM_KH_NB/DM_HANG_NB; thêm câu hỏi mở 9.7 (DM_NV_NB, số đơn).*
*v0.4 — 05/08/2026 — (quyết định Leader) DM_KH_NB = danh mục ĐỐI TƯỢNG công nợ (+loai_dt KH/NV, chứa toàn bộ nhân viên; chuyển nợ khách→NV = chứng từ điều chuyển); chốt 9.7 (không DM_NV_NB; số đơn = ma_hd kiểu V125/R236); thêm BR-NB-07 (trừ kho theo ngay_nh) + BR-NB-08 (gói hàng: ma_goi trên HOA_DON, GOI_HD_LINE snapshot lúc chốt gói, khóa sửa đơn trong gói, xuất gói đóng dấu ngay_nh hàng loạt, gói = chứng từ tác nghiệp kho); mục 9 chuyển chế độ chốt dần.*
*v0.5 — 06/08/2026 — (quyết định Leader) chốt 9.1→9.6: phạm vi màn hình v1 vào mục 1 (5 form nhập + 3 báo cáo + Gói hàng đứng riêng vì có thu tiền theo gói — bổ sung BR-NB-08); dữ liệu chạy mới từ go-live, tồn đầu = phiếu nhập kỳ trước import Excel; tra cứu phân kỳ (v1 = HOA_DON_LINE mọi năm đã mở; GĐ2 = DM_HANG Base + cột mst_ncc); dev1 thuế / dev2 NB, engine chung; chính sách giá tách spec riêng.*
