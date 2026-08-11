# Variant — Power Platform Code App

## Purpose
Describe the Innovation Hub as delivered inside a **Power Apps Code App**, running on **Azure DevOps** work items and **Dataverse** engagement tables, with no Momentum backend present. This document states what the variant is, what it owns, what it deliberately does not own, and where it narrows the product. The justification for the platform choice, its alignment to the system design and to the business, and the measures it is answerable for are in the deeper documents.

## Context In One Paragraph
The buyer already runs Azure DevOps for delivery work and Microsoft 365 / Power Platform for internal applications. They have no appetite for a new hosted service, a new identity provider, a new datastore, or a new operational surface to run an internal innovation backlog — the workload does not justify any of them. The code app variant delivers the identical product into infrastructure that is already funded, already governed, already authenticated, and already where the work lives. **The ideas and solutions are work items, because the delivery they turn into is work items.**

## Owned Responsibilities
- Mounting the shared `<App/>` inside the Power Apps host with the user resolved before mount.
- One provider implementation (`InnovationBacklogProvider`) over two substrates: Azure DevOps for items, state, links, comments, and permissions; Dataverse for votes, adoption, participation, and activity.
- Translating the shared UI's route-string seam onto that typed provider (`provider/callTool.ts`).
- Recording engagement activity that no backend is present to record (`provider/activity-recorder.ts`).
- Computing engagement rollups live from source rows (`provider/dataverse/rollups.ts`).
- Resolving role from Azure DevOps effective area-path permissions (`provider/ado/role.ts`).
- Reading its own environment configuration from Dataverse environment variables (`provider/environment.ts`).

## Explicit Non-Responsibilities
- Business rules, lifecycle, and vocabulary — owned by `docs/design/capabilities/`, identical across variants.
- UI composition — owned by `@momentum/ui`. This variant contributes no pages.
- Authorization decisions — enforced by Azure DevOps rules and area-path ACLs, and by Dataverse security roles.
- Agent execution, triage, publication, and GitHub projection — none of these exist in this variant (see **Stated Gaps**).
- Provisioning, seeding, and environment values — `scripts/provisioning/` and `CHECKPOINT.md`.

## Current Architecture

```
Power Apps host (Entra-authenticated)
        │
        ▼
  apps/code-innovation-backlog
        │  App.tsx           resolve user → mount
        │  callTool.ts       route strings → typed provider   ← the only host-specific seam
        ▼
  provider/  (one adapter, two folders)
        ├── ado/          items, state, links, comments, role
        └── dataverse/    votes, adoption, participation, activity, identity
        │
        ▼
  @momentum/ui  <App/>      ← identical to the hosted web variant
```

Substrate split, and why the line falls where it does:

| Concern | Store | Reason |
|---|---|---|
| Ideas, Solutions, Backlog Items | Azure DevOps work items | The delivery record already lives there; state, revisions, links, and queries are native. |
| State transitions and approval gates | Azure DevOps process rules | Governance is enforced by the platform, not by app code. |
| Comments | Native work item comments | Discussion belongs on the item, visible to people who never open the hub. |
| Role | Azure DevOps effective area-path permissions | The ACLs are what actually enforce access; Graph is unreachable from a code app. |
| Votes, adoption, participation, activity | Dataverse (`cycai_*`) | Engagement is not delivery work; modelling it as work items would pollute the delivery record. |
| Configuration | Dataverse environment variables | Environment-specific values move with the solution, not with the build. |

## Invariants
- The shared `<App/>` is mounted unmodified. If a surface cannot work here, the fix is in the provider or in the shared UI, never in a code-app page.
- The signed-in user is resolved **before** `MomentumContextProvider` mounts; the provider seeds state with `useState(initialUser ?? null)` and ignores a later user.
- The variant never falls through to `<App/>`'s signed-out branch — it links to `/api/auth/login`, which the Power Apps host answers with `RouteNotFound`. Entra has already authenticated the user.
- Route strings exist in exactly one file. Everything beneath `callTool.ts` is typed.
- Engagement counts are computed from the rows that record the engagement. `cycai_momentum` remains **unwritten**: a cache nothing invalidates is worse than no cache.
- Activity recording is best-effort and decorates the provider from the outside — a failed feed write never fails the user's operation, and nothing is recorded for a mutation that threw.
- Connector calls resolve `{success: false}` rather than throwing; every call is checked (`unwrap()`).
- Vocabulary translation happens at the seam (`hubItemType()`), not by casting. The shared UI says `Request`; the domain says `Idea`.
- Submitted repositories stay read-only, as in every variant.

## Stated Gaps
Declared, not hidden — a variant may narrow the product, but the narrowing is part of the design.

| Gap | Consequence | Cause |
|---|---|---|
| No triage worker | `createIdea` transitions straight to `Awaiting Approval`; no automated evidence is attached. | Nothing executes background work behind a code app. |
| No agent execution | No duplicate detection, no repository analysis, no classification. | Same. |
| No GitHub projection | The catalog is not published as a README to a managed hub repo. | Same. |
| No private triage surface | Comments are public ADO work item comments, so triage findings have nowhere to live. | Native comments were chosen deliberately. |
| Author cannot see their own approver-restricted idea | `ItemVisibility.Approvers` means "approvers, admins, and the author", but area-path ACLs have no owner exception. | Substrate limitation; the data never arrives. |
| No participation UI | Routes and activity phrasings exist; nothing calls them. | Product gap, not substrate. |
| Solutions cannot be edited; tags cannot be edited | No `updateSolution` on the contract; `UpdateIdeaInput` is title/description only. | Product gap, not substrate. |
| Links are never pending | `linkSolution` requires a reviewer, so the creator is the approver. | Product gap, not substrate. |

The first four are substrate consequences and are the honest price of the variant. The rest are product gaps that affect the hosted variant equally.

## Contracts
- **In:** Entra-authenticated Power Apps session; Azure DevOps connector (`shared_visualstudioteamservices`, `EntraOAuth`); Dataverse connector (`shared_commondataserviceforapps`); Dataverse environment variables for organization, project, and environment designation.
- **Out:** Azure DevOps work item creates, patches, state transitions, links, comments; Dataverse rows in `cycai_vote`, `cycai_adoption`, `cycai_participation`, `cycai_activity`.
- **Interfaces:** `InnovationBacklogProvider` (typed, in `@innovation-backlog/logic`) and `IService.callTool` (route strings, consumed by `@momentum/ui`).
- **Not produced:** domain events, queue messages, agent runs, GitHub commits.

## Related Design
- `docs/design/variants/index.md` — what a variant is.
- `docs/design/system/authority-model.md` — system authority and one-way projection.
- `docs/design/capabilities/momentum/engagement-model.md` — the engagement records this variant persists.
- `docs/design/cross-cutting/identity-and-access` — who acts on the system.
- `docs/design/platform/frontend/shared-packages.md` — the shared UI this variant mounts.

## Deeper Documents
- `platform-fit.md` — why this platform, and what was rejected.
- `architectural-alignment.md` — how the variant honours the system design.
- `business-alignment.md` — the outcomes the variant is bought for.
- `kpis.md` — usage, adoption, and engagement measures, and what is measurable today.
