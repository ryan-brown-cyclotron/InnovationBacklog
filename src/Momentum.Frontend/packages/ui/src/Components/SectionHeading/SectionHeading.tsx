import type React from "react";
import styles from "./SectionHeading.module.scss";

export function SectionHeading({
  title,
  meta,
  action,
  onAction,
}: {
  title: string;
  meta?: string;
  action?: string;
  onAction?: () => void;
}): React.ReactElement {
  return (
    <header className={styles.heading}>
      <div className={styles.left}>
        <h2>{title}</h2>
        {meta && <span className={styles.meta}>{meta}</span>}
      </div>
      {action && onAction && (
        <button className={styles.action} onClick={onAction}>
          {action} →
        </button>
      )}
    </header>
  );
}
