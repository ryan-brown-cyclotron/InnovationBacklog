# Comments — Audiences

## Purpose
Enumerate every `CommentAudience`, the rules for each, and the exposure rules that must be enforced by application services. This is the canonical list and must not be silently changed without a requirement or architectural decision.

## Audiences

- **Authenticated** — visible to any authenticated business user. This is the default public-facing audience within Momentum.
- **SubmitterAndApprovers** — visible only to the submitter of the parent submission and to all approvers. Used for collaborative comment threads between submitter and approvers before acceptance.
- **ApproversOnly** — visible only to approvers. This audience exists to protect internal review findings. It must never be exposed to ordinary users or submitters, regardless of frontend, API, or MCP path.

## Rules
- A comment's audience is recorded at creation time and is not silently changed.
- Application services filter read results by the requested user's roles or audience eligibility before returning data.
- The frontend must never receive an ApproversOnly comment for a non-approver user. A defensive server-side filter is always applied.
- MCP tool responses must apply the same filter as the HTTP API.
- Agent-produced comments carry the explicit `CatalogEntryFormatter` or `BacklogPublicationFormatter` audience tag; the application service does not auto-promote audience.

## Invariants
- Approver-only comments must never be exposed to ordinary users.
- Code paths that read comments must accept an audience-aware filter, not an unfiltered list.
- An attempt to add a comment with a higher privilege level than the author holds must be rejected, not silently downgraded.

## Contracts
- Domain: `Comment`, `CommentAudience`.
- Application port: `ICommentRepository` exposes audience-aware read APIs.
- HTTP: `GET /api/submissions/{id}/comments` returns an audience-filtered collection.
- MCP: `add_comment` accepts an audience parameter and is gated to the appropriate role.

## Related Design
- `docs/design/capabilities/comments/permissions.md`
- `docs/design/cross-cutting/visibility-and-authorization`
- `docs/design/platform/mcp/tool-authorization.md`

## Related Decisions
- `0001-momentum-backend-is-authoritative`
