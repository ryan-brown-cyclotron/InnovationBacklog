# Momentum & Engagement Capability Design

## Purpose
Define the engagement and momentum layer that evolves the Innovation Hub homepage from a static enterprise portal into a fluid, lightly gamified innovation system. The layer makes real organizational behavior visible — demand, participation, execution, adoption, and impact — derived from domain facts rather than manually curated claims.

## Goal
Make real organizational behavior visible:

- **Demand** is visible through votes and growth.
- **Work** is visible through active implementations and contributions.
- **Adoption** is visible through recorded use.
- **Progress** is visible through lifecycle movement.
- **People** are visible through the work they actually move forward.
- **Momentum** is derived from real events rather than manually curated claims.

This iteration focuses on behavior, motion, hierarchy, and the data needed to support them. It does not redesign the application from scratch; the existing shell, search, contribution entry point, opportunities, and discovery surfaces remain.

## Owned Responsibilities
- Engagement domain facts: `Vote`, `Follow`, `Implementation`, `AdoptionRecord`, and (conditionally) `Contribution`.
- `HubItemReference` value object for consistent targeting of backlog or catalog items.
- Engagement domain events: `VoteAdded`/`VoteRemoved`, `FollowAdded`/`FollowRemoved`, `ImplementationStarted`/`ImplementationStatusChanged`/`ImplementationCompleted`, `AdoptionRecorded`/`AdoptionRemoved`, contribution events when introduced.
- Read projections: `MomentumProjection`, `ActivityProjection`, `ReviewQueueProjection`, `UserWorkProjection`, Backlog Browse, Catalog Browse.
- Lightweight game mechanics grounded in real work: demand, execution, adoption, position, and relative movement.
- The homepage experience: Momentum Stage, Activity Rail, Opportunities, Discovery, Contributors, reward moments, and the standardized motion system.
- Instrumentation of participation funnels and lifecycle movement.

## Explicit Non-Responsibilities
- Submission intake, triage, approval, and publication (see `docs/design/capabilities/submissions`, `approvals`, `backlog`, `solution-catalog`).
- Comments and audienced review notes (see `docs/design/capabilities/comments`).
- Search retrieval mechanics (see `docs/design/capabilities/search-and-discovery`). Search and Momentum remain separate systems that intersect only at presentation.
- Agent execution, queue transport, and idempotency (see cross-cutting design).
- GitHub catalog README projection.

## Core Architectural Principle
Store facts once. Derive engagement surfaces from those facts.

```
Domain Facts ──► Domain Events ──► Outbox
                                      │
        ┌─────────────────────────────┼─────────────────────────────┐
        ▼                             ▼                             ▼
     Audit                      Analytics                    Projections
                                                                │
              ┌─────────────────────────────────────────────────┼─────────────────────────────────────────────────┐
              ▼                                                 ▼                                                 ▼
          Momentum                                           Activity                                         User Work
              │                                                 │                                                 │
              └─────────────────────────────────────────────────┼─────────────────────────────────────────────────┘
                                                                ▼
                                                        Home Experience
```

## What Must NOT Be Added to BacklogItem or CatalogItem
Mutable engagement counters must not be persisted directly on published records:

- `VoteCount`, `FollowerCount`, `ImplementationCount`, `AdoptionCount`, `MomentumScore`, `ContributorCount`.

Persisting them on the core domain object would:

- create concurrency pressure;
- turn published records into frequently mutated aggregates;
- duplicate source-of-truth data;
- make recalculation difficult;
- blur domain state with presentation state.

Instead the data flow is:

```
Domain facts ──► Domain events ──► Read projections ──► UI metrics
```

The homepage consumes projections optimized for the experience.

## Current Domain Model Assessment
The existing model is strong for: intake, approval, agent triage, publication, repository assessment, relationships, comments, audit, and event/outbox processing. It primarily describes `Submission → Review → Publication`.

The proposed experience adds: **Demand, Participation, Implementation, Adoption, Contribution, Momentum.** Some of these become first-class domain records; others remain projections.

## Invariants
- Engagement values (counts, ranks, velocity, momentum) are derived projections, never mutable fields on `BacklogItem` or `CatalogItem`.
- One active vote per user per target; a vote is removable.
- Following is distinct from voting — a person may vote without following and follow without voting.
- An `Implementation` may target a backlog need ("we are trying to solve this") or a catalog solution ("we are implementing this existing capability").
- Adoption is an explicit record; it is not inferred from completed implementations alone.
- `ActivityProjection` is a read model derived by a projector that selects qualifying events — it is not a manually maintained business object, and `AuditRecord` is not the public activity feed.
- Momentum is a time-sensitive, deterministic projection derived from organizational behavior; it does not depend on the search index.
- Recognition and micro-rewards are tied to work the organization values — no arbitrary XP, points, crowns, podiums, or noise-rewarding metrics.
- New repositories follow the existing ports/adapters model; projection readers are named distinctly from domain repositories (`IMomentumReader`, `IActivityReader`, etc.).
- API contracts are command-shaped; storage entities and arbitrary mutation are not exposed.

## Contracts
- **Engagement entities:** `Vote`, `Follow`, `Implementation`, `AdoptionRecord`, `Contribution` (conditional).
- **Value object:** `HubItemReference { ItemType: Backlog | Catalog; ItemId }`.
- **Events:** see `engagement-model.md` and the event vocabulary in `projections.md`.
- **Application ports:** `IVoteRepository`, `IFollowRepository`, `IImplementationRepository`, `IAdoptionRepository`, `IContributionRepository` (when introduced).
- **Projection readers:** `IMomentumReader`, `IActivityReader`, `IReviewQueueReader`, `IUserWorkReader`, `IBacklogBrowseReader`, `ICatalogBrowseReader`.
- **Command contracts:** `AddVoteRequest`, `RemoveVoteRequest`, `FollowItemRequest`, `UnfollowItemRequest`, `StartImplementationRequest`, `UpdateImplementationRequest`, `CompleteImplementationRequest`, `RecordAdoptionRequest`, `RemoveAdoptionRequest`, and contribution contracts when introduced.
- **Frontend read contracts:** `HomeMomentumItem`, `ActivityFeedItem`, `OpportunityCard`, `DiscoveryCard`, `ContributorSummary`, `UserWorkSummary`.

## Game Mechanics
Gamification is based on real work, not arbitrary scores:

- **Demand** — votes, followers, recent vote velocity, relative demand rank.
- **Execution** — implementations started, active implementations, contributors, accepted contributions.
- **Adoption** — projects/teams using a solution, repeat use, recent adoption velocity.
- **Position** — `#3 most requested`, `#2 most adopted`, `↑ 4 this month`, `Top 10% by reuse`.

The most important primitive is **relative movement** (e.g., `#7 → #5`): a user can see that legitimate participation changed the position of work.

## Delivery Order
See `docs/delivery/momentum-experience.md` for the data iteration order (A–F), the ten UI iterations, and the recommended first vertical slice. The immediate recommendation is to add only `Vote`, `Implementation`, `AdoptionRecord`, their events, a `MomentumProjection`, and an `ActivityProjection`.

## Related Design
- `docs/design/capabilities/submissions`
- `docs/design/capabilities/backlog`
- `docs/design/capabilities/solution-catalog`
- `docs/design/capabilities/search-and-discovery`
- `docs/design/cross-cutting/eventing`
- `docs/design/cross-cutting/persistence`
- `docs/design/cross-cutting/auditing`
- `docs/design/cross-cutting/visibility-and-authorization`
- `docs/design/platform/azure-storage`
- `docs/design/platform/frontend`

## Deeper Documents
- `docs/design/capabilities/momentum/engagement-model.md` — Vote, Follow, Implementation, AdoptionRecord, Contribution, HubItemReference.
- `docs/design/capabilities/momentum/projections.md` — Momentum, Activity, ReviewQueue, UserWork, Backlog/Catalog Browse projections and event vocabulary.
- `docs/design/capabilities/momentum/table-mapping.md` — Azure Table Storage mapping for new source tables and projection tables.
- `docs/design/capabilities/momentum/home-experience.md` — Homepage structure and UI iterations 1–10.
- `docs/design/capabilities/momentum/metrics.md` — Instrumentation funnels and lifecycle movement tracking.
