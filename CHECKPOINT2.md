# Checkpoint 2 — solution detail redesign, and what comes next

Written 2026-08-12, after the four-tab solution modal shipped to
`[Playground] AI Engineering` and was validated in dev.

---

## Part 1 — what was just built

Commit `baa6d5d` on `main`, 39 files, +4413/−693.

The solution detail modal was a single scrolling two-column surface with no tabs
and no editing. Its columns were also the wrong way round: the shared `.columns`
grid is `minmax(0,34%) minmax(0,66%)` with the main column first, so the
description, linked ideas, resources and adopters sat in the **narrow** column
while the comment thread took the wide one.

It is now four tabs — **Overview / Activity / Issues / Adoption** — with Overview
on its own `1fr / 380px` grid, content leading.

### New capabilities, and how they degrade

`issues` and `roadmap` are **optional sub-providers** on `SolutionsProvider`.
Absent means the host cannot serve them and the surface hides entirely.

The `undefined` vs `[]` distinction is load-bearing all the way up to `App.tsx`:

| Value | Meaning | UI |
|---|---|---|
| `undefined` | host cannot serve this | tab / section not rendered at all |
| `[]` | host answered, nothing yet | tab renders with an empty state |

`openSolution` maps a rejected `Promise.allSettled` entry to `undefined`, **not**
`[]`, and deliberately never routes it through `setError`. Collapsing the two
would tell every reader on the REST host that nobody has ever reported a bug
against anything.

### Azure DevOps

Provisioned against `CyclotronInc`, process `Innovation Backlog`
(`8d89406e-e03b-410c-baaa-45eabc738a87`), which serves **exactly two projects** —
`InnovationBacklog` and `InnovationBacklogDev` — out of 45 in the organization.
That is the blast radius of any future process change.

- **`Milestone`** — new work item type. Planned → In progress → Shipped, plus
  `Cancelled` as the soft-delete tombstone (the ADO client has no DELETE verb, so
  `deleteMilestone` moves the item to Cancelled and the list query filters it).
- **`Issue`** — Basic's inherited type, re-enabled. States are `To Do / Doing /
  Done`, used verbatim in the domain because state names are permanent in ADO;
  the UI maps them to Open / In progress / Done, which costs nothing and is
  reversible.
- **`Custom.InnovationBacklogTargetLabel`** (string) + the pre-existing
  `Microsoft.VSTS.Scheduling.TargetDate`. Two fields because a date cannot express
  granularity — "Q4 2026" is a quarter and "Sep 2026" a month, and no instant
  distinguishes them. The date orders the roadmap; the label prints it.

**Verified, so nobody re-litigates it:** a `Solution` *can* parent both an `Issue`
and a `Milestone` via `System.LinkTypes.Hierarchy-Reverse`, despite `Solution`
sitting on no backlog level and `Issue` sitting on the requirement level. ADO's
hierarchy rules govern backlog *display*, not whether a link may be created. Both
were created under Solution #4466 in `InnovationBacklogDev` and deleted again.

Parent rather than Related is deliberate: `createWorkItemFacts` counts **every**
Related link as a linked idea, so a Related child would have made
`SolutionRollup.linkedNeeds` start lying.

**Accepted trade-off:** `Issue` carries Basic's
`System.RequirementBacklogBehavior` and an inherited type cannot be detached from
an inherited behavior, so adopter-reported issues appear on the delivery backlog
alongside `Backlog Item`. The alternative was a custom `Solution Issue` type,
which would have kept feedback off the boards at the cost of claiming another
permanent org-wide work item type name.

### Three pre-existing bugs found on the way

1. **`PATCH /api/solutions/{id}` fell through to `getSolution`** and returned HTTP
   200 with the unchanged record. Every description or tag save would have
   reported success for a write that never happened.
2. **The ADO provider never called `normalizeTags`.** The 8-tag / 32-char cap
   existed only in the memory provider, and `ContributeModal`'s comment claiming
   tags were "normalized server-side" was false for the only host that exists.
   `normalizeTags` now lives in `domain/tags.ts`, gained the trailing trim
   `TagList.cs` already had, and strips the `;`/`,` that `System.Tags` cannot
   round-trip.
3. **Writing tags back naively would have destroyed every `pipeline:` tag**,
   because `toSolution` strips namespaced tags before the UI ever sees them.
   `updateSolution` now read-modify-writes.

### Not a security boundary

`canEditSolution` (owner or reviewer) gates the affordance and the provider's own
check, and nothing more. Unlike visibility (area-path ACLs) and decisions (a
process rule), nothing enforces it server-side: ADO lets any contributor edit any
work item in an area they can write to, and no process rule can express "the
person named in `System.AssignedTo`". Same applies to issue triage.

---

## Part 2 — the backlog from dev validation

### 1. Tab strip has no spacing — **defect, mine, not yet fixed**

Renders as `OverviewActivity 10Issues 1Adoption 5`.

`ModalShell.module.scss` puts `gap: 24px` on `.tabStrip`, but `SolutionTabs`
renders its own `<div role="tablist">` inside that wrapper — so the gap applies to
one single child, not to the buttons. The `role="tablist"` element needs to be the
flex container, or the gap has to move onto it.

Fix in `SolutionTabs.tsx` / `ModalShell.module.scss`. One line either way.

### 2. "Start using this" is redundant now there is an Adoption tab

The header still carries the primary action from the pre-tab design, and the
Adoption tab has its own **+ Record an adoption** which opens the *same*
`pane === "adopt"` overlay. Two triggers, one pane, both visible at once on
Overview.

Options, in rough order of preference:

- Drop the header button; let Adoption own it. Costs a click from Overview, and
  loses the primary-action prominence for the single most important verb on the
  page.
- Keep the header button but make it tab-aware — hide it while the Adoption tab
  is active, since the tab already offers it.
- Keep the header button and remove the in-tab one. Loses the affordance exactly
  where someone is looking at the list of adopters and thinking "I should add
  mine".

Worth deciding alongside the `✓ You are using this` chip, which is already
best-effort (see "known soft spots" below).

### 3. The Idea modal should adopt the same structure

`RequestPanel` still uses the old shared `.columns` grid — including the inverted
34/66 split, with the conversation in the wide column. The solution modal no
longer uses `.columns` at all, so `RequestPanel` is now its only consumer.

This was left deliberately out of scope: `.columns` was **not** flipped in the
redesign precisely because `RequestPanel`'s wide column *is* its conversation, and
shrinking that to 380px would be a regression rather than a fix. An idea is a
different kind of object from a solution — it is mostly discussion, where a
solution is mostly substance.

So this is not a straight copy. What an Idea plausibly wants:

- **Overview** — what it is, tags, linked solutions, who is contributing, votes.
- **Activity** — the conversation, which is the centre of gravity for an idea and
  should probably stay visible rather than moving behind a tab.
- Possibly **Backlog** — the `Backlog Item` children, which already exist and are
  already parented to the Idea. Nothing has ever surfaced them.

Everything needed is already reusable: `ModalShell`'s `tabs` / `overlays` slots,
`SolutionTabs` + `TabPanel` (would need generalising off the `SolutionTab` union),
`DescriptionEditor`, `TagEditor`, `GlanceStats`, `solutionTone`.

`updateIdea` already exists on `IdeasProvider` (title + description) but has **no
tag path** — adding tag editing to ideas needs the same `UpdateIdeaInput.tags`
work `UpdateSolutionInput` just got.

### 4. Add a `Skill` solution type — schema now, UI later

Explicitly: **provision and model it, but do not show it in the picker yet.**

`SOLUTION_KINDS` in `packages/logic/src/domain/solution.ts` is the single registry
the intake form is generated from, so adding a kind is one entry there rather than
a new branch in the form:

```ts
{ id: "Skill", label: "Skill", description: "...", requires: [...] }
```

What `requires` should hold is the open question. `Strategy` requires `demo`,
`CustomSolution` requires `repository`. A skill is neither — it is a folder in the
skills repository (`plugins/{segment}/skills/{solutionId}__{name}/SKILL.md`, see
`Provision-SkillsRepository.ps1`, which is **parallel work in flight**). It may
need a new `SolutionRequirement` value, or none at all.

Three places must agree, and two of them are permanent:

1. `SOLUTION_KINDS` (TS) — free to change.
2. The **ADO picklist** behind `Custom.InnovationBacklogSolutionType`, created by
   `Provision-AdoProcess.ps1`. Picklist *values* can be added; the field's name and
   type cannot change.
3. `SolutionType` in `src/Momentum.Library/.../Solutions/SolutionStatus.cs`, which
   is **already stale** — it still declares the old taxonomy
   `Library | Service | Template | Application | Pattern | Other`. TS and the ADO
   picklist both moved to `Strategy | CustomSolution`; the C# enum never did. Worth
   fixing in the same pass rather than adding a third divergence.

To keep it out of the UI while it exists in the schema, the picker needs to filter
`SOLUTION_KINDS` rather than render all of it — a `hidden?: boolean` on
`SolutionKindSpec` is the smallest honest way to say that.

### 5. Tag input should be pills, not a comma-separated string

Both submission forms. `ContributeModal.tsx` currently has a bare
`<input name="tags" />` and parses it on submit with `parseTags(...)`. The reader
gets no feedback until after the record is created, cannot remove one tag without
editing a string, and never sees the 8-tag cap until it silently truncates them.

**`TagEditor` already does exactly this** —
`packages/ui/src/Components/SolutionPanel/TagEditor.tsx`. It renders removable
pills via `TagList`'s `onRemove`, has an add-input with Enter-to-commit and
Backspace-to-remove-last (guarded on an empty field so it cannot fire mid-word),
and shows the `MAX_TAGS` limit.

It is currently coupled to an async `onSave` because it saves optimistically
against a live record. Intake has no record yet, so it needs a controlled variant
— `value` / `onChange` — with the async save layered on top rather than baked in.
Move it to `Components/TagEditor/` when that happens; it is no longer
solution-specific.

### 6. Solution type should be a dropdown, not big blocks

`ContributeModal` renders `SOLUTION_KINDS` as `styles.kindOption` cards with
label + description. With two options that is already heavy for what is one field
among five; with `Skill` added it gets heavier.

A `<select>` with the description shown beneath the chosen option keeps the
guidance without spending a third of the form on it. The description text is
already in the registry (`SolutionKindSpec.description`) so nothing is lost.

Note this interacts with item 4: the dropdown must render **filtered**
`SOLUTION_KINDS`, so `Skill` can exist in the schema without appearing.

---

## Known soft spots in what shipped

- **`✓ You are using this` is best-effort.** `Adoption.startedBy` is a Dataverse
  `systemuserid` GUID while `CurrentUser.id` is a UPN — two id spaces that cannot
  be joined client-side (see `CHECKPOINT.md`) — so it falls back to matching the
  resolved display name. It is deliberately a badge and never gates an action: a
  primary button that occasionally lies about what it will do is far worse than a
  badge that occasionally goes missing.
- **Nothing was verified at runtime by me before the push.**
  `createOfflineProvider` exists in `provider/index.ts` but **has no callers
  anywhere** — there is no wired-up no-backend mode to click through. Worth
  wiring: it would make every future UI change reviewable with no tenant.
- **`@momentum/contracts` fails its build** on a `pnpm generate` codegen step.
  Pre-existing, unrelated, git status clean. Several drift guards
  (`ParticipationResponse`, `PendingLinkResponse`, `InsightsResponse`) stay
  hand-declared until it is regenerated.
- **`ModalShell` has no focus trap** and sets no initial focus. Pre-existing,
  affects `RequestPanel` equally.
- **`cycai_momentum` is still dead** — nothing writes it, rollups are computed
  live. The table and its alternate key remain in the schema.

## Suggested order

1. Tab-strip gap — trivial, and it is visibly broken right now.
2. Tag pills in intake (item 5) + solution-type dropdown (item 6) — same file,
   same sitting, immediate quality win on the surface everything enters through.
3. `Skill` kind (item 4) — schema and picklist only, hidden in UI. Coordinate with
   the skills-repository work already in flight.
4. "Start using this" placement (item 2) — a decision, then a small change.
5. Idea modal restructure (item 3) — the largest, and the one that most benefits
   from the intake work above landing first.
