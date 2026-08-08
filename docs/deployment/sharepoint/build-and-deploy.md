# Build and Deploy

## Monorepo package build

The SPFx project consumes three shared packages from the pnpm workspace. These must be built to `dist/` before the SPFx gulp build:

```bash
cd src/Momentum.Frontend
pnpm --filter @momentum/contracts build
pnpm --filter @momentum/sdk build
pnpm --filter @momentum/ui build
```

Build order matters — SDK depends on Contracts, and UI depends on both.

> **Note:** The SPFx `tsconfig.json` resolves types from each package's `dist/*.d.ts` files. The `gulpfile.js` wires webpack aliases to each package's `dist/*.js` output. If you change shared package source, rebuild the packages before rebuilding SPFx.

> **SCSS sync:** The `@momentum/ui` package now runs `node scripts/copy-scss.cjs` after `tsc -b` to mirror `src/**/*.scss` into `dist/`. Webpack bundles SCSS from `dist`, so stale SCSS in `dist` would break deployed styles. This local copy step is equivalent to the CI step in `.github/workflows/build-spfx.yml`.

## Full deploy (build + package + publish + install)

```powershell
pwsh scripts/sharepoint/deploy-spfx.ps1 -SiteUrl 'https://<tenant>.sharepoint.com/sites/Innovation' -PnpClientId '<admin-client-id>'
```

Use the **admin** app registration (the one with `AllSites.FullControl`) for deployment. The `AllSites.Manage` registration is sufficient for list provisioning but does not have permission to add apps to the site-collection app catalog.

This runs:
1. `gulp clean` + `gulp build` — TypeScript compilation
2. `gulp bundle --ship` — webpack bundling
3. `gulp package-solution --ship` — creates `.sppkg`
4. `Add-PnPApp -Publish` — uploads and publishes to the site-collection app catalog
5. `Install-PnPApp` — installs the app on the site so the web part is immediately available

After installation, the **Momentum** web part appears in the SharePoint web part picker on the target site.

## Deploy an existing package (skip build)

```powershell
pwsh scripts/sharepoint/deploy-spfx.ps1 -SiteUrl 'https://<tenant>.sharepoint.com/sites/Innovation' -SkipBuild
```

Uses the most recent `.sppkg` in `apps/spfx/sharepoint/solution/`.

## Deploy to tenant app catalog

```powershell
pwsh scripts/sharepoint/deploy-spfx.ps1 -AppCatalogUrl 'https://<tenant>.sharepoint.com/sites/appcatalog' -PnpClientId '<client-id>'
```

When deploying to the tenant catalog, the app is published but not automatically installed on a specific site. Site owners install it from their site's "Add an app" page.

## Build only (no deploy)

```bash
cd src/Momentum.Frontend/apps/spfx
npx gulp clean
npx gulp build
npx gulp bundle --ship
npx gulp package-solution --ship
```

The `.sppkg` is output to `sharepoint/solution/momentum-spfx.sppkg`.

## CI build

See the GitHub Actions workflow at `.github/workflows/build-spfx.yml` which builds the SPFx package on every push to `main` and uploads the `.sppkg` as a build artifact.

## Troubleshooting

### "Cannot find resource for the request SP.RequestContext.current/web/sitecollectionappcatalog/"

The site-collection app catalog is not enabled. See [Prerequisites](./prerequisites.md) → App Catalog → Option A.

### "Attempted to perform an unauthorized operation"

The Entra ID app registration lacks sufficient permissions. Use the admin app registration with `AllSites.FullControl` for tenant admin operations.

### gulp package-solution fails with stderr warning

The SPFx `package-solution` task writes warnings to stderr (e.g., feature.xml provisioning note). The `.sppkg` is still created successfully. Check for `momentum-spfx.sppkg` in `sharepoint/solution/` before assuming failure.

### "File is not under rootDir"

The monorepo packages have not been built to `dist/`. Run `pnpm --filter @momentum/contracts build`, `pnpm --filter @momentum/sdk build`, and `pnpm --filter @momentum/ui build` first.

### App is installed but the web part does not appear in the picker

`package-solution.json` must have `"skipFeatureDeployment": false` for site-collection app catalogs. When `skipFeatureDeployment` is `true`, SharePoint expects tenant-wide deployment from the tenant app catalog and does not create a per-site feature for `Install-PnPApp` to activate. The site-collection catalog deployment then silently leaves the web part out of the picker.

### Web part renders but has no styling / CSS module imports are undefined

The custom webpack config in `apps/spfx/gulpfile.js` needs `style-loader` in front of `css-loader` for both `.module.scss` and `.scss` rules, and the rules must be added with `unshift` and scoped to `packages/ui/dist` so they take precedence over the default SPFx loaders. Without this, the CSS is bundled as strings but never injected, or the default SPFx loader processes the external package's CSS modules and returns undefined imports.
