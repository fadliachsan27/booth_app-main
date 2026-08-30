@echo off
REM Starts the photobooth app + Cloudflare tunnel in the BACKGROUND.
REM Closing this window (or the terminal that launched it) will NOT stop them —
REM each runs in its own minimized console.

cd /d "%~dp0"

echo Starting app (server + frontend)...
start "Photobooth App" /min cmd /k "npm run dev"

echo Starting Cloudflare tunnel...
start "Photobooth Tunnel" /min cmd /k "npx cloudflared tunnel --url http://localhost:4000 > tunnel-log.txt 2>&1"

echo.
echo Photobooth berjalan di background (lihat 2 jendela minimized di taskbar).
echo Tunggu ~10 detik, lalu jalankan get-tunnel-url.bat untuk lihat URL publiknya.
echo Boleh tutup jendela INI - yang di taskbar akan tetap jalan.
pause
