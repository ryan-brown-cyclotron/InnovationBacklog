# Azure AI Foundry — Platform Index

## Purpose
Define how Momentum uses Microsoft Foundry for agent execution while keeping authority in deterministic application code and keeping the boundaries between agents, application services, and persistence clear.

## Owned Responsibilities
- Foundry project endpoint configuration.
- Model deployment configuration.
- Agent identity and registration.
- Foundry wiring behind `IAgentTriageRuntime`.
- Boundary against `Momentum.Library.Domain` to keep Foundry SDKs out of it.

## Explicit Non-Responsibilities
- Agent semantic contracts (see `docs/design/cross-cutting/agent-execution`).
- Azure Functions execution mechanics (see `docs/design/cross-cutting/background-processing`).
- Domain rules (see domain and capability design).

## Requirement Baseline
- `docs/requirements/submission-governance.md`

## Current Architecture
*Scaffolded baseline — pending requirement acceptance and design review.*

Microsoft Foundry supplies the agent execution environment. `Momentum.Library.Runtime` owns the Agent Framework integration; `Momentum.Library.Infrastructure` provides `FoundryAgentRuntime` and `AgentFrameworkRegistration`. The project endpoint, model deployment, and agent identity are configuration values supplied through Aspire parameter wiring.

## Invariants
- Agents analyze, classify, research, reconcile, and format; they do not persist domain state.
- Application services validate and persist agent output.
- Foundry SDKs are kept out of `Momentum.Library.Domain` (the domain is platform-free).
- Agent identities are distinct from user identities.

## Contracts
- In: `IAgentTriageRuntime` calls.
- Out: structured agent results.
- Config: project endpoint, model deployment, agent identity.

## Related Design
- `docs/design/cross-cutting/agent-execution`
- `docs/design/platform/aspire/composition.md`

## Related Decisions
- `0007-agents-return-structured-results`
- `0008-application-services-persist-agent-results`

## Deeper Documents
- `docs/design/platform/azure-foundry/agent-registration.md`
- `docs/design/platform/azure-foundry/model-configuration.md`
