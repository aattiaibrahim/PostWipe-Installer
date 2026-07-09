@echo off
rem Vanguard-protected processes can refuse to die for a non-admin caller - relaunch elevated if we aren't.
net session >nul 2>&1
if %errorlevel% neq 0 (
    powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b
)
echo Killing VALORANT...
taskkill /F /IM "VALORANT-Win64-Shipping.exe"
echo Done.
timeout /t 2 >nul
