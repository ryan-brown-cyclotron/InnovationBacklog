# Comments — Lifecycle

## Purpose
Define the lifecycle of a comment so that the auditable trail of every submission is well-formed.

## States
- **Created** — comment persisted with author and audience.
- **Visible** — the comment is included in audience-filtered reads for eligible users.
- **Withdrawn** (pending requirement acceptance) — the author or an operator removes it from visible reads while it remains in audit history.
- **Archived** — the parent submission has been long retired and the comment is preserved solely for audit purposes.

## Transitions
- Created → Visible immediately on storage; there is no separate "make visible" step in the default flow.
- Visible → Withdrawn on withdrawal by author or operator (gated by policy, pending acceptance).
- Visible → Archived on parent submission archival.

## Invariants
- A created comment is never silently edited — corrections create new comments or are explicitly withdrawn.
- The audience tag travels with the comment through its lifecycle.
- Audit history is preserved for withdrawn and archived comments.
- Comment and activity reads apply audience filtering before entries are returned or aggregated.
- A timeline never reveals the existence or metadata of an entry hidden from the requester.

## Contracts
- Inputs: `AddComment` authorization context, audience parameter, comment body.
- Outputs: persisted `Comment`, audit record.
- Port: `ICommentRepository`.
- vNext reads: `list_comments` returns ordered visible comments; `get_item_activity` returns normalized visible activity entries with stable type and timestamp fields.

## Related Design
- `docs/design/capabilities/comments/audiences.md`
- `docs/design/cross-cutting/auditing`
- `docs/design/platform/mcp/tool-surface.md`

## Related Decisions
- (none — pending requirement acceptance for withdrawal)
