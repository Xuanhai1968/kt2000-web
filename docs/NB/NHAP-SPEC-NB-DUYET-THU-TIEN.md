# NHÁP — Bổ sung SPEC-KT2000-NB: Duyệt phiếu & Thu tiền

> **Trạng thái:** BẢN NHÁP để Leader duyệt — CHƯA phải quyết định.
> **Ngày:** 08/08/2026. Người chấp bút: Claude. Người quyết định: Hiu (Leader).
> **Mục đích:** gỡ nút thắt đang chặn màn *Danh sách phiếu*. Theo nếp làm việc trong
> CLAUDE.md (*"không code tính năng chưa có spec"*), phần này phải chốt trước khi code.
> **Cách dùng:** Leader sửa/gạch thẳng trên file này. Duyệt xong thì trộn vào
> `SPEC-KT2000-NB.md` (thành BR-NB-09 → BR-NB-11) rồi xoá file nháp.

---

## 0. Vì sao có bản nháp này

Bê giao diện USA_Meva sang, ba màn *Phiếu xuất*, *Phiếu nhập*, *Phiếu in* đã xong.
Riêng màn **Danh sách phiếu** (`IssuedInvoicePage`, 1729 dòng) chưa bê được, vì phần
lớn nút bấm trên đó gọi những endpoint mà bên NB **không có và chưa có spec**:

| Nhóm chức năng bên USA_Meva | Bên NB hiện tại |
|---|---|
| Duyệt / Không duyệt / Bỏ duyệt phiếu | ❌ chưa có |
| Thu tiền, xoá khoản thu, ảnh bill | ❌ chưa có |
| Đối chiếu / gỡ đối chiếu | ❌ chưa có |
| Đánh dấu đã in, Xin in lại, Cấp in lại | ❌ chưa có |
| Đánh dấu đã giao hàng | ❌ chưa có (mới có `ngay_nh` — BR-NB-07) |
| Lịch sử thao tác trên phiếu | ❌ chưa có |

Đây **không phải việc bê giao diện** — cần cột mới trong DB tenant NB, endpoint mới,
và quan trọng nhất: **quyết định nghiệp vụ** về việc có duyệt hay không, tiền thu vào đâu.

---

## 1. CÂU HỎI LEADER PHẢI TRẢ LỜI TRƯỚC

Mọi thứ bên dưới chỉ là đề xuất. Hai câu còn lại quyết định phần còn lại
*(câu 1.3 về phân quyền đã chốt 08/08 — xem bên dưới)*:

### 1.1. NB có cần duyệt phiếu không?

USA_Meva có vì họ nhiều nhãn, nhiều NVKD, sợ bán sai giá. Quy mô NB của TUAN_NGA /
USA_MEVA có thể chỉ 2-3 người, duyệt thành thủ tục thừa.

**Lưu ý sau khi chốt 1.3 (không phân quyền):** duyệt giờ không còn là hàng rào quyền,
vì ai cũng bấm duyệt được. Nó chỉ còn giá trị **quy trình**: đánh dấu "đơn này đã có
người kiểm rồi mới in". Nếu Leader thấy tự mình duyệt đơn của chính mình là vô nghĩa
thì (B) là lựa chọn thành thật hơn.

- **(A) CÓ duyệt** — thêm trạng thái, thêm một bước trước khi in.
- **(B) KHÔNG duyệt** — bỏ hẳn nhóm này, màn Danh sách phiếu nhẹ đi một nửa.
- **(C) Duyệt TÙY ĐƠN VỊ** — bật/tắt bằng cấu hình từng tenant NB.

*Đề xuất: **(C)***. Cơ chế viết một lần, khách nhỏ tắt đi thì y hệt (B). Cái giá là
thêm một cột cấu hình — rẻ hơn nhiều so với sau này phải bổ sung ngược.

### 1.2. Thu tiền ghi nhận ở đâu?

SPEC mục 1 đã có **Phiếu thu** trong phạm vi v1, và BR-NB-08 nói *"tiền thu theo gói
phải PHÂN BỔ VỀ TỪNG ĐƠN CON"*. Vậy "thu tiền" trên màn Danh sách phiếu là gì?

- **(A) Chính là Phiếu thu** — bấm thu tiền = sinh một Phiếu thu gắn vào đơn. Một
  đường dữ liệu duy nhất, công nợ và dòng tiền tự khớp.
- **(B) Bảng thanh toán riêng** như USA_Meva (`DeliveryPayments`), Phiếu thu là chuyện
  khác.

*Đề xuất: **(A)***. Chọn (B) là có hai nơi cùng ghi "khách đã trả tiền" — đúng thứ
BR-NB-01 đã tránh khi gộp khách và nhân viên vào một danh mục công nợ. Hai bảng tiền
song song thì đến lúc đối soát không biết tin bảng nào.

### 1.3. Phân quyền — **ĐÃ CHỐT (08/08): GIAI ĐOẠN NÀY KHÔNG LÀM**

**Quyết định của Leader:** chưa viết phân quyền. User NB đăng nhập vào là thấy và làm
được mọi chức năng của phần NB. Cắt trước, siết sau khi có nhu cầu thật.

Hiện trạng khớp sẵn với quyết định này — **không phải sửa gì để nó đúng**:
- `NoiBoController` gate bằng `tenant_type = 'noibo'` (BR-NB-04), **không đọc `Role`**.
- Frontend NB cũng không ẩn nút nào theo vai trò.
- Ranh giới thật vẫn còn nguyên: tenant thuế không vào được endpoint NB và ngược lại.

Hệ quả cho phần còn lại của bản nháp: **BR-NB-10 (ai được duyệt) bỏ hẳn**. Nếu chọn
làm duyệt phiếu (mục 1.1) thì ai cũng duyệt được — lúc đó duyệt chỉ còn nghĩa là "đánh
dấu đã kiểm", không phải hàng rào quyền.

> **Nợ kỹ thuật đã ghi nhận, KHÔNG làm bây giờ** — cần biết trước khi ai đó bật phân
> quyền lên:
>
> Cột `UserTenantAccess.Role` đang mang **4 giá trị** trên máy thật, không phải 3:
>
> | Giá trị | Số dòng | Nguồn |
> |---|---|---|
> | `admin` | 11 | code (`001_create_master.sql`) |
> | `accountant` | 3 | code |
> | `quan_ly` | 1 | SPEC-KT2000-NB mục 5 |
> | `user` | 1 | không có trong bộ nào cả |
>
> Cụ thể: `ketoan02` mang `quan_ly` ở `TUAN_NGA_NB` và `user` ở `HOA_SANG`.
>
> Đây là hệ quả của việc spec (`nhap_don`/`quan_ly`) và code (`admin`/`accountant`/
> `viewer`) nói hai thứ khác nhau từ đầu. Hôm nay vô hại vì **không ai đọc cột này để
> phân quyền**. Nhưng ngày bật phân quyền lên, hai dòng đó sẽ rơi vào vùng "không khớp
> luật nào" — user không có quyền gì mà cũng không báo lỗi.
>
> Lưu ý thêm: `AdminController` nay đã **chặn ghi giá trị lạ** (chỉ nhận `admin` /
> `accountant` / `viewer`), nên hai dòng trên là di sản cũ — sửa vai trò cho `ketoan02`
> qua màn Quản lý người dùng sẽ dọn được, nhưng phải chốt bộ giá trị trước.

---

## 2. ĐỀ XUẤT LUẬT MỚI (nếu Leader chọn phương án đề xuất ở mục 1)

### BR-NB-09 — Vòng đời phiếu NB

Trạng thái đặt trên cột `tthai_hd` của `HOA_DON` (cột đã có sẵn trong khuôn chung,
SPEC mục 4 ghi *"tthai_hd mang bộ trạng thái đơn NB (chốt khi viết spec form Tạo đơn)"*
— đây chính là lúc chốt).

```
  nhap ──duyệt──> da_duyet ──in──> da_in ──giao──> da_giao
   ▲                  │
   └──trả lại─────────┘
```

| Trạng thái | Nghĩa | Đặt lúc nào |
|---|---|---|
| `nhap` | đang gõ / chờ duyệt | lúc lưu đơn |
| `da_duyet` | đã duyệt, được phép in | người dùng bấm Duyệt |
| `bi_tra` | trả lại để sửa, **bắt buộc có lý do** | người dùng bấm Trả lại |
| `da_in` | đã in tờ giao hàng | tự đặt khi bấm In |
| `da_giao` | hàng đã rời kho | tự đặt khi đóng dấu `ngay_nh` |

*(Cột "ai được làm" bỏ đi — chốt 1.3: giai đoạn này không phân quyền, ai đăng nhập
vào đơn vị cũng chuyển được mọi trạng thái.)*

**Ba luật cứng:**

1. **Chưa duyệt thì KHÔNG in được.** Tờ giấy đưa khách ký là cam kết — in trước khi
   duyệt thì duyệt thành hình thức. (Mẫu in hai liên vừa bê có ô khách ký nhận.)
2. **Sửa đơn đã duyệt thì trạng thái quay về `nhap`.** Không thì sửa xong đơn vẫn mang
   dấu "đã duyệt" của nội dung cũ — chữ ký duyệt trở thành vô nghĩa.
3. **`da_giao` là điểm không quay lui.** Hàng đã lên xe, sửa đơn không làm hàng quay
   về kho. Muốn sửa phải lập chứng từ điều chỉnh, đúng tinh thần BR-NB-01
   (*"chuyển công nợ = MỘT CHỨNG TỪ điều chuyển, KHÔNG sửa đơn gốc"*).

**Quan hệ với BR-NB-07 và BR-NB-08 — chỗ dễ đá nhau nhất, phải nói rõ:**
- `ngay_nh` (BR-NB-07) vẫn là **mốc DUY NHẤT trừ kho**. `da_giao` chỉ là nhãn trạng
  thái đi kèm, engine tồn kho **không đọc `tthai_hd`**. Hai thứ không được tranh việc.
- Đơn thuộc gói đã chốt bị khoá sửa (BR-NB-08). Luật khoá đó **mạnh hơn** trạng thái
  duyệt: gói chốt rồi thì kể cả `nhap` cũng không sửa được.
- **XUẤT GÓI** đóng dấu `ngay_nh` hàng loạt → mọi đơn con chuyển `da_giao` cùng lúc.

### ~~BR-NB-10 — Ai được duyệt~~ → **BỎ** (chốt 1.3: giai đoạn này không phân quyền)

Ai đăng nhập được vào đơn vị NB thì làm được mọi thao tác, kể cả duyệt. Duyệt phiếu —
nếu bật — chỉ mang nghĩa **"đã có người kiểm"**, không phải hàng rào quyền.

Vẫn giữ nguyên **vết ai duyệt** (`nguoi_duyet`, `ngay_duyet` — mục 3): không chặn được
thì ít nhất phải biết ai đã bấm. Đây cũng là thứ để sau này bật phân quyền lên mà không
mất dữ liệu lịch sử.

### BR-NB-10 — Thu tiền theo đơn = Phiếu thu

Theo đề xuất 1.2-A:

- Bấm "Thu tiền" trên một đơn → sinh **Phiếu thu** (`THU_CHI`, khuôn đã có), gắn
  `ma_hd` của đơn được thu.
- Một đơn thu **nhiều lần** (trả góp/trả dần) → nhiều Phiếu thu cùng trỏ về một `ma_hd`.
  "Còn nợ" = `tong_tien` của đơn − tổng đã thu.
- Thu theo **gói** (BR-NB-08): người dùng nhập một số tiền cho cả gói, hệ thống sinh
  **nhiều Phiếu thu, mỗi đơn con một cái**, phân bổ theo tỉ lệ giá trị đơn. Đúng luật
  cứng của BR-NB-08: *"công nợ là của từng khách, không phải của gói"*.
- **Không có chức năng SỬA phiếu thu.** Thu nhầm thì lập phiếu điều chỉnh — tiền là
  thứ phải giữ vết, cùng nguyên tắc với luật #5 CLAUDE.md.

**Ngoài phạm vi lần này** (đề nghị để lại): ảnh chụp bill (`uploadBills`), đối chiếu
ngân hàng (`reconcilePayment`). USA_Meva có nhưng đang tắt bằng cờ `PAYMENT_ENABLED =
false` — tức chính họ cũng chưa dùng thật. Không nên bê thứ bên kia còn chưa chạy.

### BR-NB-11 — Vết thao tác trên phiếu

Luật #7 CLAUDE.md đã bắt mọi chức năng nghiệp vụ phải móc `ActivityLog`. Bổ sung cho
riêng phiếu NB: mỗi lần đổi trạng thái ghi một dòng gồm **ai, lúc nào, từ trạng thái
nào sang trạng thái nào, lý do** (bắt buộc khi trả lại).

Màn Danh sách phiếu đọc vết này để hiện dòng thời gian — thay cho cách USA_Meva **suy
ngược trạng thái từ các cờ boolean** khi không có log. Suy ngược thì lúc dữ liệu lệch
sẽ vẽ ra một lịch sử không có thật; thà không hiện còn hơn hiện sai.

---

## 3. SCHEMA DỰ KIẾN (chốt cột khi viết script)

Theo luật #6: script đánh số mới, không sửa script đã chạy.

| Bảng | Thay đổi | Ghi chú |
|---|---|---|
| `HOA_DON` | dùng cột `tthai_hd` sẵn có | không thêm cột trạng thái mới |
| `HOA_DON` | + `nguoi_duyet`, `ngay_duyet`, `ly_do_tra` | 3 cột nullable |
| `THU_CHI` | + `ma_hd` (nullable) | sợi dây nối phiếu thu ↔ đơn (BR-NB-10) |
| `Tenants` (Master) | + `BatDuyetPhieu` BIT | bật/tắt duyệt theo đơn vị (1.1-C) |
| *(không có bảng thanh toán riêng)* | | dùng `THU_CHI`, xem 1.2 |

**Không thêm bảng lịch sử riêng** — `ActivityLog` bên Master đã đủ, và luật #7 đã bắt
ghi vào đó. Thêm bảng thứ hai là có hai nơi cùng kể một câu chuyện.

---

## 4. PHÂN KỲ ĐỀ NGHỊ

Tách nhỏ để mỗi PR làm một việc (nếp làm việc: *PR nhỏ, một việc một PR*):

| Đợt | Nội dung | Chặn bởi |
|---|---|---|
| **NB-#7** | Màn Danh sách phiếu — phần **không cần** luật mới: mở rộng dòng xem chi tiết hàng, chọn nhiều dòng, lọc/tìm, in hàng loạt, highlight đơn vừa sửa | *không chặn — làm được ngay* |
| **NB-#8** | Schema: `tthai_hd` + 3 cột duyệt + `THU_CHI.ma_hd` + `BatDuyetPhieu` | chốt mục 1 |
| **NB-#9** | Endpoint duyệt/trả lại + ghi ActivityLog (KHÔNG gate quyền — chốt 1.3) | NB-#8 |
| **NB-#10** | Thu tiền theo đơn & theo gói (phân bổ) | NB-#8, spec Phiếu thu |
| **NB-#11** | Dòng thời gian phiếu trên màn Danh sách | NB-#9 |

**NB-#7 làm được ngay hôm nay** mà không đụng gì tới các câu hỏi ở mục 1 — đề nghị
tách ra làm trước, không chờ.

---

## 5. NHỮNG THỨ CỦA USA_MEVA ĐỀ NGHỊ **KHÔNG** BÊ

Nói rõ để sau này không ai hỏi "sao không thấy":

| Chức năng | Lý do bỏ |
|---|---|
| Hoá đơn điện tử (`eInvoiceApi`, WorkflowModal, PDF) | SPEC mục 1: sinh hoá đơn VAT từ đơn hàng **ngoài phạm vi v1**. Và BR-NB-04: user NB không thấy sổ thuế. |
| Xin in lại / Cấp in lại | Thủ tục của tổ chức lớn. Quy mô NB nên cho in lại tự do, chỉ **ghi vết** ai in mấy lần. |
| Đối chiếu ngân hàng, ảnh bill | Bên kia đang tắt bằng `PAYMENT_ENABLED = false` |
| Xuất Excel theo tỉnh, lưu vào thư mục | Dùng File System Access API — chỉ chạy trên Chrome, mà bản NB ra internet (AD-NB-06) không nên phụ thuộc thứ đó |
| Khuyến mãi mua-tặng (F4) | Chính sách giá đã tách SPEC riêng (chốt 9.6), v1 gõ giá tay |

---

## 6. CÂU HỎI MỞ

1. Đơn vị NB đầu tiên chạy thật (`USA_MEVA_NB`) có **mấy người dùng**? Một người thì
   nên tắt duyệt hẳn, đỡ một bước vô ích mỗi ngày.
2. Thu tiền theo gói phân bổ **theo tỉ lệ giá trị đơn** — hay NVVC tự gõ số cho từng
   đơn? Tỉ lệ thì nhanh nhưng lẻ đồng; gõ tay thì đúng nhưng chậm.
3. `viewer` có cần cho NB thật không, hay chỉ hai vai là đủ?
4. Đơn `bi_tra` để nguyên hay sau N ngày tự huỷ?

---

*Nháp v0.1 — 08/08/2026 — dựng sau khi bê xong giao diện đánh đơn + phiếu in hai liên,
để gỡ nút thắt màn Danh sách phiếu.*
