#!/usr/bin/env bash
# Run in Azure Cloud Shell or any shell with the Azure CLI and GitHub CLI installed.
# Requires: az login, gh auth login, and permission to create app registrations.
set -euo pipefail

# ---------------------------------------------------------------------------
# Replace these values with your own before running.
# ---------------------------------------------------------------------------
ORG="your-github-org"          # GitHub organization or username
REPO="your-repo-name"          # Repository name
APP_NAME="spfx-github-deploy"  # Microsoft Entra app registration name
ENVIRONMENT="sharepoint-production"

# ---------------------------------------------------------------------------
# Validate that required tools are present.
# ---------------------------------------------------------------------------
if ! command -v az &>/dev/null; then
  echo "Azure CLI (az) is not installed."
  exit 1
fi
if ! command -v gh &>/dev/null; then
  echo "GitHub CLI (gh) is not installed."
  exit 1
fi

# ---------------------------------------------------------------------------
# Create the Microsoft Entra app registration.
# ---------------------------------------------------------------------------
echo "Creating app registration: ${APP_NAME}"
APP_JSON=$(az ad app create --display-name "$APP_NAME" --query "{appId:appId,id:id}" -o json)
APP_ID=$(echo "$APP_JSON" | jq -r .appId)
OBJECT_ID=$(echo "$APP_JSON" | jq -r .id)
TENANT_ID=$(az account show --query tenantId -o tsv)

echo "App (client) ID:    ${APP_ID}"
echo "App object ID:      ${OBJECT_ID}"
echo "Tenant ID:          ${TENANT_ID}"

# ---------------------------------------------------------------------------
# Add SharePoint application permission: Sites.FullControl.All
# ---------------------------------------------------------------------------
SHAREPOINT_APP_ID="00000003-0000-0ff1-ce00-000000000000"
PERMISSION_ID=$(az ad sp show --id "$SHAREPOINT_APP_ID" \
  --query "appRoles[?value=='Sites.FullControl.All'].id | [0]" -o tsv)

if [[ -z "$PERMISSION_ID" ]]; then
  echo "Could not resolve permission ID for Sites.FullControl.All."
  exit 1
fi

echo "Sites.FullControl.All permission ID: ${PERMISSION_ID}"
az ad app permission add \
  --id "$APP_ID" \
  --api "$SHAREPOINT_APP_ID" \
  --api-permissions "${PERMISSION_ID}=Role"

# ---------------------------------------------------------------------------
# Grant tenant-wide admin consent.
# ---------------------------------------------------------------------------
echo "Granting admin consent..."
az ad app permission admin-consent --id "$APP_ID"

# ---------------------------------------------------------------------------
# Add a federated credential for GitHub OIDC.
# ---------------------------------------------------------------------------
FEDERATED_NAME="github-${ENVIRONMENT}"
SUBJECT="repo:${ORG}/${REPO}:environment:${ENVIRONMENT}"

echo "Adding federated credential: ${FEDERATED_NAME}"
echo "Subject: ${SUBJECT}"
az ad app federated-credential create \
  --id "$OBJECT_ID" \
  --parameters "{
    \"name\": \"${FEDERATED_NAME}\",
    \"issuer\": \"https://token.actions.githubusercontent.com\",
    \"subject\": \"${SUBJECT}\",
    \"description\": \"GitHub Actions OIDC for SPFx deployment to ${ENVIRONMENT}\",
    \"audiences\": [\"api://AzureADTokenExchange\"]
  }"

# ---------------------------------------------------------------------------
# Create the GitHub environment and variables.
# ---------------------------------------------------------------------------
echo "Creating GitHub environment: ${ENVIRONMENT}"
gh api --method PUT \
  -H "Accept: application/vnd.github+json" \
  "/repos/${ORG}/${REPO}/environments/${ENVIRONMENT}" || echo "Environment creation returned an error; continuing."

echo "Setting GitHub environment variables..."
gh variable set ENTRA_CLIENT_ID --env "$ENVIRONMENT" --body "$APP_ID"
gh variable set ENTRA_TENANT_ID --env "$ENVIRONMENT" --body "$TENANT_ID"
gh variable set SPFX_TENANT_WIDE --env "$ENVIRONMENT" --body "false"

echo
echo "Deployment identity setup complete."
echo
echo "GitHub environment variables for ${ENVIRONMENT}:"
echo "  ENTRA_CLIENT_ID:  ${APP_ID}"
echo "  ENTRA_TENANT_ID:  ${TENANT_ID}"
echo "  SPFX_TENANT_WIDE: false"
echo
echo "If you want tenant-wide deployment, set SPFX_TENANT_WIDE to 'true' in GitHub."
