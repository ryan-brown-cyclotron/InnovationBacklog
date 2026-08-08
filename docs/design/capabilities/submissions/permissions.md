# Submissions — Permissions

## Purpose
Document the authorization rules applied to submission operations so the backend is authoritative and the frontend cannot bypass them.

## Rules
- **Create** — any authenticated business user may call `CreateBacklogSubmission` or `CreateSolutionSubmission`. The submitter is recorded as the owner.
- **Read** — the submitter may read their own submission at any state. Approvers may read any AwaitingApproval submission.
- **Edit** — the submitter may edit their own submission only in an explicitly editable lifecycle state.
- **Withdraw** — the submitter may withdraw only their own submission and only while the lifecycle permits withdrawal.
- **List own** — the authenticated identity selects the submissions; callers cannot supply another user's ID.
- **Decide** — only an approver or administrator may accept, reject, or request changes. No agent may decide on a user's behalf.
- **Force publish or override** — administrative operations are not exposed at the submission layer.

## Invariants
- Authorization is enforced in `Momentum.Service`; frontend checks are presentational only.
- Approver-only fields remain inaccessible to ordinary users even through MCP tools.
- Edit attempts after Accept are rejected with an explicit terminal state error.
- Ownership, lifecycle state, and optimistic concurrency are checked for every update and withdrawal.

## Contracts
- Application enforces the rules through authorization filters on `Momentum.Service` endpoints and MCP tool descriptors.
- Read and edit operations are gated to the submitter or the approver role.
- The current MCP server exposes submission tools only to authenticated users; `accept_submission` and `reject_submission` are exposed only to approvers or administrators.
- The vNext target exposes `update_submission`, `withdraw_submission`, and `list_my_submissions` with resource-level ownership checks; `decide_submission` is approver- or administrator-only.

## Related Design
- `docs/design/cross-cutting/identity-and-access`
- `docs/design/cross-cutting/visibility-and-authorization`
- `docs/design/platform/mcp`
- `docs/design/platform/mcp/tool-surface.md`

## Related Decisions
- `0001-momentum-backend-is-authoritative`
