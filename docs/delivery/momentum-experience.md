# Momentum Experience — Delivery Plan

## Purpose
Track the delivery of the Innovation Hub momentum experience described in `docs/design/capabilities/momentum/`. This document holds the data iteration order, the UI iteration order, the recommended first vertical slice, and a checkbox task breakdown that is updated as work proceeds.

## Guiding Principle
Store facts once. Derive engagement surfaces from those facts. Deliver real behavior incrementally instead of designing a sophisticated experience around fake/demo metrics.

## Immediate Recommendation
Do not expand `BacklogItem` and `CatalogItem` with UI counters. For the next implementation iteration, add only:

- `Vote`
- `Implementation`
- `AdoptionRecord`
- their corresponding domain events
- a `MomentumProjection`
- an `ActivityProjection`

Treat `Follow` as the next addition when notifications/personalization exist. Treat a dedicated `Contribution` entity as optional until the product defines a contribution that is not already represented by comments, reviews, submissions, implementations, or adoption.

---

## Data Delivery Order

### Data Iteration A — Voting
- [x] Add `Vote` domain record + `HubItemReference` value object.
- [x] Add `VoteAdded`, `VoteRemoved` domain events.
- [x] Add `votes` table (`PartitionKey = target key`, `RowKey = user id`).
- [x] Add `IVoteRepository` port + Table Storage adapter.
- [x] Add `AddVote` / `RemoveVote` application commands.
- [x] Add `AddVoteRequest` / `RemoveVoteRequest` API contracts + HTTP endpoints.
- [x] Build demand projection: vote count, `Votes7d`, demand rank (`MomentumProjection` + `IMomentumReader` + `MomentumProjectionCalculator`).
- [x] Domain + use-case tests (`tests/Momentum.Tests` — 23 tests passing).

### Data Iteration B — Implementation
- [x] Add `Implementation` domain record + status vocabulary.
- [x] Add `ImplementationStarted`, `ImplementationStatusChanged`, `ImplementationCompleted` events.
- [x] Add `implementations` table (`PartitionKey = target key`, `RowKey = implementation id`).
- [x] Add `IImplementationRepository` port + adapter.
- [x] Add `StartImplementation` / `UpdateImplementation` / `CompleteImplementation` commands.
- [x] Add corresponding API contracts + HTTP endpoints.
- [x] Build implementation projection: active implementation count, recent starts, people/teams participating.

### Data Iteration C — Adoption
- [x] Add `AdoptionRecord` domain record.
- [x] Add `AdoptionRecorded`, `AdoptionRemoved` events.
- [x] Add `adoptions` table (`PartitionKey = catalog item id`, `RowKey = adoption id`).
- [x] Add `IAdoptionRepository` port + adapter.
- [x] Add `RecordAdoption` / `RemoveAdoption` commands.
- [x] Add corresponding API contracts + HTTP endpoints.
- [x] Build adoption projection: adoption count, `Adoptions30d`, projects/teams using, adoption rank.

### Data Iteration D — Projections
- [ ] Add `MomentumProjection` table + `IMomentumReader`.
- [ ] Add `ActivityProjection` table + `IActivityReader` + activity projector (event qualification).
- [ ] Add `ReviewQueueProjection` + `IReviewQueueReader`.
- [ ] Add `UserWorkProjection` + `IUserWorkReader`.
- [ ] Add `BacklogBrowseProjection` + `IBacklogBrowseReader`.
- [ ] Add `CatalogBrowseProjection` + `ICatalogBrowseReader`.
- [ ] Add purpose-built frontend read contracts (`HomeMomentumItem`, `ActivityFeedItem`, `OpportunityCard`, `DiscoveryCard`, `ContributorSummary`, `UserWorkSummary`).
- [ ] Add a homepage aggregation endpoint returning exactly the data the visual surfaces need.

### Data Iteration E — Follow / Notification
- [ ] Add `Follow` domain record + `FollowAdded`/`FollowRemoved` events.
- [ ] Add `follows` table + `IFollowRepository`.
- [ ] Add `FollowItem` / `UnfollowItem` commands + API contracts.
- [ ] Wire follow into notifications / personal feed / digest / Your work / Following.

### Data Iteration F — Contribution Workflow
- [ ] Only introduce a dedicated `Contribution` entity once the product supports durable contributions beyond comments, reviews, implementations, and submissions.
- [ ] Add `Contribution` record + `ContributionCreated`/`ContributionAccepted`/`ContributionRejected` events.
- [ ] Add `contributions` table + `IContributionRepository`.
- [ ] Add contribution commands + API contracts.

---

## UI Delivery Order

### Iteration 1 — Establish the New Interaction Model
- [x] Introduce the Momentum Stage concept immediately below the hero/search area.
- [x] Ensure one obvious visual focal point representing changing organizational activity.
- [x] Keep the rest of the interface comparatively calm.
- [x] Remove dependency on prose such as "Happening around you".

### Iteration 2 — Build the Momentum Stage
- [x] Implement rotating states: Rising Demand, Active Build, Adoption, Contribution.
- [x] Automatic transition between 3–5 significant signals; hover/focus pauses motion.
- [x] Clicking the featured object opens the underlying item.
- [x] User actions change displayed numbers naturally.
- [x] Purple identity used for energy (ambient gradient, count/rank/progress transitions, avatar accumulation, depth, brief glow on user-caused state change), not for every border/icon/card.

### Iteration 3 — Add the Activity Rail
- [ ] Replace vertical "Around Innovation Hub" feed with a compact horizontal rail.
- [ ] Slow horizontal movement, edge fades, pause on hover/focus, trailing-edge entry.
- [ ] Every event navigable; only meaningful events qualify.

### Iteration 4 — Turn "Work That Needs People" into Opportunities
- [ ] Cards driven by current state and evidence (signals) rather than explanatory prose.
- [ ] Surface candidate signals (rank, vote velocity, contributors needed, ready for review, no owner, active implementations, closing this week, high reuse potential).
- [ ] Show only actions valid for the user's permissions and the item's current state.

### Iteration 5 — Introduce Lightweight Game Mechanics
- [ ] Demand, execution, adoption, and position signals grounded in real work.
- [ ] Relative movement as the primary primitive (`#7 → #5`).
- [ ] No arbitrary XP/points.

### Iteration 6 — Upgrade Recently Shared into Discovery
- [ ] Attach one meaningful live signal to each discovery item.
- [ ] Fluid editorial layout: strongest current item occupies a larger area; avoid a rigid uniform grid.

### Iteration 7 — Make People Visible Through Contribution
- [ ] Contributors section with evidence (contributions, reviews, implementations, adoptions, solutions).
- [ ] No crowns, podiums, "Innovation Champion", or arbitrary point totals.

### Iteration 8 — Reward Moments
- [ ] Vote number roll + energy pulse.
- [ ] Avatar joins active implementation cluster on implementation start.
- [ ] Adoption milestone sweep/glow.
- [ ] Rank change animation.
- [ ] Publication state transition (`Review → Shared`).

### Iteration 9 — Standardize the Motion System
- [ ] Motion vocabulary: fade/slide (enter), count/roll (metric change), position shift (rank), pulse/glow (user-caused update), morph (lifecycle change).
- [ ] No perpetual bouncing or semantically empty animation.

### Iteration 10 — Instrument the Experience
- [ ] Track participation funnels (search→open, need viewed→vote/follow/contribute/implement, solution viewed→implement/adopt/contribute, momentum impression→open, activity impression→open).
- [ ] Track lifecycle movement (need→exploration→implementation→published solution→adoption→repeat adoption).
- [ ] Feed measurements back into Momentum weighting over time.

---

## Recommended First Vertical Slice

The highest-value first slice is deliberately small:

```
Backlog Item
    ↓
Vote
    ↓
Demand projection
    ↓
Momentum Stage
    ↓
Rank / velocity visualization
```

Then:

```
Catalog / Backlog Item
    ↓
Start Implementation
    ↓
Implementation projection
    ↓
Momentum Stage + Activity Rail
```

Then:

```
Catalog Item
    ↓
Record Adoption
    ↓
Adoption projection
    ↓
Discovery + Momentum + Milestones
```

This gives the UI real behavior incrementally instead of designing a sophisticated experience around fake/demo metrics.

### First slice task breakdown
- [x] `HubItemReference` value object (Domain).
- [x] `Vote` record + `VoteAdded`/`VoteRemoved` events (Domain).
- [x] `IVoteRepository` port (Application) + `IMomentumReader`/`IActivityReader` reader ports.
- [x] `AddVote` / `RemoveVote` commands (Application).
- [x] `votes` table adapter (Infrastructure).
- [x] `AddVoteRequest` / `RemoveVoteRequest` + HTTP endpoints (Service).
- [x] Demand projection: vote count, `Votes7d`, demand rank (`MomentumProjection` + `IMomentumReader`).
- [x] `HomeMomentumItem` read contract + `MomentumProjection`/`ActivityFeedItem` read models.
- [x] Homepage aggregation endpoint (`/api/momentum/home`) returning exactly the data the visual surfaces need.
- [x] Momentum Stage UI component (Rising Demand state first) wired to the projection.
- [x] Rank / velocity visualization with count-roll and position-shift motion.
- [x] Domain + use-case tests in `tests/Momentum.Tests`.

## Related Design
- `docs/design/capabilities/momentum/index.md`
- `docs/design/capabilities/momentum/engagement-model.md`
- `docs/design/capabilities/momentum/projections.md`
- `docs/design/capabilities/momentum/table-mapping.md`
- `docs/design/capabilities/momentum/home-experience.md`
- `docs/design/capabilities/momentum/metrics.md`
