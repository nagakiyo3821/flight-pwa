@echo off
cd /d "%~dp0"
title Flight PWA Start
echo.
echo  Starting Flight PWA (Vite + HTTPS tunnel)...
echo  When ready, a browser window will show the QR code.
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-iphone.ps1"
echo.
if errorlevel 1 (
  echo  ERROR: start failed. See messages above.
) else (
  echo  Done. You can close this window.
  echo  To stop: run Flight-PWA-Stop.bat or the desktop stop shortcut.
)
echo.
pause
