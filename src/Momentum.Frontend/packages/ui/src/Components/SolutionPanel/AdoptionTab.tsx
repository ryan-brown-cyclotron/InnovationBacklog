import { useState } from "react";
import type React from "react";
import styles from "./SolutionPanel.module.scss";
import type { SolutionUse } from "../../types";
import { Empty } from "../Empty/Empty";
import { adoptionTone } from "./solutionTone";
import { errorText, initials, personName, relativeTime } from "../../utils";

const STATUSES = ["Exploring", "Implementing", "Using"] as const;

/**
 * Who else is doing this.
 *
 * The rows, not the tally: someone deciding whether to adopt wants to see the other
 * adopters — which team, on what, how far along, and whether anyone finished — and
 * every one of those facts was already in the response that produced the count.
 */
export function AdoptionTab({
  adoptions,
  adoptionCount,
  teams,
  onRecord,
  onSetStatus,
}: {
  adoptions: SolutionUse[];
  /** The rollup's count, which survives when the rows themselves could not be read. */
  adoptionCount: number;
  teams: number;
  onRecord: () => void;
  onSetStatus: (useId: string, status: string) => Promise<void>;
}): React.ReactElement {
  const [error, setError] = useState<string | null>(null);

  async function setStatus(useId: string, status: string) {
    setError(null);
    try {
      await onSetStatus(useId, status);
    } catch (cause) {
      setError(errorText(cause));
    }
  }

  return (
    <>
      <div className={styles.toolbar}>
        <span className={styles.toolbarNote}>{headline(adoptionCount, teams)}</span>
        <button type="button" className={styles.cancelButton} onClick={onRecord}>
          + Record an adoption
        </button>
      </div>

      <div className={styles.scroller}>
        {error && (
          <p className={styles.editError} role="alert">
            {error}
          </p>
        )}

        {adoptions.length === 0 ? (
          <Empty
            text={
              adoptionCount > 0
                ? "Adoptions are recorded for this solution, but they could not be loaded here."
                : "Nobody has recorded using this yet. Be the first."
            }
          />
        ) : (
          <ul className={styles.adoptionList}>
            {adoptions.map((use) => (
              <AdoptionRow key={use.id} use={use} onSetStatus={setStatus} />
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

/**
 * One adopter.
 *
 * The team leads, because "who else is doing this" is the question the list answers;
 * the project is what they are doing it on. An adoption with no team names the
 * project in the same position rather than reading "— · Northwind RFP response",
 * which is the same rule the rollup uses when it counts DISTINCT `team ?? project`.
 */
function AdoptionRow({
  use,
  onSetStatus,
}: {
  use: SolutionUse;
  onSetStatus: (useId: string, status: string) => Promise<void>;
}): React.ReactElement {
  const who = use.startedByName?.trim() || personName(use.startedBy);
  const heading = use.team?.trim() || use.projectName || "A team";
  const detail = use.team?.trim() && use.projectName ? use.projectName : "";
  const settled = Boolean(use.completedAt);
  const tone = adoptionTone(use);

  return (
    <li className={styles.adoptionRow}>
      <span className={styles.adoptionTile} aria-hidden="true">
        {initials(heading)}
      </span>

      <div className={styles.adoptionMain}>
        <span className={styles.adoptionWho}>
          {heading}
          {detail && <span className={styles.adoptionProject}> · {detail}</span>}
        </span>
        <span className={styles.adoptionMeta}>
          {settled
            ? `Rolled out ${relativeTime(use.completedAt)} · started by ${who}`
            : `Started ${relativeTime(use.startedAt)} by ${who}`}
        </span>
      </div>

      {settled ? (
        <span className={`${styles.pill} ${styles.toneSuccess}`}>Rolled out</span>
      ) : (
        <select
          className={`${styles.pill} ${styles.pillSelect} ${styles[`tone${cap(tone)}`] ?? ""}`.trim()}
          value={use.status || "Exploring"}
          aria-label={`Status for ${heading}`}
          onChange={(event) => void onSetStatus(use.id, event.target.value)}
        >
          {STATUSES.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
      )}
    </li>
  );
}

/** "Used by 3 teams · 4 adoptions", without repeating itself when they are equal. */
export function headline(adoptions: number, teams: number): string {
  const uses = `${adoptions} adoption${adoptions === 1 ? "" : "s"}`;
  if (teams <= 0) return uses;
  const across = `${teams} team${teams === 1 ? "" : "s"}`;
  return teams === adoptions ? `Used by ${across}` : `Used by ${across} · ${uses}`;
}

/**
 * Distinct `team ?? projectName`, case-insensitively — the same rule the rollup uses,
 * so a panel that fell back to counting rows itself still says the same number.
 */
export function distinctTeams(adoptions: SolutionUse[]): number {
  const seen = new Set<string>();
  for (const use of adoptions) {
    const label = (use.team || use.projectName || "").trim().toLowerCase();
    if (label) seen.add(label);
  }
  return seen.size;
}

const cap = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);
