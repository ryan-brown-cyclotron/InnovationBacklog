import { useMemo } from "react";
import type React from "react";
import styles from "./ActivitySplit.module.scss";
import type {
  ActivityRecord,
  DiscoveryItem,
  SolutionSummary,
  Visibility,
} from "../../types";
import {
  actorInitials,
  actorLabel,
  activityVerbForItem,
  auditActorName,
  initials,
  personName,
  relativeTime,
  HIDDEN_ACTIVITY_ACTIONS,
} from "../../utils";
import { TagList } from "../TagList/TagList";
import { Pending } from "../Empty/Empty";
import { VisibilityBadge } from "../VisibilityControl/VisibilityControl";

/**
 * Rows to show before "See all activity" takes over. Five keeps the section
 * short and roughly balances the height of the showcase beside it.
 */
const MAX_ROWS = 5;

type Row = {
  record: ActivityRecord;
  item: DiscoveryItem;
};

/**
 * "Latest activity" as two panels: what just happened on the left, and the
 * solution with the most pull on the right.
 *
 * The showcase is always a solution, never an idea. Ideas earn their place in
 * the feed, but the point of the hub is to connect people to work they can
 * reuse — so the fixed slot goes to the solution people are actually upvoting
 * and adopting.
 */
export function ActivitySplit({
  activity,
  items,
  solutionSummary,
  onOpenItem,
  onSeeAll,
  onSearchTag,
  loading,
}: {
  activity: ActivityRecord[];
  /** Everything the workspace knows about, to resolve an activity's subject. */
  items: DiscoveryItem[];
  solutionSummary: SolutionSummary;
  onOpenItem: (item: DiscoveryItem) => void;
  onSeeAll: () => void;
  onSearchTag: (tag: string) => void;
  /** Still fetching: both panels below would claim "nothing", which is not yet knowable. */
  loading?: boolean;
}): React.ReactElement {
  const byId = useMemo(() => {
    const map = new Map<string, DiscoveryItem>();
    for (const item of items) map.set(item.itemId, item);
    return map;
  }, [items]);

  // Only activity we can actually open earns a row: a row that goes nowhere is
  // a dead end.
  const rows = useMemo<Row[]>(() => {
    const resolved: Row[] = [];
    for (const record of activity) {
      if (HIDDEN_ACTIVITY_ACTIONS.has(record.action)) continue;
      const item = byId.get(record.subjectId);
      if (!item) continue;
      resolved.push({ record, item });
      if (resolved.length === MAX_ROWS) break;
    }
    return resolved;
  }, [activity, byId]);

  // Most upvoted, then most adopted, then most widely spread across teams.
  const featured = useMemo(() => {
    const solutions = items.filter((item) => item.source === "solution");
    if (solutions.length === 0) return undefined;
    return [...solutions].sort((a, b) => {
      const left = solutionSummary[a.itemId];
      const right = solutionSummary[b.itemId];
      return (
        (right?.votes ?? 0) - (left?.votes ?? 0) ||
        (right?.adoptions ?? 0) - (left?.adoptions ?? 0) ||
        (right?.teams ?? 0) - (left?.teams ?? 0)
      );
    })[0];
  }, [items, solutionSummary]);

  return (
    <section className={styles.section} data-reveal>
      <header className={styles.header}>
        <h2>Latest activity</h2>
        <button className={styles.seeAll} onClick={onSeeAll}>
          See all activity →
        </button>
      </header>

      <div className={styles.split}>
        <div className={styles.listPanel}>
          {loading && rows.length === 0 ? (
            <Pending text="Loading activity…" />
          ) : rows.length === 0 ? (
            <div className={styles.emptyList}>
              <strong>Nothing happening yet</strong>
              <p>
                Activity appears here as people share ideas and solutions,
                comment, and upvote.
              </p>
            </div>
          ) : (
            <ul className={styles.list}>
              {rows.map(({ record, item }) => {
                const isUser = auditActorName(record.actorType) === "user";
                const actor = isUser ? actorLabel(record) : "Innovation Hub";
                return (
                  <li key={record.id}>
                    <button
                      className={styles.row}
                      onClick={() => onOpenItem(item)}
                    >
                      <span className={styles.avatar}>{actorInitials(record)}</span>
                      <span className={styles.rowBody}>
                        <span className={styles.rowText}>
                          <strong>{actor}</strong>{" "}
                          {activityVerbForItem(record.action)}{" "}
                          <span className={styles.rowItem}>{item.title}</span>
                        </span>
                        <span className={styles.rowMeta}>
                          <span
                            className={`${styles.kind} ${item.source === "solution" ? styles.kindSolution : styles.kindIdea}`}
                          >
                            {item.source === "solution" ? "SOLUTION" : "IDEA"}
                          </span>
                          <span className={styles.time}>
                            {relativeTime(record.occurredAt)}
                          </span>
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className={styles.previewPanel}>
          {featured ? (
            <FeaturedSolution
              item={featured}
              solutionSummary={solutionSummary}
              onOpen={onOpenItem}
              onSearchTag={onSearchTag}
            />
          ) : loading ? (
            <Pending text="Loading solutions…" />
          ) : (
            <div className={styles.emptyPreview}>
              <strong>No solutions yet</strong>
              <p>
                The most upvoted solution appears here once someone shares
                something the organization can reuse.
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function FeaturedSolution({
  item,
  solutionSummary,
  onOpen,
  onSearchTag,
}: {
  item: DiscoveryItem;
  solutionSummary: SolutionSummary;
  onOpen: (item: DiscoveryItem) => void;
  onSearchTag: (tag: string) => void;
}): React.ReactElement {
  const stats = solutionSummary[item.itemId];

  return (
    <article className={styles.preview}>
      <div className={styles.previewEyebrow}>
        <span className={`${styles.dot} ${styles.dotSolution}`} />
        SOLUTION · {item.derivedStatus || item.subtype || item.status}
        <span className={styles.featuredTag}>Most upvoted</span>
        <VisibilityBadge visibility={(item.visibility as Visibility) ?? "Everyone"} />
      </div>

      <h3 className={styles.previewTitle}>{item.title}</h3>
      {item.submittedBy && (
        <p className={styles.previewMeta}>Shared by {personName(item.submittedBy)}</p>
      )}
      {item.description && <p className={styles.previewDesc}>{item.description}</p>}

      <div className={styles.stats}>
        <div className={styles.stat}>
          <strong>{stats?.votes ?? 0}</strong>
          <span>Upvotes</span>
        </div>
        <div className={styles.stat}>
          <strong>{stats?.adoptions ?? 0}</strong>
          <span>Adoptions</span>
        </div>
        <div className={styles.stat}>
          <strong>{stats?.comments ?? 0}</strong>
          <span>Comments</span>
        </div>
      </div>

      <TagList tags={item.tags} max={4} onSelect={onSearchTag} />

      <div className={styles.previewActions}>
        <button className={styles.previewPrimary} onClick={() => onOpen(item)}>
          View solution
        </button>
        {item.repositoryUrl && (
          <a
            className={styles.previewGhost}
            href={item.repositoryUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            Repository ↗
          </a>
        )}
      </div>
    </article>
  );
}
