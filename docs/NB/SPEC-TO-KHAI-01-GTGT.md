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
