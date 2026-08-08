# Momentum Component Model

## Purpose
Identify the major Momentum components and the boundaries between them so that ownership and cross-cutting concerns resolve cleanly. This document does not redefine layer rules; it surfaces how the components fit together to form the system.

## Components

### Momentum.Library.Domain
- Owns business concepts and invariants.
- Contains submission, backlog, catalog, comment, review, and identity concepts.
- Has no Azure SDK, Agent Framework, Azure Functions, GitHub, or MCP dependency.

### Momentum.Library.Application
- Owns use cases and application ports.
- Determines what is allowed and orchestrates domain operations.
- Validates and applies agent results; never the reverse.

### Momentum.Library.Runtime
- Owns agent, MCP, event, and job runtime behavior.
- Hosts Microsoft Agent Framework, Foundry wiring, MCP server core, event envelopes, and the runtime contracts consumed by `Momentum.Worker`.

### Momentum.Library.Infrastructure
- Owns external adapters.
- Hosts Azure Storage adapters, Foundry runtime, GitHub reader, hub publisher, MCP client, and identity adapter.

### Momentum.Service
- Hosts the HTTP API, MCP server, authentication and authorization, queue event publisher, and dependency registration.
- Must not contain domain rules in controllers or worker functions.

### Momentum.Worker
- Hosts queue-triggered Azure Functions that consume domain events and execute agent runtime work.
- Calls `Momentum.Library.Runtime` for agent execution; Runtime routes structured results through Application for validation and persistence.
- Must not contain domain rules or direct domain persistence.

### Momentum.AppHost
- Composes resources and services.
- Contains no business workflow and makes no business decisions.

### Momentum.Frontend
- Owns the authenticated user experience inside a pnpm workspace.
- Frontend authorization is presentation only.

### Momentum.Tests
- Verifies behavior across the boundaries.
- Owns invariant tests, integration fixtures, Aspire distributed application tests, agent-boundary tests, and projection-safety tests.

## Component Boundaries
- Domain is the only component with no outward infrastructure dependency.
- Application depends only on Domain and declared ports.
- Runtime depends on Application contracts and may depend on Agent Framework and Foundry SDKs.
- Infrastructure implements Application ports and adapts external systems.
- Service wires DI, hosts transport, authentication, queue reception, and the worker resource.
- AppHost wires resources for local development and deployment topology.

## Invariants
- Dependency direction flows Domain ? Application ? Runtime ? Infrastructure, with Service composing them.
- No business rule lives in Service controllers or worker functions.
- No component grants agents write capability for submitted repositories.
- New dependencies must be assigned an explicit owning layer before introduction.

## Related Design
- `docs/design/system/boundaries.md`
- `docs/design/cross-cutting/agent-execution`
- `docs/design/cross-cutting/persistence`
- `docs/design/platform/aspire`
- `docs/design/cross-cutting/background-processing`

## Related Decisions
- `0012-aspire-apphost-is-the-composition-root`
- `0013-azure-functions-replace-hangfire`
