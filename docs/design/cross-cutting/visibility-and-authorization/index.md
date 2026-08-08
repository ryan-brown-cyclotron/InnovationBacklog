# Visibility and Authorization — Design Index

## Purpose
Define shared, backend-authoritative enforcement for audience rules so that every capability applies the same visibility decisions.

## Owned Responsibilities
- Submitter-only submissions and editing windows.
- Approver-only comments and internal review.
- Authenticated comment surface.
- Public business backlog item reads.
- Published catalog item reads.
- MCP tool availability per role.

## Explicit Non-Responsibilities
- Identity establishment (see `docs/design/cross-cutting/identity-and-access`).
- Comment domain modeling (see `docs/design/capabilities/comments`).
- Search implementation (see `docs/design/cross-cutting/search`).

## Requirement Baseline
- `docs/requirements/submission-governance.md`

## Current Architecture
*Scaffolded baseline — pending requirement acceptance and design review.*

Authorization is enforced in `Momentum.Service` for every HTTP endpoint and MCP tool. Frontend visibility is presentational only. Approver-only comments are filtered server-side at every read path. MCP tool descriptors reflect role-availability.

## Invariants
- Approver-only comments must never reach ordinary users, regardless of API path.
- Frontend authorization is not backend authorization.
- The MCP server exposes only tools a user is authorized to use.
- Read endpoints return audience-filtered collections even when the client would accept broader data.

## Contracts
- Filters applied at HTTP endpoint, MCP tool, and repository read boundaries.
- Audience filter parameters are part of every comment read port.

## Related Design
- `docs/design/cross-cutting/identity-and-access`
- `docs/design/capabilities/comments/audiences.md`
- `docs/design/capabilities/submissions/permissions.md`
- `docs/design/capabilities/approvals/approver-workflow.md`
- `docs/design/platform/mcp/tool-authorization.md`

## Related Decisions
- `0001-momentum-backend-is-authoritative`

## Deeper Documents
(This segment is intentionally index-only at this scaffold level.)
