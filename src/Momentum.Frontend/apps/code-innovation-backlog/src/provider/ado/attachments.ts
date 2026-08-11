import { AppError, MAX_ATTACHMENT_BYTES } from "@innovation-backlog/logic";
import type { Attachment, UploadAttachmentInput } from "@innovation-backlog/logic";

import { AzureDevOpsService } from "../../generated/services/AzureDevOpsService.js";
import { unwrap } from "../errors.js";
import type { AdoClient } from "./client.js";
import type { WorkItem, WorkItemRelation } from "./workitems.js";

/**
 * Attachments, as native Azure DevOps work item attachments.
 *
 * They used to be Dataverse `annotation` rows with the file in `documentbody` and
 * NO `objectid` — so every upload succeeded, was attached to no record at all, was
 * referenced by nothing, and never reached Azure DevOps. The paperclip looked like it
 * worked because the upload itself did.
 *
 * The native shape is two steps, and both are needed:
 *
 *   1. POST the bytes to `_apis/wit/attachments?fileName=x`, which returns an id and
 *      a url. At this point the file exists but belongs to nothing — ADO garbage
 *      collects an unreferenced attachment after a few hours.
 *   2. PATCH the work item with an `AttachedFile` RELATION pointing at that url. This
 *      is the step that makes it a real work item attachment, visible in the ADO work
 *      item UI, carried in the item's revision history, and deleted with the item.
 *
 * WHY THE COMMENT KEY EXISTS
 *
 * ADO comments have no attachment collection of their own — the relation hangs off
 * the ITEM, not the comment. Per-comment attribution therefore has to be carried
 * somewhere, and the relation's own `attributes.comment` is the stable place: it is
 * the same trick `LINK_LABEL` uses to tell a Repository hyperlink from a Demo one.
 * The markdown reference written into the comment body is presentation — it is what
 * makes the file render inline in ADO's own work item view — and is stripped back out
 * when the comment is read here, because this UI renders the files as chips instead.
 */

const ATTACHED_FILE = "AttachedFile";

/** Ties a relation to the comment it was posted with. See the note above. */
export const commentKey = (commentId: string | number): string => `comment:${commentId}`;

export interface AttachmentsApi {
  upload(input: UploadAttachmentInput): Promise<Attachment>;
  describe(id: string): Promise<Attachment | null>;
  /** Adds `AttachedFile` relations for the given uploads, keyed to one comment. */
  attachToComment(workItemId: number, attachmentIds: string[], key: string): Promise<Attachment[]>;
  /** The item's attachments, grouped by the comment key their relation carries. */
  byComment(item: WorkItem): Map<string, Attachment[]>;
  /** Markdown for a comment body, so the files render inline in Azure DevOps. */
  markdown(attachments: Attachment[]): string;
}

const IMAGE = /^image\//i;

/** The attachment GUID out of `.../_apis/wit/attachments/{id}?fileName=x`. */
function idFromUrl(url: string): string {
  const path = url.split("?")[0] ?? "";
  return path.split("/").pop() ?? "";
}

function fileNameFromUrl(url: string): string {
  if (!url.includes("?")) return "attachment";
  const name = new URLSearchParams(url.slice(url.indexOf("?") + 1)).get("fileName");
  return name ? name : "attachment";
}

/**
 * `?fileName=` on an attachment url is what makes the browser save it under its own
 * name instead of the GUID — and it is NOT there when the url is read back off a
 * relation. Verified against the live environment: the upload response carries the
 * query, the `AttachedFile` relation stores only the bare url and moves the name to
 * `attributes.name`.
 */
function withFileName(url: string, fileName: string): string {
  if (/[?&]fileName=/i.test(url)) return url;
  return `${url}${url.includes("?") ? "&" : "?"}fileName=${encodeURIComponent(fileName)}`;
}

function toAttachment(relation: WorkItemRelation): Attachment {
  const attributes = (relation.attributes ?? {}) as {
    name?: string;
    resourceSize?: number;
  };
  const fileName = attributes.name || fileNameFromUrl(relation.url);
  return {
    id: idFromUrl(relation.url),
    fileName,
    // Not carried on the relation. The chip shows a name and a size, and the type is
    // only ever used to decide inline rendering, which ADO does from the file itself.
    contentType: "application/octet-stream",
    length: typeof attributes.resourceSize === "number" ? attributes.resourceSize : 0,
    // The native location. `/api/attachments/{id}` is a .NET route that does not
    // exist in this host, so without this the chip would link nowhere.
    url: withFileName(relation.url, fileName),
  };
}

export function createAttachmentsApi(client: AdoClient): AttachmentsApi {
  /**
   * Descriptors for uploads made in this session.
   *
   * The upload response carries only `{ id, url }`, and nothing else in Azure DevOps
   * remembers the size or the MIME type of an attachment that is not yet on an item.
   * The composer holds its pending files in React state, so this cache lives exactly
   * as long as the thing that needs it: a page reload clears both.
   */
  const uploaded = new Map<string, Attachment>();

  async function describe(id: string): Promise<Attachment | null> {
    const known = uploaded.get(id);
    if (known) return known;

    /*
     * The typed connector operation, not the raw one: there is no metadata-only
     * endpoint for an attachment, and this at least returns the descriptor fields
     * named. It also returns the CONTENT as base64, which is why this is only on the
     * by-id path and never on the list path — reading a comment thread gets its
     * attachments from the item's relations, at no extra call.
     */
    const { organization, project } = await client.context();
    let raw;
    try {
      raw = unwrap(
        await AzureDevOpsService.GetWorkItemAttachmentAsync(organization, id, project),
        "get attachment",
      );
    } catch (error) {
      if (error instanceof AppError && error.category === "notFound") return null;
      throw error;
    }
    if (!raw) return null;

    const fileName = raw.fileName || "attachment";
    return {
      id: raw.attachmentId || id,
      fileName,
      contentType: raw.contentType || "application/octet-stream",
      length: typeof raw.contentLength === "number" ? raw.contentLength : 0,
      url: withFileName(
        `https://dev.azure.com/${organization}/_apis/wit/attachments/${id}`,
        fileName,
      ),
    };
  }

  return {
    describe,

    async upload(input: UploadAttachmentInput): Promise<Attachment> {
      // base64 is 4 characters per 3 bytes; the padding makes this an upper bound.
      const length = Math.floor((input.contentBase64.length * 3) / 4);
      if (length > MAX_ATTACHMENT_BYTES) {
        throw new AppError(
          `Attachment exceeds the ${MAX_ATTACHMENT_BYTES / (1024 * 1024)} MB limit.`,
          { category: "validation" },
        );
      }
      if (!input.contentBase64) {
        throw new AppError("Attachment is empty.", { category: "validation" });
      }

      const created = await client.upload<{ id?: string; url?: string }>(
        `_apis/wit/attachments?fileName=${encodeURIComponent(input.fileName)}`,
        input.contentBase64,
        "upload attachment",
      );

      if (!created.id || !created.url) {
        throw new AppError("Azure DevOps did not return an attachment reference.", {
          category: "unknown",
        });
      }

      const attachment: Attachment = {
        id: created.id,
        fileName: input.fileName,
        contentType: input.contentType ?? "application/octet-stream",
        length,
        url: withFileName(created.url, input.fileName),
      };
      uploaded.set(attachment.id, attachment);
      return attachment;
    },

    async attachToComment(workItemId, attachmentIds, key): Promise<Attachment[]> {
      const wanted = [...new Set(attachmentIds)].filter(Boolean);
      if (wanted.length === 0) return [];

      const resolved: Attachment[] = [];
      for (const id of wanted) {
        const attachment = await describe(id);
        // Refuse rather than attach a reference to something that is not there — the
        // .NET side does the same, and a comment must never claim a file it lost.
        if (!attachment) {
          throw new AppError(`Attachment '${id}' was not found.`, { category: "notFound" });
        }
        resolved.push(attachment);
      }

      await client.patch(
        `_apis/wit/workitems/${workItemId}`,
        resolved.map((attachment) => ({
          op: "add",
          path: "/relations/-",
          value: {
            rel: ATTACHED_FILE,
            url: attachment.url,
            attributes: { name: attachment.fileName, comment: key },
          },
        })),
        "attach files to work item",
      );

      return resolved;
    },

    byComment(item: WorkItem): Map<string, Attachment[]> {
      const grouped = new Map<string, Attachment[]>();
      for (const relation of item.relations ?? []) {
        if (relation.rel !== ATTACHED_FILE) continue;
        const key = relation.attributes?.comment ?? "";
        // An attachment added through the ADO work item UI carries no key of ours.
        // It belongs to the item, not to a comment, so it is not claimed by one.
        if (!key.startsWith("comment:")) continue;
        const list = grouped.get(key) ?? [];
        list.push(toAttachment(relation));
        grouped.set(key, list);
      }
      return grouped;
    },

    markdown(attachments: Attachment[]): string {
      return attachments
        .map((attachment) =>
          `${IMAGE.test(attachment.contentType) ? "!" : ""}[${attachment.fileName}](${attachment.url})`,
        )
        .join("\n");
    },
  };
}

/**
 * The markdown this app appends for an attachment, so a read can take it back out.
 *
 * The reference exists for Azure DevOps' own work item view, where it renders the
 * file inline. This UI renders the same files as chips from the relations, so leaving
 * the markdown in the body would show every attachment twice — once as raw link text.
 */
const ATTACHMENT_MARKDOWN =
  /^\s*!?\[[^\]]*\]\((?:https?:)?[^)\s]*\/_apis\/wit\/attachments\/[^)\s]*\)\s*$/i;

export function stripAttachmentMarkdown(body: string): string {
  return body
    .split(/\r?\n/)
    .filter((line) => !ATTACHMENT_MARKDOWN.test(line))
    .join("\n")
    .trim();
}
