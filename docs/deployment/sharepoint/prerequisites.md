# Prerequisites

## Tooling

| Tool | Version | Purpose |
|---|---|---|
| PowerShell | 7+ | PnP PowerShell 3.x requires PS 7 |
| PnP.PowerShell | 3.x | SharePoint list provisioning and app deployment |
| Node.js | 18+ | SPFx build toolchain |
| pnpm | 10+ | Monorepo package management and builds |

### Install PowerShell 7

```powershell
winget install --id Microsoft.PowerShell --source winget
```

### Install PnP PowerShell

```powershell
pwsh -Command "Install-Module PnP.PowerShell -Scope CurrentUser -Force"
```

### Install Node.js and pnpm

```powershell
winget install --id OpenJS.NodeJS
npm install -g pnpm
```

## Entra ID App Registration

PnP PowerShell 3.x requires your own Entra ID app registration for interactive login. Register one with SharePoint delegated permissions:

```powershell
pwsh -Command "Import-Module PnP.PowerShell; Register-PnPEntraIDAppForInteractiveLogin -ApplicationName 'MomentumPnP' -Tenant '<tenant>.onmicrosoft.com' -SharePointDelegatePermissions 'AllSites.Manage' -GraphDelegatePermissions 'User.Read'"
```

This outputs a client ID. Save it — use it for list provisioning (`provision-sp-lists.ps1`).

For app deployment to the site-collection app catalog, register a second app with broader permissions:

```powershell
pwsh -Command "Import-Module PnP.PowerShell; Register-PnPEntraIDAppForInteractiveLogin -ApplicationName 'MomentumPnPAdmin' -Tenant '<tenant>.onmicrosoft.com' -SharePointDelegatePermissions 'AllSites.FullControl' -GraphDelegatePermissions 'User.Read','Sites.ReadWrite.All'"
```

Use the MomentumPnPAdmin client ID as `-PnpClientId` when running `deploy-spfx.ps1`.

## App Catalog

The SPFx package must be deployed to a SharePoint app catalog. Choose one:

### Option A: Site-Collection App Catalog (recommended for single-site deployments)

Requires a one-time tenant admin action. Connect to the SharePoint admin center and enable the site-collection app catalog on the target site:

```powershell
pwsh -Command "Import-Module PnP.PowerShell; Connect-PnPOnline -Url 'https://<tenant>-admin.sharepoint.com' -Interactive -ClientId '<admin-client-id>'; Add-PnPSiteCollectionAppCatalog -Site 'https://<tenant>.sharepoint.com/sites/Innovation'"
```

This only needs to be done once per site.

### Option B: Tenant App Catalog

Create a tenant app catalog from the SharePoint Admin Center (More features → Apps → App Catalog → Create). The catalog URL is typically `https://<tenant>.sharepoint.com/sites/appcatalog`.
