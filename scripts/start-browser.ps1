# PowerShell script to launch Chrome with CDP for Google Flow MCP
$ErrorActionPreference = "Stop"

$chromePath = "C:\Program Files\Google\Chrome\Application\chrome.exe"
if (-not (Test-Path $chromePath)) {
    $chromePath = "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
}
if (-not (Test-Path $chromePath)) {
    Write-Error "Chrome not found at standard paths."
    exit 1
}

$projectDir = Split-Path -Parent $PSScriptRoot
$profileDir = Join-Path $projectDir "chrome-profile-user"
$cdpPort = 9222

if (-not (Test-Path $profileDir)) {
    Write-Host "Initializing persistent Flow profile from system Profile 9..."
    New-Item -ItemType Directory -Path $profileDir -Force | Out-Null
    $systemUserData = "$env:LOCALAPPDATA\Google\Chrome\User Data"
    $localState = Join-Path $systemUserData "Local State"
    if (Test-Path $localState) {
        Copy-Item $localState -Destination (Join-Path $profileDir "Local State") -Force
    }
    $sourceProfile = Join-Path $systemUserData "Profile 9"
    if (Test-Path $sourceProfile) {
        Copy-Item $sourceProfile -Destination (Join-Path $profileDir "Default") -Recurse -Force
    }
}

# Check if port 9222 is already open
try {
    $res = Invoke-RestMethod -Uri "http://127.0.0.1:$cdpPort/json/version" -TimeoutSec 1 -ErrorAction SilentlyContinue
    if ($res) {
        Write-Host "Chrome CDP is already running on port $cdpPort!"
        exit 0
    }
} catch {}

Write-Host "Launching Chrome with remote debugging on port $cdpPort..."
$args = @(
    "--remote-debugging-port=$cdpPort",
    "--user-data-dir=$profileDir",
    "--profile-directory=Default",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-blink-features=AutomationControlled",
    "--window-size=1920,1080",
    "https://flow.google.com/"
)

Start-Process -FilePath $chromePath -ArgumentList $args

# Wait for CDP to be ready
$ready = $false
for ($i = 0; $i -lt 15; $i++) {
    Start-Sleep -Seconds 1
    try {
        $res = Invoke-RestMethod -Uri "http://127.0.0.1:$cdpPort/json/version" -TimeoutSec 1 -ErrorAction SilentlyContinue
        if ($res) {
            $ready = $true
            break
        }
    } catch {}
}

if ($ready) {
    Write-Host "Chrome CDP ready on port $cdpPort! Connected to Google Flow."
} else {
    Write-Warning "Chrome launched, waiting for CDP..."
}
