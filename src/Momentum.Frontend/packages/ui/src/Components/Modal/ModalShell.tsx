import { useEffect, useState } from "react";
import type React from "react";
import styles from "./ModalShell.module.scss";

/**
 * Shared engagement-modal shell for needs and solutions. The page behind the
 * modal keeps its position, filters, and grouping; the modal is the focused
 * engagement surface.
 */
export function ModalShell({
  eyebrow,
  badge,
  tone,
  title,
  description,
  meta,
  primaryAction,
  onClose,
  children,
}: {
  eyebrow: string;
  /** Optional chip beside the eyebrow, e.g. restricted visibility. */
  badge?: React.ReactNode;
  tone: "need" | "solution";
  title: string;
  description?: string;
  meta?: string;
  primaryAction?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
}): React.ReactElement {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function share() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard unavailable — no-op.
    }
  }

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <header className={styles.header}>
          <div className={styles.headerMain}>
            <div className={styles.eyebrowRow}>
              <div
                className={`${styles.eyebrow} ${tone === "need" ? styles.eyebrowNeed : styles.eyebrowSolution}`}
              >
                <span className={styles.dot} />
                {eyebrow}
              </div>
              {badge}
            </div>
            <h2 className={styles.title}>{title}</h2>
            {description && <p className={styles.lede}>{description}</p>}
            {meta && <p className={styles.meta}>{meta}</p>}
          </div>
          <div className={styles.headerActions}>
            {primaryAction}
            <button className={styles.ghostButton} onClick={() => void share()}>
              {copied ? "Link copied" : "Share"}
            </button>
            <button
              className={styles.closeButton}
              onClick={onClose}
              aria-label="Close"
            >
              ×
            </button>
          </div>
        </header>
        <div className={styles.body}>{children}</div>
      </div>
    </div>
  );
}

export { styles as modalStyles };
