@echo off
cd /d D:\WebAPP\kt2000-web\kt2000-web
call npm run build || exit /b 1
cd /d D:\WebAPP\kt2000-web\KT2000.Api
dotnet publish -c Release -r win-x64 --self-contained true -o D:\WebAPP\publish || exit /b 1
xcopy /e /i /y ..\kt2000-web\dist D:\WebAPP\publish\wwwroot
echo ===== BUILD XONG - copy D:\WebAPP\publish sang \\192.168.0.106 =====