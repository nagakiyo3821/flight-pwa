# Start flight-pwa Vite + Cloudflare tunnel, then open QR in browser.
# Keep PowerShell syntax ASCII-friendly (Japanese only inside quoted strings).

$ErrorActionPreference = "Stop"
$AppDir = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }
$Port = 5173
$LogPath = Join-Path $AppDir "tunnel.log"
$OutLog = Join-Path $AppDir "tunnel-out.log"
$Cloudflared = "C:\Program Files (x86)\cloudflared\cloudflared.exe"
$GenPy = Join-Path $AppDir "generate-qr.py"
$PublicDir = Join-Path $AppDir "public"

function Test-PortOpen([int]$Port) {
  try {
    $c = New-Object System.Net.Sockets.TcpClient
    $c.Connect("127.0.0.1", $Port)
    $c.Close()
    return $true
  } catch {
    return $false
  }
}

function Stop-AppProcesses {
  Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
    Where-Object {
      $_.CommandLine -and (
        $_.CommandLine -match ('cloudflared\.exe.*tunnel --url http://127\.0\.0\.1:{0}' -f $Port) -or
        ($_.CommandLine -match 'vite' -and $_.CommandLine -match 'flight-pwa') -or
        ($_.CommandLine -match 'npm-cli\.js.*run dev' -and $_.CommandLine -match 'flight-pwa')
      )
    } |
    ForEach-Object {
      Write-Host ("  stop PID={0} {1}" -f $_.ProcessId, $_.Name)
      Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
    }

  Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
    ForEach-Object {
      Write-Host ("  stop port {0} owner PID={1}" -f $Port, $_.OwningProcess)
      Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue
    }
}

Write-Host ""
Write-Host "==== Flight PWA Start ====" -ForegroundColor Cyan
Write-Host ("Folder: {0}" -f $AppDir)
Write-Host ""

if (-not (Test-Path -LiteralPath $Cloudflared)) {
  Write-Host ("cloudflared not found: {0}" -f $Cloudflared) -ForegroundColor Red
  Write-Host "Install: winget install Cloudflare.cloudflared"
  exit 1
}
if (-not (Test-Path -LiteralPath $GenPy)) {
  Write-Host ("Missing: {0}" -f $GenPy) -ForegroundColor Red
  exit 1
}
if (-not (Test-Path -LiteralPath (Join-Path $AppDir "package.json"))) {
  Write-Host "package.json not found." -ForegroundColor Red
  exit 1
}
if (-not (Test-Path -LiteralPath (Join-Path $AppDir "node_modules"))) {
  Write-Host "[0/4] npm install (first time)..."
  Push-Location $AppDir
  try {
    & npm install
    if ($LASTEXITCODE -ne 0) { throw "npm install failed" }
  } finally {
    Pop-Location
  }
}

Write-Host "[1/4] Stopping old processes..."
Stop-AppProcesses
Start-Sleep -Seconds 1

Write-Host ("[2/4] Starting Vite on :{0} ..." -f $Port)
$npmCmdObj = Get-Command npm.cmd -ErrorAction SilentlyContinue
$npmCmd = if ($npmCmdObj) { $npmCmdObj.Source } else { "npm.cmd" }
Start-Process -FilePath $npmCmd `
  -ArgumentList @("run", "dev", "--", "--host", "127.0.0.1", "--port", "$Port", "--strictPort") `
  -WorkingDirectory $AppDir `
  -WindowStyle Minimized

$ok = $false
for ($i = 0; $i -lt 40; $i++) {
  Start-Sleep -Milliseconds 500
  if (Test-PortOpen $Port) { $ok = $true; break }
}
if (-not $ok) {
  Write-Host "Failed to start Vite. Is Node.js / npm on PATH?" -ForegroundColor Red
  exit 1
}
Write-Host ("  OK http://127.0.0.1:{0}/" -f $Port)

foreach ($f in @($LogPath, $OutLog)) {
  if (Test-Path -LiteralPath $f) { Remove-Item -LiteralPath $f -Force }
}

Write-Host "[3/4] Starting HTTPS tunnel (wait up to ~40s)..."
$tunnel = Start-Process -FilePath $Cloudflared `
  -ArgumentList @("tunnel", "--url", ("http://127.0.0.1:{0}" -f $Port)) `
  -RedirectStandardError $LogPath `
  -RedirectStandardOutput $OutLog `
  -WindowStyle Hidden `
  -PassThru

$url = $null
for ($i = 0; $i -lt 45; $i++) {
  Start-Sleep -Seconds 1
  Write-Host -NoNewline "."
  $chunks = @()
  foreach ($f in @($LogPath, $OutLog)) {
    if (Test-Path -LiteralPath $f) {
      $chunks += (Get-Content -LiteralPath $f -Raw -ErrorAction SilentlyContinue)
    }
  }
  $text = ($chunks -join "`n")
  if ($text -match 'https://[a-zA-Z0-9-]+\.trycloudflare\.com') {
    $url = $Matches[0]
    break
  }
  if ($tunnel.HasExited) {
    Write-Host ""
    Write-Host "cloudflared exited. Log:" -ForegroundColor Red
    foreach ($f in @($LogPath, $OutLog)) {
      if (Test-Path -LiteralPath $f) { Get-Content -LiteralPath $f }
    }
    exit 1
  }
}
Write-Host ""

if (-not $url) {
  Write-Host "Could not get tunnel URL." -ForegroundColor Red
  exit 1
}
Write-Host ("  URL: {0}" -f $url) -ForegroundColor Green

if (-not (Test-Path -LiteralPath $PublicDir)) {
  New-Item -ItemType Directory -Path $PublicDir | Out-Null
}

Write-Host "[4/4] Generating QR and opening browser..."
& python $GenPy --url $url --dir $AppDir --port $Port
if ($LASTEXITCODE -ne 0) {
  Write-Host "QR generation failed. Try: python -m pip install `"qrcode[pil]`"" -ForegroundColor Yellow
  exit 1
}

$viewUrl = "http://127.0.0.1:{0}/qr-view.html" -f $Port
Start-Process $viewUrl

try {
  Set-Clipboard -Value $url
  Write-Host "URL copied to clipboard."
} catch {}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host " Browser should show the QR page" -ForegroundColor Green
Write-Host (" {0}" -f $viewUrl) -ForegroundColor Cyan
Write-Host (" iPhone: {0}" -f $url) -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "If no browser window: open the URL above on this PC."
Write-Host "Stop: desktop shortcut Flight-PWA-Stop"
