# Momentum.Library

Defines the project family that owns backend business and integration logic. Each layer is a separate assembly; this directory is a project family, not one project.

## Dependency Direction

Layers depend strictly inward:

```
Infrastructure --? Runtime --? Application --? Domain
                +--------------------------?
```

- `Momentum.Library.Domain` references nothing.
- `Momentum.Library.Application` references only `Domain`.
- `Momentum.Library.Runtime` references only `Application`. It does not reference `Infrastructure`.
- `Momentum.Library.Infrastructure` references `Application` and `Runtime`. It does not reference `Domain` projects above `Application`.

## Domain Purity

`Domain` owns business concepts and invariants. It must not depend on Azure SDKs, the Microsoft Agent Framework, Azure Functions, GitHub SDKs, MCP, ASP.NET Core, or any external service. It has no package references and no I/O.

## Application Ports

`Application` owns use cases and application port interfaces (`ISubmissionRepository`, `IEventPublisher`, `IAgentTriageRuntime`, `IRepositoryReader`, `ICatalogProjectionPublisher`, etc.). Domain rules live in `Domain`. Use cases orchestrate Domain objects. Application types must not reference Azure, GitHub, Foundry, Azure Functions, MCP, or ASP.NET types directly.

## Runtime Ownership

`Runtime` owns agent definitions, MCP server and tool registration, domain event envelopes and dispatch, and the runtime contracts consumed by asynchronous workers. It depends only on `Application`. Foundry and Agent Framework live here, behind `IAgentTriageRuntime`. Agents return structured results; they never persist domain state.

## Infrastructure Adapters

`Infrastructure` owns concrete adapters for Azure Table Storage, Azure Queue Storage, Azure AI Foundry, GitHub (read-only repository reader + hub publisher with distinct credentials), catalog Markdown projection, and business identity. Adapters implement `Application` ports only.

## Prohibited Cross-Layer References

- `Domain` must not reference `Application`, `Runtime`, `Infrastructure`, `Service`, or `AppHost`.
- `Application` must not reference `Runtime`, `Infrastructure`, `Service`, or `AppHost`.
- `Runtime` must not reference `Infrastructure`, `Service`, or `AppHost`.
- `Infrastructure` must not reference `Service` or `AppHost`.
- No layer may reference a GitHub write credential in the agent runtime or worker. Read and write GitHub contracts are separate.

## Verification

Dependency direction must be provable from csproj files. Phase 4 scaffold accepts no `<PackageReference>`; package introduction is a delivery decision recorded in `docs/decisions`.

## Related

- `docs/design/cross-cutting` for shared rules applied across layers.
- Nested `AGENTS.md` files inside each subproject for local ownership.