# Momentum Architecture

## System Context

Momentum manages backlog and solution submissions from intake through triage, approval, and publication. The Momentum backend is authoritative; agents produce structured evidence but do not persist business state directly.

```text
Browser ──HTTP──> Momentum.Service ──Tables──> Azure Storage
MCP Host ──MCP──> Momentum.Service ──Queues──> Momentum.Worker
                                                  │
                                                  └──> Library application handlers
```

## Components

| Component | Responsibility |
|---|---|
| `Momentum.Library.Domain` | Submissions, backlog items, catalog items, comments, decisions, and invariants |
| `Momentum.Library.Application` | Commands, queries, orchestration, and external ports |
| `Momentum.Library.Runtime` | Agent runtime, event envelopes, MCP tools, and tool authorization |
| `Momentum.Library.Infrastructure` | Azure Storage, identity, repository reading, and projection adapters |
| `Momentum.Service` | HTTP API, MCP transport, OAuth/session authentication, and dependency composition |
| `Momentum.Worker` | Single-queue Azure Functions dispatcher for creation and publication triage |
| `Momentum.Frontend` | Authenticated submissions, review inbox, backlog, and catalog workspace |
| `Momentum.AppHost` | Aspire composition for Azurite, Service, Worker, and Frontend |

Dependencies flow inward: Infrastructure and Runtime implement or consume Application contracts; Application depends on Domain; Domain has no platform dependencies.

## Storage and Events

Azure Table Storage holds submissions, comments, decisions, backlog items, catalog items, agent runs, outbox records, and event-processing claims. Azure Queue Storage carries `DomainEventEnvelope` messages through the single `momentum-events` queue.

The Worker claims an event before execution. Duplicate deliveries short-circuit on the existing claim. Retryable failures release the claim so the queue runtime can retry.

Azurite supplies Tables and Queues during local Aspire development. Set `MOMENTUM_STORAGE_CONNECTION_STRING` when running Service or Worker outside Aspire.

## Surfaces

- Browser workflows use authenticated endpoints under `/api/submissions`, `/api/approvals`, `/api/backlog`, and `/api/catalog`.
- Agents use the MCP endpoint at `/api/mcp`.
- Both surfaces call the same Application handlers and apply backend role and audience checks.
- The current MCP implementation exposes eight tools for search, submission creation/read, comments, and accept/reject decisions. `accept_submission` and `reject_submission` require Approver or Administrator.
- The normative vNext design defines 20 capability-oriented tools across Discovery, Contribution, Collaboration, Triage, Governance, and Workspace. It is documented in `docs/design/platform/mcp/tool-surface.md` and must not be treated as shipped behavior until tools appear in the current server inventory.
- In vNext, `decide_submission` replaces the two current decision tools and remains restricted to Approver or Administrator.
- MCP apps compose canonical tools into human workflows; they add presentation, not business authority.

## Local Topology

```powershell
dotnet build Momentum.slnx
dotnet run --project src/Momentum.AppHost
```

Aspire starts Azurite, `Momentum.Service`, `Momentum.Worker`, and the frontend development process. Running the frontend requires Node 20+ and pnpm 9+.

## Deployment

The Service Dockerfile builds the web assets and publishes `Momentum.Service`. `Momentum.Worker` is deployed separately as an Azure Functions artifact. Production supplies Azure Storage and identity configuration through environment or platform-managed settings.

GitHub catalog README projection remains a separate adapter and is not invoked by the current publication workflow.
