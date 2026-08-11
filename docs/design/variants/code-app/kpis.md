# Code App Variant — KPIs

## Purpose
Define the measures the variant is answerable for, in three families — **usage**, **adoption**, and **engagement** — plus the flow measures the business case depends on. For each measure: what it is, where the number comes from, and whether it can be computed today. A KPI without a named source is a wish.

## Measurement Substrate

Everything below is derived from four sources. Three exist and are populated; one does not exist yet.

| Source | Holds | Grain |
|---|---|---|
| **Azure DevOps work items** | Ideas, Solutions, Backlog Items — type, state, created/changed, author, links, revisions, comments | One row per item, full revision history |
| **`cycai_vote`** | One row per user per target | Target key (`request:{id}` / `solution:{id}` — see `targetKey()`), user, created |
| **`cycai_adoption`** | One row per team/project use of a solution | Solution, project, team, status (`Exploring` / `Implementing` / `Using`), `startedAt`, `updatedAt`, `completedAt` |
| **`cycai_activity`** | One row per completed mutation | Action key, actor, subject type/id, summary, created |
| **`cycai_participation`** | Offers to help | **Populated by nothing — no UI calls it** |
| *(absent)* | Views, searches, impressions, sessions | **Not captured. See Instrumentation Gaps.** |

`cycai_activity` is the closest thing to an event log the variant has. Its action vocabulary is fixed and readable in `provider/activity-recorder.ts`:

```
request.created   request.updated   request.accepted    request.rejected
solution.created  solution.published solution.rejected
vote.added        vote.removed      comment.added
solutionUse.started  solutionUse.updated  solutionUse.completed
request.solutionLinked  request.solutionUnlinked  request.canonicalSelected
```

Two properties matter for measurement. It records **only mutations that succeeded** — the decorator wraps the finished operation — so it is a clean record of things that actually happened. And it records **no reads**, so no funnel that begins with a view or a search is computable from it.

### What the app computes today
Per-item rollups only, live from source rows, for rendering — not aggregate reporting:

- `IdeaRollup` — `votes`, `votes30d`, `votedByMe`, `linkedSolutions`, `contributors`, `comments`
- `SolutionRollup` — `adoptions`, `teams`, `linkedNeeds`, `activeUses`, `completedUses`, `votes`, `votedByMe`, `comments`

**No KPI in this document is computed by the application.** Reporting is a read-side concern: Azure DevOps Analytics for lifecycle and flow, a Dataverse read (Power BI or a scheduled query) for engagement and adoption. Building it into the app would be the wrong place — the app has no worker, and a dashboard that recomputes on page load is the `cycai_momentum` mistake with a different name.

---

## Family 1 — Usage

*Is the platform being used, by more than a handful of people?*

| KPI | Definition | Source | Computable today | Proposed baseline |
|---|---|---|---|---|
| **Weekly active contributors** | Distinct actors in `cycai_activity` in a rolling 7 days | `cycai_activity`.actor, created | Yes | Rising over the first two quarters; flat is the signal to intervene |
| **Contributor breadth** | Distinct actors ÷ eligible population, rolling 90 days | `cycai_activity` + licensed user count | Yes (population supplied manually) | ≥ 25% of the target practice within two quarters |
| **Concentration ratio** | Share of all activity produced by the top 3 actors, rolling 90 days | `cycai_activity` | Yes | < 50%. Above that, it is a one-person hub with an audience |
| **Submission rate** | New Ideas + Solutions created per month | ADO work items, created date, type | Yes | Non-zero every month; trend matters more than level |
| **Return rate** | Share of actors with activity in ≥ 2 distinct weeks in a quarter | `cycai_activity` | Yes | ≥ 50% of contributors |
| **Search-to-open conversion** | Item opens ÷ searches | — | **No** — no read events | Deferred |
| **Time to first contribution** | Days from a user's first recorded activity to their first `request.created` / `solution.created` | `cycai_activity` | Yes | Shorter is better; a long tail means intake friction |

Deliberately absent: sessions, page views, and time-on-page. They measure attention, not participation, and the system design already rules them out as activity (`capabilities/momentum/metrics.md`).

---

## Family 2 — Adoption

*Is the output being reused? This is the family that carries the business case.*

Adoption is an explicit record — never inferred from votes, comments, or completed work. An inferred reuse number cannot be put in a proposal.

| KPI | Definition | Source | Computable today | Proposed baseline |
|---|---|---|---|---|
| **Adoption coverage** | Published solutions with ≥ 1 adoption ÷ all published solutions | `cycai_adoption` + ADO state | Yes | ≥ 40% within two quarters of publication. **The single most important number here** |
| **Adoptions per published solution** | Mean and median adoption rows per published solution | `cycai_adoption` | Yes | Report median; the mean will be dragged by one or two accelerators |
| **Reuse breadth** | Distinct teams ÷ distinct solutions adopted | `cycai_adoption`.team | Yes | > 1.5 teams per adopted solution — reuse across teams, not within one |
| **Repeat adoption** | Solutions adopted by ≥ 3 distinct teams | `cycai_adoption` | Yes | A growing named list, reviewed quarterly. These are the firm's real assets |
| **Time to first adoption** | Days from `solution.published` to the first `solutionUse.started` | `cycai_activity` (both events) | Yes | Median < 60 days. A long median means the catalog is not findable |
| **Adoption completion rate** | Adoptions with a `completedAt` ÷ all adoptions (the `completedUses` ÷ `activeUses + completedUses` split already rendered per solution) | `cycai_adoption`.`completedAt` | Yes | Watch the trend; a low rate means adoptions start and stall |
| **Catalog freshness** | Published solutions with any activity in the last 180 days ÷ all published | `cycai_activity` + ADO | Yes | ≥ 60%. Falling freshness is a catalog decaying into an archive |
| **Effort avoided** | Adoption count × a per-solution rebuild estimate | `cycai_adoption` + a manual estimate per solution | Partly — the estimate is not captured | Report as a range, and never as a precise figure |

Effort avoided is the number leadership will ask for. It is deliberately the weakest one here, because the rebuild estimate is a judgement, not a measurement. Report it with its inputs visible or not at all.

---

## Family 3 — Engagement

*Is there a community around the work, or just a filing cabinet?*

| KPI | Definition | Source | Computable today | Proposed baseline |
|---|---|---|---|---|
| **Votes per idea** | Median votes on ideas created in the period | `cycai_vote` | Yes | Median ≥ 2. A median of 0 means demand is invisible and prioritization is guesswork |
| **Voter breadth** | Distinct voters ÷ active contributors, rolling 90 days | `cycai_vote`, `cycai_activity` | Yes | ≥ 60% — voting is the lowest-friction signal; low breadth predicts every other number |
| **Comment participation** | Share of items with ≥ 1 comment from someone other than the author | ADO work item comments | Yes | ≥ 30% |
| **Demand velocity** | `votes30d` per idea, trended | `cycai_vote`, created date | Yes (already computed per item) | Used for ranking, not as a target |
| **Idea-to-solution conversion** | Accepted ideas that acquire ≥ 1 linked solution ÷ accepted ideas | ADO links | Yes | ≥ 30% within two quarters of acceptance |
| **Cross-author engagement** | Share of votes/comments where actor ≠ item author | `cycai_vote`, `cycai_activity`, ADO author | Yes | High. Self-engagement is noise and should be excluded from every count above |
| **Participation offers** | `cycai_participation` rows per period | `cycai_participation` | **No** — no UI writes it | Deferred until the participation surface exists |
| **View-to-vote conversion** | Votes ÷ item views | — | **No** — no read events | Deferred |

---

## Family 4 — Flow And Governance

*Not requested as a family, but the business case fails on these first, and they are the cheapest to measure.*

| KPI | Definition | Source | Computable today | Proposed baseline |
|---|---|---|---|---|
| **Decision latency** | Median days from `Awaiting Approval` to Accepted/Rejected | ADO state revisions | Yes | Median < 10 days. Rising latency is the earliest graveyard signal |
| **Pending backlog age** | Count and oldest age of items in `Awaiting Approval` | ADO state | Yes | Nothing older than 30 days |
| **Rejection rate** | Rejected ÷ decided | ADO state | Yes | Between 10% and 40%. Near-zero means acceptance is meaningless |
| **Rationale completeness** | Decisions with a non-empty `Custom.InnovationBacklogDecisionRationale` | ADO field | Yes | 100% — the field is required on transition, so any gap is a process leak |
| **Accepted-to-published ratio** | Published solutions ÷ accepted ideas, trailing 2 quarters | ADO state, type | Yes | Track the trend; a widening gap means acceptance without follow-through |

---

## Instrumentation Gaps, And The Smallest Fix

Three gaps, in order of what they cost:

1. **No read events.** Every funnel in `capabilities/momentum/metrics.md` that begins with a view or a search — `search → item opened`, `need viewed → vote`, `momentum impression → item opened` — is uncomputable here. *Smallest fix:* a separate telemetry sink, **not** `cycai_activity`. That table is the user-visible feed; writing impressions into it would flood the feed with noise and violate the design's own "no page-view vanity metrics as activity" rule. Either an Application Insights channel from the code app, or a distinct `cycai_signal` table read only by reporting.
2. **No participation data.** The routes, the table, and the activity phrasings exist; nothing calls them. This is a product gap, not a measurement gap — the metric arrives with the surface.
3. **No rebuild estimate on solutions.** Effort-avoided cannot be computed from stored data. *Smallest fix:* an optional numeric field on the Solution work item, filled at publication by the approver. Optional, because a required guess is worse than an absent one.

Not a gap: `cycai_momentum` stays unwritten. If a materialized rollup is ever introduced, it needs something that invalidates it — see `architectural-alignment.md`.

## Reporting Cadence

- **Monthly, one page:** weekly active contributors, submission rate, decision latency, pending backlog age, adoption coverage. These five detect all five failure modes in `business-alignment.md`.
- **Quarterly:** the full set, plus a qualitative read of *what* is being submitted — whether the hub is capturing reusable capability or being used as a second delivery backlog. No counter detects that.
- **On demand:** repeat-adoption list, for proposals and for practice reviews.

## Invariants
- Every KPI names its source table or field. A KPI whose source is "we'd have to add tracking" is listed as deferred, not as a target.
- Adoption is measured from explicit adoption records, never inferred.
- Attention metrics (views, sessions, dwell) are never reported as participation, and never written to the user-visible activity feed.
- Self-engagement — voting on, commenting on, or adopting one's own item — is excluded from engagement counts.
- Proposed baselines in this document are **proposed, not ratified**. They exist so the first quarterly review argues about the right numbers rather than inventing them under pressure.
- Measurement may influence Momentum weighting; it never mutates source-of-truth records.
- KPI computation lives on the read side (Analytics, Power BI, scheduled query), not in the app.

## Related Design
- `docs/design/capabilities/momentum/metrics.md` — the funnel and lifecycle model these measures implement.
- `docs/design/capabilities/momentum/engagement-model.md` — the records being counted.
- `docs/design/variants/code-app/business-alignment.md` — the outcomes these measures serve.
- `docs/design/variants/code-app/architectural-alignment.md` — why rollups are computed, not materialized.
- `docs/design/cross-cutting/observability` — instrumentation boundaries.
