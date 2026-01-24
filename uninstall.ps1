# claudectl uninstaller for Windows
# Usage: irm https://raw.githubusercontent.com/shootdaj/claudectl/main/uninstall.ps1 | iex

$ErrorActionPreference = "Stop"

$InstallDir = "$env:USERPROFILE\.claudectl"
$BunBin = "$env:USERPROFILE\.bun\bin"

# Colors
function Write-Cyan { param($msg) Write-Host $msg -ForegroundColor Cyan }
function Write-Green { param($msg) Write-Host $msg -ForegroundColor Green }
function Write-Yellow { param($msg) Write-Host $msg -ForegroundColor Yellow }

Write-Cyan ""
Write-Cyan "+-----------------------------------------+"
Write-Cyan "|     claudectl uninstaller               |"
Write-Cyan "+-----------------------------------------+"
Write-Host ""

# Remove wrapper scripts and aliases
$Scripts = @("claudectl.cmd", "ccl.cmd", "ccln.cmd", "ccls.cmd", "cclc.cmd", "cclr.cmd", "ccll.cmd", "cclw.cmd")

Write-Cyan "Removing command aliases..."
foreach ($script in $Scripts) {
    $path = Join-Path $BunBin $script
    if (Test-Path $path) {
        Remove-Item $path -Force
        Write-Host "  Removed " -NoNewline
        Write-Yellow $script
    }
}

# Ask about user data
if (Test-Path $InstallDir) {
    Write-Host ""
    Write-Yellow "Found claudectl data at $InstallDir"
    Write-Host ""
    $response = Read-Host "Remove all data including settings and index? (y/N)"

    if ($response -eq "y" -or $response -eq "Y") {
        Remove-Item -Recurse -Force $InstallDir
        Write-Green "Removed all claudectl data"
    } else {
        # Remove source but keep user data
        Write-Cyan "Keeping user data, removing source files..."
        Remove-Item -Recurse -Force "$InstallDir\src" -ErrorAction SilentlyContinue
        Remove-Item -Recurse -Force "$InstallDir\node_modules" -ErrorAction SilentlyContinue
        Remove-Item -Force "$InstallDir\package.json" -ErrorAction SilentlyContinue
        Remove-Item -Force "$InstallDir\tsconfig.json" -ErrorAction SilentlyContinue
        Remove-Item -Force "$InstallDir\bun.lockb" -ErrorAction SilentlyContinue
        Remove-Item -Force "$InstallDir\.version" -ErrorAction SilentlyContinue
        Write-Green "Removed source files"
        Write-Yellow "  User data preserved at $InstallDir"
    }
}

Write-Host ""
Write-Green "Uninstall complete!"
Write-Host ""
