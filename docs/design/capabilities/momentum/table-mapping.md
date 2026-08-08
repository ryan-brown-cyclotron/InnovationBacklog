# Momentum — Azure Table Storage Mapping

## Purpose
Define the Azure Table Storage layout for the new engagement source-of-truth tables and the read projection tables. The mapping preserves the existing point-read strengths while filling the read-model gaps that the engagement surfaces require.

## Target Key Convention

Several tables are partitioned by a **target key** derived from `HubItemReference`:

```
backlog:{itemId}
catalog:{itemId}
```

This gives efficient retrieval of all engagement for a specific hub item.

## New Source-of-Truth Tables

| Table | Partition Key | Row Key | Notes |
|---|---|---|---|
| `votes` | target key | user id | Row key = user id naturally enforces one active vote per user per target. |
| `follows` | target key | user id | Row key = user id naturally enforces one follow per user per target. |
| `implementations` | target key | implementation id | Supports listing all implementations for an item. |
| `adoptions` | catalog item id | adoption id | Adoption targets catalog items only. |
| `contributions` | target key | contribution id | Only when contribution becomes first-class. |

For votes and follows, using the user id as the row key naturally enforces one record per user per target and makes "has this user voted/followed" a single point read.

## Projection Tables

| Projection | Partition Key | Row Key | Purpose |
|---|---|---|---|
| `MomentumProjection` | `momentum` | target key | One row per eligible hub item; primary data source for the Momentum Stage. |
| `ActivityProjection` | `yyyyMM` | reverse timestamp + event id | Newest-first retrieval by time bucket; query current month, then previous only when necessary. |
| `ReviewQueueProjection` | review state | sortable timestamp + submission id | Cross-partition review queue without redesigning the submissions source table. |
| `BacklogBrowseProjection` | `Published` | sortable key | Browse/rank/recency/filter for published needs. |
| `CatalogBrowseProjection` | `Published` | sortable key | Browse/recently shared/most adopted/most active/filter for published solutions. |
| `UserWorkProjection` | user id | item/event/work id | Aggregates submissions, implementations, reviews, follows, contributions per user. |

## Current Table Read-Model Gaps

The current storage design is sensible for point reads and aggregate-local records, but several homepage queries cut across partition boundaries. The answer is generally not changing the write model — it is adding projections.

### Submissions
Current: `PartitionKey = submitter id`, `RowKey = submission id`. Excellent for "this person's submissions". Poor for "all AwaitingApproval", "all TriageFailed", or the global review queue. → `ReviewQueueProjection`.

### Backlog Items
Current: `PartitionKey = item id`, `RowKey = item id`. Good for direct lookup. Poor for browse all published, rank by demand, recently published, filter by status. → `BacklogBrowseProjection`.

### Catalog Items
Current: `PartitionKey = item id`, `RowKey = item id`. Good for direct lookup. Poor for browse published, recently shared, most adopted, most active, filter by classification. → `CatalogBrowseProjection`.

## Audit Records
Current: `PartitionKey = audit`, `RowKey = time-sorted id`. Acceptable at low volume. If event/activity volume grows materially, prefer eventually `PartitionKey = yyyyMM`. Not required for the first Momentum iteration unless scale already warrants it.

## Agent Runs, Outbox, Processed Events
The existing patterns are compatible with the new model. No immediate redesign is required. Maintain the separation between `AgentRun` (execution history), `DomainEvent`/Outbox (reliable change propagation), `AuditRecord` (traceability), and `ActivityProjection` (user-facing selected history).

## Repository Mapping

Continue the existing repository pattern:

```
Domain ──↕── Repository ──↕── Azure Table Entity
```

Domain repositories implement the application ports (`IVoteRepository`, `IFollowRepository`, `IImplementationRepository`, `IAdoptionRepository`, `IContributionRepository`). Projection repositories/services implement reader ports (`IMomentumReader`, `IActivityReader`, `IReviewQueueReader`, `IUserWorkReader`, `IBacklogBrowseReader`, `ICatalogBrowseReader`) and remain clearly separated from domain repositories.

## Invariants
- Engagement source tables are partitioned by target key (or catalog item id for adoptions).
- Votes and follows use the user id as row key to enforce one record per user per target.
- Projection tables are keyed for their dominant read pattern, not the write pattern.
- Source-of-truth tables are not redesigned to satisfy cross-partition reads; projections fill the gaps.
- Projection readers do not mutate source tables.

## Related Design
- `docs/design/capabilities/momentum/engagement-model.md`
- `docs/design/capabilities/momentum/projections.md`
- `docs/design/cross-cutting/persistence`
- `docs/design/platform/azure-storage`
