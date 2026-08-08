# Frontend — Shared Packages

## Purpose
Define shared packages that the workspace consumes, so common concerns (UI primitives, state, API client, auth) live in one place rather than scattered across applications.

## Purpose
Make shared-package boundaries explicit and reusable.

## Shared Packages (expected)
- UI primitives and design-system tokens.
- Authentication state and identity helpers.
- Generated API client / typed contract facade.
- Cross-application state utilities.

## Invariants
- Shared packages do not embed business rules.
- Authorization decisions are presentation-only; the backend remains authoritative.

## Contracts
- Each shared package exposes a typed public API consumed by applications.

## Related Design
- `docs/design/platform/frontend/pnpm-workspace.md`
- `docs/design/platform/frontend/applications.md`

## Related Decisions
- `0001-momentum-backend-is-authoritative`
