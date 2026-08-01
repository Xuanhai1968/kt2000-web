# WP-03 (a) — Python 2.0 vào repo + môi trường server + phát súng thử bằng tay

Sản phẩm: `tools/TRA_CUU_HDDT_2_0.py` trong repo (vá #1 password + #6 MA_HD),
server .106 cài đủ Python + Chrome, và MỘT LẦN CHẠY TAY thành công trên server
(1 đơn vị, 1 tháng) — cổng nghiệm thu trước khi viết bất kỳ dòng C# nào.

Nguyên tắc đợt này: **đổi một biến số một lần** — vì vậy nhánh DBF/TCVN CHƯA cắt
(commit riêng sau khi end-to-end chạy); vá #2 --skip_xml và #3 --stream cũng để
sau. Hôm nay chỉ 2 vá bắt buộc-trước-dữ-liệu: #1 (an toàn password) và #6
(MA_HD đúng BR-HD-01 — phải vá TRƯỚC lần nạp đầu tiên để database không bao giờ
chứa khóa định dạng cũ).

---

## 1. Đưa vào repo — 2 commit để diff kể chuyện

```
(terminal, máy Leader, tại D:\WebAPP\kt2000-web)
mkdir tools
copy <đường dẫn>\TRA_CUU_HDDT_1_3.py tools\TRA_CUU_HDDT_2_0.py
copy <đường dẫn>\XML_MAP.xlsx tools\XML_MAP.xlsx
git add tools & git commit -m "tools: TRA_CUU_HDDT 2_0 - ban goc tu 1_3 (baseline)"
```

Commit "bản gốc" trước, các vá sau — để `git diff` hiển thị đúng từng nhát dao.

## 2. Vá #1 — password qua biến môi trường (file tools/TRA_CUU_HDDT_2_0.py)

Quanh **dòng 2163** có `p.add_argument("--password", required=False)`. Ngay SAU
dòng gọi parse (kiểu `args = p.parse_args()`), thêm:

```python
    # Va #1: uu tien bien moi truong HDDT_PASSWORD (tham so dong lenh lo trong Task Manager)
    if not args.password:
        args.password = os.environ.get("HDDT_PASSWORD", "")
```

(Vẫn nhận --password để chạy tay tương thích cũ; C# sau này sẽ truyền qua env.)
Commit: "va 1: password qua bien moi truong HDDT_PASSWORD".

## 3. Vá #6 — MA_HD theo BR-HD-01 (3 vị trí)

Công thức mới: `<HUONG>_<MST phát hành>_<KHHD>_<SO_HD>` — MST phát hành lấy từ
trường `nbmst` (MST người bán) trong dữ liệu API; đầu ra thì nbmst = MST của
chính mình nên MỘT công thức phủ cả hai hướng.

- **Dòng ~1838** và **~1879** (hai chỗ giống nhau, trong vòng tải):

```python
# CŨ:
ma_hd = f"{MA_DONVI}_{mst_value}_{hd['khhdon']}_{hd['shdon']}"
# MỚI:
mst_ph = str(hd.get('nbmst') or mst_value).strip()
ma_hd = f"{huong}_{mst_ph}_{hd['khhdon']}_{hd['shdon']}"
```

(dòng 1879 dùng `hd_retry` thay `hd`. Nếu tên biến hướng trong hàm đó không phải
`huong` — nhìn tham số hàm bao quanh, nó là biến đang mang "VAO"/"RA".)

- **Dòng ~762** (nhánh hóa đơn chỉ-có-Excel, không XML):

```python
# CŨ:
ma_hd = f"{ma_donvi_norm}_{mst_norm}_{khhd}_{shd}"
# MỚI: mst người bán ở nhánh này lấy từ biến MST người bán có sẵn trong cùng hàm
#      (tên kiểu mst_nban / nbmst — nhìn 15 dòng phía trên); fallback mst_norm
ma_hd = f"{huong_norm}_{(mst_nban or mst_norm)}_{khhd}_{shd}"
```

⚠ Vị trí 762 Leader mở file soát tên biến thật trước khi sửa (mỗi bản py có thể
đặt tên hơi khác) — đây là lý do vá này làm TAY + review diff, không máy móc.
Commit: "va 6: MA_HD = HUONG_MSTphathanh_KHHD_SHD (BR-HD-01)".

Kiểm chứng vá #6 nằm ở bước 6 — nhìn MA_HD trong Excel tổng.

## 4. Cài môi trường trên SERVER .106 (Remote Desktop)

1. **Python 3.11**: https://www.python.org/downloads/ — lúc cài TICK
   "Add python.exe to PATH". Kiểm: mở CMD mới → `python --version` ra 3.11.x.
2. **Google Chrome**: cài bản thường. (Driver: webdriver_manager tự tải lần chạy
   đầu — cần internet, mà server này đằng nào cũng phải ra internet tới TCT.)
3. **Thư viện** (CMD):

```
pip install selenium webdriver-manager requests pandas openpyxl pillow ddddocr dbf pywin32
```

(`ddddocr` = giải captcha; `dbf` + `pywin32` là của nhánh DBF chưa cắt — cài tạm
cho import không gãy, sẽ gỡ cùng commit cắt nhánh.)
4. Copy từ repo lên server: `tools\TRA_CUU_HDDT_2_0.py` và `tools\XML_MAP.xlsx`
   → `D:\KT2000\tools\`. Đảm bảo `E:\DATA_HDDT` tồn tại.

## 5. Chuẩn bị 1 đơn vị thử

Chọn TUAN_NGA (hoặc đơn vị nào tiện). Cần MST + password cổng hoadondientu —
lấy từ sổ/DM_DONVI cũ. CHƯA lưu vào hệ thống (TenantCredentials là phần b) —
hôm nay truyền tay qua biến môi trường phiên CMD.

## 6. PHÁT SÚNG THỬ — chạy tay trên server (CMD thường, không cần admin)

```
set HDDT_PASSWORD=<password cổng TCT của đơn vị>
python D:\KT2000\tools\TRA_CUU_HDDT_2_0.py --run --mst "<MST>" --thang_bd "1" --thang_kt "1" --nam "2025" --loai "all" --ma_donvi "TUAN_NGA" --job_id "T1_2025_TUAN_NGA_TEST" --save_dir "E:\DATA_HDDT" --status "E:\DATA_HDDT\TUAN_NGA\T1_2025_TUAN_NGA_TEST\status.json" --events "E:\DATA_HDDT\TUAN_NGA\T1_2025_TUAN_NGA_TEST\events.jsonl" --stagedir "E:\DATA_HDDT\TUAN_NGA\T1_2025_TUAN_NGA_TEST\stage" --xml_map "D:\KT2000\tools\XML_MAP.xlsx"
```

(Chú ý: KHÔNG có --password trong lệnh — đó chính là vá #1 đang làm việc; và
KHÔNG có --to_dbf.)

**Checklist nghiệm thu phần (a):**

| # | Kiểm | Phải đạt |
|---|---|---|
| 1 | Tiến trình chạy đến hết không lỗi | Console kết thúc bình thường; status.json trạng thái cuối done/completed |
| 2 | Thư mục job | Có outputs\ (2 file Excel tổng) + raw\VAO, raw\RA (XML + Excel gốc TCT) |
| 3 | Mở Excel tổng, cột MA_HD | Định dạng MỚI: `VAO_<MST người bán>_<KHHD>_<SỐ>` — mỗi dòng VAO mang MST người bán KHÁC NHAU (vá #6 sống) |
| 4 | Đầu ra | `RA_<MST của TUAN_NGA>_...` |
| 5 | Task Manager trong lúc chạy → Details → python.exe → cột Command line | KHÔNG thấy password (vá #1 sống) |
| 6 | So số lượng HĐ tháng 1 với số trên cổng TCT (đăng nhập tay xem) | Khớp |

Qua đủ 6 mục: phần (a) khép — commit các vá + push, ghi nhật ký:
"31-07: Python 2.0 chạy trên server, MA_HD định dạng BR-HD-01, password qua env".
Phần (b) tiếp theo: TenantCredentials + nút TK Hóa đơn điện tử — rồi (c)
DownloadJobs + Worker biến lệnh tay hôm nay thành nút bấm.
