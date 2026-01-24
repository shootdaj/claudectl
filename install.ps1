# claudectl installer for Windows
# Usage: irm https://raw.githubusercontent.com/shootdaj/claudectl/main/install.ps1 | iex
#
# Options:
#   $env:VERSION="v2.0.0"; irm ... | iex   # Install specific version
#   $env:VERSION="latest"; irm ... | iex   # Install latest release (default)
#   $env:VERSION="main"; irm ... | iex     # Install from main branch (development)

$ErrorActionPreference = "Stop"

$Repo = "shootdaj/claudectl"
$InstallDir = "$env:USERPROFILE\.claudectl"
$BunDir = "$env:USERPROFILE\.bun"
$BunBin = "$BunDir\bin"

# Colors
function Write-Cyan { param($msg) Write-Host $msg -ForegroundColor Cyan }
function Write-Green { param($msg) Write-Host $msg -ForegroundColor Green }
function Write-Yellow { param($msg) Write-Host $msg -ForegroundColor Yellow }
function Write-Red { param($msg) Write-Host $msg -ForegroundColor Red }

Write-Cyan ""
Write-Cyan "┌─────────────────────────────────────────┐"
Write-Cyan "│     claudectl installer                 │"
Write-Cyan "│     Global Claude Code Manager          │"
Write-Cyan "└─────────────────────────────────────────┘"
Write-Host ""

# Determine version to install
$Version = $env:VERSION
if (-not $Version -or $Version -eq "latest") {
    Write-Cyan "Fetching latest release..."
    try {
        $Release = Invoke-RestMethod -Uri "https://api.github.com/repos/$Repo/releases/latest" -ErrorAction Stop
        $Version = $Release.tag_name
    } catch {
        Write-Yellow "No valid release found, installing from main branch..."
        $Version = "main"
    }
}

if ($Version -eq "main") {
    $DownloadUrl = "https://github.com/$Repo/archive/refs/heads/main.zip"
    Write-Yellow "Installing from main branch (development)"
} else {
    $DownloadUrl = "https://github.com/$Repo/archive/refs/tags/$Version.zip"
    Write-Green "Installing version: $Version"
}

# Check if Bun is installed
$BunExe = "$BunBin\bun.exe"
if (-not (Test-Path $BunExe)) {
    $GlobalBun = Get-Command bun -ErrorAction SilentlyContinue
    if ($GlobalBun) {
        $BunExe = $GlobalBun.Source
    } else {
        Write-Yellow "Installing Bun..."
        irm bun.sh/install.ps1 | iex
        $BunExe = "$BunBin\bun.exe"
    }
}

Write-Cyan "Downloading claudectl..."

# Preserve user data before wiping
$SettingsFile = "$InstallDir\settings.json"
$RenamesFile = "$InstallDir\renamed-sessions.json"
$BackupDir = "$InstallDir\backup"
$IndexDb = "$InstallDir\index.db"
$TempSettings = $null
$TempRenames = $null
$TempBackup = $null
$TempIndex = $null

if (Test-Path $SettingsFile) {
    $TempSettings = [System.IO.Path]::GetTempFileName()
    Copy-Item $SettingsFile $TempSettings
}

if (Test-Path $RenamesFile) {
    $TempRenames = [System.IO.Path]::GetTempFileName()
    Copy-Item $RenamesFile $TempRenames
}

if (Test-Path $BackupDir) {
    $TempBackup = Join-Path ([System.IO.Path]::GetTempPath()) "claudectl-backup-$(Get-Random)"
    Copy-Item -Recurse $BackupDir $TempBackup
}

if (Test-Path $IndexDb) {
    $TempIndex = [System.IO.Path]::GetTempFileName()
    Copy-Item $IndexDb $TempIndex
}

# Download and extract
$TempZip = Join-Path ([System.IO.Path]::GetTempPath()) "claudectl.zip"
$TempExtract = Join-Path ([System.IO.Path]::GetTempPath()) "claudectl-extract-$(Get-Random)"

Invoke-WebRequest -Uri $DownloadUrl -OutFile $TempZip
Expand-Archive -Path $TempZip -DestinationPath $TempExtract -Force

# Find extracted folder (claudectl-main or claudectl-v2.0.0)
$ExtractedFolder = Get-ChildItem $TempExtract | Select-Object -First 1

# Remove old install and move new
if (Test-Path $InstallDir) {
    Remove-Item -Recurse -Force $InstallDir
}
Move-Item $ExtractedFolder.FullName $InstallDir

# Cleanup
Remove-Item $TempZip -ErrorAction SilentlyContinue
Remove-Item -Recurse $TempExtract -ErrorAction SilentlyContinue

# Restore user data
if ($TempSettings -and (Test-Path $TempSettings)) {
    Copy-Item $TempSettings $SettingsFile
    Remove-Item $TempSettings
}

if ($TempRenames -and (Test-Path $TempRenames)) {
    Copy-Item $TempRenames $RenamesFile
    Remove-Item $TempRenames
}

if ($TempBackup -and (Test-Path $TempBackup)) {
    Copy-Item -Recurse $TempBackup "$InstallDir\backup"
    Remove-Item -Recurse $TempBackup
}

if ($TempIndex -and (Test-Path $TempIndex)) {
    Copy-Item $TempIndex $IndexDb
    Remove-Item $TempIndex
}

# Save installed version
$Version | Out-File -FilePath "$InstallDir\.version" -NoNewline

Write-Cyan "Installing dependencies..."
Push-Location $InstallDir
& $BunExe install --silent
Pop-Location

# Create wrapper scripts
if (-not (Test-Path $BunBin)) {
    New-Item -ItemType Directory -Path $BunBin -Force | Out-Null
}

# Create claudectl.cmd
$WrapperCmd = @"
@echo off
"$BunExe" run "$InstallDir\src\index.ts" %*
"@
$WrapperCmd | Out-File -FilePath "$BunBin\claudectl.cmd" -Encoding ASCII

# Create ccl.cmd alias
$AliasCmd = @"
@echo off
"$BunExe" run "$InstallDir\src\index.ts" %*
"@
$AliasCmd | Out-File -FilePath "$BunBin\ccl.cmd" -Encoding ASCII

# Create alias wrappers
# ccln - New project (create wizard)
@"
@echo off
"$BunExe" run "$InstallDir\src\index.ts" new --mode create %*
"@ | Out-File -FilePath "$BunBin\ccln.cmd" -Encoding ASCII

# ccls - Scratch session (quick question)
@"
@echo off
"$BunExe" run "$InstallDir\src\index.ts" new --mode scratch %*
"@ | Out-File -FilePath "$BunBin\ccls.cmd" -Encoding ASCII

# cclc - Clone repo
@"
@echo off
"$BunExe" run "$InstallDir\src\index.ts" new --mode clone %*
"@ | Out-File -FilePath "$BunBin\cclc.cmd" -Encoding ASCII

# cclr - Resume most recent session
@"
@echo off
"$BunExe" run "$InstallDir\src\index.ts" sessions launch --continue %*
"@ | Out-File -FilePath "$BunBin\cclr.cmd" -Encoding ASCII

# ccll - List sessions (text, not TUI)
@"
@echo off
"$BunExe" run "$InstallDir\src\index.ts" sessions list %*
"@ | Out-File -FilePath "$BunBin\ccll.cmd" -Encoding ASCII

# cclw - Web server
@"
@echo off
"$BunExe" run "$InstallDir\src\index.ts" serve %*
"@ | Out-File -FilePath "$BunBin\cclw.cmd" -Encoding ASCII

# cclh - Help
@"
@echo off
"$BunExe" run "$InstallDir\src\index.ts" help %*
"@ | Out-File -FilePath "$BunBin\cclh.cmd" -Encoding ASCII

# Add to PATH if not already there
$UserPath = [Environment]::GetEnvironmentVariable("Path", "User")
if ($UserPath -notlike "*$BunBin*") {
    Write-Yellow "Adding $BunBin to PATH..."
    [Environment]::SetEnvironmentVariable("Path", "$BunBin;$UserPath", "User")
    $env:Path = "$BunBin;$env:Path"
}

Write-Host ""
Write-Green "Installation complete!"
Write-Host "Installed version: " -NoNewline
Write-Cyan $Version
Write-Host ""
Write-Cyan "Commands:"
Write-Host "  claudectl / ccl   Open session picker" -ForegroundColor Green
Write-Host "  ccln              Create new project" -ForegroundColor Green
Write-Host "  ccls              Start scratch session" -ForegroundColor Green
Write-Host "  cclc              Clone from GitHub" -ForegroundColor Green
Write-Host "  cclr              Resume last session" -ForegroundColor Green
Write-Host "  ccll              List sessions" -ForegroundColor Green
Write-Host "  cclw              Start web server" -ForegroundColor Green
Write-Host "  cclh              Show help" -ForegroundColor Green
Write-Host ""
Write-Yellow "Uninstall: irm https://raw.githubusercontent.com/shootdaj/claudectl/main/uninstall.ps1 | iex"
Write-Host ""
Write-Yellow "Note: You may need to restart your terminal for PATH changes to take effect."
Write-Host ""

# Verify
& "$BunBin\claudectl.cmd" --version
