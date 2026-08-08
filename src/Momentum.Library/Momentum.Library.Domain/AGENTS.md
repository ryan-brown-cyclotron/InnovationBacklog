# Momentum.Library.Domain

Owns business concepts and invariants. The pure business model.

## Local Ownership

- Submissions, Backlog Items, Catalog Items, Comments, Agent Reviews, and Approval Decisions.
- Identity primitives (`UserId`, `Role`).
- Domain events (`SubmissionCreated`, `SubmissionAccepted`).
- Comment audiences, including `ApproversOnly`.

## Constraints

- No `<PackageReference>` allowed at this level.
- No references to any other Momentum project.
- No Azure, Agent Framework, Azure Functions, GitHub, MCP, or ASP.NET types.
- No I/O. Persistence, transport, and projection are concerns of other layers.

## Verification

Domain invariants are enforced by `tests/Momentum.Tests` and expressed as ordinary C# behavior. Domain must build with zero non-BCL dependencies.