import { useRef, useState } from "react";
import type React from "react";
import styles from "./CommentComposer.module.scss";
import type { Attachment } from "../../types";
import { useApi } from "../../Hooks/useApi";
import { errorText, formatFileSize } from "../../utils";

/** Mirrors the server-side cap in CatalystApiEndpoints. */
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

export interface CommentComposerProps {
  placeholder: string;
  /** Approvers and administrators can mark a comment private. */
  allowPrivate?: boolean;
  onSubmit: (draft: {
    body: string;
    audience: string;
    attachmentIds: string[];
  }) => Promise<void>;
}

/**
 * The single comment entry surface for ideas and solutions: body, optional
 * private flag, and file attachments. Files upload as they are picked so the
 * comment itself only carries ids.
 */
export function CommentComposer({
  placeholder,
  allowPrivate = false,
  onSubmit,
}: CommentComposerProps): React.ReactElement {
  const api = useApi();
  const fileInput = useRef<HTMLInputElement>(null);
  const [body, setBody] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function addFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null);
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        if (file.size > MAX_ATTACHMENT_BYTES) {
          setError(`${file.name} is larger than 10 MB.`);
          continue;
        }
        const uploaded = await api<Attachment>("/api/attachments", {
          method: "POST",
          body: JSON.stringify({
            fileName: file.name,
            contentType: file.type || null,
            contentBase64: await toBase64(file),
          }),
        });
        setAttachments((prev) => [...prev, uploaded]);
      }
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || uploading) return;
    if (!body.trim() && attachments.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit({
        body: body.trim(),
        audience: isPrivate ? "ApproversOnly" : "Authenticated",
        attachmentIds: attachments.map((item) => item.id),
      });
      setBody("");
      setIsPrivate(false);
      setAttachments([]);
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className={styles.form} onSubmit={submit}>
      <textarea
        name="body"
        rows={3}
        value={body}
        onChange={(event) => setBody(event.target.value)}
        placeholder={placeholder}
        className={styles.input}
        aria-label="Comment"
      />

      {attachments.length > 0 && (
        <ul className={styles.pending}>
          {attachments.map((attachment) => (
            <li key={attachment.id} className={styles.pendingItem}>
              <span className={styles.pendingName}>{attachment.fileName}</span>
              <span className={styles.pendingSize}>
                {formatFileSize(attachment.length)}
              </span>
              <button
                type="button"
                className={styles.pendingRemove}
                onClick={() =>
                  setAttachments((prev) =>
                    prev.filter((item) => item.id !== attachment.id),
                  )
                }
                aria-label={`Remove ${attachment.fileName}`}
                title="Remove"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      {error && (
        <span className={styles.error} role="alert">
          {error}
        </span>
      )}

      <div className={styles.actions}>
        <div className={styles.leftActions}>
          <button
            type="button"
            className={styles.attachButton}
            onClick={() => fileInput.current?.click()}
            disabled={uploading}
          >
            {uploading ? "Attaching…" : "Attach a file"}
          </button>
          <input
            ref={fileInput}
            type="file"
            multiple
            className={styles.fileInput}
            onChange={(event) => void addFiles(event.target.files)}
            aria-label="Attach files to this comment"
          />
          {allowPrivate && (
            <label className={styles.privateToggle}>
              <input
                type="checkbox"
                checked={isPrivate}
                onChange={(event) => setIsPrivate(event.target.checked)}
              />
              Private
            </label>
          )}
        </div>
        <button
          type="submit"
          className={styles.submitButton}
          disabled={busy || uploading || (!body.trim() && attachments.length === 0)}
        >
          {busy ? "Adding…" : "Add comment"}
        </button>
      </div>
    </form>
  );
}

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
    reader.onload = () => {
      const result = String(reader.result);
      // readAsDataURL yields "data:<type>;base64,<payload>".
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.readAsDataURL(file);
  });
}
