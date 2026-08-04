# SPEC — FRM_LAY_HDDT: Hoàn thiện form lấy HĐ điện tử từ TCT

- Phiên bản: v2 — đã chốt tên file (mục 3) và LINE (mục 4) ngày 03/08/2026; còn 3 câu hỏi mở ở mục 9
- Liên quan: SPEC-WP03 v2, BR-HD-01, BR-IMP-01, script 008 (TaskStatus + ActivityLog), MoveArtifacts v3
- Người viết: Leader (Hiu) — cấu trúc lại cùng Claude 03/08/2026

## 0. Mục tiêu & phạm vi

Hoàn thiện màn hình FRM_LAY_HDDT (ruột của "Hóa đơn GTGT Đầu vào" cho user internal MDN_NB) thành quy trình 2 bước giống VFP cũ để user quen dùng:

- **Bước 1**: tải HĐ từ TCT về cây job folder (worker gọi Python).
- **Bước 2**: nạp vào HOA_DON / HOA_DON_LINE (ImportService đã có — sửa theo mục 4, 5).

**Trong phạm vi**: giao diện danh sách đơn vị, tải + nạp nối liền, nạp tay riêng bước 2, di chuyển file sau ghi, log DB, progress bar.
**Ngoài phạm vi (giai đoạn 2)**: chạy tự động cuối tuần — mục 8, chỉ thiết kế chỗ cắm, chưa code.

## 1. Giao diện FRM_LAY_HDDT

Grid danh sách đơn vị (nguồn: Tenants, chỉ đơn vị IsActive), mỗi dòng gồm:

| Cột | Nguồn dữ liệu |
|---|---|
| Checkbox chọn | — |
| Mã, Tên đơn vị | Tenants |
| Kỳ khai | Tenants.KhaiQuy — **khai THÁNG hiển thị chữ ĐỎ cả dòng** |
| Lần lấy gần nhất | DOWNLOAD_JOB (mục 6) — ngày giờ + account chạy |
| Kết quả lần gần nhất | DOWNLOAD_JOB — "Tải x / Nạp OK y / Bỏ lại z" |
| File lỗi còn trong raw | Đếm file .xml trong raw\VAO + raw\RA lúc Refresh (không đếm realtime) |
| Nút "Nạp bước 2" | Chạy tay ImportService cho đơn vị đó (mục 5) |

Thanh điều khiển phía trên grid:

- Nút **"Đánh dấu tất cả khai Tháng"** và **"Đánh dấu tất cả khai Quý"** (tick checkbox theo nhóm KhaiQuy).
- Radio: **"Chỉ HĐ vào"** / **"Cả đầu ra + đầu vào"**.
- Combobox **Từ tháng / Đến tháng**; **năm = fiscal_year trong claim của phiên đăng nhập MDN_NB** (bỏ nút chọn năm). Date-picker khoảng ngày trong 1 tháng chỉ bật khi Từ tháng = Đến tháng (giữ nguyên thiết kế (c) đã chốt).
- Nút **"Lấy HĐ"** (chạy bước 1 → tự nối bước 2 từng đơn vị xong tải).
- Nút **"Refresh"** (bắt buộc có, không phải "nếu cần"): đọc lại cột File lỗi + Lần lấy gần nhất.
- **Progress bar**: đang lấy đơn vị nào, đến đâu — poll status.json của job (theo thiết kế (c)).

Quyền: toàn bộ màn hình sau gate claim tenant_type=internal; mọi nút chạy tay ghi user vào ActivityLog.

## 2. Bước 1 — Tải từ TCT

- 1 đơn vị × trọn khoảng tháng = 1 job Python = 1 login TCT (nguyên tắc TRA_CUU_HDDT_2_0 đã chốt).
- Cây thư mục theo hợp đồng job folder hiện hành, KHÔNG đổi:
  `\\Severnew\data_hddt\<MA>\NAM<yr>\T<m>_<yr>_<MA>\raw\VAO|RA\` (xml + html + Excel gốc), `outputs\` (Excel tổng).
- Tên file raw giữ nguyên như py đang sinh (đã chứa MST người phát hành — khớp BR-HD-01).
- HĐ không có XML gốc (điện, viễn thông, ngân hàng — nhà phát hành số lượng lớn): **đã có lời giải trong WP-03** — nguồn nạp là Excel tổng từ API TCT nên các HĐ này vẫn vào DB; kiểm đủ món bằng manifest chống-thiếu + nút "Lấy bù" (vá #8 --chi_lay). Dev không tự chế cách xử lý mới — nếu thấy thiếu loại nào, mở Issue hỏi Leader.

## 3. Di chuyển file sau khi ghi thành công (MoveArtifacts v3 → v4)

Sau khi commit 1 HĐ vào DB:

- File **.html** → `\\Severnew\scan_doc\<MA>\NAM<yr>\<HUONG>_T<m>_<yr>\<TÊN_FILE>.html` (user mở xem HĐ gốc).
- File **.xml** → `\\Severnew\scan_doc\<MA>\NAM<yr>\xmls_only\<huong>\t<m>\<TÊN_FILE>.xml` (kho lưu bản ký số). **← điểm MỚI so với v3**: v3 đang để chung một chỗ, v4 tách xml sang cây riêng.
- MOVE, không copy; app tự tạo đủ cây thư mục; chạy lại sau khi đã move báo moved=0 là đúng.
- File lỗi (trượt kiểm Σ, lệch năm...) **ở lại raw\** — raw = khay hồ sơ lỗi (BR đã chốt), grid hiện số đếm.

> **[ĐÃ CHỐT — Leader 03/08/2026]** `<TÊN_FILE>` = `<MA_HD>` theo BR-HD-01 (hướng + MST người phát hành + KHHD + SHD) — chống trùng tuyệt đối, đúng bài học HUY_THANH tháng 1.
>
> **Quy tắc đệm số HĐ (bổ sung vào BR-HD-01)**: SHD đệm số 0 bên trái cho đủ **tối thiểu 7 ký tự**; SHD vốn dài hơn 7 chữ số (NĐ 123/2020 cho phép tối đa 8) thì giữ nguyên, **tuyệt đối không cắt**. Ví dụ: SHD=1 → `0000001`; SHD=187 → `0000187`; SHD=12345678 → `12345678` (giữ 8). Tên file mẫu: `VAO_3702139167-007_C25THY_0000187.html`.
>
> Phạm vi áp dụng đệm (chỉ tên file hay cả MA_HD trong DB): xem câu hỏi mở 9.1.

## 4. Lấy lại (re-fetch) — "cập nhật có chừa"

Khi bấm Lấy mà HĐ đã tồn tại trong DB: **KHÔNG xóa như VFP cũ**, mà cập nhật:

- **HOA_DON (master)**: UPDATE chỉ các cột nguồn TCT; **giữ nguyên cột user nhập**: ghi_no, ghi_co, ma_ct_*, ma_kh, ngay_nh, ghi_chu (danh sách chính thức chốt ở mục 9.3).
- Checkbox **"Xóa trước khi ghi"** (mặc định tắt, bật thì nút chuyển màu nguy hiểm): xóa line → master trong transaction từng HĐ, nạp lại tính là Mới — dùng khi muốn "đè trắng". (Đã chốt 01/08, giữ nguyên.)

> **[ĐÃ CHỐT — Leader 03/08/2026]** HOA_DON_LINE khi lấy lại: **delete + reinsert toàn bộ line** (giữ nguyên quyết định 01/08 — upsert từng dòng không kiểm soát được an toàn dữ liệu: XML mới ít dòng hơn bản cũ, TCT đổi thứ tự dòng... đều thành ca mơ hồ). Cột user-owned chỉ được bảo toàn ở **mức master**. UI ghi rõ cạnh nút Lấy: "Khi lấy lại, chi tiết dòng sẽ được nạp mới theo bản TCT". Xem lại khi WP-04 bắt đầu gán ma_hang vào line.

## 5. Nạp tay bước 2

- Nút trên từng dòng grid: chạy ImportService cho job folder của đơn vị đó (đúng endpoint POST /api/admin/import-job hiện có, thêm tham số từ grid).
- BR-IMP-01 hai lớp giữ nguyên: lệch tenant/năm → từ chối cả job; lệch năm từng dòng → bỏ qua có đếm, file không move.
- Kiểm Σ line = master theo BR hiện hành (dung sai ±1đ); công thức đang trong autopsy vụ dòng chiết khấu — dev không tự sửa công thức, chờ BR chốt.
- Kết quả ghi DOWNLOAD_JOB + ActivityLog (kèm user chạy tay).

## 6. LOG = bảng database (Master), không phải file text

Tận dụng cái đã có + thêm 2 bảng:

**Đã có, chỉ thêm móc:**
- `TaskStatus` (script 008): thêm TaskCode `LAY_HD` (tải xong) bên cạnh `NAP_HD` (đã có). Upsert đơn vị × năm × tháng × TaskCode → trả lời "đơn vị này đã lấy HĐ chưa, đã định khoản chưa..." — nền dashboard /app/tinh-hinh.
- `ActivityLog` (script 008): append mọi sự kiện chạy tay kèm user.

**Thêm mới (script đánh số tiếp theo):**

```sql
DOWNLOAD_BATCH: id, started_at, started_by, mode (MANUAL/AUTO),
                tu_thang, den_thang, nam, pham_vi (VAO/CA_HAI), note
DOWNLOAD_JOB:   id, batch_id (FK), ma_donvi, tu_thang, den_thang, nam,
                status (RUNNING/DONE/ERROR), so_tai_ve, so_nap_ok,
                so_bo_lai, err_msg, started_at, finished_at
```

Trả lời trọn câu hỏi lịch sử: "HĐ tháng 1 TUAN_NGA lấy ngày nào, mấy lần, account nào, mỗi lần được bao nhiêu bỏ lại bao nhiêu" = một câu SELECT trên DOWNLOAD_JOB.

File log kỹ thuật (py, service) giữ nguyên vai hộp đen debug; DB là sổ nghiệp vụ.

## 7. Trình tự chạy một phiên (để dev hình dung end-to-end)

1. User tick đơn vị, chọn phạm vi tháng, bấm Lấy HĐ → tạo 1 DOWNLOAD_BATCH + n DOWNLOAD_JOB (RUNNING).
2. Worker chạy tuần tự từng job: gọi py (đọc credentials từ TenantCredentials — hạng mục (b), không truyền plaintext) → progress qua status.json.
3. Job tải xong → tự chạy bước 2 (ImportService) → cập nhật DOWNLOAD_JOB (số liệu) + TaskStatus (LAY_HD, NAP_HD) + ActivityLog → MoveArtifacts v4.
4. Grid Refresh: cột kết quả + file lỗi cập nhật.

## 8. Giai đoạn 2 — chạy tự động cuối tuần (chưa code, thiết kế chỗ cắm)

- Worker BackgroundService lịch đêm Thứ 7 / Chủ nhật; mode=AUTO trong DOWNLOAD_BATCH.
- Policy bắt buộc: **né các ngày hạn kê khai thuế** (bài học cổng TCT chậm ngày deadline gây thiếu VAO MTT im lặng).
- Mọi thiết kế mục 6-7 phải chạy được không cần người (không hộp thoại chặn giữa chừng).

## 9. Câu hỏi mở — Leader chốt trước khi giao (KHÔNG để dev tự quyết)

1. Quy tắc đệm SHD (mục 3) áp dụng **chỉ tên file** hay **cả MA_HD lưu trong DB**? Đề nghị: cả hai — một danh tính, một cách viết, tên file = MA_HD tra ngược được. Chi phí nếu chọn "cả hai": nạp lại 60 HĐ thử của TUAN_NGA (làm bây giờ thì rẻ; để đến khi có dữ liệu thật nhiều đơn vị thì đắt).
2. Danh sách chính thức "cột user-owned không bị đè" → đề nghị chốt thành BR-IMP-02.
3. Cột "Kết quả lần gần nhất" trên grid hiển thị theo batch gần nhất hay cộng dồn cả tháng?

## 10. Checklist nghiệm thu

1. Đăng nhập MDN_NB → FRM_LAY_HDDT hiện đủ đơn vị; đơn vị khai tháng ĐỎ; user thường (non-internal) vào bị 403.
2. Nút "Đánh dấu khai Tháng"/"khai Quý" tick đúng nhóm; Từ/Đến tháng mặc định năm đăng nhập.
3. Lấy 1 đơn vị 1 tháng: progress hiện tiến độ; xong có dòng DOWNLOAD_JOB đúng số tải/nạp/bỏ lại; TaskStatus LAY_HD + NAP_HD bật đúng ô tháng.
4. File .html nằm đúng `<HUONG>_T<m>_<yr>\`, file .xml nằm đúng `xmls_only\`; raw chỉ còn file lỗi; cột File lỗi khớp số file thật sau Refresh.
5. Nút "Nạp bước 2" chạy tay được; ActivityLog ghi đúng user.
6. Lấy lại lần 2: ghi chú + định khoản trên master KHÔNG mất; số đếm Mới=0, Update đúng.
7. Bài thử ác: thả 1 xml năm khác vào raw → job bị từ chối cả gói (BR-IMP-01 lớp job); 1 dòng lệch năm → bỏ qua có đếm, file không move (lớp dòng).
8. Đơn vị có HĐ điện/viễn thông (không XML): số HĐ nạp vào DB khớp Excel tổng, manifest không báo thiếu.

## 11. Lộ trình thi công — đọc cả spec, code theo từng Issue

Spec này là **bản thiết kế tổng thể**: dev đọc trọn một lần để biết đích đến và chừa sẵn "đầu chờ", nhưng **mỗi PR chỉ làm một Issue** theo thứ tự dưới. Acceptance của mỗi Issue = các dòng tương ứng trong mục 10.

| Issue | Phạm vi | Mục spec | Đầu chờ phải chừa sẵn cho bước sau | Nghiệm thu (mục 10) |
|---|---|---|---|---|
| #A | Grid đơn vị + dòng đỏ khai tháng + 2 nút đánh dấu + Từ/Đến tháng + Refresh (thuần frontend, dữ liệu Tenants có sẵn) | 1 | Cột "Lần lấy gần nhất", "Kết quả", "File lỗi" hiển thị "—" chờ #B; chỗ đặt progress bar để trống | 1, 2 |
| #B | Script SQL 2 bảng DOWNLOAD_* + TaskCode LAY_HD + API đọc lịch sử cho grid | 6 | Cột mode trong DOWNLOAD_BATCH nhận cả AUTO dù #D chưa làm | 3 (phần bảng) |
| #C | Nút "Lấy HĐ": worker gọi py → nối bước 2 → progress → MoveArtifacts v4 → nút nạp tay | 2, 3, 4, 5, 7 | Format status.json giữ nguyên để #D dùng lại; hàm chạy batch nhận tham số mode | 3, 4, 5, 6, 7, 8 |
| #D | Chạy tự động cuối tuần (BackgroundService + policy né hạn kê khai) | 8 | — | chạy đêm không cần người |

Quy ước chống "sao không nói trước": mọi thay đổi yêu cầu sau này đều sửa vào **file spec này qua PR** — dev xem diff của spec là biết chính xác điều gì đổi so với lúc đọc lần đầu.
