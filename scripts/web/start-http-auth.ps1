<#
.SYNOPSIS
Load .env.auth0.dev and start the Momentum HTTP server with Auth0 authentication.

.DESCRIPTION
Reads MOMENTUM_AUTH_* vars from .env.auth0.dev at the project root, sets them in the
current process environment, then launches the server in HTTP mode on port 5100.

This uses the Dev Auth0 app which only has localhost redirect URIs registered.
Run scripts/configure-auth0.ps1 first to generate .env.auth0.dev.
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$projectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$envFile     = Join-Path $projectRoot ".env.auth0.dev"

if (-not (Test-Path $envFile)) {
    Write-Host "[ERROR] $envFile not found." -ForegroundColor Red
    Write-Host "  Run: scripts/configure-auth0.ps1 -Domain <your-domain> -AppName `"Momentum Server`"" -ForegroundColor Yellow
    exit 1
}

Write-Host "Loading $envFile ..." -ForegroundColor Cyan
Get-Content $envFile | ForEach-Object {
    $line = $_.Trim()
    if ($line -and -not $line.StartsWith('#') -and $line -match '^([^=]+)=(.*)$') {
        $k = $Matches[1].Trim()
        $v = $Matches[2].Trim()
        [System.Environment]::SetEnvironmentVariable($k, $v, 'Process')
        Write-Host "  SET $k" -ForegroundColor DarkGray
    }
}

Write-Host ""
Write-Host "Starting Momentum HTTP server (Auth0) on http://localhost:5100/api/mcp ..." -ForegroundColor Cyan

Set-Location $projectRoot
& dotnet run --project src/Momentum.Service
