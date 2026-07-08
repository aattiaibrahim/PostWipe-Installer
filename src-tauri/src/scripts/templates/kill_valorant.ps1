# Vanguard-protected processes can refuse to die for a non-admin caller — relaunch elevated if we aren't already.
$currentPrincipal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $currentPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Start-Process powershell -ArgumentList "-ExecutionPolicy Bypass -File `"$PSCommandPath`"" -Verb RunAs
    exit
}

Get-Process | Where-Object { $_.Name -eq 'VALORANT-Win64-Shipping' } | Stop-Process -Force
