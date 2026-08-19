import { AppError } from "@innovation-backlog/logic";
import type {
  Adoption,
  AdoptionStatus,
  EngagementProvider,
  HubItemRef,
  HubItemType,
  Participation,
  ParticipationStatus,
  RequestParticipationInput,
  Role,
  StartAdoptionInput,
  UpdateAdoptionInput,
  VoteSummary,
} from "@innovation-backlog/logic";
import { canManageAdoption, targetKey } from "@innovation-backlog/logic";

import { Cycai_votesService } from "../../generated/services/Cycai_votesService.js";
import { Cycai_adoptionsService } from "../../generated/services/Cycai_adoptionsService.js";
import { Cycai_participationsService } from "../../generated/services/Cycai_participationsService.js";
import type { Cycai_votes } from "../../generated/models/Cycai_votesModel.js";
import type { Cycai_adoptions } from "../../generated/models/Cycai_adoptionsModel.js";
import type { Cycai_participations } from "../../generated/models/Cycai_participationsModel.js";
import { Cycai_adoptionscycai_adoptionstatus } from "../../generated/models/Cycai_adoptionsModel.js";
import { Cycai_participationscycai_participationstatus } from "../../generated/models/Cycai_participationsModel.js";
import { Cycai_votescycai_targettype } from "../../generated/models/Cycai_votesModel.js";

import { unwrap } from "../errors.js";
import { allOf, countAll, fetchAll, guid, odataString } from "./paging.js";

/**
 * Votes, adoptions and participation, over Dataverse.
 *
 * Choice translation uses the generated const maps rather than a hand-maintained
 * table: Dataverse allocates option values inside the publisher's prefix range, so
 * a second copy of them is a second thing to keep in step for no benefit.
 */

type ChoiceMap = Record<number, string>;

function nameOf<T extends string>(map: ChoiceMap, value: number | undefined, fallback: T): T {
  const name = value === undefined ? undefined : map[value];
  return (name as T | undefined) ?? fallback;
}

function valueOf(map: ChoiceMap, name: string): number {
  const entry = Object.entries(map).find(([, label]) => label === name);
  if (!entry) throw new AppError(`Unknown choice '${name}'`, { category: "validation" });
  return Number(entry[0]);
}

const HUB_TYPE = Cycai_votescycai_targettype as unknown as ChoiceMap;
const ADOPTION_STATUS = Cycai_adoptionscycai_adoptionstatus as unknown as ChoiceMap;
const PARTICIPATION_STATUS = Cycai_participationscycai_participationstatus as unknown as ChoiceMap;

const userBind = (systemUserId: string) => `/systemusers(${guid(systemUserId)})`;

/** The SDK chokes on explicit undefined; strip the keys before sending. */
function compact<T extends Record<string, unknown>>(record: T): T {
  for (const key of Object.keys(record)) {
    if (record[key] === undefined) delete record[key];
  }
  return record;
}

/**
 * The status choice as a domain value.
 *
 * Exported because `adoptionFacts` in rollups.ts has to reach the same answer from the
 * same row — the panel's list and the count above it are computed by different code
 * over the same table, and a second copy of the translation is a second thing to get
 * wrong. Reading is name-based rather than through `valueOf`, so an option this build
 * does not know about degrades to the fallback instead of throwing.
 */
export function adoptionStatusOf(row: Pick<Cycai_adoptions, "cycai_adoptionstatus">): AdoptionStatus {
  return nameOf<AdoptionStatus>(ADOPTION_STATUS, row.cycai_adoptionstatus, "Exploring");
}

/**
 * Same systemuser, tolerant of the braces Dataverse sometimes wraps a GUID in.
 *
 * An exact join, unlike the display-name comparison the panel used to make: both sides
 * are systemuser GUIDs here, which is the whole reason `startedByMe` is resolved in
 * this file and not in the UI.
 */
function isSameSystemUser(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = a ? guid(a).toLowerCase() : "";
  const right = b ? guid(b).toLowerCase() : "";
  return Boolean(left && right && left === right);
}

/**
 * `myUserId` is the caller's systemuserid, or null before identity resolves — which
 * makes `startedByMe` false, so the row renders read-only rather than briefly editable.
 * The safe direction: a control that appears late is better than one that appears for
 * somebody who should not have it.
 */
function toAdoption(row: Cycai_adoptions, myUserId: string | null): Adoption {
  return {
    id: row.cycai_adoptionid,
    solutionId: String(row.cycai_solutionid),
    startedBy: row._cycai_startedbyid_value ?? "",
    startedByMe: isSameSystemUser(row._cycai_startedbyid_value, myUserId),
    projectName: row.cycai_projectname,
    team: row.cycai_team ?? null,
    status: adoptionStatusOf(row),
    startedAt: row.cycai_startedon ?? row.createdon ?? "",
    updatedAt: row.modifiedon ?? row.createdon ?? "",
    completedAt: row.cycai_completedon ?? null,
  };
}

function toParticipation(row: Cycai_participations): Participation {
  return {
    id: row.cycai_participationid,
    itemType: nameOf<HubItemType>(HUB_TYPE, row.cycai_targettype, "Idea"),
    itemId: String(row.cycai_targetid),
    requestedBy: row._cycai_requestedbyid_value ?? "",
    message: row.cycai_message ?? "",
    status: nameOf<ParticipationStatus>(PARTICIPATION_STATUS, row.cycai_participationstatus, "Proposed"),
    decidedBy: row._cycai_decidedbyid_value ?? null,
    rationale: row.cycai_rationale ?? null,
    createdAt: row.createdon ?? "",
    updatedAt: row.modifiedon ?? row.createdon ?? "",
    decidedAt: row.cycai_decidedon ?? null,
  };
}

export interface EngagementOptions {
  /** Dataverse systemuserid of the caller. Null until identity resolves. */
  currentUserId: () => Promise<string | null>;
  /**
   * The caller's role, for `canManageAdoption`.
   *
   * Adoption rows had no permission check at all: any reader could move anybody's
   * adoption between stages. Role alone does not answer it — the person who recorded
   * the adoption may manage it whatever their role — so this pairs with the
   * `startedByMe` join above.
   */
  role: () => Promise<Role>;
  /**
   * Turns adopter GUIDs into names, batched for the whole list.
   *
   * `cycai_startedbyid` is a lookup, so the row carries a GUID and nothing else —
   * which is "Someone" at every position a reader expects a person. Same arrangement,
   * and the same best-effort contract, as the activity feed's actor resolution.
   */
  resolveUsers?: (ids: string[]) => Promise<{ id: string; displayName?: string }[]>;
}

export function createEngagementProvider(options: EngagementOptions): EngagementProvider {
  async function requireUser(): Promise<string> {
    const id = await options.currentUserId();
    if (!id) {
      throw new AppError("The signed-in user could not be resolved in Dataverse.", {
        category: "permission",
      });
    }
    return id;
  }

  /**
   * The person who recorded this adoption, or a reviewer. Returns the caller's
   * systemuserid so the mapper that follows does not resolve it a second time.
   *
   * Costs one GET before each adoption write, and there is no way around it: the rule
   * needs the row's starter, and trusting an id the caller passed in would be no check
   * at all. `_cycai_startedbyid_value` is named in the $select explicitly — omit it and
   * Dataverse leaves the lookup ABSENT from the row rather than null, which would make
   * `startedByMe` false for the real adopter and lock them out of their own row.
   */
  async function requireAdoptionManager(adoptionId: string): Promise<string | null> {
    const [me, currentRole] = await Promise.all([options.currentUserId(), options.role()]);

    const row = unwrap(
      await Cycai_adoptionsService.get(adoptionId, {
        select: ["cycai_adoptionid", "_cycai_startedbyid_value"],
      }),
      "read adoption",
    );

    if (!canManageAdoption(currentRole, isSameSystemUser(row._cycai_startedbyid_value, me))) {
      throw new AppError(
        "Only the person who recorded this adoption, or a reviewer, can change it.",
        { category: "permission" },
      );
    }
    return me;
  }

  async function summarize(target: HubItemRef, userId: string): Promise<VoteSummary> {
    const key = odataString(targetKey(target));
    const [count, mine] = await Promise.all([
      countAll<Cycai_votes>(
        (o) => Cycai_votesService.getAll(o),
        "cycai_voteid",
        "count votes",
        { filter: `cycai_targetkey eq '${key}'` },
      ),
      fetchAll<Cycai_votes>((o) => Cycai_votesService.getAll(o), "read my vote", {
        select: ["cycai_voteid"],
        filter: `cycai_targetkey eq '${key}' and _cycai_voterid_value eq ${guid(userId)}`,
        top: 1,
      }),
    ]);

    return { itemType: target.itemType, itemId: target.itemId, count, votedByMe: mine.length > 0 };
  }

  return {
    // -----------------------------------------------------------------------
    // Votes
    // -----------------------------------------------------------------------

    async getVoteSummary(target) {
      return summarize(target, await requireUser());
    },

    /**
     * Idempotent by construction. `cycai_vote_unique` over (targetkey, voterid) is
     * an Active alternate key, so a duplicate is rejected by the platform rather
     * than by a read-then-write check that two clicks can race past. A conflict
     * therefore means "already voted", which is success for a toggle.
     */
    async addVote(target) {
      const userId = await requireUser();
      const key = targetKey(target);

      try {
        unwrap(
          await Cycai_votesService.create(
            compact({
              cycai_name: key.slice(0, 200),
              cycai_targetkey: key,
              cycai_targetid: Number(target.itemId),
              cycai_targettype: valueOf(HUB_TYPE, target.itemType),
              "cycai_voterid@odata.bind": userBind(userId),
            }) as never,
          ),
          "add vote",
        );
      } catch (error) {
        if (!(error instanceof AppError) || error.category !== "conflict") throw error;
      }

      return summarize(target, userId);
    },

    async removeVote(target) {
      const userId = await requireUser();
      const key = odataString(targetKey(target));

      const existing = await fetchAll<Cycai_votes>(
        (o) => Cycai_votesService.getAll(o),
        "find vote to remove",
        {
          select: ["cycai_voteid"],
          filter: `cycai_targetkey eq '${key}' and _cycai_voterid_value eq ${guid(userId)}`,
          top: 1,
        },
      );
      if (existing[0]) await Cycai_votesService.delete(existing[0].cycai_voteid);

      return summarize(target, userId);
    },

    // -----------------------------------------------------------------------
    // Adoption
    // -----------------------------------------------------------------------

    /**
     * The full rows, not a count.
     *
     * Everything a reader deciding whether to adopt something wants is already here —
     * which project, which team, what stage, since when, and whether the rollout
     * finished — so the only thing worth adding is the adopter's name, resolved once
     * for the whole list rather than per row.
     */
    async listAdoptions(solutionId) {
      const [rows, myUserId] = await Promise.all([
        fetchAll<Cycai_adoptions>(
          (o) => Cycai_adoptionsService.getAll(o),
          "list adoptions",
          { filter: `cycai_solutionid eq ${Number(solutionId)}`, orderBy: ["cycai_startedon desc"] },
        ),
        options.currentUserId(),
      ]);

      /*
        Withdrawn rows are dropped HERE rather than in the $filter, and that is
        deliberate: an OData clause would need the choice's integer value, and
        `valueOf` throws until the `Withdrawn` option exists in the environment. Reading
        the list must not depend on a schema change that has not landed yet — only
        writing a withdrawal does.

        Same shape as the milestone tombstone: `deleteMilestone` writes Cancelled and
        `listMilestones` filters it out, so the row survives for history while
        disappearing from the surface.
      */
      const adoptions = rows
        .map((row) => toAdoption(row, myUserId))
        .filter((adoption) => adoption.status !== "Withdrawn");
      const unresolved = [...new Set(adoptions.map((row) => row.startedBy).filter(Boolean))];
      if (!options.resolveUsers || unresolved.length === 0) return adoptions;

      // Best-effort: an unresolved adopter keeps the GUID and the UI falls back,
      // rather than the adoption list failing over a name.
      let names = new Map<string, string>();
      try {
        names = new Map(
          (await options.resolveUsers(unresolved))
            .filter((user) => user.displayName)
            .map((user) => [guid(user.id).toLowerCase(), user.displayName!]),
        );
      } catch {
        return adoptions;
      }

      return adoptions.map((row) => ({
        ...row,
        startedByName: names.get(guid(row.startedBy).toLowerCase()) ?? null,
      }));
    },

    /**
     * Open to anyone who can see the solution, and no role check by design — the same
     * reasoning `createIssue` states for itself. Recording that your team uses
     * something is an inbound signal, and gating it loses the signal rather than
     * deferring it. What IS gated is touching a row somebody else recorded.
     */
    async startAdoption(solutionId, input: StartAdoptionInput) {
      const userId = await requireUser();
      const created = unwrap(
        await Cycai_adoptionsService.create(
          compact({
            cycai_name: input.projectName.slice(0, 200),
            cycai_solutionid: Number(solutionId),
            cycai_projectname: input.projectName,
            cycai_team: input.team,
            cycai_adoptionstatus: valueOf(ADOPTION_STATUS, input.status ?? "Exploring"),
            cycai_startedon: new Date().toISOString(),
            "cycai_startedbyid@odata.bind": userBind(userId),
          }) as never,
        ),
        "start adoption",
      );
      // The caller just recorded it, so `startedByMe` is true by construction — which
      // matters because a create response need not echo the lookup back.
      return toAdoption(created, userId);
    },

    async updateAdoption(_solutionId, adoptionId, patch: UpdateAdoptionInput) {
      const me = await requireAdoptionManager(adoptionId);
      const updated = unwrap(
        await Cycai_adoptionsService.update(
          adoptionId,
          compact({
            cycai_projectname: patch.projectName,
            cycai_team: patch.team,
            cycai_adoptionstatus:
              patch.status === undefined ? undefined : valueOf(ADOPTION_STATUS, patch.status),
          }) as never,
        ),
        "update adoption",
      );
      return toAdoption(updated, me);
    },

    /** Settling stamps the timestamp AND the status; the UI derives "active" from status. */
    async completeAdoption(_solutionId, adoptionId) {
      const me = await requireAdoptionManager(adoptionId);
      const updated = unwrap(
        await Cycai_adoptionsService.update(
          adoptionId,
          compact({
            cycai_adoptionstatus: valueOf(ADOPTION_STATUS, "Using"),
            cycai_completedon: new Date().toISOString(),
          }) as never,
        ),
        "complete adoption",
      );
      return toAdoption(updated, me);
    },

    /**
     * The status only — `cycai_completedon` is deliberately NOT stamped.
     *
     * That timestamp is what `adoptionFacts` reads to decide rolled-out versus active,
     * and a withdrawal is the opposite claim. Writing it would turn "we stopped using
     * this" into "we finished rolling it out" in every rollup.
     *
     * BLOCKED until `Withdrawn` exists as an option on `cycai_adoptionstatus` in the
     * environment (and `Cycai_adoptionsModel.ts` is regenerated). Until then `valueOf`
     * throws a validation AppError naming the unknown choice — the write fails whole
     * and nothing is half-applied, which is why the reads above were kept independent
     * of the option value.
     */
    async withdrawAdoption(_solutionId, adoptionId) {
      const me = await requireAdoptionManager(adoptionId);
      const updated = unwrap(
        await Cycai_adoptionsService.update(
          adoptionId,
          compact({
            cycai_adoptionstatus: valueOf(ADOPTION_STATUS, "Withdrawn"),
          }) as never,
        ),
        "withdraw adoption",
      );
      return toAdoption(updated, me);
    },

    // -----------------------------------------------------------------------
    // Participation
    // -----------------------------------------------------------------------

    async requestParticipation(input: RequestParticipationInput) {
      const userId = await requireUser();
      const key = targetKey({ itemType: input.itemType, itemId: input.itemId });
      const created = unwrap(
        await Cycai_participationsService.create(
          compact({
            cycai_name: key.slice(0, 200),
            cycai_targetkey: key,
            cycai_targetid: Number(input.itemId),
            cycai_targettype: valueOf(HUB_TYPE, input.itemType),
            cycai_message: input.message,
            cycai_participationstatus: valueOf(PARTICIPATION_STATUS, "Proposed"),
            "cycai_requestedbyid@odata.bind": userBind(userId),
          }) as never,
        ),
        "request participation",
      );
      return toParticipation(created);
    },

    async listMyParticipation() {
      const userId = await requireUser();
      const rows = await fetchAll<Cycai_participations>(
        (o) => Cycai_participationsService.getAll(o),
        "list my participation",
        {
          filter: allOf(`_cycai_requestedbyid_value eq ${guid(userId)}`),
          orderBy: ["createdon desc"],
        },
      );
      return rows.map(toParticipation);
    },

    async withdrawParticipation(id) {
      const updated = unwrap(
        await Cycai_participationsService.update(
          id,
          compact({
            cycai_participationstatus: valueOf(PARTICIPATION_STATUS, "Withdrawn"),
          }) as never,
        ),
        "withdraw participation",
      );
      return toParticipation(updated);
    },
  };
}
