import { useState } from "react";
import type React from "react";
import styles from "./VisibilityControl.module.scss";
import type { Visibility } from "../../types";
import { useApi } from "../../Hooks/useApi";
import { errorText } from "../../utils";

const OPTIONS: { value: Visibility; label: string; detail: string }[] = [
  {
    value: "Everyone",
    label: "Everyone",
    detail: "Any signed-in person can find and open this.",
  },
  {
    value: "Approvers",
    label: "Approvers only",
    detail: "Approvers, administrators, and the person who shared it.",
  },
  {
    value: "Hidden",
    label: "Hidden",
    detail: "Administrators only. Removed from the hub without deleting it.",
  },
];

export const VISIBILITY_LABELS: Record<Visibility, string> = {
  Everyone: "Everyone",
  Approvers: "Approvers only",
  Hidden: "Hidden",
};

/**
 * Administrator-only control for who can see an idea or a solution. The server
 * enforces the same rule; this is the way to exercise it, not the guard.
 */
export function VisibilityControl({
  itemType,
  itemId,
  visibility,
  onChanged,
}: {
  itemType: "requests" | "solutions";
  itemId: string;
  visibility: Visibility;
  onChanged: () => Promise<void>;
}): React.ReactElement {
  const api = useApi();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [current, setCurrent] = useState<Visibility>(visibility);

  async function change(next: Visibility) {
    if (next === current || busy) return;
    const previous = current;
    setBusy(true);
    setError(null);
    setCurrent(next);
    try {
      await api(`/api/${itemType}/${itemId}/visibility`, {
        method: "PATCH",
        body: JSON.stringify({ visibility: next }),
      });
      await onChanged();
    } catch (reason) {
      setCurrent(previous);
      setError(errorText(reason));
    } finally {
      setBusy(false);
    }
  }

  const active = OPTIONS.find((option) => option.value === current) ?? OPTIONS[0];

  return (
    <section className={styles.wrap}>
      <h3 className={styles.title}>
        Manage access
        <span className={styles.adminBadge}>Admin</span>
      </h3>
      <div className={styles.options} role="radiogroup" aria-label="Manage access">
        {OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={current === option.value}
            className={`${styles.option} ${current === option.value ? styles.optionActive : ""}`}
            onClick={() => void change(option.value)}
            disabled={busy}
          >
            {option.label}
          </button>
        ))}
      </div>
      <p className={styles.detail}>{active.detail}</p>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

/** Badge for an item that is not visible to everyone. */
export function VisibilityBadge({
  visibility,
}: {
  visibility: Visibility;
}): React.ReactElement | null {
  if (visibility === "Everyone") return null;
  return (
    <span
      className={`${styles.badge} ${visibility === "Hidden" ? styles.badgeHidden : styles.badgeRestricted}`}
    >
      {visibility === "Hidden" ? "Hidden" : "Approvers only"}
    </span>
  );
}
