import { AppError, canReview } from "@innovation-backlog/logic";
import type {
  ApprovalInbox,
  ApprovalsProvider,
  CreateIdeaInput,
  CreateSolutionInput,
  Decision,
  Idea,
  IdeaQuery,
  IdeaSolutionLink,
  IdeasProvider,
  ItemVisibility,
  PageResult,
  Role,
  SearchItem,
  SearchQuery,
  SearchResult,
  Solution,
  SolutionQuery,
  SolutionsProvider,
  UpdateIdeaInput,
} from "@innovation-backlog/logic";

import { unwrap } from "../errors.js";
import type { AdoClient } from "./client.js";
import { addField } from "./client.js";
import type { RollupReader } from "../dataverse/rollups.js";
import {
  FIELDS,
  LINK_LABEL,
  LIST_FIELDS,
  RELATED,
  STATE,
  TAG,
  WIT,
  encodeTags,
  getWorkItem,
  queryWorkItems,
  readTags,
  relatedItems,
  stateReachedAt,
  toIdea,
  toSolution,
  withTag,
  wiqlString,
} from "./workitems.js";
import type { WorkItem } from "./workitems.js";

/**
 * Ideas, solutions, approvals and search, over Azure DevOps work items.
 *
 * Visibility is not filtered here. Area-path ACLs mean a restricted work item never
 * reaches an unauthorized caller at all — the query returns fewer rows rather than
 * rows to be filtered — so re-checking client-side would be theatre. The tradeoff is
 * the accepted parity gap: an author cannot see their own restricted idea, because
 * area permissions have no owner exception.
 */

export interface ItemsOptions {
  client: AdoClient;
  rollups: RollupReader;
  role: () => Promise<Role>;
}

const SORT_COLUMN: Record<string, string> = {
  title: FIELDS.title,
  status: FIELDS.state,
  created: FIELDS.createdDate,
  updated: FIELDS.changedDate,
};

function textClause(search: string | undefined): string {
  if (!search) return "";
  const needle = wiqlString(search);
  return ` AND ([${FIELDS.title}] CONTAINS '${needle}' OR [${FIELDS.description}] CONTAINS '${needle}')`;
}

/**
 * Keeps unreviewed and rejected work out of the catalogue.
 *
 * There was no state filter at all, so a solution was listed as reusable the moment
 * it was created and a rejected one stayed listed forever — which makes the approval
 * gate decorative: the thing it guards was already public before anyone looked at it.
 *
 * Ideas and solutions are treated differently on purpose. An idea awaiting approval
 * is a request for help, so it stays visible — that is the whole point of "where you
 * can contribute". A solution awaiting approval is an unchecked claim that something
 * is reusable, so it stays private to its author until a reviewer agrees.
 *
 * Rejected is hidden from everyone here; reviewers read decisions through the
 * approvals surface, not by browsing.
 */
function catalogClause(type: "idea" | "solution", canSeeUnreviewed: boolean): string {
  const notRejected = ` AND [${FIELDS.state}] <> '${wiqlString(STATE.rejected)}'`;
  if (type === "idea" || canSeeUnreviewed) return notRejected;

  // @Me is resolved by the server against the caller, so the author keeps sight of
  // their own submission without the adapter having to know who they are.
  return (
    notRejected +
    ` AND ([${FIELDS.state}] <> '${wiqlString(STATE.awaitingApproval)}'` +
    ` OR [${FIELDS.createdBy}] = @Me)`
  );
}

/**
 * Whose ideas these are.
 *
 * `IdeaQuery` has carried `mineOnly` and `submittedBy` all along and the WIQL builder
 * ignored both — so `GET:requests`, which the UI calls with `mineOnly: true` to fill
 * My Work, returned every idea in the project. The .NET route is
 * `requests.GetBySubmitter(me)`, so the two hosts disagreed about whose work "My Work"
 * showed.
 *
 * `@Me` is resolved by Azure DevOps against the caller, so the adapter does not have to
 * know who they are — the same reason `catalogClause` uses it for the author exception.
 */
function submitterClause(query: IdeaQuery | undefined): string {
  if (query?.submittedBy) {
    return ` AND [${FIELDS.createdBy}] = '${wiqlString(query.submittedBy)}'`;
  }
  return query?.mineOnly ? ` AND [${FIELDS.createdBy}] = @Me` : "";
}

function tagClause(tags: string[] | undefined): string {
  if (!tags || tags.length === 0) return "";
  return ` AND (${tags.map((t) => `[${FIELDS.tags}] CONTAINS '${wiqlString(t)}'`).join(" OR ")})`;
}

function orderClause(field: string | undefined, descending: boolean | undefined): string {
  const column = (field && SORT_COLUMN[field]) ?? FIELDS.changedDate;
  return ` ORDER BY [${column}] ${descending === false ? "ASC" : "DESC"}`;
}

function page<T>(rows: T[], query?: { page?: number; pageSize?: number }): PageResult<T> {
  if (!query?.pageSize) return { items: rows, total: rows.length };
  const current = query.page ?? 1;
  const start = (current - 1) * query.pageSize;
  return {
    items: rows.slice(start, start + query.pageSize),
    total: rows.length,
    nextPage: start + query.pageSize < rows.length ? current + 1 : undefined,
  };
}

async function requireReviewer(role: () => Promise<Role>): Promise<void> {
  if (!canReview(await role())) {
    throw new AppError("Approver role required.", { category: "permission" });
  }
}

/** A JSON Patch operation appending a relation. */
const addRelation = (rel: string, url: string, comment?: string) => ({
  op: "add",
  path: "/relations/-",
  value: { rel, url, ...(comment ? { attributes: { comment } } : {}) },
});

const workItemUrl = (organization: string, id: string | number) =>
  `https://dev.azure.com/${organization}/_apis/wit/workItems/${id}`;

/** Null when the item is absent OR invisible — a refusal would confirm it exists. */
async function readOrNull<T>(read: () => Promise<T>): Promise<T | null> {
  try {
    return await read();
  } catch (error) {
    if (error instanceof AppError && error.category === "notFound") return null;
    throw error;
  }
}

// ---------------------------------------------------------------------------

export function createIdeasProvider(options: ItemsOptions): IdeasProvider {
  const { client, rollups, role } = options;

  async function fetchIdeas(query?: IdeaQuery): Promise<Idea[]> {
    const wiql =
      `SELECT [${FIELDS.id}] FROM WorkItems` +
      ` WHERE [${FIELDS.workItemType}] = '${WIT.idea}'` +
      catalogClause("idea", canReview(await role())) +
      submitterClause(query) +
      textClause(query?.search) +
      tagClause(query?.tags) +
      (query?.statuses?.length
        ? ` AND (${query.statuses.map((s) => `[${FIELDS.state}] = '${wiqlString(s)}'`).join(" OR ")})`
        : "") +
      orderClause(query?.sort?.field, query?.sort?.descending);

    return (await queryWorkItems(client, wiql, LIST_FIELDS)).map(toIdea);
  }

  return {
    async listIdeas(query) {
      return page(await fetchIdeas(query), query);
    },

    async getIdea(id) {
      const item = await readOrNull(() => getWorkItem(client, id, "get idea"));
      return item ? toIdea(item) : null;
    },

    async createIdea(input: CreateIdeaInput) {
      // No visibility field: a new idea lands on the project root, which is the
      // Everyone case. Restricting it is a later move to an area path.
      const created = await client.patch<WorkItem>(
        `_apis/wit/workitems/$${WIT.idea}`,
        [
          addField(FIELDS.title, input.title),
          addField(FIELDS.description, input.description),
          ...(input.tags?.length ? [addField(FIELDS.tags, encodeTags(input.tags))] : []),
        ],
        "create idea",
      );

      /*
       * Submitting means submitting. There is no triage worker behind this app, so
       * nothing else would ever move the idea off Draft and it would never reach an
       * approver — which is exactly what happened.
       *
       * Two calls because ADO rejects System.State on create: the only state accepted
       * there is the type's initial one, and anything else comes back as "not in the
       * list of supported values". Draft is where it lands; the transition follows.
       */
      const submitted = await client.patch<WorkItem>(
        `_apis/wit/workitems/${created.id}`,
        [addField(FIELDS.state, STATE.awaitingApproval)],
        "submit idea for approval",
      );
      return toIdea(submitted);
    },

    async updateIdea(id, patch: UpdateIdeaInput) {
      const operations = [
        patch.title !== undefined ? addField(FIELDS.title, patch.title) : null,
        patch.description !== undefined ? addField(FIELDS.description, patch.description) : null,
      ].filter(Boolean);

      const updated = await client.patch<WorkItem>(
        `_apis/wit/workitems/${encodeURIComponent(id)}`,
        operations,
        "update idea",
      );
      return toIdea(updated);
    },

    async listLinkedSolutions(ideaId) {
      const item = await readOrNull(() => getWorkItem(client, ideaId, "list linked solutions"));
      const ids = item ? relatedItems(item).ids : [];
      if (ids.length === 0) return [];

      const batch = await client.post<{ value?: WorkItem[] }>(
        "_apis/wit/workitemsbatch",
        { ids: ids.map(Number), fields: [...LIST_FIELDS] },
        "hydrate linked solutions",
      );
      return (batch.value ?? [])
        .filter((w) => w.fields[FIELDS.workItemType] === WIT.solution)
        .map(toSolution);
    },

    /**
     * Rollups span the whole catalogue, not just your own ideas — the summaries feed
     * every list on Home, so passing no query here is deliberate.
     */
    async getIdeaRollups(ids) {
      return rollups.ideas(ids ?? (await fetchIdeas()).map((idea) => idea.id));
    },

    /**
     * Visibility IS the area path. There is no field to keep in step, and no rule
     * restating the permission — who may move an item between area paths is an
     * area-path permission, set once when the project is provisioned.
     */
    async setIdeaVisibility(id, visibility: ItemVisibility) {
      await requireReviewer(role);
      const { project } = await client.context();
      const updated = await client.patch<WorkItem>(
        `_apis/wit/workitems/${encodeURIComponent(id)}`,
        [addField(FIELDS.areaPath, `${project}\\${visibility}`)],
        "set idea visibility",
      );
      return toIdea(updated);
    },
  };
}

// ---------------------------------------------------------------------------

export function createSolutionsProvider(options: ItemsOptions): SolutionsProvider {
  const { client, rollups, role } = options;

  async function fetchSolutions(query?: SolutionQuery): Promise<Solution[]> {
    // Now a real field, so kind filters are an equality clause rather than a
    // CONTAINS over the tag string — exact, and indexable.
    const kindClause = query?.kinds?.length
      ? ` AND (${query.kinds
          .map((kind) => `[${FIELDS.solutionType}] = '${wiqlString(kind)}'`)
          .join(" OR ")})`
      : "";

    const wiql =
      `SELECT [${FIELDS.id}] FROM WorkItems` +
      ` WHERE [${FIELDS.workItemType}] = '${WIT.solution}'` +
      catalogClause("solution", canReview(await role())) +
      textClause(query?.search) +
      tagClause(query?.tags) +
      kindClause +
      orderClause(query?.sort?.field, query?.sort?.descending);

    return (await queryWorkItems(client, wiql, LIST_FIELDS)).map(toSolution);
  }

  return {
    async listSolutions(query) {
      return page(await fetchSolutions(query), query);
    },

    /**
     * The detail read is where `publishedAt` becomes knowable: it is the revision
     * on which State first became Published, so it costs one extra call and is
     * only paid here rather than on every row of a list.
     */
    async getSolution(id) {
      const item = await readOrNull(() => getWorkItem(client, id, "get solution"));
      if (!item) return null;

      const solution = toSolution(item);
      if (solution.status === "Published" || solution.status === "Retired") {
        solution.publishedAt = await stateReachedAt(client, id, "Published").catch(() => null);
      }
      return solution;
    },

    async createSolution(input: CreateSolutionInput) {
      const created = await client.patch<WorkItem>(
        `_apis/wit/workitems/$${WIT.solution}`,
        [
          addField(FIELDS.title, input.title),
          addField(FIELDS.description, input.description),
          // A constrained picklist field, because the type decides what the record
          // consists of. Topic tags stay free-form alongside it.
          addField(FIELDS.solutionType, input.solutionType),
          ...(input.tags?.length ? [addField(FIELDS.tags, encodeTags(input.tags))] : []),
          // Repository and demo are native hyperlinks, told apart by their comment.
          // A Strategy has no repository, so the relation is simply absent rather
          // than a hyperlink pointing at an empty string.
          ...(input.repositoryUrl
            ? [addRelation("Hyperlink", input.repositoryUrl, LINK_LABEL.repository)]
            : []),
          ...(input.demoUrl ? [addRelation("Hyperlink", input.demoUrl, LINK_LABEL.demo)] : []),
        ],
        "create solution",
      );
      return toSolution(created);
    },

    async listLinkedIdeas(solutionId) {
      const item = await readOrNull(() => getWorkItem(client, solutionId, "list linked ideas"));
      const ids = item ? relatedItems(item).ids : [];
      if (ids.length === 0) return [];

      const batch = await client.post<{ value?: WorkItem[] }>(
        "_apis/wit/workitemsbatch",
        { ids: ids.map(Number), fields: [...LIST_FIELDS] },
        "hydrate linked ideas",
      );
      return (batch.value ?? [])
        .filter((w) => w.fields[FIELDS.workItemType] === WIT.idea)
        .map(toIdea);
    },

    async getSolutionRollups(ids) {
      return rollups.solutions(ids ?? (await fetchSolutions()).map((s) => s.id));
    },

    async setSolutionVisibility(id, visibility: ItemVisibility) {
      await requireReviewer(role);
      const { project } = await client.context();
      const updated = await client.patch<WorkItem>(
        `_apis/wit/workitems/${encodeURIComponent(id)}`,
        [addField(FIELDS.areaPath, `${project}\\${visibility}`)],
        "set solution visibility",
      );
      return toSolution(updated);
    },
  };
}

// ---------------------------------------------------------------------------

export function createApprovalsProvider(options: ItemsOptions): ApprovalsProvider {
  const { client, role } = options;

  async function transition(id: string, state: string, rationale: string, what: string) {
    await requireReviewer(role);
    if (!rationale.trim()) {
      throw new AppError("A rationale is required.", { category: "validation" });
    }
    // The process enforces both of these too — State is read-only outside the
    // Approvers group, and a rule makes the rationale required on the transition.
    // Checking here turns a server rejection into a clear message instead of a
    // generic 400 after the round trip.
    return client.patch<WorkItem>(
      `_apis/wit/workitems/${encodeURIComponent(id)}`,
      [addField(FIELDS.state, state), addField(FIELDS.decisionRationale, rationale)],
      what,
    );
  }

  /** Rewrites one Related link so it carries a comment. Patch has no edit-in-place. */
  async function retagRelation(
    ideaId: string,
    targetId: string,
    comment: string | undefined,
  ): Promise<void> {
    const { organization } = await client.context();
    const item = await getWorkItem(client, ideaId, "read links");
    const index = (item.relations ?? []).findIndex(
      (relation) => relation.rel === RELATED && relation.url.endsWith(`/${targetId}`),
    );
    if (index < 0) return;

    await client.patch(
      `_apis/wit/workitems/${encodeURIComponent(ideaId)}`,
      [
        { op: "remove", path: `/relations/${index}` },
        addRelation(RELATED, workItemUrl(organization, targetId), comment),
      ],
      "update link",
    );
  }

  return {
    async getInbox(): Promise<ApprovalInbox> {
      // Degraded rather than thrown: an approvals surface a submitter cannot use
      // should render empty, not break the page around it.
      if (!canReview(await role())) {
        return { ideas: [], solutions: [], unavailable: "permission" };
      }

      const awaiting = (type: string) =>
        `SELECT [${FIELDS.id}] FROM WorkItems` +
        ` WHERE [${FIELDS.workItemType}] = '${type}'` +
        ` AND [${FIELDS.state}] = '${wiqlString(STATE.awaitingApproval)}'` +
        ` ORDER BY [${FIELDS.createdDate}] ASC`;

      const [ideas, solutions] = await Promise.all([
        queryWorkItems(client, awaiting(WIT.idea), LIST_FIELDS),
        queryWorkItems(client, awaiting(WIT.solution), LIST_FIELDS),
      ]);

      return { ideas: ideas.map(toIdea), solutions: solutions.map(toSolution) };
    },

    async acceptIdea(id, rationale) {
      return toIdea(await transition(id, "Accepted", rationale, "accept idea"));
    },
    async rejectIdea(id, rationale) {
      return toIdea(await transition(id, "Rejected", rationale, "reject idea"));
    },
    async acceptSolution(id, rationale) {
      return toSolution(await transition(id, "Published", rationale, "publish solution"));
    },
    async rejectSolution(id, rationale) {
      return toSolution(await transition(id, "Rejected", rationale, "reject solution"));
    },

    /**
     * Decisions come from the work item's own revisions. Who decided and when are
     * System.ChangedBy and System.ChangedDate on the revision that set the state —
     * storing them again in custom fields would be a second copy of a record Azure
     * DevOps already keeps and shows.
     */
    async listDecisions(subjectId): Promise<Decision[]> {
      const history = await client.get<{ value?: { rev: number; fields: Record<string, unknown> }[] }>(
        `_apis/wit/workitems/${encodeURIComponent(subjectId)}/revisions`,
        "list decisions",
      );

      const revisions = history.value ?? [];
      const decisions: Decision[] = [];
      let previous: unknown;

      for (const revision of revisions) {
        const state = revision.fields[FIELDS.state];
        const isDecision = state === "Accepted" || state === "Rejected" || state === "Published";
        // Only the revision that CHANGED the state is a decision; later edits keep
        // the same state and are not new decisions.
        if (isDecision && state !== previous) {
          const changedBy = revision.fields[FIELDS.changedBy];
          decisions.push({
            id: `${subjectId}-${revision.rev}`,
            subjectId,
            approverId:
              typeof changedBy === "object" && changedBy && "uniqueName" in changedBy
                ? String((changedBy as { uniqueName: unknown }).uniqueName)
                : String(changedBy ?? ""),
            decision: state === "Rejected" ? "Reject" : "Accept",
            rationale: String(revision.fields[FIELDS.decisionRationale] ?? ""),
            decidedAt: String(revision.fields[FIELDS.changedDate] ?? ""),
          });
        }
        previous = state;
      }
      return decisions;
    },

    /**
     * A plain Related link. Reviewer-only, which is what lets it carry no
     * attributes — there is no proposal to hold pending and nothing to classify.
     */
    async linkSolution(ideaId, solutionId): Promise<IdeaSolutionLink> {
      await requireReviewer(role);
      const { organization } = await client.context();

      const item = await getWorkItem(client, ideaId, "check existing link");
      const already = relatedItems(item).ids.includes(solutionId);

      if (!already) {
        await client.patch(
          `_apis/wit/workitems/${encodeURIComponent(ideaId)}`,
          [addRelation(RELATED, workItemUrl(organization, solutionId))],
          "link solution",
        );
      }
      return { ideaId, solutionId, addedBy: "", addedAt: new Date().toISOString() };
    },

    async unlinkSolution(ideaId, solutionId) {
      await requireReviewer(role);
      const item = await getWorkItem(client, ideaId, "find link to remove");
      const index = (item.relations ?? []).findIndex(
        (relation) => relation.rel === RELATED && relation.url.endsWith(`/${solutionId}`),
      );
      if (index < 0) return;

      await client.patch(
        `_apis/wit/workitems/${encodeURIComponent(ideaId)}`,
        [{ op: "remove", path: `/relations/${index}` }],
        "unlink solution",
      );
    },

    /**
     * Canonical is a property of the LINK, carried in its comment, not a field on
     * the idea. Clearing the previous one first keeps exactly one canonical link.
     */
    async selectCanonicalSolution(ideaId, solutionId) {
      await requireReviewer(role);

      const before = await getWorkItem(client, ideaId, "read links");
      const previous = relatedItems(before).canonical;
      if (previous && previous !== solutionId) {
        await retagRelation(ideaId, previous, undefined);
      }
      await retagRelation(ideaId, solutionId, LINK_LABEL.canonical);

      return toIdea(await getWorkItem(client, ideaId, "reload idea"));
    },
  };
}

// ---------------------------------------------------------------------------

/**
 * A solution as a search row.
 *
 * The solutions list returns the same envelope as search, and every consumer reads
 * `itemId`/`itemType` off the rows — but it was handing back raw domain objects,
 * which carry `id` and no type at all. `openDiscovery` guards on `itemId`, so
 * clicking a solution failed with "that item is missing an id" and never opened.
 *
 * Shared with the search mapper below rather than duplicated, because two hand-built
 * copies of this shape are exactly how the two drifted apart in the first place.
 */
export function toSearchRow(solution: Solution): SearchItem {
  return {
    itemType: "Solution",
    itemId: solution.id,
    title: solution.title,
    description: solution.description,
    status: solution.status,
    canonicalSolutionId: null,
    repositoryUrl: solution.repositoryUrl ?? null,
    team: null,
    createdAt: solution.createdAt,
    updatedAt: solution.updatedAt,
    subtype: solution.type,
    submittedBy: solution.ownerId,
    visibility: solution.visibility,
    tags: solution.tags,
  };
}

/** One WIQL pass over both types, so a search is two calls rather than four. */
export function createSearch(client: AdoClient, role: () => Promise<Role>) {
  return async function search(query: SearchQuery): Promise<SearchResult> {
    const canSeeUnreviewed = canReview(await role());

    /*
     * The two types carry different rules, so the branches are grouped separately
     * rather than filtered after the fact. Post-filtering would silently shrink the
     * page — take is applied by the query, so dropping rows afterwards returns fewer
     * results than asked for and makes totalCount a lie.
     */
    const wiql =
      `SELECT [${FIELDS.id}] FROM WorkItems` +
      ` WHERE ((([${FIELDS.workItemType}] = '${WIT.idea}')` +
      catalogClause("idea", canSeeUnreviewed) +
      `) OR (([${FIELDS.workItemType}] = '${WIT.solution}')` +
      catalogClause("solution", canSeeUnreviewed) +
      `))` +
      textClause(query.query.trim()) +
      ` ORDER BY [${FIELDS.changedDate}] DESC`;

    const skip = query.skip ?? 0;
    const take = query.take ?? 25;
    const items = await queryWorkItems(client, wiql, LIST_FIELDS, skip + take);

    const rows: SearchItem[] = items.map((item) => {
      const isSolution = item.fields[FIELDS.workItemType] === WIT.solution;
      const mapped = isSolution ? toSolution(item) : toIdea(item);
      const tags = readTags(item.fields);

      return {
        itemType: isSolution ? "Solution" : "Idea",
        itemId: mapped.id,
        title: mapped.title,
        description: mapped.description,
        status: mapped.status,
        canonicalSolutionId: null,
        repositoryUrl: null,
        team: null,
        createdAt: mapped.createdAt,
        updatedAt: mapped.updatedAt,
        // From the tag, since a list read has no relations and no type field.
        subtype: isSolution ? (mapped as Solution).type : (mapped as Idea).type,
        submittedBy: isSolution ? (mapped as Solution).ownerId : (mapped as Idea).submittedBy,
        visibility: mapped.visibility,
        tags: mapped.tags,
      };
    });

    return { items: rows.slice(skip, skip + take), totalCount: rows.length };
  };
}

/** Mirrors a public comment onto the work item. Returns the ADO comment id. */
export function createCommentMirror(client: AdoClient) {
  return async function mirror(input: { workItemId: number; body: string }): Promise<number | null> {
    const created = await client.post<{ id?: number }>(
      `_apis/wit/workItems/${input.workItemId}/comments`,
      { text: input.body },
      "mirror comment to Azure DevOps",
    );
    return typeof created.id === "number" ? created.id : null;
  };
}
