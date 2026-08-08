import { useEffect } from "react";
import type React from "react";
import styles from "./OverlayPane.module.scss";

/**
 * A pane that layers over the modal it belongs to, rather than opening inline
 * and pushing the content below it down. Secondary actions — visibility,
 * recording adoption, making a decision — live here so the main body keeps its
 * position while you use them.
 */
export function OverlayPane({
  title,
  detail,
  open,
  onClose,
  children,
}: {
  title: string;
  detail?: string;
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}): React.ReactElement | null {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // The pane closes first; the modal behind it stays open.
      event.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className={styles.layer}>
      <div className={styles.scrim} onClick={onClose} />
      <aside
        className={styles.pane}
        role="dialog"
        aria-modal="false"
        aria-label={title}
      >
        <header className={styles.header}>
          <div>
            <h3 className={styles.title}>{title}</h3>
            {detail && <p className={styles.detail}>{detail}</p>}
          </div>
          <button className={styles.close} onClick={onClose} aria-label="Close panel">
            ×
          </button>
        </header>
        <div className={styles.body}>{children}</div>
      </aside>
    </div>
  );
}
