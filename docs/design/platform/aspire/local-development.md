# Aspire — Local Development

## Purpose
Describe the local development topology so contributors can reproduce the full Momentum experience on a workstation.

## Purpose
Make local development reproducible without business-workflow decisions in the AppHost.

## Topology
- Azurite runs locally with Tables and Queues.
- `Momentum.Service` runs against Azurite.
- `Momentum.Worker` runs as Azure Functions against the same Azurite account.
- `Momentum.Frontend` is served from its own dev process and talks to `Momentum.Service`.
- Foundry is configured for a local project; agent execution uses Foundry SDKs.
- GitHub MCP is configured for a development token with the proper read/write boundaries.

## Invariants
- The AppHost composes resources; Momentum.Service still owns business workflow.
- Local credentials never bake into source; they pass through AppHost parameter wiring.
- Azurite is local only; production substitutes Azure Storage.

## Contracts
- AppHost parameters flow to all composed resources.
- `/health` exposes aggregate dependency health.

## Related Design
- `docs/design/platform/aspire/composition.md`
- `docs/design/platform/aspire/deployment-topology.md`

## Related Decisions
- `0012-aspire-apphost-is-the-composition-root`
