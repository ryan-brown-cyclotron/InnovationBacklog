# Comments — Permissions

## Purpose
Define the authorization rules for comment creation and reading so every audience policy is enforced on the backend.

## Purpose
Make comment authorization a backend concern, not a frontend decoration.

## Rules
- Any authenticated user may add a comment with audience `Authenticated`.
- The submitter and any approver may add a comment with audience `SubmitterAndApprovers` on their own submission.
- Only approvers may add a comment with audience `ApproversOnly`.
- Reads are filtered by the requesting user's audience eligibility: an ordinary user receives only `Authenticated` (and `SubmitterAndApprovers` for their own submissions); approvers receive all audiences.

## Invariants
- Approver-only comments must never reach ordinary users, regardless of API path.
- The frontend cannot request a higher audit audience than its role permits; the backend rejects the request even if it does arrive.
- The MCP server applies the same audience filter as the HTTP API.

## Contracts
- HTTP: `GET /api/submissions/{id}/comments` returns audience-filtered collection.
- MCP tool: `add_comment` available to authenticated users; `get_submission`, `search_*` honor audience filter.
- Port: `ICommentRepository` enforces audience filtering on every read.

## Related Design
- `docs/design/capabilities/comments/audiences.md`
- `docs/design/cross-cutting/identity-and-access`
- `docs/design/cross-cutting/visibility-and-authorization`

## Related Decisions
- `0001-momentum-backend-is-authoritative`
