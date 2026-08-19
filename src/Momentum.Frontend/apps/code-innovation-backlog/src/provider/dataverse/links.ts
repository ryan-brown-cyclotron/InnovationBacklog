import { AppError } from "@innovation-backlog/logic";
import type { ApprovalState, IdeaSolutionLink } from "@innovation-backlog/logic";

import { Cycai_linksService } from "../../generated/services/Cycai_linksService.js";
import type { Cycai_links } from "../../generated/models/Cycai_linksModel.js";
import { Cycai_linkscycai_approvalstate } from "../../generated/models/Cycai_linksModel.js";

import { unwrap } from "../errors.js";
import { fetchAll, guid, odataString } from "./paging.js";

/**
 * Proposed idea-to-solution links, and the decisions on them.
 *
 * This table exists because **three things need approval — ideas, solutions, and the
 * links between them** — and an approval needs somewhere to be pending. The division of
 * labour is the whole design:
 *
 * - **Here** lives the proposal: Pending, Approved or Rejected, with who proposed it,
 *   who decided and why.
 * - **Azure DevOps** carries approved truth only. The `Related` link is written by the
 *   approvals provider at the moment of approval, never before.
 *
 * A pending link is therefore invisible in ADO, by decision. That is what lets
 * `listLinkedSolutions` and every other reader of ADO relations stay correct without an
 * approval filter of its own — the filter that gets forgotten is the one that does not
 * have to exist.
 *
 * Deliberately NOT an `ApprovalsProvider`. It knows nothing about work items or the ADO
 * connector; the provider that owns both composes them.
 */

type ChoiceMap = Record<number, string>;

const APPROVAL_STATE = Cycai_linkscycai_approvalstate as unknown as ChoiceMap;

function nameOf<T extends string>(map: ChoiceMap, value: number | undefined, fallback: T): T {
  const name = value === undefined ? undefined : map[value];
  return (name as T | undefined) ?? fallback;
}

function valueOf(map: ChoiceMap, name: string): number {
  const entry = Object.entries(map).find(([, label]) => label === name);
  if (!entry) throw new AppError(`Unknown choice '${name}'`, { category: "validation" });
  return Number(entry[0]);
}

/** The SDK chokes on explicit undefined; strip the keys before sending. */
function compact<T extends Record<string, unknown>>(record: T): T {
  for (const key of Object.keys(record)) {
    if (record[key] === undefined) delete record[key];
  }
  return record;
}

const userBind = (systemUserId: string) => `/systemusers(${guid(systemUserId)})`;

/**
 * `{ideaId}:{solutionId}` — the alternate key, and the reason proposing twice is a
 * conflict rather than a duplicate row.
 */
export const linkKey = (ideaId: string, solutionId: string) => `${ideaId}:${solutionId}`;

/** The Dataverse row as the domain sees it. Ids are work item ids, so they are strings. */
function toLink(row: Cycai_links): IdeaSolutionLink {
  return {
    ideaId: String(row.cycai_ideaid),
    solutionId: String(row.cycai_solutionid),
    addedBy: row._cycai_proposedbyid_value ?? "",
    addedAt: row.createdon ?? "",
    approval: nameOf<ApprovalState>(APPROVAL_STATE, row.cycai_approvalstate, "Pending"),
    decidedBy: row._cycai_decidedbyid_value ?? null,
    rationale: row.cycai_rationale ?? null,
    decidedAt: row.cycai_decidedon ?? null,
  };
}

export interface LinkStoreOptions {
  /** Dataverse systemuserid of the caller. Null until identity resolves. */
  currentUserId: () => Promise<string | null>;
}

export function createLinkStore(options: LinkStoreOptions) {
  async function requireUser(): Promise<string> {
    const id = await options.currentUserId();
    if (!id) {
      throw new AppError("The signed-in user could not be resolved in Dataverse.", {
        category: "permission",
      });
    }
    return id;
  }

  /** The row for one pair, or null. Reads by the alternate key's column. */
  async function findRow(ideaId: string, solutionId: string): Promise<Cycai_links | null> {
    const rows = await fetchAll<Cycai_links>((o) => Cycai_linksService.getAll(o), "find link", {
      filter: `cycai_linkkey eq '${odataString(linkKey(ideaId, solutionId))}'`,
      top: 1,
    });
    return rows[0] ?? null;
  }

  return {
    find: async (ideaId: string, solutionId: string): Promise<IdeaSolutionLink | null> => {
      const row = await findRow(ideaId, solutionId);
      return row ? toLink(row) : null;
    },

    /**
     * Propose a link, or return the existing proposal.
     *
     * Idempotent by construction, the same way `addVote` is: `cycai_link_unique` over the
     * link key is an Active alternate key, so a duplicate is rejected by the platform
     * rather than by a read-then-write check two clicks can race past. A conflict
     * therefore means "already proposed", which is success for the person proposing.
     *
     * A pair that was REJECTED and is proposed again returns the rejected row rather
     * than silently reopening it — reversing a reviewer's decision is a decision, not a
     * side effect of somebody clicking Connect a second time.
     */
    async propose(ideaId: string, solutionId: string): Promise<IdeaSolutionLink> {
      const userId = await requireUser();
      const key = linkKey(ideaId, solutionId);

      try {
        const created = unwrap(
          await Cycai_linksService.create(
            compact({
              cycai_name: key.slice(0, 200),
              cycai_linkkey: key,
              cycai_ideaid: Number(ideaId),
              cycai_solutionid: Number(solutionId),
              cycai_approvalstate: valueOf(APPROVAL_STATE, "Pending"),
              "cycai_proposedbyid@odata.bind": userBind(userId),
            }) as never,
          ),
          "propose link",
        );
        return toLink(created);
      } catch (error) {
        if (!(error instanceof AppError) || error.category !== "conflict") throw error;
      }

      const existing = await findRow(ideaId, solutionId);
      if (!existing) {
        // The create was refused as a duplicate and the row cannot be read back, which
        // means it exists but is not visible to this caller. Reporting success would be
        // a lie; reporting a conflict is what actually happened.
        throw new AppError("That link already exists but could not be read back.", {
          category: "conflict",
        });
      }
      return toLink(existing);
    },

    /**
     * Everything proposed and not yet decided, oldest first — a queue, not a feed.
     *
     * `ideaId` narrows it to one idea, for the panel that has to show a proposer their
     * own proposal. Filtered server-side rather than by fetching everything and
     * discarding: the queue is unbounded and a panel asks for one idea's worth.
     */
    async listPending(ideaId?: string): Promise<IdeaSolutionLink[]> {
      const pending = `cycai_approvalstate eq ${valueOf(APPROVAL_STATE, "Pending")}`;
      const rows = await fetchAll<Cycai_links>(
        (o) => Cycai_linksService.getAll(o),
        "list pending links",
        {
          filter:
            ideaId === undefined ? pending : `${pending} and cycai_ideaid eq ${Number(ideaId)}`,
          orderBy: ["createdon asc"],
        },
      );
      return rows.map(toLink);
    },

    /**
     * Record a decision. The caller writes the Azure DevOps link on approval — this
     * knows nothing about work items.
     */
    async decide(
      ideaId: string,
      solutionId: string,
      approval: Extract<ApprovalState, "Approved" | "Rejected">,
      rationale: string,
    ): Promise<IdeaSolutionLink> {
      const userId = await requireUser();
      const row = await findRow(ideaId, solutionId);
      if (!row) {
        throw new AppError("That link is no longer waiting for a decision.", {
          category: "notFound",
        });
      }

      const updated = unwrap(
        await Cycai_linksService.update(
          row.cycai_linkid,
          compact({
            cycai_approvalstate: valueOf(APPROVAL_STATE, approval),
            cycai_rationale: rationale,
            cycai_decidedon: new Date().toISOString(),
            "cycai_decidedbyid@odata.bind": userBind(userId),
          }) as never,
        ),
        "decide link",
      );
      return toLink(updated);
    },

    /**
     * Forget the decision on a pair, so it can be proposed again.
     *
     * Used when an approved link is removed: the Azure DevOps relation goes, and leaving
     * the row saying "Approved" would then be a claim contradicted by the store that is
     * supposed to be authoritative. The row is deleted rather than set back to Pending,
     * because an unlink is not a proposal — putting it back in the review queue would
     * ask a reviewer to approve something nobody had asked for.
     */
    async forget(ideaId: string, solutionId: string): Promise<void> {
      const row = await findRow(ideaId, solutionId);
      if (row) await Cycai_linksService.delete(row.cycai_linkid);
    },
  };
}

export type LinkStore = ReturnType<typeof createLinkStore>;
