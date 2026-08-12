import { useState } from "react";
import type React from "react";
import styles from "./SolutionPanel.module.scss";
import type { ActivityRecord, Comment } from "../../types";
import { CommentComposer } from "../CommentComposer/CommentComposer";
import { TimelineItems } from "../TimelineItems/TimelineItems";

type Filter = "all" | "comments" | "events";

/**
 * The conversation, and everything that has happened to this solution.
 *
 * Both the feed and the composer are the existing shared components, unchanged. The
 * filter is applied by passing empty arrays rather than by teaching `TimelineItems`
 * about filters: it already decides what a row is, so a filter expressed as "no
 * comments" or "no activity" cannot disagree with it about which rows exist.
 */
export function ActivityTab({
  comments,
  activity,
  onAddComment,
}: {
  comments: Comment[];
  activity: ActivityRecord[];
  onAddComment: (draft: {
    body: string;
    audience: string;
    attachmentIds: string[];
  }) => Promise<void>;
}): React.ReactElement {
  const [filter, setFilter] = useState<Filter>("all");

  const filters: { id: Filter; label: string }[] = [
    { id: "all", label: "All" },
    { id: "comments", label: "Comments" },
    { id: "events", label: "Updates" },
  ];

  return (
    <>
      <div className={styles.toolbar}>
        <span className={styles.toolbarNote}>
          Comments and progress on this solution
        </span>
        <div className={styles.segmented} role="group" aria-label="Filter the feed">
          {filters.map((option) => (
            <button
              key={option.id}
              type="button"
              aria-pressed={filter === option.id}
              className={`${styles.segment} ${filter === option.id ? styles.segmentActive : ""}`.trim()}
              onClick={() => setFilter(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.scroller}>
        <div className={styles.feed}>
          <TimelineItems
            comments={filter === "events" ? [] : comments}
            activity={filter === "comments" ? [] : activity}
            emptyText={
              filter === "comments"
                ? "No comments yet — share feedback, ask a question, or tell others how your team is using it."
                : filter === "events"
                  ? "Nothing has happened to this solution yet."
                  : "No updates yet — share feedback, ask a question, or tell others how your team is using it."
            }
          />
        </div>
      </div>

      <div className={styles.composerBar}>
        <div className={styles.feed}>
          <CommentComposer
            placeholder="Share feedback or an update"
            onSubmit={onAddComment}
          />
        </div>
      </div>
    </>
  );
}
