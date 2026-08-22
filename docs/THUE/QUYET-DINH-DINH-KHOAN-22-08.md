# Quyết định màn Định khoản — 22/08/2026

Ghi lại phần **lệch so với `SPEC-CHOT-DINH-KHOAN.md`** và những gì đã thống nhất sau khi
Trường trao đổi với Leader. Để riêng file này thay vì sửa thẳng spec — spec là của
Leader, chỗ này chỉ nêu chỗ lệch để Leader gộp vào bản sau.

---

## 1. Prefix gom theo HAI TỪ, không phải một — LỆCH SPEC

`BR-CDK-03` chốt: *"prefix v1: TỪ ĐẦU TIÊN của tên (tách theo khoảng trắng), so trên
`ten_norm`"*.

**Bản web đang dùng HAI TỪ đầu** (Trường chốt 20/08, giữ nguyên sau trao đổi 22/08).

Lý do: một từ gom quá rộng. `Vật tư …` nuốt cả trăm dòng khác loại vào cùng một cụm, nên
thao tác "đánh dấu cả cụm" trở thành đánh dấu bừa. Hai từ giữ được các biến thể của cùng
một mặt hàng nằm chung — `Bản mã 10 x 50`, `Bản mã 180x180x10`, `Bản mã 190x157x3` — mà
không kéo theo thứ khác loại. Ba từ thì ngược lại: tách vụn thành từng dòng một, mất luôn
cái lợi của việc gom.

**Chưa đo định lượng.** Cách đo khi cần: đếm số mặt hàng gom được mỗi lần bấm, và số lần
gom lẫn hàng khác loại. Đổi con số này chỉ nên đổi bằng số đo, không bằng cảm giác.

Chỗ cài: `cumTen()` trong `kt2000-web/src/pages/DinhKhoan.tsx`, hằng `CUM_SO_TU = 2`.

**Cập nhật 22/08 — bề mặt lệch rộng ra hai nút.** Sau khi cài mục 5, `cumTen()` được dùng
bởi **hai** nút chứ không còn một: `Mark Record By Prefix` (đánh cột Exp) và
`Mark Record By Prefix For Update` (đánh cột Sửa). Cả hai đi qua một thân hàm chung
`markByPrefix()` nên vẫn chỉ có **một** hằng `CUM_SO_TU` để đổi — nhưng nếu Leader chốt
quay về một từ thì tác động nay hiện ra ở hai chỗ trên giao diện, không phải một.

---

## 2. Đo độ chính xác của model — dùng cái đã có, không thêm cột

Ban đầu tôi đề xuất thêm cột lưu nhãn máy đoán để so với nhãn người chốt. Leader và
Trường chọn hướng nhẹ hơn, và nó đủ dùng:

- **Tổng thể**: đọc `proba` cùng `good_pred` trong `HOA_DON_LINE`. Mặt hàng có
  `good_pred = 1` mà `proba` cao là ca máy đoán đúng và người gật.
- **Ca người dùng KHÔNG đồng ý**: theo spec, dòng bị **sửa** phải ghi vào
  `DK_AUDIT_LOG`. Nên chính sự có mặt của bản ghi audit đã là dấu hiệu "người dùng đã
  sửa", kèm sẵn `label_old` / `label_new`.

Nhờ vậy không cần đổi lược đồ. Điều kiện để hướng này chạy được: **mọi lần sửa phải thật
sự vào `DK_AUDIT_LOG`** — nếu có đường sửa nào không ghi audit thì số liệu thủng đúng chỗ
quan trọng nhất.

**Đo 22/08 — điều kiện đó CHƯA đạt, và đây là số thật:**

| Đo | Kết quả |
|---|---|
| `DK_DATA_TRAIN` | 52.435 dòng, 100% `ACTIVE`, 68 đơn vị |
| `created_at` của cả 52.435 dòng | nằm trọn trong 3 giây: `20/08 09:19:01` → `09:19:04` |
| `DK_AUDIT_LOG` | **0 dòng** |
| `good_pred = 1` trên cả 14 database `_2026` | **0 dòng** |

Đọc ba dòng cuối cùng nhau thì rõ: kho học hiện tại **thuần di trú từ `DATA_TRAIN.xlsx`**,
chưa một dòng nào đi vào bằng đường web. Cả `Mark Is Predict OK` lẫn `Update về Data
Training` chưa từng ghi thành công lần nào trên dữ liệu thật.

Sau khi cài mục 3 (xem dưới), **cả hai đường chốt đều đi qua `ChotAsync`**, nên từ giờ mọi
lần chốt — gật hay sửa — đều để lại vết ở `DK_AUDIT_LOG`. Đó là điều kiện cần cho hướng đo
này; còn đủ hay chưa thì phải rà nốt các đường sửa định khoản NGOÀI màn chốt (màn
`DanhSachHoaDon`) — **chưa rà.**

Mục tiêu dài hạn (Leader): tích đủ số liệu để trả lời *"ở mức tin cậy trên 90% thì người
dùng xác nhận đúng bao nhiêu phần trăm"*, rồi lấy đó làm căn cứ cho tự động hoàn toàn.

---

## 3. Mặt hàng tin cậy THẤP mà được xác nhận đúng thì đưa vào Data Training

Trùng với spec Leader (README mục 2): *"dòng đạt ngưỡng (bị sửa HOẶC `pred_conf < 0.85`)
→ audit-insert vào `KT2000_PUB`"*.

Vẫn đi qua đủ luật audit: danh sách đen, `NEW` / `DUPLICATE` / `CONFLICT`. Xung đột thì
vào `CHO_GIAI_THICH` như thường, không có ngoại lệ nào.

**ĐÃ CÀI 22/08** — `ChotDinhKhoanService`, hằng `NGUONG_VAO_TRAIN = 0.85m`.

Chỗ cài là viên gạch mới `KT2000.Api/Services/ChotDinhKhoanService.cs` (đúng tên
`BR-CDK-08` đặt sẵn), gọi qua hai endpoint `POST chot-dung` và `POST sua-nhan`. Ba bước
theo thứ tự bắt buộc:

1. Sửa `HOA_DON_LINE` **trước**
2. **Đọc lại** nhãn vừa ghi từ sổ (`LayNhanTrongSoAsync`)
3. Rồi mới `ChotAsync` sang `KT2000_PUB`

Bước 2 là thứ chưa từng có: trước đây màn hình đẩy thẳng cái người dùng gõ sang kho học.
Nếu lệnh sửa sổ không ăn dòng nào — sai tên hàng một dấu cách, sai chiều `V`/`R`, đơn vị
chưa mở sổ — thì kho học nhận nhãn mới trong khi sổ còn nguyên nhãn cũ, và **không có gì
báo lỗi**. Đọc lại sổ thì cái vào kho học luôn đúng bằng cái đang nằm trong sổ.

Độ chắc lấy `MIN(proba)` trong nhóm tên, không phải `MAX` — cùng cách chọn với
`BR-CDK-07`. Nhóm nào còn một dòng máy không chắc thì cả nhóm đáng được học lại.

`pred_conf` **NULL** thì KHÔNG vào kho học qua đường này: NULL nghĩa là máy chưa từng
đoán mặt hàng đó (nhãn do người gõ tay hoặc do luật cứng lúc nạp), không có số để so.
Đường "gật" chỉ nên củng cố chỗ **máy** còn yếu; cái người tự gõ đã đi bằng đường "sửa".

**Đo trước khi cài, để biết luật này ăn bao nhiêu** — `NHAT_TUAN_2026`, 22/08:

| Mức `proba` | Mặt hàng | Dòng | Vào Data Training? |
|---|---|---|---|
| ≥ 0,95 | 3 | 1.178 | không |
| 0,85 – 0,95 | 479 | 6.347 | không |
| 0,70 – 0,85 | 126 | 716 | **có** |
| < 0,70 | 113 | 352 | **có** |

Tức khoảng **một phần ba** mặt hàng vào kho học mỗi lần kế toán gật. Đây là con đường
chính để kho học lớn lên, không phải vài ca lẻ.

**Còn lệch `README_DK_WEB.md` mục 2 — cần Leader chốt.** README đòi *"update
`HOA_DON_LINE` và audit-insert `DK_DATA_TRAIN` nằm trong CÙNG MỘT transaction"*. Bản cài
này là **hai transaction rời**, vì hai bên đi qua hai connection khác database. Hệ quả
thật: máy chủ chết đúng giữa bước 1 và bước 3 thì sổ đã gật mà kho học chưa học — mặt
hàng đó biến khỏi lưới (`good_pred = 1`) nên không ai gặp lại để dạy, phải tra
`DK_AUDIT_LOG` mới thấy thiếu. Gộp được bằng connection cross-database (hai DB cùng
instance) nhưng đó là sửa cả `CapNhatAsync`, nên để riêng.

---

## 4. Thêm ví dụ đúng có làm "loãng" model không

Câu hỏi của Trường: nếu thêm dữ liệu vào mà mặt hàng từng đúng ở 90% nay tụt dưới 80% thì
sao.

**Thêm ví dụ ĐÚNG không làm loãng.** Model học bằng cách đếm bằng chứng: mỗi ví dụ đúng
là một phiếu bầu cho ranh giới đúng. Loãng chỉ xảy ra khi thêm ví dụ **mâu thuẫn** — cùng
tên, cùng hướng, cùng đơn vị mà hai nhãn khác nhau. Đó chính là thứ luật `CHO_GIAI_THICH`
đã chặn từ đầu.

**Nhưng độ tin cậy TỤT vẫn có thể xảy ra một cách lành mạnh.** Khi dạy máy rằng
`Chiết khấu…` là `154` trong khi tên gần giống lại là `641`, model trở nên *thành thật* về
vùng nó không chắc. Độ tin cậy giảm ở đó là hiểu biết TĂNG, không phải giảm.

**Thước đo phải là ĐỘ CHÍNH XÁC, không phải độ tin cậy.** Hai thứ khác nhau và có thể đi
ngược chiều.

### Việc phải làm trước khi lo chuyện loãng

**ĐÍNH CHÍNH 22/08 — đoạn dưới đây bản trước viết SAI.** Bản trước ghi *"`train.py` chia
ngẫu nhiên 15% mỗi lần chạy, không cố định hạt giống"*. Mở file ra đọc thì
`kt2000-web/tools/dinh_khoan/train.py` dòng 182–183 là:

```python
X_tr, X_te, y_tr, y_te = train_test_split(
    X, y, test_size=TEST_SIZE, random_state=42, stratify=y)
```

Hạt giống **đã cố định sẵn**, kèm `stratify=y`. Kết luận cũ là suy diễn từ trí nhớ, không
phải từ file.

**Nhưng vế cuối vẫn đúng, chỉ khác lý do.** Hai con số `0,9618` và `0,9633` vẫn không so
sánh được với nhau — vì chúng chạy trên **hai tập dữ liệu khác nhau**: README ghi 52.177
bản ghi, còn sau khi di trú là 52.435. `train_test_split` cắt theo tỉ lệ trên tập đang
có, nên thêm dữ liệu là tập kiểm đổi thành phần, dù hạt giống không đổi.

Muốn so sánh được thì cần **bộ kiểm cố định thật**: giữ riêng một danh sách `id` của
`DK_DATA_TRAIN` làm tập kiểm, loại chúng khỏi tập huấn luyện, và không đụng tới danh
sách đó qua các lần train. Khác hẳn `random_state` — cái đó chỉ cố định *cách bốc*, không
cố định *cái được bốc*.

**Chưa cài, và cố ý chưa.** `train.py` thuộc engine định khoản = vùng lõi chung (luật
#10), phải chờ Leader duyệt. `predict.py` đã lệch một lần (thêm trường `allow`) — không
nên lệch tiếp mà không hỏi.

---

## 5. Bố cục nút — hai cột tích, ba trục thao tác (Trường chốt 22/08)

Đồng ý `BR-CDK-02`: quay lại **hai cột đánh dấu** như VFP, vì khi chạy thử người dùng nhầm
khu vực giữa chốt-đúng và đổi-định-khoản.

Hai ô tích **được phép nằm cạnh nhau**; cái phải tách là **nhóm nút**:

| Trục | Gồm |
|---|---|
| 1 | `Mark Record By Prefix` · `Mark Is Predict OK` · `Bỏ đánh dấu` |
| 2 | ô `Định khoản đúng` · `Update về Data Training` · nút đánh dấu cột tích **Sửa** |
| 3 | `Xung đột chờ giải thích` |

Bỏ hẳn nút **Đánh dấu tất cả**.

Nguyên tắc: nút chỉ ăn **đúng cột tích của trục mình**. Dấu ở cột nào thì chỉ nút của cột
đó xử lý — nhầm chéo không xảy ra được.

**ĐÃ CÀI 22/08** trong `kt2000-web/src/pages/DinhKhoan.tsx`. Ba điểm Trường chốt thêm lúc
cài, vì mục 5 không nói tới:

- **Tên ba cột trong lưới**: `Exp` (ô tích, trục 1) · `Sửa` (ô tích, trục 2) · `Ghi chú`
  (ô GÕ tài khoản riêng từng dòng). Cột gõ trước đây tên `Sửa`; phải đổi vì `Sửa` nay là
  ô tích đứng ngay bên trái, hai cột cùng tên cạnh nhau thì không ai biết nút ăn cột nào.
- **`Bỏ đánh dấu` ăn CẢ BA** (Exp + Sửa + Ghi chú). Đúng nguyên tắc trên thì nó ở trục 1
  nên chỉ được ăn cột Exp, nhưng khi đó cột Sửa không còn cách nào dọn. Nó là nút DỌN,
  không phải nút thao tác — tooltip nói thẳng ra như vậy.
- **Chưa tô màu riêng cho cột Sửa.** Luật màu dòng hiện vẫn chỉ đọc cột Exp. Trường chốt
  *"tạm thời thì không cần"*; nếu sau này thấy khó phân biệt thì thêm một luật màu thứ hai
  trong `dinh-khoan.css`.

Hệ quả cho người dùng cũ, cần báo trước: `Update về Data Training` **không còn ăn cột dấu
cũ**. Ai quen tay tích một cột rồi bấm nút đó sẽ gặp cảnh báo *"Chưa tích mặt hàng nào ở
cột Sửa…"* — đúng chủ đích, không phải hỏng.
