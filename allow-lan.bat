@echo off
setlocal
title QuantumShield FinEdu - LAN firewall
cd /d "%~dp0"
echo Cho phep thiet bi cung mang truy cap cong 5175. Chon Yes trong hop thoai Windows.
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\allow-lan.ps1"
if errorlevel 1 (
  echo Khong the them quyen tuong lua. Hay chay lai va chap nhan quyen quan tri.
) else (
  echo Da cho phep cong 5175 tu mang noi bo. Mo run-lan.bat de chay web.
)
pause
