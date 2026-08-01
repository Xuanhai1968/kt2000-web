# WP-03a — Đưa hệ thống lên server 192.168.0.106 (chạy như Windows Service)

Sản phẩm: backend chạy thường trực trên server (tự khởi động cùng Windows),
frontend build tĩnh do chính backend phục vụ — mọi máy trong LAN mở
**http://192.168.0.106:5000** là dùng được. Máy Leader/dev vẫn giữ chế độ dev
riêng (localhost) như cũ.

Thứ tự 1 → 8. Bước 1–3 làm trên MÁY LEADER, bước 4–7 trên SERVER.

---

## 1. Sửa code cho chế độ "phục vụ" (máy Leader, commit như mọi thay đổi)

**1a. Backend biết chạy như Windows Service** — trong thư mục KT2000.Api:

```
dotnet add package Microsoft.Extensions.Hosting.WindowsServices
```

Mở `Program.cs`, thêm ngay SAU dòng `var builder = WebApplication.CreateBuilder(args);`:

```csharp
builder.Host.UseWindowsService();   // chạy được như Windows Service (dev không ảnh hưởng)
```

**1b. Backend phục vụ luôn frontend tĩnh** — thêm vào Program.cs, ngay TRƯỚC
`app.MapControllers();`:

```csharp
app.UseDefaultFiles();   // vào / thì trả index.html
app.UseStaticFiles();    // phục vụ file trong wwwroot (bản build React)
```

và ngay SAU `app.MapControllers();` thêm:

```csharp
app.MapFallbackToFile("index.html");  // URL kiểu /app/don-vi (route React) → trả index.html
```

**1c. Frontend gọi API bằng đường tương đối** — mở `kt2000-web/src/api.ts`, đổi:

```typescript
const api = axios.create({ baseURL: "/api" });
```

Chạy thật: frontend và API cùng địa chỉ nên `/api` tự đúng. Còn chế độ dev
(cổng 5173 gọi 5000) thì thêm cầu nối vào `kt2000-web/vite.config.ts` — trong
`defineConfig({...})` thêm:

```typescript
  server: {
    proxy: { "/api": "http://localhost:5000" },
  },
```

(Dev như cũ, không cần CORS nữa nhưng cứ để nguyên CORS trong Program.cs — vô hại.)

Kiểm tra tại máy Leader trước khi đi tiếp: `dotnet run` + `npm run dev`, login
hoạt động bình thường → commit "WP-03a: windows service + static frontend + api
duong tuong doi".

## 2. Build bản phát hành (máy Leader)

```
cd /d D:\WebAPP\kt2000-web\kt2000-web
npm run build
cd /d D:\WebAPP\kt2000-web\KT2000.Api
dotnet publish -c Release -r win-x64 --self-contained true -o D:\WebAPP\publish
xcopy /e /i /y ..\kt2000-web\dist D:\WebAPP\publish\wwwroot
```

Giải nghĩa: `npm run build` nén React thành bộ file tĩnh trong `dist\`;
`dotnet publish --self-contained` đóng gói backend KÈM cả bộ .NET runtime
(server không cần cài .NET gì hết — đổi bằng dung lượng ~100MB, đáng);
`xcopy` đặt bản build React vào `wwwroot` cho backend phục vụ.

## 3. Chuẩn bị cấu hình sản xuất

Trong `D:\WebAPP\publish\` sửa file `appsettings.json` (bản publish — KHÔNG
phải bản trong source):
- Connection string: server giờ là chính nó →
  `Server=localhost\\SQLEXPRESS,1433;Database=KT2000_Master;...` (giữ sa/password).
- `Jwt:Key`: đặt chuỗi MỚI dành riêng cho sản xuất (PowerShell:
  `[Convert]::ToBase64String((1..48 | %{ Get-Random -Maximum 256 }))`), ghi sổ riêng.

## 4. Bố trí thư mục trên SERVER (Remote Desktop vào .106)

```
C:\KT2000\app\      ← copy toàn bộ D:\WebAPP\publish vào đây
C:\KT2000\tools\    ← TRA_CUU_HDDT_2_0.py + XML_MAP.xlsx (gói WP-03 sau)
D:\DATA_HDDT\       ← kho job; share ra tên cũ \\SEVERNEW\data_hddt
```

Copy qua share hoặc USB. (Python/Chrome cài ở gói sau — hôm nay chỉ backend.)

## 5. Đăng ký Windows Service (trên server, CMD Run as Administrator)

```
sc create KT2000Api binPath= "C:\KT2000\app\KT2000.Api.exe" start= auto DisplayName= "KT2000 Web Backend"
sc description KT2000Api "Backend KT2000 Web - ASP.NET Core"
sc start KT2000Api
```

(Cú pháp sc bắt buộc có KHOẢNG TRẮNG sau mỗi dấu `=` — gõ đúng như trên.)
Kiểm: `sc query KT2000Api` phải ra `STATE : RUNNING`. Service mặc định chạy
bằng tài khoản LocalSystem — đủ quyền đọc C:\KT2000 và D:\DATA_HDDT local.

## 6. Mở firewall cổng 5000 (trên server)

```
netsh advfirewall firewall add rule name="KT2000 Web 5000" dir=in action=allow protocol=TCP localport=5000
```

## 7. Nghiệm thu

| # | Kịch bản | Phải đạt |
|---|---|---|
| 1 | Trên server: mở http://localhost:5000 | Trang login hiện ra (frontend tĩnh sống) |
| 2 | Máy Leader: http://192.168.0.106:5000 | Login admin/MDN_NB vào được, menu QUẢN TRỊ đủ |
| 3 | Máy BẤT KỲ trong LAN (điện thoại cùng wifi càng tốt) | Cùng địa chỉ, dùng được |
| 4 | Restart server (hoặc `sc stop` + `sc start`) | Service tự dậy, web sống lại không cần ai đụng |
| 5 | Máy Leader chạy dev localhost:5173 như cũ | Vẫn hoạt động độc lập (proxy /api) |

## 8. Quy trình NÂNG CẤP bản chạy thật (dùng lại mãi về sau)

Máy Leader: `npm run build` + `dotnet publish` + xcopy wwwroot (bước 2) →
server: `sc stop KT2000Api` → copy đè C:\KT2000\app (TRỪ appsettings.json —
đừng đè mất cấu hình sản xuất!) → `sc start KT2000Api`. Ghi thành mục trong
README. (Tự động hóa bằng script sau, làm tay dăm lần đã.)

Nhật ký: "30-07: Hệ thống lên server .106 — Windows Service cổng 5000, frontend
tĩnh cùng nguồn, dev giữ proxy /api; appsettings sản xuất tách khỏi repo".
