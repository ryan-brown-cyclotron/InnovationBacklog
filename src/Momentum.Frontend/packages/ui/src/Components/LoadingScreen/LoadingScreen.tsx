import { useEffect, useState } from "react";
import type React from "react";
import styles from "./LoadingScreen.module.scss";

export interface LoadingScreenProps {
  /** Product name shown under the mark. */
  title?: string;
  /**
   * Status lines, rotated in order. Each host passes what is actually happening —
   * the code app is resolving a Dataverse user, the web app is establishing a
   * session — so the copy is not baked into the component.
   */
  messages?: string[];
  /** Milliseconds between lines. */
  interval?: number;
}

const DEFAULT_MESSAGES = [
  "Signing you in",
  "Gathering what's new since your last visit",
  "Ranking ideas by momentum",
  "Almost there",
];

/**
 * The whole-viewport wait, shown before there is an app to show.
 *
 * A bare "Signing you in…" is honest but reads as a stall, because nothing on screen
 * changes while it is true. The rotating lines and the drawing graph are the signal
 * that work is still happening — the alternative is a user who reloads a page that
 * was about to finish. For a wait inside an app that is already on screen, use
 * `Pending` from `Empty` instead; a full-bleed brand screen over one slow section
 * would be a bigger interruption than the section is worth.
 */
export function LoadingScreen({
  title = "Innovation Hub",
  messages = DEFAULT_MESSAGES,
  interval = 2600,
}: LoadingScreenProps = {}): React.ReactElement {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (messages.length < 2) return;
    const id = window.setInterval(() => {
      setIndex((current) => (current + 1) % messages.length);
    }, interval);
    return () => window.clearInterval(id);
  }, [messages.length, interval]);

  return (
    <main className={styles.screen}>
      <div className={styles.stage} role="status" aria-live="polite">
        <svg className={styles.graph} viewBox="0 0 180 180" aria-hidden="true">
          <circle className={styles.core} cx="90" cy="90" r="52" />
          <path className={styles.edge} d="M90 90 L90 30" />
          <path className={styles.edge} d="M90 90 L142 60" />
          <path className={styles.edge} d="M90 90 L142 120" />
          <path className={styles.edge} d="M90 90 L90 150" />
          <path className={styles.edge} d="M90 90 L38 120" />
          <path className={styles.edge} d="M90 90 L38 60" />
          <circle className={styles.node} cx="90" cy="30" r="4" />
          <circle className={styles.node} cx="142" cy="60" r="4" />
          <circle className={styles.node} cx="142" cy="120" r="4" />
          <circle className={styles.node} cx="90" cy="150" r="4" />
          <circle className={styles.node} cx="38" cy="120" r="4" />
          <circle className={styles.node} cx="38" cy="60" r="4" />
          <circle className={styles.hub} cx="90" cy="90" r="9" />
        </svg>

        <h1 className={styles.title}>{title}</h1>
        <p className={styles.message}>{messages[index] ?? messages[0]}</p>

        <div className={styles.bar}>
          <span />
        </div>
      </div>
    </main>
  );
}
