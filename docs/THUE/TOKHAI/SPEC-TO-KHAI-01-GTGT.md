# SPEC — LẬP TỜ KHAI THUẾ GTGT (Mẫu 01/GTGT, TT80) VÀ XUẤT XML

> Trạng thái: **BẢN THẢO — chờ Leader duyệt**
> Người viết: Claude · Ngày: 13/08/2026
> Đơn vị tham chiếu: **NHAT_TUAN** (MST 0101415995), kỳ **tháng 7/2026**
> Nguồn đối chiếu: `\\SERVER-TEST\data_hddt\NHAT_TUAN\TO_KHAI_GOC\TKG_T1..T6_2026`

---

## 1. Mục tiêu

Từ dữ liệu đã có trong sổ (`HOA_DON`, `HOA_DON_LINE`) cộng với thư mục XML/HTML vật lý,
lập ra **tờ khai 01/GTGT tháng 7/2026** đúng chuẩn HTKK, cho **xem trước trên web**,
rồi mới xuất **XML** (và **PDF**) khi kế toán đã duyệt.

Ba điều kiện Trường đặt ra (13/08), spec này hiện thực cả ba:

| # | Điều kiện | Hiện thực ở mục |
|---|---|---|
| 1 | Thư mục XML, HTML và DB phải khớp nhau: tiền VAT, `tien_vat_l`, %VAT không được sai | §4 Đối chiếu ba nguồn |
| 2 | Tờ khai phải chuẩn và khớp kỳ trước, để kỳ sau không lệch | §5 Ràng buộc liên kỳ |
| 3 | Mỗi nhà có XML tờ khai riêng (dùng tờ khai kỳ trước hoặc tờ khai mẫu) | §6 Khuôn tờ khai theo đơn vị |

---

## 2. Phát hiện quan trọng khi khảo sát dữ liệu thật

### 2.1. Quy tắc VAT khi có chiết khấu — ĐÃ XÁC ĐỊNH, không còn là câu hỏi mở

Khảo sát `NHAT_TUAN_2026`, kỳ tháng 7, hướng VÀO (79 hóa đơn):

| Nhóm | Số HĐ | Số HĐ có chiết khấu | Tổng chiết khấu |
|---|---|---|---|
| VAT header **khớp** Σ`tien_vat_l` | 37 | **0** | 0 |
| VAT header **lệch** Σ`tien_vat_l` | 42 | **42** | 198.818.638 |

Tổng lệch toàn kỳ: **−31.990.665 đ** (header 298.065.311 vs dòng 330.055.976).

Kiểm chứng công thức trên 10 hóa đơn lệch lớn nhất — khớp **tới từng đồng**:

```
VAT_đúng = ROUND( (Σ(so_luong × don_gia) − tien_ck) × vat / 100 , 0 )
```

Ví dụ `VAO_2300235006_C26TCA_0008400`:
`(70.944.368 − 66.442.293) × 8% = 360.166` ≈ header **360.165** ✔
(còn Σ`tien_vat_l` = 10.990.933 — sai vì tính trên giá **chưa trừ** chiết khấu)

> **BR-TK-01 — Nguồn VAT chuẩn.** Khi hóa đơn có `tien_ck ≠ 0`, VAT đúng là
> **`HOA_DON.tien_vat` (header)**, KHÔNG phải Σ`HOA_DON_LINE.tien_vat_l`.
> `tien_vat_l` tính trên giá gốc chưa trừ chiết khấu nên luôn cao hơn thực tế.
> Mọi chỉ tiêu tiền thuế của tờ khai (ct24, ct28, ct31, ct33, ct35) lấy từ **header**.
> Dòng chỉ dùng để **phân bổ theo thuế suất**, không dùng để cộng ra tổng thuế.

**Hệ quả bắt buộc:** khi phân bổ doanh thu theo thuế suất (ct30/32/32a), phải phân bổ
chiết khấu theo tỷ trọng từng nhóm thuế suất, rồi mới nhân thuế suất — không được cộng
thẳng `tien_vat_l`. Xem §3.3.

### 2.1b. BR-TK-05 — Chiết khấu nằm NGAY TRONG dòng hàng (bổ sung 13/08)

Khi chạy engine lần đầu, BR-TK-03 báo lệch **15.995.333 đ** ở mua vào. Truy nguyên:

Hóa đơn `VAO_2300235006_C26TCA_0008400` có 10 dòng:

| Dòng | Nội dung | tinh_chat | Tiền |
|---|---|---|---|
| 1–3 | Hàng thật (mì, phở Cung Đình) | `1` | 70.944.368 |
| 4–10 | "Chiết khấu bán ra", "Chiết khấu 3%"… (mã `TPCK.*`) | **`3`** | **66.442.293** |

Tổng dòng chiết khấu **đúng bằng** `h.tien_ck` của header.

> **BR-TK-05.** `Σ(so_luong × don_gia)` ĐÃ chứa sẵn các dòng chiết khấu. Trừ thêm
> `h.tien_ck` là **trừ hai lần**. Phải lọc `tinh_chat = '3'` ra khỏi tiền hàng trước,
> rồi mới trừ `tien_ck` một lần duy nhất.

Kiểm chứng trên NHAT_TUAN T7 sau khi sửa:

| Hướng | VAT header | VAT tính lại | Lệch |
|---|---|---|---|
| Bán ra | 242.331.533 | 242.331.533 | **0 đ** |
| Mua vào | 298.065.311 | 298.065.314 | **3 đ** (làm tròn) |

Phân bố `tinh_chat` của T7: `1` = hàng thật, `2` = hàng khuyến mại (tiền 0),
`3` = chiết khấu, `4` = khác. Chỉ loại nhóm `3`.

### 2.2. Quy tắc liên kỳ — đã kiểm chứng qua 6 tháng

Đọc 6 XML tờ khai gốc T1–T6/2026:

| Kỳ | ct22 (khấu trừ kỳ trước chuyển sang) | ct43 (còn khấu trừ chuyển kỳ sau) |
|---|---|---|
| T1 | 1.537.571.021 | 1.866.212.230 |
| T2 | 1.866.212.230 | 1.907.189.809 |
| T3 | 1.907.189.809 | 1.913.588.829 |
| T4 | 1.913.588.829 | 1.935.569.704 |
| T5 | 1.935.569.704 | 1.925.518.780 |
| T6 | **1.925.518.780** | **1.986.635.640** |

Khớp tuyệt đối: **ct22(N) = ct43(N−1)** ở cả 5 cặp liên tiếp.

> **BR-TK-02 — Nối kỳ.** `ct22` của kỳ đang lập **PHẢI** bằng `ct43` của kỳ liền trước,
> đọc từ XML tờ khai gốc của kỳ đó. Không tự nhập tay, không suy đoán.
> ⇒ **Tờ khai T7/2026 của NHAT_TUAN bắt buộc có `ct22 = 1.986.635.640`.**
> Thiếu XML kỳ trước ⇒ **CHẶN**, không cho lập tờ khai (xem §5.2).

### 2.3. Dữ liệu T7 đã sẵn sàng

`NHAT_TUAN_2026`, `thang = 7`: **350 HĐ ra**, **79 HĐ vào**.

Phân bổ theo thuế suất trên dòng:

| Hướng | %VAT | Số dòng | Tiền hàng |
|---|---|---|---|
| RA | 8 | 1.521 | 3.010.377.999 |
| RA | 10 | 4 | 15.024.000 |
| VÀO | 0 | 52 | 12.052.310 |
| VÀO | 8 | 204 | 3.550.541.843 |
| VÀO | 10 | 18 | 301.079.455 |

Đủ dữ liệu để dựng cả tờ khai chính lẫn phụ lục NQ142.

---

## 3. Ánh xạ chỉ tiêu → nguồn dữ liệu

Cấu trúc XML lấy từ mẫu thật `0101415995000-01_GTGT_TT80-M062026-L00.xml`
(HTKK 5.7.1, `pbanTKhaiXML` 2.8.3, `maTKhai` 842).

### 3.1. Khối `TTinChung` — thông tin đơn vị và kỳ

| Nút XML | Nguồn |
|---|---|
| `maTKhai`, `tenTKhai`, `moTaBMau`, `pbanTKhaiXML` | Sao **nguyên văn** từ khuôn kỳ trước |
| `kyKKhai` | `MM/yyyy` của kỳ đang lập |
| `kyKKhaiTuNgay` / `DenNgay` | Ngày đầu / cuối tháng |
| `ngayLapTKhai`, `ngayKy` | Ngày bấm xuất (định dạng `yyyy-MM-dd`) |
| `mst`, `tenNNT`, `dchiNNT`, `maTinhNNT`, `tenTinhNNT`, `maCQTNoiNop`, `tenCQTNoiNop` | Sao từ khuôn kỳ trước (xem §6) |
| `loaiTKhai` = `C`, `soLan` = `0` | Tờ khai chính thức lần đầu |

### 3.2. Chỉ tiêu mua vào

| CT | Ý nghĩa | Công thức |
|---|---|---|
| `ct23` | Giá trị HHDV mua vào | Σ(`so_luong`×`don_gia`) − Σ`tien_ck`, hướng VÀO, kỳ N |
| `ct24` | Thuế GTGT mua vào | **Σ`HOA_DON.tien_vat`** hướng VÀO (BR-TK-01) |
| `ct23a`/`ct24a` | Hàng nhập khẩu | 0 nếu không có (NHAT_TUAN T1–T6 đều 0) |
| `ct25` | Thuế GTGT được khấu trừ | = `ct24` khi khấu trừ toàn bộ |
| `ct22` | Khấu trừ kỳ trước chuyển sang | **`ct43` kỳ N−1** (BR-TK-02) |

### 3.3. Chỉ tiêu bán ra — phân bổ theo thuế suất

Bước phân bổ (BR-TK-03):

1. Gom dòng hướng RA theo `pt_vat` → tiền hàng gộp mỗi nhóm.
2. Phân bổ `tien_ck` của từng hóa đơn về các nhóm **theo tỷ trọng tiền hàng**.
3. Doanh thu nhóm = tiền hàng − chiết khấu phân bổ.
4. Thuế nhóm = doanh thu nhóm × thuế suất, **làm tròn 0 chữ số**.
5. **Chốt lại:** Σ thuế các nhóm phải bằng Σ`HOA_DON.tien_vat` hướng RA.
   Lệch do làm tròn (< 5 đ/HĐ) ⇒ dồn phần lệch vào nhóm có doanh thu lớn nhất.
   Lệch lớn hơn ⇒ **báo lỗi, không xuất tờ khai**.

| CT | Ý nghĩa | Nguồn |
|---|---|---|
| `ct27`/`ct28` | HHDV bán ra chịu thuế | Tổng doanh thu / thuế các nhóm chịu thuế |
| `ct29` | Bán ra không chịu thuế | Nhóm `pt_vat` NULL / KCT (xem §7) |
| `ct30`/`ct31` | Thuế suất 5% | Nhóm `pt_vat = 5` |
| `ct32`/`ct33` | Thuế suất 10% | **Nhóm 10% + nhóm 8% được giảm** (xem ghi chú) |
| `ct32a` | Không phải kê khai nộp thuế | Theo phân loại |
| `ct34`/`ct35` | Tổng bán ra | `ct29 + ct30 + ct32` / `ct31 + ct33` |

> **Ghi chú then chốt về nhóm 8%:** đọc XML T6 gốc — `ct32 = 3.002.937.025` và
> `ct33 = 240.298.016`, tỷ lệ đúng **8%**, nhưng nút lại là `HHDVBRaChiuTSuat10`.
> Nghĩa là hàng giảm thuế theo NQ142 **vẫn khai ở dòng thuế suất 10%**, phần được
> giảm 2% thể hiện riêng ở **phụ lục PL_NQ142_GTGT**. Không tách thành dòng 8% riêng.

### 3.4. Chỉ tiêu kết quả

| CT | Công thức |
|---|---|
| `ct36` | `ct35 − ct25` (âm = còn được khấu trừ) |
| `ct40` | Thuế phải nộp trong kỳ; `ct36 < 0` ⇒ 0 |
| `ct41` | Còn được khấu trừ = `|ct36| + ct22` khi `ct36 < 0` |
| `ct42` | Đề nghị hoàn (mặc định 0) |
| `ct43` | `ct41 − ct42` ⇒ **thành `ct22` của kỳ sau** |

Kiểm chứng bằng T6 thật:
`ct41 = 1.986.635.640`, `ct22 = 1.925.518.780`, `ct36 = −61.116.860`
→ `1.925.518.780 + 61.116.860 = 1.986.635.640` ✔ khớp.

### 3.5. Phụ lục `PL_NQ142_GTGT` — bảng kê giảm thuế

| Nút | Nguồn |
|---|---|
| `giaTriHHDVMuaVao` / `thueGTGTHHDV` | Mua vào thuộc nhóm được giảm |
| `giaTriHHDV` | Doanh thu bán ra nhóm được giảm |
| `thueSuatTheoQuyDinh` = 10, `thueSuatSauGiam` = 8 | Cố định theo NQ142 |
| `thueGTGTDuocGiam` | `giaTriHHDV × 2%` |
| `ChenhLech/ct9` | Chênh lệch mua vào − bán ra của nhóm giảm |

> **BR-TK-04 — Khớp phụ lục với tờ khai chính.** `tongCongGiaTriHHDV` của phụ lục
> phải **≤** `ct32`. `thueGTGTDuocGiam` phải đúng bằng 2% doanh thu nhóm giảm.
> Sai ⇒ chặn xuất.

---

## 4. Đối chiếu ba nguồn (điều kiện 1)

Trước khi lập tờ khai, chạy đối chiếu **DB ↔ XML ↔ HTML**. Tái dùng `RaSoatService`,
bổ sung ba phép kiểm mới:

| Mã | Phép kiểm | Ngưỡng | Mức |
|---|---|---|---|
| `KT-01` | Số hóa đơn: DB vs số file XML trong thư mục kỳ | lệch bất kỳ | **CHẶN** |
| `KT-02` | Từng HĐ: `tien_vat` (DB) vs `TgTThue` (XML) | > 1 đ | **CHẶN** |
| `KT-03` | Từng HĐ: tiền hàng DB vs `TgTCThue` (XML) | > 1 đ | **CHẶN** |
| `KT-04` | Từng HĐ: `HOA_DON.vat` vs thuế suất trong XML | khác nhau | **CHẶN** |
| `KT-05` | Từng HĐ: `tien_vat` header vs Σ`tien_vat_l` | > 1 đ **và** `tien_ck = 0` | **CHẶN** |
| `KT-06` | Như KT-05 nhưng `tien_ck ≠ 0` | — | **BỎ QUA** (đúng theo BR-TK-01) |
| `KT-07` | Có file HTML kèm mỗi XML | thiếu | Cảnh báo |

KT-05 và KT-06 tách đôi là điểm mấu chốt: gộp lại thì 42 hóa đơn chiết khấu của T7 đều
báo lỗi giả, mà chúng hoàn toàn hợp lệ.

---

## 5. Ràng buộc liên kỳ (điều kiện 2)

### 5.1. Kiểm trước khi xuất

| Mã | Phép kiểm | Mức |
|---|---|---|
| `LK-01` | `ct22` kỳ N = `ct43` kỳ N−1 | **CHẶN** |
| `LK-02` | Có XML tờ khai kỳ N−1 trong `TO_KHAI_GOC` | **CHẶN** |
| `LK-03` | Kỳ N chưa có tờ khai (tránh lập đè) | Cảnh báo |
| `LK-04` | `ct43 = ct41 − ct42` | **CHẶN** |
| `LK-05` | `ct34 = ct29 + ct30 + ct32`, `ct35 = ct31 + ct33` | **CHẶN** |

### 5.2. Khi thiếu tờ khai kỳ trước

Không được đoán `ct22`. Hiện hộp thoại yêu cầu **một trong hai**: chỉ đường dẫn XML kỳ
trước, hoặc nhập tay `ct22` kèm lý do (ghi vào `ActivityLog` theo luật 7).

---

## 6. Khuôn tờ khai theo đơn vị (điều kiện 3)

Tờ khai **ăn theo kho `SCAN_DOC`** sẵn có, nằm trong thư mục của NĂM tài chính
(chốt với Trường 13/08):

```
<Paths:ScanDocRoot>\<MA_DONVI>\NAM<năm>\TO_KHAI\TO_KHAI_GOC\TKG_T<tháng>_<năm>\
    <MST>000-01_GTGT_TT80-M<MM><yyyy>-L00.xml     ← tờ khai
    HD_RA_<MA_DONVI>_T<n>.xlsx                     ← bảng kê ra
    HD_VAO_<MA_DONVI>_T<n>.xlsx                    ← bảng kê vào
    Bang_Ke_01_GiamThue_GTGT_NQ142_GTGT_TT80.xls   ← bảng kê giảm thuế (nếu có)
```

Ví dụ: `...\NHAT_TUAN\NAM2026\TO_KHAI\TO_KHAI_GOC\TKG_T6_2026\`

Nằm **trong** `NAM<năm>` chứ không để phẳng ở gốc đơn vị: tờ khai là hồ sơ của một năm
tài chính, gom cùng chỗ với dữ liệu năm đó thì sang năm mới chỉ thêm một thư mục, không
trộn tờ khai nhiều năm vào một rổ.

⇒ Kỳ **tháng 1** phải tra tờ khai tháng 12 của `NAM<năm−1>` — tìm theo năm của kỳ cần
lấy, không dùng năm làm việc hiện tại.

> Thư mục `\\SERVER-TEST\data_hddt\NHAT_TUAN\TO_KHAI_GOC` chỉ là **bản copy tham khảo**
> Trường gửi để khảo sát mẫu XML, không phải vị trí lưu chính thức.

**Quy tắc tên file XML** (suy từ 6 mẫu thật):

```
{MST}000-01_GTGT_TT80-M{MM}{yyyy}-L{lần}.xml
```
Ví dụ T7/2026 của NHAT_TUAN: `0101415995000-01_GTGT_TT80-M072026-L00.xml`

**Thứ tự chọn khuôn:** tờ khai kỳ N−1 → kỳ gần nhất có sẵn → tờ khai mẫu dùng chung.
Khuôn chỉ cấp phần **thông tin đơn vị** (`NNT`, `maCQTNoiNop`, `TTinDVu`); mọi chỉ tiêu
tiền đều tính lại từ sổ, **không kế thừa**.

---

## 7. Điểm cần chốt trước khi code

1. **`loai_thue` chưa có trong DB nào** (đã kiểm 22 database — đều thiếu cột).
   Script `database/017_hoa_don_line_loai_thue.sql` có trong repo nhưng chưa chạy.
   Thiếu nó thì **KCT (không chịu thuế) và 0% lẫn vào nhau**, mà `ct29` cần phân biệt
   đúng hai loại này. ⇒ **Phải chạy 017 trước khi lập tờ khai.**
   (T7 VÀO có 52 dòng `pt_vat = 0` — chưa rõ bao nhiêu là KCT.)

2. **`ct32a`, `ct29`** — cần Trường xác nhận cách phân loại hàng "không phải kê khai
   nộp thuế" trong dữ liệu KT2000. T1–T6 đều bằng 0 nên chưa có mẫu để suy.

3. **`tieuMucHachToan` = 1701, `maCQTNoiNop` = 10101** — lấy từ khuôn, xác nhận là
   cố định theo đơn vị chứ không đổi theo kỳ.

---

## 8. Kế hoạch thực hiện

| GĐ | Nội dung | Kết quả kiểm chứng |
|---|---|---|
| 1 | Chạy script 017 cho các DB đang dùng | `loai_thue` có mặt, KCT tách khỏi 0% |
| 2 | `ToKhaiService`: engine tính ct21–ct43 + phụ lục | Dựng lại **T6 từ sổ**, khớp 100% XML gốc |
| 3 | Đối chiếu ba nguồn (§4) | 42 HĐ chiết khấu T7 **không** báo lỗi giả |
| 4 | Màn xem trước trên web | Hiện đủ chỉ tiêu + phụ lục + danh sách cảnh báo |
| 5 | Xuất XML | HTKK 5.7.1 nạp được, không báo lỗi cấu trúc |
| 6 | Xuất PDF | In đúng khuôn 01/GTGT |

**GĐ 2 là phép thử quyết định:** engine phải dựng lại được T6 từ sổ và cho ra **đúng
từng con số** trong XML gốc T6. Chưa đạt thì không được phép lập T7.

---

## 9. Ràng buộc kỹ thuật (theo CLAUDE.md)

- Luật 1: mọi truy cập DB qua `TenantDbResolver`.
- Luật 3: SQL tham số hóa 100%.
- Luật 4: đường dẫn `TO_KHAI_GOC` khai trong appsettings (`Paths:ToKhaiRoot`), không cứng trong code.
- Luật 6: script 017 đã có sẵn, không sửa; cần script mới thì đánh số tiếp.
- Luật 7: mỗi lần xuất tờ khai ghi `TaskStatus` + `ActivityLog`.
- Luật 8: comment mã `BR-TK-xx` tại chỗ hiện thực.
- **Engine CHỈ ĐỌC sổ** — không ghi ngược vào `HOA_DON`/`HOA_DON_LINE`.

---

## 10. BR-TK-06 — XỬ LÝ HÓA ĐƠN THAY THẾ / ĐIỀU CHỈNH (nút "Xử lý HĐ TT-ĐC-XB")

> Trạng thái: **ĐANG SOẠN** — phần quy định pháp luật chờ bổ sung trích dẫn.
> Phần khảo sát dữ liệu và luồng thao tác dưới đây đã đo trên sổ thật 15/08/2026.

### 10.1. Vì sao cần — lỗi ĐANG TỒN TẠI, đo trên sổ thật

Khảo sát `NHAT_TUAN_2026`, kỳ tháng 7:

| Chỉ số | Giá trị |
|---|---|
| Tổng hóa đơn T7 | 429 (350 RA + 79 VÀO) |
| Có đánh dấu liên quan (`tich_chat_hd_lienquan <> ''`) | **4** |
| Trong đó thay thế **cùng tháng** | 3 |
| Thay thế **khác tháng** (gốc 25/06) | 1 |

Ba hóa đơn gốc bị thay thế **vẫn nằm trong sổ với VAT dương**, trong khi hóa đơn thay
thế cũng có VAT dương:

| HĐ gốc | Ngày | VAT | Trạng thái ghi trong sổ | HĐ thay thế |
|---|---|---|---|---|
| 0001176 | 08/07 | 1.977.991 | Hóa đơn đã bị thay thế | 0001177 |
| 0001211 | 10/07 | 53.334 | Hóa đơn đã bị thay thế | 0001212 |
| 0001391 | 24/07 | 49.333 | Hóa đơn đã bị thay thế | 0001392 |
| **Cộng** | | **2.080.658** | | |

⇒ **2.080.658 đ VAT đang bị tính HAI LẦN** trên tổng VAT bán ra T7 là 242.331.533 đ.
Tờ khai lập từ sổ hiện tại sẽ khai THỪA đúng số đó.

Trường hợp khác tháng:

| HĐ thay thế | Ngày | HĐ gốc | Ngày gốc | Gốc có trong sổ? |
|---|---|---|---|---|
| 0001136 | 03/07 | 0001052 | 25/06 | **KHÔNG** — sổ chưa có dữ liệu T6 |

### 10.2. Nguồn dữ liệu sẵn có trong sổ

Bảng `HOA_DON` đã có đủ trường để nhận diện, **không cần thêm cột**:

| Cột | Nghĩa | Giá trị đo được |
|---|---|---|
| `tich_chat_hd_lienquan` | Tính chất HĐ liên quan | `'1'` (4 dòng) / rỗng (425 dòng) |
| `loai_hd_lienquan` | Loại HĐ liên quan | `'1'` |
| `mau_so_hd_lienquan` | Mẫu số HĐ gốc | `'1'` |
| `khhd_lienquan` | Ký hiệu HĐ gốc | `C26TNT` |
| `sohd_lienquan` | Số HĐ gốc | `0001052`… |
| `ngay_lienquan` | **Ngày HĐ gốc** — dùng để biết CÙNG hay KHÁC kỳ | `25/06/2026`… |
| `tthai_hd` | Trạng thái do cổng TCT ghi | `Hóa đơn thay thế` / `Hóa đơn đã bị thay thế` |

`HOA_DON` có sẵn cột **`ghi_chu` NVARCHAR(1000)** — đây là chỗ ghi vết (đo 15/08: cả
4 hóa đơn liên quan của T7 đều đang để trống).

> Ghi ở tầng **HÓA ĐƠN**, KHÔNG ghi xuống `HOA_DON_LINE`: thay thế/điều chỉnh là quan
> hệ giữa hai HÓA ĐƠN với nhau, không phải thuộc tính của từng dòng hàng. Ghi xuống
> dòng thì một hóa đơn 10 dòng có 10 bản chú thích giống hệt nhau, mà tra cứu lại phải
> gom ngược lên.

> **CẦN CHỐT:** ý nghĩa chính xác của `tich_chat_hd_lienquan` = `'1'`. Dữ liệu hiện có
> **chỉ chứa hóa đơn THAY THẾ**, chưa gặp hóa đơn ĐIỀU CHỈNH nào, nên chưa suy được mã
> nào ứng với điều chỉnh. **Không đoán** — phải xem một hóa đơn điều chỉnh thật rồi mới
> viết luật phân loại.

### 10.3. Phân biệt bản chất (theo yêu cầu nghiệp vụ)

| | THAY THẾ | ĐIỀU CHỈNH |
|---|---|---|
| Hóa đơn gốc | **Bị hủy / hết hiệu lực** | **Còn hiệu lực** |
| Căn cứ kê khai | Lấy **hóa đơn mới**, bỏ hóa đơn cũ | **Cộng dồn**: gốc + phần điều chỉnh |
| Xử lý trong sổ | Loại HĐ gốc khỏi tổng của kỳ | Giữ cả hai, đưa phần chênh về HĐ gốc |

### 10.4. Luồng thao tác nút "Xử lý HĐ TT-ĐC-XB"

**Bấm lần 1 — TỰ TÍCH CHỌN (chưa ghi gì vào sổ):**

Nếu chưa tích, hoặc tích thiếu, thì tự tích cột **In** cho MỌI hóa đơn của kỳ có
`tich_chat_hd_lienquan <> ''` — cả hóa đơn thay thế/điều chỉnh **và** hóa đơn gốc bị
nó trỏ tới (tìm theo `khhd_lienquan` + `sohd_lienquan`).

Bấm lần 1 **không được ghi gì** — đây là bước cho kế toán nhìn thấy phạm vi ảnh hưởng
trước khi quyết định.

**Bấm lần 2 — XỬ LÝ (có ghi vào sổ):**

Chia hai trường hợp theo `ngay_lienquan` so với kỳ đang xử lý.

---

#### Trường hợp 1 — Gốc và thay thế/điều chỉnh CÙNG kỳ

*THAY THẾ:*
- Hóa đơn gốc: đánh dấu **không tính vào tờ khai** (loại khỏi tổng của kỳ)
- Hóa đơn thay thế: giữ nguyên, là căn cứ kê khai duy nhất
- Ghi `HOA_DON.ghi_chu` của HĐ gốc: `Đã bị thay thế bởi <khhd>/<số> ngày <dd/MM/yyyy>`

*ĐIỀU CHỈNH:*
- Dòng điều chỉnh **đưa về hóa đơn bị điều chỉnh** (HĐ gốc)
- Ghi `HOA_DON.ghi_chu` của HĐ gốc: `Hóa đơn đã điều chỉnh`
- Cả hai hóa đơn cùng vào tờ khai, tổng = gốc + phần điều chỉnh

> **ĐÃ CHỐT 15/08 — phương án 2: ENGINE TỰ SUY LÚC TÍNH, KHÔNG GHI VÀO SỔ.**
>
> Tờ khai tự bỏ hóa đơn gốc khi phát hiện có hóa đơn thay thế cùng kỳ trỏ tới nó. Sổ
> **giữ nguyên 100% số liệu gốc** — không thêm cột, không sửa tiền, không xóa dòng.
>
> Vì sao chọn cách này:
> * Đúng luật hiện hành: từ NĐ 70/2025 hóa đơn bị thay thế **không bị hủy**, vẫn tồn
>   tại trong hệ thống. Xóa hay sửa tiền về 0 là làm sai bản chất.
> * Giữ được luật "engine CHỈ ĐỌC sổ" của repo — không có rủi ro ghi hỏng.
> * Hoàn nguyên được: tính sai thì sửa công thức rồi chạy lại, dữ liệu gốc còn nguyên.
>
> Đánh đổi chấp nhận: trên lưới hóa đơn, HĐ gốc vẫn hiện VAT dương như cũ. Bù lại bằng
> **ghi chú ở `HOA_DON.ghi_chu`** (mục dưới) để kế toán nhìn ra.

---

#### Trường hợp 2 — Gốc và thay thế/điều chỉnh KHÁC kỳ

Đây là trường hợp **chưa xử lý tự động được**, vì sổ của kỳ chứa hóa đơn gốc có thể
chưa được nạp (đo thật: HĐ 0001052 ngày 25/06 không có trong sổ).

Yêu cầu: **ghi chú đầy đủ để sau này truy lại**, khi đã đủ dữ liệu thì kê khai lại kỳ
bị ảnh hưởng.

Ghi vào `HOA_DON.ghi_chu` của hóa đơn thay thế/điều chỉnh, **đủ 4 thông tin**:

```
<Thay thế|Điều chỉnh> cho HĐ <khhd_lienquan>/<sohd_lienquan> ngày <dd/MM/yyyy>
— khác kỳ (gốc thuộc kỳ <MM/yyyy>, xử lý tại kỳ <MM/yyyy>)
— <Chưa kê khai lại|Đã xử lý khác tháng>
```

Bốn thông tin **bắt buộc** (để tìm lại được):
1. Loại xử lý: thay thế hay điều chỉnh
2. Trỏ tới hóa đơn nào: ký hiệu + số
3. Ngày hóa đơn gốc → suy ra kỳ bị ảnh hưởng
4. Trạng thái xử lý: đã kê khai lại chưa

> **ĐÃ CHỐT 15/08 — KHÔNG xử lý lại kỳ cũ.**
>
> Engine điều chỉnh số liệu của kỳ HIỆN TẠI theo hóa đơn thay thế/điều chỉnh, để tờ
> khai kỳ này khớp số. Kỳ gốc để nguyên, **không tự động khai bổ sung**.
>
> Ghi chú lại đầy đủ (mẫu dưới) để kế toán **tự kiểm tra và cập nhật thủ công** khi
> đã có dữ liệu kỳ gốc. Lý do không tự động: kỳ gốc có thể đã nộp rồi, sửa tự động là
> đụng vào tờ khai đã nộp — việc đó phải do người quyết định, không phải máy.

### 10.5. Căn cứ pháp lý — ĐANG ÁP DỤNG THÔNG TƯ 80/2021

**CHỐT 15/08/2026 (anh Hiu):** kê khai kỳ T7/2026 **vẫn áp dụng TT 80/2021/TT-BTC**.
Thông tư 91/2026 tuy đã ban hành nhưng cơ quan thuế **chưa có thông báo bắt buộc áp
dụng**, nên hệ thống giữ nguyên khung cũ.

> **SẮP TỚI SẼ CHUYỂN SANG TT 91** (anh Hiu, 15/08) — làm sau, không phải bây giờ.
> Khi chuyển, chỗ phải sửa nằm ở §10.4: trục phân loại đổi từ *cùng kỳ / khác kỳ*
> sang *nguyên nhân lập hóa đơn*. Đọc kỹ bảng khác biệt bên dưới trước khi sửa.

Tra cứu 15/08/2026 cho thấy khung pháp lý ĐÃ có văn bản thay thế — ghi lại ở đây để
khi nào cơ quan thuế yêu cầu thì biết phải sửa gì, **KHÔNG áp dụng lúc này**:

| Văn bản đang dùng | Văn bản thay thế (chưa áp dụng) |
|---|---|
| NĐ 123/2020 + NĐ 70/2025 | NĐ 254/2026/NĐ-CP |
| TT 80/2021 Điều 47 | TT 91/2026/TT-BTC Điều 10 |
| Luật QLT 38/2019 Điều 47 | Luật QLT 108/2025 Điều 12 |

**Khác biệt cốt lõi nếu sau này phải chuyển:** TT 91/2026 không chia theo *cùng kỳ /
khác kỳ* mà chia theo **nguyên nhân lập hóa đơn** — do sự kiện phát sinh sau (chiết
khấu, trả hàng…) thì kê kỳ hiện tại; do sai sót thì khai bổ sung kỳ gốc. Khi đó luồng
ở §10.4 phải viết lại theo trục đó.

Hai điểm của khung hiện hành đã kiểm chứng và ÁP DỤNG NGAY:

1. **Không còn khái niệm "hủy" hóa đơn** (từ NĐ 70/2025). Hóa đơn bị thay thế **vẫn
   tồn tại trong sổ**, chỉ vô hiệu về giá trị kê khai. ⇒ Củng cố quyết định ở §10.4:
   engine tự loại lúc tính, **không xóa/không sửa dữ liệu sổ**.

2. **Điều chỉnh giảm bắt buộc ghi SỐ ÂM** — không phải ghi dương kèm chữ "giảm".
   Khi gặp hóa đơn điều chỉnh, engine cộng dồn thẳng giá trị (đã mang dấu) chứ không
   tự đảo dấu.

---

### 10.6. Ràng buộc khi hiện thực

- Đây là thao tác **CÓ GHI** vào sổ — khác mọi thứ khác trong luồng tờ khai (chỉ đọc).
  Phải gói **transaction**, ghi **ActivityLog** (luật 7), và **hỏi xác nhận** trước khi
  ghi, nêu rõ sẽ đụng bao nhiêu hóa đơn.
- Luật 5: hàm nguồn ngoài không được ghi đè `ghi_no/ghi_co`, `ma_ct_*`, `ma_kh`,
  `ngay_nh`, `ghi_chu` **đã có**. Ghi chú xử lý phải **NỐI THÊM** vào `HOA_DON.ghi_chu`,
  không xóa nội dung cũ. Cột rộng 1000 ký tự nên nối vài lần vẫn đủ chỗ, nhưng phải
  kiểm độ dài trước khi nối — tràn thì SQL cắt cụt âm thầm, mất cả phần cũ lẫn mới.
- Chạy lại nhiều lần phải **không đổi kết quả** — kế toán bấm nhầm hai lần là chuyện
  thường, không được nhân đôi ghi chú hay trừ hai lần.

---

## 10bis. ĐỐI CHIẾU ENGINE VỚI 4 TỜ KHAI THẬT (15/08/2026)

> Trạng thái: **ĐÃ CHẠY ENGINE THẬT** — không phải chạy tay SQL. Bốn lỗi lộ ra, đã sửa.

Chạy `POST api/thue/to-khai?thang=7` rồi so từng chỉ tiêu với XML cổng TCT trả về của
**NHAT_TUAN, DAT_VIET_THANH, THAI_TUAN, HUY_THANH** (kỳ 07/2026).

### 10bis.1. BR-TK-18 — Gom nhóm theo `pt_vat` CỦA DÒNG, không theo `h.vat`

> **BR-TK-18.** Phân nhóm thuế suất phải gom theo `HOA_DON_LINE.pt_vat`, rồi **phân bổ
> chiết khấu** của từng hóa đơn về các nhóm theo tỷ trọng tiền hàng. **KHÔNG** gom theo
> `HOA_DON.vat` (header).

`h.vat` là **%VAT bình quân** của cả hóa đơn. Hóa đơn trộn nhiều thuế suất thì bình quân
ra con số **không tồn tại trong luật thuế**.

Đo thật DAT_VIET_THANH T7 — dòng hàng chỉ có 0/5/8%, nhưng header cho:

| `h.vat` | Số HĐ | Ghi chú |
|---|---:|---|
| 5% | 95 | thật |
| **6%** | **3** | ← bình quân của HĐ trộn 5% và 8% |
| **7%** | **1** | ← bình quân |
| 8% | 12 | thật |

Hậu quả: tờ khai mọc ra hai nhóm 6% và 7%, `ct32` tụt từ 47.642.515 xuống **20.365.798**,
và BR-TK-03 **CHẶN HẲN** việc xuất tờ khai. §3.3 vốn đã ghi đúng cách làm — code làm sai.

### 10bis.2. BR-TK-19 — Phân biệt THAY THẾ ('1') với ĐIỀU CHỈNH ('2')

> **BR-TK-19.** Nhánh loại hóa đơn gốc **chỉ nhận `tich_chat_hd_lienquan = '1'`**
> (thay thế). Mã `'2'` là điều chỉnh — hóa đơn gốc **VẪN CÒN HIỆU LỰC**, chỉ cộng thêm
> phần chênh, loại gốc là mất luôn doanh thu của nó.

Đúng như §10.3 đã phân biệt, nhưng code cũ gộp cả hai. Đo thật HUY_THANH T7: HĐ 1374
điều chỉnh (`tc='2'`) trỏ về gốc 1334 ⇒ engine loại luôn 1334, **mất 368.406.608 đ**
doanh thu, trong khi bảng kê cổng **vẫn tính** nó (368.406.585 / VAT 36.840.659).

Giá trị `tich_chat_hd_lienquan` đo được: `'1'` thay thế, `'2'` điều chỉnh, `'5'` chưa rõ
(8 hóa đơn THAI_TUAN, đều không có `ngay_lienquan`). **Không đoán mã '5'.**

### 10bis.3. BR-TK-17 — `ct9` phụ lục là chênh lệch THUẾ

> **BR-TK-17.** `ct9 = thueGTGTDuocGiam − thueGTGTHHDV` (hiệu **THUẾ**),
> KHÔNG phải hiệu giá trị hàng.

Bản cũ lấy hiệu giá trị hàng nên sai **cả dấu lẫn độ lớn**. Kiểm trên ba tờ khai thật:

| Đơn vị | Thuế được giảm | Thuế mua vào | ct9 tính ra | ct9 thật |
|---|---:|---:|---:|---:|
| NHAT_TUAN | 59.595.118 | 268.421.207 | −208.826.089 | −208.826.089 ✔ |
| DAT_VIET_THANH | 952.846 | 165.876.147 | −164.923.301 | −164.923.301 ✔ |
| HUY_THANH | 6.853.487 | 55.979.377 | −49.125.890 | −49.125.890 ✔ |

### 10bis.4. BR-TK-06b / 06c — Hóa đơn thay thế khác kỳ và "đã bị thay thế"

> **BR-TK-06b.** Hóa đơn thay thế/điều chỉnh mà **gốc thuộc kỳ khác** thì KHÔNG kê vào
> kỳ này (so theo `ngay_lienquan`). Bỏ trống `ngay_lienquan` thì **giữ lại** — không
> biết gốc ở kỳ nào thì thà kê thừa còn hơn nuốt mất một hóa đơn có thật.
>
> **BR-TK-06c.** Hóa đơn mang trạng thái `'…bị thay thế…'` thì loại, **kể cả khi không
> tìm thấy bản thay thế trong kỳ** (bản thay thế có thể ở kỳ khác hoặc chưa nạp).

Đo thật DAT_VIET_THANH: bản cũ kê thừa **2,04 tỷ** doanh thu và **163 triệu** VAT.

**Bằng chứng chốt** — bảng kê Excel của cổng ghi các hóa đơn bị thay thế với **tiền = 0**,
tức cổng đã tự vô hiệu sẵn. Và tổng bảng kê **khớp XML tờ khai tuyệt đối** ở cả 4 đơn vị:

| Đơn vị | Bảng kê cổng (tiền / thuế) | XML tờ khai |
|---|---|---|
| NHAT_TUAN | 2.994.779.892 / 239.882.875 | **giống hệt** |
| DAT_VIET_THANH | 2.881.395.112 / 65.949.024 | **giống hệt** |
| HUY_THANH | 34.178.614.820 / 3.411.008.007 | **giống hệt** |

⇒ **Bảng kê Excel của cổng là nguồn đối chiếu chuẩn nhất**, hơn cả sổ.

### 10bis.5. KT-09 — Cảnh báo trạng thái lạ

BR-TK-06c lọc bằng **CHỮ** trong `tthai_hd` — văn bản tự do của cổng, đổi cách viết là
phép lọc câm lặng bỏ sót (đúng rủi ro §10.2 đã cảnh báo). Bù lại bằng cảnh báo `KT-09`:
gặp trạng thái chứa "thay thế"/"điều chỉnh" mà không khớp 4 mẫu đã biết thì **nói ra**.

Bốn mẫu đã biết: `Hóa đơn mới`, `Hóa đơn thay thế`, `Hóa đơn đã bị thay thế`,
`Hóa đơn điều chỉnh`. KT-09 bắt được ngay `Hóa đơn đã bị điều chỉnh` ở THAI_TUAN
và HUY_THANH — mẫu thứ năm chưa từng gặp.

### 10bis.6. Kết quả sau khi sửa

| Đơn vị | Khớp TUYỆT ĐỐI | Lệch còn lại | Nguyên nhân |
|---|---|---:|---|
| NHAT_TUAN | ct22, ct24, ct25 | DT 8.472.414 | thiếu HĐ 1466, 1518 trong sổ |
| DAT_VIET_THANH | ct22, ct26 | ct32 lệch 200 đ | làm tròn |
| THAI_TUAN | ct22, **ct33, ct35** | ct32 lệch 15 đ | làm tròn |
| HUY_THANH | ct22, ct24, ct25 | DT 206.182.968 | thiếu HĐ 1494 trong sổ |

**`ct22` khớp tuyệt đối cả 4 đơn vị** ⇒ BR-TK-02 (nối kỳ) chạy đúng.

Mọi khoản lệch còn lại đều **truy được nguyên nhân** và đều là **dữ liệu sổ thiếu**,
không phải công thức sai. Ngoài ra DAT_VIET_THANH thiếu HĐ 1233 và hàng nhập khẩu
`ct23a/ct24a` (sổ **không có cột** đánh dấu hàng nhập khẩu — xem §7 điểm cần chốt).

### 10bis.7. BR-TK-20 — Ghi chú hóa đơn liên quan khác kỳ

Hiện thực §10.4 trường hợp 2: `POST api/thue/hd-lien-quan-khac-ky?thang=&nam=&ma=&chiXem=`

> **BR-TK-20.** Hóa đơn thay thế/điều chỉnh khác kỳ được **đánh dấu vào
> `HOA_DON.ghi_chu`** với tiền tố `[TK-LQ]`, đủ **bốn thông tin** của §10.4, kèm một
> file `.txt` tổng hợp xuất ra `Paths:JobsRoot\TO_KHAI_LIEN_QUAN\`.

- `chiXem = true` (mặc định): **chỉ liệt kê và xuất file, KHÔNG ghi** — đúng tinh thần
  "bấm lần 1 không ghi gì" của §10.4.
- **NỐI THÊM** vào `ghi_chu`, không đè (luật 5). Kiểm độ dài trước khi nối, tràn 1000
  ký tự thì bỏ qua và báo lỗi — chứ không để SQL cắt cụt âm thầm.
- Tiền tố `[TK-LQ]` là dấu hiệu để lượt sau **bỏ qua**: chạy lại nhiều lần không nhân
  đôi ghi chú (§10.6). Đã kiểm thật: lần 2 trả "bỏ qua 1", `ghi_chu` vẫn đúng 1 dấu hiệu.
- Gói **transaction**, ghi **ActivityLog** `GHI_CHU_HD_LIEN_QUAN` (luật 7).
- Một đơn vị hỏng (chưa mở sổ năm đó) thì ghi vào phần Lỗi của file rồi **chạy tiếp** —
  dừng cả mẻ vì một đơn vị là phải chạy lại từ đầu.

Đo thật kỳ 07/2026 trên 13 đơn vị: chỉ **NHAT_TUAN HĐ 1136** khác kỳ (gốc 25/06).
THAI_TUAN và HUY_THANH có hóa đơn liên quan nhưng đều **cùng kỳ** nên không vào file.

---

## 11. MÀN "BC LẤY TỜ KHAI XML" — LƯU FILE CỔNG TCT TRẢ VỀ

> Trạng thái: **ĐÃ HIỆN THỰC 15/08/2026** — build PASS, chưa chạy thử trên kho thật.
> Bổ sung sau khi §10 chốt. Đây là mảnh **khép kín vòng đời tờ khai**:
> `lập tờ khai → nộp lên cổng → cổng trả file → lưu về kho + nạp số liệu`.

### 11.1. Vì sao cần

Tờ khai lập ra ở §3 là bản **mình tự tính**. Sau khi nộp, cổng TCT trả về một file XML
— đó mới là bản **ĐÃ NỘP THẬT**. Hai bản lệch nhau nghĩa là bản nộp khác bản lập, phải
soi lại. Trước khi có màn này, file cổng trả về không có chỗ nào để lưu, nên:

* Không biết kỳ nào đã nộp xong, kỳ nào mới chỉ lập trong máy.
* Không so được `ct43` tự tính với `ct43` đã nộp ⇒ BR-TK-02 (nối kỳ) mất điểm tựa,
  vì `ct22` kỳ sau phải lấy từ **số đã nộp**, không phải số tự tính.

### 11.2. HAI KHO KHÁC NHAU — đừng lẫn

Đây là chỗ dễ sai nhất của cả màn hình, ghi rõ để khỏi lặp lại:

| Khóa appsettings | Chứa gì | Quyền |
|---|---|---|
| `Paths:ScanDocRoot` | Kho **HÓA ĐƠN** tải về (xml/html/excel) | Đọc + ghi |
| `Paths:JobsRoot` | Kho làm việc của trình tải (bảng kê Excel cổng) | Đọc + ghi |
| `Paths:ScanDocRoot1` | Kho **TỜ KHAI** — màn này dùng khóa NÀY | Đọc + ghi (chỉ thư mục kỳ) |

> **BR-TK-07 — Tờ khai lưu ở `ScanDocRoot1`.** Hóa đơn là việc của `ScanDocRoot`/
> `JobsRoot`. Thư mục kỳ trong kho tờ khai CÓ LẪN bảng kê hóa đơn (`HD_VAO_*.xlsx`,
> `HD_RA_*.xlsx`) nhưng **hóa đơn không lấy từ kho này**.

> ⚠ **Đính chính §9:** mục "Ràng buộc kỹ thuật" viết đường dẫn khai ở `Paths:ToKhaiRoot`.
> Khóa đó **không tồn tại** trong `appsettings.json`. Khóa thật đang dùng là
> **`Paths:ScanDocRoot1`** (đo 15/08: `\\Server-test\scan_doc`).

### 11.3. Khuôn thư mục lưu — SERVER TỰ SUY, không gõ tay

```
<Paths:ScanDocRoot1>\<MÃ_ĐƠN_VỊ>\NAM<năm>\TO_KHAI\TO_KHAI_GOC\TKG_T<tháng>_<năm>\
```

Ví dụ: `\\Server-test\scan_doc\VINH_HOAN\NAM2026\TO_KHAI\TO_KHAI_GOC\TKG_T7_2026`

> **BR-TK-08 — Bám theo khuôn đơn vị đang dùng.** Kho thật dùng **CẢ HAI** khuôn
> (đo 15/08): `USA_MEVA`, `HUYEN_LINH` có tầng `TO_KHAI`; còn `THAI_TUAN`,
> `DAT_VIET_THANH` để `TO_KHAI_GOC` thẳng dưới `NAM<năm>`.
> Khi **ĐỌC**: thử khuôn đủ tầng trước, không có thì thử khuôn phẳng.
> Khi **GHI**: đơn vị đã có cây phẳng thì ghi vào đúng cây đó; đơn vị chưa có gì thì
> dựng khuôn đủ tầng.
>
> Vì sao: cứ ghi theo một khuôn cố định thì đơn vị đang dùng cây phẳng sẽ có **HAI cây
> tờ khai song song**, tháng cũ một nơi tháng mới một nơi — sau không ai biết tìm ở đâu.

Không bắt người dùng chọn tay: kho có **91 đơn vị × 12 kỳ**, chọn tay vừa lâu vừa dễ
lạc thư mục — mà lạc thì file của đơn vị này nằm trong thư mục đơn vị khác.

### 11.4. Panel "THÔNG TIN THƯ MỤC" — bố cục 3 cột × 3 dòng

Dựng lại form VFP cùng tên, đặt **TRƯỚC** ô kéo thả (đúng thứ tự thao tác: chọn đơn
vị/kỳ → xem thư mục → thả file).

```
┌──────────────────────────────────────────────────────────────┐
│ Đơn vị   [──── 2 cột ────]        Tháng  [Tháng 8 ▾]        │
│ Thư mục  [\\Server-test\…] [Mở]   Dữ liệu năm [Năm 2026 ▾]  │
│ Ghi chú  [──────────── cả 3 cột ────────────────────]        │
└──────────────────────────────────────────────────────────────┘
```

> **BR-TK-09 — MỘT nơi duy nhất chọn đơn vị/kỳ.** Bản đầu có thêm bộ Đơn vị/Kỳ thứ hai
> ở hàng Lưu. Hai bộ **lệch nhau được**, mà người dùng không biết nút Lưu đọc theo chỗ
> nào. Hàng Lưu giờ chỉ **nhắc lại** chỗ sắp ghi rồi xác nhận.

Cột dùng `1fr 1fr minmax(200px, .8fr)` — không đặt width cứng vì modal trải `100vw`.
Dưới 1100px tự xuống một cột.

### 11.5. Ô "Thư mục" và nút "Mở" — duyệt kho có kiểm soát

Ô Thư mục là **field có viền, `readOnly`** (không phải `disabled`: `disabled` làm chữ
mờ, mà đây là thứ kế toán phải ĐỌC để kiểm). Bấm vào ô = chép đường dẫn.

**Không cho gõ tay đường dẫn** — gõ sai một ký tự là lạc thư mục, đúng cái việc thủ
công mà luồng này sinh ra để bỏ đi. Muốn đổi thì bấm **Mở** rồi tự duyệt tới nơi.

Endpoint mới: `GET api/thue/duyet-kho-to-khai?duong=…`

> **BR-TK-10 — Tự lần xuống sâu nhất có thể.** Thư mục kỳ **thường chưa tồn tại** (lát
> nữa lưu mới tạo). Trả 404 khi đó thì màn hình phải lùi về gốc kho — mà gốc có 91 đơn
> vị, bắt kế toán tự mò xuống 5 tầng. Thay vào đó server **bỏ dần tầng cuối** cho tới
> khi gặp thư mục có thật, rồi báo về `thieuTang` để màn hình nói rõ "chưa có, lưu sẽ
> tạo".

```
Xin mở:  …\VINH_HOAN\NAM2026\TO_KHAI\TO_KHAI_GOC\TKG_T7_2026   ← chưa có
Mở thật: …\VINH_HOAN\NAM2026\TO_KHAI\TO_KHAI_GOC               ← đúng nhánh đơn vị
         thieuTang = ["TKG_T7_2026"]  → banner "Chưa có thư mục…"
```

Nút chốt đổi nhãn thành **"Tạo & chọn"** khi thiếu tầng, và lấy **đường dẫn đầy đủ đã
xin** — KHÔNG lấy thư mục cha đang mở. Lấy cha là file rơi ra ngoài thư mục kỳ, lẫn với
kỳ khác, mà người dùng lại tưởng đã chọn đúng.

### 11.6. Giới hạn của trình duyệt — ghi lại để khỏi bàn lại

| Muốn làm | Được không | Vì sao |
|---|---|---|
| Mở hộp thoại Open của Windows để **chọn file** | **Được** | Nút "Chọn file…" trong ô thả |
| Lấy **đường dẫn** của file vừa chọn | **KHÔNG** | Trình duyệt cắt bỏ; `file.name` chỉ là tên |
| Mở **Explorer** tới thư mục trên máy | **KHÔNG** | `file://` bị chặn từ trang `http` |

⇒ Hộp thoại Windows **không điền được ô Thư mục**. Đó là lý do phải có cửa sổ duyệt kho
riêng (§11.5). Hai nút làm hai việc khác hẳn, không cái nào thay được cái kia:

| Nút | Vị trí | Việc |
|---|---|---|
| **Chọn file…** | trong ô kéo thả | lấy **file** để lưu (hộp thoại Windows) |
| **Mở** | cạnh ô Thư mục | chọn **nơi lưu** → điền ô Thư mục |

Muốn mở Explorer thật thì phải đăng ký giao thức `kt2000://` trong registry của **từng
máy trạm** — chưa làm, và chỉ nên làm khi có yêu cầu rõ.

### 11.7. Luồng lưu — hai việc trong một lượt bấm

`POST api/thue/luu-to-khai-tct?ma=&thang=&nam=&ghiChu=&thuMuc=`

1. **Chép file** vào thư mục kỳ (tự tạo nếu chưa có), nhận `.xml` và `.zip`.
2. **Đọc 26 chỉ tiêu** trong file, ghi vào cột `ct*_xml`, đối chiếu ngay với bản tự lập.

> **BR-TK-11 — Không ghi đè file trùng tên.** Cổng có thể trả nhiều lần cho cùng một
> kỳ. Ghi đè là mất bản trước ⇒ thêm hậu tố `_1`, `_2`… (tối đa 99).

> **BR-TK-12 — Kỳ chưa có dòng thì TẠO MỚI.** Trước đây chỉ `UPDATE`, nên đơn vị chưa
> tự lập tờ khai trong máy thì file cổng lưu được vào kho mà **số liệu không vào đâu
> cả** — kỳ đó vĩnh viễn trống trên lưới. Dòng tạo mới chỉ mang phần `_xml`; các cột
> `ct*_nnt` để **NULL** vì không có bản tự lập để điền — đặt 0 là dựng ra một bản tự
> lập không tồn tại, và cột Lệch sẽ báo lệch bằng đúng số của TCT.

> **BR-TK-13 — Kiểm chéo MST + kỳ, cảnh báo chứ không chặn.** Đơn vị và kỳ lấy từ
> **tham số người dùng chọn**, KHÔNG suy từ nội dung file. Nhưng vẫn so với MST/kỳ ghi
> trong file và báo nếu lệch — người dùng chọn nhầm kỳ là chuyện thường, mà lưu nhầm
> thì số kỳ này đè lên kỳ khác. Để người dùng tự quyết, nhưng **phải nói ra**.

Ghi chú (trường mới) cắt **500 ký tự** cho vừa cột `TOKHAI.ghi_chu NVARCHAR(500)` —
dài hơn thì SQL ném lỗi truncate và **hỏng cả lượt lưu**, trong khi file đã nằm trong
kho rồi.

> **BR-TK-14 — Ghi chú bỏ trống thì GIỮ NGUYÊN bản cũ**, không xóa trắng:
> `ghi_chu = ISNULL(@ghiChu, ghi_chu)`. Bỏ trống nghĩa là "không có gì để nói thêm",
> không phải "xóa ghi chú cũ" — mà ghi chú cũ thường là lời dặn của kỳ trước.
> (Cùng tinh thần luật 5 của CLAUDE.md: không ghi đè `ghi_chu` đã có.)

### 11.8. Chặn đường dẫn lạ — BẮT BUỘC

Đường dẫn (`duong` khi duyệt, `thuMuc` khi lưu) **đến thẳng từ client** nên phải tự coi
là chuỗi thù địch: dù màn hình chỉ cho chọn trong kho, request nặn tay vẫn gửi được
đường dẫn bất kỳ.

> **BR-TK-15 — Nhốt trong `ScanDocRoot1`.** Cả đường **duyệt** lẫn đường **ghi** đi qua
> **CÙNG MỘT** hàm chặn (`DuyetKhoHopLe`):
> 1. Chuẩn hóa bằng `Path.GetFullPath` trước khi so — `…\scan_doc\..\..\Windows` là
>    chuỗi khác hẳn nhưng trỏ ra ngoài kho.
> 2. So tiền tố **kèm dấu phân cách** — nếu không thì `\scan_doc_mat` cũng lọt vì nó
>    bắt đầu bằng `\scan_doc`.
> 3. Ra ngoài kho ⇒ **403**, không phải 400 (đây là chặn quyền, không phải dữ liệu sai).
>
> Dùng chung một hàm là **cố ý**: hai chỗ mà lệch nhau một chút là có đường ghi được ra
> ngoài kho dù đường duyệt đã chặn.

Gate claim `tenant_type = internal` cho cả hai endpoint (luật 2) — đây là cửa sổ nhìn
vào ổ đĩa máy chủ, không phải số liệu nghiệp vụ.

### 11.9. Cột mới trên lưới

| Cột | Nguồn | Ghi chú |
|---|---|---|
| **Năm** | `TOKHAI.nam` | Tách riêng **bên cạnh** cột Kỳ, không thay nó |
| **Tháng** | `TOKHAI.thang` | |
| **Đường dẫn** | `TOKHAI.xml_path` | Hiện 2 đoạn cuối; đầy đủ trong tooltip; bấm để chép |

> **BR-TK-16 — Năm/Tháng tách khỏi Kỳ.** `ky_kekhai` là chuỗi `MM/yyyy` nên sắp xếp
> theo nó là sắp theo **chữ** (`10/2026` đứng trước `2/2026`). Hai cột số này cho sắp
> đúng thứ tự thời gian.

Cột Đường dẫn lấy từ `xml_path` chứ **không ghép lại** từ (mã, năm, tháng): file cũ do
công cụ Python nạp có thể nằm ở cây phẳng, ghép lại là ra đường dẫn không tồn tại — mà
đường dẫn sai còn tệ hơn đường dẫn trống.

### 11.10. Đã làm / chưa làm

**Đã hiện thực (build PASS):**

| Phần | Chỗ code |
|---|---|
| Duyệt kho + chặn đường dẫn | `BangToKhaiService.DuyetKho` / `DuyetKhoHopLe` |
| Suy thư mục theo khuôn | `BangToKhaiService.ThuMucToKhai` |
| Lưu file vật lý | `BangToKhaiService.LuuFileToKhai` |
| Ghi 26 chỉ tiêu + ghi chú | `BangToKhaiService.GanXmlDaNop` |
| Endpoint duyệt / lưu | `ThueController.DuyetKhoToKhai` / `LuuToKhaiTct` |
| Panel + cửa sổ duyệt + cột mới | `kt2000-web/src/pages/BcToKhaiXml.tsx` |

Bổ sung 15/08 (xem §10bis.7):

| Phần | Chỗ code |
|---|---|
| Ghi chú HĐ liên quan khác kỳ + file .txt | `GhiChuHdLienQuan` (trong `ToKhai.cs`) |
| Endpoint | `ThueController.HdLienQuanKhacKy` |

**Chưa làm / còn nợ:**

1. **Nút "Danh sách đơn vị"** của form VFP gốc — chưa rõ bản VFP mở ra cái gì
   (popup chọn đơn vị? báo cáo riêng?). **Chờ chốt**, không đoán.
2. **`lan_nop` cố định = 0** khi lưu: tờ khai **bổ sung** (BS 1, BS 2…) chưa có đường
   nạp qua màn này. Lưới đã hiện được cột Lần khai nhưng luồng lưu chưa cho chọn.
3. Mở Explorer thật trên máy trạm — xem §11.6, chỉ làm khi có yêu cầu rõ.
4. **Chưa có nút trên giao diện** cho `hd-lien-quan-khac-ky` — mới gọi được bằng API.
5. **Mã `tich_chat_hd_lienquan = '5'`** (8 hóa đơn THAI_TUAN T7) chưa rõ nghĩa —
   chờ gặp một ca có `ngay_lienquan` rồi mới suy được, **không đoán**.
6. **Ba hóa đơn thiếu trong sổ** (NHAT_TUAN 1466/1518, HUY_THANH 1494) và **hàng nhập
   khẩu** `ct23a/ct24a` — việc dữ liệu, không phải code. Xem §10bis.6.

### 11.11. Ràng buộc đã tuân (đối chiếu CLAUDE.md)

| Luật | Cách tuân |
|---|---|
| 1 — Resolver-only | `_resolver.GetBaseConnection()` / `GetTenantConnection()`, không ghép tên DB |
| 2 — Claim gates | `tenant_type = internal` cho cả ba endpoint (duyệt kho, lưu, ghi chú) |
| 3 — SQL tham số hóa | Toàn bộ `@ma`, `@nam`, `@thang`, `@ghiChu`… |
| 4 — Không path cứng | Đường dẫn sinh từ `Paths:ScanDocRoot1` và `Paths:JobsRoot` |
| 5 — Không ghi đè `ghi_chu` | BR-TK-14 (`ISNULL`) và BR-TK-20 (nối thêm, kiểm độ dài) |
| 7 — ActivityLog | `LUU_TO_KHAI_TCT`, `GHI_CHU_HD_LIEN_QUAN` |
| 8 — Comment BR | Mã `BR-TK-xx` tại chỗ hiện thực |

> **Về `GhiChuHdLienQuan` nằm trong `ToKhai.cs`:** cả file mang luật "KHÔNG GHI", lớp
> này là **ngoại lệ duy nhất** và đã ghi rõ ở đầu file. Nó chỉ đụng đúng MỘT cột
> `HOA_DON.ghi_chu`, không chạm cột TIỀN hay ĐỊNH KHOẢN nào. Thêm lớp CÓ GHI thứ hai
> vào đây thì **phải tách file** — nửa chỉ-đọc nửa có-ghi là rào chắn mất tác dụng.

Bảng `TOKHAI` **không đổi schema** — `xml_name`, `xml_path`, `ghi_chu` đã có sẵn từ
script `022_base_tokhai.sql`, nên **không cần script mới** (luật 6).

> Script này từng mang số **019**, đã đánh số lại thành **022** (15/08) vì nhánh main
> có `019_hoa_don_dinh_khoan_kieu.sql`, `020_hoa_don_line_pt_vat_int.sql` và
> `021_in_value_bu_bang.sql` lên trước. Hai script khác nhau cùng một số là vi phạm
> luật 6 và làm hỏng thứ tự chạy trên máy khác.
