<#
.SYNOPSIS
    TinyTask CLI - Windows build + install (PowerShell).

.DESCRIPTION
    Builds the standalone Windows executable (Node.js SEA) using the locally
    installed Node.js (no download needed - on win32 the running node.exe is
    used directly), then installs it as tinytask.exe in ~\.local\bin.

    This is the PowerShell counterpart of deploy-windows.sh (Git Bash).
    Works in both Windows PowerShell 5.1 and PowerShell 7+.

    Usage (from PowerShell on a Windows machine):

        .\deploy-windows.ps1

    Result:

        dist\tko-win.exe            (build artifact)
        ~\.local\bin\tinytask.exe   (installed)
#>
$ErrorActionPreference = 'Stop'

# Always build from the script's directory, no matter where it is launched from.
Set-Location $PSScriptRoot

Write-Host '> Building TinyTask CLI (Windows)...'

npm run build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

npm run package-windows
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$artifact = Join-Path (Get-Location) 'dist\tko-win.exe'
if (-not (Test-Path -LiteralPath $artifact)) {
    Write-Error "Build failed: artifact not found at $artifact"
    exit 1
}

$binDir    = Join-Path $HOME '.local\bin'
$installed = Join-Path $binDir 'tinytask.exe'

New-Item -ItemType Directory -Force -Path $binDir | Out-Null
Copy-Item -LiteralPath $artifact -Destination $installed -Force

Write-Host ''
& $installed --version
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ''
Write-Host "> Installed to $installed"
Write-Host "  (make sure $binDir is on your Windows PATH)"
