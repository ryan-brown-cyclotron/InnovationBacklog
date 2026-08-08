import { useState } from "react";
import type React from "react";
import styles from "./DecisionForm.module.scss";
import { errorText } from "../../utils";

export function DecisionForm({
  onDecide,
  compact,
}: {
  onDecide: (decision: "accept" | "reject", rationale: string) => Promise<void>;
  compact?: boolean;
}): React.ReactElement {
  const [armed, setArmed] = useState<"accept" | "reject" | null>(null);
  const [rationale, setRationale] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function disarm() {
    setArmed(null);
    setRationale("");
    setError(null);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!armed || !rationale.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onDecide(armed, rationale.trim());
      disarm();
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      setBusy(false);
    }
  }

  if (!armed) {
    return (
      <div className={compact ? styles.barCompact : styles.bar}>
        <button
          type="button"
          className={styles.acceptButton}
          onClick={() => setArmed("accept")}
        >
          Accept
        </button>
        <button
          type="button"
          className={styles.rejectButton}
          onClick={() => setArmed("reject")}
        >
          Reject
        </button>
      </div>
    );
  }

  return (
    <form
      className={compact ? styles.formCompact : styles.form}
      onSubmit={submit}
    >
      <textarea
        className={styles.rationaleInput}
        value={rationale}
        onChange={(event) => setRationale(event.target.value)}
        rows={compact ? 2 : 3}
        placeholder="Explain your decision — this is recorded as audit evidence"
        aria-label="Decision rationale"
        autoFocus
      />
      {error && (
        <span className={styles.error} role="alert">
          {error}
        </span>
      )}
      <div className={styles.formActions}>
        <button
          type="submit"
          className={armed === "accept" ? styles.acceptButton : styles.rejectButton}
          disabled={!rationale.trim() || busy}
        >
          {busy
            ? "Recording…"
            : armed === "accept"
              ? "Confirm accept"
              : "Confirm reject"}
        </button>
        <button
          type="button"
          className={styles.cancelButton}
          onClick={disarm}
          disabled={busy}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
