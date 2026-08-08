# Monorepo configuration

pnpm workspaces + Turbo + TypeScript project references + Vite. The goal: packages are
consumed as **source** during dev (instant HMR across package boundaries) and as **declarations**
for type-checking, and each app builds to a single static file the Power Platform can host.

For the `pac code` CLI itself (init, add-data-source, push, run, auth/env selection), see the
`pac-code` skill under `.github/skills/pac-code/`.

---

## Layout

```
<root>/
  package.json            scripts delegate to turbo; shared devDeps
  pnpm-workspace.yaml
  turbo.json
  tsconfig.json           base compilerOptions + paths for every package
  .npmrc
  .storybook/             one Storybook for the whole workspace
  packages/
    logic/                domain + contracts + hooks + in-memory provider
    ui-kit/               components + styles
    pp-bridge/            Dataverse adapter
  apps/
    <app-a>/              code app
    <app-b>/              code app
    storybook/            (optional) thin Storybook host
```

```yaml
# pnpm-workspace.yaml
packages:
  - 'packages/*'
  - 'apps/*'
```

```
# .npmrc — the Power Apps SDK + Vite plugin expect hoisted resolution
shamefully-hoist=true
```

---

## Root tsconfig

One base config; every package extends it. The `paths` entries point at **source**, so
type-checking follows edits without a build step.

```jsonc
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "paths": {
      "@acme/ui-kit":     ["./packages/ui-kit/index.ts"],
      "@acme/ui-kit/*":   ["./packages/ui-kit/*"],
      "@acme/logic":      ["./packages/logic/index.ts"],
      "@acme/logic/*":    ["./packages/logic/*"],
      "@acme/pp-bridge":  ["./packages/pp-bridge/index.ts"],
      "@acme/pp-bridge/*":["./packages/pp-bridge/*"]
    }
  },
  "include": ["packages/**/*", "apps/**/*", ".storybook/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

Both the bare specifier and the `/*` subpath form matter: apps import `@acme/ui-kit` for the
barrel and `@acme/ui-kit/components/Icon` (or `@acme/ui-kit/styles/index.scss`) for deep
imports that avoid pulling the whole barrel.

### Per-package tsconfigs

Each package carries two:

```jsonc
// packages/<pkg>/tsconfig.json — for `typecheck`
{ "extends": "../../tsconfig.json", "include": ["index.ts", "**/*.ts", "**/*.tsx"], "exclude": ["node_modules", "dist"] }
```

```jsonc
// packages/<pkg>/tsconfig.build.json — emits declarations only
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "./dist",
    "noEmit": false,
    "declaration": true,
    "declarationMap": true,
    "emitDeclarationOnly": true,     // Vite bundles the JS; tsc only produces types
    "composite": true,
    "rootDir": "."
  },
  "include": ["index.ts", "**/*.ts", "**/*.tsx"],
  "exclude": ["node_modules", "dist"],
  "references": [{ "path": "../logic/tsconfig.build.json" }]   // downstream packages only
}
```

`emitDeclarationOnly` is the key choice: packages publish **types**, apps bundle **source**
through Vite aliases. No dual-build, no stale `dist/*.js` shadowing your edits.

### Package manifests

```jsonc
// packages/logic/package.json — no runtime deps; React is a peer
{
  "name": "@acme/logic", "version": "0.1.0", "private": true, "type": "module",
  "main": "./dist/index.js", "types": "./dist/index.d.ts",
  "exports": { ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" } },
  "scripts": {
    "build": "tsc --project tsconfig.build.json",
    "typecheck": "tsc --noEmit --project tsconfig.json",
    "dev": "tsc --watch --project tsconfig.build.json"
  },
  "peerDependencies": { "react": "^18.2.0" }
}
```

```jsonc
// packages/ui-kit/package.json — also exports raw SCSS
{
  "exports": {
    ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" },
    "./styles": "./styles/index.scss",
    "./styles/*": "./styles/*"
  },
  "peerDependencies": { "react": "^18.0.0 || ^19.0.0", "react-dom": "^18.0.0 || ^19.0.0" }
}
```

**Declare the cross-package dependency you actually use.** If `ui-kit` imports domain types
from `logic`, it needs `"dependencies": { "@acme/logic": "workspace:*" }` — relying on the
Vite/tsconfig alias alone means the manifest lies about the graph, and Turbo can order builds
wrong.

---

## Turbo

```jsonc
{
  "$schema": "https://turbo.build/schema.json",
  "globalDependencies": ["**/.env.*local"],
  "tasks": {
    "build":     { "dependsOn": ["^build"], "outputs": ["dist/**"] },
    "typecheck": { "dependsOn": ["^build"] },
    "lint":      { "dependsOn": ["^build"] },
    "dev":       { "cache": false, "persistent": true }
  }
}
```

`^build` means "upstream packages build first" — that's what makes `logic` declarations exist
before `pp-bridge` type-checks.

---

## App configuration

### `vite.config.ts`

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { powerApps } from "@microsoft/power-apps-vite/plugin";
import { viteSingleFile } from "vite-plugin-singlefile";
import path from "path";

export default defineConfig({
  plugins: [react(), powerApps(), viteSingleFile()],
  resolve: {
    alias: [
      // ORDER MATTERS: the `/(.+)` subpath rule must come BEFORE the bare specifier,
      // or the bare rule swallows deep imports.
      { find: /^@acme\/ui-kit\/(.+)/,    replacement: path.resolve(__dirname, "../../packages/ui-kit/$1") },
      { find: "@acme/ui-kit",            replacement: path.resolve(__dirname, "../../packages/ui-kit/index.ts") },
      { find: /^@acme\/logic\/(.+)/,     replacement: path.resolve(__dirname, "../../packages/logic/$1") },
      { find: "@acme/logic",             replacement: path.resolve(__dirname, "../../packages/logic/index.ts") },
      { find: /^@acme\/pp-bridge\/(.+)/, replacement: path.resolve(__dirname, "../../packages/pp-bridge/$1") },
      { find: "@acme/pp-bridge",         replacement: path.resolve(__dirname, "../../packages/pp-bridge/index.ts") },
    ],
  },
  build: { outDir: "dist", emptyOutDir: true },
  server: { host: "localhost", port: 3002 },   // unique per app
});
```

- `powerApps()` injects the SDK bootstrap the runtime expects.
- `viteSingleFile()` inlines everything into one `index.html` — the simplest thing to host as
  a code app, at the cost of no code splitting. Keep an eye on bundle size; deep-import from
  `ui-kit` rather than the barrel on heavy pages.

### `tsconfig.json`

Include the package sources the app actually uses so app type-checking sees edits directly:

```jsonc
{
  "extends": "../../tsconfig.json",
  "include": [
    "src/**/*",
    "../../packages/logic/**/*",
    "../../packages/pp-bridge/**/*",
    "../../packages/ui-kit/index.ts",
    "../../packages/ui-kit/components/**/*"
  ]
}
```

### `package.json`

```jsonc
{
  "name": "@acme/<app-name>", "private": true, "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",     // typecheck gates the build
    "preview": "vite preview",
    "push": "npx power-apps push"
  },
  "dependencies": {
    "@microsoft/power-apps": "^1.1.3",
    "@acme/logic": "workspace:*",
    "@acme/pp-bridge": "workspace:*",
    "@acme/ui-kit": "workspace:*",
    "react": "^18.2.0", "react-dom": "^18.2.0"
  },
  "devDependencies": {
    "@microsoft/power-apps-vite": "^1.0.2",
    "vite": "^6.0.0", "vite-plugin-singlefile": "^2.3.3",
    "@vitejs/plugin-react": "^4.3.0", "typescript": "^5.4.0"
  }
}
```

### `power.config.json`

Generated by `pac code init`; you edit only via `pac code add-data-source`. The fields you do
care about:

| Field | Note |
|---|---|
| `appId`, `environmentId` | Identify the target app. Differ per environment — do not hand-copy between apps. |
| `buildPath` / `buildEntryPoint` | `dist` / `index.html` — must match the Vite `outDir`. |
| `localAppUrl` | **Must match the Vite dev `port`** or `pac code run` loads nothing. Easy to desync when copying a sibling app's config. |
| `connectionReferences` | One per connector; give each a stable `xrmConnectionReferenceLogicalName`. |
| `databaseReferences.default.cds.dataSources` | Table aliases → entity set + logical name. |

### `index.html`

Give the root a real height, or full-height layouts collapse inside the Power Apps iframe:

```html
<style>html, body, #root { height: 100%; margin: 0; background: #fff; }</style>
```

---

## Dev loop

```bash
pnpm dev                     # all apps + package watchers, via turbo
pnpm --filter @acme/<app> dev
pnpm typecheck               # ordered by turbo
pnpm build
pnpm --filter @acme/<app> exec npx power-apps push   # or: pac code push
pnpm storybook               # components against the in-memory provider
```

Package edits are picked up by app HMR immediately because apps alias to package **source**.
You only need `pnpm build` in a package when you want its `.d.ts` refreshed for something that
consumes the built types.

---

## Ports

Assign each app a fixed, unique dev port and keep `localAppUrl` in lockstep. Record the
assignments somewhere obvious (root README or the app table below), because the failure mode
is silent:

| App | Vite port | `localAppUrl` |
|---|---|---|
| `<app-a>` | 3002 | `http://localhost:3002` |
| `<app-b>` | 3003 | `http://localhost:3003` |
