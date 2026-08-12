#Requires -Version 7.0
<#
.SYNOPSIS
    Provisions the Entra app registration that the Momentum MCP server authenticates
    callers against and exchanges their tokens through.

.DESCRIPTION
    The MCP server needs one dedicated app registration doing three jobs:

      1. Being the audience of the inbound token. Callers authenticate to the MCP
         server, and the token they present names this registration. It is never
         forwarded downstream.
      2. Holding the delegated permissions for both backends, so the server can
         exchange that inbound token for a Dataverse token and an Azure DevOps token
         on behalf of the caller.
      3. Naming the MCP clients allowed to request it, because Entra has no dynamic
         client registration.

    Idempotent: every Ensure-* helper reads before it writes and reports Exists
    instead of failing, so re-running after a partial failure is the intended
    recovery path.

    WHAT THIS SCRIPT CANNOT DO. Two steps require a tenant administrator acting
    interactively and are printed as follow-ups rather than attempted:

      - Admin consent on the two delegated permissions. Until it is granted, the
        on-behalf-of exchange fails for every caller, including the person who ran
        this script.
      - Enabling App Service Authentication on the function app. That is a change to
        the hosting resource, not to the directory, and it is what actually makes the
        server demand a token.

    OBO CARRIES ACCESS, IT DOES NOT GRANT IT. A caller with no Dataverse security
    role or no Azure DevOps project membership still gets a 403 from that backend
    after every step here succeeds. That is the designed behaviour, not a
    misconfiguration - tools report per-backend reachability rather than failing whole.

.PARAMETER DisplayName
    Display name of the app registration.

.PARAMETER TenantId
    Entra tenant to provision in. Defaults to the signed-in az account's tenant.

.PARAMETER ManagedIdentityPrincipalId
    Object id of the function app's managed identity, registered as a federated
    identity credential so no client secret is ever deployed. Omit while the function
    app does not exist yet; the script warns and skips that step.

.PARAMETER PreauthorizedClientIds
    Application ids of MCP clients permitted to request this server's scope. Defaults
    to Visual Studio Code and Visual Studio. Some clients never surface an interactive
    consent prompt, so without preauthorization their users hit a consent error that
    reads like a bug in the server.

.EXAMPLE
    ./Provision-McpAppRegistration.ps1

.EXAMPLE
    ./Provision-McpAppRegistration.ps1 -ManagedIdentityPrincipalId 8f3c... -Verbose
#>
param(
    [string]$DisplayName = "Momentum MCP Server",

    [string]$TenantId,

    [string]$ManagedIdentityPrincipalId,

    [string[]]$PreauthorizedClientIds = @(
        "aebc6443-996d-45c2-90f0-388ff96faa56",  # Visual Studio Code
        "04f0c124-f2bc-4f59-8241-bf6df9866bbd"   # Visual Studio
    ),

    [string]$ScopeName = "user_impersonation"
)

$ErrorActionPreference = "Stop"

# ---------------------------------------------------------------------------
# Resource app ids. Both are fixed first-party values, identical in every tenant.
# ---------------------------------------------------------------------------

$script:AzureDevOpsAppId = "499b84ac-1321-427f-aa17-267ca6975798"
$script:DataverseAppId = "00000007-0000-0000-c000-000000000000"
$script:GraphBase = "https://graph.microsoft.com/v1.0"

function Write-Created { param([string]$Message) Write-Host "  Created $Message" -ForegroundColor Green }
function Write-Exists { param([string]$Message) Write-Host "  Exists  $Message" -ForegroundColor DarkGray }
function Write-Updated { param([string]$Message) Write-Host "  Updated $Message" -ForegroundColor Yellow }
function Write-Step { param([string]$Message) Write-Host "`n$Message" -ForegroundColor Cyan }
function Write-Skipped { param([string]$Message) Write-Host "  Skipped $Message" -ForegroundColor DarkYellow }

# ---------------------------------------------------------------------------
# Graph plumbing
# ---------------------------------------------------------------------------

<#
    az rest rather than the Az or Microsoft.Graph PowerShell modules: az is already a
    prerequisite of the Dataverse script in this folder, and this avoids adding a
    module dependency for a handful of calls.
#>
function Invoke-Graph {
    param(
        [Parameter(Mandatory = $true)][string]$Method,
        [Parameter(Mandatory = $true)][string]$Path,
        [object]$Body
    )

    $arguments = @(
        "rest",
        "--method", $Method.ToLowerInvariant(),
        "--uri", "$script:GraphBase$Path",
        "--headers", "Content-Type=application/json"
    )

    $bodyFile = $null
    if ($null -ne $Body) {
        # Through a file: quoting a JSON body inline is a portability trap on Windows.
        $bodyFile = New-TemporaryFile
        ($Body | ConvertTo-Json -Depth 20) | Set-Content -Path $bodyFile -Encoding utf8
        $arguments += @("--body", "@$bodyFile")
    }

    try {
        $output = & az @arguments 2>&1
        if ($LASTEXITCODE -ne 0) {
            throw "$Method $Path failed: $($output -join "`n")"
        }

        $text = ($output | Out-String).Trim()
        if ([string]::IsNullOrWhiteSpace($text)) { return $null }
        return $text | ConvertFrom-Json
    }
    finally {
        if ($bodyFile -and (Test-Path $bodyFile)) { Remove-Item $bodyFile -Force }
    }
}

function Get-DelegatedScopeId {
    param(
        [Parameter(Mandatory = $true)][string]$ResourceAppId,
        [Parameter(Mandatory = $true)][string]$ScopeValue,
        [Parameter(Mandatory = $true)][string]$Label
    )

    <#
        Resolved rather than hardcoded. The scope ids are stable, but a lookup fails
        loudly and specifically when the resource's service principal is absent from
        the tenant - which is the actual failure people hit with Dataverse, and which
        a hardcoded guid would turn into an opaque consent error much later.
    #>
    $principal = (Invoke-Graph GET "/servicePrincipals?`$filter=appId eq '$ResourceAppId'&`$select=id,appId,appDisplayName,oauth2PermissionScopes").value

    if (-not $principal -or $principal.Count -eq 0) {
        throw "No service principal for $Label ($ResourceAppId) in this tenant. " +
              "Add it before running this script, e.g. `az ad sp create --id $ResourceAppId`."
    }

    $scope = $principal[0].oauth2PermissionScopes | Where-Object { $_.value -eq $ScopeValue }
    if (-not $scope) {
        throw "$Label exposes no '$ScopeValue' delegated scope."
    }

    return $scope.id
}

# ---------------------------------------------------------------------------
# Ensure-* helpers
# ---------------------------------------------------------------------------

function Ensure-Application {
    param([Parameter(Mandatory = $true)][string]$Name)

    $existing = (Invoke-Graph GET "/applications?`$filter=displayName eq '$Name'&`$select=id,appId,displayName").value

    if ($existing -and $existing.Count -gt 0) {
        Write-Exists "application '$Name' (appId $($existing[0].appId))"
        return $existing[0]
    }

    $created = Invoke-Graph POST "/applications" @{
        displayName    = $Name
        signInAudience = "AzureADMyOrg"
    }

    Write-Created "application '$Name' (appId $($created.appId))"
    return $created
}

function Ensure-ExposedScope {
    param(
        [Parameter(Mandatory = $true)]$Application,
        [Parameter(Mandatory = $true)][string]$Value
    )

    $current = Invoke-Graph GET "/applications/$($Application.id)?`$select=id,appId,identifierUris,api"
    $identifierUri = "api://$($Application.appId)"

    $scope = $current.api.oauth2PermissionScopes | Where-Object { $_.value -eq $Value }

    if ($scope -and $current.identifierUris -contains $identifierUri) {
        Write-Exists "scope $identifierUri/$Value"
        return $scope.id
    }

    # Reuse the existing scope id when only the identifier uri is missing: changing a
    # scope id revokes every consent already granted against it.
    $scopeId = if ($scope) { $scope.id } else { [guid]::NewGuid().ToString() }

    $body = @{
        identifierUris = @($identifierUri)
        api            = @{
            oauth2PermissionScopes = @(
                @{
                    id                      = $scopeId
                    value                   = $Value
                    type                    = "User"
                    isEnabled               = $true
                    adminConsentDisplayName = "Access the Momentum MCP server"
                    adminConsentDescription = "Allows the app to query the Innovation Backlog through the Momentum MCP server as the signed-in user."
                    userConsentDisplayName  = "Access the Momentum MCP server on your behalf"
                    userConsentDescription  = "Allows the app to query the Innovation Backlog as you."
                }
            )
        }
    }

    Invoke-Graph PATCH "/applications/$($Application.id)" $body | Out-Null
    Write-Created "scope $identifierUri/$Value"
    return $scopeId
}

function Ensure-RequiredResourceAccess {
    param(
        [Parameter(Mandatory = $true)]$Application,
        [Parameter(Mandatory = $true)][hashtable]$ScopeIdsByResource
    )

    $desired = @()
    foreach ($resourceAppId in $ScopeIdsByResource.Keys) {
        $desired += @{
            resourceAppId  = $resourceAppId
            resourceAccess = @(@{ id = $ScopeIdsByResource[$resourceAppId]; type = "Scope" })
        }
    }

    $current = Invoke-Graph GET "/applications/$($Application.id)?`$select=id,requiredResourceAccess"

    $alreadyGranted = $true
    foreach ($want in $desired) {
        $have = $current.requiredResourceAccess | Where-Object { $_.resourceAppId -eq $want.resourceAppId }
        if (-not $have -or -not ($have.resourceAccess.id -contains $want.resourceAccess[0].id)) {
            $alreadyGranted = $false
            break
        }
    }

    if ($alreadyGranted) {
        Write-Exists "delegated permissions for Dataverse and Azure DevOps"
        return
    }

    Invoke-Graph PATCH "/applications/$($Application.id)" @{ requiredResourceAccess = $desired } | Out-Null
    Write-Created "delegated permissions for Dataverse and Azure DevOps"
}

function Ensure-PreauthorizedClients {
    param(
        [Parameter(Mandatory = $true)]$Application,
        [Parameter(Mandatory = $true)][string]$ScopeId,
        [Parameter(Mandatory = $true)][string[]]$ClientIds
    )

    if ($ClientIds.Count -eq 0) {
        Write-Skipped "preauthorized clients (none requested)"
        return
    }

    $current = Invoke-Graph GET "/applications/$($Application.id)?`$select=id,api"
    $existing = @($current.api.preAuthorizedApplications)

    $missing = $ClientIds | Where-Object { $id = $_; -not ($existing | Where-Object { $_.appId -eq $id }) }

    if (-not $missing -or $missing.Count -eq 0) {
        Write-Exists "preauthorized clients ($($ClientIds -join ', '))"
        return
    }

    # Merge rather than replace: the api object is written whole, so dropping the
    # existing entries here would silently deauthorize clients someone added by hand.
    $merged = @()
    foreach ($entry in $existing) {
        $merged += @{ appId = $entry.appId; delegatedPermissionIds = @($entry.delegatedPermissionIds) }
    }
    foreach ($clientId in $missing) {
        $merged += @{ appId = $clientId; delegatedPermissionIds = @($ScopeId) }
    }

    Invoke-Graph PATCH "/applications/$($Application.id)" @{
        api = @{ preAuthorizedApplications = $merged }
    } | Out-Null

    Write-Created "preauthorized clients ($($missing -join ', '))"
}

function Ensure-ServicePrincipal {
    param([Parameter(Mandatory = $true)]$Application)

    $existing = (Invoke-Graph GET "/servicePrincipals?`$filter=appId eq '$($Application.appId)'&`$select=id,appId").value

    if ($existing -and $existing.Count -gt 0) {
        Write-Exists "service principal"
        return $existing[0]
    }

    $created = Invoke-Graph POST "/servicePrincipals" @{ appId = $Application.appId }
    Write-Created "service principal"
    return $created
}

function Ensure-FederatedCredential {
    param(
        [Parameter(Mandatory = $true)]$Application,
        [Parameter(Mandatory = $true)][string]$PrincipalId,
        [Parameter(Mandatory = $true)][string]$Tenant
    )

    $name = "momentum-mcp-managed-identity"
    $existing = (Invoke-Graph GET "/applications/$($Application.id)/federatedIdentityCredentials").value |
        Where-Object { $_.name -eq $name }

    if ($existing) {
        if ($existing.subject -eq $PrincipalId) {
            Write-Exists "federated credential '$name'"
            return
        }

        Invoke-Graph PATCH "/applications/$($Application.id)/federatedIdentityCredentials/$($existing.id)" @{
            subject = $PrincipalId
        } | Out-Null
        Write-Updated "federated credential '$name' (subject changed)"
        return
    }

    Invoke-Graph POST "/applications/$($Application.id)/federatedIdentityCredentials" @{
        name        = $name
        issuer      = "https://login.microsoftonline.com/$Tenant/v2.0"
        subject     = $PrincipalId
        audiences   = @("api://AzureADTokenExchange")
        description = "Function app managed identity, so the OBO exchange needs no client secret."
    } | Out-Null

    Write-Created "federated credential '$name'"
}

# ---------------------------------------------------------------------------
# Run
# ---------------------------------------------------------------------------

$account = az account show --output json 2>$null | ConvertFrom-Json
if (-not $account) {
    throw "Not signed in. Run `az login` first."
}

if ([string]::IsNullOrWhiteSpace($TenantId)) { $TenantId = $account.tenantId }

Write-Host "Tenant : $TenantId"
Write-Host "Signed in as: $($account.user.name)"

Write-Step "Resolving downstream scopes"
$adoScopeId = Get-DelegatedScopeId -ResourceAppId $script:AzureDevOpsAppId -ScopeValue "user_impersonation" -Label "Azure DevOps"
Write-Host "  Azure DevOps user_impersonation = $adoScopeId" -ForegroundColor DarkGray
$dataverseScopeId = Get-DelegatedScopeId -ResourceAppId $script:DataverseAppId -ScopeValue "user_impersonation" -Label "Dataverse"
Write-Host "  Dataverse    user_impersonation = $dataverseScopeId" -ForegroundColor DarkGray

Write-Step "Application"
$application = Ensure-Application -Name $DisplayName

Write-Step "Exposed API"
$scopeId = Ensure-ExposedScope -Application $application -Value $ScopeName

Write-Step "Downstream permissions"
Ensure-RequiredResourceAccess -Application $application -ScopeIdsByResource @{
    $script:AzureDevOpsAppId = $adoScopeId
    $script:DataverseAppId   = $dataverseScopeId
}

Write-Step "MCP clients"
Ensure-PreauthorizedClients -Application $application -ScopeId $scopeId -ClientIds $PreauthorizedClientIds

Write-Step "Service principal"
Ensure-ServicePrincipal -Application $application | Out-Null

Write-Step "Client credential"
if ([string]::IsNullOrWhiteSpace($ManagedIdentityPrincipalId)) {
    Write-Skipped "federated credential - pass -ManagedIdentityPrincipalId once the function app exists"
}
else {
    Ensure-FederatedCredential -Application $application -PrincipalId $ManagedIdentityPrincipalId -Tenant $TenantId
}

# ---------------------------------------------------------------------------
# What the operator still has to do
# ---------------------------------------------------------------------------

$identifierUri = "api://$($application.appId)"

Write-Host "`n--- Function app settings ---" -ForegroundColor Cyan
Write-Host "Momentum:Mcp:ClientId                 = $($application.appId)"
Write-Host "Momentum:Mcp:TenantId                 = $TenantId"
Write-Host "Momentum:Mcp:AuthMode                 = Obo"
Write-Host "WEBSITE_AUTH_PRM_DEFAULT_WITH_SCOPES  = $identifierUri/$ScopeName"

Write-Host "`n--- Manual follow-ups (this script cannot do these) ---" -ForegroundColor Yellow
Write-Host "1. Grant admin consent for the Dataverse and Azure DevOps delegated permissions:"
Write-Host "     az ad app permission admin-consent --id $($application.appId)"
Write-Host "   Until this is done the on-behalf-of exchange fails for every caller."
Write-Host "2. Enable App Service Authentication (Entra) on the function app, using this"
Write-Host "   registration as the identity provider. That is what makes the server"
Write-Host "   demand a token; the app setting above only advertises the scope."
Write-Host "3. If the function app's managed identity did not exist when this ran, re-run"
Write-Host "   with -ManagedIdentityPrincipalId to add the federated credential."

Write-Host "`n--- Verify ---" -ForegroundColor Cyan
Write-Host "Call the 'whoami' tool. It reports each backend separately, so a caller who"
Write-Host "can reach one but not the other tells you exactly which grant is missing."

[PSCustomObject]@{
    ApplicationObjectId = $application.id
    ClientId            = $application.appId
    TenantId            = $TenantId
    IdentifierUri       = $identifierUri
    Scope               = "$identifierUri/$ScopeName"
}
