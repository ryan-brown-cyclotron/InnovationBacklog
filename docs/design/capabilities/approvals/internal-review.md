# Approvals — Internal Review

## Purpose
Define how Momentum surfaces internal review findings — creation-triage reconciliation, alternative findings, contradictions, and rationale for the approver — without ever exposing them outside the approver audience.
Lock in the approver-only visibility boundary for internal review content.

## Sources of Internal Review
- Creation triage approver-only comment on backlog submissions.
- Solution creation triage reconciliations and additional approver-only findings on solution submissions.
- Optional alternative findings produced by agents during acceptance triage (depending on requirement acceptance).

## Storage
- All internal review notes are stored with explicit `CommentAudience.ApproversOnly` tags.
- The repository applies a server-side audience filter on every read; readers outside the approver audience do not have access.

## Invariants
- Internal review notes are visible only to approvers.
- The frontend may not bypass the audience filter.
- MCP search tools honor the same filter.
- A composed review response applies each source capability's authorization before aggregation.
- Analysis remains evidence; only a reviewer decision can transition authoritative governance state.

## Contracts
- Application port: `ICommentRepository` enforcing audience filtering.
- UI: only approvers see approver-only entries on submission detail pages.
- vNext `get_review` composes the submission, latest persisted analysis, inferred relationships, visible comments, visible activity, and decision history.
- vNext `list_review_queue` returns bounded review summaries rather than full internal evidence.

## Related Design
- `docs/design/capabilities/comments/audiences.md`
- `docs/design/cross-cutting/visibility-and-authorization`
- `docs/design/platform/mcp/tool-surface.md`

## Related Decisions
- `0001-momentum-backend-is-authoritative`
