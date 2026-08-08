# Momentum — Home Experience

## Purpose
Define the target homepage structure and the ten UI iterations that evolve the Innovation Hub homepage from a static enterprise portal into a fluid, lightly gamified innovation system. The existing information architecture is largely usable; this iteration focuses on behavior, motion, hierarchy, and the data needed to support them.

## Target Homepage Structure

The homepage converges toward:

```
Top Bar
  Innovation Hub                  + Contribute        User

Hero / Search
  Greeting
  Primary statement
  Search
  Minimal navigation shortcuts

Momentum Stage
  One visually dominant, kinetic surface
  Rotates through rising demand, active builds, adoption, contribution

Activity Rail
  Compact live stream of meaningful events

Opportunities
  Work where participation changes the outcome

Recently Shared / Discovery
  New solutions and needs with live evidence attached

Contributors
  Lightweight recognition grounded in real activity
```

The homepage should feel like one continuous system, not several dashboard widgets reporting similar information.

### Consolidate or remove
- "Happening around you"
- "Around Innovation Hub"
- standalone hero metrics when they duplicate Momentum
- repeated "recently shared" messaging across multiple surfaces

## New Information Hierarchy
The page communicates:

```
Demand → Participation → Execution → Adoption → Impact
```

Keep the existing shell, search, contribution entry point, opportunities, and discovery surfaces. Change the hierarchy so the focal point is changing organizational activity, and the rest of the interface remains comparatively calm. The experience must not depend on prose such as "Happening around you" to communicate activity.

## Iteration 1 — Establish the New Interaction Model

Move from "friendly community portal" to "live innovation system". Introduce the concept of a Momentum Stage immediately below the hero/search area. Do not yet rebuild every card or section.

**Success criteria:**
- the page has one obvious visual focal point;
- the focal point represents changing organizational activity;
- the rest of the interface remains comparatively calm;
- the experience no longer depends on prose such as "Happening around you" to communicate activity.

## Iteration 2 — Build the Momentum Stage

The Momentum Stage is the visual signature of Innovation Hub. It rotates slowly between a small number of meaningful states.

### State: Rising Demand
```
MODERNIZE PROPOSAL GENERATION
#2 requested      ↑ 4 positions
32 votes
+11 this week
```

### State: Active Build
```
IDENTITY MODERNIZATION
4 active implementations
● ● ● ●
3 teams participating
```

### State: Adoption
```
KNOWLEDGE INGESTION ACCELERATOR
Used in 8 projects
+3 this month
```

### State: Contribution
```
DOCUMENT INTELLIGENCE
6 contributors
12 contributions this month
```

### Interaction behavior
- automatic transition between a maximum of roughly 3–5 significant signals;
- hover/focus pauses motion;
- clicking the featured object opens the underlying item;
- user actions change the displayed numbers naturally;
- motion communicates state change rather than decorating the page.

### Visual behavior
Use the existing purple identity primarily for energy:
- ambient light / gradient movement;
- metric count transitions;
- rank movement;
- progress movement;
- avatar accumulation;
- subtle depth;
- brief glow when the current user causes a meaningful state change.

Avoid making every border, icon, and card purple.

## Iteration 3 — Add the Activity Rail

Replace the current vertical "Around Innovation Hub" feed with a compact horizontal activity rail.

```
Maya started Identity Modernization
    → Proposal AI gained 8 votes
    → Atlas adopted Knowledge Ingestion
    → Jordan contributed to Document Intelligence
```

### Behavior
- moves horizontally at a slow speed;
- fades at the left/right edges;
- pauses on hover/focus;
- new events can enter from the trailing edge;
- every event is navigable;
- only meaningful events qualify.

### Events worth surfacing
implementation started; implementation completed; adoption recorded; contribution accepted; solution published; backlog item promoted; significant vote/rank movement; milestone reached.

### Do not surface noise
page views; logins; routine edits; every comment; every vote as an individual activity item.

## Iteration 4 — Turn "Work That Needs People" into Opportunities

The existing cards contain useful information but rely too much on explanatory prose. The new surface answers: **Why does this need attention now?**

### Candidate signals
- #1 requested
- ↑ 12 votes this week
- 3 contributors needed
- Ready for review
- No owner
- 2 active implementations
- Closing this week
- High reuse potential

### Actions
For backlog work: Vote, Follow, Start, Contribute, Review. Only actions valid for the user's permissions and the item's current state appear.

### Example
```
MODERNIZE PROPOSAL GENERATION
Seeking contributors
21 votes       ↑ 7 this week
2 people exploring
Start →
```

The card is driven by current state and evidence rather than a paragraph explaining that participation is encouraged.

## Iteration 5 — Introduce Lightweight Game Mechanics

No arbitrary XP or points. The game is based on real work.

- **Demand** — votes, followers, recent vote velocity, relative demand rank.
- **Execution** — implementations started, active implementations, contributors, accepted contributions.
- **Adoption** — projects using a solution, teams using a solution, repeat use, recent adoption velocity.
- **Position** — `#3 most requested`, `#2 most adopted`, `↑ 4 this month`, `Top 10% by reuse`.

The most important gamification primitive is **relative movement** (e.g., `#7 → #5`). A user can see that legitimate participation changed the position of work.

## Iteration 6 — Upgrade Recently Shared into Discovery

Keep the discovery role of the current Recently Shared section, but attach one meaningful live signal to each item.

Examples:
```
Knowledge ingestion accelerator
Used by 8 projects   ↑ 3 this month

Reusable document intelligence
4 contributors   2 active implementations

Modernize proposal generation
31 votes   #2 requested
```

### Layout
Avoid a rigid grid where every item has identical visual weight. Allow the strongest current item to occupy a larger area:

```
┌──────────────────────────────┐ ┌──────────────┐
│                              │ │ Secondary    │
│     HIGH-MOMENTUM ITEM       │ ├──────────────┤
│                              │ │ Secondary    │
└──────────────────────────────┘ └──────────────┘
```

This gives the page a more editorial, fluid character without becoming visually chaotic.

## Iteration 7 — Make People Visible Through Contribution

Replace generic praise such as "People making an impact" with evidence of contribution.

```
CONTRIBUTORS                         This month

01  Dev
    3 contributions · 2 reviews

02  Alex
    2 implementations

03  Maya
    4 adoptions · 1 solution
```

### Avoid
crowns; podium graphics; "Innovation Champion"; arbitrary point totals; activity metrics that reward noise. Recognition is tied to work the organization values.

## Iteration 8 — Reward Moments

Micro-rewards occur when something meaningful changes. The reward is the state transition itself.

- **Vote** `27 → 28` — quick number roll and subtle energy pulse.
- **Implementation started** — an avatar joins the active implementation cluster: `● ● ● → ● ● ● ●`.
- **Adoption milestone** `9 → 10 implementations` — brief sweep/glow, then return to the normal interface.
- **Rank change** `#5 → #4` — animate the position change.
- **Publication** — a contribution transitions visibly: `Review → Shared`.

## Iteration 9 — Standardize the Motion System

Use a small motion vocabulary across the entire experience.

| Motion | Meaning |
|---|---|
| Fade / slide | new information entered |
| Count / roll | metric changed |
| Position shift | rank or ordering changed |
| Pulse / glow | user caused a meaningful update |
| Morph | lifecycle state changed |

The interface should feel fluid rather than "animated." Avoid perpetual bouncing, attention-seeking motion, or animation with no semantic meaning.

## Iteration 10 — Instrument the Experience

Before introducing more elaborate game mechanics, measure whether the current ones create useful participation. See `metrics.md` for the funnel and lifecycle-movement tracking.

## Search and Momentum Remain Separate
- Search answers: "Find the item I am looking for."
- Momentum answers: "What deserves attention now?"

Momentum must not depend on the search index. Search may eventually use lexical, semantic, or hybrid retrieval. Momentum remains a deterministic projection derived from organizational behavior. The two systems intersect only at presentation: search results plus live Momentum/adoption metadata.

## Invariants
- The homepage is one continuous system, not several dashboard widgets reporting similar information.
- The Momentum Stage is the single obvious visual focal point; the rest of the interface is comparatively calm.
- Motion is semantic: it communicates state change, not decoration.
- Only meaningful events appear in the Activity Rail.
- Opportunity actions are restricted to those valid for the user's permissions and the item's current state.
- Recognition and reward moments are grounded in real work, never arbitrary scores or noise.
- Search and Momentum are independent systems joined only at presentation.

## Related Design
- `docs/design/capabilities/momentum/index.md`
- `docs/design/capabilities/momentum/projections.md`
- `docs/design/capabilities/momentum/metrics.md`
- `docs/design/capabilities/search-and-discovery`
- `docs/design/platform/frontend`
