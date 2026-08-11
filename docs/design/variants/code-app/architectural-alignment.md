# Code App Variant — Architectural Alignment

## Purpose
Show that the variant is the system design applied to a different substrate, not an exception to it. Where it does depart from a system-level statement, name the departure and its authority rather than leaving a reader to discover it.

## The Governing Requirement

> "We need a 1 to 1 — the web and code should use a provider that drives the downstream logic; the code app should look like the web app entirely."

This is an architectural constraint, not a preference, and it is what shapes every decision below. The measure of alignment is the size of the host-specific surface.

## Layering

```
@momentum/contracts        wire types generated from C#
        ▲
@innovation-backlog/logic  domain types, pure functions, InnovationBacklogProvider (the port)
        ▲
@momentum/ui               the shared <App/> — types and pure functions from logic only
        ▲
apps/code-innovation-backlog   the adapter: provider + callTool seam
```

Dependencies point one way. The adapter is the only layer that knows Azure DevOps or Dataverse exist; the UI knows neither, and the domain knows neither. Swapping the substrate means replacing one implementation of `InnovationBacklogProvider` — which is exactly what `createOfflineProvider` (the in-memory implementation) already demonstrates.

## Ports And Adapters, Preserved

`InnovationBacklogProvider` is the port. The code app supplies one adapter for both substrates rather than two, because the SDK caches a single global data-sources context from the first `getClient()` call and because the interesting operations need both stores at once — an idea is an ADO work item joined to a Dataverse engagement rollup. Splitting it would fight the SDK and split operations that must be atomic in presentation. The separation is preserved as folders (`provider/ado/`, `provider/dataverse/`) and as injection: the Dataverse modules never import the connector; comments, work item facts, and role resolution are passed in.

## Two Seams, One Direction

| Seam | Shape | Consumers |
|---|---|---|
| `InnovationBacklogProvider` | Typed, domain-shaped | The variant's own code, tests, the in-memory provider |
| `IService.callTool("GET:requests/123")` | Route strings | `@momentum/ui`'s `<App/>` |

`callTool.ts` adapts the second onto the first, and is the only file in the variant that knows route strings exist. This is deliberate debt with a stated payoff: rebuilding every shared surface against the typed contract would have meant touching every page, which is the exact drift the governing requirement forbids. The route seam is the shared UI's current interface; when it is retyped, this file shrinks to nothing and the variant loses its only untyped code.

## System-Level Statements, And How This Variant Stands Against Them

| System statement | Standing in this variant |
|---|---|
| The Momentum backend is the system of record | **Departed, deliberately.** There is no Momentum backend here. Authority moves to Azure DevOps for delivery truth and Dataverse for engagement. The principle behind the statement — *one authoritative store per fact, and the frontend is never it* — is preserved. |
| GitHub synchronization is one-way | Vacuous: this variant does not project to GitHub. |
| Submitted repositories are read-only | Held. Repository references are stored and rendered; nothing writes to them. |
| Agents analyze; they never persist domain state | Vacuous: no agents run in this variant. |
| Frontend authorization is presentation only; the backend remains authoritative | **Held, and this is the load-bearing one.** Role gates which controls render. ADO process rules and area-path ACLs decide whether the action succeeds. A user who forges a role in the client gets a rendered button and a refused write. |
| Business rules are deterministic application code, not agent reasoning | Held. Lifecycle is enforced by ADO process rules — platform configuration, still deterministic, still auditable. |
| Engagement records are source-of-truth facts; counts and scores are projections | Held, with a caveat: the projection is computed on read rather than materialized. See below. |

The first row is the one departure that matters, and it is what makes this a variant rather than a deployment. It is bounded: the shared UI and the domain layer are unchanged by it, because neither ever addressed the backend directly.

## Projections Computed, Not Materialized

The system design calls for materialized projections (`MomentumProjection`, `ActivityProjection`, browse projections) because the hosted variant has a worker to maintain them. This variant has no worker, so a materialized rollup table would be written by nobody — which is precisely what happened: `cycai_momentum` was read for months and always returned zero, hiding real adoption that `cycai_adoption` could prove.

The correction was to compute rollups from the source rows on read, and to leave `cycai_momentum` in the schema, unwritten, as a documented cache slot for the day something can invalidate it. The cost is bounded and does not grow with page size: two Dataverse queries and one Azure DevOps batch, whatever the row count.

This preserves the design's real invariant — **engagement rows are the truth; counts are derived** — while dropping the implementation detail that assumed a worker.

## Activity As A Decorator

In the hosted variant, a backend handler appends activity on every mutation. With no backend, the adapter must do it, and it does so as a decorator wrapped **outside** the finished provider. Three properties follow, all of which the system design requires and none of which a per-method write would give:

- It observes completed operations, so nothing is recorded for a mutation that threw, and no record precedes the thing it describes.
- Neither substrate's module needs to know about a table the other owns.
- The set of things that count as activity is one readable list, not a call sprinkled through twenty methods where a missing one is invisible.

Recording is strictly best-effort and never fails the user's operation — but failures are logged, because a silently-skipped write is indistinguishable from no write at all, which is how an empty feed becomes guesswork.

## Drift Guards

The variant is defended by compile-time checks rather than by discipline:

- `FieldsExistOn<TDomain, TWire>` with `Assert<T extends true>` fails the build when a C# rename desynchronizes the domain from the wire contract. Where the adapter legitimately supplies a field with no wire counterpart, `FieldsExistOnExcept<…, "fieldName">` names it. The guard is never weakened or deleted; it is the only thing that catches a rename.
- TypeGen flattens C# nullability, which is why `logic/domain` refines rather than re-exports.
- `MomentumItem` is a properly typed discriminated union on lowercase literals. The tolerant `isIdeaItem` / `isSolutionItem` helpers must not be applied to it — narrowing breaks, and the build says so.

## Vocabulary Translation Is An Architectural Boundary

The shared UI predates the domain rename and says `Request` where the domain says `Idea` — inconsistently, across three casings. This produced four separate user-visible bugs, each one a cast where a translation belonged. The rule that came out of it:

**Translate at the seam; never cast across it.** `hubItemType()` in `callTool.ts` is that translation, and the tolerant helpers in `packages/ui/src/utils.ts` are its counterpart on the UI side. This is a boundary responsibility, not a workaround, and it stays until the two vocabularies are one.

## Error Handling

Failures are classified into `AppError` with a category and a user-facing message at the adapter boundary, including pre-data failures — a code app that cannot reach Power Platform data services renders a classified error, not an opaque crash on a blank page. Connector calls resolve `{success: false}` rather than throwing, so every call passes through `unwrap()`; an unchecked call is a silent wrong answer, which is the worst failure mode available here.

## Invariants
- Dependencies point one way: contracts → logic → ui → app.
- Exactly one implementation of `InnovationBacklogProvider` per host, and the host contributes nothing else.
- Route strings exist in one file; everything below it is typed.
- Frontend role checks are presentational in every variant; the substrate enforces.
- Derived numbers are derived from source rows, never from a table nothing writes.
- Activity is appended outside the operation, after it succeeds, best-effort but logged.
- Compile-time drift guards are named and narrowed, never removed.

## Related Design
- `docs/design/variants/code-app/index.md`
- `docs/design/variants/code-app/platform-fit.md`
- `docs/design/system/boundaries.md`
- `docs/design/system/authority-model.md`
- `docs/design/capabilities/momentum/projections.md`
- `docs/design/cross-cutting/error-handling`
- `docs/design/cross-cutting/auditing`
