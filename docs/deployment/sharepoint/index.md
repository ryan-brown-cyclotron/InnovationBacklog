# SharePoint Deployment Guide

This guide covers deploying the Momentum Innovation Hub to a SharePoint Online site as an SPFx web part. The web part renders the full Momentum UI and reads/writes directly to SharePoint lists via the SharePoint REST API — no backend server required.

## Sections

- [Prerequisites](./prerequisites.md) — tooling, Entra ID app registration, app catalog setup
- [Provision SharePoint Lists](./lists.md) — creating the six data lists
- [Build and Deploy](./build-and-deploy.md) — building the SPFx package and deploying to the app catalog

## Architecture

The SPFx web part (`src/Momentum.Frontend/apps/spfx`) renders the Momentum React UI (`@momentum/ui`) inside SharePoint. Instead of calling the .NET backend API, it uses `SharePointService.ts` which talks directly to SharePoint lists via `spHttpClient` and the `_api/web/lists` REST endpoints.

```
SharePoint Page
  └── Momentum Web Part (SPFx)
        ├── @momentum/ui        (React components)
        ├── @momentum/sdk       (context, types)
        └── SharePointService   (SP REST API → SharePoint Lists)
```

This is a standalone deployment. The .NET service, worker, and Azurite are not needed for the SharePoint-only experience.

## Data Lists

The web part expects six SharePoint lists on the target site:

| List | Purpose |
|---|---|
| Requests | Backlog ideas and submissions |
| Solutions | Reusable solution catalog |
| Votes | User votes on requests and solutions |
| Comments | Comments on requests and solutions |
| SolutionUses | Adoption and implementation tracking |
| RequestSolutions | Relationships between requests and solutions |

These are created by `scripts/sharepoint/provision-sp-lists.ps1`.
