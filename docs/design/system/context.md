# Momentum System Context

## Purpose
Define Momentum's system-level context: its purpose, the actors who interact with it, and the integration targets it depends on. Context answers "where does Momentum sit in the world" before any implementation detail is loaded.

## Scope
This document is loaded only when system-level actors, external systems, or integration targets must be confirmed. Capability, cross-cutting, and platform design are not expanded here.

## Actors
- Authenticated business users — every Momentum action requires an authenticated identity.
- Submitters — any authenticated user may submit a backlog idea or a solution.
- Approvers — review internal comments and decide on acceptance.
- Administrators — operate Momentum and manage configuration.
- Agent identities — execute creation and acceptance triage on Agent Framework / Foundry.
- Service identities — Agent job handlers, Azure Functions workers, and infrastructure adapters act under explicit identities.
- GitHub — receives a one-way catalog README projection only.

## External Systems
- Microsoft Foundry — hosts agent executions.
- Azure Table Storage — holds Momentum business state.
- Azure Queue Storage — transports asynchronous application events.
- Azure Functions (queue-triggered) — durable agent job execution, retries, scheduling, visibility.
- GitHub — read source from submitted repositories; write the catalog README to the managed hub repository.
- MCP clients — consume Momentum capabilities (search, create, accept, comment) over the MCP server.

## Trust Boundaries
- Submitted repository boundary — submitted repositories are read-only to every Momentum component and to every agent.
- Managed hub repository boundary — only the projection publisher may write, and only the catalog README.
- Foundry boundary — agents return structured evidence; application services validate and persist.
- User identity boundary — backend authorization is authoritative; frontend hints are presentational.

## Invariants
- Every user action is authenticated against the business identity system.
- Agents never persist domain state.
- The Momentum backend is authoritative; GitHub is not.
- The submitted repository is never written by Momentum or agents.
- The hub repository projection is content-hash-gated and one-way.

## Related Design
- `docs/design/system/boundaries.md`
- `docs/design/system/authority-model.md`
- `docs/design/system/component-model.md`
- `docs/design/cross-cutting/identity-and-access`
- `docs/design/cross-cutting/agent-execution`
- `docs/design/platform/github`
- `docs/design/platform/azure-foundry`

## Related Decisions
- `0001-momentum-backend-is-authoritative`
- `0002-github-synchronization-is-one-way`
- `0003-submitted-repositories-are-read-only`
