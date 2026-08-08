import type {
  ActivityResponseItem,
  AttachmentResponse,
  CommentResponse,
} from "@momentum/contracts";
import type { Assert, FieldsExistOn, FieldsExistOnExcept } from "./common.js";
import type { ActorType, HubItemType } from "./enums.js";

// ---------------------------------------------------------------------------
// Attachments
// ---------------------------------------------------------------------------

export interface Attachment {
  id: string;
  fileName: string;
  contentType: string;
  length: number;
}

export type AttachmentMatchesWire = Assert<FieldsExistOn<Attachment, AttachmentResponse>>;

/** Uploads travel as base64 JSON so they use the same transport as every other call. */
export interface UploadAttachmentInput {
  fileName: string;
  contentType?: string;
  contentBase64: string;
}

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

// ---------------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------------

/**
 * A comment on an idea or solution.
 *
 * There is no audience. Comments are native Azure DevOps work item comments, which
 * are readable by anyone who can read the item — so a private tier could not be
 * represented honestly, and pretending otherwise is worse than not offering it.
 * Restricting who sees a conversation is done by restricting who sees the ITEM,
 * through its area path.
 *
 * A consequence worth knowing: anything an automated triage step writes here is
 * visible to the submitter. Findings that should not be are a field, not a comment.
 */
export interface Comment {
  id: string;
  subjectId: string;
  subjectType: HubItemType;
  authorId: string;
  body: string;
  attachments: Attachment[];
  createdAt: string;
}

export type CommentMatchesWire = Assert<FieldsExistOn<Comment, CommentResponse>>;

export interface AddCommentInput {
  subjectId: string;
  subjectType: HubItemType;
  body: string;
  attachmentIds?: string[];
}

// ---------------------------------------------------------------------------
// Activity
// ---------------------------------------------------------------------------

/**
 * One entry in the user-facing activity feed.
 *
 * `action` is a stable key such as `vote.added`. UI wording is derived from it,
 * never from `summary` — feeds that rendered stored prose could not be restated
 * when the vocabulary changed, and rows written before a wording change would keep
 * the old phrasing forever.
 */
export interface ActivityEntry {
  id: string;
  action: string;
  resourceType: string;
  resourceId: string;
  subjectId: string;
  actorType: ActorType;
  actorId: string;
  /**
   * The actor's display name, when the backing store can resolve it.
   *
   * `actorId` is whatever the store uses as a key, and for Dataverse that is a GUID —
   * which surfaced raw in the feed because there was nothing better to render.
   * Optional: hosts that only have the id omit it and callers fall back.
   */
  actorName?: string | null;
  summary: string;
  audience: string;
  occurredAt: string;
}

// actorName is resolved by the adapter and has no wire counterpart; every other
// field still has to exist on the generated DTO.
export type ActivityMatchesWire = Assert<
  FieldsExistOnExcept<ActivityEntry, ActivityResponseItem, "actorName">
>;

export interface ActivityQuery {
  take?: number;
  subjectId?: string;
  subjectType?: HubItemType;
}
