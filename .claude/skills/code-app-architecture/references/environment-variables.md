# Runtime configuration: Dataverse Environment Variables

A Code App ships as a single static bundle pushed into an environment. `import.meta.env` /
`.env` files are **build-time** — they bake one environment's values into the artifact, so the
same bundle can't be promoted dev → test → prod. Anything that differs per environment must be
read at **runtime** from Dataverse Environment Variables.

Typical uses: a non-prod banner label, sibling app ids for cross-app deep links, feature
flags, external endpoint URLs, integration ids.

---

## The data model

Two tables, and you need both:

| Table | Entity set | Holds |
|---|---|---|
| `environmentvariabledefinition` | `environmentvariabledefinitions` | `schemaname`, `defaultvalue`, type — travels **in the solution** |
| `environmentvariablevalue` | `environmentvariablevalues` | `value` + a lookup to the definition — the **per-environment override** |

Resolution order is: **value row if present, else definition default, else unset.** A variable
with no value row is normal, not an error.

Register both tables:

```bash
pac code add-data-source -a dataverse -t environmentvariabledefinition
pac code add-data-source -a dataverse -t environmentvariablevalue
```

---

## The read pattern

Expose it as an optional capability on the provider contract, so an app (or the in-memory
provider) that has no environment variables simply doesn't implement it:

```ts
// packages/logic/contracts/environment-provider.ts
export interface EnvironmentProvider {
  /** Trimmed designation, or null when blank/unset (prod) or unreadable. */
  getDesignation(): Promise<string | null>;
  getAppIds(): Promise<{ userAppId: string | null; adminAppId: string | null }>;
}
```

Implement in the bridge. Four properties are what make this pattern safe:

1. **One batched pass** — fetch every definition you care about in a single filtered request,
   then every value in a second. Not N round-trips.
2. **Memoized for the provider's lifetime** — these values are fixed per environment.
3. **Fail-soft to `null`** — a read failure (tables not registered, no privilege) resolves to
   `null` so dependent UI *hides* rather than blocking the app.
4. **Blank means unset** — trim, and treat `""` as `null`. This is how a variable is
   deliberately "off in production".

```ts
const ENV_VARS = {
  designation: "acme_EnvironmentDesignation",
  userAppId:   "acme_UserAppId",
  adminAppId:  "acme_AdminAppId",
} as const;
type EnvVarKey = keyof typeof ENV_VARS;
const EMPTY: Record<EnvVarKey, string | null> = { designation: null, userAppId: null, adminAppId: null };

let envVarsPromise: Promise<Record<EnvVarKey, string | null>> | null = null;

async function loadEnvVars(): Promise<Record<EnvVarKey, string | null>> {
  try {
    const schemaNames = Object.values(ENV_VARS);
    const defRes = await client.retrieveMultipleRecordsAsync<{
      environmentvariabledefinitionid: string; schemaname: string; defaultvalue?: string | null;
    }>("environmentvariabledefinitions", {
      filter: schemaNames.map((n) => `schemaname eq '${n}'`).join(" or "),
      select: ["environmentvariabledefinitionid", "schemaname", "defaultvalue"],
      top: schemaNames.length,
    });
    if (!defRes.success || defRes.data.length === 0) { return EMPTY; }
    const defs = defRes.data;

    const valRes = await client.retrieveMultipleRecordsAsync<{
      _environmentvariabledefinitionid_value?: string; value?: string | null;
    }>("environmentvariablevalues", {
      filter: defs.map((d) => `_environmentvariabledefinitionid_value eq '${d.environmentvariabledefinitionid}'`).join(" or "),
      select: ["_environmentvariabledefinitionid_value", "value"],
      top: defs.length,
    });
    const valueByDef = new Map<string, string | null | undefined>();
    if (valRes.success) {
      for (const row of valRes.data) {
        if (row._environmentvariabledefinitionid_value) {
          valueByDef.set(row._environmentvariabledefinitionid_value, row.value);
        }
      }
    }

    const resolve = (schemaName: string): string | null => {
      const def = defs.find((d) => d.schemaname === schemaName);
      if (!def) { return null; }
      const v = (valueByDef.get(def.environmentvariabledefinitionid) ?? def.defaultvalue ?? "").trim();
      return v || null;                     // blank → null
    };

    return {
      designation: resolve(ENV_VARS.designation),
      userAppId:   resolve(ENV_VARS.userAppId),
      adminAppId:  resolve(ENV_VARS.adminAppId),
    };
  } catch {
    return EMPTY;                            // never throws
  }
}

const getEnvVars = () => (envVarsPromise ??= loadEnvVars());
```

Attach to the provider:

```ts
return {
  ...provider,
  environment: {
    getDesignation: async () => (await getEnvVars()).designation,
    getAppIds: async () => {
      const v = await getEnvVars();
      return { userAppId: v.userAppId, adminAppId: v.adminAppId };
    },
  },
};
```

---

## Consuming it

A one-shot hook in `logic` that never throws — a failure just means "no value":

```ts
export function useEnvironmentDesignation(): string | null {
  const provider = useItsmProvider();
  const [designation, setDesignation] = useState<string | null>(null);
  useEffect(() => {
    if (!provider.environment) { setDesignation(null); return; }   // capability absent
    let cancelled = false;
    void provider.environment.getDesignation()
      .then((d) => { if (!cancelled) { setDesignation(d); } })
      .catch(() => { if (!cancelled) { setDesignation(null); } });
    return () => { cancelled = true; };
  }, [provider]);
  return designation;
}
```

Render at the app root: `{designation && <EnvironmentBanner label={designation} />}`. Leaving
the variable blank in production is what makes the banner disappear there — no build flag, no
conditional bundle.

---

## Notes

- **Definitions travel in the solution; values usually don't.** Set the value per environment
  after import, or supply it via the pipeline's deployment settings file. Document the list of
  variables in the deploy notes.
- **Naming:** use the publisher prefix and PascalCase-after-prefix
  (`acme_EnvironmentDesignation`) so they group in the maker portal.
- **Types:** everything comes back as `string` on the wire. Parse booleans/JSON yourself and
  treat a parse failure as unset.
- **Don't use env variables for secrets** — they're readable by anyone with read access to the
  table. Secrets belong in Key Vault behind a flow or custom connector.
- **Don't poll.** Memoize once per app load; a variable change takes effect on next load.
