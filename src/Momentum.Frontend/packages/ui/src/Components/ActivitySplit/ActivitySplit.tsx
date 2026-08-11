import { useEffect, useMemo, useRef, useState } from "react";
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
  activitySuffixForItem,
  activityVerbForItem,
  auditActorName,
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

/** How long a newly arrived row keeps its entrance class. Matches the keyframe. */
const ENTER_MS = 620;

/** Auto-advance interval for the featured carousel, as SpotlightCard used. */
const ADVANCE_MS = 6000;

type Row = {
  record: ActivityRecord;
  item: DiscoveryItem;
};

/** A featured slide, and the reason it earned the slot. */
type Slide = {
  item: DiscoveryItem;
  reason: string;
};

/**
 * "Latest activity" as two panels: what just happened on the left, and the
 * solutions with the most pull on the right.
 *
 * The showcase is always a solution, never an idea. Ideas earn their place in
 * the feed, but the point of the hub is to connect people to work they can
 * reuse — so the fixed slot goes to solutions people are actually upvoting
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

  const entering = useEnteringRows(rows);
  const slides = useFeaturedSlides(items, solutionSummary);

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
              {rows.map(({ record, item }, index) => {
                const isUser = auditActorName(record.actorType) === "user";
                const actor = isUser ? actorLabel(record) : "Innovation Hub";
                return (
                  <li key={record.id}>
                    <button
                      className={`${styles.row} ${entering.has(record.id) ? styles.rowEnter : ""}`}
                      // Capped the same way useReveal caps its stagger: past a few
                      // rows the delay stops reading as sequence and starts reading
                      // as lag.
                      style={{ ["--row-delay" as string]: `${Math.min(index * 45, 180)}ms` }}
                      onClick={() => onOpenItem(item)}
                    >
                      <span className={styles.avatar}>{actorInitials(record)}</span>
                      <span className={styles.rowBody}>
                        <span className={styles.rowText}>
                          <strong>{actor}</strong>{" "}
                          {activityVerbForItem(record.action)}{" "}
                          <span className={styles.rowItem}>{item.title}</span>
                          {/* The adopting team lands after the title, so the row
                              reads "started using RFP Agent on behalf of the Data
                              Platform team". Empty for everything else. */}
                          {activitySuffixForItem(record.action, record.summary)}
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

        {slides.length > 0 ? (
          <FeaturedCarousel
            slides={slides}
            solutionSummary={solutionSummary}
            onOpen={onOpenItem}
            onSearchTag={onSearchTag}
          />
        ) : (
          <div className={styles.previewPanel}>
            {loading ? (
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
        )}
      </div>
    </section>
  );
}

/**
 * Ids of rows that have just arrived, for one animation's worth of time.
 *
 * The section-level reveal fires once on mount, which cannot express "this row is
 * new". Tracking ids that have been rendered before is what separates a row that
 * appeared because the feed updated from the four that were already there.
 *
 * On the first pass the set is empty, so every row is new and the list makes a
 * staggered entrance. That is intended.
 */
function useEnteringRows(rows: Row[]): Set<string> {
  const seen = useRef<Set<string>>(new Set());
  const [entering, setEntering] = useState<Set<string>>(new Set());

  useEffect(() => {
    const fresh = rows.map((row) => row.record.id).filter((id) => !seen.current.has(id));
    if (fresh.length === 0) return;
    for (const id of fresh) seen.current.add(id);
    setEntering(new Set(fresh));
    // Cleared once the keyframe has run, so a later re-render for an unrelated
    // reason does not replay the entrance.
    const timer = setTimeout(() => setEntering(new Set()), ENTER_MS);
    return () => clearTimeout(timer);
  }, [rows]);

  return entering;
}

/**
 * Up to four solutions, each holding its slot for a different reason.
 *
 * Ranking the same list four ways and badging each winner says more than four pages
 * of one ranking: "most adopted" and "most upvoted" are genuinely different claims,
 * and when they disagree that disagreement is the interesting part.
 *
 * A category whose winner scores zero is dropped rather than shown — a slide reading
 * "Most adopted: 0 adoptions" is worse than one fewer slide. Ties are resolved by
 * priority order: a solution that wins two categories keeps the first and the second
 * category is dropped, so the carousel never shows the same card twice.
 */
function useFeaturedSlides(
  items: DiscoveryItem[],
  solutionSummary: SolutionSummary,
): Slide[] {
  return useMemo(() => {
    const solutions = items.filter((item) => item.source === "solution");
    if (solutions.length === 0) return [];

    const stats = (item: DiscoveryItem) => solutionSummary[item.itemId];
    const time = (item: DiscoveryItem) => Date.parse(item.createdAt ?? "") || 0;

    const categories: {
      reason: string;
      score: (item: DiscoveryItem) => number;
      compare: (a: DiscoveryItem, b: DiscoveryItem) => number;
    }[] = [
      {
        reason: "Most upvoted",
        score: (item) => stats(item)?.votes ?? 0,
        compare: (a, b) =>
          (stats(b)?.votes ?? 0) - (stats(a)?.votes ?? 0) ||
          (stats(b)?.adoptions ?? 0) - (stats(a)?.adoptions ?? 0),
      },
      {
        reason: "Most adopted",
        score: (item) => stats(item)?.adoptions ?? 0,
        compare: (a, b) =>
          (stats(b)?.adoptions ?? 0) - (stats(a)?.adoptions ?? 0) ||
          (stats(b)?.teams ?? 0) - (stats(a)?.teams ?? 0),
      },
      {
        reason: "Newest",
        // Every solution has a created date, so this one needs no floor — but a
        // missing date parses to 0 and sorts last rather than crashing the sort.
        score: (item) => time(item),
        compare: (a, b) => time(b) - time(a),
      },
      {
        reason: "Most discussed",
        score: (item) => stats(item)?.comments ?? 0,
        compare: (a, b) => (stats(b)?.comments ?? 0) - (stats(a)?.comments ?? 0),
      },
    ];

    const taken = new Set<string>();
    const slides: Slide[] = [];
    for (const category of categories) {
      const winner = [...solutions].sort(category.compare)[0];
      if (!winner || taken.has(winner.itemId) || category.score(winner) <= 0) continue;
      taken.add(winner.itemId);
      slides.push({ item: winner, reason: category.reason });
    }

    // Nothing scored anywhere — a brand new hub where no one has voted, adopted or
    // commented yet. Show the most recent solution rather than an empty panel.
    if (slides.length === 0) {
      const newest = [...solutions].sort((a, b) => time(b) - time(a))[0];
      if (newest) slides.push({ item: newest, reason: "Newest" });
    }
    return slides;
  }, [items, solutionSummary]);
}

function FeaturedCarousel({
  slides,
  solutionSummary,
  onOpen,
  onSearchTag,
}: {
  slides: Slide[];
  solutionSummary: SolutionSummary;
  onOpen: (item: DiscoveryItem) => void;
  onSearchTag: (tag: string) => void;
}): React.ReactElement {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  // The slide set is recomputed whenever the summaries change, so it can shrink
  // under a held index — clamping here rather than at read time keeps the dots and
  // the card from disagreeing about which slide is current.
  useEffect(() => {
    setIndex((prev) => (prev >= slides.length ? 0 : prev));
  }, [slides.length]);

  useEffect(() => {
    if (paused || slides.length <= 1) return;
    const timer = setInterval(() => {
      setIndex((prev) => (prev + 1) % slides.length);
    }, ADVANCE_MS);
    return () => clearInterval(timer);
  }, [paused, slides.length]);

  const current = Math.min(index, slides.length - 1);
  const active = slides[current]!;
  const many = slides.length > 1;
  const step = (delta: number) =>
    setIndex((prev) => (prev + delta + slides.length) % slides.length);

  return (
    <div
      className={styles.previewPanel}
      // Hover and focus both pause: a card that advances out from under the pointer
      // while someone is reading it is worse than one that never moves.
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      onKeyDown={(event) => {
        if (!many) return;
        if (event.key === "ArrowRight") { event.preventDefault(); step(1); }
        if (event.key === "ArrowLeft") { event.preventDefault(); step(-1); }
      }}
      aria-roledescription="carousel"
      aria-label="Featured solutions"
    >
      {many && (
        <>
          {/* Inset against the panel edges, not floating outside it: the featured
              card shares the row with the activity list and there is no gutter. */}
          <button
            className={`${styles.arrow} ${styles.arrowPrev}`}
            onClick={() => step(-1)}
            aria-label="Previous solution"
          >
            ‹
          </button>
          <button
            className={`${styles.arrow} ${styles.arrowNext}`}
            onClick={() => step(1)}
            aria-label="Next solution"
          >
            ›
          </button>
        </>
      )}

      <FeaturedSolution
        // Remounting on the item is what re-fires the entrance and the counter roll;
        // without it React reuses the DOM and the numbers change with no motion.
        key={active.item.itemId}
        item={active.item}
        reason={active.reason}
        position={many ? `${current + 1} of ${slides.length}` : undefined}
        solutionSummary={solutionSummary}
        onOpen={onOpen}
        onSearchTag={onSearchTag}
      />

      {many && (
        <div className={styles.dots} role="tablist" aria-label="Featured solutions">
          {slides.map((slide, i) => (
            <button
              key={slide.item.itemId}
              role="tab"
              aria-selected={i === current}
              className={`${styles.dot} ${i === current ? styles.dotActive : ""}`}
              onClick={() => setIndex(i)}
              aria-label={slide.reason}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function FeaturedSolution({
  item,
  reason,
  position,
  solutionSummary,
  onOpen,
  onSearchTag,
}: {
  item: DiscoveryItem;
  reason: string;
  position?: string;
  solutionSummary: SolutionSummary;
  onOpen: (item: DiscoveryItem) => void;
  onSearchTag: (tag: string) => void;
}): React.ReactElement {
  const stats = solutionSummary[item.itemId];
  const adoptions = stats?.adoptions ?? 0;
  const teams = stats?.teams ?? 0;

  return (
    <article className={styles.preview} aria-roledescription="slide" aria-label={reason}>
      <div className={styles.previewEyebrow}>
        <span className={`${styles.dotMark} ${styles.dotSolution}`} />
        SOLUTION · {item.derivedStatus || item.subtype || item.status}
        <span className={styles.featuredTag}>{reason}</span>
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
          <strong>{adoptions}</strong>
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

      {/*
        The momentum band, inherited from SpotlightCard — the one part of that card
        worth keeping. It says how far the solution has actually travelled, which the
        stat tiles above count but do not characterise.
      */}
      <div className={styles.momentumBand}>
        <div className={styles.ambient} aria-hidden="true" />
        <div className={styles.momentumContent}>
          <span className={styles.bandState}>
            {position ? `${reason} · ${position}` : reason}
          </span>
          <span className={styles.bandFact}>
            {adoptions === 0
              ? "No teams using it yet"
              : `${adoptions} adoption${adoptions === 1 ? "" : "s"} across ${teams || 1} team${(teams || 1) === 1 ? "" : "s"}`}
          </span>
        </div>
      </div>
    </article>
  );
}
