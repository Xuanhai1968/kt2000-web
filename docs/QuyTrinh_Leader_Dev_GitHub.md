# Quy trình làm việc Leader + Dev qua GitHub (hoàn thành trong 1 buổi)

```
   Issue (spec của Leader)
        │
   dev: clone → nhánh fix/... → code → push nhánh
        │
   PULL REQUEST trên GitHub  ◄── Leader review (+ dán diff cho Claude soát)
        │  Merge (nút quyết định của Leader)
        ▼
   main trên GitHub ──► máy Leader: git pull ──► deploy_build.bat ──► drop ──► update.bat ──► server
```

Ranh giới an toàn (nói rõ với dev ngay buổi đầu):
- Dev KHÔNG cần và KHÔNG có quyền gì trên server .106 — chỉ Leader chạm drop/update.
- Dev KHÔNG nhận password sa — có login SQL riêng, quyền vừa đủ.
- appsettings.json không bao giờ lên Git (đã .gitignore) — dev tự tạo từ template.

## PHẦN A — Việc của Leader trên GitHub (15 phút)

1. **Mời dev vào repo**: github.com/Xuanhai1968/kt2000-web → Settings →
   Collaborators → Add people → nhập username GitHub của dev → gửi lời mời
   (dev nhận email, bấm Accept). Role: Write.
2. **Luật "main chỉ nhận PR"**: Settings → Branches (hoặc Rules) → thêm rule cho
   `main`: ✅ Require a pull request before merging. LƯU Ý: với repo Private gói
   Free, GitHub có thể khóa tính năng này (bán kèm gói Pro) — nếu bị khóa thì
   đội 2 người dùng LUẬT MỀM: quy ước thành văn "không ai push thẳng main, kể cả
   Leader" (ghi trong CLAUDE.md dưới đây); muốn khóa cứng thì nâng GitHub Pro.
3. **Tạo Issue đầu tiên** (mẫu): tab Issues → New issue →
   - Tiêu đề: ngắn, một việc. VD "Nút Lấy HĐ điện tử: disable khi đang chạy"
   - Nội dung: (a) VFP đang thế nào / muốn web thế nào — mô tả trực quan như
     Leader vẫn tả; (b) ảnh chụp nếu có; (c) **Checklist nghiệm thu** 3-5 dòng.
   - Mỗi Issue = MỘT việc. Mười việc = mười Issue.

## PHẦN B — Setup máy dev (dev tự làm theo, ~30-45 phút)

Chép nguyên phần này gửi dev (hoặc đưa file docs/HUONG-DAN-DEV.md ở Phần D):
1. Cài: Git, VS Code, .NET 10 SDK, Node.js LTS, (khuyến nghị) extension
   Claude Code.
2. `git clone https://github.com/Xuanhai1968/kt2000-web.git`
3. Backend: copy `KT2000.Api/appsettings.template.json` → `appsettings.json`,
   điền connection string Leader cấp (login SQL riêng — xem Phần C) + Jwt Key
   dev (chuỗi bất kỳ ≥ 32 ký tự, KHÔNG dùng key server).
4. `dotnet build` phải 0 Error → `dotnet run`.
5. Frontend: `cd kt2000-web` → `npm install` → `npm run dev`. Nếu PowerShell
   báo "running scripts is disabled": chạy
   `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` rồi mở terminal mới.
6. Mở http://localhost:5173 → login admin/admin123 → thấy AppShell là ĐẠT.

## PHẦN C — Login SQL riêng cho dev (Leader chạy trong SSMS, 2 phút)

```sql
USE master;
CREATE LOGIN dev01 WITH PASSWORD = N'<đặt password mạnh, ghi sổ>';
GO
USE KT2000_Master;  CREATE USER dev01 FOR LOGIN dev01;
ALTER ROLE db_datareader ADD MEMBER dev01; ALTER ROLE db_datawriter ADD MEMBER dev01;
GO
USE KT2000_Base;    CREATE USER dev01 FOR LOGIN dev01;
ALTER ROLE db_datareader ADD MEMBER dev01;
GO
USE TUAN_NGA_2025;  CREATE USER dev01 FOR LOGIN dev01;
ALTER ROLE db_datareader ADD MEMBER dev01; ALTER ROLE db_datawriter ADD MEMBER dev01;
GO
```

Dev kết nối `192.168.0.106\SQLEXPRESS,1433` bằng dev01 (LAN; làm từ xa thì qua
WireGuard sẵn có). Quyền đọc/ghi dữ liệu nhưng không sửa được cấu trúc, không
đụng database khác — đúng "vừa đủ".

## PHẦN D — Vòng đời MỘT việc sửa (dạy dev thuộc lòng)

```
git checkout main
git pull                              # luôn xuất phát từ main mới nhất
git checkout -b fix/nut-lay-hd        # nhánh riêng, tên nói lên việc
... code + tự test theo checklist trong Issue ...
git add .  →  git status (soát!)  →  git commit -m "fix/nut-lay-hd: mo ta ngan"
git push -u origin fix/nut-lay-hd
```
→ GitHub hiện nút **Compare & pull request** → dev tạo PR, phần mô tả ghi
`Fixes #<số Issue>` (merge xong Issue TỰ ĐÓNG) → Leader vào tab **Files
changed**: duyệt từng dòng, muốn Claude soát thì copy diff dán vào chat →
góp ý bằng **Request changes** (dev sửa, push tiếp — PR tự cập nhật) → đạt thì
**Approve** + **Squash and merge** (mỗi việc = 1 commit gọn trên main) → xóa
nhánh theo gợi ý của GitHub.

## PHẦN E — Từ main lên server (việc của Leader, quy trình cũ nối vào)

```
git checkout main
git pull                # kéo bản vừa merge
(chạy nhanh checklist của Issue trên máy Leader)
deploy_build.bat  →  copy publish sang \\192.168.0.106\...\drop  →  RDP: update.bat
```

## PHẦN F — 2 file luật thả vào repo (commit ngay hôm nay)

### F1. `CLAUDE.md` (đặt ở GỐC repo — người và Claude Code cùng đọc)

```markdown
# KT2000 Web — Luật nhà (mọi người và mọi AI agent phải theo)

## Quy trình
- KHÔNG push thẳng main — mọi thay đổi qua nhánh + Pull Request, Leader merge.
- Mỗi PR giải quyết đúng MỘT Issue, mô tả ghi "Fixes #<số>".
- Sửa schema database = thêm file SQL đánh số tiếp theo trong database/,
  KHÔNG sửa file số cũ. Quyết định thiết kế ghi docs/NHAT-KY-QUYET-DINH.md.

## Luật code bất khả xâm phạm
1. Tên database đơn vị-năm CHỈ được ghép qua TenantDbResolver — cấm tự ghép chuỗi.
2. Endpoint mới trong AdminController phải qua gate IsInternal() (và IsAdminUser()
   nếu là thao tác sửa/quản trị).
3. SQL luôn tham số hóa (@param) — cấm cộng chuỗi giá trị vào câu lệnh.
4. Không hardcode đường dẫn/secret trong code — tất cả vào appsettings
   (appsettings.json không commit; sửa template thì cập nhật appsettings.template.json).
5. Cột hạch toán trên HOA_DON (ghi_no/ghi_co, ma_ct_*, ma_kh, ngay_nh, ghi_chu)
   KHÔNG được UPDATE bởi importer/chức năng nguồn — chỉ engine/kế toán điền.
6. Frontend: import kiểu dữ liệu phải dùng `import type`; không dùng localStorage
   ngoài AuthContext hiện có.
7. Mọi chức năng nghiệp vụ mới phải ghi móc TaskStatus/ActivityLog.
8. Code chạm BR nào thì comment trỏ tên BR đó (BR-HD-01, BR-IMP-01...).

## Bối cảnh nhanh
- Kiến trúc: ASP.NET Core + React (AntD) + SQL Server; DB-per-tenant-per-year.
- Đọc docs/SPEC-000*.md để hiểu tổng thể; specs từng gói trong docs/.
```

### F2. `docs/LUAT-REVIEW.md` (checklist Leader soát mỗi PR — in ra dán màn hình)

```markdown
# Checklist review PR (soát theo thứ tự, phạm điều nào trả về điều đó)
1. PR có link "Fixes #..."? Chỉ làm đúng một việc?
2. Có chỗ nào ghép tên database ngoài TenantDbResolver? (search "_" + năm)
3. Endpoint mới có [Authorize] + IsInternal()/IsAdminUser() chưa?
4. SQL có cộng chuỗi giá trị không? (phải @param hết)
5. Có path cứng / secret / password trong code không?
6. Có đụng cột hạch toán trong câu UPDATE nào không?
7. Frontend: import type đúng luật? Có gạch vàng import thừa không?
8. Chức năng mới có móc TaskStatus/ActivityLog chưa?
9. Chạy checklist nghiệm thu trong Issue — đủ xanh?
10. (Tùy chọn) dán diff cho Claude soát lượt hai trước khi Merge.
```

## PHẦN G — Nghiệm thu quy trình (chạy thử ngay với việc đầu tiên)

| # | Bước | Đạt |
|---|---|---|
| 1 | Dev accept lời mời, clone, chạy được localhost:5173 login admin | ✓ |
| 2 | Leader tạo Issue #1 (một việc nhỏ thật) | ✓ |
| 3 | Dev làm trên nhánh, push, mở PR "Fixes #1" | ✓ |
| 4 | Leader review Files changed + (thử) dán diff cho Claude | ✓ |
| 5 | Squash and merge → Issue #1 tự đóng | ✓ |
| 6 | Leader pull main → deploy theo Phần E → chức năng sống trên server | ✓ |

Xong vòng đầu tiên: quy trình chạy thật, không còn trên giấy. Nhật ký:
"01-08: Chuyển pha nhân bản — dev vào repo, mọi thay đổi qua PR, Leader giữ
nút Merge; CLAUDE.md + LUAT-REVIEW.md là luật chung cho người lẫn AI".
