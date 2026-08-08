# GitHub — Repository Reading

## Purpose
Document the read path into submitted solution repositories so that deep review runs safely and never writes back, and so agents cannot acquire write authority through this surface.

## Purpose
Lock in read-only behavior at the reader boundary.

## Reader Contract
- `GitHubRepositoryReader` reads from the submitted repository through the read-scope credential.
- The reader supports deep inspection needed by `SolutionDeepReview` and the creation triage review.
- The reader never returns repository write tokens or write operations.

## Invariants
- The reader cannot write to the submitted repository, by contract and by credentials.
- A read failure does not silently downgrade the catalog item to Published; an explicit projection / publication status is recorded.
- Agents cannot obtain GitHub write tokens through the reader path.

## Contracts
- In: a `RepositoryReference` from the submission.
- Out: structured repository content for the deep review agent.

## Related Design
- `docs/design/capabilities/solution-catalog/repository-review.md`
- `docs/design/platform/github/credential-separation.md`

## Related Decisions
- `0003-submitted-repositories-are-read-only`
