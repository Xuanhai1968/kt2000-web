Project Name : Migrate KT2000 to Web
Yêu cầu môi trường (.NET 10 SDK, Node LTS 22+, Git)
Cấu trúc thư mục:
kt2000-web/
├── KT2000.Api/       ← Backend C#
├── kt2000-web/       ← Frontend React
├── database/         ← Các script SQL (mỗi thay đổi DB = 1 file .sql đánh số)
│   └── 001_create_master.sql
├── docs/             ← Spec do Leader viết (KT2000_Setup_MayChuMoi_Login_v2.md, ...)
|   └── KT2000_Setup_MayChuMoi_Login_v2.md
└── README.md
Cách chạy Backend C#: Mở Cmd → cd /d D:\WebAPP\kt2000-web\KT2000.Api\ → dotnet run (có thể phải chạy dotnet build trước)
Cách chạy Frontend React: Mở Cmd → cd /d D:\WebAPP\kt2000-web\kt2000-web\ → npm run dev
Chạy Backend ở Terminal: Mở Terminal → cd /d D:\WebAPP\kt2000-web\KT2000.Api\ → dotnet run cũng được
Chạy Frontend ở Terminal: Mở Terminal → cd /d D:\WebAPP\kt2000-web\kt2000-web\ → npm run dev cũng được nhưng nếu gặp lỗi :
####
    npm : File C:\Program Files\nodejs\npm.ps1 cannot be loaded because running scripts is disabled on this system. For more information, see about_Execution_Policies at 
    https:/go.microsoft.com/fwlink/?LinkID=135170.
    At line:1 char:1
    + npm run dev
    + ~~~
        + CategoryInfo          : SecurityError: (:) [], PSSecurityException
        + FullyQualifiedErrorId : UnauthorizedAccess
#####
thì mở Terminal của VSCode chạy "Set-ExecutionPolicy -Scope CurrentUser RemoteSigned" để loại bỏ lỗi trên . Bây giừo có thể chạy Backend và Frontend ở Terminal.
Sau khi xong trang web chính của ứng dụng là : http://localhost:5173/