import { useEffect, useState } from "react";
import type React from "react";
import styles from "./ContributeModal.module.scss";
import type { ContributionKind } from "../../types";
import { useApi } from "../../Hooks/useApi";
import {
  parseTags,
  SOLUTION_KINDS,
  solutionKindSpec,
  type SolutionKind,
} from "@innovation-backlog/logic";
import { errorText } from "../../utils";

/**
 * Small decision modal behind "+ Contribute". Selecting a kind transitions
 * directly into the idea or solution form without leaving the current page.
 */
export function ContributeModal({
  initialKind,
  onClose,
  onCreated,
}: {
  initialKind: ContributionKind | null;
  onClose: () => void;
  onCreated: () => Promise<void>;
}): React.ReactElement {
  const [kind, setKind] = useState<ContributionKind | null>(initialKind);
  const [solutionKind, setSolutionKind] = useState<SolutionKind>(SOLUTION_KINDS[0]!.id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const api = useApi();

  // What the chosen kind actually consists of. Declared once in the domain so the
  // form and the write path cannot disagree about what is required.
  const spec = solutionKindSpec(solutionKind);
  const needsRepository = spec.requires.includes("repository");
  const needsDemo = spec.requires.includes("demo");

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!kind) return;
    setBusy(true);
    setError(null);
    const data = new FormData(event.currentTarget);
    // Comma-separated in. Normalized HERE, not server-side: the only host that
    // exists writes System.Tags straight through, so a cap the client does not
    // apply is a cap nothing applies.
    const tags = parseTags(String(data.get("tags") ?? ""));
    try {
      if (kind === "solution") {
        const demoUrl = String(data.get("demoUrl") ?? "").trim();
        const repositoryUrl = String(data.get("repositoryUrl") ?? "").trim();
        await api(`/api/solutions`, {
          method: "POST",
          body: JSON.stringify({
            title: String(data.get("title")),
            description: String(data.get("description")),
            solutionType: solutionKind,
            // Sent only when the kind calls for them. A strategy has no repository,
            // and posting empty strings would create a solution pointing at nothing.
            repositoryOwner: needsRepository ? String(data.get("repositoryOwner")) : undefined,
            repositoryName: needsRepository ? String(data.get("repositoryName")) : undefined,
            repositoryUrl: needsRepository ? repositoryUrl : undefined,
            demoUrl: demoUrl || undefined,
            tags,
          }),
        });
      } else {
        await api(`/api/requests`, {
          method: "POST",
          body: JSON.stringify({
            title: String(data.get("title")),
            description: String(data.get("description")),
            type: "Backlog",
            tags,
          }),
        });
      }
      await onCreated();
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      setBusy(false);
    }
  }

  const isSolution = kind === "solution";

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div
        className={`${styles.modal} ${kind ? styles.modalForm : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label="Share something"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          className={styles.closeButton}
          onClick={onClose}
          aria-label="Close"
        >
          ×
        </button>

        {!kind ? (
          <>
            <h2 className={styles.heading}>Share something</h2>
            <p className={styles.sub}>
              Add an idea for people to build on or share a solution others
              can use.
            </p>
            <div className={styles.choices}>
              <button
                className={styles.choice}
                onClick={() => {
                  setError(null);
                  setKind("request");
                }}
              >
                <span className={`${styles.choiceKind} ${styles.kindIdea}`}>
                  Idea
                </span>
                <span className={styles.choiceTitle}>Share an idea</span>
                <span className={styles.choiceText}>
                  Something the organization should explore, improve, or build.
                </span>
                <span className={styles.choiceAction}>Share an idea →</span>
              </button>
              <button
                className={styles.choice}
                onClick={() => {
                  setError(null);
                  setKind("solution");
                }}
              >
                <span className={`${styles.choiceKind} ${styles.kindSolution}`}>
                  Solution
                </span>
                <span className={styles.choiceTitle}>Share a solution</span>
                <span className={styles.choiceText}>
                  Something useful and reusable that already exists.
                </span>
                <span className={styles.choiceAction}>Share a solution →</span>
              </button>
            </div>
          </>
        ) : (
          <>
            <button
              className={styles.backButton}
              onClick={() => {
                setError(null);
                setKind(null);
              }}
            >
              ← Choose something else
            </button>
            <h2 className={styles.heading}>
              {isSolution ? "Share a solution" : "Share an idea"}
            </h2>
            <p className={styles.sub}>
              {isSolution
                ? "Add something useful that already exists so others can reuse it."
                : "Put a worthwhile idea in front of the people who can build on it."}
            </p>
            <form className={styles.editor} onSubmit={submit}>
              <label>
                {isSolution ? "Solution name" : "Idea title"}
                <input name="title" required maxLength={160} autoFocus />
              </label>
              <label>
                {isSolution
                  ? "What does it do, and where could it be reused?"
                  : "What is it, who is affected, and why does it matter?"}
                <textarea name="description" required rows={6} />
              </label>
              <label>
                Tags <span className={styles.optional}>optional</span>
                <input
                  name="tags"
                  maxLength={200}
                  placeholder="Comma separated — e.g. Azure, Developer Experience, CI/CD"
                />
              </label>
              {isSolution && (
                <>
                  {/* The kind decides what the rest of the form asks for, so it is
                      chosen first. A strategy has no repository; asking for one and
                      then ignoring it is how forms end up full of placeholder URLs. */}
                  <fieldset className={styles.kindChoice}>
                    <legend>What kind of solution is this?</legend>
                    {SOLUTION_KINDS.map((spec) => (
                      <label key={spec.id} className={styles.kindOption}>
                        <input
                          type="radio"
                          name="solutionType"
                          value={spec.id}
                          checked={solutionKind === spec.id}
                          onChange={() => setSolutionKind(spec.id)}
                        />
                        <span>
                          <strong>{spec.label}</strong>
                          <small>{spec.description}</small>
                        </span>
                      </label>
                    ))}
                  </fieldset>

                  <div className={styles.repositoryFields}>
                    {needsRepository && (
                      <>
                        <label>
                          Repository owner
                          <input name="repositoryOwner" required />
                        </label>
                        <label>
                          Repository name
                          <input name="repositoryName" required />
                        </label>
                        <label className={styles.wide}>
                          Repository URL
                          <input
                            name="repositoryUrl"
                            type="url"
                            required
                            placeholder="https://github.com/owner/repo"
                          />
                        </label>
                      </>
                    )}
                    <label className={styles.wide}>
                      Demo link{" "}
                      {!needsDemo && <span className={styles.optional}>optional</span>}
                      <input
                        name="demoUrl"
                        type="url"
                        required={needsDemo}
                        placeholder={
                          needsDemo
                            ? "https://example.com — the worked example people should look at"
                            : "https://demo.example.com — a working demo or example"
                        }
                      />
                    </label>
                  </div>
                </>
              )}
              {error && (
                <div className={styles.error} role="alert">
                  {error}
                </div>
              )}
              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.cancelButton}
                  onClick={onClose}
                >
                  Cancel
                </button>
                <button className={styles.primaryButton} disabled={busy}>
                  {busy
                    ? "Sharing…"
                    : isSolution
                      ? "Share solution"
                      : "Share idea"}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
