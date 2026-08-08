# Backlog � Visibility

## Purpose
Define which actors may read backlog items and at what level of detail.

## Purpose
Make backlog visibility a backend-authoritative decision, not a frontend decoration.

## Rules
- Read access to `BacklogItem` is granted to any authenticated business user, subject to the item's visibility level.
- Internal comments or approver-only annotations remain gated to approvers.
- Logged-out access is not a supported state; users must authenticate through the business identity system.

## Visibility levels

Ideas and solutions both carry `ItemVisibility`. Administrators set it; every
read path enforces it (`ItemVisibilityRules.CanSee`).

| Level | Who can see it |
|-------|----------------|
| `Everyone` | Any authenticated user. The default for everything shared. |
| `Approvers` | Approvers, administrators, and the person who shared it. |
| `Hidden` | Administrators only. Soft-removes the item without deleting it — including from the person who shared it, because hiding is an administrative act. |

Only `Role.Administrator` may change a level (`ItemVisibilityRules.CanChange`),
via `PATCH /api/requests/{id}/visibility` and `PATCH /api/solutions/{id}/visibility`.
Each change writes an `item.visibilityChanged` audit record at
`AuditAudience.ApproversOnly`.

An item the caller may not see returns **404, not 403** — a refusal would confirm
it exists. Links do not widen visibility: a visible idea will not surface a
hidden solution through `GET /api/requests/{id}/solutions`, and vice versa.

## Invariants
- Backlog items are managed and rendered by Momentum; no copy of the backlog is authoritative elsewhere.
- The frontend can render, but cannot decide, what an authenticated user is permitted to see.
- All exposure paths (API, MCP search tools, frontend reads) honor the same audience rules.

## Contracts
- Application port: `IBacklogRepository` exposes read and search ports.
- MCP tools: `search_backlog` is available to authenticated users; no approver-only backlog content is exposed through this surface.
- HTTP endpoints: `GET /api/backlog`, `GET /api/backlog/{id}`.

## Related Design
- `docs/design/cross-cutting/identity-and-access`
- `docs/design/cross-cutting/visibility-and-authorization`
- `docs/design/platform/mcp`

## Related Decisions
- `0001-momentum-backend-is-authoritative`
