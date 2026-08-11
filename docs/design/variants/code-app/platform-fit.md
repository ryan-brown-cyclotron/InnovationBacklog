# Code App Variant — Platform Fit

## Purpose
Justify the platform. Not "Power Platform is good" — the specific claim that for **this** context, a Power Apps Code App over Azure DevOps and Dataverse is the correct substrate, and that the obvious alternatives are worse. A platform choice that cannot name what it rejected is a preference, not a decision.

## The Context That Decides It

Five facts about the operating context do the work:

1. **The work already lives in Azure DevOps.** Ideas become backlog items become delivery. If the hub is a separate store, every accepted idea is re-keyed by hand into the place delivery actually happens, and the hub becomes a graveyard within a quarter.
2. **The users are already authenticated.** Microsoft 365 / Entra is the identity plane. A second identity provider is an onboarding cost, a support cost, and a security review, for zero user-visible benefit.
3. **The workload is small and bursty.** An internal innovation backlog serves tens to low hundreds of people with intermittent traffic. It cannot justify a container app, a queue, a worker, and the on-call that comes with them.
4. **There is no team to operate a service.** The buyer is a consulting firm; its engineers are billable. Every hour spent operating an internal service is an hour not sold. The winning architecture is the one with no operations.
5. **Governance already exists and is trusted.** ADO process rules, area-path ACLs, and group membership are the controls the organization already audits. Reimplementing approval gating in application code means asking for a second audit of a weaker control.

Any platform choice that ignores fact 1 produces a hub nobody trusts. Any choice that ignores facts 3–4 produces a hub nobody keeps running.

## The Decision

**Mount the existing product as a Power Apps Code App, over Azure DevOps for delivery truth and Dataverse for engagement.**

A Code App — rather than a canvas or model-driven app — because the product already exists as a React application and the governing requirement is that the two hosts stay identical. A canvas app cannot mount `<App/>`; it would mean rebuilding every page and accepting permanent drift. The Code App is the only Power Platform shape that lets the shared UI ship unchanged.

## Why Each Substrate

### Azure DevOps for items, state, links, comments, and permissions
Ideas and Solutions are work items in an inherited process (`Innovation Backlog`, from Basic), with two custom fields (`Custom.InnovationBacklogSolutionType`, `Custom.InnovationBacklogDecisionRationale`).

What this buys, none of which is application code:

- **Continuity.** An accepted idea is already in the backlog; there is no export step, no reconciliation, no second identifier for the same thing.
- **Governance for free.** Approval gating is a process rule with a group condition, not an `if` statement. Rationale is a required field on transition, enforced by the platform.
- **Audit for free.** Revisions, `System.ChangedBy`, and state history are native and already retained under existing policy.
- **Reach.** Comments are native work item comments, so discussion is visible to delivery people who never open the hub.
- **Query.** WIQL answers the catalog and visibility queries without building a read model.

Cost, paid knowingly: `System.State` cannot be set on create (create, then patch); org-scope custom fields are organization-wide in a tenant with ~45 live client projects, so every schema write requires read-only recon first; and the ACL/group-membership split has two sources of truth that must be kept in step.

### Dataverse for engagement
Votes, adoption, participation, and activity are **not** delivery work. Modelling them as work items or work item tags would pollute the delivery record with signals that have nothing to do with delivery, and would make "how many teams adopted this" a query over comment text.

Dataverse buys: a real relational store with typed columns and choices; per-row security under the same Entra identity; alternate keys for idempotent writes; schema that promotes through the same solution the app promotes through; and no operational surface at all.

Cost, paid knowingly: alternate-key creation is async and must be polled to `Active`; lookup display names are not returned without annotations, so names are resolved via a batched `systemuser` read; and `$apply`/`groupby` is not exposed by the SDK's options, so rollups group client-side over a filtered fetch.

### Entra via the Power Apps host for identity
No sign-in screen, no token handling, no session store, no `/api/auth/login`. The user is authenticated before the app loads. The variant's only identity work is resolving that user to a Dataverse `systemuser` and a role — and the role comes from the ACLs that already enforce access.

## Alternatives Rejected

| Alternative | Why rejected |
|---|---|
| **Deploy the hosted variant** (`Momentum.Service` + Azure Tables + Worker + Auth0) | Correct product, wrong operating model for this buyer. Adds a container app, a queue, a Functions worker, a second identity provider, and an on-call rotation, to serve intermittent internal traffic. Also re-keys every accepted idea into ADO by hand. |
| **Canvas or model-driven Power App** | Cannot mount the shared UI. Guarantees two divergent experiences and doubles every future change. An earlier attempt at bespoke code-app pages was deleted for exactly this reason. |
| **Azure DevOps alone** (work items, boards, queries, dashboards) | No engagement model. Votes, adoption, and participation have nowhere to live except tags and comment text; "used by 8 projects" becomes unanswerable. Also the wrong front door: submitting an idea should not require a delivery tool's intake form. |
| **Dataverse alone** (model-driven app over `cycai_*`) | Duplicates the delivery record. Every accepted idea becomes a row that must be synchronized into ADO, and the synchronization is the whole project. |
| **SharePoint lists + SPFx** | Viable for the list, not for the governance. Approval gating, state rules, revision history, and area-path authorization would all become application code, and the audit story weakens. (Retained as a deployment note only — `docs/deployment/sharepoint/`.) |
| **Third-party idea-management SaaS** | New vendor, new identity integration, new data residency question, and the delivery record still lives somewhere else. Solves the smallest part of the problem. |

## Consequences Accepted

- **No background execution.** Triage, agents, and GitHub projection do not exist in this variant. Anything requiring a worker is out of scope until one is introduced (a Power Automate flow or an Azure Function reading Dataverse are the two candidates).
- **Two sources of truth for authority.** ADO process rules check group membership; role resolution checks area-path ACLs. They diverged once already. Nesting Project Administrators into the Approvers group is the standing recommendation.
- **Schema writes carry organizational blast radius.** Field reference names and picklists are org-wide across ~45 client projects. Every write is preceded by read-only recon.
- **Engagement rollups are computed per page load.** Bounded — two Dataverse queries and one ADO batch regardless of row count — but not free, and the precomputed table is deliberately left unwritten rather than left stale.

## Invariants
- The platform is chosen for the deployment context, and the context is stated. If the context changes — a team to operate a service, a need for agent triage, an external audience — the variant is re-argued, not stretched.
- Delivery truth lives in Azure DevOps; engagement lives in Dataverse. Neither store takes on the other's responsibility.
- Governance is enforced by platform controls that already exist, not by application code that reimplements them.
- The shared UI ships unchanged. A platform constraint that forces a bespoke page invalidates the variant, not the UI.

## Related Design
- `docs/design/variants/code-app/index.md`
- `docs/design/variants/code-app/architectural-alignment.md`
- `docs/design/system/authority-model.md`
- `docs/design/cross-cutting/visibility-and-authorization`
- `docs/design/platform/frontend/applications.md`
