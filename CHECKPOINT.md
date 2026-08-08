# CHECKPOINT — 2026-08-07

The 2026-08-05 backlog is done, plus admin-managed visibility, tags, and a demo
dataset. Status snapshot and what is still open.

## Where things stand

- **Local dev running**: Azurite + server at `http://localhost:5100/app` in no-auth dev mode (`MOMENTUM_AUTH_MODE=none`, `DOTNET_ROLL_FORWARD=Major` — no .NET 9 runtime installed, only 8/10). Frontend builds with `corepack pnpm build:apps --env-mode=loose`. **turbo needs a `pnpm` binary on PATH** — corepack alone is not enough; a `pnpm.cmd` shim forwarding to `corepack pnpm` works.
- **Storage now includes blobs**: comment attachments live in the Azurite blob endpoint, container `comment-attachments`, created at startup with the tables.
- **The database is currently the demo dataset.** 11 ideas, 7 solutions, 8 people, links, adoptions, upvotes, comments with attachments, participation requests, decisions, and ~50 audit records dated across the last five months.
- 97/97 tests pass. Everything builds except `Momentum.AppHost` (deprecated Aspire workload on the .NET 10 SDK — unchanged, still out of scope).

## Demo data

```powershell
dotnet run --project src/Momentum.Service -- --seed-demo
```

**Destructive**: deletes every table and blob this application owns, then writes
the dataset. It refuses to run unless the storage connection string looks like a
local emulator; `--force` overrides that. It only ever touches tables named in
`StorageTableNames`, so anything else in your Azurite instance is untouched.

Dev sign-in takes a role: `/api/auth/login?role=submitter|approver|administrator`
(default administrator). That is how to see the same data as a non-admin —
dev mode only; the real flow takes roles from the token.

## Visibility (admin-managed)

Roles already existed (`Submitter`, `Approver`, `Administrator`) and were enforced
server-side, but there was **no visibility concept at all** — search returned
everything to everyone. There is now `ItemVisibility` on both ideas and solutions:

| Level | Who can see it |
|-------|----------------|
| `Everyone` | Any authenticated user. The default. |
| `Approvers` | Approvers, administrators, and the person who shared it. |
| `Hidden` | Administrators only. Soft-removes it without deleting — including from its author, because hiding is an administrative act. |

Only administrators change it (`PATCH /api/requests|solutions/{id}/visibility`),
and every change writes an `item.visibilityChanged` audit record at
`ApproversOnly`. An item you may not see returns **404, not 403** — a refusal
would confirm it exists. Links do not widen visibility in either direction.
The idea and solution panels show a "Who can see this" control to administrators
and a badge to everyone who can see a restricted item.

## Tags

Ideas and solutions both carry tags (`TagList.Normalize`: trimmed, whitespace
collapsed, deduped case-insensitively keeping the first spelling, max 8 × 32
chars). Search matches them, they render on list rows, panels, and the showcase,
and clicking one in the showcase searches for it. Settable when sharing.

## Home page

- **Latest activity is two panels.** Left: the five most recent things that
  happened, each opening its item. Right: **the most upvoted solution** — always
  a solution, never an idea. Ideas earn their place in the feed, but the fixed
  slot goes to work people can reuse. Both panels keep their placeholder when
  there is no data, and the section stays ~320px tall.
- **Search no longer filters the list below.** The dropdown previews matches and
  opens them directly; the list stays as it is.

## Shipped 2026-08-06/07 (the agreed backlog)

1. **Language consistency.** `docs/reference/glossary.md` carries the vocabulary table, applied across the UI: **Idea**, **Comment** (never "contribution"), **Upvote**, **Participation request**, **Shared by**, **Share**, **Your work**. Activity feeds no longer render raw `AuditRecord.Summary`; `activityPhrase` / `activityVerbForItem` in `packages/ui/src/utils.ts` derive wording from the stable action key, which also works for rows written before the glossary. The old maps keyed on actions the backend never emits (`request.approved`, `solution.linked`).
2. **Voting is a toggle.** `GET /api/votes` returns `{count, votedByMe}` — the UI could not render a toggle without per-user state.
3. **Comment attachments.** Azure Blob container (`IAttachmentStore` / `BlobAttachmentStore`). Upload is base64 JSON so it travels the same `callTool` bridge as everything else; 10 MB cap. Comments store attachment **ids** and the server re-reads name/type/size from storage. Shared `CommentComposer` replaced two near-identical forms.
4. **Solution demo link** through domain, entity, contracts, share form, and a "Demo" row in the panel.
5. **The broken relationship endpoints** — all implemented, link relationship defaults to `Proposed`.
   - Root cause of `GET /api/solutions/undefined`: `GET /api/solutions` returned raw domain objects with `id` while every consumer read `itemId`. It now returns the same `SearchResponse` envelope as `/api/search`.
6. **Footer search dock removed.**

## Bugs found and fixed along the way

- **`Results.Forbid()` 500s in this app.** It defers to ASP.NET's authentication stack, which the service never registers (it authenticates via `WebSessionAuthMiddleware`). All twelve call sites returned 500 with a stack trace instead of 403. Replaced with a `Forbidden()` helper.
- **A submitter could not open anyone else's idea.** `CanReadRequest` gated reads on *ownership*, contradicting `docs/design/capabilities/backlog/visibility.md`. Invisible while all seed data belonged to one user; the demo dataset exposed it immediately. Reads are now a visibility question.
- The web app's fetch bridge crashed on `204 No Content` (would have broken un-voting and unlinking).
- `useSearch` and the solution panel's "connect an idea" search used `/api/requests`, which returns only **your own** submissions.
- `SearchResponseItem` had no submitter or subtype, so "Shared by" read `—` for every idea and solution eyebrows read `SOLUTION · SOLUTION`.
- `@momentum/ui#build` had no `dependsOn` in `turbo.json`, so it could compile against stale `contracts`/`sdk` output.

## Verification

- `tests/Momentum.Tests`: 97/97 (48 new — attachments, demo-link validation, visibility matrix and handler, tag normalization).
- API: 21/21 functional checks plus 13/13 visibility checks against the running stack, including the submitter path (cannot see restricted items, 404 on hidden, cannot change visibility).
- UI: driven in headless Chrome as **both** administrator and submitter — home, both modals, approvals, visibility round-trip, search behaviour. **Zero console errors, zero failed HTTP responses.**

---

## Still open

- **Solutions publish instantly** — no approval gate.
- **MCP tools** were not added for participation, attachments, visibility, or tags; `McpToolDescriptors` still lists the original eight.
- **Tags are set at creation only** — no edit path yet, and no tag browse/filter surface beyond search.
- `Momentum.Worker` and the MCP board app were not exercised against any of this.
- `.vscode/tasks.json` points at wrong script paths.
- `Momentum.AppHost` will not build on the .NET 10 SDK.

## How to restart the stack

```powershell
npx --yes azurite --silent --location <tempdir> --skipApiVersionCheck   # if not running
$env:MOMENTUM_AUTH_MODE = "none"; $env:DOTNET_ROLL_FORWARD = "Major"
dotnet run --project src/Momentum.Service -- --dev
```

Stop the service before rebuilding — it locks its own output DLLs.
