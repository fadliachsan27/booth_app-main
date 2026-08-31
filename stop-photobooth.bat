@echo off
echo Menghentikan photobooth agent...
taskkill /F /FI "WINDOWTITLE eq Photobooth Agent*" >nul 2>&1
taskkill /F /FI "WINDOWTITLE eq Photobooth App*" >nul 2>&1
taskkill /F /FI "WINDOWTITLE eq Photobooth Tunnel*" >nul 2>&1
taskkill /F /IM cloudflared.exe >nul 2>&1
echo Selesai.
pause
