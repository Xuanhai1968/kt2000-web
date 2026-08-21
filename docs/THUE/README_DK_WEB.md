# DINH_KHOAN v3 - bản WEB (JSON CLI, không Excel, không TCVN3)

## Files
| File | Thay thế | Vai trò |
|---|---|---|
| dk_core.py | dinhkhoan_core.py | make_feature + normalize (train và predict DÙNG CHUNG) |
| predict.py | 04_predict_pipeline.py | JSON vào -> predict -> JSON ra |
| train.py | 06_train_only.py + phần train của 02_com_server_v2.py | Train từ JSON (DK_DATA_TRAIN) hoặc XLSX (chuyển tiếp) |
| KT2000_PUB_schema.sql | DATA_TRAIN.xlsx | Tạo DB chung: 3 bảng ML + seed blacklist |
| 0XX_doi_ten_proba_pred_conf.sql | — | Script ĐÁNH SỐ cho DB tenant: đổi tên proba -> pred_conf (dev claim số) |

05_audit_data_train.py KHÔNG có bản Python mới: logic audit (blacklist,
NEW/DUPLICATE/CONFLICT) chuyển sang C#, chạy ngay tại thời điểm user chốt
trên web (xem mục "Phần việc C#").

## CẢNH BÁO TƯƠNG THÍCH
model_v3.joblib KHÔNG đổi chỗ được với model_v2.joblib của bản VFP.
Feature v2 có bug đối xứng ('à' -> 'ồ', 'ý' -> 'ỳ' do map TCVN3 áp lên
Unicode sạch); v3 bỏ map này nên feature khác hẳn. Bản web dùng MODELS_DIR
riêng (vd D:\PYTHON\MF_PRED\MODELS_WEB\), VFP giữ nguyên thư mục cũ.
(Print trong script giữ KHÔNG DẤU chủ đích: log console qua Task
Scheduler/Windows Service hay rơi vào codepage cũ, chữ có dấu vỡ log.)

## Chạy thử (đã test với DATA_TRAIN.xlsx thật: acc 0.9618 / 52,177 records)
```
python train.py   --input DATA_TRAIN.xlsx --models D:\PYTHON\MF_PRED\MODELS_WEB
python predict.py --input INPUT.json --output OUTPUT.json ^
                  --models D:\PYTHON\MF_PRED\MODELS_WEB --threshold 0.70
```
Exit code 0 = OK, 1 = lỗi. C# check exit code trước, rồi đọc JSON
(predict: OUTPUT.json có "success"; train: MODELS_DIR\last_train_stats.json).

## Phần việc C#
Bước đầu CHẠY TAY từng đơn vị như VFP, ghi nhận vấn đề rồi mới nối vào
dây chuyền tự động: Lấy HĐ -> DINH_KHOAN (song song với lấy HĐ đơn vị
khác) -> TIM_TEN_HANG đầu vào -> đầu ra.

### NGUYÊN TẮC VIÊN GẠCH (= LUẬT 12 trong CLAUDE.md - BẮT BUỘC cho MỌI
### chức năng, không riêng DINH_KHOAN. Code review KHÔNG DUYỆT nếu vi phạm):
### 1. Mỗi chức năng viết thành 1 "viên gạch" (1 service/step) duy nhất,
###    nhận tham số tường minh (tenant nào, phạm vi nào), tự chạy trọn vẹn.
### 2. Nút bấm trên UI và bước trong dây chuyền tự động PHẢI gọi CHUNG
###    viên gạch đó - chỉ khác cách kích hoạt, CẤM tồn tại 2 bản code
###    cho 2 cách chạy.
### 3. Khi viết, dev phải hình dung viên gạch sẽ được xếp vào nhiều chỗ:
###    gọi tay 1 đơn vị, gọi vòng lặp nhiều đơn vị, gọi từ scheduler.
###    Nếu code chỉ chạy được 1 chỗ là sai thiết kế.

1. BƯỚC PREDICT (tay: bấm nút từng đơn vị / sau này: worker hằng ngày):
   - SELECT DISTINCT ten_hang, huong từ HOA_DON_LINE WHERE is_predict = 0
   - **TẦNG LOOKUP TRƯỚC MODEL (bổ sung 19/08 — "người chốt một lần,
     máy nhớ mãi mãi"):** với mỗi (ten_norm, vế, đơn vị), tra
     DK_DATA_TRAIN trước:
       SELECT TOP 1 label FROM KT2000_PUB.dbo.DK_DATA_TRAIN
       WHERE ten_norm = @t AND vao_ra = @v AND ma_donvi = @dv
         AND status = 'ACTIVE'
       ORDER BY id DESC;   -- MAX(id) = nhất quán last-write-wins của train
     TRÚNG -> ghi thẳng GHI_NO/GHI_CO theo label này, is_predict = 1,
     pred_conf = 1.0, KHÔNG đưa vào JSON; cập nhật last_hit_at = hôm nay
     (chỉ UPDATE khi khác ngày, gộp theo lô cho đỡ ghi).
     TRƯỢT -> dồn vào INPUT.json cho model đoán như dưới.
     Mẹo hiệu năng cho batch: load một phát toàn bộ key ACTIVE thành
     Dictionary trong RAM (label lấy theo id lớn nhất) rồi tra RAM,
     thay vì SEEK từng dòng. CHỈ dùng dòng status='ACTIVE' — dòng
     CHO_GIAI_THICH chưa được coi là chân lý.
   - Phần còn lại -> INPUT.json (id tùy C# đặt, opaque với Python;
     chạy tay 1 đơn vị hay gộp nhiều đơn vị đều cùng format)
   - Gọi predict.py, đọc OUTPUT.json
   - UPDATE: ghi nhãn máy đoán THẲNG vào GHI_NO/GHI_CO (đang trống từ XML)
     theo luật đối ứng cứng, + is_predict = 1, + pred_conf:
       V: GHI_NO = label máy đoán, GHI_CO = 331
       R: GHI_NO = 632,            GHI_CO = label máy đoán
     (chỉ HOA_DON_LINE, không động vào HOA_DON. KHÔNG có pred_label -
      GHI_NO/GHI_CO chính là nhãn máy đoán cho đến khi user sửa)
   - Định khoản lại: lấy WHERE is_predict = 1 AND good_pred = 0
   - Ghi TaskStatus/ActivityLog như các worker khác
2. MÀN CHỐT (grid lọc đơn vị + tuần, is_predict = 1, good_pred = 0;
   tô màu dòng pred_conf < 0.70 để user ưu tiên soi):
   - User xác nhận (good_pred = 1) hoặc sửa GHI_NO/GHI_CO rồi xác nhận
   - BẮT BUỘC: update HOA_DON_LINE và audit-insert DK_DATA_TRAIN nằm
     trong CÙNG MỘT transaction (tenant DB và KT2000_PUB cùng instance
     nên 1 connection cross-database gói được cả hai) — hỏng đâu lùi cả,
     không bao giờ có chuyện chốt mà mất trí nhớ lookup hay ngược lại
   - Phát hiện "sửa" NGAY TRONG transaction chốt: so giá trị user gửi
     với giá trị hiện tại trong DB (vẫn là giá trị máy ghi)
   - Với dòng đạt ngưỡng (bị sửa HOẶC pred_conf < 0.85): audit-insert
     vào KT2000_PUB:
       a. ten_norm = Normalize(NFC) + lower + gộp space (port
          normalize_for_match trong dk_core.py)
       b. Blacklist từ DK_BLACKLIST (EXACT so bằng, CONTAINS chứa,
          TRIM_AFTER cắt đuôi; + validation: tên < 3 ký tự, toàn số,
          không có chữ cái -> loại) -> REJECT thì chỉ ghi DK_AUDIT_LOG
       c. Lookup DK_DATA_TRAIN (ten_norm, vao_ra, ma_donvi):
          trùng label -> DUPLICATE (bỏ qua); chưa có -> INSERT status ACTIVE;
          khác label -> CONFLICT: INSERT is_conflict=1, notes
          "CONFLICT: was X, now Y", status = 'CHO_GIAI_THICH' và UI YÊU CẦU
          user điền giải thích (tại sao lần này ĐK khác) vào mo_ta ->
          C# chuyển status = 'ACTIVE'. Chưa giải thích = không vào training.
       d. Mỗi hành động ghi 1 dòng DK_AUDIT_LOG (kèm user_name)
3. HẰNG TUẦN (sau khi các đơn vị chốt xong):
   - Export DK_DATA_TRAIN WHERE status = 'ACTIVE' -> TRAIN_DATA.json
     (ORDER BY id ASC - dedup last-write-wins cần thứ tự này), gọi train.py
   - Đọc last_train_stats.json, lưu kết quả (accuracy, n_samples)

## Còn lại / chưa làm
- Migrate 53.7K dòng DATA_TRAIN.xlsx -> DK_DATA_TRAIN (cần tính ten_norm
  từng dòng - nên làm bằng 1 script C# console hoặc Python+pyodbc 1 lần)
- Spec chi tiết màn chốt (WP mới) + bước DINH_KHOAN trong chuỗi importer
- SchemaUpgrader (kiểm tra + nâng schema tenant tự động - đang bàn với Hiu)
