import { SOLUTION_KINDS } from "@innovation-backlog/logic";
import type {
  Idea,
  IdeaKind,
  IdeaStatus,
  ItemVisibility,
  Milestone,
  MilestoneStatus,
  Solution,
  SolutionIssue,
  SolutionIssueStatus,
  SolutionKind,
  SolutionStatus,
} from "@innovation-backlog/logic";
import type { AdoClient } from "./client.js";
import { odataString } from "../dataverse/paging.js";

/**
 * Work item fields, tags and relations, and the mapping to domain records.
 *
 * Native first. An earlier draft carried fifteen custom fields; fourteen were
 * either restating a system field or re-implementing a link as a number, so they
 * are gone. What replaced them:
 *
 *   visibility          System.AreaPath          (which also ENFORCES it)
 *   solution owner      System.AssignedTo
 *   who/when decided    System.ChangedBy / ChangedDate on the revision
 *   published when      the revision where State became Published
 *  *   triage health       a "pipeline:" tag
 *   failure detail      a work item comment
 *   repository, demo    Hyperlink relations, told apart by their comment
 *   canonical solution  the Related link's own comment
 *   Backlog Item -> Idea   a native Parent link
 *
 * The single survivor is DecisionRationale, because a process rule can make a
 * FIELD required on a state transition but cannot require a comment.
 */
export const FIELDS = {
  id: "System.Id",
  title: "System.Title",
  description: "System.Description",
  state: "System.State",
  tags: "System.Tags",
  assignedTo: "System.AssignedTo",
  createdBy: "System.CreatedBy",
  createdDate: "System.CreatedDate",
  changedBy: "System.ChangedBy",
  changedDate: "System.ChangedDate",
  areaPath: "System.AreaPath",
  workItemType: "System.WorkItemType",

  parent: "System.Parent",

  decisionRationale: "Custom.InnovationBacklogDecisionRationale",
  solutionType: "Custom.InnovationBacklogSolutionType",
  /**
   * An EXISTING organization field, deliberately. It is not on any Basic work item
   * type, but it exists org-wide, so attaching it claims no new permanent name in an
   * organization shared with dozens of unrelated projects.
   */
  targetDate: "Microsoft.VSTS.Scheduling.TargetDate",
  /** The one new name this feature claims. See Provision-AdoProcess.ps1. */
  targetLabel: "Custom.InnovationBacklogTargetLabel",
} as const;

export const WIT = {
  idea: "Idea",
  solution: "Solution",
  backlogItem: "Backlog Item",
  /**
   * Basic's inherited `Issue`, re-enabled rather than replaced by a custom type.
   *
   * The trade-off, accepted knowingly: `Issue` carries Basic's
   * `System.RequirementBacklogBehavior`, which an inherited type cannot be detached
   * from, so adopter-reported issues appear on the delivery backlog alongside
   * Backlog Item. See "Known gaps" in scripts/provisioning/README.md.
   */
  issue: "Issue",
  milestone: "Milestone",
} as const;

/** Tag namespace for pipeline health. Solution type is a field, not a tag: it
 *  decides what the record consists of, so it needs constrained values. */
export const TAG = { pipeline: "pipeline:" } as const;

/**
 * ADO state names, as spelled in the process.
 *
 * Shared because the approvals inbox filters on this exact string and the submit
 * transition writes it. A literal in each place would let the queue silently stop
 * matching what creation produces.
 */
export const STATE = {
  awaitingApproval: "Awaiting Approval",
  rejected: "Rejected",
} as const;

export interface WorkItemRelation {
  rel: string;
  url: string;
  attributes?: { comment?: string; name?: string };
}

export interface WorkItem {
  id: number;
  fields: Record<string, unknown>;
  relations?: WorkItemRelation[];
  url?: string;
}

// ---------------------------------------------------------------------------
// Field readers
// ---------------------------------------------------------------------------

const text = (f: Record<string, unknown>, field: string): string =>
  typeof f[field] === "string" ? (f[field] as string) : "";

/** Identity fields arrive as an object; uniqueName is the stable handle. */
const identity = (f: Record<string, unknown>, field: string): string => {
  const value = f[field];
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const person = value as { uniqueName?: unknown; displayName?: unknown };
    if (person.uniqueName) return String(person.uniqueName);
    if (person.displayName) return String(person.displayName);
  }
  return "";
};

/** A numeric system field, absent on older items rather than zero. */
const count = (f: Record<string, unknown>, field: string): number =>
  typeof f[field] === "number" ? (f[field] as number) : 0;

/** `System.Tags` is one semicolon-delimited string, not an array. */
export const readTags = (f: Record<string, unknown>): string[] => {
  const raw = f[FIELDS.tags];
  if (typeof raw !== "string" || raw.trim() === "") return [];
  return raw.split(";").map((tag) => tag.trim()).filter(Boolean);
};

export const encodeTags = (values: string[]): string => values.join("; ");

/** The value carried by a namespaced tag: "type:Library" -> "Library". */
export function taggedValue(tags: string[], prefix: string): string | undefined {
  const hit = tags.find((tag) => tag.toLowerCase().startsWith(prefix.toLowerCase()));
  return hit?.slice(prefix.length);
}

/** Tags with no known namespace — the ones a person actually typed. */
export function topicTags(tags: string[]): string[] {
  const prefixes = Object.values(TAG);
  return tags.filter((tag) => !prefixes.some((p) => tag.toLowerCase().startsWith(p.toLowerCase())));
}

/** Replace a namespaced tag, preserving topic tags and every other namespace. */
export function withTag(tags: string[], prefix: string, value: string | undefined): string[] {
  const kept = tags.filter((tag) => !tag.toLowerCase().startsWith(prefix.toLowerCase()));
  return value ? [...kept, `${prefix}${value}`] : kept;
}

/**
 * Visibility is the leaf of the area path: `Project\Approvers` means Approvers.
 * Anything else, including the project root, is Everyone.
 */
function visibilityFromArea(f: Record<string, unknown>): ItemVisibility {
  const leaf = text(f, FIELDS.areaPath).split("\\").pop();
  return leaf === "Approvers" || leaf === "Hidden" ? leaf : "Everyone";
}

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

const HYPERLINK = "Hyperlink";
export const RELATED = "System.LinkTypes.Related";
/**
 * Exported because issues and milestones hang off their Solution with it.
 *
 * Parent rather than Related for three reasons, one of which is a live bug avoided:
 * `createWorkItemFacts` counts EVERY Related link as a linked idea, so a Related
 * milestone would silently inflate `SolutionRollup.linkedNeeds`; Azure DevOps allows
 * at most one parent, so a milestone cannot belong to two solutions; and
 * `[System.Parent]` is a queryable WIQL field, so listing is one flat query rather
 * than the expand-then-hydrate pair `listLinkedIdeas` needs.
 */
export const PARENT = "System.LinkTypes.Hierarchy-Reverse";

export const LINK_LABEL = { repository: "Repository", demo: "Demo", canonical: "canonical" } as const;

/** Hyperlinks are told apart by their comment; it is the only label they carry. */
export function hyperlink(item: WorkItem, label: string): string | null {
  const hit = (item.relations ?? []).find(
    (relation) =>
      relation.rel === HYPERLINK &&
      (relation.attributes?.comment ?? "").toLowerCase() === label.toLowerCase(),
  );
  return hit?.url ?? null;
}

const idFromUrl = (url: string): string | null => {
  const last = url.split("/").pop();
  return last && /^\d+$/.test(last) ? last : null;
};

/** Related work item ids, with the canonical one called out by its link comment. */
export function relatedItems(item: WorkItem): { ids: string[]; canonical: string | null } {
  const ids: string[] = [];
  let canonical: string | null = null;

  for (const relation of item.relations ?? []) {
    if (relation.rel !== RELATED) continue;
    const id = idFromUrl(relation.url);
    if (!id) continue;
    ids.push(id);
    if ((relation.attributes?.comment ?? "").toLowerCase() === LINK_LABEL.canonical) {
      canonical = id;
    }
  }
  return { ids, canonical };
}

export function parentId(item: WorkItem): string | null {
  const parent = (item.relations ?? []).find((relation) => relation.rel === PARENT);
  return parent ? idFromUrl(parent.url) : null;
}

/** Owner and name come out of the repository URL rather than being stored twice. */
export function splitRepositoryUrl(url: string | null): { owner: string; name: string } {
  if (!url) return { owner: "", name: "" };
  try {
    const segments = new URL(url).pathname.split("/").filter(Boolean);
    const name = (segments.pop() ?? "").replace(/\.git$/, "");
    return { owner: segments.pop() ?? "", name };
  } catch {
    return { owner: "", name: "" };
  }
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const IDEA_STATES: Record<string, IdeaStatus> = {
  Draft: "Draft",
  Triage: "TriageRunning",
  "Awaiting Approval": "AwaitingApproval",
  Accepted: "Accepted",
  Published: "Accepted",
  Rejected: "Rejected",
};

const SOLUTION_STATES: Record<string, SolutionStatus> = {
  "Awaiting Approval": "AwaitingApproval",
  Published: "Published",
  Retired: "Retired",
  Rejected: "Rejected",
};

const PIPELINE_FAILURES: readonly IdeaStatus[] = [
  "TriageFailed",
  "PublicationFailed",
  "ProjectionFailed",
];

/**
 * Pipeline health is orthogonal to State and must never roll it back, so it rides
 * on a tag and only surfaces when it is genuinely a failure.
 */
function withPipeline(state: IdeaStatus, tags: string[]): IdeaStatus {
  const flagged = taggedValue(tags, TAG.pipeline) as IdeaStatus | undefined;
  return flagged && PIPELINE_FAILURES.includes(flagged) ? flagged : state;
}

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------

export function toIdea(item: WorkItem): Idea {
  const f = item.fields;
  const tags = readTags(f);

  return {
    id: String(item.id),
    type: "Backlog" as IdeaKind,
    status: withPipeline(IDEA_STATES[text(f, FIELDS.state)] ?? "Created", tags),
    title: text(f, FIELDS.title),
    description: text(f, FIELDS.description),
    submittedBy: identity(f, FIELDS.createdBy),
    // Null unless the caller expanded relations. A list projection deliberately
    // does not, because workitemsbatch takes fields OR $expand, never both.
    canonicalSolutionId: relatedItems(item).canonical,
    createdAt: text(f, FIELDS.createdDate),
    updatedAt: text(f, FIELDS.changedDate),
    visibility: visibilityFromArea(f),
    tags: topicTags(tags),
  };
}

// The valid kinds come from the domain registry, so adding one is a single edit
// there rather than a list to keep in step here.
const VALID_KINDS: readonly SolutionKind[] = SOLUTION_KINDS.map((spec) => spec.id);

export function toSolution(item: WorkItem): Solution {
  const f = item.fields;
  const tags = readTags(f);
  const kind = text(f, FIELDS.solutionType) as SolutionKind;
  const repositoryUrl = hyperlink(item, LINK_LABEL.repository);
  const { owner, name } = splitRepositoryUrl(repositoryUrl);

  return {
    id: String(item.id),
    title: text(f, FIELDS.title),
    description: text(f, FIELDS.description),
    // An unrecognised tag falls back to the first kind rather than inventing an
    // "Other" that no longer exists in the taxonomy.
    type: kind && VALID_KINDS.includes(kind) ? kind : VALID_KINDS[0]!,
    status: SOLUTION_STATES[text(f, FIELDS.state)] ?? "AwaitingApproval",
    repositoryOwner: owner,
    repositoryName: name,
    repositoryUrl: repositoryUrl ?? "",
    demoUrl: hyperlink(item, LINK_LABEL.demo),
    // AssignedTo is empty until someone is explicitly assigned, and the UI renders
    // this as "Shared by" — which is the person who shared it, not whoever happens
    // to own it now. Falling back to the creator stops that reading "Someone".
    ownerId: identity(f, FIELDS.assignedTo) || identity(f, FIELDS.createdBy) || null,
    // Derived from the Dataverse rollup, never stored on the work item.
    useCount: 0,
    adoptedByProjects: [],
    createdAt: text(f, FIELDS.createdDate),
    updatedAt: text(f, FIELDS.changedDate),
    // Only knowable from revision history, so a list read leaves it null rather
    // than substituting ChangedDate, which would quietly become "last edited".
    publishedAt: null,
    visibility: visibilityFromArea(f),
    tags: topicTags(tags),
  };
}

// ---------------------------------------------------------------------------
// Issues and milestones
// ---------------------------------------------------------------------------

/**
 * Basic's `Issue` states, which the domain carries verbatim.
 *
 * Not renamed on the way through: state names are permanent in Azure DevOps, so the
 * store's spelling is the only one that cannot change. The UI maps them to display
 * labels ("Open", "In progress", "Done"), which costs nothing and is reversible.
 */
const ISSUE_STATES: readonly SolutionIssueStatus[] = ["To Do", "Doing", "Done"];

/** `InProgress` in the domain, "In progress" in the process. */
export const MILESTONE_STATE: Record<MilestoneStatus, string> = {
  Planned: "Planned",
  InProgress: "In progress",
  Shipped: "Shipped",
  Cancelled: "Cancelled",
};

const MILESTONE_STATUS_BY_STATE: Record<string, MilestoneStatus> = Object.fromEntries(
  Object.entries(MILESTONE_STATE).map(([status, state]) => [state, status]),
) as Record<string, MilestoneStatus>;

export function toSolutionIssue(item: WorkItem, solutionId: string): SolutionIssue {
  const f = item.fields;
  const state = text(f, FIELDS.state) as SolutionIssueStatus;
  const assignedTo = identity(f, FIELDS.assignedTo);

  return {
    id: String(item.id),
    solutionId,
    title: text(f, FIELDS.title),
    description: text(f, FIELDS.description),
    // An unrecognised state reads as open rather than as done — the safe direction
    // for a feedback channel, where a wrongly-closed report is simply lost.
    status: ISSUE_STATES.includes(state) ? state : "To Do",
    reportedBy: identity(f, FIELDS.createdBy),
    assignedTo: assignedTo || null,
    createdAt: text(f, FIELDS.createdDate),
    updatedAt: text(f, FIELDS.changedDate),
  };
}

export function toMilestone(item: WorkItem, solutionId: string): Milestone {
  const f = item.fields;

  return {
    id: String(item.id),
    solutionId,
    title: text(f, FIELDS.title),
    note: text(f, FIELDS.description),
    status: MILESTONE_STATUS_BY_STATE[text(f, FIELDS.state)] ?? "Planned",
    targetDate: text(f, FIELDS.targetDate) || null,
    targetLabel: text(f, FIELDS.targetLabel),
    createdAt: text(f, FIELDS.createdDate),
    updatedAt: text(f, FIELDS.changedDate),
  };
}

/**
 * Projections for the child types.
 *
 * Separate from LIST_FIELDS on purpose: every idea and solution list pays for that
 * one, and neither needs a target date. Both carry `System.WorkItemType` because
 * issues and milestones arrive from ONE query and are told apart by it.
 */
export const ISSUE_FIELDS = [
  FIELDS.id, FIELDS.title, FIELDS.description, FIELDS.state, FIELDS.parent,
  FIELDS.workItemType,
  FIELDS.assignedTo, FIELDS.createdBy, FIELDS.createdDate, FIELDS.changedDate,
] as const;

export const MILESTONE_FIELDS = [
  FIELDS.id, FIELDS.title, FIELDS.description, FIELDS.state, FIELDS.parent,
  FIELDS.workItemType,
  FIELDS.targetDate, FIELDS.targetLabel, FIELDS.createdDate, FIELDS.changedDate,
] as const;

/**
 * `[System.Parent] = 123` — an integer comparison, so `wiqlString` does not apply.
 *
 * Returns null for anything non-numeric rather than interpolating it: a domain id is
 * a `string`, and dropping one unquoted into WIQL is an injection vector.
 */
export function parentClause(solutionId: string): string | null {
  const parent = Number(solutionId);
  if (!Number.isFinite(parent) || parent <= 0) return null;
  return `[${FIELDS.parent}] = ${parent}`;
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/** WIQL string literals use single quotes and double them to escape. */
export const wiqlString = odataString;

/**
 * The two-hop reader: WIQL or relations produce ids, `workitemsbatch` turns them
 * into rows.
 *
 * Its reason to exist is that the second hop used to be one request per caller.
 * Opening a solution asked for three work items in three POSTs — an issue, a linked
 * idea and a milestone — because the three call sites that wanted them are unrelated
 * and each hydrated its own. They all land within the same tick, so `hydrate`
 * collects the ids requested across that tick and issues ONE batch for the union.
 *
 * `workitemsbatch` takes a single `fields` array for the whole request, so the
 * projections are unioned too: a slightly wider row per item, in exchange for two
 * fewer round trips.
 *
 * NOT used by `createWorkItemFacts`, and it cannot be — that one asks for
 * `$expand=Relations`, which the endpoint refuses to combine with `fields`.
 */
export interface WorkItemLoader {
  /** Run a WIQL query and hydrate the results, in the query's own order. */
  list(wiql: string, fields: readonly string[], limit?: number): Promise<WorkItem[]>;
  /** Hydrate known ids, coalescing with every other id asked for in the same tick. */
  hydrate(ids: readonly number[], fields: readonly string[]): Promise<WorkItem[]>;
}

interface PendingBatch {
  ids: Set<number>;
  fields: Set<string>;
  rows: Promise<Map<number, WorkItem>>;
}

export function createWorkItemLoader(client: AdoClient): WorkItemLoader {
  let pending: PendingBatch | null = null;

  async function fetchBatch(ids: number[], fields: string[]): Promise<Map<number, WorkItem>> {
    const chunks: number[][] = [];
    for (let i = 0; i < ids.length; i += 200) chunks.push(ids.slice(i, i + 200));

    const pages = await Promise.all(
      chunks.map((chunk) =>
        client.read<{ value?: WorkItem[] }>(
          "_apis/wit/workitemsbatch",
          /*
            `omit` rather than the default `fail`, and it matters more now than it
            did: a merged batch carries ids from callers that know nothing about each
            other, so one item the reader cannot see would otherwise fail three lists
            at once instead of dropping one row from one of them.
          */
          { ids: chunk, fields, errorPolicy: "omit" },
          "fetch work items",
        ),
      ),
    );

    const byId = new Map<number, WorkItem>();
    for (const page of pages) for (const item of page.value ?? []) byId.set(item.id, item);
    return byId;
  }

  function hydrate(ids: readonly number[], fields: readonly string[]): Promise<WorkItem[]> {
    const wanted = [...new Set(ids.filter((id) => Number.isFinite(id)))];
    if (wanted.length === 0) return Promise.resolve([]);

    if (!pending) {
      const batch: PendingBatch = { ids: new Set(), fields: new Set(), rows: undefined! };
      /*
        Queued now, so it runs after every continuation that shares this tick has had
        its chance to add ids — the two child queries resolve off the same cached
        WIQL promise, so their `.then`s are already in the microtask queue ahead of
        this one.
      */
      batch.rows = Promise.resolve().then(() => {
        pending = null;
        return fetchBatch([...batch.ids], [...batch.fields]);
      });
      pending = batch;
    }

    const batch = pending;
    for (const id of wanted) batch.ids.add(id);
    for (const field of fields) batch.fields.add(field);

    return batch.rows.then((byId) =>
      wanted.map((id) => byId.get(id)).filter((item): item is WorkItem => Boolean(item)),
    );
  }

  return {
    hydrate,

    async list(wiql, fields, limit = 200) {
      // A read that happens to be a POST: the body is the query, and running it
      // twice in a tick — which the issue and milestone lists do — is one request.
      const query = await client.read<{ workItems?: { id: number }[] }>(
        "_apis/wit/wiql",
        { query: wiql },
        "run work item query",
      );

      const ids = (query.workItems ?? []).slice(0, limit).map((w) => w.id);
      if (ids.length === 0) return [];

      // The batch call loses WIQL's ordering; `hydrate` returns rows in the order
      // the ids were asked for, which restores it.
      return hydrate(ids, fields);
    },
  };
}

/**
 * The facts a rollup needs that only Azure DevOps can answer.
 *
 * Batched deliberately. Counting links or comments per item would be one connector
 * call per item per metric, and the connector's budget is 300 calls per 60 seconds —
 * a thirty-row list would spend it before rendering.
 *
 * NOTE the API trap: `workitemsbatch` rejects `fields` and `$expand` together
 * ("The fields parameter cannot be used with the expand parameter"), which is why
 * `queryWorkItems` above passes a projection and gets no relations. This asks for
 * relations instead and takes all fields with them. It is a heavier payload, so it
 * is deliberately NOT folded into the list path — only rollups pay for it.
 */
export interface WorkItemFacts {
  /** Related work items. See the note in createWorkItemFacts about type filtering. */
  linked: number;
  /** System.CommentCount, native and not audience-filtered. */
  comments: number;
  /** System.CreatedBy's uniqueName, for the contributor union. */
  submittedBy: string;
}

export function createWorkItemFacts(
  client: AdoClient,
): (ids: string[]) => Promise<Map<string, WorkItemFacts>> {
  return async (ids) => {
    const numeric = ids.map(Number).filter((id) => Number.isFinite(id));
    const facts = new Map<string, WorkItemFacts>();
    if (numeric.length === 0) return facts;

    const chunks: number[][] = [];
    for (let i = 0; i < numeric.length; i += 200) chunks.push(numeric.slice(i, i + 200));

    const pages = await Promise.all(
      chunks.map((chunk) =>
        client.post<{ value?: WorkItem[] }>(
          "_apis/wit/workitemsbatch",
          { ids: chunk, $expand: "Relations" },
          "fetch work item rollup facts",
        ),
      ),
    );

    for (const page of pages) {
      for (const item of page.value ?? []) {
        facts.set(String(item.id), {
          /*
            Every Related link this app creates joins an Idea to a Solution — the
            Backlog Item hierarchy uses Parent, and repository/demo are Hyperlinks —
            so counting Related links is already the linked-count. Filtering by the
            far end's work item type would cost a second hydration to learn types
            that cannot differ.
          */
          linked: relatedItems(item).ids.length,
          comments: count(item.fields, "System.CommentCount"),
          submittedBy: identity(item.fields, FIELDS.createdBy),
        });
      }
    }
    return facts;
  };
}

/** A single work item with relations expanded — repository, demo and links need them. */
export function getWorkItem(client: AdoClient, id: string, description: string): Promise<WorkItem> {
  return client.get<WorkItem>(
    `_apis/wit/workitems/${encodeURIComponent(id)}?$expand=relations`,
    description,
  );
}

/**
 * A field's value after an update, from `_apis/wit/workitems/{id}/updates`.
 *
 * `updates` returns what CHANGED on each revision rather than a whole snapshot of
 * the item, so a field is present on an update only if that revision set it. That is
 * both a fraction of the payload and a better shape: "the revision that changed the
 * state" stops being something to infer by comparing consecutive snapshots and
 * becomes the presence of the key.
 */
export interface WorkItemUpdate {
  rev: number;
  fields?: Record<string, { oldValue?: unknown; newValue?: unknown }>;
}

export function updatedValue(update: WorkItemUpdate, field: string): unknown {
  return update.fields?.[field]?.newValue;
}

/**
 * The revision history as deltas.
 *
 * NOTE the timestamp trap: an update's own `revisedDate` carries a `9999-01-01`
 * sentinel on the newest revision, so when a date is wanted it comes from
 * `System.ChangedDate`'s newValue instead.
 */
export async function workItemUpdates(
  client: AdoClient,
  id: string,
  description: string,
): Promise<WorkItemUpdate[]> {
  const history = await client.get<{ value?: WorkItemUpdate[] }>(
    `_apis/wit/workitems/${encodeURIComponent(id)}/updates`,
    description,
  );
  return history.value ?? [];
}

/** List projection. Relations are deliberately absent — see WorkItemLoader. */
export const LIST_FIELDS = [
  FIELDS.id, FIELDS.title, FIELDS.description, FIELDS.state, FIELDS.tags,
  FIELDS.assignedTo, FIELDS.createdBy, FIELDS.createdDate, FIELDS.changedDate,
  FIELDS.areaPath, FIELDS.workItemType,
] as const;
