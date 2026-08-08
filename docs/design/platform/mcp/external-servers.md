# MCP — External Servers

## Purpose
Define how Momentum consumes MCP servers from external systems (GitHub MCP, Foundry MCP, and any future exterior tools) within the bounded trust model.

## Purpose
Make external-MCP consumption explicit without breaching agent authority limits or repository write boundaries.

## Allowed External Servers
- GitHub MCP — used for repository reading.
- Foundry MCP — used as part of the agent runtime (subject to foundry tool exposure rules).
- Other external MCP servers only via an explicit architectural decision.

## Invariants
- External MCP servers never receive write authority over submitted repositories from Momentum.
- Agent sessions do not gain authority beyond what the related Foundry registration grants.
- Momentum does not provide its capabilities to an external MCP server that would treat them as a system of record.

## Contracts
- In: tool calls to external MCP servers.
- Out: structured responses consumed by Momentum.

## Related Design
- `docs/design/platform/github`
- `docs/design/platform/azure-foundry`
- `docs/design/cross-cutting/agent-execution`

## Related Decisions
- `0003-submitted-repositories-are-read-only`
