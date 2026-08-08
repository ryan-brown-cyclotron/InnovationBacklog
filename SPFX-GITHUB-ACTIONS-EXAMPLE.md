# SPFx deployment identity setup

The `build-spfx.yml` workflow builds the SPFx package on every relevant push/PR
and, on pushes to `main` (or manual runs), deploys the `.sppkg` to the tenant
app catalog. Authentication uses a Microsoft Entra app registration with a
certificate — the CLI for Microsoft 365 does not support federated identity
tokens, and SharePoint does not support client-secret auth, so certificate is
the supported app-only method.

## What was configured

- Microsoft Entra app registration `spfx-github-deploy`
  - Application permission: SharePoint `Sites.FullControl.All` (admin consented)
  - Self-signed certificate `CN=spfx-github-deploy` (valid until 2027-08-05)
- GitHub environment `sharepoint-production` with:
  - Variables: `ENTRA_CLIENT_ID`, `ENTRA_TENANT_ID`, `SPFX_TENANT_WIDE`
  - Secrets: `CERTIFICATE_ENCODED` (base64 PFX), `CERTIFICATE_PASSWORD`

`SPFX_TENANT_WIDE=true` deploys tenant-wide (`skipFeatureDeployment`);
otherwise the package is deployed to the catalog and installed per site.

The environment name must exactly match the workflow's:

```yaml
environment: sharepoint-production
```

## Certificate rotation

The certificate expires 2027-08-05. To rotate: generate a new self-signed
certificate, attach the public key to the app registration, and update the
`CERTIFICATE_ENCODED` / `CERTIFICATE_PASSWORD` environment secrets.

## Setup scripts

The scripts in `scripts/` document the app-registration provisioning and can be
reused for another repo/tenant:

- `scripts/setup-spfx-deployment-identity.sh` — bash / Azure Cloud Shell
- `scripts/setup-spfx-deployment-identity.ps1` — PowerShell

Update the `ORG`, `REPO`, `APP_NAME`, and `ENVIRONMENT` variables at the top
before running. Requires `az login` and `gh auth login`. (The scripts also
create a federated credential, which is unused by the current workflow.)
