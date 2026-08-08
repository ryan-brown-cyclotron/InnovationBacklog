import { useEffect, useRef, useState } from "react";
import type React from "react";
import styles from "./SpotlightCard.module.scss";
import type {
  MomentumItem,
  RequestProjection,
  SolutionProjection,
} from "../../types";
import { upvoteCountLabel } from "../../utils";

export function SpotlightCard({
  items,
  onOpen,
}: {
  items: MomentumItem[];
  onOpen: (item: MomentumItem) => void;
}): React.ReactElement | null {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  useEffect(() => {
    if (items.length === 0) return;
    if (index >= items.length) setIndex(0);
  }, [items.length, index]);

  useEffect(() => {
    if (paused || items.length <= 1) return;
    timer.current = setInterval(() => {
      setIndex((prev) => (prev + 1) % items.length);
    }, 6000);
    return () => clearInterval(timer.current);
  }, [paused, items.length]);

  if (items.length === 0) return null;
  const active = items[Math.min(index, items.length - 1)];
  const setIndexSafe = setIndex;
  return (
    <section
      className={styles.spotlight}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      aria-label="Innovation Hub momentum"
      data-reveal
    >
      {/* A literal comparison on purpose: MomentumItem is a discriminated union on
          this field, so anything else loses the narrowing. Unlike SearchItem, its
          vocabulary is typed and cannot drift. */}
      {active.itemType === "solution" ? (
        <SolutionBody item={active} onOpen={onOpen} />
      ) : (
        <RequestBody item={active} onOpen={onOpen} />
      )}
      {items.length > 1 && (
        <div className={styles.dots} aria-label="Momentum signals">
          {items.map((_, i) => (
            <button
              key={i}
              className={`${styles.dot} ${i === Math.min(index, items.length - 1) ? styles.dotActive : ""}`}
              onClick={() => setIndexSafe(i)}
              aria-label={`Signal ${i + 1}`}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function RequestBody({
  item,
  onOpen,
}: {
  item: RequestProjection;
  onOpen: (item: MomentumItem) => void;
}): React.ReactElement {
  return (
    <>
      <div className={styles.shell}>
        <span className={`${styles.kind} ${styles.kindDemand}`}>Idea · Featured</span>
        <h2 className={styles.title} onClick={() => onOpen(item)}>
          {item.title}
        </h2>
        <p className={styles.desc}>
          An active idea worth attention and input.
        </p>
        <div className={styles.signals}>
          <span className={styles.chip}>
            <span className={styles.chipNum}>{item.voteCount}</span> upvotes
          </span>
          <span className={styles.chip}>
            <span className={styles.chipNum}>{item.commentCount}</span> comments
          </span>
          <span className={styles.chip}>
            <span className={styles.chipNum}>{item.useCount}</span> uses
          </span>
        </div>
      </div>
      <div className={styles.momentumBand}>
        <div className={styles.ambient} aria-hidden="true" />
        <div className={styles.momentumContent}>
          <span className={styles.smState}>{item.state}</span>
          <div className={styles.smMetric}>
            <strong>{item.voteCount}</strong>
            <span>upvotes</span>
          </div>
          <div className={styles.smMetric}>
            <strong>{item.useCount}</strong>
            <span>uses</span>
          </div>
        </div>
      </div>
      <div className={styles.footerRow}>
        <span className={styles.rank}>
          {`${upvoteCountLabel(item.voteCount)} · ${item.commentCount} comment${item.commentCount === 1 ? "" : "s"}`}
        </span>
        <b>Open details →</b>
      </div>
    </>
  );
}

function SolutionBody({
  item,
  onOpen,
}: {
  item: SolutionProjection;
  onOpen: (item: MomentumItem) => void;
}): React.ReactElement {
  return (
    <>
      <div className={styles.shell}>
        <span className={`${styles.kind} ${styles.kindAdoption}`}>Solution · Featured</span>
        <h2 className={styles.title} onClick={() => onOpen(item)}>
          {item.title}
        </h2>
        <p className={styles.desc}>
          A reusable solution worth getting in front of the right teams.
        </p>
        <div className={styles.signals}>
          <span className={styles.chip}>
            <span className={styles.chipNum}>{item.voteCount}</span> upvotes
          </span>
          <span className={styles.chip}>
            <span className={styles.chipNum}>{item.useCount}</span> uses
          </span>
          <span className={styles.chip}>
            <span className={styles.chipNum}>
              {item.adoptedByProjects.length}
            </span>{" "}
            projects adopting
          </span>
        </div>
      </div>
      <div className={styles.momentumBand}>
        <div className={styles.ambient} aria-hidden="true" />
        <div className={styles.momentumContent}>
          <span className={styles.smState}>{item.state}</span>
          <div className={styles.smMetric}>
            <strong>{item.voteCount}</strong>
            <span>upvotes</span>
          </div>
          <div className={styles.smMetric}>
            <strong>{item.useCount}</strong>
            <span>uses</span>
          </div>
        </div>
      </div>
      <div className={styles.footerRow}>
        <span className={styles.rank}>
          {`${item.useCount} projects · ${item.adoptedByProjects.length} adopting`}
        </span>
        <b>Open details →</b>
      </div>
    </>
  );
}
