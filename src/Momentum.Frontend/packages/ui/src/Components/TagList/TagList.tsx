import type React from "react";
import styles from "./TagList.module.scss";

/**
 * Tags on an idea or a solution. Clicking one searches for it, so tags are a
 * way through the hub rather than decoration.
 */
export function TagList({
  tags,
  max,
  onSelect,
}: {
  tags: readonly string[] | undefined;
  /** Show at most this many, then "+N". Omit to show all. */
  max?: number;
  onSelect?: (tag: string) => void;
}): React.ReactElement | null {
  const all = tags ?? [];
  if (all.length === 0) return null;

  const shown = max ? all.slice(0, max) : all;
  const hidden = all.length - shown.length;

  return (
    <ul className={styles.tags}>
      {shown.map((tag) =>
        onSelect ? (
          <li key={tag}>
            <button
              type="button"
              className={`${styles.tag} ${styles.tagButton}`}
              onClick={(event) => {
                event.stopPropagation();
                onSelect(tag);
              }}
              title={`Find everything tagged ${tag}`}
            >
              {tag}
            </button>
          </li>
        ) : (
          <li key={tag} className={styles.tag}>
            {tag}
          </li>
        ),
      )}
      {hidden > 0 && (
        <li className={`${styles.tag} ${styles.more}`} title={all.slice(shown.length).join(", ")}>
          +{hidden}
        </li>
      )}
    </ul>
  );
}
