import type { Comment, HubItemRef, HubItemType } from "@innovation-backlog/logic";
import type { AdoClient } from "./client.js";
import { PREVIEW } from "./client.js";

/**
 * Comments, as native Azure DevOps work item comments.
 *
 * They used to live in Dataverse so they could carry a three-tier audience. That
 * audience is gone: an ADO work item comment is readable by anyone who can read the
 * item, so a "private" tier could not be represented honestly, and a side table
 * pretending otherwise was worse than not offering it. Who sees a conversation is
 * now decided by who sees the ITEM, through its area path — one mechanism instead
 * of two that could disagree.
 *
 * What that buys, beyond the deleted table: @mentions, reactions, edit history, the
 * work item UI, ADO's own notifications, and no replication to keep in step.
 */

interface AdoComment {
  id: number;
  text: string;
  createdBy?: { uniqueName?: string; displayName?: string };
  createdDate?: string;
}

const author = (comment: AdoComment): string =>
  comment.createdBy?.uniqueName ?? comment.createdBy?.displayName ?? "";

function toComment(workItemId: string, subjectType: HubItemType, raw: AdoComment): Comment {
  return {
    id: String(raw.id),
    subjectId: workItemId,
    subjectType,
    authorId: author(raw),
    body: raw.text ?? "",
    // Work item attachments are relations on the item, not on a comment.
    attachments: [],
    createdAt: raw.createdDate ?? "",
  };
}

export function createCommentsApi(client: AdoClient) {
  return {
    async list(subject: HubItemRef): Promise<Comment[]> {
      const id = Number(subject.itemId);
      if (!Number.isFinite(id)) return [];

      // The comments endpoint is still preview-versioned: a plain "7.1" is
      // rejected with VssInvalidPreviewVersionException. It returns newest-first
      // and the UI reads oldest-first, hence the sort below.
      const result = await client.get<{ comments?: AdoComment[] }>(
        `_apis/wit/workItems/${id}/comments`,
        "list comments",
        PREVIEW,
      );
      return (result.comments ?? [])
        .map((raw) => toComment(subject.itemId, subject.itemType, raw))
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    },

    async add(subject: HubItemRef, body: string): Promise<Comment> {
      const id = Number(subject.itemId);
      const created = await client.post<AdoComment>(
        `_apis/wit/workItems/${id}/comments`,
        { text: body },
        "add comment",
        PREVIEW,
      );
      return toComment(subject.itemId, subject.itemType, created);
    },
  };
}
