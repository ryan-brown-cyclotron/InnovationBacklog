import { useState } from "react";
import type React from "react";
import { MAX_TAGS, normalizeTags } from "@innovation-backlog/logic";
import styles from "./SolutionPanel.module.scss";
import { TagList } from "../TagList/TagList";
import { errorText } from "../../utils";

/**
 * Tags, editable in place.
 *
 * Optimistic: the chip appears or disappears immediately and rolls back if the save
 * fails, which is the pattern `VisibilityControl` already uses. Adding a tag is one
 * keystroke away from being a mistake, so making the reader wait on a round trip to
 * see whether it worked is a worse trade than occasionally reverting.
 */
export function TagEditor({
  tags,
  canEdit,
  onSelect,
  onSave,
}: {
  tags: readonly string[];
  canEdit: boolean;
  onSelect?: (tag: string) => void;
  onSave: (tags: string[]) => Promise<void>;
}): React.ReactElement | null {
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const shown = pending ?? [...tags];
  const full = shown.length >= MAX_TAGS;

  if (!canEdit) {
    return shown.length > 0 ? <TagList tags={shown} onSelect={onSelect} /> : null;
  }

  async function commit(next: string[]) {
    const normalized = normalizeTags(next);
    setPending(normalized);
    setError(null);
    try {
      await onSave(normalized);
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      // Whether it worked or not, the server's answer is now the truth.
      setPending(null);
    }
  }

  function add() {
    const value = draft.trim();
    if (!value || full) return;
    setDraft("");
    void commit([...shown, value]);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      add();
      return;
    }
    // Only with an empty field, so it cannot fire while someone is mid-word.
    if (event.key === "Backspace" && !event.currentTarget.value && shown.length > 0) {
      event.preventDefault();
      void commit(shown.slice(0, -1));
      return;
    }
    if (event.key === "Escape") {
      // See the note in DescriptionEditor: element handler, never window.
      event.stopPropagation();
      setDraft("");
    }
  }

  return (
    <div className={styles.tagRow}>
      <TagList
        tags={shown}
        onSelect={onSelect}
        onRemove={(tag) => void commit(shown.filter((each) => each !== tag))}
      />
      {full ? (
        <span className={styles.tagLimit}>{MAX_TAGS} tags is the limit</span>
      ) : (
        <input
          className={styles.tagInput}
          value={draft}
          placeholder="+ add tag"
          aria-label="Add a tag"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
          onBlur={add}
        />
      )}
      {error && (
        <span className={styles.editError} role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
