import type {
  ActivityEntry,
  ActivityQuery,
  AddCommentInput,
  Attachment,
  Comment,
  UploadAttachmentInput,
} from "../domain/collaboration.js";
import type { HubItemRef } from "../domain/engagement.js";

export interface CollaborationProvider {
  /**
   * The conversation on an idea or solution.
   *
   * No audience filtering, because there are no audiences. Who can see a
   * conversation is decided by who can see the item it hangs off — one mechanism
   * (the area path) instead of two that can disagree.
   */
  listComments(subject: HubItemRef): Promise<Comment[]>;

  addComment(input: AddCommentInput): Promise<Comment>;

  uploadAttachment(input: UploadAttachmentInput): Promise<Attachment>;
  getAttachment(id: string): Promise<Attachment | null>;

  /** Newest-first activity, already filtered to what the caller may see. */
  listActivity(query?: ActivityQuery): Promise<ActivityEntry[]>;
}
