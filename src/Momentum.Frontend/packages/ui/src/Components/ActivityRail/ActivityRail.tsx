import type React from "react";
import styles from "./ActivityRail.module.scss";
import type { ActivityRecord } from "../../types";
import {
  actorInitials,
  actorLabel,
  activityPhrase,
  auditActorName,
  personName,
  initials,
  relativeTime,
  HIDDEN_ACTIVITY_ACTIONS,
} from "../../utils";

export function ActivityRail({
  activity,
  onOpen,
}: {
  activity: ActivityRecord[];
  onOpen: (record: ActivityRecord) => void;
}): React.ReactElement | null {
  // Hide low-value audit events; the rail shows meaningful updates only.
  const items = activity.filter(
    (record) => !HIDDEN_ACTIVITY_ACTIONS.has(record.action),
  );
  if (items.length === 0) return null;

  return (
    <div className={styles.railWrap}>
      <div className={styles.rail}>
        {items.map((record, i) => {
          const isAgent = auditActorName(record.actorType) === "agent";
          const actor = auditActorName(record.actorType) === "user"
            ? actorLabel(record)
            : "Innovation Hub";
          return (
            <div key={`${record.id}-${i}`} className={styles.railGroup}>
              <button
                className={styles.railItem}
                onClick={() => onOpen(record)}
              >
                <span className={`${styles.railAvatar} ${isAgent ? styles.agent : ""}`}>
                  {actorInitials(record)}
                </span>
                <span className={styles.railText}>
                  <strong>{actor}</strong>{" "}
                  <span className={styles.railTarget}>
                    {activityPhrase(record.action, record.summary)}
                  </span>
                  <span className={styles.railTime}> · {relativeTime(record.occurredAt)}</span>
                </span>
              </button>
              {i < items.length - 1 && <span className={styles.sep}>·</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
