# Frontend — pnpm Workspace

## Purpose
Document the pnpm workspace structure so applications and shared packages are organized in a stable and discoverable shape.

## Purpose
Make the workspace boundaries and tooling consistent.

## Workspace Conventions
- A pnpm workspace at the `Momentum.Frontend` root declares application and shared-package entry points.
- Build, lint, type-check, and test commands are standardized.
- A shared generated API-client consumer pattern (api or generated SDK) is used as the single source for HTTP calls.

## Invariants
- Workspace boundaries are owned and documented; cross-workspace references go through declared package contracts.
- Application code does not embed business logic; it renders and submits to the backend.

## Contracts
- Workspace contracts declared in `pnpm-workspace.yaml` and `package.json`.

## Related Design
- `docs/design/platform/frontend/applications.md`
- `docs/design/platform/frontend/shared-packages.md`

## Related Decisions
- (none — pending requirement acceptance for specific app set.)
