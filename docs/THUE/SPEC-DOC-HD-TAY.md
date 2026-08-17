# SPEC-DOC-HD-TAY — Màn hình "File còn lại" (Đọc hóa đơn bằng tay)

Phiên bản: v0.1 (draft — chờ Hiu duyệt)
Người soạn: Leader + Claude
Vị trí đề nghị: docs/THUE/SPEC-DOC-HD-TAY.md (commit qua PR)

---

## 0. Vị trí trong pipeline & bối cảnh

Chuỗi xử lý HĐĐT hiện nay:

1. Nút **"Lấy hóa đơn điện tử"** (đã gộp 2 bước): gọi Python tải file từ cổng TCT → importer tự động nạp vào database.
2. File nào **trượt** kiểm tra thì **ở lại raw\** (khay hồ sơ lỗi — theo BR importer). Số HĐ còn lại hiện ở 2 cột **VÀO / RA** trên console.
3. Nút **"Xem file còn lại"** mở màn hình này — **phòng cấp cứu**: kế toán xem từng HĐ, sửa số, cân Σ, rồi ghi tay vào database.

Tương đương VFP: form "Danh sách Hóa đơn từ File Excel" (KẾT QUẢ ĐỌC FILE) với grid master trên, grid line dưới, và nút "Ghi vào Hóa đơn MDN".

**Ghi chú retro:** hành vi nút gộp "Lấy hóa đơn điện tử" (chuỗi tải→nạp, không có chế độ chỉ-tải; ca đặc biệt đi đường tay cũ) hiện chưa có trên giấy → bổ sung một mục as-built vào SPEC-FRM-LAY-HDDT (amendment v2.1) qua PR, không viết lại ở đây.

---

## 1. Phạm vi

### Trong phạm vi v1
- Liệt kê HĐ còn nằm trong raw\ theo bộ lọc hiện hành của console (đơn vị + Từ/Đến tháng + checkbox Vào/Ra).
- Hiện lý do vì sao còn nằm lại (mã lý do — mục 3).
- Xem chi tiết line đọc từ XML; sửa số master và line; tính lại; cân Σ.
- Xem ảnh HĐ (HTML bản thể hiện).
- Ghi vào Hóa đơn qua **đường ghi chung** của importer.
- Sau khi ghi thành công: file move khỏi raw\, HĐ biến khỏi danh sách, đếm VÀO/RA trên console giảm.

### Ngoài phạm vi v1 (ghi nhận, quyết sau — mục 9)
- Chuyển sang HĐ Hủy.
- Chuyển Chi phí hoặc thu nhập khác (cần engine định khoản WP-06).
- Tìm PDF.
- Xử lý file rác không parse được XML (nút loại bỏ vĩnh viễn).

---

## 2. BR-TAY-01 — Nguồn dữ liệu & đơn vị đếm

- Nguồn = các file trong `raw\VAO` và `raw\RA` của (các) job folder khớp bộ lọc hiện hành trên console.
- **Đơn vị đếm là HĐ, không phải file.** Một HĐ có thể gồm XML + HTML (2 file vật lý) → đếm 1. Số ở cột VÀO/RA console và số dòng master màn hình này phải khớp nhau, cùng một hàm đếm ở backend.
- Danh tính HĐ hiển thị theo BR-HD-01: (hướng, MST phát hành, KHHD, SHD) → MA_HD.

## 3. BR-TAY-02 — Mã lý do còn nằm lại (enum)

Cột "Vì sao còn nằm lại" hiển thị theo mã, backend trả mã + diễn giải (không hardcode chuỗi ở frontend):

| Mã | Diễn giải | Ghi chú |
|---|---|---|
| `NO_EXCEL_ROW` | Không có dòng nào trong Excel tổng khớp file này | Master money = 0/trống; xem BR-TAY-03 |
| `SUM_MISMATCH` | Σ line ≠ master ngoài dung sai ±1đ | Dùng chung công thức Σ với importer |
| `YEAR_MISMATCH` | year(NGAY_HD) ≠ năm DB (BR-IMP-01 lớp dòng) | Không cho ghi vào năm này — chỉ xem |
| `PARSE_ERROR` | XML không đọc được / thiếu trường bắt buộc | Chỉ xem + Xem ảnh; xử lý ở 9.x |

> ⚠ Danh sách trên suy từ BR importer + màn hình thực tế. **Hiu rà lại log importer để bổ sung mã còn thiếu** (ví dụ: cặp HĐ điều chỉnh ±, trùng khóa…) — xem câu hỏi 9.1. Các dòng C26TDH 177–180 trong bài thử HOA_SANG có Lệch = 0 mà vẫn nằm lại → cần xác định đúng mã lý do của chúng.

## 4. BR-TAY-03 — Đảo chiều nguồn sự thật

- Luật chung importer: **Excel tổng = sự thật**, XML = kho lưu.
- **Riêng màn hình này**, với HĐ `NO_EXCEL_ROW`: **XML + xác nhận của người dùng = sự thật**. Người dùng nhập/sửa master money bằng tay, đối chiếu ảnh HĐ.
- Với `SUM_MISMATCH`: master money từ Excel tổng vẫn là điểm neo; người dùng sửa **line** (hoặc master nếu xác định Excel sai) cho tới khi cân.
- HĐ ghi từ màn hình này được đánh dấu nguồn tay (ActivityLog action `NAP_HD_TAY` — mục 7) để về sau truy được "số này người gõ, không phải máy nạp".

## 5. Bố cục màn hình

Hai tầng, đúng hình mẫu VFP master–detail:

### 5.1 Grid master (trên) — mỗi dòng = 1 HĐ còn lại

| Cột | Nguồn | Sửa được? |
|---|---|---|
| Tháng | job folder | Không |
| Hướng (VAO/RA) | thư mục raw | Không — tô nền theo BR màu hướng (đỏ nhạt/xanh nhạt như NT v1.1) |
| Ký hiệu (KHHD) | XML | **Không** (danh tính — 9.2) |
| Số HĐ | XML | **Không** (danh tính — 9.2) |
| Ngày HĐ | XML | **Không** v1 (đổi ngày đổi năm → đụng BR-IMP-01) |
| MST + Tên đối tác | XML (lật theo hướng như importer) | Không |
| Tiền hàng | Excel tổng nếu có, không thì 0 | **Có** |
| Tiền VAT | như trên | **Có** |
| Tổng | tính = Tiền hàng + VAT − CK | Không (computed) |
| **Lệch Σ line** | Σ line − master, hàm chung với importer | Không (computed, đỏ khi ≠ 0) |
| Vì sao còn nằm lại | enum mục 3 | Không |
| Tên file | tên XML | Không |

Bấm một dòng → tầng detail nạp line của HĐ đó (giữ hành vi hiện tại của dev1).

### 5.2 Grid detail (dưới) — line đọc từ XML

| Cột | Sửa được? | Ghi chú |
|---|---|---|
| STT | Không | |
| Tên hàng | Không v1 | ten_hang_goc — sự thật từ XML |
| ĐVT | Không v1 | dvt gốc |
| Số lượng | **Có** | |
| Đơn giá | **Có** | |
| Thành tiền | **Có** | quan hệ tính lại — 5.3 |
| Tiền CK | **Có** | dòng chiết khấu quan trọng cho Σ |
| %VAT | **Có** | |
| Tính chất (LOAI_HH) | Không | 1=hàng hóa, 3=chiết khấu… hiện để người dùng hiểu vì sao Σ trừ |

Chân grid: **Σ thành tiền** (theo công thức chung) + **Lệch so với master**, cập nhật tức thời khi gõ.

### 5.3 Quy tắc "Tính lại" (map nút VFP "Tính lại đơn giá")

- Sửa Số lượng hoặc Đơn giá → Thành tiền = SL × ĐG (làm tròn đồng).
- Sửa Thành tiền → giữ SL, Đơn giá = TT / SL (đúng tinh thần nút VFP: đơn giá là biến phụ, thành tiền là số trên hóa đơn).
- Không tự lan sang VAT: %VAT × thành tiền chỉ gợi ý, số VAT thật lấy theo HĐ (edit_vat đã chốt lúc nạp — giữ nguyên triết lý).

## 6. BR-TAY-04 — Cổng cân trước khi ghi

- Nút **"Ghi vào Hóa đơn"** chỉ bật khi `|Lệch Σ line| ≤ 1đ` (đúng dung sai importer; VAO: TIEN_HANG vs Σ THANH_TIEN; RA: cặp tương ứng như importer).
- Khi còn lệch: nút mờ + hiện số lệch đỏ ngay cạnh (dev1 đã có "Σ line 1.750.000 — lệch −1.750.000" → giữ, chỉ thêm trạng thái disable nút).
- **Không có đường ghi-lệch-kèm-xác-nhận trong v1** (tránh mở cửa sau; nếu thực tế cần, nâng ở v2 — 9.3).

## 7. BR-TAY-05 — Một cửa ghi

Ghi vào DB **dùng chung** đường của ImportService, không viết transaction thứ hai:

1. Transaction per-invoice: upsert master theo chế độ "cập nhật có chừa" (cột kế toán ghi_no/co, ma_ct_*, ma_kh, ghi_chu… không bị đè), delete + reinsert line.
2. MA_HD theo BR-HD-01 (kèm luật pad SHD tối thiểu 7 ký tự đã chốt).
3. edit_vat/edit_ck đặt lúc ghi như importer.
4. MoveArtifacts sau commit: XML + HTML move sang SCAN_DOC theo cây đã chốt → HĐ tự biến khỏi danh sách, đếm console giảm.
5. TaskStatus NAP_HD upsert + ActivityLog với action **`NAP_HD_TAY`** (phân biệt máy nạp `NAP_HD`).
6. Ghi lần 2 cùng MA_HD → đếm là "Cập nhật" như importer.

## 8. Bảng map nút VFP → web

| Nút VFP | Web v1 | Ghi chú |
|---|---|---|
| Tính lại đơn giá | Tự động theo 5.3 (không cần nút riêng) | |
| Xem ảnh | **Xem ảnh HĐ (HTML)** — đã có | |
| Tìm XML / Tìm PDF | Bỏ (XML đã ở raw\, PDF: 9.x) | |
| Ghi vào Hóa đơn MDN | **Ghi vào Hóa đơn** | qua BR-TAY-05 |
| Đọc lại File | **Đọc lại** (parse lại raw\ + Excel, bỏ mọi sửa tay chưa ghi) | có confirm |
| Đánh dấu Ghi đè | Chưa cần: chế độ đè trắng đã có checkbox XoaTruocKhiGhi ở importer; màn hình này mặc định "cập nhật có chừa" | 9.3 |
| Not USE (bỏ file) | v2 — 9.4 | |
| Chuyển sang HĐ Hủy | v2 — 9.5 | |
| Chuyển Chi phí/thu nhập khác | Sau WP-06 — 9.5 | |
| Lấy mẫu File XML | Bỏ (tiện ích dev) | |

## 9. Câu hỏi mở

- **9.1** Danh sách mã lý do đầy đủ theo log importer thực tế? Đặc biệt: các HĐ Lệch = 0 vẫn nằm lại (ca C26TDH 177–180 trong bài thử) thuộc mã gì — cặp gốc/điều chỉnh?
- **9.2** Danh tính (KHHD, SHD, Ngày) đề nghị **read-only** vì lấy từ XML là đáng tin, sửa danh tính = mầm trùng khóa. Giao diện dev1 hiện đang cho gõ — Hiu chốt khóa lại?
- **9.3** Có cần đường "ghi dù còn lệch, kèm xác nhận + ghi chú lý do" cho ca đặc biệt (HĐ nhà đèn/viễn thông có phí lẻ không cân nổi)? v1 tạm không.
- **9.4** File rác / `PARSE_ERROR`: cần nút "Loại bỏ" (move sang raw\ignore\ để không đếm nữa) như Not USE của VFP? Nếu có, ghi ActivityLog.
- **9.5** Chuyển HĐ Hủy + Chuyển chi phí/thu nhập khác: chốt là v2, đúng không?
- **9.6** RA có phát sinh `NO_EXCEL_ROW` thực tế không (RA chỉ có bộ cột _G)? Nếu không, ẩn hành vi nhập tay master cho hướng RA.
- **9.7** Khối lượng: tray có thể lên bao nhiêu HĐ (trăm? nghìn?) để quyết virtual scroll.

## 10. Ghi chú kỹ thuật frontend

- Màn hình này là màn hình **grid-sửa-tại-chỗ** đầu tiên → áp quy ước mới (đưa vào CLAUDE.md): **antd Table = danh sách hiển thị; AG Grid Community = màn hình sửa kiểu GRID VFP** (điều hướng phím mũi tên, Enter xuống dòng, sửa tại ô, dòng dày đặc). Chi tiết ở trao đổi kèm spec này.
- Hàm Σ dùng chung: backend expose kết quả tính sẵn (Σ line, lệch) — frontend chỉ tính lại tức thời khi người dùng gõ, dùng cùng công thức được tài liệu hóa trong code importer (một chỗ định nghĩa, có BR comment).

## 11. Checklist nghiệm thu (bài thử chuẩn: 17 file HOA_SANG T1)

1. Số HĐ ở màn hình = tổng 2 cột VÀO/RA trên console (cùng bộ lọc).
2. Mỗi dòng hiện đúng mã lý do; ca `NO_EXCEL_ROW` có master money = 0 và sửa được.
3. Sửa Số lượng/Đơn giá/Thành tiền → tính lại đúng 5.3, Σ chân grid nhảy tức thời.
4. Nút Ghi mờ khi lệch > 1đ; bật khi cân.
5. Ghi BÁNH KEM QUẾ WAFFLES (nhập Tiền hàng 1.750.000) → thành công; HĐ biến khỏi danh sách; đếm console giảm 1; file XML+HTML nằm đúng cây SCAN_DOC; HOA_DON + LINE trong DB đúng số; ActivityLog có `NAP_HD_TAY`.
6. Ghi lại HĐ đó lần 2 (chạy lại fetch) → đếm "Cập nhật", cột kế toán không bị đè.
7. Ca `YEAR_MISMATCH`: nút Ghi luôn khóa, có chú thích.
8. "Đọc lại" bỏ sạch sửa tay chưa ghi, có hộp xác nhận.
9. Đổi bộ lọc tháng/hướng trên console → danh sách màn hình đổi theo.
10. Người dùng không admin của tenant thường: màn hình theo đúng gate claim hiện hành (chỉ internal thấy console).
