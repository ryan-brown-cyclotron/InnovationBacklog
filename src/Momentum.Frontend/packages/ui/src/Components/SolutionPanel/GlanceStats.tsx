import type React from "react";
import styles from "./SolutionPanel.module.scss";

export interface Stat {
  label: string;
  /**
   * `undefined` means the host could not be asked, and the cell is dropped.
   *
   * THE UNDEFINEDS ARE LOAD-BEARING, for the same reason they are on the insights
   * dashboard: a `0` meaning "we never asked" is indistinguishable from a `0` meaning
   * "none", and the second is a claim about this solution that the first cannot make.
   */
  value: number | undefined;
}

/**
 * The four numbers worth knowing before adopting something.
 *
 * Hides itself below two cells rather than rendering a lonely stat in a box — at that
 * point the card frame costs more attention than the number inside it is worth.
 */
export function GlanceStats({ stats }: { stats: Stat[] }): React.ReactElement | null {
  const shown = stats.filter(
    (stat): stat is Stat & { value: number } => stat.value !== undefined,
  );
  if (shown.length < 2) return null;

  return (
    <div className={styles.glance}>
      <h3 className={styles.blockTitle}>At a glance</h3>
      <div className={styles.glanceGrid}>
        {shown.map((stat) => (
          <div key={stat.label}>
            <div className={styles.glanceValue}>{stat.value}</div>
            <div className={styles.glanceLabel}>{stat.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
