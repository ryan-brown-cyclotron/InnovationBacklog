import type { Attachment, Comment, HubItemRef, HubItemType } from "@innovation-backlog/logic";
import type { AdoClient } from "./client.js";
import { PREVIEW } from "./client.js";
import { commentKey, stripAttachmentMarkdown } from "./attachments.js";
import type { AttachmentsApi } from "./attachments.js";
import { getWorkItem } from "./workitems.js";

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
 *
 * Attachments are the one thing the comments API cannot hold: an ADO comment has no
 * attachment collection, so the file is a relation on the ITEM and the comment it
 * belongs to is recorded in that relation's own comment attribute. See attachments.ts.
 */

interface AdoComment {
  id: number;
  text: string;
  createdBy?: { uniqueName?: string; displayName?: string };
  createdDate?: string;
}

const author = (comment: AdoComment): string =>
  comment.createdBy?.uniqueName ?? comment.createdBy?.displayName ?? "";

function toComment(
  workItemId: string,
  subjectType: HubItemType,
  raw: AdoComment,
  attachments: Attachment[] = [],
): Comment {
  return {
    id: String(raw.id),
    subjectId: workItemId,
    subjectType,
    authorId: author(raw),
    // The inline markdown reference is for Azure DevOps' own work item view; here
    // the same files render as chips, so it is taken back out rather than shown twice.
    body: stripAttachmentMarkdown(raw.text ?? ""),
    attachments,
    createdAt: raw.createdDate ?? "",
  };
}

export function createCommentsApi(client: AdoClient, attachments: AttachmentsApi) {
  return {
    async list(subject: HubItemRef): Promise<Comment[]> {
      const id = Number(subject.itemId);
      if (!Number.isFinite(id)) return [];

      // The comments endpoint is still preview-versioned: a plain "7.1" is
      // rejected with VssInvalidPreviewVersionException. It returns newest-first
      // and the UI reads oldest-first, hence the sort below.
      //
      // The second call is the item itself, expanded for relations — attachments hang
      // off the work item, not off a comment. One call for the whole thread, not one
      // per comment, and a failure to read them leaves the thread intact with no chips
      // rather than failing the panel.
      const [result, files] = await Promise.all([
        client.get<{ comments?: AdoComment[] }>(
          `_apis/wit/workItems/${id}/comments`,
          "list comments",
          PREVIEW,
        ),
        getWorkItem(client, subject.itemId, "read comment attachments")
          .then((item) => attachments.byComment(item))
          .catch(() => new Map<string, Attachment[]>()),
      ]);

      return (result.comments ?? [])
        .map((raw) =>
          toComment(subject.itemId, subject.itemType, raw, files.get(commentKey(raw.id)) ?? []),
        )
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    },

    async add(subject: HubItemRef, body: string, attachmentIds?: string[]): Promise<Comment> {
      const id = Number(subject.itemId);
      const wanted = attachmentIds?.filter(Boolean) ?? [];

      /*
       * The files are resolved BEFORE the comment is posted, because their urls go
       * into its body — and because an unresolvable id should fail without leaving a
       * comment behind that promises a file it never had.
       */
      const resolved: Attachment[] = [];
      for (const attachmentId of [...new Set(wanted)]) {
        const attachment = await attachments.describe(attachmentId);
        if (!attachment) {
          throw new Error(`Attachment '${attachmentId}' was not found.`);
        }
        resolved.push(attachment);
      }

      const reference = attachments.markdown(resolved);
      const text = [body.trim(), reference].filter(Boolean).join("\n\n");

      const created = await client.post<AdoComment>(
        `_apis/wit/workItems/${id}/comments`,
        { text },
        "add comment",
        PREVIEW,
      );

      /*
       * The relation is added after the fact because it is keyed on the comment id,
       * which only exists once the comment does. If this fails the comment survives
       * with its markdown links — the files are still reachable, they are simply not
       * claimed by this comment — which is a better outcome than losing the text.
       */
      if (resolved.length > 0) {
        await attachments.attachToComment(id, resolved.map((file) => file.id), commentKey(created.id));
      }

      return toComment(subject.itemId, subject.itemType, created, resolved);
    },
  };
}
