import { SOLUTION_KINDS } from "@innovation-backlog/logic";
import type {
  Idea,
  IdeaKind,
  IdeaStatus,
  ItemVisibility,
  Solution,
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

  decisionRationale: "Custom.InnovationBacklogDecisionRationale",
  solutionType: "Custom.InnovationBacklogSolutionType",
} as const;

export const WIT = { idea: "Idea", solution: "Solution", backlogItem: "Backlog Item" } as const;

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
const PARENT = "System.LinkTypes.Hierarchy-Reverse";

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
// Queries
// ---------------------------------------------------------------------------

/** WIQL string literals use single quotes and double them to escape. */
export const wiqlString = odataString;

/**
 * Run a WIQL query and hydrate the results.
 *
 * WIQL returns ids only. `workitemsbatch` takes EITHER a field projection OR
 * `$expand`, never both, so a list asks for fields and a detail view expands
 * relations — see `getWorkItem`.
 */
export async function queryWorkItems(
  client: AdoClient,
  wiql: string,
  fields: readonly string[],
  limit = 200,
): Promise<WorkItem[]> {
  const query = await client.post<{ workItems?: { id: number }[] }>(
    "_apis/wit/wiql",
    { query: wiql },
    "run work item query",
  );

  const ids = (query.workItems ?? []).slice(0, limit).map((w) => w.id);
  if (ids.length === 0) return [];

  const chunks: number[][] = [];
  for (let i = 0; i < ids.length; i += 200) chunks.push(ids.slice(i, i + 200));

  const pages = await Promise.all(
    chunks.map((chunk) =>
      client.post<{ value?: WorkItem[] }>(
        "_apis/wit/workitemsbatch",
        { ids: chunk, fields: [...fields] },
        "fetch work items",
      ),
    ),
  );

  // The batch call loses WIQL's ordering; restore it from the id order.
  const byId = new Map<number, WorkItem>();
  for (const page of pages) for (const item of page.value ?? []) byId.set(item.id, item);
  return ids.map((id) => byId.get(id)).filter((item): item is WorkItem => Boolean(item));
}

/** A single work item with relations expanded — repository, demo and links need them. */
export function getWorkItem(client: AdoClient, id: string, description: string): Promise<WorkItem> {
  return client.get<WorkItem>(
    `_apis/wit/workitems/${encodeURIComponent(id)}?$expand=relations`,
    description,
  );
}

/** When a work item first reached a state, from its revisions. */
export async function stateReachedAt(
  client: AdoClient,
  id: string,
  state: string,
): Promise<string | null> {
  const history = await client.get<{ value?: { fields: Record<string, unknown> }[] }>(
    `_apis/wit/workitems/${encodeURIComponent(id)}/revisions`,
    "read work item history",
  );
  const hit = (history.value ?? []).find((revision) => revision.fields[FIELDS.state] === state);
  return hit ? text(hit.fields, FIELDS.changedDate) || null : null;
}

/** List projection. Relations are deliberately absent — see queryWorkItems. */
export const LIST_FIELDS = [
  FIELDS.id, FIELDS.title, FIELDS.description, FIELDS.state, FIELDS.tags,
  FIELDS.assignedTo, FIELDS.createdBy, FIELDS.createdDate, FIELDS.changedDate,
  FIELDS.areaPath, FIELDS.workItemType,
] as const;
