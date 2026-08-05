# Từ điển viết tắt & thuật ngữ — dự án KT2000 Web

Tra nhanh các từ viết tắt tiếng Anh hay gặp trong trao đổi. Cột "Ghi nhớ kiểu VFP" là mẹo liên tưởng.

## 1. Quy trình làm việc & Git

| Viết tắt | Tiếng Anh đầy đủ | Nghĩa / Ghi nhớ kiểu VFP |
|---|---|---|
| spec | **specification** | Bản đặc tả — tài liệu mô tả "làm gì, luật gì" TRƯỚC khi code (nếp "spec trước code") |
| BR | **Business Rule** | Luật nghiệp vụ — vd BR-DB-01 (mã đơn vị A-Z 0-9 _), BR-HD-01 (danh tính hóa đơn) |
| WP | **Work Package** | Gói việc — cách mình đánh số giai đoạn: WP-03 importer, WP-04 kho... |
| repo | **repository** | Kho mã nguồn trên GitHub (kt2000-web) |
| PR | **Pull Request** | "Đơn xin gộp code": dev làm trên nhánh riêng, gửi PR, Leader duyệt rồi mới gộp vào main |
| branch | (không viết tắt) | Nhánh code — bản sao để làm việc riêng, không đụng bản chính (main) |
| commit | (không viết tắt) | Một lần "chốt sổ" thay đổi code, có ghi chú, quay lại được |
| merge | (không viết tắt) | Gộp nhánh vào main; **squash merge** = ép nhiều commit thành một cho gọn lịch sử |
| Issue | (từ GitHub) | Phiếu việc/phiếu lỗi trên GitHub — mỗi việc nhỏ một Issue, PR ghi "Fixes #n" |
| CLI | **Command Line Interface** | Giao diện dòng lệnh — chạy chương trình bằng gõ lệnh + tham số (như DO ... WITH) |
| IDE | **Integrated Development Environment** | Môi trường lập trình tích hợp (VS Code) — tương đương màn hình soạn code của VFP |

## 2. Backend (C# / ASP.NET / SQL)

| Viết tắt | Tiếng Anh đầy đủ | Nghĩa / Ghi nhớ kiểu VFP |
|---|---|---|
| API | **Application Programming Interface** | Cổng giao tiếp lập trình — tập các "method" backend phơi ra cho frontend gọi; vai COM_SERVER |
| REST | **Representational State Transfer** | Kiểu thiết kế API phổ biến: mỗi tài nguyên một đường dẫn, dùng GET/POST/PUT/DELETE |
| DTO | **Data Transfer Object** | Object gói tham số truyền giữa hai bên — chính là loThamSo SCATTER NAME gửi qua COM |
| EF Core | **Entity Framework Core** | Thư viện C# dịch object ↔ bảng SQL, tự sinh câu SELECT/INSERT — người phiên dịch giữa C# và SQL Server |
| ORM | **Object-Relational Mapping** | Tên chung của loại thư viện như EF Core (ánh xạ object ↔ bảng quan hệ) |
| SQL | **Structured Query Language** | Ngôn ngữ truy vấn — anh đã quen từ SELECT của VFP |
| CRUD | **Create, Read, Update, Delete** | Bộ tứ thao tác dữ liệu cơ bản — "màn hình CRUD" = màn hình danh mục thêm/xem/sửa/xóa |
| JWT | **JSON Web Token** | Thẻ ra vào có chữ ký, chứa claims — bộ "biến toàn cục" goUser/goDonVi gửi kèm mỗi request |
| claim | (không viết tắt) | Một mục thông tin trong JWT (sub, tenant_code, fiscal_year, is_admin) |
| sa | **system administrator** | Tài khoản quản trị tối cao của SQL Server |
| tx | **transaction** | Giao dịch DB — trọn gói hoặc không gì cả (như BEGIN TRANSACTION của VFP) |
| DB | **database** | Cơ sở dữ liệu |

## 3. Frontend (React / TypeScript / Antd)

| Viết tắt | Tiếng Anh đầy đủ | Nghĩa / Ghi nhớ kiểu VFP |
|---|---|---|
| TS | **TypeScript** | JavaScript có khai báo kiểu — bắt lỗi gõ nhầm ngay lúc viết |
| JSX / TSX | **JavaScript/TypeScript XML** | Cú pháp viết giao diện lẫn trong code — phần "SCX viết thành chữ" |
| antd | **Ant Design** | Bộ control giao diện đang dùng (Table, Modal, Form...) — tương đương bộ VCX |
| UI | **User Interface** | Giao diện người dùng |
| UX | **User Experience** | Trải nghiệm người dùng — form có tiện tay, dễ hiểu không |
| SPA | **Single Page Application** | Ứng dụng một trang: tải index.html một lần, đổi "form" bằng Router không tải lại trang |
| state | (không viết tắt) | Trạng thái component — các property của THISFORM (useState) |
| props | **properties** | Tham số truyền vào component — như tham số DO FORM ... WITH |
| hook | (không viết tắt) | Các hàm use... của React (useState, useEffect) — "móc" vào vòng đời form |
| mount | (không viết tắt) | Thời điểm component được mở/vẽ lần đầu — lúc Init nổ |
| render | (không viết tắt) | Vẽ giao diện; re-render = vẽ lại khi state đổi (Refresh tự động) |

## 4. Web & giao thức

| Viết tắt | Tiếng Anh đầy đủ | Nghĩa / Ghi nhớ kiểu VFP |
|---|---|---|
| HTTP | **HyperText Transfer Protocol** | Giao thức trình duyệt ↔ server; **HTTPS** = bản có mã hóa |
| URL | **Uniform Resource Locator** | Địa chỉ web — kiêm vai "tham số dòng lệnh chọn form nào" |
| JSON | **JavaScript Object Notation** | Định dạng chữ để đóng gói dữ liệu qua lại — phong bì đựng DTO |
| GET / POST / PUT / DELETE | (HTTP methods) | Động từ của request: xem / tạo mới / sửa / xóa |
| 401 | Unauthorized | "Chưa đăng nhập / token hỏng" — chặn ở trạm Authentication |
| 403 | Forbidden | "Đăng nhập rồi nhưng không đủ quyền" — chặn ở trạm Authorization |
| 404 | Not Found | Không tìm thấy đường dẫn/tài nguyên |
| 500 | Internal Server Error | Backend nổ lỗi bên trong — đi đọc log/stack trace |
| TCP | **Transmission Control Protocol** | Tầng kết nối mạng bên dưới HTTP (mở kết nối đến cổng 5173/5000/1433) |
| localhost | (không viết tắt) | Chính máy mình (địa chỉ 127.0.0.1) |
| proxy | (không viết tắt) | Trạm chuyển tiếp — Vite dev chuyển /api sang cổng 5000 |
| CORS | **Cross-Origin Resource Sharing** | Luật trình duyệt chặn gọi API khác nguồn — lý do dev cần proxy |

## 5. Hạ tầng & công cụ

| Viết tắt | Tiếng Anh đầy đủ | Nghĩa / Ghi nhớ kiểu VFP |
|---|---|---|
| COM | **Component Object Model** | Chuẩn Windows cho CREATEOBJECT — nền của COM_SERVER nhà mình |
| EXE | **executable** | File chạy được (kt2000.exe) |
| VM / service | — / **Windows Service** | KT2000Api chạy dạng service: tự khởi động cùng Windows, không cần ai đăng nhập |
| Kestrel | (tên riêng) | Web server tích hợp trong ASP.NET Core — người nghe cổng 5000 |
| Vite | (tên riêng, đọc "vít") | Dev server + trình đóng gói frontend — người nghe cổng 5173, dịch TS ra JS |
| npm | **Node Package Manager** | Trình cài thư viện cho frontend (như pip của Python) |
| Swagger | (tên riêng) | Trang tự sinh liệt kê + cho gọi thử mọi API của backend — soi bản đang chạy |
| DevTools | **Developer Tools** | Bộ đồ nghề F12 của Chrome — tab Network xem request/JSON qua lại |
| XML | **eXtensible Markup Language** | Định dạng chữ có thẻ — hóa đơn điện tử TCT dùng |
| OCR | **Optical Character Recognition** | Nhận dạng ký tự từ ảnh (ddddocr giải captcha) |
| ML | **Machine Learning** | Học máy — mô hình phân loại định khoản DINH_KHOAN |
