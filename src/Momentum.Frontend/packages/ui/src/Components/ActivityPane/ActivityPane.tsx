import type React from "react";
import styles from "./ActivityPane.module.scss";
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

export function ActivityPane({
  open,
  onClose,
  activity,
  onOpenItem,
  contributors,
}: {
  open: boolean;
  onClose: () => void;
  activity: ActivityRecord[];
  onOpenItem: (record: ActivityRecord) => void;
  // `name` carries whatever the store resolved; the id is a bare key and may be a
  // GUID, which is not something to put in front of a person.
  contributors: { id: string; name?: string | null; evidence: string }[];
}): React.ReactElement {
  return (
    <>
      <div
        className={`${styles.overlay} ${open ? styles.overlayOpen : ""}`}
        onClick={onClose}
      />
      <aside className={`${styles.pane} ${open ? styles.paneOpen : ""}`}>
        <header className={styles.paneHeader}>
          <h2>What's happening</h2>
          <button className={styles.close} onClick={onClose} aria-label="Close">×</button>
        </header>
        <div className={styles.section}>
          <div className={styles.label}>Recent activity</div>
          <div className={styles.activityList}>
            {activity
              .filter((record) => !HIDDEN_ACTIVITY_ACTIONS.has(record.action))
              .map((record) => {
              const isAgent = auditActorName(record.actorType) === "agent";
              const actor = auditActorName(record.actorType) === "user"
                ? actorLabel(record)
                : "Innovation Hub";
              return (
                <button
                  key={record.id}
                  className={styles.actCard}
                  onClick={() => onOpenItem(record)}
                >
                  <span className={`${styles.actAvatar} ${isAgent ? styles.agent : ""}`}>
                    {actorInitials(record)}
                  </span>
                  <div className={styles.actBody}>
                    <strong>
                      {actor}{" "}
                      <span className={styles.actVerb}>
                        {activityPhrase(record.action)}
                      </span>
                    </strong>
                    <span className={styles.actTime}>{relativeTime(record.occurredAt)}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
        {contributors.length > 0 && (
          <div className={styles.section}>
            <div className={styles.label}>
              People making an impact <span className={styles.labelMeta}>This month</span>
            </div>
            <div className={styles.contribList}>
              {contributors.map((contrib, i) => (
                <div key={contrib.id} className={styles.contribCard}>
                  <span className={styles.contribNum}>{String(i + 1).padStart(2, "0")}</span>
                  <span className={styles.contribAvatar}>
                    {actorInitials({ actorId: contrib.id, actorName: contrib.name })}
                  </span>
                  <div className={styles.contribInfo}>
                    <strong>
                      {actorLabel({ actorId: contrib.id, actorName: contrib.name })}
                    </strong>
                    <small>{contrib.evidence}</small>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </aside>
    </>
  );
}
