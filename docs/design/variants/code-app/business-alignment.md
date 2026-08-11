# Code App Variant — Business Alignment

## Purpose
State what the variant is bought for, who it serves, and what would make it a failure. A platform that cannot say which business outcome it moves is a cost centre with a nice UI.

## The Business It Serves

A consulting firm selling AI and low-code delivery — Power Platform, Copilot and agents, Azure AI, Dataverse, document intelligence, RAG, accelerators, governance and CoE tooling. Its economics are straightforward:

- Revenue is billable hours against fixed or capped engagements.
- Margin is the gap between estimated effort and actual effort.
- The single largest lever on that gap is **reuse**: shipping an engagement from an existing accelerator instead of building it again.
- The firm's durable asset is not any one engagement; it is the accumulated set of solutions it can redeploy.

The consistent failure is that this asset exists but is unfindable. Work is built once per engagement, in a client's project, by whoever was staffed, and is never seen again. The next engagement rebuilds it, unaware. Nobody is at fault and everybody pays.

## The Outcome Chain

```
capture          an idea or an existing solution is recorded where the work already lives
  ↓
signal           peers vote, comment, and ask to participate — demand becomes visible
  ↓
govern           approvers accept or reject with a recorded rationale
  ↓
publish          accepted work enters a searchable catalog
  ↓
reuse            another team adopts it on a named project
  ↓
evidence         adoption is recorded, making reuse provable rather than anecdotal
```

Every step is instrumented. `kpis.md` measures the chain step by step, because the value is realized at **reuse**, and a hub that is busy at *capture* and empty at *reuse* is failing regardless of how much activity it shows.

## What Each Stakeholder Gets

| Stakeholder | What they get | What they would otherwise do |
|---|---|---|
| **Delivery consultant** | Search before you build. "Has anyone solved this?" answered in one place, with an owner to ask. | Rebuild, or ask in a chat channel and hope. |
| **Solution author** | Their work is visible, attributed, and adopted — reuse is a career signal, not an invisible favour. | Ship it into a client repo and move on. |
| **Practice lead / approver** | A queue of what the firm is proposing to invest in, with a recorded decision and rationale on each. | Ad-hoc decisions in meetings, unrecorded. |
| **Sales / pre-sales** | Provable reuse: "used by 8 projects" is a proposal claim with a record behind it. | Assertions without evidence. |
| **Leadership** | Where innovation effort is going, what it produced, and whether it was used. | Anecdote. |

## Why This Variant Serves It Better Than The Hosted One

The business case is fragile in a specific way: **the hub must cost nothing to run and must sit where the work already is.** A separate service fails on both counts — it needs an operator, and it needs the ideas re-keyed into ADO by hand once accepted, which is where these systems die.

The code app removes both failure modes. There is no service to operate, and an accepted idea is already a work item in the delivery backlog because it never left. That is the entire commercial argument for the variant, and it is why the platform choice in `platform-fit.md` is a business decision as much as a technical one.

## Cost Position

- **Run cost:** no compute, no datastore, no identity provider beyond what the firm already licenses. Azure DevOps and Power Platform are already funded.
- **Operate cost:** no on-call, no deployment pipeline for a service, no patching. Promotion is a solution import and `pac code push`.
- **Build cost:** one adapter over a UI that already exists — the variant contributes no pages.
- **Marginal cost per user:** an existing ADO and Power Platform licence.

The variant is therefore justified by a comparatively small reuse benefit. It does not need to change the firm's economics to pay for itself; it needs to prevent a handful of rebuilds a year.

## What Would Make It A Failure

Named plainly, because these are the outcomes the KPIs are designed to detect early:

1. **A graveyard.** Ideas accumulate, nothing is decided, nothing is published. Detected by decision latency and the accepted-to-published ratio.
2. **A one-person hub.** A small number of enthusiasts submit everything and nobody else engages. Detected by contributor breadth.
3. **A catalog nobody reuses.** Solutions are published and never adopted. Detected by adoption coverage and time-to-first-adoption — this is the failure that voids the business case, and the one to watch hardest.
4. **A duplicate of the delivery backlog.** The hub is used to track delivery work rather than to capture and reuse capability. Detected by the shape of what is submitted, not by a counter — a qualitative review belongs in the quarterly read.
5. **Uncontested acceptance.** Everything is accepted, so acceptance means nothing and the catalog fills with unvalidated claims. Detected by the rejection rate being at or near zero.

## Governance Alignment

The firm already audits Azure DevOps permissions and Microsoft 365 identity. This variant adds no new control plane: approval is an ADO process rule with a group condition, rationale is a required field on the transition, and access is area-path ACLs. The recommendation standing from implementation — nest Project Administrators into the Approvers group — exists because two authority sources diverged once, and a governance story with two sources of truth is one incident away from being untrue.

Content sensitivity is real and bounded: the organization's Azure DevOps tenant contains ~45 live client engagements. Ideas and solutions are firm-internal capability, not client deliverables, and the hub's work items live in dedicated projects. This is a hard constraint on schema changes as much as on content — see `CHECKPOINT.md` §1.

## Invariants
- The variant is justified by reuse, and reuse is measured at adoption, not at submission.
- Capture must cost the contributor less than the alternative of not capturing. Any intake change that adds friction is measured against submission rate before it ships.
- Decisions are recorded with rationale; an accepted item without a stated reason is not governance.
- Adoption is an explicit record. It is never inferred from votes, comments, or completed work — inferred reuse is not evidence.
- Client-confidential material does not enter the hub; the hub holds firm capability.

## Related Design
- `docs/design/variants/code-app/kpis.md`
- `docs/design/variants/code-app/platform-fit.md`
- `docs/design/capabilities/momentum/engagement-model.md`
- `docs/design/capabilities/solution-catalog/index.md`
- `docs/design/capabilities/approvals/index.md`
