<#
.SYNOPSIS
Start the Momentum HTTP server in dev mode (no authentication).

.DESCRIPTION
Launches the .NET server with AUTH_MODE=none — no OAuth login required.
All requests are treated as the dev@localhost user. Use for local development only.
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$projectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")

$env:MOMENTUM_AUTH_MODE = "none"

Write-Host "Starting Momentum HTTP server (dev/no-auth) on http://localhost:5100 ..." -ForegroundColor Cyan
Write-Host "  Auth: none (all requests run as dev@localhost)" -ForegroundColor DarkGray
Write-Host "  Web app: http://localhost:5100/app" -ForegroundColor DarkGray
Write-Host "  MCP:     http://localhost:5100/api/mcp" -ForegroundColor DarkGray
Write-Host ""

Set-Location $projectRoot
& dotnet run --project src/Momentum.Service -- --dev
