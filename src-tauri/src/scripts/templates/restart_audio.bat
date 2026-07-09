@echo off
rem Restarting a Windows service needs admin rights - relaunch elevated if we aren't.
net session >nul 2>&1
if %errorlevel% neq 0 (
    powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b
)
echo Restarting Windows Audio service...
net stop Audiosrv
net start Audiosrv
echo Done.
timeout /t 2 >nul
