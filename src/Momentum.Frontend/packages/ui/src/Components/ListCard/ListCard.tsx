import type React from "react";
import styles from "./ListCard.module.scss";
import type { DiscoveryItem } from "../../types";
import { personName, relativeTime, statusDisplayName } from "../../utils";

export function ListCard({
  kind,
  items,
  onOpen,
  onAdopt,
}: {
  kind: "need" | "solution";
  items: DiscoveryItem[];
  onOpen: (item: DiscoveryItem) => void;
  onAdopt?: (item: DiscoveryItem) => void;
}): React.ReactElement | null {
  if (items.length === 0) return null;
  return (
    <>
      {items.map((item) => (
        <button
          key={`${item.source}-${item.itemId}`}
          className={`${styles.card} ${kind === "need" ? styles.need : styles.solution}`}
          onClick={() => onOpen(item)}
        >
          <div className={styles.eyebrow}>
            <span className={styles.kindLabel}>
              {kind === "need" ? "IDEA" : "SOLUTION"}
              {kind === "need" && (
                <span className={styles.eyebrowSeparator}>·</span>
              )}
              {kind === "need" && (
                <span className={styles.eyebrowStatus}>
                  {statusDisplayName(item.status)}
                </span>
              )}
              {kind === "solution" && item.subtype && (
                <>
                  <span className={styles.eyebrowSeparator}>·</span>
                  <span className={styles.eyebrowStatus}>{item.subtype}</span>
                </>
              )}
            </span>
            <span
              className={`${styles.chip} ${kind === "need" ? styles.chipNeed : styles.chipSolution}`}
            >
              {statusDisplayName(item.derivedStatus ?? item.status)}
            </span>
          </div>

          <h4 className={styles.title}>{item.title}</h4>
          <p className={styles.description}>{item.description}</p>

          <div className={styles.footer}>
            <div className={styles.traction}>
              {kind === "need" ? (
                <NeedTraction item={item} />
              ) : (
                <SolutionTraction item={item} />
              )}
            </div>
            <div className={styles.participation}>
              {kind === "need" ? (
                <span>{(item.contributors ?? 0) > 0 ? `${item.contributors} contributors` : "No contributors yet"}</span>
              ) : (
                <span>
                  Shared by{" "}
                  {item.submittedBy ? personName(item.submittedBy) : "—"}
                </span>
              )}
            </div>
            <div className={styles.freshness}>
              Updated {relativeTime(item.updatedAt)}
            </div>
          </div>

          <div className={styles.hoverReveal}>
            {kind === "need" ? (
              <span className={styles.hoverAction}>Open →</span>
            ) : (
              <button
                className={styles.hoverAdopt}
                onClick={(event) => {
                  event.stopPropagation();
                  onAdopt?.(item);
                }}
                aria-label={`Record adoption for ${item.title}`}
              >
                Record adoption
              </button>
            )}
          </div>
        </button>
      ))}
    </>
  );
}

function NeedTraction({ item }: { item: DiscoveryItem }): React.ReactElement {
  const votes = item.voteCount ?? 0;
  const votes30d = item.votes30d ?? 0;
  const hasTraction = votes > 0 || votes30d > 0;
  if (!hasTraction) {
    return <span className={styles.emptyTraction}>No upvotes yet</span>;
  }
  return (
    <>
      {votes > 0 && <span className={styles.count}>▲ {votes}</span>}
      {votes30d > 0 && (
        <span className={styles.velocity}>↑ {votes30d} this month</span>
      )}
    </>
  );
}

function SolutionTraction({
  item,
}: {
  item: DiscoveryItem;
}): React.ReactElement {
  const adoptions = item.adoptionCount ?? 0;
  const teams = item.teams ?? 0;
  const hasTraction = adoptions > 0 || teams > 0;
  if (!hasTraction) {
    return <span className={styles.emptyTraction}>Be the first to adopt</span>;
  }
  return (
    <>
      {adoptions > 0 && (
        <span className={styles.count}>{adoptions} adoptions</span>
      )}
      {teams > 0 && <span className={styles.metric}>{teams} teams</span>}
    </>
  );
}
