import type {
  ActivityEntry,
  ActivityQuery,
  AddCommentInput,
  Attachment,
  Comment,
  UploadAttachmentInput,
} from "../../domain/collaboration.js";
import { MAX_ATTACHMENT_BYTES } from "../../domain/collaboration.js";
import type { PageResult } from "../../domain/common.js";
import type {
  Adoption,
  HubItemRef,
  IdeaSolutionLink,
  Participation,
  RequestParticipationInput,
  StartAdoptionInput,
  UpdateAdoptionInput,
  VoteSummary,
} from "../../domain/engagement.js";
import { targetKey } from "../../domain/engagement.js";
import type { ItemVisibility, Role } from "../../domain/enums.js";
import {
  canEditSolution,
  canReview,
  canSee,
  canSetIssueStatus,
  isActiveAdoption,
  sameUser,
} from "../../domain/enums.js";
import type {
  CreateSolutionIssueInput,
  SolutionIssue,
  UpdateSolutionIssueInput,
} from "../../domain/feedback.js";
import type { CurrentUser, UserRef } from "../../domain/identity.js";
import type { CreateIdeaInput, Idea, IdeaQuery, UpdateIdeaInput } from "../../domain/idea.js";
import type {
  CreateMilestoneInput,
  Milestone,
  UpdateMilestoneInput,
} from "../../domain/roadmap.js";
import { compareMilestones } from "../../domain/roadmap.js";
import type { IdeaRollup, RollupMap, SearchItem, SearchQuery, SearchResult, SolutionRollup } from "../../domain/search.js";
import type {
  CreateSolutionInput,
  Solution,
  SolutionQuery,
  UpdateSolutionInput,
} from "../../domain/solution.js";
import { normalizeTags } from "../../domain/tags.js";
import type { ApprovalInbox, Decision } from "../../contracts/approvals-provider.js";
import type { InnovationBacklogProvider } from "../../contracts/provider.js";
import { AppError } from "../../errors/errors.js";
import type { MemorySeed, MemoryVote } from "./seed.js";
import { defaultSeed } from "./seed.js";

export interface MemoryProviderOptions {
  seed?: MemorySeed;
  /** Which role the signed-in user holds. Flip it to exercise every gated surface. */
  role?: Role;
  /** Artificial latency in ms, so loading states are visible in Storybook. */
  latencyMs?: number;
}

const clone = <T>(value: T): T => structuredClone(value);

/**
 * An in-memory implementation of the whole provider contract.
 *
 * Two jobs. It lets components and pages be built and reviewed with no tenant, no
 * Azure DevOps organization and no network. And it is a compile-time proof that the
 * contracts describe the domain rather than a backend: if a method here cannot be
 * written without inventing an OData filter or a work item id, the contract is
 * shaped wrong and should be fixed before an adapter enshrines it.
 *
 * It enforces the rules that matter — item visibility and comment audience — for the
 * same reason. A fake that returns everything to everyone would let a surface be
 * built against data it will never actually receive.
 */
export function createMemoryProvider(
  options: MemoryProviderOptions = {},
): InnovationBacklogProvider {
  const store = options.seed ?? defaultSeed();
  const role: Role = options.role ?? "Administrator";
  const latency = options.latencyMs ?? 0;

  const settle = async <T>(value: T): Promise<T> => {
    if (latency > 0) await new Promise((resolve) => setTimeout(resolve, latency));
    return value;
  };

  const me = store.currentUserId;
  let sequence = 1000;
  const nextId = (prefix: string) => `${prefix}-${++sequence}`;
  const now = () => new Date().toISOString();

  // Per-instance: two providers built from two seeds must not share decisions.
  const decisions: Decision[] = [];

  // -------------------------------------------------------------------------
  // Visibility
  // -------------------------------------------------------------------------

  const visibleIdeas = () =>
    store.ideas.filter((i) => canSee(i.visibility, role, i.submittedBy === me));

  const visibleSolutions = () =>
    store.solutions.filter((s) => canSee(s.visibility, role, s.ownerId === me));

  /** Invisible and absent are the same answer: a refusal would confirm it exists. */
  const findIdea = (id: string): Idea | null =>
    visibleIdeas().find((i) => i.id === id) ?? null;

  const findSolution = (id: string): Solution | null =>
    visibleSolutions().find((s) => s.id === id) ?? null;

  const requireIdea = (id: string): Idea => {
    const found = findIdea(id);
    if (!found) throw new AppError(`Idea ${id} not found`, { category: "notFound" });
    return found;
  };

  const requireSolution = (id: string): Solution => {
    const found = findSolution(id);
    if (!found) throw new AppError(`Solution ${id} not found`, { category: "notFound" });
    return found;
  };

  const requireReviewer = () => {
    if (!canReview(role)) {
      throw new AppError("Approver role required", { category: "permission" });
    }
  };

  /**
   * The solution, if the caller may author its roadmap.
   *
   * Ordered so an invisible solution reports "not found" before a permission error
   * could confirm it exists — same reason `requireSolution` exists at all.
   */
  const requireRoadmapEditor = (solutionId: string): Solution => {
    const solution = requireSolution(solutionId);
    if (!canEditSolution(role, sameUser(solution.ownerId, me))) {
      throw new AppError("Only the owner or a reviewer can change the roadmap", {
        category: "permission",
      });
    }
    return solution;
  };

  const requireIssue = (solutionId: string, issueId: string): SolutionIssue => {
    const found = store.solutionIssues.find(
      (i) => i.id === issueId && i.solutionId === solutionId,
    );
    if (!found) throw new AppError(`Issue ${issueId} not found`, { category: "notFound" });
    return found;
  };

  const requireMilestone = (solutionId: string, milestoneId: string): Milestone => {
    const found = store.milestones.find(
      (m) => m.id === milestoneId && m.solutionId === solutionId,
    );
    if (!found) {
      throw new AppError(`Milestone ${milestoneId} not found`, { category: "notFound" });
    }
    return found;
  };

  // -------------------------------------------------------------------------
  // Counting
  // -------------------------------------------------------------------------

  const votesFor = (key: string): MemoryVote[] => store.votes.filter((v) => v.targetKey === key);

  const since = (days: number): number => Date.now() - days * 24 * 60 * 60 * 1000;

  // No audience filtering: comments are public to anyone who can see the item.
  const commentsFor = (subjectId: string): Comment[] =>
    store.comments.filter((c) => c.subjectId === subjectId);

  // Every link is reviewer-created, so there is no approval state to filter on.
  const allLinks = () => store.links;

  const voteSummaryFor = (target: HubItemRef): VoteSummary => {
    const cast = votesFor(targetKey(target));
    return {
      itemType: target.itemType,
      itemId: target.itemId,
      count: cast.length,
      votedByMe: cast.some((v) => v.userId === me),
    };
  };

  // -------------------------------------------------------------------------
  // Sorting and paging
  // -------------------------------------------------------------------------

  function paginate<T>(rows: T[], page?: number, pageSize?: number): PageResult<T> {
    if (!pageSize) return { items: clone(rows), total: rows.length };
    const current = page ?? 1;
    const start = (current - 1) * pageSize;
    const slice = rows.slice(start, start + pageSize);
    return {
      items: clone(slice),
      total: rows.length,
      nextPage: start + pageSize < rows.length ? current + 1 : undefined,
    };
  }

  const matchesText = (haystack: string[], needle?: string): boolean => {
    if (!needle) return true;
    const lowered = needle.toLowerCase();
    return haystack.some((value) => value.toLowerCase().includes(lowered));
  };

  return {
    // -----------------------------------------------------------------------
    // Identity
    // -----------------------------------------------------------------------
    identity: {
      async getCurrentUser(): Promise<CurrentUser | null> {
        const user = store.users.find((u) => u.id === me);
        if (!user) return settle(null);
        return settle({
          id: user.id,
          sub: user.id,
          email: user.email ?? "",
          displayName: user.displayName ?? user.id,
          createdAt: "2026-01-01T00:00:00Z",
          role,
        });
      },

      async resolveUsers(ids: string[]): Promise<UserRef[]> {
        return settle(clone(store.users.filter((u) => ids.includes(u.id))));
      },
    },

    // -----------------------------------------------------------------------
    // Ideas
    // -----------------------------------------------------------------------
    ideas: {
      async listIdeas(query?: IdeaQuery): Promise<PageResult<Idea>> {
        let rows = visibleIdeas();

        if (query?.mineOnly) rows = rows.filter((i) => i.submittedBy === me);
        if (query?.submittedBy) rows = rows.filter((i) => i.submittedBy === query.submittedBy);
        if (query?.statuses?.length) rows = rows.filter((i) => query.statuses!.includes(i.status));
        if (query?.tags?.length) {
          rows = rows.filter((i) => query.tags!.some((tag) => i.tags.includes(tag)));
        }
        rows = rows.filter((i) => matchesText([i.title, i.description, ...i.tags], query?.search));

        const descending = query?.sort?.descending ?? true;
        const direction = descending ? -1 : 1;
        rows = [...rows].sort((a, b) => {
          switch (query?.sort?.field) {
            case "title":
              return a.title.localeCompare(b.title) * direction;
            case "status":
              return a.status.localeCompare(b.status) * direction;
            case "votes":
              return (votesFor(`request:${a.id}`).length - votesFor(`request:${b.id}`).length) * direction;
            case "updated":
              return a.updatedAt.localeCompare(b.updatedAt) * direction;
            default:
              return a.createdAt.localeCompare(b.createdAt) * direction;
          }
        });

        return settle(paginate(rows, query?.page, query?.pageSize));
      },

      async getIdea(id: string): Promise<Idea | null> {
        const found = findIdea(id);
        return settle(found ? clone(found) : null);
      },

      async createIdea(input: CreateIdeaInput): Promise<Idea> {
        const created: Idea = {
          id: nextId("i"),
          type: input.type,
          status: "Created",
          title: input.title,
          description: input.description,
          submittedBy: me,
          canonicalSolutionId: null,
          createdAt: now(),
          updatedAt: now(),
          visibility: "Everyone",
          tags: normalizeTags(input.tags ?? []),
        };
        store.ideas.push(created);
        return settle(clone(created));
      },

      async updateIdea(id: string, patch: UpdateIdeaInput): Promise<Idea> {
        const existing = requireIdea(id);
        if (patch.title !== undefined) existing.title = patch.title;
        if (patch.description !== undefined) existing.description = patch.description;
        if (patch.tags !== undefined) existing.tags = normalizeTags(patch.tags);
        existing.updatedAt = now();
        return settle(clone(existing));
      },

      async listLinkedSolutions(ideaId: string): Promise<Solution[]> {
        const ids = allLinks().filter((l) => l.ideaId === ideaId).map((l) => l.solutionId);
        return settle(clone(visibleSolutions().filter((s) => ids.includes(s.id))));
      },

      async getIdeaRollups(ids?: string[]): Promise<RollupMap<IdeaRollup>> {
        const rows = visibleIdeas().filter((i) => !ids || ids.includes(i.id));
        const cutoff = since(30);
        const map: RollupMap<IdeaRollup> = {};

        for (const item of rows) {
          const key = `request:${item.id}`;
          const cast = votesFor(key);
          const discussion = commentsFor(item.id);
          const contributors = new Set<string>([
            item.submittedBy,
            ...cast.map((v) => v.userId),
            ...discussion.map((c) => c.authorId),
          ]);

          map[item.id] = {
            votes: cast.length,
            votes30d: cast.filter((v) => Date.parse(v.createdAt) >= cutoff).length,
            votedByMe: cast.some((v) => v.userId === me),
            linkedSolutions: allLinks().filter((l) => l.ideaId === item.id).length,
            contributors: contributors.size,
            comments: discussion.length,
          };
        }
        return settle(map);
      },

      async setIdeaVisibility(id: string, visibility: ItemVisibility): Promise<Idea> {
        if (role !== "Administrator") {
          throw new AppError("Administrator role required", { category: "permission" });
        }
        const existing = store.ideas.find((i) => i.id === id);
        if (!existing) throw new AppError(`Idea ${id} not found`, { category: "notFound" });
        existing.visibility = visibility;
        existing.updatedAt = now();
        return settle(clone(existing));
      },
    },

    // -----------------------------------------------------------------------
    // Solutions
    // -----------------------------------------------------------------------
    solutions: {
      async listSolutions(query?: SolutionQuery): Promise<PageResult<Solution>> {
        let rows = visibleSolutions();

        if (query?.mineOnly) rows = rows.filter((s) => s.ownerId === me);
        if (query?.ownerId) rows = rows.filter((s) => s.ownerId === query.ownerId);
        if (query?.statuses?.length) rows = rows.filter((s) => query.statuses!.includes(s.status));
        if (query?.kinds?.length) rows = rows.filter((s) => query.kinds!.includes(s.type));
        if (query?.tags?.length) {
          rows = rows.filter((s) => query.tags!.some((tag) => s.tags.includes(tag)));
        }
        rows = rows.filter((s) => matchesText([s.title, s.description, ...s.tags], query?.search));

        const descending = query?.sort?.descending ?? true;
        const direction = descending ? -1 : 1;
        rows = [...rows].sort((a, b) => {
          switch (query?.sort?.field) {
            case "title":
              return a.title.localeCompare(b.title) * direction;
            case "adoptions":
              return (
                store.adoptions.filter((x) => x.solutionId === a.id).length -
                store.adoptions.filter((x) => x.solutionId === b.id).length
              ) * direction;
            case "votes":
              return (votesFor(`solution:${a.id}`).length - votesFor(`solution:${b.id}`).length) * direction;
            case "updated":
              return a.updatedAt.localeCompare(b.updatedAt) * direction;
            default:
              return a.createdAt.localeCompare(b.createdAt) * direction;
          }
        });

        return settle(paginate(rows, query?.page, query?.pageSize));
      },

      async getSolution(id: string): Promise<Solution | null> {
        const found = findSolution(id);
        return settle(found ? clone(found) : null);
      },

      async createSolution(input: CreateSolutionInput): Promise<Solution> {
        const created: Solution = {
          id: nextId("s"),
          title: input.title,
          description: input.description,
          type: input.solutionType,
          status: "AwaitingApproval",
          // Optional now: a Strategy has no repository, so these are absent rather
          // than empty. Empty strings would read as "a repository with no name".
          repositoryOwner: input.repositoryOwner ?? "",
          repositoryName: input.repositoryName ?? "",
          repositoryUrl: input.repositoryUrl ?? "",
          demoUrl: input.demoUrl ?? null,
          ownerId: me,
          useCount: 0,
          adoptedByProjects: [],
          createdAt: now(),
          updatedAt: now(),
          publishedAt: null,
          visibility: "Everyone",
          tags: normalizeTags(input.tags ?? []),
        };
        store.solutions.push(created);
        return settle(clone(created));
      },

      async updateSolution(id: string, patch: UpdateSolutionInput): Promise<Solution> {
        // requireSolution first: invisible and absent must stay indistinguishable,
        // so a permission error never confirms that something exists.
        const existing = requireSolution(id);
        if (!canEditSolution(role, sameUser(existing.ownerId, me))) {
          throw new AppError("Only the owner or a reviewer can edit this solution", {
            category: "permission",
          });
        }

        if (patch.description !== undefined) existing.description = patch.description;
        if (patch.tags !== undefined) existing.tags = normalizeTags(patch.tags);
        existing.updatedAt = now();
        return settle(clone(existing));
      },

      async listLinkedIdeas(solutionId: string): Promise<Idea[]> {
        const ids = allLinks().filter((l) => l.solutionId === solutionId).map((l) => l.ideaId);
        return settle(clone(visibleIdeas().filter((i) => ids.includes(i.id))));
      },

      async getSolutionRollups(ids?: string[]): Promise<RollupMap<SolutionRollup>> {
        const rows = visibleSolutions().filter((s) => !ids || ids.includes(s.id));
        const map: RollupMap<SolutionRollup> = {};

        for (const item of rows) {
          const uses = store.adoptions.filter((a) => a.solutionId === item.id);
          const cast = votesFor(`solution:${item.id}`);
          const teams = new Set(uses.map((u) => u.team ?? u.projectName));

          map[item.id] = {
            adoptions: uses.length,
            teams: teams.size,
            linkedNeeds: allLinks().filter((l) => l.solutionId === item.id).length,
            activeUses: uses.filter((u) => isActiveAdoption(u.status)).length,
            completedUses: uses.filter((u) => !isActiveAdoption(u.status)).length,
            votes: cast.length,
            votedByMe: cast.some((v) => v.userId === me),
            comments: commentsFor(item.id).length,
          };
        }
        return settle(map);
      },

      async setSolutionVisibility(id: string, visibility: ItemVisibility): Promise<Solution> {
        if (role !== "Administrator") {
          throw new AppError("Administrator role required", { category: "permission" });
        }
        const existing = store.solutions.find((s) => s.id === id);
        if (!existing) throw new AppError(`Solution ${id} not found`, { category: "notFound" });
        existing.visibility = visibility;
        existing.updatedAt = now();
        return settle(clone(existing));
      },

      // Both present, so the offline app exercises the tabs a host without them hides.
      issues: {
        async listIssues(solutionId: string): Promise<SolutionIssue[]> {
          requireSolution(solutionId);
          const rows = store.solutionIssues
            .filter((i) => i.solutionId === solutionId)
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
          return settle(clone(rows));
        },

        async createIssue(
          solutionId: string,
          input: CreateSolutionIssueInput,
        ): Promise<SolutionIssue> {
          // No role check by design: seeing a solution is the gate. Anything stricter
          // would defeat the point of an inbound channel.
          requireSolution(solutionId);
          if (!input.title.trim()) {
            throw new AppError("An issue needs a title", { category: "validation" });
          }

          const created: SolutionIssue = {
            id: nextId("iss"),
            solutionId,
            title: input.title.trim(),
            description: input.description ?? "",
            status: "To Do",
            reportedBy: me,
            assignedTo: null,
            createdAt: now(),
            updatedAt: now(),
          };
          store.solutionIssues.push(created);
          return settle(clone(created));
        },

        async updateIssue(
          solutionId: string,
          issueId: string,
          patch: UpdateSolutionIssueInput,
        ): Promise<SolutionIssue> {
          const solution = requireSolution(solutionId);
          const existing = requireIssue(solutionId, issueId);

          if (patch.status !== undefined && patch.status !== existing.status) {
            const allowed = canSetIssueStatus(
              patch.status,
              role,
              sameUser(solution.ownerId, me),
              sameUser(existing.reportedBy, me),
            );
            if (!allowed) {
              throw new AppError("Only the solution owner can triage this issue", {
                category: "permission",
              });
            }
            existing.status = patch.status;
          }

          if (patch.title !== undefined) existing.title = patch.title;
          if (patch.description !== undefined) existing.description = patch.description;
          existing.updatedAt = now();
          return settle(clone(existing));
        },
      },

      roadmap: {
        async listMilestones(solutionId: string): Promise<Milestone[]> {
          requireSolution(solutionId);
          // Cancelled is the tombstone deleteMilestone writes, so it never renders.
          const rows = store.milestones
            .filter((m) => m.solutionId === solutionId && m.status !== "Cancelled")
            .sort(compareMilestones);
          return settle(clone(rows));
        },

        async createMilestone(
          solutionId: string,
          input: CreateMilestoneInput,
        ): Promise<Milestone> {
          requireRoadmapEditor(solutionId);
          const created: Milestone = {
            id: nextId("ms"),
            solutionId,
            title: input.title.trim() || "New milestone",
            note: input.note ?? "",
            status: input.status ?? "Planned",
            targetDate: input.targetDate ?? null,
            targetLabel: input.targetLabel ?? "",
            createdAt: now(),
            updatedAt: now(),
          };
          store.milestones.push(created);
          return settle(clone(created));
        },

        async updateMilestone(
          solutionId: string,
          milestoneId: string,
          patch: UpdateMilestoneInput,
        ): Promise<Milestone> {
          requireRoadmapEditor(solutionId);
          const existing = requireMilestone(solutionId, milestoneId);

          if (patch.title !== undefined) existing.title = patch.title;
          if (patch.note !== undefined) existing.note = patch.note;
          if (patch.status !== undefined) existing.status = patch.status;
          if (patch.targetDate !== undefined) existing.targetDate = patch.targetDate;
          if (patch.targetLabel !== undefined) existing.targetLabel = patch.targetLabel;
          existing.updatedAt = now();
          return settle(clone(existing));
        },

        async deleteMilestone(solutionId: string, milestoneId: string): Promise<void> {
          requireRoadmapEditor(solutionId);
          const existing = requireMilestone(solutionId, milestoneId);
          // Soft, matching the Azure DevOps adapter, which has no DELETE verb.
          existing.status = "Cancelled";
          existing.updatedAt = now();
          await settle(undefined);
        },
      },
    },

    // -----------------------------------------------------------------------
    // Engagement
    // -----------------------------------------------------------------------
    engagement: {
      async getVoteSummary(target: HubItemRef): Promise<VoteSummary> {
        return settle(voteSummaryFor(target));
      },

      async addVote(target: HubItemRef): Promise<VoteSummary> {
        const key = targetKey(target);
        // Idempotent by uniqueness, matching the alternate key the real store uses.
        if (!store.votes.some((v) => v.targetKey === key && v.userId === me)) {
          store.votes.push({ targetKey: key, userId: me, createdAt: now() });
        }
        return settle(voteSummaryFor(target));
      },

      async removeVote(target: HubItemRef): Promise<VoteSummary> {
        const key = targetKey(target);
        const index = store.votes.findIndex((v) => v.targetKey === key && v.userId === me);
        if (index >= 0) store.votes.splice(index, 1);
        return settle(voteSummaryFor(target));
      },

      async listAdoptions(solutionId: string): Promise<Adoption[]> {
        requireSolution(solutionId);
        return settle(clone(store.adoptions.filter((a) => a.solutionId === solutionId)));
      },

      async startAdoption(solutionId: string, input: StartAdoptionInput): Promise<Adoption> {
        requireSolution(solutionId);
        const created: Adoption = {
          id: nextId("a"),
          solutionId,
          startedBy: me,
          projectName: input.projectName,
          team: input.team ?? null,
          status: input.status ?? "Exploring",
          startedAt: now(),
          updatedAt: now(),
          completedAt: null,
        };
        store.adoptions.push(created);
        return settle(clone(created));
      },

      async updateAdoption(
        solutionId: string,
        adoptionId: string,
        patch: UpdateAdoptionInput,
      ): Promise<Adoption> {
        const existing = store.adoptions.find(
          (a) => a.id === adoptionId && a.solutionId === solutionId,
        );
        if (!existing) throw new AppError(`Adoption ${adoptionId} not found`, { category: "notFound" });

        if (patch.status !== undefined) existing.status = patch.status;
        if (patch.projectName !== undefined) existing.projectName = patch.projectName;
        if (patch.team !== undefined) existing.team = patch.team;
        existing.updatedAt = now();
        return settle(clone(existing));
      },

      async completeAdoption(solutionId: string, adoptionId: string): Promise<Adoption> {
        const existing = store.adoptions.find(
          (a) => a.id === adoptionId && a.solutionId === solutionId,
        );
        if (!existing) throw new AppError(`Adoption ${adoptionId} not found`, { category: "notFound" });

        existing.status = "Using";
        existing.completedAt = now();
        existing.updatedAt = now();
        return settle(clone(existing));
      },

      async requestParticipation(input: RequestParticipationInput): Promise<Participation> {
        const created: Participation = {
          id: nextId("p"),
          itemType: input.itemType,
          itemId: input.itemId,
          requestedBy: me,
          message: input.message,
          status: "Proposed",
          decidedBy: null,
          rationale: null,
          createdAt: now(),
          updatedAt: now(),
          decidedAt: null,
        };
        store.participation.push(created);
        return settle(clone(created));
      },

      async listMyParticipation(): Promise<Participation[]> {
        return settle(clone(store.participation.filter((p) => p.requestedBy === me)));
      },

      async withdrawParticipation(id: string): Promise<Participation> {
        const existing = store.participation.find((p) => p.id === id && p.requestedBy === me);
        if (!existing) throw new AppError(`Participation ${id} not found`, { category: "notFound" });
        existing.status = "Withdrawn";
        existing.updatedAt = now();
        return settle(clone(existing));
      },
    },

    // -----------------------------------------------------------------------
    // Collaboration
    // -----------------------------------------------------------------------
    collaboration: {
      async listComments(subject: HubItemRef): Promise<Comment[]> {
        return settle(clone(commentsFor(subject.itemId)));
      },

      async addComment(input: AddCommentInput): Promise<Comment> {
        const created: Comment = {
          id: nextId("c"),
          subjectId: input.subjectId,
          subjectType: input.subjectType,
          authorId: me,
          body: input.body,
          attachments: [],
          createdAt: now(),
        };
        store.comments.push(created);
        return settle(clone(created));
      },

      async uploadAttachment(input: UploadAttachmentInput): Promise<Attachment> {
        const length = Math.floor((input.contentBase64.length * 3) / 4);
        if (length > MAX_ATTACHMENT_BYTES) {
          throw new AppError("Attachment exceeds the 10 MB limit", { category: "validation" });
        }
        return settle({
          id: nextId("att"),
          fileName: input.fileName,
          contentType: input.contentType ?? "application/octet-stream",
          length,
        });
      },

      async getAttachment(): Promise<Attachment | null> {
        return settle(null);
      },

      async listActivity(query?: ActivityQuery): Promise<ActivityEntry[]> {
        const visibleSubjects = new Set([
          ...visibleIdeas().map((i) => i.id),
          ...visibleSolutions().map((s) => s.id),
        ]);

        let rows = store.activity.filter((entry) => visibleSubjects.has(entry.subjectId));
        if (!canReview(role)) rows = rows.filter((entry) => entry.audience !== "ApproversOnly");
        if (query?.subjectId) rows = rows.filter((entry) => entry.subjectId === query.subjectId);

        rows = [...rows].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
        return settle(clone(rows.slice(0, query?.take ?? 50)));
      },
    },

    // -----------------------------------------------------------------------
    // Approvals
    // -----------------------------------------------------------------------
    approvals: {
      async getInbox(): Promise<ApprovalInbox> {
        // Degraded rather than thrown: an approvals surface a submitter cannot use
        // should render empty, not break the page around it.
        if (!canReview(role)) {
          return settle({ ideas: [], solutions: [], unavailable: "permission" });
        }

        return settle({
          ideas: clone(visibleIdeas().filter((i) => i.status === "AwaitingApproval")),
          solutions: clone(visibleSolutions().filter((s) => s.status === "AwaitingApproval")),
        });
      },

      async acceptIdea(id: string, rationale: string): Promise<Idea> {
        return settle(decideIdea(id, "Accepted", rationale));
      },

      async rejectIdea(id: string, rationale: string): Promise<Idea> {
        return settle(decideIdea(id, "Rejected", rationale));
      },

      async acceptSolution(id: string, rationale: string): Promise<Solution> {
        return settle(decideSolution(id, "Published", rationale));
      },

      async rejectSolution(id: string, rationale: string): Promise<Solution> {
        return settle(decideSolution(id, "Rejected", rationale));
      },

      async listDecisions(ideaId: string): Promise<Decision[]> {
        return settle(decisions.filter((d) => d.subjectId === ideaId).map(clone));
      },

      async linkSolution(ideaId: string, solutionId: string): Promise<IdeaSolutionLink> {
        requireReviewer();
        requireIdea(ideaId);
        requireSolution(solutionId);

        const existing = store.links.find(
          (l) => l.ideaId === ideaId && l.solutionId === solutionId,
        );
        if (existing) return settle(clone(existing));

        const created: IdeaSolutionLink = { ideaId, solutionId, addedBy: me, addedAt: now() };
        store.links.push(created);
        return settle(clone(created));
      },

      async unlinkSolution(ideaId: string, solutionId: string): Promise<void> {
        requireReviewer();
        const index = store.links.findIndex(
          (l) => l.ideaId === ideaId && l.solutionId === solutionId,
        );
        if (index >= 0) store.links.splice(index, 1);
        return settle(undefined);
      },

      async selectCanonicalSolution(ideaId: string, solutionId: string): Promise<Idea> {
        requireReviewer();
        const item = requireIdea(ideaId);
        requireSolution(solutionId);
        item.canonicalSolutionId = solutionId;
        item.updatedAt = now();
        return settle(clone(item));
      },
    },

    // -----------------------------------------------------------------------
    // Search
    // -----------------------------------------------------------------------
    async search(query: SearchQuery): Promise<SearchResult> {
      const needle = query.query.trim();

      const ideaRows: SearchItem[] = visibleIdeas()
        .filter((i) => matchesText([i.title, i.description, ...i.tags], needle))
        .map((i) => ({
          itemType: "Idea",
          itemId: i.id,
          title: i.title,
          description: i.description,
          status: i.status,
          canonicalSolutionId: i.canonicalSolutionId,
          repositoryUrl: null,
          team: null,
          createdAt: i.createdAt,
          updatedAt: i.updatedAt,
          subtype: i.type,
          submittedBy: i.submittedBy,
          visibility: i.visibility,
          tags: i.tags,
        }));

      const solutionRows: SearchItem[] = visibleSolutions()
        .filter((s) => matchesText([s.title, s.description, ...s.tags], needle))
        .map((s) => ({
          itemType: "Solution",
          itemId: s.id,
          title: s.title,
          description: s.description,
          status: s.status,
          canonicalSolutionId: null,
          repositoryUrl: s.repositoryUrl,
          team: null,
          createdAt: s.createdAt,
          updatedAt: s.updatedAt,
          subtype: s.type,
          submittedBy: s.ownerId,
          visibility: s.visibility,
          tags: s.tags,
        }));

      const all = [...ideaRows, ...solutionRows];
      const skip = query.skip ?? 0;
      const take = query.take ?? 25;
      return settle({ items: clone(all.slice(skip, skip + take)), totalCount: all.length });
    },
  };

  // -------------------------------------------------------------------------
  // Decision helpers (closures over the store)
  // -------------------------------------------------------------------------

  function decideIdea(id: string, status: Idea["status"], rationale: string): Idea {
    requireReviewer();
    if (!rationale.trim()) {
      throw new AppError("A rationale is required", { category: "validation" });
    }
    const item = requireIdea(id);
    item.status = status;
    item.updatedAt = now();
    decisions.push({
      id: nextId("d"),
      subjectId: id,
      approverId: me,
      decision: status === "Accepted" ? "Accept" : "Reject",
      rationale,
      decidedAt: now(),
    });
    return clone(item);
  }

  function decideSolution(id: string, status: Solution["status"], rationale: string): Solution {
    requireReviewer();
    if (!rationale.trim()) {
      throw new AppError("A rationale is required", { category: "validation" });
    }
    const item = requireSolution(id);
    item.status = status;
    item.publishedAt = status === "Published" ? now() : item.publishedAt;
    item.updatedAt = now();
    decisions.push({
      id: nextId("d"),
      subjectId: id,
      approverId: me,
      decision: status === "Published" ? "Accept" : "Reject",
      rationale,
      decidedAt: now(),
    });
    return clone(item);
  }

}
