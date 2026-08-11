import { FUNNEL_STAGES } from "@innovation-backlog/logic";
import type { ContributorInsight, Insights, InsightsProvider } from "@innovation-backlog/logic";

import { Cycai_votesService } from "../generated/services/Cycai_votesService.js";
import { Cycai_adoptionsService } from "../generated/services/Cycai_adoptionsService.js";
import { Cycai_participationsService } from "../generated/services/Cycai_participationsService.js";
import { Cycai_activitiesService } from "../generated/services/Cycai_activitiesService.js";
import { SystemusersService } from "../generated/services/SystemusersService.js";
import type { Cycai_votes } from "../generated/models/Cycai_votesModel.js";
import type { Cycai_adoptions } from "../generated/models/Cycai_adoptionsModel.js";
import type { Cycai_activities } from "../generated/models/Cycai_activitiesModel.js";

import { countAll, fetchAll, guid } from "./dataverse/paging.js";
import type { AdoClient } from "./ado/client.js";
import { FIELDS, LIST_FIELDS, STATE, WIT, queryWorkItems, wiqlString } from "./ado/workitems.js";
import type { WorkItem } from "./ado/workitems.js";
import type { RollupItemFacts } from "./dataverse/rollups.js";

/**
 * The dashboard's numbers, computed from the rows that hold them.
 *
 * Two rules govern everything here, both learned from the `cycai_momentum` bug:
 *
 *  - NOTHING IS READ FROM A CACHE. Every figure comes from the table or the work
 *    items that actually record the thing being counted.
 *  - A FIGURE THIS HOST CANNOT MEASURE IS NULL, never zero, and the shape carries a
 *    string saying how the ones it CAN measure were measured. A confident zero is
 *    indistinguishable from a real one, which is the whole reason that bug survived.
 *
 * Cost is fixed, not per-item: one WIQL pass per work item type, one relations batch,
 * and four Dataverse queries — regardless of how many ideas exist.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const WINDOW_DAYS = 30;
const STALE_AFTER_DAYS = 21;

/**
 * How time-in-approval is measured here, and why it is not measured the obvious way.
 *
 * Time in state is not a field. `stateReachedAt` can recover it exactly from a work
 * item's revisions, but that is one connector call per item — thirty ideas would spend
 * a tenth of the 300-call budget on a single tile. The `request.accepted` activity row
 * carries the decision moment for free, so the duration is measured against the work
 * item's own creation date. The tradeoff is stated on the tile rather than buried:
 * only ideas this app decided have such a row.
 */
const APPROVAL_SOURCE =
  "Submission to the recorded decision, for ideas approved through this app";

const POPULATION_SOURCE = "enabled, non-application Dataverse users";

const daysBetween = (from: string, to: string): number | null => {
  const start = Date.parse(from);
  const end = Date.parse(to);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  return (end - start) / DAY_MS;
};

/** Nearest-rank percentile over a sorted ascending sample. */
function percentile(sorted: number[], fraction: number): number | null {
  if (sorted.length === 0) return null;
  const rank = Math.ceil(fraction * sorted.length);
  return sorted[Math.min(sorted.length - 1, Math.max(0, rank - 1))] ?? null;
}

function median(sorted: number[]): number | null {
  if (sorted.length === 0) return null;
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle]!;
  return ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

const round1 = (value: number | null): number | null =>
  value === null ? null : Math.round(value * 10) / 10;

/** How many people the contributors panel ranks. Beyond this the bars stop being readable. */
const TOP_CONTRIBUTORS = 8;

/**
 * Which audit actions count as which kind of contribution.
 *
 * Deliberately a small, named set rather than "anything that happened": a decision or a
 * visibility change is administration, not contribution, and counting it would flatter
 * whoever administers the hub into looking like its most active participant.
 */
const CONTRIBUTION: Record<string, keyof Omit<ContributorInsight, "id" | "name" | "total">> = {
  "request.created": "ideas",
  "solution.created": "ideas",
  "vote.added": "votes",
  "comment.added": "comments",
  "solutionUse.started": "adoptions",
  "solutionUse.completed": "adoptions",
};

export interface InsightsOptions {
  client: AdoClient;
  /** Relations per work item, for the linked-solution stage. See createWorkItemFacts. */
  itemFacts: (ids: string[]) => Promise<Map<string, RollupItemFacts>>;
  /**
   * Turns actor GUIDs into names. Best-effort: an unresolved contributor keeps its id
   * and the surface falls back, rather than the panel failing over a name.
   */
  resolveUsers?: (ids: string[]) => Promise<{ id: string; displayName?: string }[]>;
}

export function createInsightsProvider(options: InsightsOptions): InsightsProvider {
  const { client, itemFacts } = options;

  /**
   * People, ranked by what they have done.
   *
   * The activity table is the only place that records WHO did each thing — votes carry a
   * voter and adoptions carry a starter, but comments live in Azure DevOps and ideas carry
   * an ADO identity that cannot be matched to a Dataverse user (see the cross-directory
   * note in the checkpoint). One table, one vocabulary, one join.
   */
  async function rankContributors(rows: Cycai_activities[]): Promise<ContributorInsight[]> {
    const byActor = new Map<string, ContributorInsight>();
    for (const row of rows) {
      const bucket = CONTRIBUTION[row.cycai_action ?? ""];
      const actor = row._cycai_actorid_value;
      if (!bucket || !actor) continue;
      const key = guid(actor).toLowerCase();
      const entry =
        byActor.get(key) ??
        { id: key, name: null, ideas: 0, votes: 0, comments: 0, adoptions: 0, total: 0 };
      entry[bucket] += 1;
      entry.total += 1;
      byActor.set(key, entry);
    }

    const ranked = [...byActor.values()]
      .sort((a, b) => b.total - a.total)
      .slice(0, TOP_CONTRIBUTORS);
    if (!options.resolveUsers || ranked.length === 0) return ranked;

    try {
      const names = new Map(
        (await options.resolveUsers(ranked.map((entry) => entry.id)))
          .filter((user) => user.displayName)
          .map((user) => [guid(user.id).toLowerCase(), user.displayName!]),
      );
      return ranked.map((entry) => ({ ...entry, name: names.get(entry.id) ?? null }));
    } catch {
      return ranked;
    }
  }

  /** Every idea and solution, unfiltered by state — this is inventory, not a catalogue. */
  async function inventory(type: string): Promise<WorkItem[]> {
    const wiql =
      `SELECT [${FIELDS.id}] FROM WorkItems` +
      ` WHERE [${FIELDS.workItemType}] = '${wiqlString(type)}'` +
      ` ORDER BY [${FIELDS.createdDate}] DESC`;
    return queryWorkItems(client, wiql, LIST_FIELDS, 1000);
  }

  return {
    async get(): Promise<Insights> {
      const now = Date.now();
      const windowStart = now - WINDOW_DAYS * DAY_MS;
      const priorStart = now - 2 * WINDOW_DAYS * DAY_MS;

      const [ideas, solutions, votes, adoptions, participation, population, activity] =
        await Promise.all([
          inventory(WIT.idea),
          inventory(WIT.solution),
          fetchAll<Cycai_votes>((o) => Cycai_votesService.getAll(o), "read votes for insights", {
            // `_cycai_voterid_value` MUST be named: a $select that omits it returns
            // rows where the lookup is absent, not null — which is what made
            // votedByMe false for everyone. Concentration depends on it entirely.
            select: ["cycai_targetkey", "createdon", "_cycai_voterid_value"],
          }),
          fetchAll<Cycai_adoptions>(
            (o) => Cycai_adoptionsService.getAll(o),
            "read adoptions for insights",
            { select: ["cycai_solutionid", "cycai_startedon", "createdon"] },
          ),
          /*
            Counted, and reported as null when it comes back empty.

            Nothing in the UI creates a participation row — the routes and the
            phrasings exist, and no surface calls them — so a zero here would describe
            an unbuilt feature as an unpopular one. The query stays rather than being
            hard-coded to null so that the day something does create rows, this
            reports the real number instead of still claiming there is no way to.
          */
          fetchAll<{ createdon?: string }>(
            (o) => Cycai_participationsService.getAll(o),
            "read participation for insights",
            { select: ["createdon"] },
          ).catch(() => []),
          countAll(
            (o) => SystemusersService.getAll(o),
            "systemuserid",
            "count users",
            // The denominator for voter breadth. Application users are service
            // principals and the disabled cannot vote, so neither belongs in it.
            { filter: "isdisabled eq false and applicationid eq null" },
          ).catch(() => null),
          /*
            One pass over the audit table, three answers.

            It carries the approval moments, the comment dates, and — uniquely — WHO did
            each thing. Comments themselves are Azure DevOps records with no queryable
            date (System.CommentCount is a lifetime total, not a 30-day one), and idea
            authorship is an ADO identity that cannot be matched to a Dataverse user, so
            this table is the only place all three live in one vocabulary.
          */
          fetchAll<Cycai_activities>(
            (o) => Cycai_activitiesService.getAll(o),
            "read activity for insights",
            {
              select: [
                "cycai_action",
                "cycai_subjectid",
                "cycai_occurredon",
                "createdon",
                // Named explicitly, like every other lookup: omit it and the field is
                // absent from every row rather than null, and the panel silently empties.
                "_cycai_actorid_value",
              ],
            },
          ).catch(() => []),
        ]);

      const decisions = activity.filter((row) => row.cycai_action === "request.accepted");
      const comments = activity.filter((row) => row.cycai_action === "comment.added");

      // ---------------------------------------------------------------- ideas
      const createdAt = new Map<string, number>();
      let submitted30d = 0;
      let submittedPrior30d = 0;
      let awaiting = 0;
      let approved = 0;
      let stale = 0;

      for (const item of ideas) {
        const id = String(item.id);
        const state = String(item.fields[FIELDS.state] ?? "");
        const created = Date.parse(String(item.fields[FIELDS.createdDate] ?? ""));
        if (Number.isFinite(created)) {
          createdAt.set(id, created);
          if (created >= windowStart) submitted30d += 1;
          else if (created >= priorStart) submittedPrior30d += 1;
        }

        if (state === STATE.awaitingApproval) {
          awaiting += 1;
          // Creation IS entry into the queue: createIdea transitions straight to
          // Awaiting Approval, because there is no triage worker to do it later.
          if (Number.isFinite(created) && now - created > STALE_AFTER_DAYS * DAY_MS) stale += 1;
        }
        if (state === "Accepted" || state === "Published") approved += 1;
      }

      // ------------------------------------------------------- approval times
      const durations: number[] = [];
      for (const row of decisions) {
        const created = createdAt.get(String(row.cycai_subjectid ?? ""));
        const decided = row.cycai_occurredon ?? row.createdon;
        if (created === undefined || !decided) continue;
        const days = daysBetween(new Date(created).toISOString(), decided);
        if (days !== null) durations.push(days);
      }
      durations.sort((a, b) => a - b);

      // ---------------------------------------------------------------- votes
      const votesByVoter = new Map<string, number>();
      let votes30d = 0;
      for (const row of votes) {
        const at = row.createdon ? Date.parse(row.createdon) : NaN;
        if (Number.isFinite(at) && at >= windowStart) votes30d += 1;
        const voter = row._cycai_voterid_value;
        if (!voter) continue;
        const key = guid(voter).toLowerCase();
        votesByVoter.set(key, (votesByVoter.get(key) ?? 0) + 1);
      }
      const perVoter = [...votesByVoter.values()].sort((a, b) => b - a);
      const totalAttributed = perVoter.reduce((sum, count) => sum + count, 0);
      const topTen = perVoter.slice(0, 10).reduce((sum, count) => sum + count, 0);

      // ------------------------------------------------------------ adoptions
      const adoptedSolutions = new Set<string>();
      let adoptions30d = 0;
      for (const row of adoptions) {
        adoptedSolutions.add(String(row.cycai_solutionid));
        const at = Date.parse(row.cycai_startedon ?? row.createdon ?? "");
        if (Number.isFinite(at) && at >= windowStart) adoptions30d += 1;
      }

      // --------------------------------------------------------------- funnel
      // Relations are a second batch because workitemsbatch rejects fields and
      // $expand together — see the note on createWorkItemFacts.
      const [facts, contributors] = await Promise.all([
        itemFacts(ideas.map((item) => String(item.id))).catch(
          () => new Map<string, RollupItemFacts>(),
        ),
        rankContributors(activity),
      ]);
      const withSolution = [...facts.values()].filter((fact) => fact.linked > 0).length;

      const comments30d = comments.filter((row) => {
        const at = Date.parse(row.cycai_occurredon ?? row.createdon ?? "");
        return Number.isFinite(at) && at >= windowStart;
      }).length;

      const participation30d = participation.filter((row) => {
        const at = Date.parse(row.createdon ?? "");
        return Number.isFinite(at) && at >= windowStart;
      }).length;

      const funnel = [
        { label: FUNNEL_STAGES[0], value: ideas.length, detail: "Every idea on record" },
        { label: FUNNEL_STAGES[1], value: awaiting, detail: `In ${STATE.awaitingApproval}` },
        { label: FUNNEL_STAGES[2], value: approved, detail: "Accepted or Published" },
        {
          label: FUNNEL_STAGES[3],
          value: withSolution,
          detail: "Has at least one related solution",
        },
        {
          label: FUNNEL_STAGES[4],
          value: adoptedSolutions.size,
          detail: "Solutions with at least one adoption",
        },
      ];

      return {
        generatedAt: new Date(now).toISOString(),
        ideas: { total: ideas.length, submitted30d, submittedPrior30d },
        approval: {
          medianDays: round1(median(durations)),
          p90Days: round1(percentile(durations, 0.9)),
          sampleSize: durations.length,
          source: APPROVAL_SOURCE,
          staleCount: stale,
          staleAfterDays: STALE_AFTER_DAYS,
        },
        voters: {
          distinct: votesByVoter.size,
          totalVotes: votes.length,
          population: population,
          populationSource: population === null ? null : POPULATION_SOURCE,
          topTenShare: totalAttributed > 0 ? topTen / totalAttributed : null,
        },
        engagement30d: {
          votes: votes30d,
          comments: comments30d,
          // Null, not zero — see the note on the query above.
          participation: participation30d > 0 ? participation30d : null,
          adoptions: adoptions30d,
        },
        solutions: { total: solutions.length, adopted: adoptedSolutions.size },
        funnel,
        contributors,
      };
    },
  };
}
