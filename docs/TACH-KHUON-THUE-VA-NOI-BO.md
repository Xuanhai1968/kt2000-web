# Tách khuôn THUẾ và NỘI BỘ khi tạo database

> Ngày: 12/08/2026
> Code: `KT2000.Api/Services/AdminService.cs`, `KT2000.Api/KT2000.Api.csproj`
> Schema: `database/015_tenant_nb.sql` (khuôn NB gộp)
>
> Script dọn đã **chạy xong một lần** ngày 12/08/2026 và **không giữ** trong
> `database/` — toàn văn lưu ở mục 9 dưới đây, cần thì chép ra chạy lại.

## 1. Triệu chứng

Tạo đơn vị **thuế** hoặc mở năm mới cho đơn vị thuế, nhưng database sinh ra lại
có cả bảng và cột của **nội bộ**:

| Nơi | Thứ thừa ra |
|---|---|
| Bảng | `GOI_HD`, `GOI_HD_LINE`, `DM_KH_NB`, `DM_HANG_NB`… |
| `HOA_DON` | `ma_nvkd`, `ma_nvvc`, `ma_goi` |
| `HOA_DON_LINE` | `he_so_qd`, `sl_quy_doi`, `la_hang_tang`, `ngay_nh_l` |

Hậu quả thấy rõ nhất ở màn Danh sách hóa đơn: viết SQL đọc mấy cột đó thì
database thuế **cũ** (chưa chạy 015) ném `Invalid object name`, còn database
**mới** thì bảng thuế phình thêm 7 cột không ai ghi vào.

## 2. Nguyên nhân

`AdminService.CreateTenantDatabase()` gọi `ApplyNbTables()` cho **MỌI** đơn vị,
không hề nhìn `TenantType`:

```csharp
// TRƯỚC — sai
private bool CreateTenantDatabase(string code, int year)
{
    ...
    ApplyTenantTemplate(conn, dbName);
    ApplyNbTables(conn, dbName);      // <-- chạy cho cả đơn vị THUẾ
    return !existed;
}
```

Cả hai chỗ gọi đều đã có sẵn loại đơn vị trong tay (`loai` khi tạo đơn vị,
`tenant.TenantType` khi mở năm) — chỉ là không truyền xuống.

Đây là vi phạm **luật 9** (ranh giới hai sổ): sổ thuế và sổ nội bộ là hai khuôn
khác nhau, dựng lẫn vào nhau là lẫn ranh giới.

## 3. Đã sửa gì trong code

Thêm tham số `laNoiBo`, chỉ đơn vị `noibo` mới được dựng khuôn NB:

```csharp
// SAU — đúng
private bool CreateTenantDatabase(string code, int year, bool laNoiBo)
{
    ...
    ApplyTenantTemplate(conn, dbName);
    if (laNoiBo) ApplyNbTables(conn, dbName);
    return !existed;
}
```

Hai chỗ gọi:

| Hàm | Truyền vào |
|---|---|
| `CreateTenant()` — tạo đơn vị mới | `laNoiBo: loai == "noibo"` |
| `OpenYears()` — mở năm làm việc | `laNoiBo: tenant.TenantType == "noibo"` |

Nhánh "database có sẵn nhưng rỗng ruột" cũng gác cùng điều kiện.

## 4. Cột chuẩn của sổ thuế

`HOA_DON` của đơn vị thuế đúng **43 cột**, kết thúc ở cột tính `huong`:

```
ma_hd, ngay, thang, ngay_nh, so_ptc, ma_kh, ma_tv, ten_tv, khhd, vat,
tien_vat, tien_ck, mst, so_hd, dia_chi, nguoi_giao_dich, ghi_chu,
ghi_no, ghi_co, ghi_no_vat, ghi_co_vat, ghi_no_ck, ghi_co_ck,
ma_ct_nck, ma_ct_cck, edit_vat, edit_ck, ma_ct_no, ma_ct_co,
tich_chat_hd_lienquan, loai_hd_lienquan, mau_so_hd_lienquan,
khhd_lienquan, sohd_lienquan, ngay_lienquan, trang_thai_hd_lien_quan,
created_by, created_at, updated_by, updated_at, ten_kh, tthai_hd, huong
```

Khuôn này do `010_tenant_template_v6.sql` dựng và **tự đủ** — có sẵn cột tính
`huong` (VAO_/RA_) cùng `IX_HOA_DON_huong`, `UX_HOA_DON_BR01`. Không cần 015.

Database nội bộ thì nhiều hơn (46–47 cột) — đó là **đúng**, không phải lỗi.

## 5. Script dọn — chạy một phát

Làm cả ba việc trong một lần chạy: **kiểm tra → dọn → kiểm tra lại**.
Toàn văn ở mục 9; chép ra file rồi:

```
sqlcmd -S 192.168.0.106,1433 -U sa -P <pw> -C -N ^
       -i don_khuon_nb.sql -o don_khuon_nb.log
```

### Cửa an toàn

| Luật | Cách làm |
|---|---|
| Không đụng đơn vị NB | Đọc `TenantType='noibo'` từ `KT2000_Master`, loại ra khỏi danh sách |
| Chỉ xóa khi khuôn NB **rỗng** | Cộng số dòng mọi bảng NB + số đơn NB trong `HOA_DON`; còn dòng nào thì bỏ qua và in cảnh báo |
| Không đụng sổ thuế | Chỉ xóa đúng danh sách bảng/cột NB đã liệt kê |
| Chạy lại vô hại | Mọi bước đều bọc `IF EXISTS` |

Nhận diện đơn vị NB bằng cách tra Master theo mã đơn vị (tên DB bỏ hậu tố năm),
**không** đoán theo chuỗi `_NB` trong tên.

### Các bước

1. Xóa `GOI_HD_LINE` → `GOI_HD` (con trước, cha sau vì có khóa ngoại)
2. Xóa các bảng `*_NB` theo vòng lặp, mỗi vòng bỏ bảng không còn ai tham chiếu
3. Bỏ `IX_HOA_DON_ma_goi`, `IX_HOA_DON_ma_nvvc` **rồi mới** drop 3 cột trên `HOA_DON`
4. Drop 4 cột trên `HOA_DON_LINE` (gỡ default constraint trước — `la_hang_tang` là `BIT NOT NULL DEFAULT 0`)
5. Trả cột tính `huong` về định nghĩa thuần thuế, dựng lại 2 index
6. Ghi `SCHEMA_VERSION = 11`

### Ba cái bẫy đã gặp khi chạy thật

| Lỗi | Nguyên nhân | Cách xử lý |
|---|---|---|
| `Msg 5074 — index is dependent on column` | Drop cột trước khi bỏ index dựa trên nó | Đảo thứ tự: bỏ index trước |
| `Msg 1934 — QUOTED_IDENTIFIER` | `sqlcmd` mặc định **tắt** option này, mà sửa cột tính có index thì bắt buộc bật | Chèn `SET QUOTED_IDENTIFIER ON;` vào đầu mỗi khối động |
| Mất hẳn cột `huong` | Bước 5 drop rồi mới add lại; lần chạy trước đứt giữa hai lệnh | Thêm bước **3b tự vá**: thiếu `huong` thì dựng lại trước khi làm gì khác |

Bẫy thứ ba đáng nhớ nhất: nó làm `AK_GLOBAL_2025` mất cột `huong` sau lần chạy
lỗi. Script hiện tại tự chữa lành, chạy lại là xong.

## 6. Kết quả thực tế

Chạy trên `192.168.0.106` ngày 12/08/2026:

```
Tong ket: da don 11 | sach san 5 | bo qua 0
```

| Nhóm | Số DB | Trạng thái |
|---|---|---|
| Thuế — đã dọn | 11 | 43 cột, đúng chuẩn |
| Thuế — sạch sẵn | 5 | 43 cột, đúng chuẩn |
| Nội bộ | 2 | Giữ nguyên khuôn NB (46 / 47 cột) |

Đã dọn: `ANH_DAO_2025`, `BAO_HAN_2025/2026`, `HOA_SANG_2025/2026`,
`THAI_TUAN_2025/2026`, `TUAN_NGA_2026`, `USA_MEVA_2026`, `XUAN_QUYNH_2025/2026`
(+ `AK_GLOBAL_2025` vá lại `huong`).

Giữ nguyên: `TUAN_NGA_NB_2026`, `USA_MEVA_NB_2026`.

### Đối chiếu dữ liệu sau khi dọn

| Database | Số HĐ | VAO | RA | huong NULL | Số line |
|---|---|---|---|---|---|
| THAI_TUAN_2026 | 65 | 19 | 46 | 0 | 104 |
| TUAN_NGA_2025 | 60 | 52 | 8 | 0 | 196 |
| HOA_SANG_2026 | 170 | 170 | 0 | 0 | 461 |

Dữ liệu nguyên vẹn, `huong` phân loại đúng, đủ 7 index trên `HOA_DON`.

## 7. Gộp năm script NB thành một

Nhân tiện dọn luôn phần script. Khuôn NB trước đây nằm rải năm file phải chạy
**đúng thứ tự** mới ra khuôn đúng (014 sửa bảng của 013, 017 sửa bảng của 015),
mà thứ tự lại nằm trong mảng của `ApplyNbTables()` chứ không nằm trong file —
đọc file SQL không thấy, xếp nhầm thì lỗi câm.

| Trước | Sau |
|---|---|
| `016_master_linked_tenant.sql` | → `015_tenant_nb.sql` phần 0 |
| `013_tenant_nb_donhang.sql` | → phần 1 |
| `014_tenant_nb_bosung.sql` | → phần 2 |
| `015_nb_hoadon_goi.sql` | → phần 3–5, 7 |
| `017_goi_hd_line_tri_gia.sql` | → phần 6 (gộp thẳng `tri_gia` vào `CREATE TABLE`) |

Cột `tri_gia` giờ khai luôn trong `CREATE TABLE GOI_HD_LINE`, nhưng vẫn giữ một
lệnh `ALTER` có rào cho database dựng bằng bản cũ (đã có bảng, chưa có cột).

`ApplyNbTables()` từ đọc bốn resource còn đọc một; `csproj` cũng chỉ còn một
`EmbeddedResource`. `LogicalName` giữ nguyên `KT2000.Api.tenant_nb.sql`.

### Cạm bẫy: một file, hai database

Phần 0 (`LinkedTenantCode`) tác động lên **KT2000_Master**, các phần còn lại lên
**database đơn vị-năm**. Không viết `USE KT2000_Master` được, vì `ApplyNbTables()`
gọi file này kèm tiền tố `USE [<db đơn vị>]` — câu `USE` trong file sẽ bị ghi đè
và cột rơi nhầm vào database đơn vị.

Cách xử lý: phần 0 chỉ tên database ngay trong lệnh
(`KT2000_Master.dbo.Tenants`, `KT2000_Master.sys.sp_executesql`) nên không đổi
ngữ cảnh của cả mẻ.

### Đánh số lại `database/`

Sau khi gộp thì số bị trùng (hai file 013) và thủng (mất 015–017). Đã xếp lại
liên tục **001–016**:

| Cũ | Mới |
|---|---|
| `013_tenant_nb.sql` (vừa gộp) | `015_tenant_nb.sql` |
| `018_seed_usa_meva_nb.sql` | `016_seed_usa_meva_nb.sql` |

Script dọn (từng đánh số 019) **không giữ lại** — nó là việc chạy một lần, không
phải khuôn schema. Toàn văn ở mục 9.

### Đã thử chạy thật

Chạy `015_tenant_nb.sql` lên `TUAN_NGA_NB_2026` (đã có sẵn khuôn + 5 đơn):

| Kiểm tra | Kết quả |
|---|---|
| Bảng NB | 4 — giữ nguyên |
| Đơn NB | 5 — giữ nguyên |
| `GOI_HD_LINE.tri_gia` | có |
| Cột NB trên `HOA_DON` | 3 |
| `Master.Tenants.LinkedTenantCode` | có, `TUAN_NGA_NB → TUAN_NGA` đúng |
| `THAI_TUAN_2026` (thuế) | vẫn 43 cột, không bị đụng |

## 8. Còn nợ

**Ba database chậm nhiều script.** `TUAN_NGA_2025`, `HUY_THANH_2025`,
`HUY_THANH_2026` đang ở `SCHEMA_VERSION = 6` trong khi hiện tại là 11. Chúng
sạch khuôn NB (vì tạo trước khi có script NB) nên không ảnh hưởng việc này,
nhưng vẫn thiếu những gì các script sau đó thêm vào. Cần rà riêng.

**Khuôn NB vẫn sửa cột `huong` chung.** Phần 4 của `015_tenant_nb.sql` mở rộng
`huong` để nhận thêm mã đơn NB kiểu `V125`/`R236`. Giờ khuôn này chỉ chạy cho
đơn vị NB nên không còn ảnh hưởng sổ thuế, nhưng nếu sau này ai gọi lại
`ApplyNbTables()` cho database thuế thì lỗi cũ quay về. Bản thân khối đó đã có
cửa chặn (chỉ chạy khi `HOA_DON` chưa có hóa đơn thuế nào) nên rủi ro thấp.

## 9. Toàn văn script dọn (đã chạy 12/08/2026)

Giữ lại để chạy lại khi cần. Đổi tên file/log theo ý, nội dung không phụ thuộc
tên.

```sql

-- ============================================================================
-- 019_don_khuon_nb_khoi_db_thue.sql  (SCHEMA_VERSION = 11)
--
-- CHẠY MỘT PHÁT: kiểm tra -> dọn -> kiểm tra lại. Không cần chạy file nào khác.
--
-- VẤN ĐỀ: AdminService.CreateTenantDatabase() trước đây gọi ApplyNbTables() cho
-- MỌI đơn vị, không nhìn TenantType. Hậu quả: database của đơn vị THUẾ thuần
-- cũng mọc ra khuôn NỘI BỘ —
--     bảng : GOI_HD, GOI_HD_LINE, DM_KH_NB, DM_HANG_NB (và các bảng *_NB khác)
--     cột  : HOA_DON      + ma_nvkd, ma_nvvc, ma_goi
--            HOA_DON_LINE + he_so_qd, sl_quy_doi, la_hang_tang, ngay_nh_l
-- Sổ thuế phình thêm 7 cột chẳng ai ghi, lại lẫn ranh giới hai sổ (luật 9).
--
-- Code đã sửa (CreateTenantDatabase nhận tham số laNoiBo) nên KHÔNG mọc lại nữa.
-- File này dọn phần đã lỡ sinh ra.
--
-- AN TOÀN:
--   * Chỉ chạy trên database của đơn vị KHÔNG PHẢI 'noibo' (đọc từ KT2000_Master).
--   * Chỉ xóa khi khuôn NB RỖNG HOÀN TOÀN — còn một dòng là bỏ qua, báo ra màn hình.
--   * Không đụng bảng/cột nào của sổ thuế.
--   * Chạy lại nhiều lần vô hại (idempotent).
--
-- CÁCH CHẠY (lưu luôn log ra file):
--   sqlcmd -S 192.168.0.106,1433 -U sa -P <pw> -C -N ^
--          -i 019_don_khuon_nb_khoi_db_thue.sql -o 019_ket_qua.log
-- ============================================================================
SET NOCOUNT ON;

PRINT N'==================================================================';
PRINT N'  019 — DỌN KHUÔN NỘI BỘ KHỎI DATABASE THUẾ';
PRINT N'  Thời điểm chạy: ' + CONVERT(NVARCHAR(30), SYSDATETIME(), 120);
PRINT N'  Máy chủ: ' + @@SERVERNAME;
PRINT N'==================================================================';
PRINT N'';

-- ###########################################################################
-- PHẦN 1 — KIỂM TRA TRƯỚC KHI DỌN
-- ###########################################################################
PRINT N'----- PHẦN 1: HIỆN TRẠNG TRƯỚC KHI DỌN -----';

IF OBJECT_ID('tempdb..#nb') IS NOT NULL DROP TABLE #nb;
CREATE TABLE #nb (Code NVARCHAR(50) PRIMARY KEY);
INSERT INTO #nb (Code)
SELECT Code FROM KT2000_Master.dbo.Tenants WHERE TenantType = N'noibo';

IF OBJECT_ID('tempdb..#kq') IS NOT NULL DROP TABLE #kq;
CREATE TABLE #kq (
    db_name       SYSNAME,
    ma_don_vi     NVARCHAR(50),
    la_noi_bo     BIT,
    co_goi_hd     INT,
    co_bang_nb    INT,
    cot_nb_hoadon INT,
    cot_nb_line   INT,
    so_hd_thue    INT,
    so_don_nb     INT
);

DECLARE @db SYSNAME, @sql NVARCHAR(MAX);

-- Gom hiện trạng mọi database đơn vị. Tách thành thủ tục con vì phải chạy lại y
-- hệt ở PHẦN 3 để đối chiếu trước/sau.
DECLARE cur CURSOR LOCAL FAST_FORWARD FOR
    SELECT name FROM sys.databases
     WHERE name NOT IN ('master','tempdb','model','msdb','KT2000_Master','KT2000_Base')
       AND state = 0                     -- chỉ DB đang ONLINE
     ORDER BY name;
OPEN cur;
FETCH NEXT FROM cur INTO @db;
WHILE @@FETCH_STATUS = 0
BEGIN
    IF OBJECT_ID(QUOTENAME(@db) + N'..HOA_DON') IS NOT NULL
    BEGIN
        SET @sql = N'
        INSERT INTO #kq
        SELECT
          @db,
          CASE WHEN @db LIKE ''%[_][0-9][0-9][0-9][0-9]''
               THEN LEFT(@db, LEN(@db) - 5) ELSE @db END,
          0,
          (SELECT COUNT(*) FROM ' + QUOTENAME(@db) + N'.sys.tables
            WHERE name IN (''GOI_HD'',''GOI_HD_LINE'')),
          (SELECT COUNT(*) FROM ' + QUOTENAME(@db) + N'.sys.tables
            WHERE name LIKE ''%[_]NB''),
          (SELECT COUNT(*) FROM ' + QUOTENAME(@db) + N'.sys.columns
            WHERE object_id = OBJECT_ID(''' + QUOTENAME(@db) + N'..HOA_DON'')
              AND name IN (''ma_nvkd'',''ma_nvvc'',''ma_goi'')),
          (SELECT COUNT(*) FROM ' + QUOTENAME(@db) + N'.sys.columns
            WHERE object_id = OBJECT_ID(''' + QUOTENAME(@db) + N'..HOA_DON_LINE'')
              AND name IN (''he_so_qd'',''sl_quy_doi'',''la_hang_tang'',''ngay_nh_l'')),
          (SELECT COUNT(*) FROM ' + QUOTENAME(@db) + N'.dbo.HOA_DON
            WHERE ma_hd LIKE N''VAO[_]%'' OR ma_hd LIKE N''RA[_]%''),
          (SELECT COUNT(*) FROM ' + QUOTENAME(@db) + N'.dbo.HOA_DON
            WHERE ma_hd LIKE N''V[0-9]%'' OR ma_hd LIKE N''R[0-9]%'');';
        EXEC sp_executesql @sql, N'@db SYSNAME', @db = @db;
    END
    FETCH NEXT FROM cur INTO @db;
END
CLOSE cur; DEALLOCATE cur;

UPDATE k SET la_noi_bo = 1 FROM #kq k
 WHERE EXISTS (SELECT 1 FROM #nb n WHERE n.Code = k.ma_don_vi);

SELECT
    db_name                                   AS [Database],
    CASE WHEN la_noi_bo = 1 THEN N'NB' ELSE N'THUE' END AS [Loai],
    co_goi_hd                                 AS [GOI_HD],
    co_bang_nb                                AS [Bang_NB],
    cot_nb_hoadon                             AS [Cot_NB_HD],
    cot_nb_line                               AS [Cot_NB_Line],
    so_hd_thue                                AS [HD_thue],
    so_don_nb                                 AS [Don_NB],
    CASE
      WHEN la_noi_bo = 1 THEN N'BO QUA - don vi NB, co khuon NB la dung'
      WHEN co_goi_hd = 0 AND co_bang_nb = 0 AND cot_nb_hoadon = 0 AND cot_nb_line = 0
           THEN N'OK - so thue sach'
      WHEN so_don_nb > 0
           THEN N'CANH BAO - don vi thue nhung CO DON NB, phai xem tay'
      ELSE N'CAN DON - khuon NB rong, xoa duoc'
    END                                       AS [Ket_luan]
FROM #kq
ORDER BY la_noi_bo, db_name;

-- ###########################################################################
-- PHẦN 2 — DỌN
-- ###########################################################################
PRINT N'';
PRINT N'----- PHẦN 2: TIẾN HÀNH DỌN -----';

DECLARE @n INT, @conDuLieu INT;
DECLARE @daDon INT = 0, @boQua INT = 0, @sachSan INT = 0;

DECLARE cur3 CURSOR LOCAL FAST_FORWARD FOR
    SELECT d.name
      FROM sys.databases d
     WHERE d.name NOT IN ('master','tempdb','model','msdb','KT2000_Master','KT2000_Base')
       AND d.state = 0
       -- Database của đơn vị NB thì ĐƯỢC PHÉP có khuôn NB -> loại khỏi danh sách.
       -- Ghép theo mã đơn vị (tên DB bỏ hậu tố _<năm>), không đoán theo chuỗi '_NB'.
       AND NOT EXISTS (
            SELECT 1 FROM KT2000_Master.dbo.Tenants t
             WHERE t.TenantType = N'noibo'
               AND t.Code = CASE WHEN d.name LIKE '%[_][0-9][0-9][0-9][0-9]'
                                 THEN LEFT(d.name, LEN(d.name) - 5) ELSE d.name END)
     ORDER BY d.name;

OPEN cur3;
FETCH NEXT FROM cur3 INTO @db;
WHILE @@FETCH_STATUS = 0
BEGIN
    IF OBJECT_ID(QUOTENAME(@db) + N'..HOA_DON') IS NULL
    BEGIN
        FETCH NEXT FROM cur3 INTO @db;
        CONTINUE;
    END

    -- Đã sạch sẵn thì không cần làm gì — TRỪ KHI thiếu cột huong (di sản của lần
    -- chạy đứt giữa chừng), khi đó vẫn phải vào để bước 3b dựng lại.
    IF EXISTS (SELECT 1 FROM #kq WHERE db_name = @db AND co_goi_hd = 0
                 AND co_bang_nb = 0 AND cot_nb_hoadon = 0 AND cot_nb_line = 0)
       AND EXISTS (SELECT 1 FROM sys.databases d WHERE d.name = @db)
       AND (SELECT COUNT(*) FROM sys.columns
             WHERE object_id = OBJECT_ID(QUOTENAME(@db) + N'..HOA_DON')) >= 0
    BEGIN
        SET @n = 0;
        SET @sql = N'SELECT @out = COUNT(*) FROM ' + QUOTENAME(@db) + N'.sys.columns
                      WHERE object_id = OBJECT_ID(''' + QUOTENAME(@db) + N'..HOA_DON'')
                        AND name = ''huong'';';
        EXEC sp_executesql @sql, N'@out INT OUTPUT', @out = @n OUTPUT;
        IF @n > 0
        BEGIN
            SET @sachSan = @sachSan + 1;
            FETCH NEXT FROM cur3 INTO @db;
            CONTINUE;
        END
    END

    -- ---------- CỬA AN TOÀN: khuôn NB phải RỖNG ----------
    -- Cộng số dòng của mọi bảng NB + số đơn hàng NB nằm nhờ trong HOA_DON
    -- (đơn NB có ma_hd kiểu V125/R236, khác hẳn VAO_/RA_ của hóa đơn thuế).
    SET @conDuLieu = 0;
    SET @sql = N'
        DECLARE @t TABLE(n INT);
        DECLARE @q NVARCHAR(MAX) = N''SELECT 0 WHERE 1=0'';
        SELECT @q = @q + N'' UNION ALL SELECT COUNT(*) FROM '' + QUOTENAME(name)
          FROM ' + QUOTENAME(@db) + N'.sys.tables
         WHERE name LIKE ''%[_]NB'' OR name IN (''GOI_HD'',''GOI_HD_LINE'');
        INSERT INTO @t EXEC ' + QUOTENAME(@db) + N'.sys.sp_executesql @q;
        SELECT @out = ISNULL(SUM(n),0) FROM @t;
        SELECT @out = @out + (SELECT COUNT(*) FROM ' + QUOTENAME(@db) + N'.dbo.HOA_DON
                               WHERE ma_hd LIKE N''V[0-9]%'' OR ma_hd LIKE N''R[0-9]%'');';
    EXEC sp_executesql @sql, N'@out INT OUTPUT', @out = @conDuLieu OUTPUT;

    IF @conDuLieu > 0
    BEGIN
        PRINT N'  BO QUA  ' + @db + N' -- khuon NB CON '
            + CAST(@conDuLieu AS NVARCHAR(20)) + N' dong du lieu, phai xem tay';
        SET @boQua = @boQua + 1;
        FETCH NEXT FROM cur3 INTO @db;
        CONTINUE;
    END

    -- ---------- 1. Xóa bảng NB (con trước, cha sau vì có khóa ngoại) ----------
    SET @sql = N'SET QUOTED_IDENTIFIER ON; USE ' + QUOTENAME(@db) + N';
        IF OBJECT_ID(''GOI_HD_LINE'') IS NOT NULL DROP TABLE GOI_HD_LINE;
        IF OBJECT_ID(''GOI_HD'')      IS NOT NULL DROP TABLE GOI_HD;';
    EXEC sp_executesql @sql;

    -- Các bảng *_NB còn lại: xóa theo vòng, mỗi vòng bỏ bảng nào KHÔNG còn ai
    -- tham chiếu tới. Làm vậy khỏi phải biết trước thứ tự phụ thuộc.
    SET @sql = N'SET QUOTED_IDENTIFIER ON; USE ' + QUOTENAME(@db) + N';
        DECLARE @i INT = 0, @con INT = 1, @b SYSNAME, @c NVARCHAR(MAX);
        WHILE @con > 0 AND @i < 10
        BEGIN
            SET @con = 0; SET @i = @i + 1;
            DECLARE cb CURSOR LOCAL FAST_FORWARD FOR
                SELECT t.name FROM sys.tables t
                 WHERE t.name LIKE ''%[_]NB''
                   AND NOT EXISTS (SELECT 1 FROM sys.foreign_keys f
                                    WHERE f.referenced_object_id = t.object_id
                                      AND f.parent_object_id <> t.object_id);
            OPEN cb; FETCH NEXT FROM cb INTO @b;
            WHILE @@FETCH_STATUS = 0
            BEGIN
                SET @c = N''DROP TABLE '' + QUOTENAME(@b);
                EXEC sp_executesql @c;
                SET @con = @con + 1;
                FETCH NEXT FROM cb INTO @b;
            END
            CLOSE cb; DEALLOCATE cb;
        END';
    EXEC sp_executesql @sql;

    -- ---------- 2. Gỡ 3 cột NB trên HOA_DON ----------
    -- THỨ TỰ BẮT BUỘC: index dựa trên cột phải bỏ TRƯỚC, nếu không SQL Server ném
    -- Msg 5074 "The index ... is dependent on column ...". Hai index này do script
    -- 015 dựng riêng cho khuôn NB, sổ thuế không dùng.
    SET @sql = N'SET QUOTED_IDENTIFIER ON; USE ' + QUOTENAME(@db) + N';
        IF EXISTS (SELECT 1 FROM sys.indexes
                    WHERE name = ''IX_HOA_DON_ma_goi'' AND object_id = OBJECT_ID(''HOA_DON''))
            DROP INDEX IX_HOA_DON_ma_goi ON HOA_DON;
        IF EXISTS (SELECT 1 FROM sys.indexes
                    WHERE name = ''IX_HOA_DON_ma_nvvc'' AND object_id = OBJECT_ID(''HOA_DON''))
            DROP INDEX IX_HOA_DON_ma_nvvc ON HOA_DON;

        DECLARE @c SYSNAME, @dc SYSNAME, @q NVARCHAR(MAX);
        DECLARE cc CURSOR LOCAL FAST_FORWARD FOR
            SELECT name FROM sys.columns
             WHERE object_id = OBJECT_ID(''HOA_DON'')
               AND name IN (''ma_nvkd'',''ma_nvvc'',''ma_goi'');
        OPEN cc; FETCH NEXT FROM cc INTO @c;
        WHILE @@FETCH_STATUS = 0
        BEGIN
            SELECT @dc = dc.name FROM sys.default_constraints dc
              JOIN sys.columns col ON col.object_id = dc.parent_object_id
                                  AND col.column_id = dc.parent_column_id
             WHERE dc.parent_object_id = OBJECT_ID(''HOA_DON'') AND col.name = @c;
            IF @dc IS NOT NULL
            BEGIN
                SET @q = N''ALTER TABLE HOA_DON DROP CONSTRAINT '' + QUOTENAME(@dc);
                EXEC sp_executesql @q; SET @dc = NULL;
            END
            SET @q = N''ALTER TABLE HOA_DON DROP COLUMN '' + QUOTENAME(@c);
            EXEC sp_executesql @q;
            FETCH NEXT FROM cc INTO @c;
        END
        CLOSE cc; DEALLOCATE cc;';
    EXEC sp_executesql @sql;

    -- ---------- 3. Gỡ 4 cột NB trên HOA_DON_LINE ----------
    SET @sql = N'SET QUOTED_IDENTIFIER ON; USE ' + QUOTENAME(@db) + N';
        DECLARE @c SYSNAME, @dc SYSNAME, @q NVARCHAR(MAX);
        DECLARE cc CURSOR LOCAL FAST_FORWARD FOR
            SELECT name FROM sys.columns
             WHERE object_id = OBJECT_ID(''HOA_DON_LINE'')
               AND name IN (''he_so_qd'',''sl_quy_doi'',''la_hang_tang'',''ngay_nh_l'');
        OPEN cc; FETCH NEXT FROM cc INTO @c;
        WHILE @@FETCH_STATUS = 0
        BEGIN
            -- la_hang_tang la BIT NOT NULL DEFAULT 0 -> chac chan co default constraint
            SELECT @dc = dc.name FROM sys.default_constraints dc
              JOIN sys.columns col ON col.object_id = dc.parent_object_id
                                  AND col.column_id = dc.parent_column_id
             WHERE dc.parent_object_id = OBJECT_ID(''HOA_DON_LINE'') AND col.name = @c;
            IF @dc IS NOT NULL
            BEGIN
                SET @q = N''ALTER TABLE HOA_DON_LINE DROP CONSTRAINT '' + QUOTENAME(@dc);
                EXEC sp_executesql @q; SET @dc = NULL;
            END
            SET @q = N''ALTER TABLE HOA_DON_LINE DROP COLUMN '' + QUOTENAME(@c);
            EXEC sp_executesql @q;
            FETCH NEXT FROM cc INTO @c;
        END
        CLOSE cc; DEALLOCATE cc;';
    EXEC sp_executesql @sql;

    -- ---------- 3b. VÁ LÀNH: huong bị mất giữa chừng ----------
    -- Bước 4 dưới đây DROP cột huong rồi mới ADD lại. Nếu lần chạy trước đứt giữa
    -- hai lệnh đó (vd sqlcmd tắt QUOTED_IDENTIFIER -> Msg 1934), database mất hẳn
    -- cột huong và mọi truy vấn lọc theo hướng chết. Dựng lại trước khi làm gì khác.
    SET @sql = N'SET QUOTED_IDENTIFIER ON; USE ' + QUOTENAME(@db) + N';
        IF NOT EXISTS (SELECT 1 FROM sys.columns
                        WHERE object_id = OBJECT_ID(''HOA_DON'') AND name = ''huong'')
        BEGIN
            EXEC sp_executesql N''
                ALTER TABLE HOA_DON ADD huong AS (
                    CASE WHEN ma_hd LIKE N''''VAO_%'''' THEN N''''VAO''''
                         WHEN ma_hd LIKE N''''RA_%''''  THEN N''''RA'''' END) PERSISTED;'';
            IF NOT EXISTS (SELECT 1 FROM sys.indexes
                            WHERE name = ''IX_HOA_DON_huong'' AND object_id = OBJECT_ID(''HOA_DON''))
                CREATE INDEX IX_HOA_DON_huong ON HOA_DON(huong, thang);
            IF NOT EXISTS (SELECT 1 FROM sys.indexes
                            WHERE name = ''UX_HOA_DON_BR01'' AND object_id = OBJECT_ID(''HOA_DON''))
                CREATE UNIQUE INDEX UX_HOA_DON_BR01 ON HOA_DON(huong, mst, khhd, so_hd);
        END';
    EXEC sp_executesql @sql;

    -- ---------- 4. Trả cột tính huong về ĐÚNG KHUÔN THUẾ ----------
    -- Script 015 mở rộng huong để nhận thêm V125/R236 của đơn NB. Sổ thuế không
    -- có loại mã đó, giữ lại chỉ tổ sai khuôn. Chỉ sửa khi cột đang mang định
    -- nghĩa NB (chứa '[0-9]'), và phải bỏ 2 index phụ thuộc trước.
    SET @sql = N'SET QUOTED_IDENTIFIER ON; USE ' + QUOTENAME(@db) + N';
        IF EXISTS (SELECT 1 FROM sys.computed_columns c
                    WHERE c.object_id = OBJECT_ID(''HOA_DON'') AND c.name = ''huong''
                      AND c.definition LIKE N''%\[0-9\]%'' ESCAPE N''\'')
        BEGIN
            IF EXISTS (SELECT 1 FROM sys.indexes
                        WHERE name = ''UX_HOA_DON_BR01'' AND object_id = OBJECT_ID(''HOA_DON''))
                DROP INDEX UX_HOA_DON_BR01 ON HOA_DON;
            IF EXISTS (SELECT 1 FROM sys.indexes
                        WHERE name = ''IX_HOA_DON_huong'' AND object_id = OBJECT_ID(''HOA_DON''))
                DROP INDEX IX_HOA_DON_huong ON HOA_DON;

            ALTER TABLE HOA_DON DROP COLUMN huong;
            EXEC sp_executesql N''
                ALTER TABLE HOA_DON ADD huong AS (
                    CASE WHEN ma_hd LIKE N''''VAO_%'''' THEN N''''VAO''''
                         WHEN ma_hd LIKE N''''RA_%''''  THEN N''''RA'''' END) PERSISTED;'';

            CREATE INDEX IX_HOA_DON_huong ON HOA_DON(huong, thang);
            -- Khuon thue 010: UNIQUE KHONG loc (BR-HD-01). Bo loc chi sinh ra o 015
            -- de don NB bo trong mst/khhd/so_hd lot ra ngoai -- so thue khong can.
            CREATE UNIQUE INDEX UX_HOA_DON_BR01 ON HOA_DON(huong, mst, khhd, so_hd);
        END';
    EXEC sp_executesql @sql;

    -- Đánh dấu database đã qua bước dọn
    SET @sql = N'SET QUOTED_IDENTIFIER ON; USE ' + QUOTENAME(@db) + N';
        IF OBJECT_ID(''SCHEMA_VERSION'') IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM SCHEMA_VERSION WHERE Ver = 11)
            INSERT INTO SCHEMA_VERSION (Ver) VALUES (11);';
    EXEC sp_executesql @sql;

    PRINT N'  DA DON ' + @db;
    SET @daDon = @daDon + 1;
    FETCH NEXT FROM cur3 INTO @db;
END
CLOSE cur3; DEALLOCATE cur3;

PRINT N'';
PRINT N'  Tong ket: da don ' + CAST(@daDon AS NVARCHAR(10))
    + N' | sach san ' + CAST(@sachSan AS NVARCHAR(10))
    + N' | bo qua ' + CAST(@boQua AS NVARCHAR(10));

-- ###########################################################################
-- PHẦN 3 — KIỂM TRA LẠI SAU KHI DỌN
-- ###########################################################################
PRINT N'';
PRINT N'----- PHẦN 3: HIỆN TRẠNG SAU KHI DỌN -----';

TRUNCATE TABLE #kq;

DECLARE cur4 CURSOR LOCAL FAST_FORWARD FOR
    SELECT name FROM sys.databases
     WHERE name NOT IN ('master','tempdb','model','msdb','KT2000_Master','KT2000_Base')
       AND state = 0
     ORDER BY name;
OPEN cur4;
FETCH NEXT FROM cur4 INTO @db;
WHILE @@FETCH_STATUS = 0
BEGIN
    IF OBJECT_ID(QUOTENAME(@db) + N'..HOA_DON') IS NOT NULL
    BEGIN
        SET @sql = N'
        INSERT INTO #kq
        SELECT
          @db,
          CASE WHEN @db LIKE ''%[_][0-9][0-9][0-9][0-9]''
               THEN LEFT(@db, LEN(@db) - 5) ELSE @db END,
          0,
          (SELECT COUNT(*) FROM ' + QUOTENAME(@db) + N'.sys.tables
            WHERE name IN (''GOI_HD'',''GOI_HD_LINE'')),
          (SELECT COUNT(*) FROM ' + QUOTENAME(@db) + N'.sys.tables
            WHERE name LIKE ''%[_]NB''),
          (SELECT COUNT(*) FROM ' + QUOTENAME(@db) + N'.sys.columns
            WHERE object_id = OBJECT_ID(''' + QUOTENAME(@db) + N'..HOA_DON'')
              AND name IN (''ma_nvkd'',''ma_nvvc'',''ma_goi'')),
          (SELECT COUNT(*) FROM ' + QUOTENAME(@db) + N'.sys.columns
            WHERE object_id = OBJECT_ID(''' + QUOTENAME(@db) + N'..HOA_DON_LINE'')
              AND name IN (''he_so_qd'',''sl_quy_doi'',''la_hang_tang'',''ngay_nh_l'')),
          (SELECT COUNT(*) FROM ' + QUOTENAME(@db) + N'.dbo.HOA_DON
            WHERE ma_hd LIKE N''VAO[_]%'' OR ma_hd LIKE N''RA[_]%''),
          (SELECT COUNT(*) FROM ' + QUOTENAME(@db) + N'.dbo.HOA_DON
            WHERE ma_hd LIKE N''V[0-9]%'' OR ma_hd LIKE N''R[0-9]%'');';
        EXEC sp_executesql @sql, N'@db SYSNAME', @db = @db;
    END
    FETCH NEXT FROM cur4 INTO @db;
END
CLOSE cur4; DEALLOCATE cur4;

UPDATE k SET la_noi_bo = 1 FROM #kq k
 WHERE EXISTS (SELECT 1 FROM #nb n WHERE n.Code = k.ma_don_vi);

SELECT
    db_name                                   AS [Database],
    CASE WHEN la_noi_bo = 1 THEN N'NB' ELSE N'THUE' END AS [Loai],
    co_goi_hd                                 AS [GOI_HD],
    co_bang_nb                                AS [Bang_NB],
    cot_nb_hoadon                             AS [Cot_NB_HD],
    cot_nb_line                               AS [Cot_NB_Line],
    so_hd_thue                                AS [HD_thue],
    CASE
      WHEN la_noi_bo = 1 THEN N'NB - giu nguyen khuon NB'
      WHEN co_goi_hd = 0 AND co_bang_nb = 0 AND cot_nb_hoadon = 0 AND cot_nb_line = 0
           THEN N'OK - so thue dung khuon chuan'
      ELSE N'VAN CON KHUON NB - xem lai'
    END                                       AS [Ket_luan]
FROM #kq
ORDER BY la_noi_bo, db_name;

-- Đối chiếu cột HOA_DON của một database thuế với CỘT CHUẨN (41 cột, kết thúc ở

-- Đối chiếu số cột HOA_DON với CỘT CHUẨN (41 cột, kết thúc ở huong).
-- sys.columns chỉ thấy database HIỆN TẠI nên phải sang từng DB đếm, không
-- CROSS APPLY thẳng được (làm vậy ra 0 hết).
PRINT N'';
PRINT N'----- SO CỘT HOA_DON (chuan thue = 43) -----';

IF OBJECT_ID('tempdb..#cot') IS NOT NULL DROP TABLE #cot;
CREATE TABLE #cot (db_name SYSNAME, so_cot INT);

DECLARE cur5 CURSOR LOCAL FAST_FORWARD FOR SELECT db_name FROM #kq ORDER BY db_name;
OPEN cur5;
FETCH NEXT FROM cur5 INTO @db;
WHILE @@FETCH_STATUS = 0
BEGIN
    SET @sql = N'INSERT INTO #cot SELECT @db, COUNT(*) FROM '
             + QUOTENAME(@db) + N'.sys.columns
               WHERE object_id = OBJECT_ID(''' + QUOTENAME(@db) + N'..HOA_DON'');';
    EXEC sp_executesql @sql, N'@db SYSNAME', @db = @db;
    FETCH NEXT FROM cur5 INTO @db;
END
CLOSE cur5; DEALLOCATE cur5;

SELECT
    k.db_name                                  AS [Database],
    CASE WHEN k.la_noi_bo = 1 THEN N'NB' ELSE N'THUE' END AS [Loai],
    c.so_cot                                   AS [So_cot],
    CASE WHEN k.la_noi_bo = 1 THEN N'- (khuon NB co them cot)'
         WHEN c.so_cot = 43 THEN N'OK - dung cot chuan'
         ELSE N'LECH ' + CAST(c.so_cot - 43 AS NVARCHAR(10)) + N' cot' END AS [Danh_gia]
FROM #kq k JOIN #cot c ON c.db_name = k.db_name
ORDER BY k.la_noi_bo, k.db_name;

DROP TABLE #cot; DROP TABLE #kq; DROP TABLE #nb;

PRINT N'';
PRINT N'==================================================================';
PRINT N'  HOAN TAT 019';
PRINT N'==================================================================';
GO

==================================================================
  019 — DỌN KHUÔN NỘI BỘ KHỎI DATABASE THUẾ
  Thời điểm chạy: 2026-08-12 11:15:57
  Máy chủ: SERVER-HYEN\SQLEXPRESS
==================================================================
 
----- PHẦN 1: HIỆN TRẠNG TRƯỚC KHI DỌN -----
Database|Loai|GOI_HD|Bang_NB|Cot_NB_HD|Cot_NB_Line|HD_thue|Don_NB|Ket_luan
--------|----|------|-------|---------|-----------|-------|------|--------
AK_GLOBAL_2025|THUE|0|0|0|0|0|0|OK - so thue sach
ANH_DAO_2025|THUE|0|0|0|0|0|0|OK - so thue sach
BAO_HAN_2025|THUE|0|0|0|0|0|0|OK - so thue sach
BAO_HAN_2026|THUE|0|0|0|0|0|0|OK - so thue sach
HOA_SANG_2025|THUE|0|0|0|0|0|0|OK - so thue sach
HOA_SANG_2026|THUE|0|0|0|0|170|0|OK - so thue sach
HUY_THANH_2025|THUE|0|0|0|0|0|0|OK - so thue sach
HUY_THANH_2026|THUE|0|0|0|0|0|0|OK - so thue sach
MDN_NB_2025|THUE|0|0|0|0|0|0|OK - so thue sach
THAI_TUAN_2025|THUE|0|0|0|0|0|0|OK - so thue sach
THAI_TUAN_2026|THUE|0|0|0|0|65|0|OK - so thue sach
TUAN_NGA_2025|THUE|0|0|0|0|60|0|OK - so thue sach
TUAN_NGA_2026|THUE|0|0|0|0|0|0|OK - so thue sach
USA_MEVA_2026|THUE|0|0|0|0|0|0|OK - so thue sach
XUAN_QUYNH_2025|THUE|0|0|0|0|0|0|OK - so thue sach
XUAN_QUYNH_2026|THUE|0|0|0|0|0|0|OK - so thue sach
TUAN_NGA_NB_2026|NB|2|2|3|4|0|5|BO QUA - don vi NB, co khuon NB la dung
USA_MEVA_NB_2026|NB|2|5|3|4|0|3|BO QUA - don vi NB, co khuon NB la dung
 
----- PHẦN 2: TIẾN HÀNH DỌN -----
  DA DON AK_GLOBAL_2025
 
  Tong ket: da don 1 | sach san 15 | bo qua 0
 
----- PHẦN 3: HIỆN TRẠNG SAU KHI DỌN -----
Database|Loai|GOI_HD|Bang_NB|Cot_NB_HD|Cot_NB_Line|HD_thue|Ket_luan
--------|----|------|-------|---------|-----------|-------|--------
AK_GLOBAL_2025|THUE|0|0|0|0|0|OK - so thue dung khuon chuan
ANH_DAO_2025|THUE|0|0|0|0|0|OK - so thue dung khuon chuan
BAO_HAN_2025|THUE|0|0|0|0|0|OK - so thue dung khuon chuan
BAO_HAN_2026|THUE|0|0|0|0|0|OK - so thue dung khuon chuan
HOA_SANG_2025|THUE|0|0|0|0|0|OK - so thue dung khuon chuan
HOA_SANG_2026|THUE|0|0|0|0|170|OK - so thue dung khuon chuan
HUY_THANH_2025|THUE|0|0|0|0|0|OK - so thue dung khuon chuan
HUY_THANH_2026|THUE|0|0|0|0|0|OK - so thue dung khuon chuan
MDN_NB_2025|THUE|0|0|0|0|0|OK - so thue dung khuon chuan
THAI_TUAN_2025|THUE|0|0|0|0|0|OK - so thue dung khuon chuan
THAI_TUAN_2026|THUE|0|0|0|0|65|OK - so thue dung khuon chuan
TUAN_NGA_2025|THUE|0|0|0|0|60|OK - so thue dung khuon chuan
TUAN_NGA_2026|THUE|0|0|0|0|0|OK - so thue dung khuon chuan
USA_MEVA_2026|THUE|0|0|0|0|0|OK - so thue dung khuon chuan
XUAN_QUYNH_2025|THUE|0|0|0|0|0|OK - so thue dung khuon chuan
XUAN_QUYNH_2026|THUE|0|0|0|0|0|OK - so thue dung khuon chuan
TUAN_NGA_NB_2026|NB|2|2|3|4|0|NB - giu nguyen khuon NB
USA_MEVA_NB_2026|NB|2|5|3|4|0|NB - giu nguyen khuon NB
 
----- SO CỘT HOA_DON (chuan thue = 43) -----
Database|Loai|So_cot|Danh_gia
--------|----|------|--------
AK_GLOBAL_2025|THUE|43|OK - dung cot chuan
ANH_DAO_2025|THUE|43|OK - dung cot chuan
BAO_HAN_2025|THUE|43|OK - dung cot chuan
BAO_HAN_2026|THUE|43|OK - dung cot chuan
HOA_SANG_2025|THUE|43|OK - dung cot chuan
HOA_SANG_2026|THUE|43|OK - dung cot chuan
HUY_THANH_2025|THUE|43|OK - dung cot chuan
HUY_THANH_2026|THUE|43|OK - dung cot chuan
MDN_NB_2025|THUE|43|OK - dung cot chuan
THAI_TUAN_2025|THUE|43|OK - dung cot chuan
THAI_TUAN_2026|THUE|43|OK - dung cot chuan
TUAN_NGA_2025|THUE|43|OK - dung cot chuan
TUAN_NGA_2026|THUE|43|OK - dung cot chuan
USA_MEVA_2026|THUE|43|OK - dung cot chuan
XUAN_QUYNH_2025|THUE|43|OK - dung cot chuan
XUAN_QUYNH_2026|THUE|43|OK - dung cot chuan
TUAN_NGA_NB_2026|NB|46|- (khuon NB co them cot)
USA_MEVA_NB_2026|NB|47|- (khuon NB co them cot)
 
==================================================================
  HOAN TAT 019
==================================================================
```
