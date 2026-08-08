---
name: code-app-architecture
description: "Architecture template for a Power Apps Code App frontend monorepo — how to segment apps vs shared libraries, which way dependencies are allowed to point, when to introduce a bridge package (multiple code apps) vs keep one app, and the wiring patterns for data sources, connectors, environment variables, and Dataverse queries. Use when starting a new code app or monorepo, adding a second app to an existing one, deciding where a piece of code belongs, adding a data source/connector/table, reading Dataverse Environment Variables, or debugging 'Unable to find data source' / empty lookup names / truncated result sets."
---

# Power Apps Code App frontend architecture

A template for structuring a Code App frontend so that business logic, presentation, and
Power Platform plumbing stay separable — and so a second (or third) app is a composition
choice, not a rewrite.

This is the *shape*, not a naming standard. Substitute your own scope (`@acme/`), publisher
prefix (`acme_`), and domain names throughout.

---

## 1. The four layers

```
apps/<app-name>          composition root — thin. power.config.json, generated code,
    │                    provider wiring, pages, routing, app-specific chrome
    ├──────────────┐
    ▼              ▼
packages/pp-bridge   packages/ui-kit        presentation — pure props-in/callbacks-out
    │                    │                  components + design tokens
    ▼                    ▼ (types only)
       packages/logic    domain types, provider *contracts*, hooks, in-memory
                         provider, error bus. Knows nothing about Dataverse.
```

| Layer | Package | Owns | Must NOT contain |
|---|---|---|---|
| Domain | `packages/logic` | Domain types, provider contracts, React hooks, validation, mappers, in-memory provider, error bus | Any Power Apps SDK / OData / Dataverse column name |
| Presentation | `packages/ui-kit` | Components, SCSS tokens, stories | Data fetching, provider access, hooks from `logic` |
| Adapter | `packages/pp-bridge` | Dataverse row contracts, provider implementation, OData query building, error classification | JSX, app routing, `import` of the Power Apps SDK (see §6) |
| App | `apps/<app-name>` | `power.config.json`, `.power/`, `src/generated/`, provider factory, pages, routing | Reusable domain rules, reusable components |

### Allowed dependency edges — and only these

- `logic` → nothing (React as a **peer** dependency only)
- `ui-kit` → `logic` **for domain types and pure functions only** (`import type`, label maps,
  pure formatters). Never a hook, never a provider contract, never `pp-bridge`.
- `pp-bridge` → `logic`
- `apps/*` → all three, plus `@microsoft/power-apps`

If you find yourself wanting an edge that isn't listed, the code is in the wrong layer. The
two edges that break the architecture fastest:

- **`logic` → `pp-bridge`**: means a domain rule learned a column name. Push the Dataverse
  knowledge down into the bridge behind the contract instead.
- **`ui-kit` → a hook**: means a component fetches its own data. Lift the fetch into the
  page and pass data + callbacks down as props. This is what keeps every component
  renderable in Storybook against the in-memory provider.

---

## 2. One code app or several?

Start with **one app**. Split when two audiences need genuinely different navigation,
security posture, or data-source registration — not merely different pages.

Signals you actually need a second app:

- Different **security roles** — e.g. an internal workspace needs privileges an end-user
  portal must not have (audit read, admin tables).
- Different **registered data source sets** — a portal that never touches admin tables
  shouldn't have them in its `power.config.json`.
- Different **connectors** — only one app sends mail / creates calendar events.
- The apps are **shared as different Power Apps** with different URLs and audiences.

Not signals: "more pages", "different theme", "different landing screen". Those are routes
and props inside one app.

### The moment you have two apps, you need the bridge

With one app, provider wiring can live in `apps/<app>/src/dataProvider.ts` and nobody
suffers. With two, that file gets copied — and the copies drift, which is the expensive
failure (one app silently missing a table, a filter fixed in one and not the other).

So: **extract `packages/pp-bridge` at the moment the second app appears**, and make it own
100% of the Dataverse knowledge:

- table registry (`dataSourcesInfo`)
- row contracts (typed Dataverse column shapes)
- CRUD service factory
- the provider implementation of the `logic` contracts
- OData filter/orderBy construction
- error classification

Each app then contributes only what is genuinely per-app, as **options** to one factory:

```ts
// packages/pp-bridge — the shared factory
export interface CodeAppProviderOptions {
  getClient: GetClientFn;              // injected SDK primitives (see §6)
  getContext: GetContextFn;
  dataSourcesInfo?: Record<string, unknown>;  // the app's PAC-generated set, merged in
  excludeTables?: string[];            // tables this app never registered
  enableAuditHistory?: boolean;        // capability flags, off by default
  scopeToActiveUser?: boolean;
  sendMail?: (input: MailInput) => Promise<void>;  // connector callbacks, injected
}
```

```ts
// apps/portal/src/dataProvider.ts — a portal deliberately wires less
export function createProvider() {
  return createCodeAppProvider({
    getClient, getContext,
    scopeToActiveUser: true,
    excludeTables: ["<admin-only-table>"],
  });
}
```

**Per-app differences belong in options, never in a forked provider.** An option that
defaults to *off* is how a capability stays admin-only.

---

## 3. Capability gating: optional contract members

The mechanism that lets one contract serve apps of different privilege: make the capability
an **optional member** of the provider contract, and have surfaces hide the feature when
it's absent.

```ts
export interface TicketProvider {
  listTickets(query?: TicketQuery): Promise<PageResult<Ticket>>;   // required
  countTickets?(query?: TicketQuery): Promise<number>;             // optional capability
  listHistory?(id: string, q?: HistoryQuery): Promise<HistoryPage>;
}
```

Three rules that make this work in practice:

1. **Absent ≠ failing.** A missing member means "this app has no such capability" — callers
   check `if (!provider.x) return null` and render nothing.
2. **Present but unauthorized must not throw.** If the user lacks a privilege or the
   platform feature is off, resolve with a degraded result
   (`{ items: [], unavailable: "permission" }`), so a read-only surface renders instead of
   erroring the page.
3. **Reference-data enrichment is always best-effort.** A table absent in one app must never
   break a list in that app — cache the failure, log once, and let display names stay
   unresolved. See `references/dataverse-access.md`.

---

## 4. Where does this code go?

| You're writing… | Put it in |
|---|---|
| A rule about what a valid record is | `logic/services/validation-*.ts` |
| A type describing your business object | `logic/domain/*.ts` |
| A method the UI needs from *any* backend | `logic/contracts/*-provider.ts` |
| A `useThing()` fetch/mutate hook | `logic/hooks/*.ts` |
| A fake backend for Storybook / local dev | `logic/providers/memory/*.ts` |
| A Dataverse column name or entity set name | `pp-bridge/dataverse/*-contracts.ts` |
| An OData `$filter` string | `pp-bridge` |
| A presentational component | `ui-kit/components/<Name>/` |
| A design token / SCSS partial | `ui-kit/styles/` |
| A connector call (mail, calendar, HTTP) | `apps/<app>/src/dataProvider.ts`, injected into the bridge factory |
| Routing, deep links, per-app chrome | `apps/<app>/src/` |

Heuristic when unsure: **"would the second app want this?"** Yes → a package. **"does it
name a Dataverse column?"** Yes → `pp-bridge`, never `logic` or `ui-kit`.

### The in-memory provider is not optional

Implement the same contracts with an in-memory, seeded provider in `logic`. It costs a day
and buys: Storybook without a tenant, component work while the environment is broken, and a
compile-time proof that the contracts contain no Dataverse leakage. If it's hard to write,
your contracts are shaped like OData rather than like your domain.

---

## 5. The composition root

`apps/<app>/src/main.tsx` mounts; `App.tsx` composes. Order matters:

```tsx
const provider = createProvider();   // module scope — one instance per app load

<ErrorBoundary>
  <ToastProvider>
    <LogicProvider provider={provider}>
      <ErrorToastBridge />     {/* subscribes the error bus → toasts */}
      {/* routes */}
    </LogicProvider>
  </ToastProvider>
</ErrorBoundary>
```

- `LogicProvider` (in `logic`) holds the provider plus **invalidation counters** per data
  family (`ticketVersion`, `catalogVersion`, …). Mutation hooks bump a counter; read hooks
  include it in their dependency list. That is the whole cache-invalidation story — no
  query library required, and it keeps `logic` dependency-free.
- Errors travel on a **pub/sub bus** in `logic`, not through props. The adapter publishes
  classified errors; one bridge component at the root turns them into toasts. This is what
  lets the bridge report a swallowed failure ("list rendered, but names didn't resolve")
  without knowing a toast exists.
- Construct the provider at **module scope**, not inside a component — SDK client
  acquisition is once-per-load.

---

## 6. The one rule that breaks everything: `getClient` is a singleton

The Power Apps SDK caches **one global data-sources context from the first `getClient()`
call**. Every later `getClient(...)` returns a client bound to that first registry.

Consequences you must design around:

- **Anything you need to call must be present in the *first* registry.** A data source
  registered by a later `getClient` is silently dropped, and `executeAsync` fails with
  `Unable to find data source: <name> in data sources info`.
- **PAC-generated services call `getClient(dataSourcesInfo)` at class-static scope.** So
  *importing* a generated service can win the race and fix the registry. If you use both a
  generated service (e.g. a connector) and your own registry, seed your factory with the
  generated `dataSourcesInfo` so both are present regardless of import order.
- **Merge, never replace.** Build the registry as
  `{...handMaintained, ...pacGenerated, ...pseudoSources}` — `pac code add-data-source`
  regenerates from the server-registered set and can *drop* tables you rely on.

Corollary for the bridge: **do not `import` the Power Apps SDK inside `pp-bridge`.** Accept
`getClient` / `getContext` as injected function parameters. The bridge then type-checks and
builds with no Power Platform dependency, stays testable, and the app keeps sole ownership
of when the SDK is first touched.

Wrap the acquisition so a pre-data failure is a *classified* error, not an opaque crash:

```ts
let client: DataverseClient;
try { client = getClient(mergedDataSourcesInfo); }
catch (e) { throw classifyError(e, { category: "init" }); }   // ErrorBoundary can recover
```

---

## 7. Deep dives

| Topic | Reference |
|---|---|
| Registering tables & connectors, `power.config.json`, pseudo data sources for unbound functions and custom APIs | `references/data-sources.md` |
| Filters, paging, lookups, `@odata.bind`, choices/statecode, counting, files, SDK gotchas | `references/dataverse-access.md` |
| Reading Dataverse Environment Variables at runtime | `references/environment-variables.md` |
| pnpm workspace, tsconfig project refs, Vite aliases, Turbo, ports, build/push | `references/monorepo-config.md` |
| File-by-file starter tree for a new monorepo or a new app | `references/scaffold.md` |

---

## 8. Bootstrap checklist

**New monorepo**

1. pnpm workspace + Turbo + root `tsconfig.json` with `paths` for every package
   (`references/monorepo-config.md`).
2. `packages/logic`: one domain type, one contract, one hook, the error bus, the in-memory
   provider. Prove Storybook renders against it before touching Dataverse.
3. `packages/ui-kit`: tokens + the components that domain needs, props-only.
4. `apps/<first-app>`: `pac code init`, register data sources, write `dataProvider.ts`
   against the SDK directly *inside the app* — no bridge yet.
5. Ship. Extract `packages/pp-bridge` when the second app appears (§2).

**New app in an existing monorepo**

1. `pac code init` in `apps/<new-app>`; copy `vite.config.ts` + `tsconfig.json` from a
   sibling, change the dev port and `localAppUrl`.
2. Add workspace deps on `logic`, `ui-kit`, `pp-bridge` + `@microsoft/power-apps`.
3. `pac code add-data-source` for **only** the tables/connectors this app needs.
4. `src/dataProvider.ts` = one call to the shared factory, with `excludeTables` for what you
   skipped and capability flags left **off** unless this app is privileged.
5. Mount the standard root composition (§5). Add pages. No new Dataverse knowledge in the
   app.
