/**
 * This is a TypeGen auto-generated file.
 * Any changes made to this file can be lost when this file is regenerated.
 */

import { AttachmentResponse } from "./attachment-response";

export interface CommentResponse {
    id: string;
    subjectId: string;
    subjectType: string;
    authorId: string;
    audience: string;
    body: string;
    attachments: AttachmentResponse[];
    createdAt: string;
}
