import { useState } from "react";
import type React from "react";
import styles from "./DetailPanel.module.scss";
import type { AcceptanceDecision, ActivityRecord, Comment } from "../../types";
import { CommentComposer } from "../CommentComposer/CommentComposer";
import { TimelineItems } from "../TimelineItems/TimelineItems";

type Filter = "all" | "comments" | "events";

/**
 * The conversation, and everything that has happened to this record.
 *
 * Both the feed and the composer are the existing shared components, unchanged. The
 * filter is applied by passing empty arrays rather than by teaching `TimelineItems`
 * about filters: it already decides what a row is, so a filter expressed as "no
 * comments" or "no activity" cannot disagree with it about which rows exist.
 *
 * `decisions` follow `activity` rather than getting a filter of their own. They are
 * events in the same story — the interleaving is the point, and splitting them out
 * would hand the reader two histories to merge by timestamp themselves.
 */
export function ActivityTab({
  comments,
  activity,
  decisions = [],
  note,
  placeholder = "Share feedback or an update",
  emptyText = "No updates yet — share feedback, ask a question, or share an update.",
  emptyComments = "No comments yet — share feedback, ask a question, or share an update.",
  emptyEvents = "Nothing has happened here yet.",
  allowPrivate = false,
  onAddComment,
}: {
  comments: Comment[];
  activity: ActivityRecord[];
  /** Reviewer-visible decision history. Empty for a reader who may not see it. */
  decisions?: AcceptanceDecision[];
  /** The line above the filter, e.g. "Comments and progress on this solution". */
  note: string;
  placeholder?: string;
  emptyText?: string;
  emptyComments?: string;
  emptyEvents?: string;
  /** Whether the composer offers an approvers-only audience. */
  allowPrivate?: boolean;
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
        <span className={styles.toolbarNote}>{note}</span>
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
            decisions={filter === "comments" ? [] : decisions}
            emptyText={
              filter === "comments"
                ? emptyComments
                : filter === "events"
                  ? emptyEvents
                  : emptyText
            }
          />
        </div>
      </div>

      <div className={styles.composerBar}>
        <div className={styles.feed}>
          <CommentComposer
            placeholder={placeholder}
            allowPrivate={allowPrivate}
            onSubmit={onAddComment}
          />
        </div>
      </div>
    </>
  );
}
