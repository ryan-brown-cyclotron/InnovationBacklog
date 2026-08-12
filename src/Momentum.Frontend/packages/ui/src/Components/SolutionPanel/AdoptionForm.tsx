import { useState } from "react";
import type React from "react";
import { modalStyles } from "../Modal/ModalShell";
import styles from "./styles";
import { useApi } from "../../Hooks/useApi";
import { errorText } from "../../utils";

/**
 * Recording an adoption. Lifted out of the panel unchanged apart from its own error
 * state — a failed save used to leave the form looking as though it had worked.
 */
export function AdoptionForm({
  solutionId,
  onDone,
  onCancel,
}: {
  solutionId: string;
  onDone: () => Promise<void>;
  onCancel: () => void;
}): React.ReactElement {
  const api = useApi();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    setError(null);
    try {
      await api(`/api/solutions/${solutionId}/use`, {
        method: "POST",
        body: JSON.stringify({
          projectName: data.get("projectName"),
          team: data.get("team") || undefined,
          status: data.get("status") || "Exploring",
        }),
      });
      form.reset();
      await onDone();
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className={modalStyles.adoptForm} onSubmit={submit}>
      <input
        name="projectName"
        required
        placeholder="Project or team name"
        className={modalStyles.adoptInput}
        aria-label="Project name"
      />
      <input
        name="team"
        placeholder="Team (optional)"
        className={modalStyles.adoptInput}
        aria-label="Team"
      />
      <select
        name="status"
        defaultValue="Exploring"
        className={modalStyles.adoptInput}
        aria-label="Adoption status"
      >
        <option value="Exploring">Exploring</option>
        <option value="Implementing">Implementing</option>
        <option value="Using">Using</option>
      </select>
      {error && (
        <p className={styles.editError} role="alert">
          {error}
        </p>
      )}
      <div className={modalStyles.adoptActions}>
        <button type="button" className={modalStyles.adoptCancel} onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className={modalStyles.adoptSubmit} disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}
