# Momentum — Projections

## Purpose
Define the read projections that the homepage and engagement surfaces consume. Projections are derived from domain facts and events; they are optimized read models, not source of truth. The homepage must not repeatedly scan source tables and recompute metrics.

## Data Flow
```
Domain facts ──► Domain events ──► Read projections ──► UI metrics
```

Projection handlers consume domain events from the outbox and update projection tables. The exact weighting of derived scores can change without migrating domain data.

## MomentumProjection

Momentum is time-sensitive and derived from multiple facts. Do not create a mutable `MomentumScore` on the catalog or backlog item. One row per eligible hub item.

```
MomentumProjection
- Target              (target key)
- DemandRank
- PreviousDemandRank
- VoteCount
- Votes7d
- Votes30d
- ActiveImplementationCount
- Implementations30d
- AdoptionCount
- Adoptions30d
- ContributorCount
- Contributions30d
- MomentumScore
- CalculatedAt
```

Conceptually:
```
recent votes
+ vote velocity
+ implementations started
+ implementation velocity
+ adoption
+ adoption velocity
+ contribution activity
+ lifecycle movement
= momentum projection
```

The UI usually displays the underlying evidence, not the raw score. The score is primarily useful for ranking and selection. This is the primary data source for the Momentum Stage.

Key: `PartitionKey = momentum`, `RowKey = target key`.

## ActivityProjection

Activity is a projection, not a core domain entity. An `ActivityEntry` is a read model, not the source of truth. Optimized for newest-first retrieval. Avoid an unbounded single global partition at scale; use a time bucket.

```
ActivityEntry
- EventId
- Target?             (target key, when applicable)
- ActorId
- ActorType
- Kind                (the qualified activity kind)
- Summary
- RelatedItemId?
- OccurredAt
```

Key: `PartitionKey = yyyyMM`, `RowKey = reverse timestamp + event id`.

This lets the homepage query the current month, then the previous month only when necessary.

### Activity Projector

A projector determines what qualifies; not all domain events become public activity.

```
Domain Event ──► Activity Projector ──► ActivityEntry ──► Activity Rail
```

### Events worth surfacing
- implementation started
- implementation completed
- adoption recorded
- contribution accepted
- solution published
- backlog item promoted
- significant vote/rank movement
- milestone reached

### Do not surface noise
- page views
- logins
- routine edits
- every comment
- every vote as an individual activity item

`AuditRecord` is traceability; `ActivityProjection` is the user-facing selected history. They are different concerns. Do not use `AuditRecord` as the public activity feed.

## ReviewQueueProjection

The current submissions table (`PartitionKey = submitter id`, `RowKey = submission id`) is excellent for "this person's submissions" but poor for cross-partition queries such as the global review queue. Add an approval/review projection rather than redesigning the source table.

Supports:
- Ready for review
- Awaiting approval
- Triage failure
- Publication failure

```
PartitionKey = review state
RowKey       = sortable timestamp + submission id
```

## Backlog Browse Projection

The current backlog table (`PartitionKey = item id`, `RowKey = item id`) is good for direct lookup but poor for browse/rank/recency/filter. Add a browse projection.

Supports: published needs, recency, demand, status, lightweight card information.

```
PartitionKey = Published
RowKey       = sortable key
```

Additional projections can be introduced later if classification/filter requirements justify them.

## Catalog Browse Projection

The current catalog table (`PartitionKey = item id`, `RowKey = item id`) is good for direct lookup but poor for browse/recently shared/most adopted/most active/filter. Add a browse projection.

Supports: published solutions, recency, adoption summary, implementation summary, classification summary.

```
PartitionKey = Published
RowKey       = sortable key
```

## UserWorkProjection

The user menu exposes "Your work". Build a read model keyed by user so the frontend does not discover "my work" by independently querying six source tables.

```
PartitionKey = user id
RowKey       = item/event/work id
```

It can aggregate: submissions, implementations, reviews, follows, contributions.

## Projection Reader Ports

Projection repositories/services remain clearly separated from domain repositories. The naming makes it obvious these are optimized read models rather than aggregates.

- `IMomentumReader`
- `IActivityReader`
- `IReviewQueueReader`
- `IUserWorkReader`
- `IBacklogBrowseReader`
- `ICatalogBrowseReader`

## Frontend Read Contracts

The homepage must not compose dozens of raw domain calls. Purpose-built read contracts return exactly the data needed for the visual surfaces and keep the SPFx/web/MCP presentation layer free of Azure Table Storage or domain serialization details.

- `HomeMomentumItem`
- `ActivityFeedItem`
- `OpportunityCard`
- `DiscoveryCard`
- `ContributorSummary`
- `UserWorkSummary`

## Audit Partitioning Note

Current audit: `PartitionKey = audit`, `RowKey = time-sorted id`. Simple and acceptable at low volume. If event/activity volume grows materially, a single permanent audit partition becomes undesirable; prefer eventually `PartitionKey = yyyyMM` or another bounded time partition. Not required for the first Momentum iteration unless scale already warrants it.

## Agent Runs, Outbox, and Processed Events

The existing patterns are compatible. Keep a clear separation:

- `AgentRun` — execution history.
- `DomainEvent` / Outbox — reliable change propagation.
- `AuditRecord` — traceability.
- `ActivityProjection` — user-facing selected history.

These are different concerns and must not be conflated.

## Invariants
- Projections are derived; they are never the source of truth.
- `MomentumScore` lives only on the projection, never on `BacklogItem` or `CatalogItem`.
- The homepage consumes purpose-built read contracts, not raw domain/repository calls.
- `ActivityProjection` and `AuditRecord` are distinct concerns.
- Projection reader ports are named distinctly from domain repository ports.
- Search and Momentum remain separate; Momentum is a deterministic projection independent of the search index.

## Related Design
- `docs/design/capabilities/momentum/engagement-model.md`
- `docs/design/capabilities/momentum/table-mapping.md`
- `docs/design/cross-cutting/eventing`
- `docs/design/cross-cutting/persistence`
- `docs/design/cross-cutting/auditing`
- `docs/design/cross-cutting/search`
