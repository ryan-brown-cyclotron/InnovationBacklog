import type { HubItemType, IdeaRollup, RollupMap, SolutionRollup } from "@innovation-backlog/logic";
import { targetKey } from "@innovation-backlog/logic";
import { Cycai_votesService } from "../../generated/services/Cycai_votesService.js";
import { Cycai_adoptionsService } from "../../generated/services/Cycai_adoptionsService.js";
import type { Cycai_votes } from "../../generated/models/Cycai_votesModel.js";
import type { Cycai_adoptions } from "../../generated/models/Cycai_adoptionsModel.js";
import { adoptionStatusOf } from "./engagement.js";
import { anyOf, fetchAll, guid } from "./paging.js";

/**
 * Engagement counts, computed from the rows that actually record the engagement.
 *
 * This used to read `cycai_momentum`, a precomputed rollup table — and NOTHING HAS
 * EVER WRITTEN TO IT. There is no plugin, flow or worker behind the code app, and the
 * adapter only ever read the table, so every count it produced was zero. Adoption in
 * particular was invisible on Home while `cycai_adoption` held the rows proving it.
 *
 * The web app's /api/requests|solutions/summary computes the same numbers live from
 * the same kind of source rows, so computing them here is also what makes the two
 * hosts agree. Where they cannot agree the difference is called out below.
 *
 * Cost is bounded and does not grow with the number of items on the page: two
 * Dataverse queries (votes, adoptions) and one Azure DevOps batch, whatever the row
 * count. `$apply`/`groupby` is deliberately not used — the SDK's IGetAllOptions has no
 * field for it — so the grouping is done here over a filtered fetch.
 *
 * `cycai_momentum` is left in the schema, unwritten. It is a plausible cache if these
 * queries ever become the bottleneck, but a cache that is never invalidated is worse
 * than no cache, which is exactly the bug this replaces.
 */

/** Facts only Azure DevOps can answer. See `createWorkItemFacts` in ado/workitems.ts. */
export interface RollupItemFacts {
  linked: number;
  comments: number;
  submittedBy: string;
}

export interface RollupOptions {
  currentUserId: () => Promise<string | null>;
  /**
   * Links and comment counts, injected rather than imported so this module stays
   * free of the connector — the same arrangement collaboration.ts uses for comments.
   */
  itemFacts: (ids: string[]) => Promise<Map<string, RollupItemFacts>>;
  /**
   * Best-effort systemuser -> email, used only to tell whether an item's author is
   * already among its voters. Absent resolution costs accuracy on one number, never
   * the rollup.
   */
  resolveUsers?: (ids: string[]) => Promise<{ id: string; email?: string }[]>;
}

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

function keysFor(itemType: HubItemType, ids: string[]): string[] {
  return ids.map((itemId) => targetKey({ itemType, itemId }));
}

interface VoteFacts {
  count: number;
  recent: number;
  mine: boolean;
  voterIds: Set<string>;
}

const emptyVotes = (): VoteFacts => ({ count: 0, recent: 0, mine: false, voterIds: new Set() });

/**
 * Vote rows for the whole page, grouped by target key.
 *
 * One query, not two. The previous version fetched counts from the rollup table and
 * then made a second query for the caller's own votes; the rows carry the voter, so
 * `votedByMe` falls out of the same fetch.
 */
async function voteFacts(keys: string[], myUserId: string | null): Promise<Map<string, VoteFacts>> {
  const grouped = new Map<string, VoteFacts>();
  if (keys.length === 0) return grouped;

  const rows = await fetchAll<Cycai_votes>((o) => Cycai_votesService.getAll(o), "read votes", {
    /*
      `_cycai_voterid_value` must be named explicitly.

      Verified against the live environment: with a $select that omits it, the lookup
      is simply absent from every row — not null, absent — so `votedByMe` was false
      for everyone and the contributor count was one short per voter. Same trap as the
      lookup display names, which are also missing unless asked for.
    */
    select: ["cycai_targetkey", "createdon", "_cycai_voterid_value"],
    filter: anyOf("cycai_targetkey", keys),
  });

  const mineId = myUserId ? guid(myUserId).toLowerCase() : null;
  const cutoff = Date.now() - THIRTY_DAYS_MS;

  for (const row of rows) {
    const facts = grouped.get(row.cycai_targetkey) ?? emptyVotes();
    facts.count += 1;

    // A row with no parseable createdon is counted as a vote but not a recent one:
    // "in the last 30 days" is a claim, and an unknown date cannot support it.
    const at = row.createdon ? Date.parse(row.createdon) : NaN;
    if (Number.isFinite(at) && at >= cutoff) facts.recent += 1;

    const voter = row._cycai_voterid_value;
    if (voter) {
      const normalized = guid(voter).toLowerCase();
      facts.voterIds.add(normalized);
      if (mineId && normalized === mineId) facts.mine = true;
    }

    grouped.set(row.cycai_targetkey, facts);
  }
  return grouped;
}

interface AdoptionFacts {
  adoptions: number;
  teams: number;
  activeUses: number;
  completedUses: number;
}

/** A tombstone: the row is retained for history and counted nowhere. */
const isWithdrawn = (row: Cycai_adoptions) => adoptionStatusOf(row) === "Withdrawn";

/**
 * Adoption rows for the whole page, grouped by solution id.
 *
 * Two details are copied from the .NET summary endpoint rather than invented, because
 * a rollup that means something different per host is worse than one that is wrong in
 * both:
 *
 *  - `teams` counts DISTINCT `team ?? projectName`, case-insensitively. Four adoptions
 *    across three teams is three, and an adoption with no team still counts as one
 *    team via its project.
 *  - active vs completed is decided by the COMPLETION TIMESTAMP, not the status
 *    choice. `completeAdoption` happens to set status Using as well, but the status
 *    is a workflow stage and the timestamp is the fact.
 *
 * Withdrawn rows are the one case the timestamp cannot decide, and they count in
 * NOTHING — not `adoptions`, not `teams`, not the active/completed split. A withdrawal
 * says the adoption is not real, so leaving it in `adoptions` while dropping it from
 * the panel's list would make the tab header disagree with its own rows.
 */
async function adoptionFacts(ids: string[]): Promise<Map<string, AdoptionFacts>> {
  const grouped = new Map<string, AdoptionFacts>();
  if (ids.length === 0) return grouped;

  const numeric = ids.map(Number).filter((id) => Number.isFinite(id));
  if (numeric.length === 0) return grouped;

  const rows = await fetchAll<Cycai_adoptions>(
    (o) => Cycai_adoptionsService.getAll(o),
    "read adoptions",
    {
      /*
        `cycai_adoptionstatus` must be named here, and the trap is the same one
        `_cycai_voterid_value` documents above: a field left out of the $select is
        ABSENT from the row, not null. Absent reads as "no status", which falls back to
        Exploring — so every withdrawn adoption would silently count as an active one,
        and the count the panel shows would never drop.
      */
      select: [
        "cycai_solutionid",
        "cycai_team",
        "cycai_projectname",
        "cycai_completedon",
        "cycai_adoptionstatus",
      ],
      filter: anyOf("cycai_solutionid", numeric),
    },
  );

  const teamsBySolution = new Map<string, Set<string>>();
  for (const row of rows) {
    if (isWithdrawn(row)) continue;
    const id = String(row.cycai_solutionid);
    const facts = grouped.get(id) ?? { adoptions: 0, teams: 0, activeUses: 0, completedUses: 0 };
    facts.adoptions += 1;
    if (row.cycai_completedon) facts.completedUses += 1;
    else facts.activeUses += 1;
    grouped.set(id, facts);

    const label = (row.cycai_team || row.cycai_projectname || "").trim().toLowerCase();
    if (label) {
      const teams = teamsBySolution.get(id) ?? new Set<string>();
      teams.add(label);
      teamsBySolution.set(id, teams);
    }
  }

  for (const [id, teams] of teamsBySolution) {
    const facts = grouped.get(id);
    if (facts) facts.teams = teams.size;
  }
  return grouped;
}

export function createRollupReader(options: RollupOptions) {
  /**
   * Distinct people who have engaged with an idea: its voters plus its author.
   *
   * The two arrive in different id spaces — voters are Dataverse systemuser GUIDs,
   * the author is an Azure DevOps UPN off System.CreatedBy — so the union needs the
   * voters' email addresses to know whether the author is already counted. That
   * lookup is one batched query for every voter on the page, and it is best-effort:
   * if it fails, the author is assumed distinct, which can overstate by one rather
   * than fail the page.
   *
   * KNOWN DIFFERENCE from the web app, which unions voters, COMMENTERS and the
   * author. Distinct commenters are not available here without one Azure DevOps call
   * per item, and the connector's budget does not allow that. Comment COUNT is
   * exact; the contributor number can therefore be lower than the web app's when
   * somebody commented without voting.
   */
  async function contributorCounter(
    voterIds: Set<string>,
  ): Promise<(votes: VoteFacts, submittedBy: string) => number> {
    if (!options.resolveUsers || voterIds.size === 0) {
      return (votes, submittedBy) => votes.voterIds.size + (submittedBy ? 1 : 0);
    }

    let emailById = new Map<string, string>();
    try {
      const users = await options.resolveUsers([...voterIds]);
      emailById = new Map(
        users
          .filter((user) => user.email)
          .map((user) => [guid(user.id).toLowerCase(), user.email!.toLowerCase()]),
      );
    } catch {
      // Best-effort by contract; fall through with an empty map.
    }

    return (votes, submittedBy) => {
      const author = submittedBy.trim().toLowerCase();
      if (!author) return votes.voterIds.size;
      const authorVoted = [...votes.voterIds].some((id) => emailById.get(id) === author);
      return votes.voterIds.size + (authorVoted ? 0 : 1);
    };
  }

  return {
    async ideas(ids: string[]): Promise<RollupMap<IdeaRollup>> {
      const keys = keysFor("Idea", ids);
      const myUserId = await options.currentUserId();
      const [votes, facts] = await Promise.all([
        voteFacts(keys, myUserId),
        options.itemFacts(ids),
      ]);

      const allVoters = new Set<string>();
      for (const entry of votes.values()) for (const id of entry.voterIds) allVoters.add(id);
      const countContributors = await contributorCounter(allVoters);

      const map: RollupMap<IdeaRollup> = {};
      ids.forEach((id, index) => {
        const vote = votes.get(keys[index]!) ?? emptyVotes();
        const item = facts.get(id);
        map[id] = {
          votes: vote.count,
          votes30d: vote.recent,
          votedByMe: vote.mine,
          linkedSolutions: item?.linked ?? 0,
          contributors: countContributors(vote, item?.submittedBy ?? ""),
          comments: item?.comments ?? 0,
        };
      });
      return map;
    },

    async solutions(ids: string[]): Promise<RollupMap<SolutionRollup>> {
      const keys = keysFor("Solution", ids);
      const myUserId = await options.currentUserId();
      const [votes, adoptions, facts] = await Promise.all([
        voteFacts(keys, myUserId),
        adoptionFacts(ids),
        options.itemFacts(ids),
      ]);

      const map: RollupMap<SolutionRollup> = {};
      ids.forEach((id, index) => {
        const vote = votes.get(keys[index]!) ?? emptyVotes();
        const use = adoptions.get(id);
        const item = facts.get(id);
        map[id] = {
          adoptions: use?.adoptions ?? 0,
          teams: use?.teams ?? 0,
          linkedNeeds: item?.linked ?? 0,
          activeUses: use?.activeUses ?? 0,
          completedUses: use?.completedUses ?? 0,
          votes: vote.count,
          votedByMe: vote.mine,
          comments: item?.comments ?? 0,
        };
      });
      return map;
    },
  };
}

export type RollupReader = ReturnType<typeof createRollupReader>;
