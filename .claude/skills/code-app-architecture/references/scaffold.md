# Scaffold: the starter files

A minimum-viable version of each layer. Everything is one domain object (`Thing`) wide —
add breadth by copying the pattern, not by inventing a new one.

Substitute: `@acme/` (npm scope), `acme_` (publisher prefix), `Thing`/`things` (your domain
object), `acme_things` (entity set).

---

## Tree

```
packages/logic/
  index.ts                        barrel — every public export
  domain/thing.ts                 Thing, ThingQuery, Create/UpdateThingInput
  domain/common.ts                PageResult<T>, sentinels
  contracts/thing-provider.ts     ThingProvider
  contracts/identity-provider.ts  IdentityProvider
  contracts/provider.ts           AppDataProvider (composition of contracts)
  errors/errors.ts                AppError, ErrorCategory
  errors/error-bus.ts             emitError / subscribeToErrors
  components/LogicProvider.tsx    context + invalidation counters
  hooks/useThings.ts              read hook
  hooks/useCreateThing.ts         mutate hook
  providers/memory/memory-provider.ts   in-memory implementation
  providers/memory/default-seed.ts

packages/ui-kit/
  index.ts
  styles/index.scss               @forward of tokens/partials
  components/<Name>/<Name>.tsx    props-only components
  components/<Name>/index.ts

packages/pp-bridge/
  index.ts
  dataverse/contracts.ts          row shapes — single source of truth for schema
  dataverse/service-types.ts      DataverseEntityService, IGetAllOptions, Services
  dataverse/mappers.ts            row → domain, choice registry
  dataverse/provider.ts           createDataverseProvider(services, …)
  dataverse/code-app-provider.ts  createCodeAppProvider(getClient, getContext, …)
  dataverse/error-classifier.ts

apps/<app>/
  index.html
  power.config.json               generated
  .power/                         generated
  src/generated/                  generated
  src/main.tsx
  src/App.tsx
  src/dataProvider.ts             the ONLY app file that knows about the SDK
  src/ErrorToastBridge.tsx
  src/pages/*.tsx
```

---

## logic — domain and contract

```ts
// packages/logic/domain/common.ts
export interface PageResult<T> { items: T[]; total?: number; nextPage?: number; }
/** Sentinel for "match rows where this lookup is unset". */
export const FILTER_EMPTY = "__empty__";
```

```ts
// packages/logic/domain/thing.ts
export type ThingState = "new" | "active" | "done";

export interface UserRef { id: string; name?: string; }

export interface Thing {
  id: string;
  code?: string;              // platform-assigned autonumber, read-only
  title: string;
  description?: string;
  state: ThingState;
  owner?: UserRef;
  createdAt?: string;         // ISO
  updatedAt?: string;
}

export interface ThingQuery {
  search?: string;
  states?: ThingState[];
  ownerId?: string;           // accepts FILTER_EMPTY
  page?: number;
  pageSize?: number;
  sort?: { field: "code" | "title" | "state" | "created" | "updated"; descending?: boolean };
}

export interface CreateThingInput { title: string; description?: string; ownerId?: string; }
export interface UpdateThingInput { title?: string; description?: string; state?: ThingState; ownerId?: string | null; }
```

```ts
// packages/logic/contracts/thing-provider.ts
import type { PageResult } from "../domain/common";
import type { CreateThingInput, Thing, ThingQuery, UpdateThingInput } from "../domain/thing";

export interface ThingProvider {
  listThings(query?: ThingQuery): Promise<PageResult<Thing>>;
  getThing(id: string): Promise<Thing | null>;
  createThing(input: CreateThingInput): Promise<Thing>;
  updateThing(id: string, patch: UpdateThingInput): Promise<Thing>;
  /** Optional capability — surfaces hide the feature when absent. */
  countThings?(query?: ThingQuery): Promise<number>;
}
```

```ts
// packages/logic/contracts/provider.ts
export interface AppDataProvider {
  identity: IdentityProvider;
  things: ThingProvider;
  environment?: EnvironmentProvider;   // optional capabilities last
}
```

Contract review checklist — every method must pass all four:

- Named in **domain** vocabulary (no `retrieveMultiple`, no `statuscode`).
- Arguments are domain objects, not OData strings.
- Implementable by the in-memory provider without pretending.
- Optional (`?`) if any app should be able to *not* have it.

## logic — errors and the bus

```ts
// packages/logic/errors/errors.ts
export type ErrorCategory =
  | "init" | "permission" | "notFound" | "conflict" | "throttle" | "network" | "unknown";
export type ErrorSeverity = "info" | "warn" | "error";

const USER_MESSAGE: Record<ErrorCategory, string> = {
  init: "The app couldn't start. Refresh to try again.",
  permission: "You don't have access to do that.",
  notFound: "That record no longer exists.",
  conflict: "Someone else changed this record. Reload and try again.",
  throttle: "Too many requests — try again in a moment.",
  network: "Connection problem. Check your network and retry.",
  unknown: "Something went wrong.",
};

export class AppError extends Error {
  readonly category: ErrorCategory;
  readonly userMessage: string;
  readonly severity: ErrorSeverity;
  constructor(message: string, opts: { category: ErrorCategory; cause?: unknown; userMessage?: string }) {
    super(message, { cause: opts.cause });
    this.name = "AppError";
    this.category = opts.category;
    this.userMessage = opts.userMessage ?? USER_MESSAGE[opts.category];
    this.severity = opts.category === "throttle" || opts.category === "conflict" ? "warn" : "error";
  }
}
export class ProviderNotConfiguredError extends AppError {
  constructor() { super("LogicProvider is missing above this component.", { category: "init" }); }
}
```

```ts
// packages/logic/errors/error-bus.ts
export type ErrorBusListener = (error: AppError) => void;
const listeners = new Set<ErrorBusListener>();

export function emitError(error: AppError): void {
  for (const l of listeners) { try { l(error); } catch (e) { console.error("[error-bus] listener threw:", e); } }
}
export function subscribeToErrors(l: ErrorBusListener): () => void {
  listeners.add(l);
  return () => { listeners.delete(l); };
}
```

## logic — context and hooks

```tsx
// packages/logic/components/LogicProvider.tsx
const Ctx = createContext<{
  provider: AppDataProvider;
  thingVersion: number;
  invalidateThings: () => void;
} | null>(null);

export function LogicProvider({ provider, children }: { provider: AppDataProvider; children: ReactNode }) {
  const [thingVersion, setThingVersion] = useState(0);
  const invalidateThings = useCallback(() => setThingVersion((v) => v + 1), []);
  const value = useMemo(() => ({ provider, thingVersion, invalidateThings }), [provider, thingVersion, invalidateThings]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

function use() { const c = useContext(Ctx); if (!c) { throw new ProviderNotConfiguredError(); } return c; }
export const useProvider        = () => use().provider;
export const useThingVersion    = () => use().thingVersion;
export const useInvalidateThings = () => use().invalidateThings;
```

Add one `<x>Version` / `invalidate<X>` pair per data family. Read hooks depend on the counter;
mutate hooks bump it. That's the whole cache story.

```ts
// packages/logic/hooks/useThings.ts
export function useThings(query?: ThingQuery, options?: { enabled?: boolean }) {
  const enabled = options?.enabled ?? true;
  const provider = useProvider();
  const version = useThingVersion();
  const [data, setData] = useState<PageResult<Thing> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Callers pass object literals; serialize to detect real changes.
  const queryRef = useRef(query); queryRef.current = query;
  const queryKey = JSON.stringify(query);
  const hasData = useRef(false);

  const refresh = useCallback(async () => {
    if (!enabled) { setLoading(false); return; }
    if (!hasData.current) { setLoading(true); }     // skeleton on first load only
    setError(null);
    try {
      setData(await provider.things.listThings(queryRef.current));
      hasData.current = true;
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally { setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider, queryKey, version, enabled]);

  useEffect(() => { void refresh(); }, [refresh]);
  return { data, loading, error, refresh };
}
```

```ts
// packages/logic/hooks/useCreateThing.ts
export function useCreateThing() {
  const provider = useProvider();
  const invalidate = useInvalidateThings();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const createThing = useCallback(async (input: CreateThingInput) => {
    setSaving(true); setError(null);
    try { const created = await provider.things.createThing(input); invalidate(); return created; }
    catch (e) { setError(e instanceof Error ? e : new Error(String(e))); throw e; }
    finally { setSaving(false); }
  }, [provider, invalidate]);
  return { createThing, saving, error };
}
```

---

## pp-bridge — row contracts

```ts
/**
 * Dataverse row contracts — SINGLE SOURCE OF TRUTH for schema shape.
 * Native statecode/statuscode for lifecycle; native ownerid for ownership;
 * native createdon/modifiedon/createdby for stamps. Custom `acme_*` columns
 * ONLY for business data with no native equivalent.
 * If a column isn't here, it doesn't exist.
 */
export interface SystemColumns {
  statecode?: number;          // 0 Active / 1 Inactive
  statuscode?: number;
  createdon?: string;
  modifiedon?: string;
  _createdby_value?: string;
  _modifiedby_value?: string;
  _ownerid_value?: string;
  owneridname?: string;        // SDK denormalized lookup name
}

export interface ThingRow extends SystemColumns {
  acme_thingid: string;
  acme_name?: string;          // primary name column (often an autonumber — do not write)
  acme_title?: string;
  acme_description?: string;
  // lookups: read `_x_value`, write `x@odata.bind`
  _acme_ownerid_value?: string;
  acme_owneridname?: string;
}

export interface SystemUserRow {
  systemuserid: string;
  fullname?: string;
  domainname?: string;
  azureactivedirectoryobjectid?: string;
  isdisabled?: boolean;
}
```

## pp-bridge — provider (domain-facing)

```ts
export interface DataverseProviderOptions {
  services: Services;
  getActiveUserContext?: () => Promise<ActiveUserContext | null>;
  fallbackUserId?: string;
  scopeToActiveUser?: boolean;
  sendMail?: (input: MailInput) => Promise<void>;   // injected connector callbacks
}

export function createDataverseProvider(options: DataverseProviderOptions): AppDataProvider {
  const { services } = options;
  const registry = defaultChoiceRegistry;

  function buildThingFilter(q?: ThingQuery): string | undefined { /* see dataverse-access.md */ }
  async function enrich(rows: ThingRow[]): Promise<Thing[]> { /* lookup-name join */ }

  return {
    identity: { resolveActiveUser },
    things: {
      async listThings(query) {
        const filter = buildThingFilter(query);
        const orderBy = buildThingOrderBy(query);
        if (query?.pageSize) {
          const rows = await services.things.getAll({
            filter, orderBy, top: query.pageSize,
            skip: query.page ? (query.page - 1) * query.pageSize : undefined,
          });
          return { items: await enrich(rows), nextPage: rows.length >= query.pageSize ? (query.page ?? 1) + 1 : undefined };
        }
        const rows = await services.things.getAll({ filter, orderBy });
        return { items: await enrich(rows), total: rows.length };
      },
      async createThing(input) {
        const row: Partial<ThingRow> & Record<string, unknown> = {
          acme_title: input.title,
          acme_description: input.description,
          statuscode: choiceNameToValue("new", registry.thingStatuscode),
        };
        if (input.ownerId) { row["acme_ownerid@odata.bind"] = `/systemusers(${strip(input.ownerId)})`; }
        for (const k of Object.keys(row)) { if (row[k] === undefined) { delete row[k]; } }
        const created = await services.things.create(row);
        const hydrated = created.acme_thingid
          ? await services.things.getAll({ filter: `acme_thingid eq ${created.acme_thingid}` })
              .then((r) => r[0] ?? created).catch(() => created)
          : created;
        return (await enrich([hydrated]))[0];
      },
      /* getThing, updateThing, countThings … */
    },
  };
}
```

## pp-bridge — code-app provider (SDK-facing)

The only file that describes the SDK's shape — as a **local interface**, not an import.

```ts
interface OperationResult<T> { success: boolean; data: T; error?: Error; skipToken?: string; count?: number; }

interface DataverseClient {
  createRecordAsync<TIn, TOut>(ds: string, record: TIn): Promise<OperationResult<TOut>>;
  updateRecordAsync<TIn, TOut>(ds: string, id: string, changed: TIn): Promise<OperationResult<TOut>>;
  deleteRecordAsync(ds: string, id: string): Promise<OperationResult<void>>;
  retrieveRecordAsync<TOut>(ds: string, id: string, o?: { select?: string[] }): Promise<OperationResult<TOut>>;
  retrieveMultipleRecordsAsync<TOut>(ds: string, o?: IGetAllOptions): Promise<OperationResult<TOut[]>>;
  executeAsync<TReq, TRes>(op: { dataverseRequest?: { action: string; parameters: Record<string, unknown> } }): Promise<OperationResult<TRes>>;
}

type GetClientFn = (dataSourcesInfo: unknown) => DataverseClient;
type GetContextFn = () => unknown;

export interface CodeAppProviderOptions {
  getClient: GetClientFn;
  getContext: GetContextFn;
  /** The app's PAC-generated registry, merged OVER the hand-maintained one. */
  dataSourcesInfo?: Record<string, unknown>;
  /** Tables this app never registered in power.config.json. */
  excludeTables?: string[];
  fallbackUserId?: string;
  scopeToActiveUser?: boolean;
  sendMail?: (input: MailInput) => Promise<void>;
  enableAuditHistory?: boolean;          // capability flags default OFF
}

export function createCodeAppProvider(options: CodeAppProviderOptions): AppDataProvider {
  const merged = {
    ...tableRegistry,                                   // hand-maintained union of all apps
    ...(options.dataSourcesInfo ?? {}),                 // generated: connectors + metadata
    ...searchDataSourcesInfo,                           // pseudo sources, FIRST call only
    ...(options.enableAuditHistory ? auditDataSourcesInfo : {}),
  } as Record<string, unknown>;

  const filtered = options.excludeTables?.length
    ? Object.fromEntries(Object.entries(merged).filter(([k]) => !options.excludeTables!.includes(k)))
    : merged;

  let client: DataverseClient;
  try { client = options.getClient(filtered); }
  catch (e) { throw classifyError(e, { category: "init" }); }   // ErrorBoundary can recover

  const services: Services = {
    things: entityService<ThingRow>(client, "acme_things", "acme_thingid"),
    systemUsers: entityService<SystemUserRow>(client, "systemusers", "systemuserid"),
  };

  async function getActiveUserContext(): Promise<ActiveUserContext | null> {
    const ctx = await Promise.resolve(options.getContext()).catch(() => null);
    const user = (ctx as { user?: { objectId?: string; userPrincipalName?: string; fullName?: string } } | null)?.user;
    return user ? { objectId: user.objectId, userPrincipalName: user.userPrincipalName, fullName: user.fullName } : null;
  }

  return createDataverseProvider({ services, getActiveUserContext, ...options });
}
```

---

## app — the composition root

```ts
// apps/<app>/src/dataProvider.ts — the only app file that touches the SDK
import { createCodeAppProvider } from "@acme/pp-bridge";
import { getContext } from "@microsoft/power-apps/app";
import { getClient } from "@microsoft/power-apps/data";
// Seed with the generated registry: generated service classes call getClient() at
// class-static scope, so whichever runs first fixes the global registry.
import { dataSourcesInfo } from "../.power/schemas/appschemas/dataSourcesInfo";

export function createProvider() {
  return createCodeAppProvider({
    getClient: getClient as Parameters<typeof createCodeAppProvider>[0]["getClient"],
    getContext,
    dataSourcesInfo: dataSourcesInfo as Record<string, unknown>,
    // Per-app posture, expressed as options — never as a forked provider:
    // scopeToActiveUser: true,
    // excludeTables: ["<admin-only-table>"],
    // enableAuditHistory: true,
  });
}
```

```tsx
// apps/<app>/src/main.tsx
import "@acme/ui-kit/styles/index.scss";
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode><App /></React.StrictMode>,
);
```

```tsx
// apps/<app>/src/App.tsx
const provider = createProvider();     // module scope — once per app load

export function App() {
  const designation = useEnvironmentDesignation();
  return (
    <ErrorBoundary>
      <ToastProvider>
        <LogicProvider provider={provider}>
          <ErrorToastBridge />
          {designation && <EnvironmentBanner label={designation} />}
          {/* routes */}
        </LogicProvider>
      </ToastProvider>
    </ErrorBoundary>
  );
}
```

```tsx
// apps/<app>/src/ErrorToastBridge.tsx — bus → toasts, renders nothing
export function ErrorToastBridge() {
  const toast = useToast();
  useEffect(() => subscribeToErrors((err) => {
    if (err.severity === "warn") { toast.warn("Heads up", err.userMessage); }
    else if (err.severity === "info") { toast.info("Notice", err.userMessage); }
    else { toast.error("Something went wrong", err.userMessage); }
  }), [toast]);
  return null;
}
```

Routing: a discriminated-union view state in `App.tsx` is enough for most code apps (no
router library, no history API inside the host iframe). If you need shareable links, make
every view round-trip to a distinct deep-link string and reconcile once on mount.

---

## Definition of done for the scaffold

1. Storybook renders a page against the **in-memory** provider — no tenant needed.
2. `pnpm typecheck` passes with `logic` importing nothing from `pp-bridge` or `ui-kit`.
3. One list page and one create form work end-to-end against Dataverse.
4. A forced failure (rename a table in the registry) surfaces as a **toast**, not a blank
   screen or a silent empty list.
5. `excludeTables` on a second (even throwaway) app proves the per-app subtraction works
   before you actually need it.
