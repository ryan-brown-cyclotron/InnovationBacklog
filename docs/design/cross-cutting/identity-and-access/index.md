# Identity and Access — Design Index

## Purpose
Define the actors that may interact with Momentum and the rules binding identities to capabilities, so authorization is a backend-authoritative concern shared by the API, MCP, and frontend surfaces.

## Owned Responsibilities
- Authenticated business users.
- Roles: submitters, approvers, administrators.
- Agent identities executing creation and acceptance triage under Microsoft Foundry.
- Service identities for Azure Functions workers and infrastructure adapters.
- Relationship between Foundry identities and agent authority limits.

## Explicit Non-Responsibilities
- Comment audience filtering (see `docs/design/capabilities/comments`).
- Approval workflow specifics (see `docs/design/capabilities/approvals`).
- MCP tool authorization specifics (see `docs/design/platform/mcp`).
- Frontend rendering of role state (see `docs/design/cross-cutting/visibility-and-authorization`).

## Requirement Baseline
- `docs/requirements/submission-governance.md`

## Current Architecture
*Scaffolded baseline — pending requirement acceptance and design review.*

Identity is sourced from the business identity system. `Momentum.Service` is the enforcement point. Roles are derived from the authenticated identity at every endpoint and MCP tool. Agent identities on Foundry are distinct from user identities and carry no approver authority.

## Invariants
- Every user action is authenticated through the business identity system.
- Role decisions apply across HTTP API, MCP, and frontend; the backend is authoritative.
- Agent identities are not user identities and are not approvers.
- Submitted-repository reads use a read-scope credential distinct from any user identity.

## Contracts
- Inputs: bearer token or session from the business identity system.
- Outputs: role-aware authorization context propagated to capability handlers.
- Agent identities: distinct Foundry agent identities for creation and acceptance triage.

## Related Design
- `docs/design/capabilities/submissions/permissions.md`
- `docs/design/capabilities/approvals/approver-workflow.md`
- `docs/design/capabilities/comments/permissions.md`
- `docs/design/platform/mcp/tool-authorization.md`

## Related Decisions
- `0001-momentum-backend-is-authoritative`

## Deeper Documents
(This segment is intentionally index-only at this scaffold level.)
