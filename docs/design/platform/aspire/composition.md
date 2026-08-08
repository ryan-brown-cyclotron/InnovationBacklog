# Aspire — Composition

## Purpose
Document the resource graph that the Aspire AppHost composes so the developer experience and deployment topology are anchored in a single, explicit picture.

## Purpose
Make the resource graph and reference flow explicit.

## Resource Graph
The Aspire AppHost composes the following:
- **Azurite Tables** — for Momentum business state (App Agent's relevant persistence).
- **Azurite Queues** — for asynchronous domain event transport.
- **Momentum.Service** — the application runtime hosting API, MCP server, queue event publisher, authentication, and dependency registration.
- **Momentum.Worker** — queue-triggered Azure Functions that consume domain events and execute agent runtime work.
- **Momentum.Frontend** — the authenticated user experience in a pnpm workspace.
- **GitHub MCP server (or GitHub integration process)** — for repository reading and hub repository projection.
- **Microsoft Foundry configuration** — including project endpoint, model deployment, and agent identity.
- **OpenTelemetry** — exporter, resource attributes, and service discovery wiring.
- **Health checks** — exposed through `/health` on `Momentum.Service` and consumed by the AppHost.
- **Service Discovery** — applied to inter-service references between `Momentum.Frontend`, `Momentum.Service`, MCP, and integration processes.
- **Secrets and parameters** — for Foundry, GitHub, identity, and storage configuration.

## Reference Flow
```
Momentum.Frontend  ?  Momentum.Service
Momentum.Service   ?  Azure Tables
                  ?  Azure Queues
                  ?  Microsoft Foundry
                  ?  GitHub MCP
Momentum.Worker    ?  Azure Tables
                  ?  Azure Queues
                  ?  Microsoft Foundry
```

## Invariants
- The AppHost composes references; it never executes business workflow.
- Momentum.Service is the application runtime, not the AppHost.
- Azurite is for local development; production substitutes Azure Storage accounts referenced through Aspire.
- Azure Table Storage also stores idempotency markers for `Momentum.Worker`.
- Foundry configuration, GitHub MCP, and identity secrets are passed through AppHost parameter wiring, never baked into source.

## Contracts
- AppHost emits references that resources and services consume.
- The same composition works locally (with Azurite and a local SQL resource) and in deployment (with Azure equivalents).

## Related Design
- `docs/design/platform/azure-storage`
- `docs/design/cross-cutting/background-processing`
- `docs/design/platform/azure-foundry`
- `docs/design/platform/github`
- `docs/design/platform/frontend`

## Related Decisions
- `0011-azure-table-storage-holds-business-state`
- `0012-aspire-apphost-is-the-composition-root`
- `0013-azure-functions-replace-hangfire`
