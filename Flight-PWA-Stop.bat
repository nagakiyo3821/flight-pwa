@echo off
cd /d "%~dp0"
title Flight PWA Stop
echo.
echo  Stopping Flight PWA...
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0stop-iphone.ps1"
echo.
pause
