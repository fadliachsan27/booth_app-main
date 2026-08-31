@echo off
REM Starts the photobooth agent in the BACKGROUND (DSLR capture + printing).
REM Architecture changed: the kiosk UI now talks directly to Firebase from
REM wherever it's hosted (Netlify, localhost, ...). No local server/tunnel is
REM needed anymore - this agent just needs outbound internet.
REM Closing this window will NOT stop it - it runs in its own minimized console.

cd /d "%~dp0"

echo Starting photobooth agent...
start "Photobooth Agent" /min cmd /k "npm run agent"

echo.
echo Agent berjalan di background (lihat jendela "Photobooth Agent" di taskbar).
echo Biarkan PC ini menyala selama photobooth dipakai - dia yang jalankan DSLR ^& print.
echo Boleh tutup jendela INI.
pause
