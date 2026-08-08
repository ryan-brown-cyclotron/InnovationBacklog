# MCP — Tool Surface vNext

## Purpose
Define the target Momentum MCP surface as a coherent language of business capabilities for agents and humans. This document is normative for vNext design; it does not assert that every listed tool is implemented.

The current surface primarily supports:

```text
CREATE -> READ -> COMMENT -> APPROVE/REJECT
```

The target surface supports the broader Momentum lifecycle:

```text
DISCOVER -> UNDERSTAND -> RELATE -> CONTRIBUTE -> TRIAGE -> REVIEW -> PROMOTE -> REUSE
```

## Design Principles
- Tools express outcomes a caller is trying to accomplish, not storage operations.
- Published backlog and catalog records are created through governed submission lifecycles, never direct CRUD tools.
- Tools return capability-shaped contracts with stable identifiers and explicit artifact types.
- Authorization, ownership, audience filtering, and visibility are enforced server-side.
- Inferred relationships and agent analysis are evidence; deterministic application code remains authoritative.
- MCP apps compose tools into human workflows and introduce no independent business API or authority.

## Common Contracts
Polymorphic item and search results carry an explicit `type` (`submission`, `backlog`, or `solution`) and stable `id`. Collection tools use bounded `limit` and continuation-based pagination where needed. Search and relationship results may include a normalized relevance or confidence score from `0` to `1` plus a human-readable reason.

Errors are structured and distinguish invalid input, not found, conflict, and authorization failures. Tool availability by role does not replace resource-level ownership and visibility checks.

## Discovery

### `search_catalyst`
Search published backlog and catalog items without requiring the caller to predict the artifact type.

- Inputs: `query`; optional `types`, `status`, `tags`, `limit`, and continuation token.
- Output: ranked typed result summaries with IDs, titles, summaries, scores, and collection-specific metadata.
- Authorization: authenticated user; results are visibility-filtered.
- Side effects: none.
- Delivery: new unified application query over existing specialized search capabilities.

### `search_backlog`
Search published backlog items with backlog-specific filters.

- Inputs: `query`; optional status, tags, pagination, and backlog filters.
- Output: ranked backlog item summaries.
- Authorization: authenticated user; results are visibility-filtered.
- Side effects: none.
- Delivery: currently implemented; retain for richer filtering.

### `search_catalog`
Search published catalog items with solution-specific filters.

- Inputs: `query`; optional classification, tags, pagination, and catalog filters.
- Output: ranked catalog item summaries.
- Authorization: authenticated user; results are visibility-filtered.
- Side effects: none.
- Delivery: currently implemented; retain for richer filtering.

### `get_item`
Resolve and read a submission, backlog item, or catalog item without prior knowledge of its type.

- Inputs: `id`; optional `include_relationships` and `include_activity`.
- Output: a typed item envelope with only fields visible to the requester.
- Authorization: authenticated user plus item-level visibility and ownership rules.
- Side effects: none.
- Delivery: new polymorphic application query over capability-owned readers.

### `find_related`
Find likely related Momentum items from an item or free text.

- Inputs: exactly one of `item_id` or `text`; optional `relationship_types`, `types`, and `limit`.
- Output: typed related-item summaries with relationship type, confidence, and reason.
- Authorization: authenticated user; source and results are visibility-filtered.
- Side effects: none. Results are inferred evidence and are not persisted relationships.
- Delivery: requires relationship query and ranking support.

## Contribution

### `create_backlog_submission`
Create a governed contribution for a business need or opportunity.

- Inputs: the backlog submission contract.
- Output: the created submission and lifecycle status.
- Authorization: authenticated user.
- Side effects: persists a submission and starts the configured asynchronous lifecycle.
- Delivery: currently implemented.

### `create_solution_submission`
Create a governed contribution for an existing solution repository.

- Inputs: the solution submission contract.
- Output: the created submission and lifecycle status.
- Authorization: authenticated user.
- Side effects: persists a submission and starts the configured asynchronous lifecycle.
- Delivery: currently implemented.

### `get_submission`
Read the richer submission-specific contract used by contribution and review workflows.

- Inputs: `submission_id`.
- Output: the submission with requester-visible lifecycle and assessment fields.
- Authorization: authenticated user plus submission visibility rules.
- Side effects: none.
- Delivery: currently implemented; retained alongside `get_item` for precise tool selection.

### `update_submission`
Update a submission while its lifecycle permits submitter changes.

- Inputs: `submission_id`, expected version, and type-specific editable fields.
- Output: the updated submission and lifecycle status.
- Authorization: owning submitter, subject to lifecycle and concurrency checks.
- Side effects: persists an audited update.
- Delivery: application capability exists; MCP exposure and contract are required.

### `withdraw_submission`
Withdraw a submission before a terminal governance or publication state.

- Inputs: `submission_id`; optional reason and expected version.
- Output: the withdrawn submission and lifecycle status.
- Authorization: owning submitter, subject to lifecycle checks.
- Side effects: persists an audited lifecycle transition.
- Delivery: requires an explicit domain transition and application command.

### `list_my_submissions`
List submissions owned by the current user.

- Inputs: optional type, status, pagination, and sort filters.
- Output: requester-owned submission summaries.
- Authorization: authenticated user; identity is derived from the request, never an input user ID.
- Side effects: none.
- Delivery: existing repository/application query requires MCP exposure.

## Collaboration

### `list_comments`
List comments visible to the requester for an item.

- Inputs: `item_id`; optional pagination.
- Output: ordered comments after audience filtering.
- Authorization: authenticated user plus item and audience visibility rules.
- Side effects: none.
- Delivery: existing application capability requires MCP exposure.

### `add_comment`
Add an audience-scoped comment to a submission.

- Inputs: `submission_id`, body, and permitted audience.
- Output: the created comment.
- Authorization: authenticated user; permitted audiences depend on role.
- Side effects: persists an audited comment.
- Delivery: currently implemented.

### `get_item_activity`
Return a reusable timeline of requester-visible lifecycle events, comments, analysis milestones, and decisions.

- Inputs: `item_id`; optional activity types and pagination.
- Output: chronologically ordered, typed activity entries.
- Authorization: authenticated user; activity and embedded content are audience-filtered.
- Side effects: none.
- Delivery: existing audit reads require a normalized item timeline query and MCP exposure.

## Triage

### `analyze_submission`
Read the latest validated, persisted analysis for a submission.

- Inputs: `submission_id`.
- Output: duplicate candidates, related backlog and catalog items, repository observations when applicable, completeness assessment, evidence, timestamps, and analysis status.
- Authorization: authenticated users receive only requester-visible observations; internal evidence remains approver-only.
- Side effects: none. The tool never invokes an agent synchronously and never enqueues a refresh.
- Delivery: requires persisted analysis to be queryable by submission.

## Governance

### `list_review_queue`
List submissions awaiting action by an authorized reviewer.

- Inputs: optional submission type, status, age, submitter, sort, and pagination filters.
- Output: review summaries with requester-visible analysis indicators.
- Authorization: approver or administrator.
- Side effects: none.
- Delivery: existing approval inbox requires a stable MCP contract and richer filters.

### `get_review`
Read the composed review context for one submission.

- Inputs: `submission_id`.
- Output: submission, latest persisted analysis, inferred relationships, visible comments, activity, and decision history.
- Authorization: approver or administrator; all embedded data remains audience-filtered.
- Side effects: none.
- Delivery: new application query composed from capability-owned readers.

### `decide_submission`
Record the authoritative reviewer decision for a submission.

- Inputs: `submission_id`, `decision` (`accept`, `reject`, or `request_changes`), comment or rationale, and expected version.
- Output: the recorded decision and resulting submission status.
- Authorization: approver or administrator.
- Side effects: records one audited decision and performs the deterministic lifecycle transition.
- Delivery: requires a unified application command and a request-changes transition. In vNext this tool replaces `accept_submission` and `reject_submission`; no compatibility aliases remain when vNext ships.

## Workspace

### `get_workspace`
Return a concise personal overview assembled from work already visible to the current user.

- Inputs: none, apart from optional bounded list sizes.
- Output: counts and summaries for work needing attention, submissions in review, review queue items when authorized, and recently visible backlog and catalog additions.
- Authorization: authenticated user; approver sections are omitted when unauthorized.
- Side effects: none.
- Delivery: new user-centric aggregation query. This does not introduce a team workspace aggregate root.

### `list_my_work`
List actionable work for the current user across submission and review responsibilities.

- Inputs: optional type, status, attention reason, sort, and pagination filters.
- Output: typed work summaries with the reason each item needs attention.
- Authorization: authenticated user; review work is included only for approvers or administrators.
- Side effects: none.
- Delivery: new aggregation over ownership and role-scoped queries.

## Governance Boundaries
Momentum does not expose `create_backlog_item`, `update_backlog`, `delete_backlog`, `create_catalog_item`, generic catalog mutation, or relationship mutation tools. Published records arise from accepted submissions and deterministic publication. Inferred relationships remain advisory until a separate governed relationship lifecycle exists.

## MCP App Composition
MCP apps compose the tool surface into reusable human workflows:

| Resource | Composed tools |
|---|---|
| `ui://momentum/workspace` | `get_workspace`, `list_my_work` |
| `ui://momentum/contribute` | `create_backlog_submission`, `create_solution_submission`, `find_related` |
| `ui://momentum/explorer` | `search_catalyst`, `search_catalog`, `search_backlog` |
| `ui://momentum/item` | `get_item`, `find_related`, `get_item_activity`, `list_comments` |
| `ui://momentum/review` | `get_review`, `analyze_submission`, `find_related`, `list_comments`, `decide_submission` |

The review app may present submission details, possible duplicates, repository observations, comments, activity, and decision controls, but the controls invoke `decide_submission`. The app does not create an alternate decision API.

## Delivery Sequence
1. Expose existing comment, submission-list, and review-queue reads.
2. Add unified search and polymorphic item reads.
3. Add relationship query and ranking support, then expose `find_related`.
4. Add governed update and withdrawal lifecycle operations.
5. Make validated triage results queryable, then add analysis and composed review reads.
6. Introduce the unified decision command and request-changes transition.
7. Add personal workspace aggregations.
8. Compose and ship the five MCP app resources.

Each release must mark descriptors and documentation as implemented only after its application capability, authorization, visibility filtering, and executable tests are complete.

## Related Design
- `docs/design/platform/mcp/server-capabilities.md`
- `docs/design/platform/mcp/tool-authorization.md`
- `docs/design/capabilities/search-and-discovery/index.md`
- `docs/design/capabilities/submissions/index.md`
- `docs/design/capabilities/comments/index.md`
- `docs/design/capabilities/approvals/index.md`
- `docs/design/cross-cutting/agent-execution/index.md`
- `docs/design/platform/frontend/index.md`

## Related Decisions
- `0001-momentum-backend-is-authoritative`
