#requires -Modules PnP.PowerShell
<#
.SYNOPSIS
    Builds and deploys the Momentum SPFx solution package to a SharePoint Online app catalog.
.DESCRIPTION
    Runs the SPFx gulp build, packages the .sppkg file, uploads it to the tenant or site
    app catalog, and deploys the app.
.PARAMETER SiteUrl
    The URL of the target SharePoint site (used for site-collection app catalog deployment).
.PARAMETER AppCatalogUrl
    The URL of the tenant app catalog. If omitted, the script attempts to deploy to the
    site-collection app catalog of SiteUrl.
.PARAMETER SkipBuild
    Skip the gulp build and package-solution steps and deploy an existing .sppkg.
.PARAMETER PackagePath
    Path to the .sppkg file when SkipBuild is used. Defaults to the most recent package
    under apps/spfx/sharepoint/solution.
.EXAMPLE
    .\deploy-spfx.ps1 -AppCatalogUrl https://contoso.sharepoint.com/sites/appcatalog
.EXAMPLE
    .\deploy-spfx.ps1 -SiteUrl https://contoso.sharepoint.com/sites/momentum
#>
param(
    [string]$SiteUrl,
    [string]$AppCatalogUrl,
    [switch]$SkipBuild,
    [string]$PackagePath,
    [string]$PnpClientId = "0830621b-d3e2-410a-b84f-632da100e158"
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$spfxRoot = Join-Path $repoRoot "src\Momentum.Frontend\apps\spfx"

if (-not $SkipBuild) {
    Write-Host "Building SPFx solution..." -ForegroundColor Cyan
    Push-Location $spfxRoot
    try {
        & npx gulp clean
        if ($LASTEXITCODE -ne 0) { throw "gulp clean failed" }
        & npx gulp build
        if ($LASTEXITCODE -ne 0) { throw "gulp build failed" }
        & npx gulp bundle --ship
        if ($LASTEXITCODE -ne 0) { throw "gulp bundle failed" }
        & npx gulp package-solution --ship
        if ($LASTEXITCODE -ne 0) { throw "gulp package-solution failed" }
    } finally {
        Pop-Location
    }
}

if (-not $PackagePath) {
    $solutionDir = Join-Path $spfxRoot "sharepoint\solution"
    $candidates = Get-ChildItem -Path $solutionDir -Filter "*.sppkg" -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending
    if (-not $candidates) {
        throw "No .sppkg file found in $solutionDir. Build the solution first or provide -PackagePath."
    }
    $PackagePath = $candidates[0].FullName
}

Write-Host "Deploying package $PackagePath" -ForegroundColor Cyan

if ($AppCatalogUrl) {
    Connect-PnPOnline -Url $AppCatalogUrl -Interactive -ClientId $PnpClientId
    Add-PnPApp -Path $PackagePath -Overwrite -Publish
} elseif ($SiteUrl) {
    Connect-PnPOnline -Url $SiteUrl -Interactive -ClientId $PnpClientId
    Add-PnPApp -Path $PackagePath -Scope Site -Overwrite -Publish
} else {
    throw "Specify either -AppCatalogUrl or -SiteUrl."
}

if ($SiteUrl -and -not $AppCatalogUrl) {
    Write-Host "Installing app on site..." -ForegroundColor Cyan
    $installed = Get-PnPApp -Scope Site | Where-Object { $_.Title -eq 'momentum-spfx-client-side-solution' -and $_.InstalledVersion }
    if ($installed) {
        Write-Host "Existing installation found; uninstalling before update..." -ForegroundColor Yellow
        Uninstall-PnPApp -Identity $installed.Id -Scope Site
        Start-Sleep -Seconds 15
    }
    Install-PnPApp -Identity "momentum-spfx-client-side-solution" -Scope Site -Wait
    $app = Get-PnPApp -Scope Site | Where-Object { $_.Title -eq 'momentum-spfx-client-side-solution' }
    Write-Host "App installed (catalog: $($app.AppCatalogVersion), installed: $($app.InstalledVersion)). Add the 'Momentum' web part to any page from the web part picker." -ForegroundColor Green
}

Write-Host "Deployment complete." -ForegroundColor Green
