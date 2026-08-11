import type {
  HubItemType,
  InnovationBacklogProvider,
} from "@innovation-backlog/logic";

/**
 * Append to the activity feed when something actually happens.
 *
 * Nothing wrote `cycai_activity`, so the feed was permanently empty — the read path
 * was complete and had simply never had anything to read. In the hosted product a
 * backend handler records this on every mutation; there is no backend here, so the
 * adapter has to do it.
 *
 * A decorator rather than a write inside each operation, for two reasons. The
 * mutations are split across two backing stores (ideas and decisions in Azure DevOps,
 * votes and adoption in Dataverse) and neither adapter should have to know about a
 * table owned by the other. And keeping it in one place means the set of things that
 * count as activity is a list you can read, instead of a call sprinkled through
 * twenty methods where a missing one is invisible.
 *
 * Recording is strictly best-effort: a failed append must never fail the operation
 * the user asked for. Losing a feed entry is a blemish; losing their submitted idea
 * because the feed write failed is not.
 */

export interface ActivityWriter {
  record(entry: {
    action: string;
    subjectType: HubItemType;
    subjectId: string;
    summary: string;
  }): Promise<void>;
}

/**
 * Action keys, matching `activityPhrase` in the shared UI.
 *
 * These are the stored vocabulary, not display text — the feed phrases itself from
 * the key, so an unrecognised one degrades to "made an update" rather than breaking.
 */
const ACTION = {
  ideaCreated: "request.created",
  ideaUpdated: "request.updated",
  ideaAccepted: "request.accepted",
  ideaRejected: "request.rejected",
  solutionCreated: "solution.created",
  solutionPublished: "solution.published",
  solutionRejected: "solution.rejected",
  voteAdded: "vote.added",
  voteRemoved: "vote.removed",
  commentAdded: "comment.added",
  adoptionStarted: "solutionUse.started",
  adoptionUpdated: "solutionUse.updated",
  adoptionCompleted: "solutionUse.completed",
  solutionLinked: "request.solutionLinked",
  solutionUnlinked: "request.solutionUnlinked",
  canonicalSelected: "request.canonicalSelected",
} as const;

export function withActivity(
  provider: InnovationBacklogProvider,
  writer: ActivityWriter,
): InnovationBacklogProvider {
  /**
   * Fire-and-forget: never rejects, never delays the caller's result.
   *
   * Non-fatal is not the same as invisible. Swallowing the reason outright makes a
   * failing write indistinguishable from no write at all, which is exactly how an
   * empty feed turns into guesswork — so the failure is logged even though it is
   * deliberately not surfaced to the user.
   */
  const note = (
    action: string,
    subjectType: HubItemType,
    subjectId: string,
    summary = "",
  ): void => {
    void writer.record({ action, subjectType, subjectId, summary }).catch((cause: unknown) => {
      console.warn(
        `[activity] failed to record ${action} for ${subjectType} ${subjectId}:`,
        cause,
      );
    });
  };

  /** Blank rather than whitespace: the reader treats an empty summary as "no team". */
  const teamOf = (team: string | null | undefined): string => (team ?? "").trim();

  const { ideas, solutions, approvals, engagement, collaboration } = provider;

  return {
    ...provider,

    ideas: {
      ...ideas,
      async createIdea(input) {
        const created = await ideas.createIdea(input);
        note(ACTION.ideaCreated, "Idea", created.id, created.title);
        return created;
      },
      async updateIdea(id, patch) {
        const updated = await ideas.updateIdea(id, patch);
        note(ACTION.ideaUpdated, "Idea", id, updated.title);
        return updated;
      },
    },

    solutions: {
      ...solutions,
      async createSolution(input) {
        const created = await solutions.createSolution(input);
        note(ACTION.solutionCreated, "Solution", created.id, created.title);
        return created;
      },
    },

    approvals: {
      ...approvals,
      async acceptIdea(id, rationale) {
        const result = await approvals.acceptIdea(id, rationale);
        note(ACTION.ideaAccepted, "Idea", id, rationale);
        return result;
      },
      async rejectIdea(id, rationale) {
        const result = await approvals.rejectIdea(id, rationale);
        note(ACTION.ideaRejected, "Idea", id, rationale);
        return result;
      },
      async acceptSolution(id, rationale) {
        const result = await approvals.acceptSolution(id, rationale);
        note(ACTION.solutionPublished, "Solution", id, rationale);
        return result;
      },
      async rejectSolution(id, rationale) {
        const result = await approvals.rejectSolution(id, rationale);
        note(ACTION.solutionRejected, "Solution", id, rationale);
        return result;
      },
      async linkSolution(ideaId, solutionId) {
        const result = await approvals.linkSolution(ideaId, solutionId);
        note(ACTION.solutionLinked, "Idea", ideaId);
        return result;
      },
      async unlinkSolution(ideaId, solutionId) {
        await approvals.unlinkSolution(ideaId, solutionId);
        note(ACTION.solutionUnlinked, "Idea", ideaId);
      },
      async selectCanonicalSolution(ideaId, solutionId) {
        const result = await approvals.selectCanonicalSolution(ideaId, solutionId);
        note(ACTION.canonicalSelected, "Idea", ideaId);
        return result;
      },
    },

    engagement: {
      ...engagement,
      async addVote(target) {
        const result = await engagement.addVote(target);
        note(ACTION.voteAdded, target.itemType, target.itemId);
        return result;
      },
      async removeVote(target) {
        const result = await engagement.removeVote(target);
        note(ACTION.voteRemoved, target.itemType, target.itemId);
        return result;
      },
      /*
        The team is the summary for every adoption row.

        StartAdoptionInput has carried `team` all along and the recorder was throwing
        it away, which is why the feed said "started using" with no object and no
        context. The summary is the only channel it has — the row stores an action key
        and a subject, and neither can say who a rollout was for.

        Team ONLY, never the project name. The reader phrases it as "on behalf of the
        X team", and a project ("Northwind RFP response") is not a team. An adoption
        with no team therefore records no summary and reads exactly as it did before,
        which is also what every row written before this change does.
      */
      async startAdoption(solutionId, input) {
        const result = await engagement.startAdoption(solutionId, input);
        note(ACTION.adoptionStarted, "Solution", solutionId, teamOf(input.team ?? result.team));
        return result;
      },
      async updateAdoption(solutionId, adoptionId, patch) {
        const result = await engagement.updateAdoption(solutionId, adoptionId, patch);
        note(ACTION.adoptionUpdated, "Solution", solutionId, teamOf(patch.team ?? result.team));
        return result;
      },
      async completeAdoption(solutionId, adoptionId) {
        const result = await engagement.completeAdoption(solutionId, adoptionId);
        note(ACTION.adoptionCompleted, "Solution", solutionId, teamOf(result.team));
        return result;
      },
    },

    collaboration: {
      ...collaboration,
      async addComment(input) {
        const created = await collaboration.addComment(input);
        note(ACTION.commentAdded, input.subjectType, input.subjectId, input.body);
        return created;
      },
    },
  };
}
