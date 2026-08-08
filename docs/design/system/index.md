# Momentum System Design

## Purpose
This segment describes Momentum as one coherent system: its business purpose, boundaries, authority, major components, and end-to-end submission lifecycle. It is the top-level design entry point and answers "what is Momentum" before any capability, cross-cutting, or platform detail is loaded.

## Owned Responsibilities
- Business purpose and intended outcomes of the Momentum service.
- System boundaries between Momentum, its users, and its integration targets.
- External actors (submitters, approvers, authenticated users, agents, GitHub).
- System authority: which store is the system of record and what GitHub is permitted to receive.
- Identification of major components (Library family, Service, Frontend, AppHost).
- End-to-end submission lifecycle from intake through publication.
- Major trust and integration boundaries across the submission, review, and projection pipeline.

## Explicit Non-Responsibilities
- Detailed capability behavior (see `docs/design/capabilities/`).
- Cross-cutting rules shared by multiple capabilities (see `docs/design/cross-cutting/`).
- Platform-specific implementation details (see `docs/design/platform/`).
- Delivery iterations, lineage, verification evidence, or handoff (see `docs/delivery/`).
- Architectural decision rationale (see `docs/decisions/`).
- Rewriting capability, cross-cutting, or platform design from this segment.

## Requirement Baseline
- `docs/requirements/business-backlog.md` — business backlog purpose.
- `docs/requirements/solution-catalog.md` — managed solution catalog purpose.
- `docs/requirements/submission-governance.md` — submission, approval, and publication governance.

## Current Architecture
*Scaffolded baseline — pending requirement acceptance and design review.*

Momentum is composed of:
- `Momentum.Library` (Domain, Application, Runtime, Infrastructure) — the project family that owns business model, use cases, agent/event/job runtime, and external adapters.
- `Momentum.Service` — an ASP.NET Core process hosting the HTTP API, MCP server, authentication, queue event publisher, and dependency registration.
- `Momentum.Worker` — an Azure Functions process hosting queue-triggered agent job execution.
- `Momentum.Frontend` — a pnpm workspace that owns the authenticated user experience.
- `Momentum.AppHost` — the .NET Aspire composition root that wires resources and services for local development and deployment topology.
- `Momentum.Tests` — verification across the boundaries.

System authority and integration boundaries:
- The Momentum backend is the system of record.
- GitHub is an integration and projection target only.
- Synchronization to GitHub is one-way.
- The business backlog is managed and rendered by Momentum.
- The solution catalog is managed by Momentum and projected as a polished README to the managed hub repository.
- Submitted solution repositories are always read-only to Momentum.

## Invariants
- The Momentum backend is authoritative over business state; GitHub is not.
- GitHub synchronization is one-way from Momentum to the managed hub repository.
- Submitted repositories are read-only and may never receive writes from Momentum or any agent.
- Agents analyze, classify, research, reconcile, and format; they never persist domain state directly.
- Application services validate and persist agent results; agent output is evidence, not authority.
- Business rules remain deterministic application code, not agent reasoning.
- The Aspire AppHost composes resources and services but contains no business workflow.
- Frontend authorization is presentation only; backend authorization remains authoritative.
- Design change requires a requirement change, accepted requirement, architectural decision, or correction of a misrepresentation — not implementation difficulty.

## Contracts
- Inputs: authenticated user submissions (backlog or solution), approver decisions.
- Outputs: persisted submissions, agent reviews, comments, decisions, backlog items, catalog items, hub repository README commits.
- Events: `SubmissionCreated`, `SubmissionAccepted`, plus derived internal events delivered as Azure Queue Storage messages.
- Interfaces: HTTP API, MCP server, Azure Functions worker surface, Azure Tables, Azure Queues, Azure AI Foundry, GitHub.
- Data boundaries: submitted repositories (read-only) versus managed hub repository (write projection target).

## Related Design
- `docs/design/capabilities/submissions` — submission intake and lifecycle.
- `docs/design/capabilities/backlog` — backlog publication after acceptance.
- `docs/design/capabilities/solution-catalog` — catalog formation and GitHub projection.
- `docs/design/capabilities/approvals` — approver workflow and acceptance trigger.
- `docs/design/capabilities/comments` — audienced commentary.
- `docs/design/capabilities/search-and-discovery` — backlog and catalog search.
- `docs/design/cross-cutting/identity-and-access` — who acts on the system.
- `docs/design/cross-cutting/agent-execution` — how agents are bounded.
- `docs/design/cross-cutting/eventing` — how work crosses process boundaries.
- `docs/design/cross-cutting/idempotency` — duplicate-delivery protection.
- `docs/design/platform/aspire` — composition root.
- `docs/design/platform/azure-storage` — Tables and Queues.
- `docs/design/cross-cutting/background-processing` — agent job execution.
- `docs/design/platform/azure-foundry` — agent execution environment.
- `docs/design/platform/mcp` — capability surface.
- `docs/design/platform/github` — read and projection boundaries.

## Related Decisions
- `0001-momentum-backend-is-authoritative`
- `0002-github-synchronization-is-one-way`
- `0003-submitted-repositories-are-read-only`
- `0011-azure-table-storage-holds-business-state`
- `0012-aspire-apphost-is-the-composition-root`
- `0013-azure-functions-replace-hangfire`

## Deeper Documents
- `docs/design/system/context.md` — system context diagram and actors.
- `docs/design/system/boundaries.md` — trust and integration boundaries.
- `docs/design/system/authority-model.md` — system authority and one-way synchronization.
- `docs/design/system/component-model.md` — major Momentum components and their responsibilities.
- `docs/design/system/end-to-end-lifecycle.md` — submission lifecycle and orthogonal failure states.
