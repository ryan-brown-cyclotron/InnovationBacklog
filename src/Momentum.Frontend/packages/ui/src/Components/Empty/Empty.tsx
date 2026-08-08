import type React from "react";
import styles from "./Empty.module.scss";

export function Empty({ text }: { text: string }): React.ReactElement {
  return (
    <div className={styles.empty}>
      <strong>Nothing here yet</strong>
      <p>{text}</p>
    </div>
  );
}

/**
 * Shown while a surface is still fetching.
 *
 * "Nothing here yet" and "still loading" are different claims, and rendering the
 * first while the second is true is how an app that is working reads as an app that
 * is broken. Every empty state in this UI is derived from array length, so without
 * this a slow Azure DevOps or Dataverse round trip looks like an answered question.
 */
export function Pending({ text }: { text: string }): React.ReactElement {
  return (
    <div className={styles.pending} role="status" aria-live="polite">
      <span className={styles.spinner} aria-hidden="true" />
      <p>{text}</p>
    </div>
  );
}

export function ContextualEmpty({
  title,
  text,
}: {
  title: string;
  text: string;
}): React.ReactElement {
  return (
    <div className={styles.contextual}>
      <strong>{title}</strong>
      <p>{text}</p>
    </div>
  );
}
