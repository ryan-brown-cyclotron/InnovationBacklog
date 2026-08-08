# MCP — Server Capabilities

## Purpose
Enumerate the MCP tools Momentum currently exposes and their capability mapping, so shipped behavior remains distinct from the vNext target surface.

## Current Capability Surface
- `search_catalog` — searches managed catalog items.
- `search_backlog` — searches published backlog items.
- `get_submission` — reads a submission visible to the requester.
- `create_backlog_submission` — creates a backlog submission.
- `create_solution_submission` — creates a solution submission.
- `add_comment` — adds a comment with audience tag.
- `accept_submission` — accepts a submission (approver role only).
- `reject_submission` — rejects a submission (approver role only).

The normative vNext design is defined in `docs/design/platform/mcp/tool-surface.md`. Tools listed there are not shipped capabilities until they are added to this inventory.

## Capability Mapping
- Each MCP tool maps to a single application command.
- Tools take typed inputs and return typed outputs.
- Tools do not expose storage entities directly.

## Invariants
- Each tool corresponds to exactly one application command; orchestration does not happen over the tool surface.
- Tool availability is determined by user role, not by tool parameter.

## Contracts
- In: typed MCP tool inputs.
- Out: typed capability shapes with audience-aware filtering.

## Related Design
- `docs/design/capabilities/*`
- `docs/design/cross-cutting/visibility-and-authorization`
- `docs/design/platform/mcp/tool-surface.md`
- `docs/design/platform/mcp/tool-authorization.md`

## Related Decisions
- `0001-momentum-backend-is-authoritative`
