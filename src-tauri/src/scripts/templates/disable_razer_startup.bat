@echo off
rem Touching HKLM, services and scheduled tasks needs admin - relaunch elevated if we aren't.
net session >nul 2>&1
if %errorlevel% neq 0 (
    powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b
)

set "BACKUP=%USERPROFILE%\Desktop\Razer-Startup-Backup"

echo ==========================================================
echo   Disable Razer software at startup
echo ==========================================================
echo.
echo This stops Razer software launching with Windows. It does NOT
echo uninstall anything, and your mouse/keyboard keep working - Windows
echo drives the basic input, and Synapse still opens normally when you
echo want to change settings.
echo.
echo   Services         -^> Manual  (start when Synapse is opened, not at boot)
echo   Run entries      -^> removed (backed up to a .reg first)
echo   Scheduled tasks  -^> disabled
echo   Startup folder   -^> shortcuts moved out
echo.
echo Everything is reversible. Backups go to:
echo   %BACKUP%
echo.
echo NOTE: if you rely on onboard-memory macros or Chroma effects applying
echo automatically at boot WITHOUT opening Synapse, skip this - profiles
echo stored on the device itself still work, but software-driven ones need
echo Synapse running.
echo.
pause
echo.

if not exist "%BACKUP%" mkdir "%BACKUP%"

echo [1/5] Backing up current Run keys...
reg export "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" "%BACKUP%\Run-HKCU.reg" /y >nul 2>&1
reg export "HKLM\Software\Microsoft\Windows\CurrentVersion\Run" "%BACKUP%\Run-HKLM.reg" /y >nul 2>&1
echo       saved to %BACKUP%
echo.

echo [2/5] Removing Razer entries from Run keys...
powershell -NoProfile -Command "$n=0; foreach ($h in 'HKCU:','HKLM:') { $p = Join-Path $h 'Software\Microsoft\Windows\CurrentVersion\Run'; if (Test-Path $p) { (Get-Item $p).Property | Where-Object { $_ -match 'razer|synapse|cortex|^Rz' } | ForEach-Object { Write-Host ('      - ' + $_); Remove-ItemProperty -Path $p -Name $_ -ErrorAction SilentlyContinue; $n++ } } }; if ($n -eq 0) { Write-Host '      (none found)' }"
echo.

echo [3/5] Setting Razer services to Manual start...
powershell -NoProfile -Command "$s = Get-Service -ErrorAction SilentlyContinue | Where-Object { $_.Name -match 'razer|^Rz' -or $_.DisplayName -match 'Razer' }; if (-not $s) { Write-Host '      (none found)' } else { $s | ForEach-Object { Write-Host ('      - ' + $_.DisplayName); $_.Name } | Out-Null; ($s | Select-Object -ExpandProperty Name) | ForEach-Object { Set-Service -Name $_ -StartupType Manual -ErrorAction SilentlyContinue } }"
echo.

echo [4/5] Disabling Razer scheduled tasks...
powershell -NoProfile -Command "$t = Get-ScheduledTask -ErrorAction SilentlyContinue | Where-Object { $_.TaskName -match 'razer|synapse|cortex|^Rz' -or $_.TaskPath -match 'Razer' }; if (-not $t) { Write-Host '      (none found)' } else { $t | ForEach-Object { Write-Host ('      - ' + $_.TaskName); Disable-ScheduledTask -TaskName $_.TaskName -TaskPath $_.TaskPath -ErrorAction SilentlyContinue | Out-Null } }"
echo.

echo [5/5] Moving Razer shortcuts out of the Startup folder...
powershell -NoProfile -Command "$dest = Join-Path $env:USERPROFILE 'Desktop\Razer-Startup-Backup'; New-Item -ItemType Directory -Force -Path $dest | Out-Null; $f = @(); foreach ($d in @([Environment]::GetFolderPath('Startup'), (Join-Path $env:ProgramData 'Microsoft\Windows\Start Menu\Programs\StartUp'))) { if (Test-Path $d) { $f += Get-ChildItem -Path $d -Filter '*.lnk' -ErrorAction SilentlyContinue | Where-Object { $_.Name -match 'razer|synapse|cortex' } } }; if (-not $f) { Write-Host '      (none found)' } else { $f | ForEach-Object { Write-Host ('      - ' + $_.Name); Move-Item -LiteralPath $_.FullName -Destination $dest -Force -ErrorAction SilentlyContinue } }"
echo.

echo ==========================================================
echo   Done. Razer software will not start with Windows.
echo ==========================================================
echo.
echo To undo:
echo   Run keys   - double-click the .reg files in the backup folder
echo   Services   - Set-Service -Name ^<name^> -StartupType Automatic
echo   Tasks      - Enable-ScheduledTask -TaskName ^<name^>
echo   Shortcuts  - move the .lnk files back into shell:startup
echo.
pause
