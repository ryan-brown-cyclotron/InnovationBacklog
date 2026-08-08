# Momentum.Library.Application

Owns use cases and application port interfaces. Business orchestration contracts.

## Local Ownership

- Submission commands (`CreateBacklogSubmission`, `CreateSolutionSubmission`, `UpdateSubmission`, `AcceptSubmission`).
- Triage operations (`RunCreationTriage`, `RunAcceptanceTriage`).
- Backlog publication and search.
- Catalog publication, search, and projection.
- Comment commands.
- Application port interfaces:
  - `ISubmissionRepository`, `IBacklogRepository`, `ICatalogRepository`, `ICommentRepository`, `IAgentRunRepository`
  - `IEventPublisher`, `IAgentTriageRuntime`, `IRepositoryReader`, `ICatalogProjectionPublisher`

## Constraints

- References only `Momentum.Library.Domain`.
- No Azure, Agent Framework, Azure Functions, GitHub, MCP, or ASP.NET types reachable here.
- Application services validate agent output before persisting domain state.
- Agents return recommendations and structured results. Application is the authority.

## Verification

Use-case tests live in `tests/Momentum.Tests`. Port contract conformance is verified through in-memory test doubles supplied by the tests project.