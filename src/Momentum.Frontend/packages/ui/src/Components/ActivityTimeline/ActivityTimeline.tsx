import type React from "react";
import styles from "./ActivityTimeline.module.scss";
import type { ActivityRecord } from "../../types";
import { auditActorName } from "../../utils";

export function ActivityTimeline({
  records,
  showSubject = false,
}: {
  records: ActivityRecord[];
  showSubject?: boolean;
}): React.ReactElement {
  return (
    <div className={styles.timeline}>
      {records.map((record) => (
        <article key={record.id}>
          <span className={`${styles.actor} ${styles[`actor${auditActorName(record.actorType)}`] ?? ""}`}>
            {auditActorName(record.actorType)}
          </span>
          <div className={styles.body}>
            <strong>{record.summary}</strong>
            <p>
              {record.actorId}
              {showSubject && ` · ${record.subjectId}`}
            </p>
          </div>
          <time>{new Date(record.occurredAt).toLocaleString()}</time>
        </article>
      ))}
    </div>
  );
}
