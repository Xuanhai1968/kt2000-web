# SPEC — MÀN HỢP ĐỒNG / LƯƠNG ĐƠN VỊ (`pages/hop_dong`)

| Mục | Nội dung |
|---|---|
| Loại tài liệu | Spec **mô tả CODE ĐANG CHẠY**, không phải đề xuất |
| Phiên bản | 2.0 |
| Ngày | 21/08/2026 |
| Phạm vi | Toàn bộ `kt2000-web/src/pages/hop_dong/` (10 file, ~3.300 dòng) |
| Backend dùng kèm | `HopDongController` · `ChamCongController` · `HopDongService` · `ChamCongService` · `ExcelLuongService` |
| Schema | `database/025_*.sql` (Ver 18) · `database/026_*.sql` (Ver 19) |
| Thay thế | `SPEC-HOP-DONG-CHAM-CONG-LUONG.md` + `FLOW-LUONG-DON-VI.md` (gộp về file này) |

## Lịch sử sửa đổi

| Phiên bản | Ngày | Nội dung |
|---|---|---|
| 0.1 | 20/08/2026 | Bản đầu (spec nghiệp vụ + căn cứ pháp lý). |
| 1.1 | 21/08/2026 | Flow lương chắt lọc từ code. |
| 2.0 | 21/08/2026 | **Gộp hai file thành một.** Viết lại theo CODE THỰC TẾ sau đợt sửa 21/08: nhập Excel đổi sang hai nhịp đọc-nháp → Lưu; xem trước nháp ở cả ba màn con; gộp người trùng giữa các file; mã NS tự tăng; vá chuỗi flex antd v6. |

---

## 1. Màn này là gì

**Một route duy nhất** `/app/hop-dong` ([App.tsx:52](../../../kt2000-web/src/App.tsx#L52), lazy-load). Menu hiện hai nhãn khác nhau tuỳ loại đơn vị ([AppShell.tsx](../../../kt2000-web/src/AppShell.tsx)):

- Đơn vị thường → **"Hợp đồng"**
- MDN_NB → **"Lương đơn vị"**

Cả module là **một trang + năm modal**, không có route con. Khuôn bố cục bám theo màn Báo cáo thuế của MDN_NB: lưới liệt kê đơn vị, tích radio một đơn vị rồi bấm nút mở modal to.

### 1.1 Cấu trúc file

| File | Dòng | Vai trò |
|---|---|---|
| `HopDong.tsx` | 766 | **Container.** Lưới đơn vị, nhập Excel, giữ nháp, mở 4 modal |
| `DanhSachNhanSu.tsx` | 380 | Modal CRUD nhân sự |
| `TaoHopDong.tsx` | 377 | Modal lập/sửa HĐLĐ |
| `ChamCong.tsx` | 472 | Modal lưới chấm công 31 cột |
| `BangLuong.tsx` | 546 | Modal bảng thanh toán lương |
| `kyHieuChamCong.ts` | 46 | Ký hiệu TT200, quy tắc tính công |
| `mauInHopDong.ts` | 215 | Sinh HTML tờ HĐLĐ để in |
| `dungBang.ts` | 32 | Hook `useChieuCaoBang` |
| `dinhDang.ts` | 19 | `tien()`, `ngayNgan()` |
| `hop-dong.css` | 471 | CSS dùng chung cả module |

---

## 2. Trang chính — lưới đơn vị

### 2.1 Nạp hai nhịp

| Bước | Request | Ghi chú |
|---|---|---|
| Mở trang | `GET /api/hop-dong/don-vi` | Trả NGAY, `soNhanSu`/`soHopDong` = 0 |
| Ngay sau | `GET /api/hop-dong/don-vi/{ma}/dem` × N | **Song song**, mỗi đơn vị một request |

**Vì sao tách:** đếm gộp phải mở 17 database rồi mới trả — người dùng nhìn màn trắng cả chục giây (gặp thật 20/08). Tách ra thì lưới hiện ngay, số điền dần, đơn vị nào xong trước hiện trước.

`luotRef` đánh dấu lượt nạp hiện hành: đóng/mở modal liên tục thì kết quả lượt cũ về sau **không được ghi đè** số mới hơn.

### 2.2 Cột lưới

`STT` · `Mã đơn vị` · `Tên đơn vị` · `MST` · `Số nhân sự` · `Số hợp đồng`

Ô tích là **`type: "radio"`** — mọi nút đều thao tác trên MỘT database, chọn nhiều thì không biết mở cái nào.

Đơn vị **chưa mở năm** bị khoá ô tích, hiện nhãn `chưa mở năm` (class `hd-chua-mo`: chữ xám, `cursor: not-allowed`). Khác hẳn đơn vị đã mở mà chưa nhập ai (hiện `0`) — hiện số 0 cho cả hai thì kế toán tưởng đã vào xem rồi mà không có ai.

### 2.3 Thanh nút (`thanhLoc`), đúng thứ tự

```
[Nhập Excel] [Lưu vào DB (n)] [Bỏ nháp] │ [Danh sách nhân sự] [Hợp đồng] [Bảng chấm công] [Bảng lương]
                └──── chỉ hiện khi đang giữ nháp ────┘
```

| Nút | Điều kiện tắt |
|---|---|
| Nhập Excel | `chuaChon` |
| Lưu vào DB / Bỏ nháp | *(chỉ render khi `nhap.length > 0`)* |
| Danh sách nhân sự | `chuaChon \|\| chuaCoNhanSu` |
| Hợp đồng | `chuaChon` |
| Bảng chấm công | `chuaChon \|\| chuaCoNhanSu` |
| Bảng lương | `chuaChon \|\| chuaCoNhanSu` |

```ts
coNhap        = nhap.length > 0
chuaCoNhanSu  = !coNhap && (chưa chọn || đang đếm || soNhanSu === 0)
```

**`coNhap` đứng trước là điểm mấu chốt:** đang giữ nháp thì ba màn kia mở được dù sổ còn trống — đó chính là điểm của bước soát (mục 4).

---

## 3. Nhập Excel — HAI NHỊP

> **Đổi ngày 21/08.** Trước đây `POST /nhap-excel` đọc file và **ghi thẳng** vào sổ. Nay tách đôi.

```
POST /api/hop-dong/nhap-excel/doc   → đọc file, trả NHÁP, KHÔNG chạm DB
        ↓  (nháp nằm ở FE, kế toán soát qua 3 modal)
POST /api/hop-dong/nhap-excel/luu   → nhận lại đúng nháp đó, LÚC NÀY mới INSERT
```

**Vì sao:** ghi thẳng thì file sai đơn vị / sai sheet / trùng người đã nằm trong sổ rồi mới biết, mà gỡ ra phải gỡ cả `HOP_DONG` trỏ vào.

**Nháp không có state ở server.** Nó đi về FE rồi quay lại nguyên vẹn: không session, không file tạm, không nháp hết hạn, hai kế toán nhập song song không giẫm nhau.

### 3.1 Bốn loại file, tự nhận dạng

`ExcelLuongService.DoanLoaiFile(wb)` đoán theo ruột file:

| Loại | Dấu hiệu | Nội dung |
|---|---|---|
| `HopDong` | mỗi sheet một HĐLĐ | nhân sự + hợp đồng |
| `DanhSachNhanSu` | sheet `DS_NV` | nhân sự + mức lương chuẩn |
| `ChamCong` | sheet `ccNN` | chấm công nhiều tháng |
| `BangLuong` | sheet `THANG n` | bảng lương nhiều tháng |
| `LuongCaNam` | có đủ cả ba | chạy tuần tự cả 3 bước |

Không nhận ra → **400** kèm câu liệt kê 4 loại đang nhận.

### 3.2 Thứ tự file — bắt buộc

`chayNhap` **xếp lại** danh sách trước khi chạy: file tạo NGƯỜI đi trước (hàm `uuTien` nhận dạng theo tên file — `HDLD`, `HOPDONG`, `NHANSU`, `DS_NV` → nhóm 0; còn lại → nhóm 1).

Lý do đã gặp thật (21/08): trình duyệt trả file theo thứ tự a-b-c nên `BANG_LUONG_2025...xls` chạy trước `Copy of HDLD_2025...xlsx` — lúc đó sổ chưa có ai và **mọi dòng bị bỏ** với lý do "không có nhân sự tên đó" (144 sheet không nhập được).

Chạy **tuần tự**, không `Promise.all`: file sau cần thấy người của file trước.

### 3.3 Gộp người trùng GIỮA CÁC FILE

Cả file HĐLĐ lẫn file bảng lương đều mang danh sách nhân viên. Nháp tách theo file, mà server chỉ gộp **trong phạm vi một file** → lưới xem trước hiện 24 dòng cho 12 người.

`gopNguoi()` trên FE gộp lại, khoá theo `chuanTen()`:

```ts
chuanTen = trim → lowercase → đ→d → NFD → bỏ dấu → NFC → gộp khoảng trắng
```

**PHẢI cùng luật với `ExcelLuongService.ChuanTen`** bên server, không thì hai bên ra hai con số khác nhau. Nhờ chuẩn hoá này mà `"Hoàng Văn Tự"` và `"Hoàng văn Tự"` về cùng một khoá.

Quy tắc gộp:
- **Giữ bản đầy đủ hơn** — file HĐLĐ có ngày sinh + CCCD, file bảng lương thường chỉ có tên + chức danh. Gặp lại một người thì **lấp vào ô đang trống, KHÔNG đè** lên dữ liệu đã có.
- **Dồn hợp đồng** của cả hai bản về một người.
- Cột "Người" của từng file sửa lại thành số người file đó **thật sự thêm mới** — không thì bảng ghi 12 + 12 trong khi tổng chỉ 12.

> Lưu ý: lúc GHI, server tra lại sổ sau mỗi file nên **DB vốn không bị trùng**. Gộp ở FE là để **con số trên màn khớp với thứ sắp ghi** — kế toán soát bằng chính con số đó.

### 3.4 Bảng kết quả đọc

Khối `.hd-kq-doc` — **bảng trần, không bọc Alert** (Alert thêm viền + nền + icon + hai lớp padding quanh một thứ vốn đã là bảng có viền → hai khung lồng nhau chiếm gần nửa màn cho 2 dòng).

Cột: `STT` · `File` · `Kết quả` · `Dòng` · `Người` · `Ghi chú`

`rowClassName` tô nền theo trạng thái, kèm vạch màu 3px bên trái (dùng `box-shadow: inset` chứ không `border-left` — border trên `<td>` bị viền bảng đè mất một phần):

| Trạng thái | Class | Nền | Vạch |
|---|---|---|---|
| đọc được | `hd-kq-ok` | `#f6ffed` | xanh lá |
| trống | `hd-kq-bo` | `#fffbe6` | vàng |
| lỗi | `hd-kq-loi` | `#fff2f0` | đỏ |

Chỉ hiện khi đọc **từ 2 file trở lên**, hoặc có file hỏng. `scroll.y` chỉ bật khi **>6 file** — chốt cứng 220px thì 2 file cũng chừa mảng trắng bằng 5 dòng.

### 3.5 Bảo vệ nháp

- Đang có nháp mà đọc lượt mới → **`Modal.confirm`** *"Bỏ dữ liệu đang chờ lưu?"*. Không gộp hai lượt: file lượt sau có thể là bản sửa của chính file lượt trước.
- **Lưu hỏng thì GIỮ NGUYÊN nháp** để bấm lại, không bắt đọc file lại từ đầu.
- Lưu xong mới `setNhap([])` — giữ lại là bấm Lưu lần nữa sẽ ghi chồng.
- Server **chặn nháp sai đơn vị ở cả cửa Lưu**, không chỉ cửa Đọc: đây là cửa ghi thật, không tin dữ liệu đi vòng qua trình duyệt (luật #2).

---

## 4. XEM TRƯỚC NHÁP — ba màn con

Đang giữ nháp thì ba nút mở được ngay, hiện **chính dữ liệu vừa đọc** dù sổ còn trống.

Cơ chế: prop `xemTruoc`. Có prop này thì `nap()` **lấy thẳng từ nháp, KHÔNG gọi API** (sổ chưa có gì, gọi chỉ ra lưới rỗng).

`HopDong.tsx` dựng 3 mảnh bằng `useMemo`:

| Memo | Kiểu | Ghi chú |
|---|---|---|
| `nsXemTruoc` | `NhanSu[]` | Gán **id ÂM** để `rowKey` không đụng nhau. `soHopDong` = số HĐ đọc được |
| `ccXemTruoc` | `Record<number, ChamCong[]>` | Gom **theo tháng** |
| `blXemTruoc` | `Record<number, BangLuong[]>` | Gom **theo tháng** |

`null` = không có nháp → màn con chạy như cũ, tự gọi API đọc sổ.

> Type `ChamCong`/`BangLuong` phải import alias thành `ChamCongDto`/`BangLuongDto` — trùng tên hai COMPONENT đã import.

### 4.1 Khoá mọi đường ghi khi xem trước

Nháp chưa có `nhan_su_id` thật:

| Màn | Đã tắt |
|---|---|
| Danh sách nhân sự | Thêm · Sửa · Xoá · double-click sửa |
| Bảng chấm công | Tạo tháng · Nhập Excel · Lưu · **ô nhập ký hiệu `readOnly`** |
| Bảng lương | Tính lương · Nhập Excel · Lưu |

Ô chấm công phải `readOnly` chứ không chỉ tắt nút: `suaO()` khoá theo `nhanSuId`, mà id đang âm nên sẽ **sửa nhầm dòng**.

Mỗi modal có `<Tag color="orange">XEM TRƯỚC — chưa lưu vào sổ</Tag>` cạnh tiêu đề. Tooltip nút Lưu chỉ về đúng chỗ: *"bấm Lưu vào DB ở màn Hợp đồng để ghi cả lượt"*.

---

## 5. Modal Danh sách nhân sự

**Cột:** `STT` · `Mã NS` · `Họ và tên` · `Ngày sinh` · `Số CMND/CCCD` · `Chức danh` · `Bộ phận` · `Điện thoại` · `Số HĐ` · `Đang làm` · *(thao tác)*

- **`Số HĐ` = SỐ LƯỢNG hợp đồng đã ký**, không phải số hiệu. Đếm bằng subquery `COUNT(*) FROM HOP_DONG WHERE nhan_su_id = n.id`.
- Cột thao tác dùng `Button` của antd (`type="text"`, nút xoá `danger`) bọc `Tooltip` — trước đây là `<button>` tự chế với hai class **không hề có CSS nào**, ra nút xám trần.
- Lọc client-side theo `hoTen`, `maNs`, `soCmnd`, `chucDanh`, `ngheNghiep`, `boPhan`.
- Checkbox **"Hiện cả người đã nghỉ"** → `caNguoiDaNghi`; mặc định chỉ hiện `dang_lam = 1`.
- **Xoá** hiện `Modal.confirm` nêu rõ số hợp đồng đang có và gợi ý bỏ tích *Đang làm* thay vì xoá (BR-HD-04).
- **Print** in A4 ngang, lấy **DANH SÁCH ĐANG LỌC** chứ không toàn bộ — người dùng vừa gõ tìm để thu hẹp, xuất cả trăm dòng thì đúng là thứ họ vừa loại bỏ.

### 5.1 Mã NS tự tăng

Ô **Mã NS** để trống → server cấp `NS00001`, `NS00002`… (`HopDongService.MaNsKeTiep`). Placeholder trên form: *"Bỏ trống = tự cấp NS00001…"*.

```sql
SELECT MAX(CAST(SUBSTRING(ma_ns, 3, 5) AS INT)) FROM NHAN_SU
WHERE ma_ns LIKE 'NS[0-9][0-9][0-9][0-9][0-9]' AND LEN(ma_ns) = 7
```

- **MAX rồi +1, KHÔNG `COUNT(*)`** — xoá người ở giữa thì COUNT tụt xuống, mã kế tiếp đè lên mã đã cấp.
- **Chỉ đếm mã đúng khuôn NS+5 số** — mã gõ tay kiểu `NV-01` bị bỏ qua, không kéo bộ đếm nhảy lung tung.
- **Mã gõ tay được tôn trọng** — chỉ cấp tự động khi để trống.
- Cạn dải `NS99999` → **ném lỗi** thay vì tràn sang `NS100000`: mã 8 ký tự không còn khớp bộ lọc `LEN=7`, lần sau sẽ quay về `NS00001` và trùng mã cũ mà không ai thấy.

Áp cho **cả 5 đường tạo nhân sự** vì tất cả đều đi qua `ThemNhanSu`.

---

## 6. Modal Bảng chấm công

**Cột:** `STT` · `Họ và tên` · `Chức vụ` *(3 cột ghim trái)* · **31 cột ngày** · `Tổng` *(ghim phải)*

Tiêu đề cột ngày hai dòng: số ngày trên, thứ dưới (`cc-dau-ngay`). Cuối tuần tô nền `cc-cuoi-tuan` để mắt bắt được nhịp 7 ngày mà không phải đếm.

Ô nhập là `<input class="cc-o">` **trần**, không dùng `Input` của antd — ô lưới chỉ rộng 40px mà Input antd mang sẵn padding/viền riêng nên bị bóp méo.

### 6.1 Ký hiệu và quy tắc tính công

`kyHieuChamCong.ts`:

```ts
TINH_CONG = { "1", "X", "+", "SP", "P", "H", "NB" }
congCuaO:  "0.5" | "0,5" | "1/2"  → 0.5
           thuộc TINH_CONG        → 1
           còn lại (kể cả L, CN, 0, Ô, TS…) → 0
tongCongCua = tổng congCuaO của 31 ô
THU_VN = ["CN","T2","T3","T4","T5","T6","T7"]   // index theo Date.getDay()
```

- **`L` (nghỉ lễ) và `CN` KHÔNG cộng công.** Bằng chứng: cc01 dòng Ngân có 5 ô `L`, Tổng = 21 chứ không phải 26.
- **`tong_cong` server tính lại, không nhận số FE gửi** (BR-CC-03). FE tính bằng `tongCongCua()` chỉ để hiện ngay khi gõ.
- **Khởi tạo chỉ điền `CN`, không điền ngày lễ** — lịch nghỉ lễ mỗi năm một khác, còn phụ thuộc lịch nghỉ bù Chính phủ công bố.
- Ô vượt số ngày thật của tháng bị **bỏ qua khi lưu** (BR-CC-04).

### 6.2 Thanh nút

`[Chọn tháng] [Tạo tháng] [Nhập Excel] [Lưu vào DB] [Print]`

Nút Lưu tắt khi `!daSua || chanLuu || laXemTruoc`. `chanLuu` = file đang xem là của đơn vị khác.

---

## 7. Modal Bảng lương

**Cột** (đúng thứ tự khuôn Excel): `STT` · `Họ tên` · `Bộ phận` · `Lương chính` · `NCTT` · `Lương thực tế` · `Ăn ca` · `Điện thoại` · `Xăng xe` · `Chuyên cần` · `Hiệu quả CV` · `Thưởng` · `Tổng PC` · `TỔNG LƯƠNG` · `Tạm ứng` · `BHXH 10,5%` · `Thuế TNCN` · `Tổng trừ` · `THỰC LĨNH` *(ghim phải)*

### 7.1 Ba nhịp chạy lương

```
B1  GET  /api/bang-luong?thang=              → xem bảng ĐÃ LƯU
B2  POST /api/bang-luong/tinh?thang=&ngayCongChuan=
                                              → BẢN NHÁP, KHÔNG ghi DB
B3  (kế toán soát trên lưới)
B4  PUT  /api/bang-luong?thang=              → ghi cả bảng, 1 transaction
```

**Điểm cần nhớ nhất:** B2 **không ghi DB**. Số chỉ vào sổ ở B4. Tính xong ghi đè thẳng thì một lần bấm nhầm mất số đã chỉnh tay cả tháng.

B3: `laNhap = true` → lưới đổi màu (`bl-nhap`, nền `#fffbe6`), tiêu đề hiện *"bản nháp — chưa ghi vào sổ"*, nút Lưu đổi chữ thành **"Lưu vào DB (bản nháp)"**, `maskClosable` **tắt**.

**FE hỏi lại trước khi tính** (`Modal.confirm` *"Tính lại bảng lương?"*) khi bảng **đã lưu** và không phải nháp — tính đè là mất hết số kế toán chỉnh tay. Bảng rỗng hoặc đang nháp thì tính thẳng.

### 7.2 Nguồn dữ liệu khi tính

Một câu SQL ghép ba nguồn:

```sql
FROM NHAN_SU n
LEFT JOIN CHAM_CONG cc ON cc.nhan_su_id = n.id AND cc.thang = @t
OUTER APPLY (
  SELECT TOP 1 luong_chinh, pc_an_ca, pc_dien_thoai, pc_xang_xe, pc_khac
  FROM HOP_DONG hd
  WHERE hd.nhan_su_id = n.id
    AND (hd.trang_thai IS NULL OR hd.trang_thai <> 'da_huy')
    AND (hd.tu_ngay IS NULL OR hd.tu_ngay <= @cuoi)
  ORDER BY hd.ngay_ky DESC, hd.id DESC) h
WHERE n.dang_lam = 1
ORDER BY n.ho_ten
```

- **`OUTER APPLY` chứ không JOIN thẳng** — một người nhiều hợp đồng, JOIN thẳng nhân dòng lên.
- **`TOP 1` theo `ngay_ky DESC`** — bản mới nhất còn hiệu lực đến cuối tháng đang tính.
- **`LEFT JOIN` chấm công** — người chưa chấm vẫn ra dòng `NgayCongTt = 0`, kế toán thấy ngay ai bị sót.
- **`dang_lam = 1`** — người đã nghỉ không lên bảng lương.

---

## 8. Công thức lương — `TinhMotDong`, thứ tự bắt buộc

```
1  luong_thuc_te = luong_chinh × ngay_cong_tt / ngay_cong_chuan     [BR-BL-02]
2  an_ca         = pc_an_ca(ĐƠN GIÁ/ngày) × ngay_cong_tt            [BR-BL-03]
3  tong_phu_cap  = an_ca + dien_thoai + xang_xe + chuyen_can + hieu_qua + thuong
4  tong_luong    = luong_thuc_te + tong_phu_cap                     [BR-BL-06]
5  can_cu        = MIN(luong_chinh, 46.800.000)                     [BR-BL-05]
6  khau_tru_bh   = can_cu × 10,5%                                   [BR-BL-04]
7  tong_khau_tru = tam_ung + khau_tru_bh + thue_tncn
8  thuc_linh     = tong_luong − tong_khau_tru
```

**Bước 6 là chỗ dễ code sai nhất cả module.** Nhìn qua tưởng bảo hiểm phải nhân theo ngày công như lương — **không phải**. Nó tính trên **lương chính**, đi làm ít hơn vẫn trừ y nguyên.

*Bằng chứng khuôn VĨNH HOÀN:* Hồi 19 công, lương thực tế co xuống 4.804.285,714 nhưng ô P14 vẫn đúng **557.550**, bằng Ngân 21 công.

### 8.1 Hai bẫy khi đọc code

**`pc_an_ca` mang HAI nghĩa ở hai chỗ:**

| Ở đâu | Nghĩa | Ví dụ |
|---|---|---|
| `HOP_DONG.pc_an_ca` | ĐƠN GIÁ một ngày | 25.000 |
| `BANG_LUONG.pc_an_ca` | THÀNH TIỀN cả tháng | 19 × 25.000 = 475.000 |

`TinhMotDong` **ghi đè `x.PcAnCa` tại chỗ** ở bước 2 — vào là đơn giá, ra là thành tiền. Gọi hàm này hai lần trên cùng một object thì ăn ca bị nhân đôi ngày công.

**Làm tròn:** chỉ `luong_thuc_te` giữ 2 số lẻ (`DECIMAL(18,2)`) — chỗ duy nhất phép chia sinh phần lẻ. Các cột còn lại `DECIMAL(18,0)`, làm tròn `AwayFromZero` ở **bước cuối**. Làm tròn sớm thì tổng lương lệch vài đồng so với bản kế toán đang phát.

**`pc_khac` của hợp đồng rót vào `pc_hieu_qua`** của bảng lương — khuôn Excel để khoản lớn nhất (3.500.000) ở cột "Hiệu quả CV".

### 8.2 Đã kiểm 16/16 khớp khuôn Excel

| Ca | Kiểm | Kết quả |
|---|---|---|
| Ngân — 21 công (đủ) | lương thực tế · ăn ca · tổng PC · tổng lương · BHXH · thực lĩnh | 6/6 khớp |
| Hiền — 20 công | 5.057.142,857 · ăn ca 500.000 · BHXH **vẫn** 557.550 | 4/4 khớp |
| Hồi — 19 công | 4.804.285,714 · ăn ca 475.000 · BHXH **vẫn** 557.550 | 4/4 khớp |
| Trần BH — lương 60 triệu | lấy trần 46,8tr → 4.914.000 *(không phải 6.300.000)* | khớp |

---

## 9. Business Rules

### 9.1 Chung

**BR-HD-01 — Không có cột `ma_donvi`.** Cả database đã là của một đơn vị. Mã đơn vị chỉ dùng để **chọn database** qua `TenantDbResolver` (luật #1), không lọt vào câu `WHERE` nào.

**BR-HD-02 — Gate theo loại đơn vị.**

```
tenant_type == "noibo"                    → 403
ma rỗng hoặc ma == của tôi                → OK, dùng chính mình
ma khác + tenant_type != "internal"       → 403
ma khác + !IsValidCode(ma)                → 403
ma khác + không có trong Tenants (Master) → 403
```

Ba chi tiết là **luật, không phải phòng thủ thừa**:
1. `maDonVi` **tuỳ chọn** — bỏ trống = đơn vị đang đăng nhập. Nhờ vậy đơn vị thường và MDN_NB dùng chung một bộ endpoint.
2. **Kiểm mã có thật trong `Tenants`** — bỏ bước này thì resolver vẫn dựng ra tên DB, SqlClient ném 4060, người gõ sai mã chỉ thấy *"chưa mở năm"* rồi dò nhầm hướng cả buổi.
3. **`FiscalYear()` ném lỗi khi thiếu claim**, không lùi về `DateTime.Now.Year` — lùi âm thầm thì mở nhầm database của năm khác.

Năm **luôn** lấy từ claim `fiscal_year`, không cho truyền qua query.

**BR-HD-03 — Chụp lại thông tin bên sử dụng lao động.** `nsdld_*` lưu **trên từng hợp đồng**, không tra sang Master lúc in. Giám đốc đổi người thì hợp đồng cũ vẫn in đúng tên người đã ký.

**BR-HD-04 — Không xoá nhân sự đã có hợp đồng.** FK **không** `ON DELETE CASCADE`. Muốn ẩn người thôi việc thì bỏ cờ `dang_lam`.

**BR-HD-05 — Giữ nguyên câu chữ khuôn Excel khi in.** Kể cả chỗ đọc lạ: `"Phụ cấpđiện thoại"` (thiếu dấu cách), `"ngh"` cụt cuối Điều 3, `"tại nạn lao động"` (sai chính tả). Đây là văn bản pháp lý kế toán đã dùng nhiều năm; sửa cho "đẹp" là làm hợp đồng in ra khác hợp đồng đã ký.

### 9.2 Chấm công

| Mã | Nội dung |
|---|---|
| **BR-CC-01** | Một dòng = (nhân sự, tháng). 31 cột ngày trên **một dòng**, không phải 31 dòng |
| **BR-CC-02** | Ký hiệu theo TT200 mẫu 01a-LĐTL; nhận cả bộ đầy đủ, gợi ý bộ rút gọn |
| **BR-CC-03** | `tong_cong` hệ thống tính, **không cho gõ tay** |
| **BR-CC-04** | Ô ngày vượt số ngày thực của tháng phải để trống |

### 9.3 Tính lương

| Mã | Nội dung |
|---|---|
| **BR-BL-01** | Ngày công chuẩn là **THAM SỐ từng bảng**, không phải hằng số *(Điều 54 NĐ 145/2020)* |
| **BR-BL-02** | `luong_thuc_te = luong_chinh × NCTT / chuẩn`, **không làm tròn** ở bước này |
| **BR-BL-03** | Ăn ca theo ngày công thực tế; phụ cấp khác trọn tháng |
| **BR-BL-04** | BHXH tính trên **LƯƠNG CHÍNH**, không trên lương thực tế |
| **BR-BL-05** | Trần đóng = 20× mức tham chiếu = **46,8 triệu/tháng** |
| **BR-BL-06** | Công thức tổng — mục 8 |
| **BR-BL-07** | Chỉ làm tròn ở cột lưu cuối cùng |
| **BR-BL-08** | Thuế TNCN mặc định 0, kế toán tự nhập |

---

## 10. Endpoint

### 10.1 `/api/hop-dong`

| Method | Đường dẫn | Việc |
|---|---|---|
| GET | `/don-vi` | Lưới đơn vị *(trả ngay, chưa đếm)* |
| GET | `/don-vi/{ma}/dem` | Đếm nhân sự + hợp đồng của một đơn vị |
| POST | `/nhap-excel/doc` | **Đọc file → nháp, KHÔNG ghi DB** |
| POST | `/nhap-excel/luu` | **Ghi nháp vào sổ** |
| POST | `/nhap-excel` | *(cũ — ghi thẳng, `@deprecated`, giữ cho tương thích)* |
| GET | `/nhan-su?caNguoiDaNghi=` | Danh sách nhân sự + số HĐ |
| POST/PUT/DELETE | `/nhan-su`, `/nhan-su/{id}` | CRUD *(DELETE → 409 nếu còn HĐ)* |
| GET | `/?nhanSuId=` · `/{id}` | Hợp đồng |
| POST/PUT/DELETE | `/`, `/{id}` | CRUD hợp đồng |

### 10.2 `/api/cham-cong` · `/api/bang-luong`

| Method | Đường dẫn | Việc |
|---|---|---|
| GET | `/api/cham-cong?thang=` | Lưới 31 cột × N người |
| POST | `/api/cham-cong/khoi-tao?thang=` | Sinh dòng trống, điền sẵn `CN` |
| PUT | `/api/cham-cong?thang=` | Lưu cả lưới, 1 transaction |
| POST | `/api/cham-cong/nhap-excel?thang=` | Đọc file → nháp |
| GET | `/api/bang-luong?thang=` | Bảng đã lưu |
| POST | `/api/bang-luong/tinh?thang=&ngayCongChuan=` | **Nháp, không ghi DB** |
| PUT | `/api/bang-luong?thang=` | Ghi cả bảng, 1 transaction |
| POST | `/api/bang-luong/nhap-excel?thang=` | Đọc file → nháp |

**Ràng buộc:** `thang` ∈ 1–12 · `ngayCongChuan` ∈ (0, 31] *(là mẫu số — 0 là chia cho 0)* · PUT chặn >1000 dòng · PUT chặn dòng `NgayCongChuan <= 0` **kèm tên người** *(bắt ở đây chứ không để CHECK constraint từ chối — constraint làm hỏng cả transaction mà không nói được dòng nào sai)*.

---

## 11. Mô hình dữ liệu

Bốn bảng nằm trong database **ĐƠN VỊ-NĂM** `<MÃ>_<NĂM>`, **không** ở `KT2000_Base`.

Nhân sự là dữ liệu **CỦA** đơn vị, không phải danh mục dùng chung như `DM_TK`.

> **Hệ quả phải biết:** database tách theo NĂM nên nhân sự cũng theo năm. Mở năm 2027 thì `<MÃ>_2027` có bảng RỖNG. Đây là đánh đổi **đã chấp nhận** (chốt Trường 20/08) — khuôn Excel gốc cũng một file một năm.

| Bảng | Script | Ghi chú |
|---|---|---|
| `NHAN_SU` | 025 (Ver 18) | 26 cột. `so_cmnd` là `NVARCHAR(20)` **chứ không phải số** — số CMND có thể bắt đầu bằng 0 |
| `HOP_DONG` | 025 (Ver 18) | 29 cột. FK → `NHAN_SU(id)`, **không CASCADE** |
| `CHAM_CONG` | 026 (Ver 19) | `ngay_01..ngay_31 NVARCHAR(4)`, `UNIQUE (nhan_su_id, thang)` |
| `BANG_LUONG` | 026 (Ver 19) | `UNIQUE (nhan_su_id, thang)` |

`ngay_NN` là `NVARCHAR(4)` chứ không `CHAR(1)`: ký hiệu TT200 có `Cô`, `TS`, `NB`, `LĐ`. **31 cột rời chứ không một cột JSON** — kế toán phải lọc/sửa từng ngày trên lưới, và `SELECT` phải đọc được bằng SSMS khi đối chiếu tay.

`luong_thuc_te` là cột **duy nhất** dùng `DECIMAL(18,2)`. Cột tính được (`tong_phu_cap`, `tong_luong`, `khau_tru_bh`, `thuc_linh`) vẫn **lưu thật** chứ không tính lúc đọc: bảng lương là chứng từ đã phát cho người lao động, đổi công thức năm sau mà bảng cũ tự tính lại ra số khác là sai.

> ⚠ `NHAN_SU` **chưa có UNIQUE constraint** nào trên `ma_ns` / `so_cmnd`. Chống trùng hiện chỉ ở tầng ứng dụng. Muốn chặn tận gốc cần script `027`.

---

## 12. CSS — hai cái bẫy đã gặp thật

### 12.1 Chuỗi flex trong modal ĐỨT vì antd v6

Dự án chạy **antd 6.5.2**. Bản 6 **bỏ lớp vỏ `.ant-spin-nested-loading`** — `Spin` giờ render thẳng `.ant-spin > .ant-spin-container`.

Chuỗi flex chỉ liệt kê tên **cũ của v5** thì `.ant-spin` nằm giữa `.ant-table-wrapper` và `.ant-table-container` không được nối vào chuỗi. **Đứt một mắt → thân bảng co về 0 → lưới TRẮNG TRƠN dù dữ liệu đã về đủ** (đếm "24/24 người" vẫn đúng).

Chuỗi đúng, giữ cả tên cũ để còn chạy nếu hạ lại v5:

```css
.hd-modal .hd-bang .ant-spin-nested-loading,
.hd-modal .hd-bang .ant-spin,            /* ← PHẢI CÓ ở antd v6 */
.hd-modal .hd-bang .ant-spin-container,
.hd-modal .hd-bang .ant-table-wrapper,
.hd-modal .hd-bang .ant-table,
.hd-modal .hd-bang .ant-table-container { flex: 1 1 0; min-height: 0; ... }
```

Cùng lỗi này còn ở `bao-cao-thue.css` (`.bang-ra-soat-cheo`) — đã vá.

### 12.2 Chiều cao thân bảng phải tính bằng JS

`useChieuCaoBang(truDi)` trả `max(160, innerHeight − truDi)`, đưa vào **`scroll.y`**.

Hai lối đã thử và **cả hai đều hỏng** (21/08):
- Nối chuỗi flex xuống `.ant-table-body` → rc-table còn lớp bọc trung gian, đứt một mắt là thân bảng về 0.
- Ép `height` cứng bằng CSS → hộp to ra nhưng antd vẫn **ĐO theo `scroll.y`** đang là 1px, nên chỉ dựng đúng số dòng vừa 1px.

**Đưa số thật vào `scroll.y` là cách duy nhất antd hiểu**, vì chính nó dùng số đó để quyết định dựng bao nhiêu dòng.

### 12.3 Lớp class chính

| Class | Việc |
|---|---|
| `.hop-dong` | Trang chính. **KHÔNG ép flex/height** — lưới đơn vị vài chục dòng, để Card tự cao |
| `.hd-modal` | Thân modal: `height:100%` + flex column |
| `.hd-thanh` | Thanh nút trong modal, `flex: none` |
| `.hd-vung-bang` | Vùng bảng nuốt phần còn lại |
| `.hd-bang` | Lưới trong modal |
| `.hd-kq-doc` / `.hd-kq-dau` | Bảng kết quả đọc file |
| `.hd-chua-mo` | Dòng đơn vị chưa mở năm |
| `.cc-o` / `.cc-cuoi-tuan` | Ô nhập chấm công / nền cuối tuần |
| `.bl-nhap` / `.bl-cong` | Dòng nháp bảng lương / dòng tổng |
| `.hd-tha` | Ô kéo thả file |

---

## 13. In và xuất Excel

**Print** dùng `inGiay()` sẵn có. Chấm công và bảng lương in **A4 ngang** (31 cột / 18 cột không vừa khổ dọc). Bản in chấm công nén `padding: 2px 1px`, `font-size: 10px`.

**Xuất Excel** dùng SpreadsheetML 2003 (`xuatExcel.ts`), **không thêm thư viện**: dự án chưa có sheetjs/exceljs, thêm ~400KB vào bundle chỉ để đổ vài chục dòng là không đáng. **Không** xuất HTML đổi đuôi `.xls` — Excel 2016+ cảnh báo *"định dạng không khớp phần mở rộng"* mỗi lần mở, kế toán tưởng file hỏng.

**`mauInHopDong.ts`** sinh HTML tờ HĐLĐ: `htmlHopDong(x, tenDonVi)` → `inHopDong()` (mở hộp thoại in) và `xemTruocHopDong()` (mở tab xem trước). Giữ nguyên câu chữ khuôn Excel — BR-HD-05.

---

## 14. Ngoài phạm vi — và vì sao

| Việc | Lý do loại |
|---|---|
| **Bút toán lương vào sổ** (Nợ 642/641 / Có 334, 338) | Đụng engine định khoản — vùng lõi chung (luật #10). Cần spec riêng + Leader duyệt |
| **Tự tính thuế TNCN** | Cần số người phụ thuộc, thu nhập luỹ kế, khoản miễn thuế. Khuôn mẫu không có |
| **Làm thêm giờ** (Điều 98) | Khuôn VĨNH HOÀN không có cột này. Đã chừa `cong_them_gio` |
| **Hồ sơ BHXH điện tử** | Cần tích hợp cổng BHXH |
| **Máy chấm công vân tay/thẻ** | Làm sau khi màn nhập tay chạy ổn |
| **Nghỉ phép năm còn lại** | Cần quy định phép từng đơn vị; chưa có nguồn |
| **Chuyển nhân sự sang năm mới** | Mục 11 — đánh đổi đã chấp nhận. Nếu cần, làm nút "Sao chép nhân sự từ năm trước" |

---

## 15. Nợ kỹ thuật đã biết

| # | Vấn đề | Mức |
|---|---|---|
| 1 | **Module không ghi ActivityLog** — vi phạm luật #7. Bảng lương là chứng từ tiền; không có vết thì không trả lời được *"ai bấm Tính lại tháng 3 làm mất số tạm ứng tôi vừa gõ?"*. Cần ghi ở `PUT /bang-luong`, `PUT /cham-cong`, `POST /bang-luong/tinh` | ⚠ Cao |
| 2 | **`ngayCongChuan` không đi cùng đường Lưu.** Sửa ô chuẩn từ 21→26 rồi bấm Lưu mà không bấm Tính → mọi dòng vẫn mang số tính theo 21, không có gì báo thao tác vừa rồi vô tác dụng. *Đề xuất: FE khoá nút Lưu khi `ngayCongChuan` khác `ds[0].ngayCongChuan`* | ⚠ Cao |
| 3 | **Lưới bảng lương không sửa được** — `tam_ung` và `thue_tncn` không có đường nào vào hệ thống, luôn NULL. Mà `thue_tncn` nhập tay chính là BR-BL-08. *Đề xuất: cho sửa đúng 3 cột `tamUng`, `thueTncn`, `ghiChu`* | Trung bình |
| 4 | **`TinhMotDong` không idempotent** (mục 8.1). Chưa hỏng vì mỗi dòng chỉ đi qua một lần, nhưng khi làm #3 là dính ngay | Trung bình |
| 5 | **`NHAN_SU` chưa có UNIQUE** trên `ma_ns`/`so_cmnd`. Hai kế toán nhập cùng lúc trên cùng đơn vị về lý thuyết có thể đụng mã | Thấp |

---

## 16. Căn cứ pháp lý

### 16.1 Bảo hiểm bắt buộc — mức 2026

| Khoản | NLĐ | DN |
|---|---|---|
| BHXH | 8% | 17% |
| BHYT | 1,5% | 3% |
| BHTN | 1% | 1% |
| TNLĐ-BNN | — | 0,5% |
| **Tổng** | **10,5%** | **21,5–22%** |

Trần đóng: **20 lần mức tham chiếu** = 46,8 triệu/tháng. Sàn: lương tối thiểu vùng.

### 16.2 Ký hiệu chấm công — TT200/2014/TT-BTC mẫu 01a-LĐTL

| Ký hiệu | Ý nghĩa | Tính công |
|---|---|---|
| `SP` | Lương sản phẩm | ✔ |
| `+` / `X` | Lương thời gian | ✔ |
| `Ô` | Ốm, điều dưỡng | ✘ |
| `Cô` | Con ốm | ✘ |
| `TS` | Thai sản | ✘ |
| `T` | Tai nạn | ✘ |
| `P` | Nghỉ phép | ✔ |
| `H` | Hội nghị, học tập | ✔ |
| `N` | Ngừng việc | ✘ |
| `NB` | Nghỉ bù | ✔ |
| `NN` | Làm thêm ngày nghỉ | — *(tính riêng)* |
| `LĐ` | Lao động nghĩa vụ | ✘ |
| `L` | Nghỉ lễ | ✘ *(hưởng nguyên lương, không cộng công)* |
| `CN` | Chủ nhật | ✘ |
| `0` | Nghỉ không lương | ✘ |
| `1` | Đi làm *(khuôn rút gọn VĨNH HOÀN)* | ✔ |

### 16.3 Thuế TNCN — biểu 5 bậc, từ kỳ tính thuế 2026

| Bậc | Thu nhập tính thuế/tháng | Thuế suất |
|---|---|---|
| 1 | Đến 10 triệu | 5% |
| 2 | Trên 10 – 30 triệu | 10% |
| 3 | Trên 30 – 60 triệu | 20% |
| 4 | Trên 60 – 100 triệu | 30% |
| 5 | Trên 100 triệu | 35% |

Giảm trừ bản thân **15,5 triệu/tháng**; người phụ thuộc **6,2 triệu/tháng**.
→ Căn cứ **BR-BL-08**: mọi NV trong khuôn mẫu (~10,3 triệu) đều **dưới** ngưỡng chịu thuế.

### 16.4 Khác

- **Ngày công chuẩn** — Điều 54 NĐ 145/2020/NĐ-CP: DN tự chọn (24, 26, hoặc số ngày làm việc thực). → BR-BL-01.
- **Làm thêm giờ** — Điều 98 BLLĐ 2019: ngày thường 150% · ngày nghỉ tuần 200% · lễ Tết 300%.

---

## 17. Nguồn dữ liệu chuẩn đối chiếu

`test/hopdong/`:
- `Copy of HDLD_2025_VINH_HOAN.xlsx` — 12 sheet HĐLĐ, mỗi nhân sự một sheet, cùng một mẫu. So sheet 1 với sheet 2 thì **chỉ 7 ô đổi theo người** (A2 số HĐ · D10 họ tên · C11 ngày sinh · C12 nghề nghiệp · C13 CMTND · F20 chức danh · C66 ký tên) → căn cứ tách **hai bảng** `NHAN_SU` / `HOP_DONG`.
- `BANG_LUONG_2025_VINH_HOAN_BAN_IN.xls` — 26 sheet: `DS_NV` · `THANG 1–12` · `cc01–cc12` · `tonghop`.

`C12` (Nghề nghiệp) và `F20` (Chức danh chuyên môn) **luôn bằng nhau** ở cả 12 sheet, nhưng vẫn tách hai cột: đó là hai khái niệm khác nhau trên tờ HĐLĐ, gộp lại thì lúc cần khác nhau không tách ra được nữa.

---

## 18. Nguồn tra cứu

- [Tỷ lệ đóng BHXH, BHYT, BHTN mới nhất 2026 — Thư viện pháp luật](https://thuvienphapluat.vn/chinh-sach-phap-luat-moi/vn/ho-tro-phap-luat/tu-van-phap-luat/102567/ty-le-dong-bhxh-bhyt-bhtn-moi-nhat-2026)
- [Mức đóng BHXH 2026: tỷ lệ, cách tính — Lạc Việt](https://lacviet.vn/muc-dong-bhxh-moi-nhat/)
- [Ký hiệu chấm công theo Thông tư 200 — Thư viện pháp luật](https://thuvienphapluat.vn/phap-luat/ky-hieu-cham-cong-theo-thong-tu-200-cac-ky-hieu-trong-bang-cham-cong-giai-thich-cac-ky-hieu-chi-tie-475295-182761.html)
- [Mẫu 01a-LĐTL bảng chấm công theo TT 200/2014/TT-BTC](https://thuvienphapluat.vn/phap-luat-doanh-nghiep/bai-viet/mau-01a-ldtl-ve-bang-cham-cong-theo-thong-tu-200-2014-tt-btc-4712.html)
- [Ngày công chuẩn tính lương — MISA AMIS](https://amis.misa.vn/119222/ngay-cong-chuan-tinh-luong/)
- [Tính lương theo ngày công thế nào là đúng — Báo Chính phủ](https://baochinhphu.vn/tinh-luong-theo-ngay-cong-the-nao-la-dung-102231019145239569.htm)
- [Cách tính thuế TNCN 2026 theo mức giảm trừ gia cảnh mới — LuatVietnam](https://luatvietnam.vn/thue-phi-le-phi/cach-tinh-thue-tncn-2026-565-106276-article.html)
- [Biểu thuế TNCN luỹ tiến 2026 (5 bậc) — Thư viện pháp luật](https://thuvienphapluat.vn/chinh-sach-phap-luat-moi/vn/ho-tro-phap-luat/chinh-sach-moi/100277/bieu-thue-tncn-luy-tien-2026-bieu-thue-5-bac)
- [Cách tính lương làm thêm giờ 2026 — AZTAX](https://aztax.com.vn/cach-tinh-tien-luong-lam-them-gio-moi-nhat/)
