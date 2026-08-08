# Agent Execution — Design Index

## Purpose
Define the boundaries around agent execution so that the system can safely delegate reasoning while keeping authority in deterministic application code.

## Owned Responsibilities
- Microsoft Agent Framework boundaries.
- Microsoft Foundry execution.
- Agent input contracts.
- Structured output contracts (`CreationTriageResult`, `AcceptanceTriageResult`).
- Tool exposure (including MCP-connected tools).
- Result validation before any agent output reaches domain storage.
- Agent-run records persisted as audit evidence.
- Agent authority limitations — agents never write domain records or write to submitted repositories.

## Explicit Non-Responsibilities
- Application use cases (see `docs/design/capabilities/*`).
- Persistence mechanics (see `docs/design/cross-cutting/persistence`).
- Queue and Azure Functions mechanics (see `docs/design/cross-cutting/eventing` and `background-processing`).
- Foundry SDK wiring details (see `docs/design/platform/azure-foundry`).

## Requirement Baseline
- `docs/requirements/submission-governance.md`

## Current Architecture
*Scaffolded baseline — pending requirement acceptance and design review.*

Agents run on Foundry via Microsoft Agent Framework. Agents receive validated inputs, return structured outputs, and are bounded by `IAgentTriageRuntime`. Application services validate agent results and persist them through declared ports.

## Invariants
- Agents analyze, classify, research, reconcile, and format.
- Agents return structured results.
- Agents do not directly persist domain state.
- Application services validate and apply agent results.
- Creation triage and acceptance triage are distinct operations.
- Agent output is evidence, not authority.
- Business rules remain deterministic application code.
- An MCP read never starts agent execution implicitly.

## Contracts
- Inputs: `CreationTriageInput`, `AcceptanceTriageInput` (typed contracts).
- Outputs: structured `CreationTriageResult`, `AcceptanceTriageResult`.
- Ports: `IAgentTriageRuntime`, `IAgentRunRepository`.
- Tools exposed via MCP are authorized per role.
- vNext `analyze_submission` reads the latest validated, persisted analysis associated with a submission. It does not synchronously invoke an agent and does not enqueue a refresh.
- Analysis persistence must support submission-scoped queries and preserve audience metadata before `analyze_submission` can ship.

## Related Design
- `docs/design/capabilities/submissions`
- `docs/design/capabilities/approvals`
- `docs/design/cross-cutting/idempotency`
- `docs/design/cross-cutting/auditing`
- `docs/design/platform/azure-foundry`
- `docs/design/platform/mcp`
- `docs/design/platform/mcp/tool-surface.md`

## Related Decisions
- `0005-creation-triage-is-automatic`
- `0006-acceptance-triggers-publication-triage`
- `0007-agents-return-structured-results`
- `0008-application-services-persist-agent-results`

## Deeper Documents
(This segment is intentionally index-only at this scaffold level.)
