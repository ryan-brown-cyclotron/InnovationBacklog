# MCP — Tool Authorization

## Purpose
Define tool-level authorization so MCP security parity with the HTTP API is preserved.
Make tool-level authorization a backend-authoritative concern, not a client-side decision.

## Current Rules
- `search_catalog`, `search_backlog`, `get_submission`, `create_backlog_submission`, `create_solution_submission`, and `add_comment` are available to authenticated users.
- `accept_submission` and `reject_submission` are available only to users with the approver or administrator role.
- A tool that requires context exceeding the user's role returns an explicit authorization error, never a partial success.

## vNext Rules
| Access class | Tools | Additional enforcement |
|---|---|---|
| Authenticated | `search_catalyst`, `search_backlog`, `search_catalog`, `get_item`, `find_related`, `create_backlog_submission`, `create_solution_submission`, `get_submission`, `list_comments`, `add_comment`, `get_item_activity`, `analyze_submission`, `get_workspace`, `list_my_work` | Item visibility, comment and audit audience, and response sections are filtered server-side. |
| Owning submitter | `update_submission`, `withdraw_submission`, `list_my_submissions` | The requester identity comes from authentication. Updates and withdrawals also enforce lifecycle state and optimistic concurrency. |
| Approver or administrator | `list_review_queue`, `get_review`, `decide_submission` | Internal evidence remains restricted and decisions enforce the current submission state. |

`get_workspace` and `list_my_work` may include approver work only when the requester has the required role. They never accept a caller-supplied user ID to select another user's work.

## Invariants
- Tool authorization is enforced in `Momentum.Service`.
- The MCP tool surface never exposes tools greater than the user's authority.
- The MCP client may prompt for tools it doesn't have authority to invoke; the server returns a structured authorization error.

## Contracts
- Each tool descriptor carries its required role(s).
- The server filters the tool list by role for the requesting user.

## Related Design
- `docs/design/cross-cutting/identity-and-access`
- `docs/design/cross-cutting/visibility-and-authorization`
- `docs/design/platform/mcp/server-capabilities.md`
- `docs/design/platform/mcp/tool-surface.md`

## Related Decisions
- `0001-momentum-backend-is-authoritative`
