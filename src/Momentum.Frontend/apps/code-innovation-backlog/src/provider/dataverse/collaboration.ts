import { AppError } from "@innovation-backlog/logic";
import type {
  ActivityEntry,
  ActivityQuery,
  ActorType,
  AddCommentInput,
  Attachment,
  CollaborationProvider,
  Comment,
  HubItemRef,
  HubItemType,
  UploadAttachmentInput,
  UserRef,
} from "@innovation-backlog/logic";

import { Cycai_activitiesService } from "../../generated/services/Cycai_activitiesService.js";
import type { Cycai_activities } from "../../generated/models/Cycai_activitiesModel.js";
import { Cycai_activitiescycai_actortype } from "../../generated/models/Cycai_activitiesModel.js";
import { Cycai_activitiescycai_subjecttype } from "../../generated/models/Cycai_activitiesModel.js";

import { allOf, fetchAll } from "./paging.js";

/**
 * The activity feed, from Dataverse — plus comments and attachments, which are
 * delegated to Azure DevOps.
 *
 * Comments used to be a Dataverse table so they could carry a three-tier audience.
 * The audience is gone and so is the table: an ADO work item comment is readable by
 * anyone who can read the item, so a private tier could not be honoured, and who
 * sees a conversation is now decided by who sees the item's area path.
 *
 * Attachments used to be Dataverse `annotation` rows written with no `objectid`, so
 * every upload landed attached to nothing and never reached Azure DevOps. They are
 * now native work item attachments — see `ado/attachments.ts`. This module keeps only
 * the activity feed, and the two Azure DevOps capabilities are injected so it stays
 * free of the connector.
 */

type ChoiceMap = Record<number, string>;

const SUBJECT_TYPE = Cycai_activitiescycai_subjecttype as unknown as ChoiceMap;
const ACTOR_TYPE = Cycai_activitiescycai_actortype as unknown as ChoiceMap;

function nameOf<T extends string>(map: ChoiceMap, value: number | undefined, fallback: T): T {
  const name = value === undefined ? undefined : map[value];
  return (name as T | undefined) ?? fallback;
}

function valueOf(map: ChoiceMap, name: string): number {
  const entry = Object.entries(map).find(([, label]) => label === name);
  if (!entry) throw new AppError(`Unknown choice '${name}'`, { category: "validation" });
  return Number(entry[0]);
}

/** Comment storage, injected so this module stays free of the ADO connector. */
export interface CommentsApi {
  list(subject: HubItemRef): Promise<Comment[]>;
  add(subject: HubItemRef, body: string, attachmentIds?: string[]): Promise<Comment>;
}

/** File storage, likewise injected. See `ado/attachments.ts`. */
export interface AttachmentStore {
  upload(input: UploadAttachmentInput): Promise<Attachment>;
  describe(id: string): Promise<Attachment | null>;
}

export interface CollaborationOptions {
  comments: CommentsApi;
  attachments: AttachmentStore;
  /**
   * Turns actor GUIDs into names, batched for the whole page.
   *
   * The activity table stores the actor as a lookup, so the row carries a GUID. The
   * formatted-name field beside it is only populated when the request asks for
   * annotations, so relying on it left the feed rendering raw ids.
   */
  resolveUsers: (ids: string[]) => Promise<UserRef[]>;
}

export function createCollaborationProvider(options: CollaborationOptions): CollaborationProvider {
  function toActivity(row: Cycai_activities): ActivityEntry {
    const subjectType = nameOf<HubItemType>(SUBJECT_TYPE, row.cycai_subjecttype, "Idea");
    return {
      id: row.cycai_activityid,
      action: row.cycai_action,
      resourceType: subjectType === "Idea" ? "request" : "solution",
      resourceId: String(row.cycai_subjectid ?? ""),
      subjectId: String(row.cycai_subjectid ?? ""),
      actorType: nameOf<ActorType>(ACTOR_TYPE, row.cycai_actortype, "User"),
      actorId: row._cycai_actorid_value ?? "",
      // Dataverse resolves the lookup's display name alongside the GUID; without it
      // the feed rendered raw ids at every actor position.
      actorName: row.cycai_actoridname ?? null,
      summary: row.cycai_summary ?? "",
      audience: "SubmitterAndApprovers",
      occurredAt: row.cycai_occurredon ?? row.createdon ?? "",
    };
  }

  return {
    listComments(subject) {
      return options.comments.list(subject);
    },

    /**
     * The attachment ids are forwarded, not dropped.
     *
     * They used to be parsed by `callTool`, carried on `AddCommentInput`, sent by the
     * composer — and then ignored here, so the only thing an upload ever produced was
     * an orphan row. The comments API turns them into work item attachments keyed to
     * the comment it creates.
     */
    addComment(input: AddCommentInput) {
      return options.comments.add(
        { itemType: input.subjectType, itemId: input.subjectId },
        input.body,
        input.attachmentIds,
      );
    },

    uploadAttachment(input: UploadAttachmentInput) {
      return options.attachments.upload(input);
    },

    getAttachment(id: string): Promise<Attachment | null> {
      return options.attachments.describe(id);
    },

    async listActivity(query?: ActivityQuery) {
      const rows = await fetchAll<Cycai_activities>(
        (o) => Cycai_activitiesService.getAll(o),
        "list activity",
        {
          filter: allOf(
            query?.subjectId ? `cycai_subjectid eq ${Number(query.subjectId)}` : undefined,
            query?.subjectType
              ? `cycai_subjecttype eq ${valueOf(SUBJECT_TYPE, query.subjectType)}`
              : undefined,
          ),
          orderBy: ["cycai_occurredon desc"],
          top: query?.take ?? 50,
        },
      );

      const entries = rows.map(toActivity);

      // One lookup for the whole page, not one per row. Best-effort: an unresolved
      // actor keeps its id and the UI falls back, rather than the feed failing.
      const unresolved = [
        ...new Set(entries.filter((e) => !e.actorName && e.actorId).map((e) => e.actorId)),
      ];
      if (unresolved.length === 0) return entries;

      const names = new Map(
        (await options.resolveUsers(unresolved)).map((user) => [
          user.id.toLowerCase(),
          user.displayName,
        ]),
      );
      return entries.map((entry) =>
        entry.actorName
          ? entry
          : { ...entry, actorName: names.get(entry.actorId.toLowerCase()) ?? null },
      );
    },
  };
}
