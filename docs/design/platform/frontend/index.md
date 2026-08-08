# Frontend — Platform Index

## Purpose
Define the frontend platform — the pnpm workspace that owns the authenticated business user experience — and how it relates to `Momentum.Service`.

## Owned Responsibilities
- pnpm workspace layout and conventions (`pnpm-workspace.md`).
- Application ownership (`applications.md`).
- Shared package ownership (`shared-packages.md`).
- Generated API-client policy.
- Authentication state management.
- Internal-comment visibility (presentation only).
- Distinct presentation boundary from the backend authorization layer.
- MCP app resource packaging and composition of server tools into focused workflows.

## Explicit Non-Responsibilities
- Backend authorization (see `docs/design/cross-cutting/visibility-and-authorization`).
- API contract generation rules (see `docs/design/cross-cutting/api-contract-design` where applicable).
- Domain rules (see domain and capability design).

## Requirement Baseline
- `docs/requirements/business-backlog.md`
- `docs/requirements/solution-catalog.md`
- `docs/requirements/submission-governance.md`

## Current Architecture
*Scaffolded baseline — pending requirement acceptance and design review.*

`Momentum.Frontend` is a pnpm workspace composed of business applications and shared UI / state / contract packages. The frontend consumes `Momentum.Service` over the HTTP API and over authorized MCP servers. UI authorization decisions are not authoritative; backend authorization remains authoritative.

The current MCP app is published as `ui://momentum/board/app.html`. The vNext target replaces this general board resource with focused workspace, contribution, exploration, item, and review resources as described in `applications.md`.

## Invariants
- Frontend authorization is not backend authorization.
- Internal-comment visibility in the UI is presentation only; the backend enforces approver-only filtering.
- The frontend relies on the backend for every business decision.
- MCP apps invoke the same authorized tools available to conversational clients; they do not define parallel business endpoints.

## Contracts
- In: HTTP API responses, MCP tool responses, authenticated identity.
- Out: user interactions that translate to API calls.

## Related Design
- `docs/design/cross-cutting/identity-and-access`
- `docs/design/cross-cutting/visibility-and-authorization`
- `docs/design/capabilities/comments`
- `docs/design/platform/mcp/tool-surface.md`

## Related Decisions
- `0001-momentum-backend-is-authoritative`

## Deeper Documents
- `docs/design/platform/frontend/pnpm-workspace.md`
- `docs/design/platform/frontend/applications.md`
- `docs/design/platform/frontend/shared-packages.md`
