import { useState } from "react";
import type React from "react";
import {
  MILESTONE_STATUSES,
  type Milestone,
  type MilestoneStatus,
} from "@innovation-backlog/logic";
import styles from "./SolutionPanel.module.scss";
import {
  milestoneStatusLabel,
  milestoneTargetLabel,
  milestoneTone,
} from "./solutionTone";
import { errorText } from "../../utils";

/**
 * What the owner has committed to next.
 *
 * Absent (`undefined`) means the host has no milestone type and the section does not
 * render at all — as opposed to `[]`, which means it asked and there is nothing yet.
 * A "no milestones" empty state on a host that can never have any would be a claim
 * about the roadmap rather than about the backend.
 */
export function RoadmapTimeline({
  milestones,
  canEdit,
  onUpdate,
  onCreate,
  onDelete,
}: {
  milestones: Milestone[] | undefined;
  canEdit: boolean;
  onUpdate: (id: string, patch: { title?: string; status?: MilestoneStatus }) => Promise<void>;
  onCreate: () => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}): React.ReactElement | null {
  const [error, setError] = useState<string | null>(null);

  if (!milestones) return null;

  const run = async (work: () => Promise<void>) => {
    setError(null);
    try {
      await work();
    } catch (cause) {
      setError(errorText(cause));
    }
  };

  return (
    <div className={styles.block}>
      <div className={styles.blockHead}>
        <h3 className={styles.blockTitle}>Roadmap</h3>
        {canEdit && (
          <button
            type="button"
            className={styles.blockAction}
            onClick={() => void run(onCreate)}
          >
            + Add milestone
          </button>
        )}
      </div>

      {milestones.length === 0 ? (
        <p className={styles.muted}>
          {canEdit
            ? "No milestones yet — add one to tell adopters what is coming."
            : "No roadmap has been published for this solution."}
        </p>
      ) : (
        <ol className={styles.roadmap}>
          {milestones.map((milestone) => (
            <MilestoneRow
              key={milestone.id}
              milestone={milestone}
              canEdit={canEdit}
              onUpdate={(patch) => run(() => onUpdate(milestone.id, patch))}
              onDelete={() => run(() => onDelete(milestone.id))}
            />
          ))}
        </ol>
      )}

      {error && (
        <p className={styles.editError} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function MilestoneRow({
  milestone,
  canEdit,
  onUpdate,
  onDelete,
}: {
  milestone: Milestone;
  canEdit: boolean;
  onUpdate: (patch: { title?: string; status?: MilestoneStatus }) => Promise<void>;
  onDelete: () => Promise<void>;
}): React.ReactElement {
  const [title, setTitle] = useState(milestone.title);
  const tone = milestoneTone(milestone.status);
  const target = milestoneTargetLabel(milestone.targetLabel, milestone.targetDate);

  function commitTitle() {
    const next = title.trim();
    if (!next || next === milestone.title) {
      setTitle(milestone.title);
      return;
    }
    void onUpdate({ title: next });
  }

  return (
    <li className={styles.roadmapRow}>
      <div className={styles.roadmapRail} aria-hidden="true">
        <span
          className={`${styles.roadmapDot} ${styles[`dot${cap(tone)}`] ?? ""}`.trim()}
        />
        <span className={styles.roadmapLine} />
      </div>

      <div className={styles.roadmapBody}>
        <div className={styles.roadmapHead}>
          {canEdit ? (
            <input
              className={styles.roadmapTitleInput}
              value={title}
              // A borderless field that looks like a heading reads as nothing at all
              // without this.
              aria-label={`Milestone title: ${milestone.title}`}
              onChange={(event) => setTitle(event.target.value)}
              onBlur={commitTitle}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  event.currentTarget.blur();
                } else if (event.key === "Escape") {
                  event.stopPropagation();
                  setTitle(milestone.title);
                  event.currentTarget.blur();
                }
              }}
            />
          ) : (
            <span className={styles.roadmapTitle}>{milestone.title}</span>
          )}
          <span className={styles.roadmapTarget}>{target}</span>
        </div>

        <div className={styles.roadmapMeta}>
          {canEdit ? (
            <select
              className={`${styles.pill} ${styles.pillSelect} ${styles[`tone${cap(tone)}`] ?? ""}`.trim()}
              value={milestone.status}
              aria-label={`Status for ${milestone.title}`}
              onChange={(event) =>
                void onUpdate({ status: event.target.value as MilestoneStatus })
              }
            >
              {MILESTONE_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {milestoneStatusLabel(status)}
                </option>
              ))}
            </select>
          ) : (
            <span
              className={`${styles.pill} ${styles[`tone${cap(tone)}`] ?? ""}`.trim()}
            >
              {milestoneStatusLabel(milestone.status)}
            </span>
          )}

          {milestone.note && <span className={styles.roadmapNote}>{milestone.note}</span>}

          {canEdit && (
            <button
              type="button"
              className={styles.rowRemove}
              aria-label={`Remove milestone ${milestone.title}`}
              title="Remove"
              onClick={() => void onDelete()}
            >
              ×
            </button>
          )}
        </div>
      </div>
    </li>
  );
}

const cap = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);
