@echo off
cd /d "%~dp0"
echo Mencari URL tunnel...
findstr /C:"trycloudflare.com" tunnel-log.txt
echo.
echo (Kalau kosong, tunggu beberapa detik lagi lalu jalankan ulang file ini)
pause
