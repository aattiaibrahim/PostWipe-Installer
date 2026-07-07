Get-Process | Where-Object { $_.Name -eq 'VALORANT-Win64-Shipping' } | Stop-Process -Force
