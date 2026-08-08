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
import { MAX_ATTACHMENT_BYTES } from "@innovation-backlog/logic";

import { Cycai_activitiesService } from "../../generated/services/Cycai_activitiesService.js";
import { AnnotationsService } from "../../generated/services/AnnotationsService.js";
import type { Cycai_activities } from "../../generated/models/Cycai_activitiesModel.js";
import { Cycai_activitiescycai_actortype } from "../../generated/models/Cycai_activitiesModel.js";
import { Cycai_activitiescycai_subjecttype } from "../../generated/models/Cycai_activitiesModel.js";

import { unwrap } from "../errors.js";
import { allOf, fetchAll, guid } from "./paging.js";

/**
 * Attachments and the activity feed, from Dataverse — plus comments, which are
 * delegated to Azure DevOps.
 *
 * Comments used to be a Dataverse table so they could carry a three-tier audience.
 * The audience is gone and so is the table: an ADO work item comment is readable by
 * anyone who can read the item, so a private tier could not be honoured, and who
 * sees a conversation is now decided by who sees the item's area path.
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

function compact<T extends Record<string, unknown>>(record: T): T {
  for (const key of Object.keys(record)) {
    if (record[key] === undefined) delete record[key];
  }
  return record;
}

/** Comment storage, injected so this module stays free of the ADO connector. */
export interface CommentsApi {
  list(subject: HubItemRef): Promise<Comment[]>;
  add(subject: HubItemRef, body: string): Promise<Comment>;
}

export interface CollaborationOptions {
  comments: CommentsApi;
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

    addComment(input: AddCommentInput) {
      return options.comments.add(
        { itemType: input.subjectType, itemId: input.subjectId },
        input.body,
      );
    },

    async uploadAttachment(input: UploadAttachmentInput) {
      const length = Math.floor((input.contentBase64.length * 3) / 4);
      if (length > MAX_ATTACHMENT_BYTES) {
        throw new AppError(
          `Attachment exceeds the ${MAX_ATTACHMENT_BYTES / (1024 * 1024)} MB limit.`,
          { category: "validation" },
        );
      }

      const created = unwrap(
        await AnnotationsService.create(
          compact({
            subject: "attachment",
            filename: input.fileName,
            mimetype: input.contentType ?? "application/octet-stream",
            documentbody: input.contentBase64,
            isdocument: true,
          }) as never,
        ),
        "upload attachment",
      );

      return {
        id: (created as { annotationid: string }).annotationid,
        fileName: input.fileName,
        contentType: input.contentType ?? "application/octet-stream",
        length,
      };
    },

    async getAttachment(id: string): Promise<Attachment | null> {
      // documentbody is heavy and deliberately excluded — this is the descriptor
      // only. Fetch the body separately when something actually downloads it.
      const rows = await fetchAll<{
        annotationid: string;
        filename?: string;
        mimetype?: string;
        filesize?: number;
      }>((o) => AnnotationsService.getAll(o), "get attachment", {
        select: ["annotationid", "filename", "mimetype", "filesize"],
        filter: `annotationid eq ${guid(id)}`,
        top: 1,
      });

      const row = rows[0];
      if (!row) return null;
      return {
        id: row.annotationid,
        fileName: row.filename ?? "attachment",
        contentType: row.mimetype ?? "application/octet-stream",
        length: row.filesize ?? 0,
      };
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
