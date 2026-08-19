#Requires -Version 7.0
<#
.SYNOPSIS
    Start the Momentum function app — MCP tools and skill intake — on its own.

.DESCRIPTION
    The function app is the whole server surface: five read-only MCP tools for agents, and
    three HTTP endpoints for skill intake. Nothing else in the solution serves anything.

    Use this when the function app is what you are working on. Use the Aspire app host
    instead when you want the code app's dev server alongside it:

        dotnet run --project src/Momentum.AppHost

    The two compete for the same port, so run one at a time.

    WHY THIS SCRIPT EXISTS rather than just `func start`:

      * The MCP endpoints live on the Functions *host*, not on the worker executable, so
        `dotnet run` serves nothing at all. It has to be the Core Tools host.
      * global.json pins a .NET SDK that may be ahead of the installed runtime, so the
        worker needs DOTNET_ROLL_FORWARD to launch.
      * The host will not start without a storage emulator, and fails with a connection
        error that does not mention Azurite.

.PARAMETER Port
    Defaults to 7071, matching the app host and .vscode/mcp.json. Change both if you
    change this.

.PARAMETER SkipAzuriteCheck
    Skip the storage probe. Only useful when AzureWebJobsStorage points at real storage.

.EXAMPLE
    ./scripts/dev/start-mcp.ps1

.EXAMPLE
    ./scripts/dev/start-mcp.ps1 -Port 7099
#>
param(
    [int]$Port = 7071,

    [switch]$SkipAzuriteCheck
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# scripts/dev/ -> repository root. Two levels, not one.
$repositoryRoot = Resolve-Path (Join-Path $PSScriptRoot "../..")
$appPath = Join-Path $repositoryRoot "src/Momentum.Mcp"

if (-not (Get-Command func -ErrorAction SilentlyContinue)) {
    Write-Host "[ERROR] Azure Functions Core Tools ('func') is not on PATH." -ForegroundColor Red
    Write-Host "  winget install Microsoft.Azure.FunctionsCoreTools" -ForegroundColor Yellow
    exit 1
}

if (-not (Test-Path (Join-Path $appPath "local.settings.json"))) {
    Write-Host "[ERROR] src/Momentum.Mcp/local.settings.json not found." -ForegroundColor Red
    Write-Host "  It is gitignored. See docs/reference/skill-intake-configuration.md for the" -ForegroundColor Yellow
    Write-Host "  Momentum:Skills settings, and Momentum:Mcp for the backlog backends." -ForegroundColor Yellow
    exit 1
}

<#
    Azurite's blob port. The Functions host needs AzureWebJobsStorage for its own lease and
    singleton bookkeeping even though no function in this app touches storage, and the
    failure without it is a socket error that never names the emulator.
#>
if (-not $SkipAzuriteCheck) {
    $storageUp = Test-Connection -TargetName 127.0.0.1 -TcpPort 10000 -Quiet -ErrorAction SilentlyContinue

    if (-not $storageUp) {
        Write-Host "[ERROR] Nothing listening on 127.0.0.1:10000 — Azurite is not running." -ForegroundColor Red
        Write-Host "  Start it in another terminal:" -ForegroundColor Yellow
        Write-Host "    npx azurite --silent --location .azurite" -ForegroundColor Yellow
        Write-Host "  Or pass -SkipAzuriteCheck if AzureWebJobsStorage points at real storage." -ForegroundColor DarkGray
        exit 1
    }

    Write-Host "  Azurite      reachable on 127.0.0.1:10000" -ForegroundColor DarkGray
}

# global.json can pin an SDK newer than the installed runtime; without this the worker
# process exits before it reports why.
if ([string]::IsNullOrWhiteSpace($env:DOTNET_ROLL_FORWARD)) {
    $env:DOTNET_ROLL_FORWARD = "Major"
    Write-Host "  Set          DOTNET_ROLL_FORWARD=Major" -ForegroundColor DarkGray
}

Write-Host ""
Write-Host "Starting Momentum.Mcp on port $Port" -ForegroundColor Cyan
Write-Host "  MCP tools    http://localhost:$Port/runtime/webhooks/mcp" -ForegroundColor DarkGray
Write-Host "               search, list, get, describe, whoami — all read-only" -ForegroundColor DarkGray
Write-Host "  Skill intake http://localhost:$Port/api/skills/{validate,commit,provision}" -ForegroundColor DarkGray
Write-Host ""
Write-Host "  skills/validate needs no credential. commit and provision reach a git host —" -ForegroundColor DarkGray
Write-Host "  see docs/reference/skill-intake-configuration.md." -ForegroundColor DarkGray
Write-Host ""

Set-Location $appPath
& func start --port $Port
