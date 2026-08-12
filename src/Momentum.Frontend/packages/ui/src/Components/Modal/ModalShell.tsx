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
  tabs,
  overlays,
  onClose,
  children,
}: {
  eyebrow: string;
  /** Optional chip beside the eyebrow, e.g. restricted visibility. */
  badge?: React.ReactNode;
  tone: "need" | "solution";
  title: string;
  description?: string;
  /** A node rather than a string so a caller can put an avatar in the byline. */
  meta?: React.ReactNode;
  primaryAction?: React.ReactNode;
  /**
   * A tab strip, rendered between the header and the body.
   *
   * Deliberately NOT part of `children`. The body is padded, so a strip inside it
   * would inset its own bottom border by the padding on each side; as a sibling the
   * border spans the modal while the strip's own padding still positions the
   * buttons. Passing this also flattens the header's border (they would otherwise
   * draw two rules a row apart) and clears the body's padding, because a tabbed
   * modal's panels own their padding and their scroll containers.
   */
  tabs?: React.ReactNode;
  /**
   * Layered surfaces such as `OverlayPane`, rendered as a sibling of the body.
   *
   * They cannot live in `children`: the body is `overflow: hidden`, which clips an
   * absolutely-positioned descendant even though the containing block is `.modal`
   * further up — so a pane rendered there covers only the area below the header.
   */
  overlays?: React.ReactNode;
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
        <header
          className={`${styles.header} ${tabs ? styles.headerFlush : ""}`.trim()}
        >
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
        {tabs && <div className={styles.tabStrip}>{tabs}</div>}
        <div className={`${styles.body} ${tabs ? styles.bodyFlush : ""}`.trim()}>
          {children}
        </div>
        {overlays}
      </div>
    </div>
  );
}

export { styles as modalStyles };
