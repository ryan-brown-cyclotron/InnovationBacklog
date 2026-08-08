#Requires -Version 7.0
# Run in PowerShell with Azure CLI (az) and GitHub CLI (gh) installed and authenticated.
# Requires permission to create Microsoft Entra app registrations.
$ErrorActionPreference = "Stop"

# ---------------------------------------------------------------------------
# Replace these values with your own before running.
# ---------------------------------------------------------------------------
$ORG = "your-github-org"          # GitHub organization or username
$REPO = "your-repo-name"          # Repository name
$APP_NAME = "spfx-github-deploy"  # Microsoft Entra app registration name
$ENVIRONMENT = "sharepoint-production"

# ---------------------------------------------------------------------------
# Validate that required tools are present.
# ---------------------------------------------------------------------------
if (-not (Get-Command az -ErrorAction SilentlyContinue)) {
    throw "Azure CLI (az) is not installed."
}
if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
    throw "GitHub CLI (gh) is not installed."
}

# ---------------------------------------------------------------------------
# Create the Microsoft Entra app registration.
# ---------------------------------------------------------------------------
Write-Host "Creating app registration: $APP_NAME"
$APP_JSON = (az ad app create --display-name $APP_NAME --query "{appId:appId,id:id}" -o json) | ConvertFrom-Json
$APP_ID = $APP_JSON.appId
$OBJECT_ID = $APP_JSON.id
$TENANT_ID = (az account show --query tenantId -o tsv)

Write-Host "App (client) ID:    $APP_ID"
Write-Host "App object ID:      $OBJECT_ID"
Write-Host "Tenant ID:          $TENANT_ID"

# ---------------------------------------------------------------------------
# Add SharePoint application permission: Sites.FullControl.All
# ---------------------------------------------------------------------------
$SHAREPOINT_APP_ID = "00000003-0000-0ff1-ce00-000000000000"
$PERMISSION_ID = (az ad sp show --id $SHAREPOINT_APP_ID --query "appRoles[?value=='Sites.FullControl.All'].id | [0]" -o tsv)

if ([string]::IsNullOrWhiteSpace($PERMISSION_ID)) {
    throw "Could not resolve permission ID for Sites.FullControl.All."
}

Write-Host "Sites.FullControl.All permission ID: $PERMISSION_ID"
az ad app permission add --id $APP_ID --api $SHAREPOINT_APP_ID --api-permissions "${PERMISSION_ID}=Role"

# ---------------------------------------------------------------------------
# Grant tenant-wide admin consent.
# ---------------------------------------------------------------------------
Write-Host "Granting admin consent..."
az ad app permission admin-consent --id $APP_ID

# ---------------------------------------------------------------------------
# Add a federated credential for GitHub OIDC.
# ---------------------------------------------------------------------------
$FEDERATED_NAME = "github-$ENVIRONMENT"
$SUBJECT = "repo:${ORG}/${REPO}:environment:${ENVIRONMENT}"

Write-Host "Adding federated credential: $FEDERATED_NAME"
Write-Host "Subject: $SUBJECT"

$CREDENTIAL = @{
    name        = $FEDERATED_NAME
    issuer      = "https://token.actions.githubusercontent.com"
    subject     = $SUBJECT
    description = "GitHub Actions OIDC for SPFx deployment to $ENVIRONMENT"
    audiences   = @("api://AzureADTokenExchange")
} | ConvertTo-Json -Compress

$tempFile = [System.IO.Path]::GetTempFileName()
$CREDENTIAL | Set-Content -Path $tempFile -Encoding UTF8

try {
    az ad app federated-credential create --id $OBJECT_ID --parameters "@$tempFile"
}
finally {
    Remove-Item $tempFile
}

# ---------------------------------------------------------------------------
# Create the GitHub environment and variables.
# ---------------------------------------------------------------------------
Write-Host "Creating GitHub environment: $ENVIRONMENT"
gh api --method PUT -H "Accept: application/vnd.github+json" "/repos/${ORG}/${REPO}/environments/${ENVIRONMENT}" 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host "Environment creation returned an error; continuing."
}

Write-Host "Setting GitHub environment variables..."
gh variable set ENTRA_CLIENT_ID --env $ENVIRONMENT --body $APP_ID
gh variable set ENTRA_TENANT_ID --env $ENVIRONMENT --body $TENANT_ID
gh variable set SPFX_TENANT_WIDE --env $ENVIRONMENT --body "false"

Write-Host ""
Write-Host "Deployment identity setup complete."
Write-Host ""
Write-Host "GitHub environment variables for $ENVIRONMENT`:"
Write-Host "  ENTRA_CLIENT_ID:  $APP_ID"
Write-Host "  ENTRA_TENANT_ID:  $TENANT_ID"
Write-Host "  SPFX_TENANT_WIDE: false"
Write-Host ""
Write-Host "If you want tenant-wide deployment, set SPFX_TENANT_WIDE to 'true' in GitHub."
