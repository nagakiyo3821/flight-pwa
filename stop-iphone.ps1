# Stop flight-pwa Vite and tunnel (ASCII-only PowerShell)
$ErrorActionPreference = "SilentlyContinue"
$AppDir = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }
$Port = 5173

Get-CimInstance Win32_Process |
  Where-Object {
    $_.CommandLine -and (
      $_.CommandLine -match ('cloudflared\.exe.*tunnel --url http://127\.0\.0\.1:{0}' -f $Port) -or
      ($_.CommandLine -match 'vite' -and $_.CommandLine -match 'flight-pwa') -or
      ($_.CommandLine -match 'npm-cli\.js.*run dev' -and $_.CommandLine -match 'flight-pwa')
    )
  } |
  ForEach-Object {
    Write-Host ("stop PID={0} {1}" -f $_.ProcessId, $_.Name)
    Stop-Process -Id $_.ProcessId -Force
  }

Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
  ForEach-Object {
    Write-Host ("stop port {0} owner PID={1}" -f $Port, $_.OwningProcess)
    Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue
  }

& python (Join-Path $AppDir "write-stopped-note.py")
Write-Host "Done. Tunnel URL is no longer valid."
