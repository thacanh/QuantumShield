@echo off
setlocal
title QuantumShield FinEdu
cd /d "%~dp0"
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\run-local.ps1" %*
set "launchExit=%errorlevel%"
if errorlevel 1 (
  echo.
  echo Khong the khoi dong. Xem thong bao loi o tren.
  pause
)
endlocal & exit /b %launchExit%
