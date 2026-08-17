# SPEC — BÁO CÁO TỒN KHO (KT2000 Web)

| Mục | Nội dung |
|---|---|
| Mã spec | SPEC-0xx *(Hiu gán số theo dãy hiện có trong docs/)* |
| Phiên bản | 0.1 |
| Ngày | 16/08/2026 |
| Trạng thái | Chờ duyệt |
| Người viết | Hiu (nghiệp vụ) + Claude (chắt lọc từ GetData_TonKho VFP) |
| Dữ liệu chuẩn đối chiếu | BAO_HUNG năm 2023 (form VFP FRM_TON_KHO) |

## Lịch sử sửa đổi

| Phiên bản | Ngày | Nội dung |
|---|---|---|
| 0.1 | 16/08/2026 | Bản đầu, chắt lọc từ VFP GetData_TonKho + các quyết định Q1–Q3 |

## Spec liên quan

- **SPEC Chỉnh kho tự động** *(chưa viết)* — nút "Test" hàng âm + dời ngay_nh hàng loạt. Phần ĐỌC (tìm hàng âm) dùng `GetHangAmAsync` của spec này; phần GHI nằm hoàn toàn trong spec đó.
- **SPEC Engine giá thành** *(WP-06, chưa viết)* — công thức và quy trình tính lại gia_von. Spec này chỉ ĐỌC gia_von và bật/đọc cờ staleness.
- **WP-04 Chuẩn hóa mã hàng** — khối HANG_TTHE trong code VFP cũ thuộc phạm vi WP-04, KHÔNG thuộc spec này.
- **WP-08 Chuyển năm** — nguồn sinh dòng TON_KHO thang=0 (tồn đầu năm).

---

## 1. Mục tiêu & phạm vi

Cung cấp bảng **tổng hợp tồn kho** theo tháng (1–12) hoặc cả năm (tháng 13) cho các TK kho, và **chi tiết phát sinh** của từng mặt hàng khi user drill-down — tương đương grid trên + grid dưới của FRM_TON_KHO.

**Trong phạm vi:** tổng hợp tồn đầu / PS Nợ / PS Có / tồn cuối (số lượng + giá trị) theo (TK kho, mặt hàng); chi tiết phát sinh một mặt hàng; danh sách hàng âm (chỉ ĐỌC); tồn đến một ngày bất kỳ (viên gạch cho tách KM); cột lỗ/lãi; cờ phải-sửa; cờ cần-tính-lại-giá.

**Ngoài phạm vi (đã chủ đích loại khỏi thiết kế, dù VFP làm chung trong một hàm):**
1. Gán/cập nhật QUY_CACH vào DM_HANG → chức năng bảo trì danh mục riêng.
2. Dời ngay_nh / "Chỉnh kho tự động" → spec riêng.
3. Quy đổi mặt hàng, đổi TK kho theo định khoản → module hóa đơn.
4. Chuẩn hóa mã hàng (HANG_TTHE) → WP-04.
5. Tính lại giá thành → SPEC engine giá thành.
6. Mọi dòng tiêu đề nhóm / dòng cộng ("HRCB"/"RB" của VFP) → grid frontend tự render.

---

## 2. Business Rules — tầng PHẢI (vi phạm là trả PR)

**BR-BC-01 — Báo cáo chỉ-đọc tuyệt đối.** Mọi endpoint của spec này là GET; service báo cáo không được chứa SaveChanges/INSERT/UPDATE/DELETE dưới bất kỳ hình thức nào; mọi query đọc dùng AsNoTracking. *(Đối chiếu VFP: hàm cũ có UPDATE DM_HANG.QUY_CACH và EXPORT file — cả hai bị loại.)*

**BR-BC-02 — Kỳ báo cáo theo ngay_nh.** Kỳ = MONTH(ngay_nh) và YEAR(ngay_nh) của HOA_DON. Tháng 13 = cả năm tài chính. Không tồn tại kiểu kỳ "từ ngày… đến ngày…" vắt năm; dữ liệu một DB = một năm.

**BR-BC-03 — Phân loại chuyển động theo tập K, không theo DM_HANG.tk_kho.**
K = tập MA_TK trong DM_TK có cờ ton_kho = true (152, 153, 155, 156, 211…).
Với mỗi dòng HOA_DON_LINE:
- ghi_no ∈ K → một chuyển động **NHẬP** vào kho ghi_no (sl_no = so_luong; gt_no = so_luong × gia_von).
- ghi_co ∈ K → một chuyển động **XUẤT** khỏi kho ghi_co (sl_co = so_luong; gt_co = so_luong × gia_von).
- Cả hai vế ∈ K (chuyển kho nội bộ) → sinh **hai chuyển động** độc lập.
DM_HANG.tk_kho / tk_gv KHÔNG tham gia logic báo cáo; hai field này chỉ còn vai trò **giá trị gợi ý định khoản khi nhập liệu** (user sửa được).

**BR-BC-04 — Tồn đầu kỳ tự tính, không phụ thuộc TON_KHO tháng.**
Tồn đầu tháng N = (dòng TON_KHO thang=0 của năm — sản phẩm chuyển năm, dữ liệu gốc) + lũy kế chuyển động theo BR-BC-03 từ đầu năm đến hết tháng N−1. Các dòng TON_KHO tháng 1–12 không được dùng làm nguồn của báo cáo này.

**BR-BC-05 — Công thức tồn cuối.** SL_TC = SL_TD + SL_NO − SL_CO; GT_TC = GT_TD + GT_NO − GT_CO. Giá trị nhập/xuất lấy theo **gia_von đã ghi trên dòng** — báo cáo phản ánh sổ sách hiện hành, kể cả khi sổ đang chờ tính lại giá (xem BR-BC-11).

**BR-BC-06 — Giá bình quân theo mặt hàng.** Giá bình quân gia quyền tính theo MẶT HÀNG (một giá cho mọi TK), vì cùng một mặt hàng có cùng cặp giá mua + ĐVT. Tồn (SL, GT) vẫn theo dõi theo từng cặp (TK, mặt hàng). Chuyển kho nội bộ dùng chính giá bình quân của mặt hàng. *(Công thức tính lại thuộc SPEC engine giá thành; spec này chỉ ghi để mọi consumer hiểu ngữ nghĩa của gia_von.)*

**BR-BC-07 — Lọc dòng rác tồn đầu.** Loại khỏi tồn đầu các dòng có GT_TD < 0,1 đồng VÀ SL_TD = 0 (kế thừa luật VFP `!(PS_NO_TD < 1/10 AND SL_TD = 0)`).

**BR-BC-08 — Cột lỗ/lãi là cột đọc.** lo_lai của mặt hàng = SUM((don_gia − gia_von) × so_luong) trên các dòng XUẤT có ghi_co = "156" và don_gia > 0 trong kỳ. Chỉ tính và trả về; không ghi vào đâu.

**BR-BC-09 — Server trả dữ liệu sạch.** Response chỉ gồm dòng dữ liệu (mỗi dòng một cặp TK–mặt hàng). Không dòng tiêu đề nhóm, không dòng cộng, không cột định dạng (Col_Format, SO_TRANG, STT_NHOM…). Nhóm theo TK và dòng tổng do AG Grid (KtGrid) render bằng row grouping + aggregation.

**BR-BC-10 — Cờ phải-sửa gộp.** Mặt hàng có ≥ 1 dòng HOA_DON_LINE.phai_sua = true trong kỳ → dòng tổng hợp mang phai_sua = true (frontend tô đỏ như VFP). Bật/tắt cờ trên dòng là POST nhỏ thuộc module hóa đơn, ngoài spec này.

**BR-BC-11 — Cờ cần-tính-lại-giá (staleness).** Mọi endpoint GHI (thuộc các module khác) khi lưu thành công một thay đổi đụng HOA_DON / HOA_DON_LINE có vế thuộc K (sửa số lượng, giá, quy đổi, thay mặt hàng, đổi ngày…) PHẢI bật cờ gia_von_can_tinh_lai của năm. Response tổng hợp của spec này trả kèm cờ; frontend hiện banner "Dữ liệu giá vốn đã thay đổi — tính lại giá & nạp lại". Việc tính lại (và tắt cờ) thuộc SPEC engine giá thành.

**BR-BC-12 — Tenant và năm chỉ từ JWT.** Đơn vị + năm lấy từ claims qua TenantDbResolver. Endpoint không nhận mã đơn vị/năm từ query string hay body.

---

## 3. Viên gạch: TonKhoService

Toàn bộ tính toán tồn kho sống trong một service duy nhất, độc lập controller/màn hình. Mọi chức năng hiện tại và tương lai (báo cáo, HĐ lẻ, tách KM, chỉnh kho, engine giá thành) đều gọi qua đây — **không module nào tự viết lại công thức tồn kho**.

### 3.1 TonKhoQuery (điều kiện lọc dùng chung)

| Field | Kiểu | Ý nghĩa |
|---|---|---|
| Thang | int (1–13) | 13 = cả năm |
| MaHang | List\<string\>? | null/rỗng = toàn bộ; 1 phần tử = một mặt hàng; nhiều = nhóm. Đây là cơ chế "viên gạch" |
| MaTk | List\<string\>? | null = toàn tập K |
| IncludeLoLai | bool | Tính cột lo_lai (BR-BC-08) |
| IncludePhaiSua | bool | Gộp cờ phải-sửa (BR-BC-10) |

Nhu cầu lọc mới sau này = thêm field vào object này, không nối đuôi tham số.

### 3.2 Methods

| Method | Trả về | Ghi chú |
|---|---|---|
| GetTongHopAsync(TonKhoQuery) | List\<TonKhoTongHopRow\> | Bảng tổng hợp (grid trên) |
| GetChiTietAsync(maHang, thang) | List\<TonKhoChiTietRow\> | Drill-down (grid dưới) — thay cursor DbfNhapVao "nằm chờ" của VFP: mỗi click là một query mới, stateless |
| GetTonDenNgayAsync(ngay, maHang?) | List\<TonDenNgayRow\> | SL tồn đến một ngày bất kỳ — viên gạch cho tách KM (nghiệp vụ ldNgayHDKM cũ) |
| GetHangAmAsync(TonKhoQuery?) | List\<HangAmRow\> | Mặt hàng có số dư lũy kế âm giữa chừng + ngày âm đầu tiên + các HĐ liên quan — nguồn dữ liệu cho nút "Test" của SPEC Chỉnh kho tự động |

### 3.3 TonKhoTongHopRow (khớp cột grid trên của FRM_TON_KHO)

| Cột | Nguồn |
|---|---|
| ma_tk | Chuyển động theo BR-BC-03 |
| ma_hang, ten_hang, ma_nh, ten_nh, ma_ngan, quy_cach | DM_HANG / DM_NH (chỉ đọc; quy_cach hiển thị, không cập nhật) |
| sl_td, gt_td | BR-BC-04 |
| sl_no, gt_no, sl_co, gt_co | Chuyển động trong kỳ |
| sl_tc, gt_tc | BR-BC-05 |
| gia_nhap | Đơn giá dòng nhập mua (MA_HD "V…") gần nhất trong kỳ; nếu không nhập trong kỳ: gt_td / sl_td |
| lo_lai | BR-BC-08 (khi IncludeLoLai) |
| phai_sua | BR-BC-10 (khi IncludePhaiSua) |
| ngay_ps | Ngày nhập gần nhất với mặt hàng có nhập nhưng không bán trong kỳ (sl_co = 0) — kế thừa llNgayPS |

### 3.4 TonKhoChiTietRow (khớp grid dưới)

ngay_nh, ten_kh, so_hd (ghép SoHD + số phiếu theo luật VFP: rỗng SoHD → số phiếu; có SoHD → "SoHD (số phiếu)"), ma_hd, sl_no, gt_no, sl_co, gt_co, ghi_no, ghi_co, don_gia, gia_von, dvt, sl_qd, dg_qd, ghi_chu, phai_sua.

---

## 4. Endpoints

| Endpoint | Method | Params | Trả về |
|---|---|---|---|
| /api/bao-cao/ton-kho | GET | thang, includeLoLai, includePhaiSua, maNh? | { rows: TonKhoTongHopRow[], canTinhLaiGia: bool } |
| /api/bao-cao/ton-kho/chi-tiet | GET | maHang, thang | TonKhoChiTietRow[] |
| /api/bao-cao/ton-kho/hang-am | GET | thang? | HangAmRow[] |

Tất cả [Authorize]; lỗi trả ProblemDetails + HTTP status (không trả chuỗi lỗi trong body 200 kiểu lcErrM).

---

## 5. Luồng màn hình (frontend)

1. Mount /app/bao-cao-ton-kho → nạp danh mục (tập K để hiển thị bộ lọc), tháng mặc định = tháng hiện tại.
2. Bấm **Cập nhật** → GET tổng hợp → đổ KtGrid: group theo ma_tk (dòng nhóm "153 — Công cụ dụng cụ"…), aggregation SUM các cột SL/GT làm dòng cộng nhóm + dòng tổng — đúng bố cục VFP nhưng do grid dựng.
3. Click một dòng hàng → panel dưới GET chi-tiet → hiển thị phát sinh.
4. Sort theo lo_lai, filter "hàng bán lỗ/lãi ≥ ngưỡng" (nút 50.000 của VFP), tìm kiếm tên hàng: **hoàn toàn client-side trên grid**, không round-trip.
5. canTinhLaiGia = true → banner + nút "Tính lại giá & nạp lại" (gọi POST của engine giá thành, xong tự re-fetch).
6. Hành động ghi (đổi ngày, quy đổi, đánh dấu phải sửa…) mở từ context menu dòng → gọi POST của module tương ứng → thành công thì re-fetch. Màn hình này không bao giờ tự ghi.

---

## 6. Gợi ý triển khai — tầng GỢI Ý (không bắt buộc; dev được làm khác nếu đạt mục 7)

- **Chuyển động kho bằng UNION ALL** thay mẹo zero-một-vế của VFP:
  nhánh 1 `SELECT ghi_no AS ma_tk, ma_hang, so_luong AS sl_no, 0 AS sl_co, so_luong*gia_von AS gt_no, 0 AS gt_co … WHERE ghi_no IN K`; nhánh 2 đối xứng cho ghi_co; GROUP BY (ma_tk, ma_hang). Dòng hai vế đều thuộc K tự nhiên sinh 2 chuyển động (BR-BC-03).
- **Tồn đầu + phát sinh trong một lượt:** SUM có điều kiện theo tháng (CASE WHEN MONTH(ngay_nh) < N THEN … / = N THEN …) trên cùng tập chuyển động — một lần quét bảng cho cả tồn đầu lẫn PS trong kỳ.
- **Hàng âm / tồn đến ngày:** window function `SUM(sl_no − sl_co) OVER (PARTITION BY ma_hang ORDER BY ngay_nh, thứ_tự_ưu_tiên)` — thay trọn vòng SCAN Temp79/Temp791 (VFP xếp phiếu "R" sau trong cùng ngày; giữ luật xếp này).
- **Index đề xuất** (kèm script trong PR): HOA_DON_LINE(ghi_no), HOA_DON_LINE(ghi_co), HOA_DON_LINE(ma_hang), HOA_DON(ngay_nh).
- **Ba trạm theo luật 9–11:** trạm 1 IQueryable (mọi Where/GroupBy/Sum trước ToList — thấy `ToList().Where(…)` hoặc foreach gọi DB là N+1 tái sinh), trạm 2 Select new sang Row DTO, trạm 3 serialize. Mỗi trạm một kiểu, biến đặt tên theo trạm.
- **Tri thức nguồn dữ liệu** (giữ lại vì dev không tự đoán được): IN_VALUE_LINE là bản gốc từ hóa đơn điện tử đã nạp, HOA_DON/HOA_DON_LINE là bản user đã hạch toán — các chức năng kiểm tra "user hạch toán sai giá trị" (spec sau) so hai nguồn này với nhau, KHÔNG lấy IN_VALUE_LINE làm nguồn tồn kho.

---

## 7. Nghiệm thu (trọng tài cuối cùng)

- **A1 — Đối chiếu BAO_HUNG 2023:** chạy từng tháng 1–12 và tháng 13, so từng mặt hàng đủ 8 cột SL_TD/GT_TD/SL_NO/GT_NO/SL_CO/GT_CO/SL_TC/GT_TC với form VFP. Lệch **chỉ được phép** ở các dòng "mồ côi" của VFP (vế thuộc K nhưng khác tk_kho đăng ký — bản mới đếm đúng, bản cũ bỏ rơi) và mỗi dòng lệch phải có giải trình.
- **A2 — Tổng grid** = dòng "Tổng tất cả" của VFP sau khi loại trừ các dòng đã giải trình ở A1.
- **A3 — Chi tiết mặt hàng** khớp grid dưới của VFP (thử tối thiểu 5 mặt hàng, gồm 1 mặt hàng có phiếu "R" trả lại).
- **A4 — Hiệu năng:** tổng hợp cả năm (tháng 13) ≤ 2 giây, chi tiết ≤ 0,5 giây trên dữ liệu BAO_HUNG 2023 *(ngưỡng chốt lại sau lần đo đầu)*.
- **A5 — Stateless:** restart backend giữa phiên, bấm Cập nhật lại → kết quả bình thường, không mất gì.
- **A6 — Cách ly tenant:** hai token của hai đơn vị gọi đồng thời → không lẫn một dòng dữ liệu nào.
- **A7 — Chỉ-đọc:** grep module báo cáo không có SaveChanges/Insert/Update/Delete; mọi query có AsNoTracking.
- **A8 — Viên gạch:** GetTongHopAsync với MaHang = ["<một mã>"] trả đúng tập con của kết quả toàn kỳ.
