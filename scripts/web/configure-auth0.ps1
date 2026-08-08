<#
.SYNOPSIS
Configures an Auth0 tenant for the Momentum reference architecture with separate Dev and Prod apps.

.DESCRIPTION
Uses the Auth0 CLI (interactive browser login) instead of M2M credentials.
Run `auth0 login --domain <domain>` first, then run this script.

Creates or updates TWO Regular Web Applications:
- "<AppName> (Dev)"  -- localhost redirect URIs only
- "<AppName> (Prod)" -- no redirect URIs (set manually after deployment)

Also creates / updates a Custom API with token_dialect=access_token_authz (CRITICAL for JWT tokens).

Writes two env files at the project root:
- .env.auth0.dev  -- loaded by start-http-auth.ps1 for local development
- .env.auth0.prod -- used for production deployment

.EXAMPLE
# First time: login interactively
auth0 login --domain dev-example.us.auth0.com

# Then run this script
./configure-auth0.ps1 -Domain dev-example.us.auth0.com `
    -AppName "Momentum Server" `
    -DevRedirectUris "http://localhost:5100/oauth/callback"
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory)][string] $Domain,
    [Parameter(Mandatory)][string] $AppName,
    [string] $DevRedirectUris = "http://localhost:5100/oauth/callback",

    [string] $ApiName = "Momentum API",
    [string] $ApiIdentifier = "https://momentum.local/api",
    [string] $ApiScope = "starter-api",
    [string] $Auth0Exe = "$env:LOCALAPPDATA\auth0-cli\auth0.exe"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Write-Step([string]$msg) { Write-Host "`n> $msg" -ForegroundColor Cyan }
function Write-Ok([string]$msg)   { Write-Host "  [OK] $msg" -ForegroundColor Green }
function Write-Warn([string]$msg) { Write-Host "  [WARN] $msg" -ForegroundColor Yellow }

# --- Resolve Auth0 CLI path ---
if (-not (Test-Path $Auth0Exe)) {
    $found = Get-Command auth0 -ErrorAction SilentlyContinue
    if ($found) { $Auth0Exe = $found.Source }
    else { throw "Auth0 CLI not found at '$Auth0Exe' or in PATH. Install from https://github.com/auth0/auth0-cli/releases" }
}

function Invoke-Auth0Cli {
    param(
        [Parameter(Mandatory)][string] $Method,
        [Parameter(Mandatory)][string] $Path,
        [string] $JsonBody = $null
    )

    if ($JsonBody) {
        $raw = $JsonBody | & $Auth0Exe api $Method $Path --no-input 2>&1
    } else {
        $raw = & $Auth0Exe api get $Path --no-input 2>&1
    }

    if ($LASTEXITCODE -ne 0) {
        throw "auth0 api $Method $Path failed: $raw"
    }

    $text = ($raw | Out-String).Trim()
    if ([string]::IsNullOrWhiteSpace($text)) { return $null }
    return ($text | ConvertFrom-Json)
}

# --- Verify CLI session ---
Write-Step "Verifying Auth0 CLI session for $Domain"
try {
    $tenants = & $Auth0Exe tenants list --json --no-input 2>&1
    if ($LASTEXITCODE -ne 0) { throw "not logged in" }
    $tenantList = ($tenants | Out-String) | ConvertFrom-Json
    $match = $tenantList | Where-Object { $_.domain -eq $Domain -or $_.name -eq $Domain }
    if (-not $match) {
        throw "CLI is not logged in to $Domain. Run: & '$Auth0Exe' login --domain $Domain"
    }
    Write-Ok "CLI session active for $Domain"
} catch {
    Write-Host ""
    Write-Host "  Auth0 CLI is not logged in. Opening browser login..." -ForegroundColor Yellow
    & $Auth0Exe login --domain $Domain
    if ($LASTEXITCODE -ne 0) { throw "Auth0 login failed." }
    Write-Ok "Logged in to $Domain"
}

# --- Parse redirect URIs ---
$devCallbackList = @($DevRedirectUris -split "," | ForEach-Object { $_.Trim() } | Where-Object { $_ })
if ($devCallbackList.Count -eq 0) { throw "DevRedirectUris cannot be empty." }

$devWebOrigins = @(
    $devCallbackList | ForEach-Object {
        try {
            $u = [Uri]$_
            "$($u.Scheme)://$($u.Host)" + $(if ($u.IsDefaultPort) { "" } else { ":$($u.Port)" })
        } catch { $_ }
    } | Select-Object -Unique
)

# ============================================================
# 1. Auth0 Applications (Dev + Prod)
# ============================================================

function New-OrUpdateApp {
    param(
        [string] $Name,
        [string[]] $Callbacks,
        [string[]] $WebOrigins
    )

    $allClients = Invoke-Auth0Cli -Method get -Path "clients?fields=client_id,name,app_type,client_secret&include_fields=true"
    $existing = $allClients | Where-Object { $_.name -eq $Name } | Select-Object -First 1

    $payload = @{
        name                        = $Name
        app_type                    = "regular_web"
        callbacks                   = $Callbacks
        allowed_logout_urls         = $Callbacks
        web_origins                 = $WebOrigins
        oidc_conformant             = $true
        grant_types                 = @("authorization_code", "refresh_token")
        token_endpoint_auth_method  = "client_secret_post"
    } | ConvertTo-Json -Depth 10

    if ($existing) {
        Write-Warn "App '$Name' already exists (client_id: $($existing.client_id)). Updating."
        $app = Invoke-Auth0Cli -Method patch -Path "clients/$($existing.client_id)" -JsonBody $payload
    } else {
        $app = Invoke-Auth0Cli -Method post -Path "clients" -JsonBody $payload
    }

    $secret = $app.client_secret
    if ([string]::IsNullOrWhiteSpace($secret)) {
        Write-Warn "Secret not returned for '$Name'. Rotating."
        $rotated = Invoke-Auth0Cli -Method post -Path "clients/$($app.client_id)/rotate-secret" -JsonBody "{}"
        $secret = $rotated.client_secret
    }
    if ([string]::IsNullOrWhiteSpace($secret)) {
        throw "Unable to obtain client secret for '$Name'."
    }

    return @{ ClientId = $app.client_id; ClientSecret = $secret }
}

# --- Dev App (localhost only) ---
$devAppName = "$AppName (Dev)"
Write-Step "Creating or updating Dev app: $devAppName"
$devApp = New-OrUpdateApp -Name $devAppName -Callbacks $devCallbackList -WebOrigins $devWebOrigins
Write-Ok "Dev app ready  client_id=$($devApp.ClientId)"

# --- Prod App (no callbacks yet) ---
$prodAppName = "$AppName (Prod)"
Write-Step "Creating or updating Prod app: $prodAppName"
$prodApp = New-OrUpdateApp -Name $prodAppName -Callbacks @() -WebOrigins @()
Write-Ok "Prod app ready  client_id=$($prodApp.ClientId)"

# ============================================================
# 2. Custom API (resource server)
# ============================================================
Write-Step "Creating or updating Custom API: $ApiIdentifier"

$resourceServers = Invoke-Auth0Cli -Method get -Path "resource-servers"
$existingApi = $resourceServers | Where-Object { $_.identifier -eq $ApiIdentifier } | Select-Object -First 1

$scopeObj = @{ value = $ApiScope; description = "Access Momentum API" }

if ($existingApi) {
    $scopes = @($existingApi.scopes)
    if (-not ($scopes | Where-Object { $_.value -eq $ApiScope })) {
        $scopes += @($scopeObj)
    }

    $apiPayload = @{
        name                                              = $ApiName
        signing_alg                                       = "RS256"
        enforce_policies                                  = $true
        skip_consent_for_verifiable_first_party_clients   = $true
        token_lifetime                                    = 86400
        token_dialect                                     = "access_token_authz"
        scopes                                            = $scopes
    } | ConvertTo-Json -Depth 10

    Invoke-Auth0Cli -Method patch -Path "resource-servers/$($existingApi.id)" -JsonBody $apiPayload | Out-Null
    Write-Warn "Custom API updated (token_dialect=access_token_authz)."
} else {
    $apiPayload = @{
        name                                              = $ApiName
        identifier                                        = $ApiIdentifier
        signing_alg                                       = "RS256"
        enforce_policies                                  = $true
        skip_consent_for_verifiable_first_party_clients   = $true
        token_lifetime                                    = 86400
        token_dialect                                     = "access_token_authz"
        scopes                                            = @($scopeObj)
    } | ConvertTo-Json -Depth 10

    Invoke-Auth0Cli -Method post -Path "resource-servers" -JsonBody $apiPayload | Out-Null
    Write-Ok "Custom API created (token_dialect=access_token_authz)"
}

Write-Ok "API ready  audience=$ApiIdentifier  scope=$ApiScope"

# ============================================================
# 3. Enable self-service signup on database connection
# ============================================================
Write-Step "Enabling self-service signup"

$connections = @(Invoke-Auth0Cli -Method get -Path "connections?strategy=auth0&fields=id,name,enabled_clients,options&include_fields=true")
$dbConn = $connections | Where-Object { $_.PSObject.Properties['name'] -and $_.name -eq "Username-Password-Authentication" } | Select-Object -First 1

if (-not $dbConn) {
    Write-Warn "Username-Password-Authentication connection not found. Signup config skipped."
} else {
    $enabledClients = @((@($dbConn.enabled_clients) + $devApp.ClientId + $prodApp.ClientId) | Select-Object -Unique)

    $opts = @{}
    if ($dbConn.options) {
        foreach ($p in $dbConn.options.PSObject.Properties) {
            $opts[$p.Name] = $p.Value
        }
    }
    $opts["disable_signup"] = $false

    $connPayload = @{
        enabled_clients = $enabledClients
        options         = $opts
    } | ConvertTo-Json -Depth 10

    Invoke-Auth0Cli -Method patch -Path "connections/$($dbConn.id)" -JsonBody $connPayload | Out-Null
    Write-Ok "Signup enabled on $($dbConn.name)"
}

# ============================================================
# Output
# ============================================================
$scopeString = "$ApiScope openid profile email offline_access"
$sep = "=" * 72

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

Write-Host "`n$sep" -ForegroundColor Magenta
Write-Host "Momentum -- Auth0 Configuration" -ForegroundColor Magenta
Write-Host $sep -ForegroundColor Magenta
Write-Host "  Dev  client_id:  $($devApp.ClientId)"
Write-Host "  Prod client_id:  $($prodApp.ClientId)"
Write-Host "  API audience:    $ApiIdentifier"
Write-Host "  Dev callbacks:   $($devCallbackList -join ', ')"
Write-Host "  Prod callbacks:  (none -- set manually after deployment)"

# --- .env.auth0.dev (localhost only) ---
$devEnvContent = @"
# Auth0 OAuth -- Momentum server (DEVELOPMENT / localhost)
# Generated by configure-auth0.ps1 -- DO NOT COMMIT
MOMENTUM_AUTH_MODE=oauth
MOMENTUM_AUTH_OAUTH_ISSUER=https://$Domain
MOMENTUM_AUTH_OAUTH_CLIENT_ID=$($devApp.ClientId)
MOMENTUM_AUTH_OAUTH_CLIENT_SECRET=$($devApp.ClientSecret)
MOMENTUM_AUTH_OAUTH_AUDIENCE=$ApiIdentifier
MOMENTUM_AUTH_OAUTH_SCOPES=$scopeString
MOMENTUM_AUTH_OAUTH_EMAIL_CLAIM=email
MOMENTUM_AUTH_OAUTH_REDIRECT_URI=http://localhost:5100/oauth/callback
"@

$devEnvFile = Join-Path $projectRoot ".env.auth0.dev"
$devEnvContent | Out-File -FilePath $devEnvFile -Encoding utf8
Write-Host "`n[OK] Wrote $devEnvFile" -ForegroundColor Green

# --- .env.auth0.prod (no redirect URI) ---
$prodEnvContent = @"
# Auth0 OAuth -- Momentum server (PRODUCTION)
# Generated by configure-auth0.ps1 -- DO NOT COMMIT
# NOTE: MOMENTUM_AUTH_OAUTH_REDIRECT_URI is set after the production FQDN is known.
MOMENTUM_AUTH_MODE=oauth
MOMENTUM_AUTH_OAUTH_ISSUER=https://$Domain
MOMENTUM_AUTH_OAUTH_CLIENT_ID=$($prodApp.ClientId)
MOMENTUM_AUTH_OAUTH_CLIENT_SECRET=$($prodApp.ClientSecret)
MOMENTUM_AUTH_OAUTH_AUDIENCE=$ApiIdentifier
MOMENTUM_AUTH_OAUTH_SCOPES=$scopeString
MOMENTUM_AUTH_OAUTH_EMAIL_CLAIM=email
"@

$prodEnvFile = Join-Path $projectRoot ".env.auth0.prod"
$prodEnvContent | Out-File -FilePath $prodEnvFile -Encoding utf8
Write-Host "[OK] Wrote $prodEnvFile" -ForegroundColor Green

# --- Legacy auth0.env (reference copy under scripts/) ---
$legacyEnvContent = @"
# Auth0 OAuth -- generated by configure-auth0.ps1 (reference copy)
AUTH0_DOMAIN=$Domain
AUTH0_DEV_CLIENT_ID=$($devApp.ClientId)
AUTH0_PROD_CLIENT_ID=$($prodApp.ClientId)
AUTH0_AUDIENCE=$ApiIdentifier
"@

$legacyEnvFile = Join-Path $PSScriptRoot "auth0.env"
$legacyEnvContent | Out-File -FilePath $legacyEnvFile -Encoding utf8
Write-Host "[OK] Wrote $legacyEnvFile" -ForegroundColor Green

Write-Host ""
Write-Host "[WARN] Do not commit .env.auth0.dev or .env.auth0.prod to source control." -ForegroundColor Yellow
Write-Host "[DONE] Run start-http-auth.ps1 for local dev." -ForegroundColor Green
