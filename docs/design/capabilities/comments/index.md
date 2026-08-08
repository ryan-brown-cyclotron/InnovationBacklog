# Comments Capability Design

## Purpose
Define how authenticated users add comments to submissions and how comments are exposed to the right audiences — including the strict approver-only protection — so that internal review findings stay internal until approvers act on them.

## Owned Responsibilities
- `Comment` domain model and `CommentAudience` enumeration.
- Application commands `AddComment` and `GetComments`.
- Port `ICommentRepository`.
- Audience-based enforcement on every comment read path.
- Comment lifecycle from creation through archival.
- Comment entries contributed to the normalized item activity timeline.

## Explicit Non-Responsibilities
- Submission creation and editing (see `docs/design/capabilities/submissions`).
- Approval and acceptance (see `docs/design/capabilities/approvals`).
- Agent execution, queue transport, Azure Functions mechanics (see cross-cutting and platform design).
- Identity and authentication mechanism (see `docs/design/cross-cutting/identity-and-access`).

## Requirement Baseline
- `docs/requirements/submission-governance.md`

## Current Architecture
*Scaffolded baseline — pending requirement acceptance and design review.*

A comment is stored in Azure Table Storage by audience and by submission. Every read path is filtered by the requesting user's audience eligibility. Approver-only comments never reach ordinary users via API, MCP, or frontend projection.

## Invariants
- Approver-only comments must never be exposed to ordinary users.
- Comments are available to authenticated users according to their audience.
- Application services enforce the audience rules; the frontend is presentation only.
- Agent-produced approver-only comments are stored with explicit audience tags.

## Contracts
- Inputs: `CommentAudience`, submission identifier, comment body authored by authenticated user or produced by an agent.
- Outputs: persisted `Comment`, audience-filtered read result.
- Ports: `ICommentRepository`.
- Application commands: `AddComment`, `GetComments`.
- HTTP endpoint: `GET /api/submissions/{id}/comments` (audience-filtered).
- Current MCP tool: `add_comment` (audience-tagged).
- vNext MCP tools: `list_comments`, `add_comment`, `get_item_activity`.
- `get_item_activity` composes audience-filtered comments with lifecycle and audit entries owned by their respective capabilities.

## Related Design
- `docs/design/capabilities/submissions`
- `docs/design/capabilities/approvals`
- `docs/design/cross-cutting/visibility-and-authorization`
- `docs/design/platform/mcp`
- `docs/design/platform/mcp/tool-surface.md`

## Related Decisions
- `0001-momentum-backend-is-authoritative`
- `0007-agents-return-structured-results`

## Deeper Documents
- `docs/design/capabilities/comments/audiences.md`
- `docs/design/capabilities/comments/lifecycle.md`
- `docs/design/capabilities/comments/permissions.md`
