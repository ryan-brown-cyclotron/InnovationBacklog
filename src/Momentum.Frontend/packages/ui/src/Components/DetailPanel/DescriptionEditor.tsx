import { useState } from "react";
import type React from "react";
import styles from "./DetailPanel.module.scss";
import { errorText } from "../../utils";

/**
 * The description, correctable in place by whoever owns it.
 *
 * Mount with `key={record.id}` so a refresh onto a different record cannot leave a
 * stale draft open over someone else's description.
 */
export function DescriptionEditor({
  description,
  canEdit,
  title = "What it does",
  onSave,
}: {
  description: string;
  canEdit: boolean;
  /**
   * The section heading. A solution is a thing that DOES something; an idea is a
   * thing that IS something, and "What it does" over a problem statement reads as a
   * description of the wrong noun.
   */
  title?: string;
  onSave: (description: string) => Promise<void>;
}): React.ReactElement {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(description);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function open() {
    setDraft(description);
    setError(null);
    setEditing(true);
  }

  function cancel() {
    setEditing(false);
    setError(null);
  }

  async function save() {
    const next = draft.trim();
    if (!next) {
      setError("A description cannot be empty.");
      return;
    }
    if (next === description.trim()) {
      setEditing(false);
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await onSave(next);
      setEditing(false);
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  }

  /*
   * Escape is handled on the ELEMENT, never on window.
   *
   * ModalShell listens for Escape on window in the bubble phase, and OverlayPane
   * listens in the capture phase and stops propagation so it can close without
   * closing the modal. An element handler runs before the window one, so cancelling
   * an edit here leaves the modal open; adding a third window listener would have
   * raced the other two.
   */
  function onKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Escape") {
      event.stopPropagation();
      cancel();
      return;
    }
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void save();
    }
  }

  return (
    <div className={styles.block}>
      <div className={styles.blockHead}>
        <h3 className={styles.blockTitle}>{title}</h3>
        {canEdit && !editing && (
          <button type="button" className={styles.blockAction} onClick={open}>
            Edit
          </button>
        )}
      </div>

      {editing ? (
        <>
          <textarea
            className={styles.editArea}
            value={draft}
            rows={7}
            autoFocus
            aria-label="Description"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={onKeyDown}
          />
          <div className={styles.editActions}>
            <button
              type="button"
              className={styles.saveButton}
              disabled={busy}
              onClick={() => void save()}
            >
              {busy ? "Saving…" : "Save"}
            </button>
            <button type="button" className={styles.cancelButton} onClick={cancel}>
              Cancel
            </button>
          </div>
          {error && (
            <p className={styles.editError} role="alert">
              {error}
            </p>
          )}
        </>
      ) : (
        <p className={styles.bodyText}>{description}</p>
      )}
    </div>
  );
}
