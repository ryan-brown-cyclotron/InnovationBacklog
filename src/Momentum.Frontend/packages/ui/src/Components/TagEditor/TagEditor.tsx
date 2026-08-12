import { useState } from "react";
import type React from "react";
import { MAX_TAGS, normalizeTags } from "@innovation-backlog/logic";
import styles from "./TagEditor.module.scss";
import { TagList } from "../TagList/TagList";
import { errorText } from "../../utils";

/**
 * Removable pills plus an add-input. Controlled, and nothing else — no record, no
 * save, no opinion about where the value goes.
 *
 * This is the half intake needs. `TagEditor` below is this component with an async
 * save layered on top; the two used to be one, which is why the intake form kept a
 * bare comma-separated `<input>` — there was no way to reuse the pills without
 * inventing a record for them to save against.
 *
 * Every mutation runs through `normalizeTags`, so what the reader sees is what a
 * provider would have stored: the cap, the dedupe and the 32-character truncation
 * all happen in front of them rather than silently at the far end of a POST.
 */
export function TagField({
  tags,
  onChange,
  onSelect,
  error,
  inputId,
}: {
  tags: readonly string[];
  onChange: (tags: string[]) => void;
  /** Makes existing pills clickable, e.g. to filter by them. */
  onSelect?: (tag: string) => void;
  /** Rendered under the row. The async wrapper uses it for save failures. */
  error?: string | null;
  /** Ties a caller's own `<label>` to the add-input. */
  inputId?: string;
}): React.ReactElement {
  const [draft, setDraft] = useState("");
  const full = tags.length >= MAX_TAGS;

  function add() {
    const value = draft.trim();
    if (!value || full) return;
    setDraft("");
    onChange(normalizeTags([...tags, value]));
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      // Also stops the Enter that commits a tag from submitting the form around it.
      event.preventDefault();
      add();
      return;
    }
    // Only with an empty field, so it cannot fire while someone is mid-word.
    if (event.key === "Backspace" && !event.currentTarget.value && tags.length > 0) {
      event.preventDefault();
      onChange(tags.slice(0, -1));
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
        tags={[...tags]}
        onSelect={onSelect}
        onRemove={(tag) => onChange(tags.filter((each) => each !== tag))}
      />
      {full ? (
        <span className={styles.tagLimit}>{MAX_TAGS} tags is the limit</span>
      ) : (
        <input
          id={inputId}
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
        <span className={styles.error} role="alert">
          {error}
        </span>
      )}
    </div>
  );
}

/**
 * Tags on an existing record, editable in place.
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
  const [pending, setPending] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const shown = pending ?? [...tags];

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

  return (
    <TagField
      tags={shown}
      onSelect={onSelect}
      error={error}
      onChange={(next) => void commit(next)}
    />
  );
}
