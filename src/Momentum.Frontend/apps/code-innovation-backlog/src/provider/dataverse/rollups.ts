import type { HubItemType, IdeaRollup, RollupMap, SolutionRollup } from "@innovation-backlog/logic";
import { targetKey } from "@innovation-backlog/logic";
import { Cycai_momentumsService } from "../../generated/services/Cycai_momentumsService.js";
import { Cycai_votesService } from "../../generated/services/Cycai_votesService.js";
import type { Cycai_momentums } from "../../generated/models/Cycai_momentumsModel.js";
import type { Cycai_votes } from "../../generated/models/Cycai_votesModel.js";
import { anyOf, fetchAll, guid } from "./paging.js";

/**
 * Engagement counts, read from the precomputed rollup.
 *
 * This is why `cycai_momentum` exists. Counting per item would be one request per
 * item per metric; a thirty-row list would spend thirty of the Azure DevOps
 * connector's 300-calls-per-60-seconds budget before rendering anything. And
 * FetchXML aggregates cannot order by an aggregate, so demand rank could not be a
 * live query even if the call budget allowed it.
 *
 * `votedByMe` is the exception and is read live: it is per-caller, so it cannot be
 * precomputed into a shared row. One extra query for the caller's own votes covers
 * the whole page.
 */

export interface RollupOptions {
  currentUserId: () => Promise<string | null>;
}

function keysFor(itemType: HubItemType, ids: string[]): string[] {
  return ids.map((itemId) => targetKey({ itemType, itemId }));
}

async function myVotedKeys(
  currentUserId: () => Promise<string | null>,
  keys: string[],
): Promise<Set<string>> {
  const userId = await currentUserId();
  if (!userId || keys.length === 0) return new Set();

  const rows = await fetchAll<Cycai_votes>((o) => Cycai_votesService.getAll(o), "read my votes", {
    select: ["cycai_targetkey"],
    filter: `_cycai_voterid_value eq ${guid(userId)} and ${anyOf("cycai_targetkey", keys)}`,
  });
  return new Set(rows.map((row) => row.cycai_targetkey));
}

async function rollupRows(keys: string[]): Promise<Map<string, Cycai_momentums>> {
  if (keys.length === 0) return new Map();
  const rows = await fetchAll<Cycai_momentums>(
    (o) => Cycai_momentumsService.getAll(o),
    "read engagement rollups",
    { filter: anyOf("cycai_targetkey", keys) },
  );
  return new Map(rows.map((row) => [row.cycai_targetkey, row]));
}

const n = (value: number | undefined): number => value ?? 0;

export function createRollupReader(options: RollupOptions) {
  return {
    async ideas(ids: string[]): Promise<RollupMap<IdeaRollup>> {
      const keys = keysFor("Idea", ids);
      const [rows, voted] = await Promise.all([
        rollupRows(keys),
        myVotedKeys(options.currentUserId, keys),
      ]);

      const map: RollupMap<IdeaRollup> = {};
      ids.forEach((id, index) => {
        const key = keys[index]!;
        const row = rows.get(key);
        map[id] = {
          votes: n(row?.cycai_votecount),
          votes30d: n(row?.cycai_votes30d),
          votedByMe: voted.has(key),
          linkedSolutions: n(row?.cycai_linkedcount),
          contributors: n(row?.cycai_contributorcount),
          comments: n(row?.cycai_commentcount),
        };
      });
      return map;
    },

    async solutions(ids: string[]): Promise<RollupMap<SolutionRollup>> {
      const keys = keysFor("Solution", ids);
      const [rows, voted] = await Promise.all([
        rollupRows(keys),
        myVotedKeys(options.currentUserId, keys),
      ]);

      const map: RollupMap<SolutionRollup> = {};
      ids.forEach((id, index) => {
        const key = keys[index]!;
        const row = rows.get(key);
        map[id] = {
          adoptions: n(row?.cycai_adoptioncount),
          teams: n(row?.cycai_teamcount),
          linkedNeeds: n(row?.cycai_linkedcount),
          activeUses: n(row?.cycai_activeusecount),
          completedUses: n(row?.cycai_completedusecount),
          votes: n(row?.cycai_votecount),
          votedByMe: voted.has(key),
          comments: n(row?.cycai_commentcount),
        };
      });
      return map;
    },
  };
}

export type RollupReader = ReturnType<typeof createRollupReader>;
