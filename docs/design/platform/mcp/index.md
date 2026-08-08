# MCP — Platform Index

## Purpose
Define how Momentum exposes its capabilities through the Model Context Protocol (MCP), exposing business capabilities rather than storage primitives, with role-based tool authorization.

## Owned Responsibilities
- MCP server hosting inside `Momentum.Service`.
- Tool registry (`CatalystToolRegistry`) and the MCP server (`CatalystMcpServer`).
- Authorization policy for MCP tool access (`McpAuthorizationPolicy`).
- Current capability inventory and the normative vNext tool surface.
- External MCP server consumers (GitHub MCP, Foundry MCP, others).

## Explicit Non-Responsibilities
- Transport internals (handled by MCP SDK).
- Business rules (see domain and capability design).
- Identity establishment (see `docs/design/cross-cutting/identity-and-access`).
- Persistence (see `docs/design/cross-cutting/persistence`).

## Requirement Baseline
- `docs/requirements/submission-governance.md`
- `docs/requirements/business-backlog.md`
- `docs/requirements/solution-catalog.md`

## Current Architecture
*Scaffolded baseline — pending requirement acceptance and design review.*

`Momentum.Service` exposes `/mcp`. `Momentum.Library.Runtime` owns the tool registry, server, and authorization policy. Each tool is wired to an application command and is authorized through `McpAuthorizationPolicy`.

`server-capabilities.md` records what is currently implemented. `tool-surface.md` defines the capability-oriented vNext target. `tool-authorization.md` defines the enforcement policy for both surfaces.

## Invariants
- The MCP server exposes Momentum capabilities, not storage primitives.
- Tool availability is determined by user role.
- Approver-only information is filtered server-side even when tools accept it as input.

## Contracts
- In: MCP tool calls with authenticated user identity and parameters.
- Out: capability-shaped responses honoring audience and authorization rules.

## Related Design
- `docs/design/cross-cutting/identity-and-access`
- `docs/design/cross-cutting/visibility-and-authorization`
- `docs/design/capabilities/*`

## Related Decisions
- `0001-momentum-backend-is-authoritative`

## Deeper Documents
- `docs/design/platform/mcp/server-capabilities.md`
- `docs/design/platform/mcp/tool-surface.md`
- `docs/design/platform/mcp/external-servers.md`
- `docs/design/platform/mcp/tool-authorization.md`
