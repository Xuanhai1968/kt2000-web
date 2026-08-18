# SPEC-CHOT-DINH-KHOAN — Màn chốt kết quả định khoản tự động (web)

| Version | Ngày | Thay đổi |
|---|---|---|
| v0.1 | 18/08/2026 | Bản đầu — dịch từ form VFP "Training vụ Prediction" (screenshot + giải thích của Hiu 18/08) |
| v0.2 | 18/08/2026 | Hiu chốt cả 4 câu §4: dk_goc giữ như VFP (cần script đánh số), prefix = từ đầu tiên, kỳ chốt linh động không lịch cứng, quyền mở như VFP + đường nâng cấp tầng duyệt chuyên gia (BR-CDK-12 mới) |

## 1. Bối cảnh & mục tiêu

Bên VFP, sau khi máy định khoản (DINHKHOAN_V2), user vào form "Training
vụ Prediction" để chốt đúng/sai. Triết lý chốt của Hiu KHÔNG phải duyệt
tuần tự từng dòng, mà là:

1. **Lọc thành nhóm đồng nhất** (cặp Định khoản gốc → Định khoản máy
   đoán, vd 641→156 hay EMPTY→156) để sai sót lộ ra bằng mắt thường.
2. **Duyệt có định hướng theo nhóm tên**: user thẩm định MỘT dòng mẫu
   ("Bánh Danisa... → 156 đúng"), máy quét đánh dấu cả nhóm cùng prefix
   ("Bánh ..."), hết nhóm máy DỪNG để user thẩm định nhóm kế — user được
   dắt đi hết dữ liệu mà không bỏ sót, không phải soi từng dòng.

Màn chốt web giữ nguyên hai triết lý này, đồng thời:
- Gộp bước "Update về Data Training" + "AUDIT DATA TRAIN" (bên VFP là
  2 thao tác tay riêng) vào NGAY transaction chốt (audit-insert theo
  README_DK_WEB.md mục 2) — bước AUDIT riêng biến mất.
- Thêm phần VFP CHƯA CÓ: luật chú thích bắt buộc cho dòng CONFLICT
  (status CHO_GIAI_THICH — xem KT2000_PUB_schema.sql).
- Đặt lại toàn bộ tên nút cho nhất quán (Hiu: tên cũ "khá lung tung").

## 2. Khái niệm & dữ liệu

- **Vế máy đoán**: V (đầu vào) máy thay GHI_NO (GHI_CO cứng 331);
  R (đầu ra) máy thay GHI_CO (GHI_NO cứng 632).
- **dk_goc**: giá trị CŨ của vế bị thay (V: ghi_no cũ; R: ghi_co cũ),
  chụp MỘT LẦN trước khi máy ghi predict lần đầu — CHỈ ghi khi dk_goc
  còn trống (logic này nằm trong viên gạch BƯỚC PREDICT, không thuộc màn
  chốt). Dữ liệu mới từ XML: dk_goc = EMPTY. Vai trò duy nhất: làm tiêu
  chí lọc nhóm — combo "Định khoản gốc" cho user thấy ngoài EMPTY hay
  641 còn giá trị nào khác từng xuất hiện. ĐÃ CHỐT giữ nguyên cách VFP,
  MỘT cột. Schema web chưa có cột này → script đánh số (bộ THUE), làm
  cùng đợt script pred_conf.
- **pred_conf**: độ chắc của máy (đã đổi tên từ proba).
- **Phạm vi dòng của màn chốt**: is_predict = 1 AND good_pred = 0,
  trong đơn vị + kỳ đang chọn.
- **Hai mức hiển thị** (đúng mô hình 2 grid của VFP):
  - Mức NHÓM TÊN (chính): distinct (tên hàng, vế V/R) + đếm số dòng HĐ,
    tổng SL — chốt ở mức này, hành động áp xuống MỌI dòng HOA_DON_LINE
    cùng (tên, vế) trong phạm vi lọc.
  - Panel CHI TIẾT: các dòng HĐ của nhóm tên đang chọn (Mã HĐ, SL,
    Đ.Giá, NM/NB...) — chỉ để soi, không thao tác từng dòng ở v0.1.

## 3. Business Rules

**BR-CDK-01 — Bộ lọc.** Đơn vị (bắt buộc), khoảng thời gian tự do
(mặc định: TẤT CẢ dòng chưa chốt của đơn vị — kỳ chốt là linh động,
không có lịch cứng, xem §4.3), V/R, cặp (Định khoản gốc → Định khoản
hiện tại — hai combo, "gốc" đọc từ dk_goc, EMPTY là một giá trị lọc
được), ô tìm theo tên. Mỗi tổ hợp lọc hiện tổng số nhóm + tổng số dòng.

**BR-CDK-02 — Chọn rồi hành động (thay mô hình 2 cột Exp2/Check).**
Bên VFP phải có 2 cột đánh dấu vì 2 hành động; bên web dùng MỘT
selection (checkbox từng nhóm) + 2 nút hành động áp cho selection.
Không còn trạng thái đánh-dấu-chờ nằm lại trong DB — chọn nhầm thì bỏ
chọn, chưa bấm hành động thì chưa có gì xảy ra.

**BR-CDK-03 — Ba nút chọn nhanh.**
- "Chọn tất cả" (theo bộ lọc hiện tại)
- "Chọn cùng nhóm tên": từ dòng đang đứng, chọn mọi nhóm có cùng prefix,
  rồi TỰ ĐỘNG cuộn đến nhóm prefix kế tiếp và dừng — tái hiện đúng nhịp
  "thẩm định mẫu → quét cụm → máy dắt sang trạm kế" của VFP.
  ĐÃ CHỐT định nghĩa prefix v1: TỪ ĐẦU TIÊN của tên (tách theo khoảng
  trắng), so trên ten_norm — không phân biệt hoa thường; danh sách sort
  theo tên để các nhóm cùng prefix nằm liền nhau như VFP.
  Mở rộng SAU, ngoài phạm vi v1 (Hiu đã định hướng): chọn theo NCC,
  chọn theo nhóm mặt hàng có nghĩa (vd "các loại bánh").
- "Bỏ chọn"

**BR-CDK-04 — Hành động "Chốt đúng".** Với mọi dòng HOA_DON_LINE thuộc
các nhóm đã chọn: good_pred = 1 (không định khoản lại nữa). Dòng có
pred_conf < 0.85: audit-insert vào DK_DATA_TRAIN (củng cố vùng máy còn
yếu) theo trình tự a-b-c-d trong README_DK_WEB.md.

**BR-CDK-05 — Hành động "Sửa thành [TK]".** Combo TK ngay cạnh nút
(danh sách TK hợp lệ + cho gõ tay). Với các nhóm đã chọn: cập nhật vế
máy đoán = TK mới, good_pred = 1, audit-insert. Phát hiện "sửa" so với
giá trị hiện tại trong DB ngay trong transaction (không cần snapshot).

**BR-CDK-06 — CONFLICT cho nợ giải thích, không chặn tay.** Audit-insert
gặp CONFLICT (cùng ten_norm/vế/đơn vị, label khác bản đã có) → insert
status = 'CHO_GIAI_THICH'. KHÔNG bật hộp thoại chặn giữa lúc user đang
chốt; user vội cứ chốt tiếp không sao — dòng chưa giải thích đơn giản là
chưa vào training. Badge "Chờ giải thích (N)" hiện Ở MỌI NƠI user chạy
chức năng định khoản tự động (màn chốt LẪN nút chạy predict tay) — nhắc
đều đặn để thành thói quen, không ép. Bấm badge ra danh sách nợ: từng
dòng hiện label cũ/mới + ô nhập giải thích → lưu = chuyển ACTIVE (giai
đoạn 1; khi bật tầng duyệt thì chuyển CHO_DUYET — BR-CDK-12). Export
train chỉ lấy ACTIVE (dòng chưa giải thích không bao giờ vào model).

**BR-CDK-07 — Tô màu độ chắc.** Nhóm có pred_conf nhỏ nhất < 0.70 tô
màu cảnh báo để user ưu tiên soi. Cột pred_conf hiển thị dạng 0.923
(không nhân 100 lẫn lộn kiểu 74,1000 của VFP).

**BR-CDK-08 — Viên gạch (LUẬT 12).** Toàn bộ nghiệp vụ nằm trong
ChotDinhKhoanService: `ChotDung(tenantId, lineIds, user)` và
`SuaNhan(tenantId, lineIds, tkMoi, user)` — controller màn chốt chỉ gom
lineIds từ selection rồi gọi. Sau này chốt hàng loạt/tự động theo luật
nào đó cũng gọi đúng 2 method này.

**BR-CDK-09 — Ghi vết.** Mỗi lần bấm hành động: 1 dòng ActivityLog
(đơn vị, số nhóm, số dòng, hành động, TK mới nếu có, user) + các dòng
DK_AUDIT_LOG do audit-insert sinh (đã có user_name).

**BR-CDK-10 — Những thứ KHÔNG mang sang web.**
- "Chỉ lấy dữ liệu MF Predict": bỏ — màn chốt tự load theo bộ lọc.
- "Mark Number Record N": bỏ — Hiu xác nhận gần như không dùng nữa.
- "Update về Data Training" + "AUDIT DATA TRAIN": bỏ nút — chạy tự
  động trong transaction chốt (BR-CDK-04/05/06).
- "Training MF"/"Training New": không nằm ở màn chốt — nút "Huấn luyện
  lại model" đặt ở console admin, cùng viên gạch (LUẬT 12). Nhịp train
  KHÔNG có lịch cứng ở giai đoạn tay: user chốt xong đợt nào thì tự
  audit đã chạy ngầm rồi, muốn train lại trước đợt predict mới thì bấm
  (đúng nhịp VFP "hết lần 1 sang lần 2 audit + train luôn"). Khi nối
  dây chuyền tự động mới đặt lịch (tham số tuần/tháng).

**BR-CDK-12 — Tầng duyệt chuyên gia dữ liệu (GIAI ĐOẠN 2, thiết kế sẵn
đường nâng cấp, chưa code ở v1).** Mục tiêu Hiu: dữ liệu training phải
thật sự sạch. Khi bật (config `"ExpertReview": true`):
- Luồng status mở rộng: CHO_GIAI_THICH → (user điền giải thích) →
  CHO_DUYET → (chuyên gia duyệt) → ACTIVE; chuyên gia có thể trả lại
  (về CHO_GIAI_THICH kèm ghi chú) nếu giải thích chưa thỏa đáng.
- Màn duyệt: danh sách CHO_DUYET, hiện đủ ngữ cảnh (tên, vế, đơn vị,
  label cũ/mới, giải thích, ai chốt) — duyệt/trả lại từng dòng hoặc lô.
- Vì export train TỪ ĐẦU đã chỉ lấy ACTIVE (van duy nhất), bật/tắt tầng
  này KHÔNG đụng gì đến train hay màn chốt — chỉ thêm 1 giá trị status
  ('CHO_DUYET' vào CHECK constraint, một script đánh số) + 1 màn duyệt
  + 1 role (DataExpert). Giai đoạn 1 chạy ai-cũng-chốt-được như VFP
  (thực tế chỉ 1-2 user quen việc làm định khoản).

**BR-CDK-11 — Bảng đổi tên nút (VFP cũ → web mới).**

| VFP (cũ) | Web (mới) |
|---|---|
| Mark All Line | Chọn tất cả |
| Mark Record By Prefix / ...For Update | Chọn cùng nhóm tên (một nút — hành động sau đó mới quyết Chốt hay Sửa) |
| Mark Is Predict OK | Chốt đúng |
| (combo TK + Mark...For Update + Update về Data Training) | Sửa thành [TK] |
| Mark Number Record N | (bỏ) |
| Chỉ lấy dữ liệu MF Predict | (bỏ — tự load) |
| AUDIT DATA TRAIN | Chờ giải thích (N) |

## 4. Quyết định đã chốt (Hiu, 18/08 — nâng từ §4 "câu hỏi as-built" của v0.1)

1. **dk_goc — giữ nguyên cách VFP.** Một cột; lần định khoản tự động
   ĐẦU TIÊN bê giá trị đang có của ghi_no (V) / ghi_co (R) sang dk_goc
   (chỉ khi còn trống). Combo "Định khoản gốc" tồn tại để user thấy
   ngoài "EMPTY" hay "641" còn giá trị nào khác xuất hiện — công cụ chia
   nhỏ danh sách, không hơn. Schema web chưa có cột → script đánh số bộ
   THUE, làm cùng đợt pred_conf.
2. **Prefix v1 = từ đầu tiên của tên** dòng hiện tại, đánh dấu các dòng
   cùng prefix (đã đưa vào BR-CDK-03). Các kiểu chọn thông minh hơn
   (theo NCC, theo nhóm mặt hàng có nghĩa như "các loại bánh") để SAU,
   ngoài phạm vi v1.
3. **Kỳ chốt: linh động, không lịch cứng.** Audit chạy ngầm ngay khi
   chốt nên không tồn tại "ngày audit". Giai đoạn tay: hết đợt predict
   này, trước đợt sau user tự bấm train ở console. Badge "Chờ giải
   thích" nhắc ở mọi nơi chạy chức năng định khoản (BR-CDK-06); user
   vội cứ chốt không giải thích cũng không sao — dòng đó chỉ đơn giản
   chưa vào training, ai theo thói quen trả nợ giải thích thì càng tốt.
4. **Quyền: chạy như VFP — user nào cũng chốt được** (thực tế 1-2 user
   quen việc làm định khoản nên không sai nhiều). Khát vọng "dữ liệu
   training thật sự sạch" được thiết kế sẵn đường nâng cấp ở BR-CDK-12
   (tầng duyệt chuyên gia dữ liệu, giai đoạn 2, bật bằng config —
   không phải đập gì khi bật).

## 5. Nghiệm thu (test tay được)

- A1. Lọc 641→156 của một đơn vị: danh sách chỉ còn các nhóm đúng cặp
  đó; đổi combo gốc sang EMPTY thấy bộ dữ liệu mới chưa từng định khoản.
- A2. Đứng ở nhóm "Bánh Danisa...", bấm "Chọn cùng nhóm tên": mọi nhóm
  bắt đầu bằng prefix đó được chọn, con trỏ tự nhảy tới nhóm prefix kế.
- A3. "Chốt đúng" N nhóm: mọi dòng HOA_DON_LINE tương ứng good_pred=1;
  chạy lại BƯỚC PREDICT: các dòng này KHÔNG bị định khoản lại.
- A4. Nhóm chốt đúng có pred_conf 0.80 (< 0.85): xuất hiện trong
  DK_DATA_TRAIN status ACTIVE; nhóm 0.95 thì không.
- A5. "Sửa thành 641" một nhóm đang 156: GHI_NO/GHI_CO đổi đúng vế,
  DK_DATA_TRAIN thêm dòng; nếu bản cũ trong DK_DATA_TRAIN là label khác
  → dòng mới status CHO_GIAI_THICH + badge "Chờ giải thích" tăng 1.
- A6. Điền giải thích trong màn "Chờ giải thích" → status ACTIVE; export
  train (WHERE status='ACTIVE') trước đó KHÔNG chứa dòng này, sau đó CÓ.
- A7. Hai user chốt cùng đơn vị cùng lúc, selection giao nhau: không
  lỗi, không double audit-insert (dòng đã good_pred=1 bị bỏ qua êm).
- A8. ActivityLog có dòng cho mỗi lần bấm hành động, DK_AUDIT_LOG có
  user_name đúng người thao tác.
- A9. Chạy predict tay một đơn vị khi đang còn N dòng CHO_GIAI_THICH:
  badge "Chờ giải thích (N)" hiện ngay tại đó (không chỉ ở màn chốt);
  chốt tiếp KHÔNG bị chặn.
- (Giai đoạn 2, khi bật ExpertReview) A10. Điền giải thích → dòng sang
  CHO_DUYET, export train vẫn CHƯA chứa; chuyên gia duyệt → ACTIVE →
  export train chứa; trả lại → về CHO_GIAI_THICH kèm ghi chú.
