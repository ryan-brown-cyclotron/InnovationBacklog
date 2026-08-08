# Momentum — Engagement Model

## Purpose
Define the first-class engagement domain records and the `HubItemReference` value object that the momentum experience introduces. These are real business behavior, not cosmetic UI fields, and are modeled deliberately.

## HubItemReference

Several engagement records target either a backlog item or a catalog item. A small value object prevents every record from duplicating `BacklogItemId` / `CatalogItemId` fields.

```
HubItemReference
- ItemType: Backlog | Catalog
- ItemId
```

Not every behavior supports both item types. The reference still gives infrastructure a consistent target identity. The canonical string form is the **target key**:

- `backlog:{itemId}`
- `catalog:{itemId}`

## Vote

A vote is a real business signal and is first-class. Votes drive demand, ranking, trend velocity, prioritization, and momentum. They must not be represented as comments or audit entries.

```
Vote
- Id
- Target          (HubItemReference)
- UserId
- CreatedAt
```

Rules:
- One active vote per user per target.
- A vote is generally removable.
- Removing a vote is an explicit event, not a soft delete.

## Follow

Following is distinct from voting. A person may believe something is valuable enough to vote for it, want notifications without voting, or vote without wanting notifications. These concepts must not be combined.

```
Follow
- Id
- Target          (HubItemReference)
- UserId
- CreatedAt
```

Follow is added only when there is somewhere useful for it to go (notifications, personal feed, digest, Your work / Following). A Follow button without follow-up behavior is low value. See the delivery order in `docs/delivery/momentum-experience.md`.

## Implementation

This is the most important addition. An implementation represents someone actively applying or developing work around an item.

```
Implementation
- Id
- Target              (HubItemReference)
- StartedBy           (UserId)
- Title / ProjectName
- Team?
- RepositoryReference?
- Status
- StartedAt
- UpdatedAt
- CompletedAt?
```

Candidate statuses (vocabulary refinable later):

- `Exploring`
- `Building`
- `Integrating`
- `Completed`
- `Paused`
- `Abandoned`

Important distinction — an implementation can target:

- a **backlog need** — "we are trying to solve this";
- a **catalog solution** — "we are implementing this existing capability."

That makes the lifecycle much more expressive.

## AdoptionRecord

Do not infer all adoption from completed implementations. A team may already be using a published solution without ever having created an implementation record in Innovation Hub. Adoption is an explicit record and becomes the strongest evidence that a catalog item has value.

```
AdoptionRecord
- Id
- CatalogItemId
- ReportedBy          (UserId)
- ProjectName / InitiativeName
- Team?
- Outcome?
- Notes?
- AdoptedAt
- RecordedAt
```

Keep the initial form lightweight. Minimum useful record: **Solution, Project / Initiative, ReportedBy, AdoptedAt.**

Adoption enables "used by 8 projects", adoption velocity, repeat use, proof of reuse, solution ranking, and milestone detection.

## Contribution

The current model has comments, reviews, submissions, and approvals, but does not explicitly represent a person contributing to an already-published need or solution.

### When contribution remains derived
If contribution means only: comment, review, submit a new solution, or start an implementation, then contribution stays derived activity. **Do not add another entity.**

### When contribution becomes first-class
If contribution can mean: add documentation, provide a reference architecture, submit an example, provide research, attach an external repository, add evidence, propose an enhancement, or contribute implementation guidance, then create:

```
Contribution
- Id
- Target              (HubItemReference)
- ContributorId       (UserId)
- ContributionType
- Title
- Description
- Reference?
- Status
- CreatedAt
- AcceptedAt?
```

Possible statuses: `Proposed`, `Accepted`, `Rejected`, `Withdrawn`.

### Recommendation
Do not add `Contribution` in the first engagement iteration unless the "Contribute" action needs to collect a durable artifact beyond comments or implementations.

## Domain Events

The event vocabulary grows alongside the new records. The existing outbox/event envelope model is the foundation. These events drive projections, notifications, analytics, Momentum, activity, and future external integrations.

- `VoteAdded`, `VoteRemoved`
- `FollowAdded`, `FollowRemoved`
- `ImplementationStarted`, `ImplementationStatusChanged`, `ImplementationCompleted`
- `AdoptionRecorded`, `AdoptionRemoved`
- `ContributionCreated`, `ContributionAccepted`, `ContributionRejected` (when introduced)

## Milestones

Milestones are derived, not stored as booleans on records. Examples: first implementation, 5 implementations, 10 implementations, first adoption, 10 adoptions, #1 demand, first external contributor.

Do not store flags such as `HasReachedTenAdoptions`. Detect threshold crossings from domain events and emit milestone events when useful. A milestone can then trigger a micro-reward, create an activity entry, trigger a notification, or become a temporary Momentum feature.

## Repository Ports

New repositories follow the existing ports/adapters model. Domain repositories are distinct from projection readers (see `projections.md`).

- `IVoteRepository`
- `IFollowRepository`
- `IImplementationRepository`
- `IAdoptionRepository`
- `IContributionRepository` (only when contribution becomes a first-class workflow)

## API Command Contracts

Command-shaped contracts are preferred over exposing storage entities or allowing arbitrary mutation.

- `AddVoteRequest`, `RemoveVoteRequest`
- `FollowItemRequest`, `UnfollowItemRequest`
- `StartImplementationRequest`, `UpdateImplementationRequest`, `CompleteImplementationRequest`
- `RecordAdoptionRequest`, `RemoveAdoptionRequest`
- `CreateContributionRequest`, `AcceptContributionRequest`, `RejectContributionRequest` (when introduced)

## Invariants
- `HubItemReference` is the canonical targeting value object; its string form is the target key.
- One active vote per user per target; votes are removable via explicit events.
- Following and voting are independent concepts.
- An `Implementation` may target a backlog need or a catalog solution.
- Adoption is an explicit record, never inferred solely from completed implementations.
- `Contribution` is added only when the product defines a durable contribution artifact.
- Milestones are derived from event threshold crossings, not stored booleans.
- Engagement records are source-of-truth facts; counts and scores are projections.

## Related Design
- `docs/design/capabilities/momentum/projections.md`
- `docs/design/capabilities/momentum/table-mapping.md`
- `docs/design/cross-cutting/eventing`
- `docs/design/cross-cutting/persistence`
- `docs/design/cross-cutting/auditing`
