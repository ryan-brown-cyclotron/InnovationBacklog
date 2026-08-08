# Frontend — Applications

## Purpose
Define how frontend applications are organized to deliver the authenticated user experience without taking on backend authority.
Make application scope explicit and bounded.

## Application Conventions
- Each application is a focused workspace that consumes shared packages.
- State management is presentation-bound; business decisions stay on the backend.
- Authentication state lives in a shared package; each application consumes it.
- Approver-only views are gated by presence checks that mirror (but do not replace) backend authorization.

## Invariants
- No application may redefine a backend authority decision.
- Internal-comment visibility is presentation-only and never authoritative.
- An MCP app may compose multiple reads for presentation, but every mutation invokes a canonical MCP tool.
- Embedded controls are displayed according to host context and role hints; the server still enforces authorization and lifecycle state.

## MCP App Resources
The current general-purpose MCP app is `ui://momentum/board/app.html`. The vNext target replaces it with five focused resources:

| Resource | Purpose | Canonical tools |
|---|---|---|
| `ui://momentum/workspace` | Personal overview and actionable work | `get_workspace`, `list_my_work` |
| `ui://momentum/contribute` | Backlog and solution contribution with duplicate discovery | `create_backlog_submission`, `create_solution_submission`, `find_related` |
| `ui://momentum/explorer` | Unified and specialized discovery | `search_catalyst`, `search_catalog`, `search_backlog` |
| `ui://momentum/item` | Item details, relationships, timeline, and comments | `get_item`, `find_related`, `get_item_activity`, `list_comments` |
| `ui://momentum/review` | Composed reviewer context and authoritative decision controls | `get_review`, `analyze_submission`, `find_related`, `list_comments`, `decide_submission` |

The review resource can display possible duplicates, repository observations, internal comments, and activity. Its decision bar invokes `decide_submission`; it does not introduce app-specific accept, reject, or request-changes APIs.

## Contracts
- In: shared package APIs, API client, authenticated identity.
- Out: HTTP / MCP calls.
- MCP resources: current `ui://momentum/board/app.html`; vNext resources listed above.

## Related Design
- `docs/design/platform/frontend/pnpm-workspace.md`
- `docs/design/platform/frontend/shared-packages.md`
- `docs/design/platform/mcp/tool-surface.md`

## Related Decisions
- `0001-momentum-backend-is-authoritative`
