# Momentum Authority Model

## Purpose
State unambiguously which store, runtime, and integration is authoritative for each piece of Momentum state, and which integrations are passive consumers of that authority.

## Authority Statements
- The Momentum backend is the system of record for business state.
- GitHub is an integration and projection target, never a source of truth.
- Synchronization from Momentum to GitHub is one-way.
- The business backlog is managed and rendered by Momentum.
- The solution catalog is managed by Momentum.
- The solution catalog is projected to a polished README in the managed hub repository.
- Azure Table Storage is the authoritative store for Momentum business state.
- Agents are never authoritative over business decisions; their structured output is evidence for application services.

## One-Way Synchronization
- Momentum publishes to GitHub only when the derived README content changes.
- The hub repository publisher writes only the catalog README.
- A GitHub projection failure does not roll back Momentum state and does not unpublish a valid catalog item.
- GitHub state is not consulted to derive Momentum business state.

## Repository Authority Split
- Submitted solution repositories — read-only source for solution review.
- Managed Momentum hub repository — write target for the catalog README projection only.

## Comment Authority
- Comments are stored as authoritative records by Momentum, indexed by audience.
- Audience enforcement is the responsibility of the backend, not the frontend.

## Invariants
- No integration may write Momentum business state except through declared ports.
- No agent may write domain records directly.
- A projection failure is logged and tracked, but does not invalidate publication.
- GitHub is never promoted to a second system of record.

## Related Design
- `docs/design/system/boundaries.md`
- `docs/design/cross-cutting/auditing`
- `docs/design/cross-cutting/idempotency`
- `docs/design/capabilities/solution-catalog`

## Related Decisions
- `0001-momentum-backend-is-authoritative`
- `0002-github-synchronization-is-one-way`
- `0003-submitted-repositories-are-read-only`
- `0004-catalog-readme-is-a-derived-projection`
