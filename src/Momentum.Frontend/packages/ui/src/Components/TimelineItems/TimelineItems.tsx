import { useMemo } from "react";
import type React from "react";
import styles from "./TimelineItems.module.scss";
import type { AcceptanceDecision, ActivityRecord, Comment } from "../../types";
import { Empty } from "../Empty/Empty";
import {
  actorInitials,
  actorLabel,
  activityPhrase,
  adoptingTeam,
  formatFileSize,
  personName,
  HIDDEN_ACTIVITY_ACTIONS,
} from "../../utils";

type TimelineItem =
  | { kind: "comment"; id: string; time: string; comment: Comment }
  | { kind: "activity"; id: string; time: string; activity: ActivityRecord }
  | { kind: "decision"; id: string; time: string; decision: AcceptanceDecision };

/**
 * Events a decision record already describes, and describes better.
 *
 * A decision and its activity row are the same moment from two stores — the row says
 * "approved an idea", the record adds who decided and why. Showing both reports the
 * event twice, so the row yields to the record exactly as `comment.added` yields to
 * the comment itself.
 */
const DECISION_ACTIONS = new Set([
  "request.accepted",
  "request.rejected",
  "solution.published",
  "solution.rejected",
]);

export function TimelineItems({
  comments,
  activity,
  decisions = [],
  emptyText,
}: {
  comments: Comment[];
  activity: ActivityRecord[];
  /**
   * Approval decisions, folded into the same chronology.
   *
   * These used to sit in their own "Decision history" list beside the timeline, which
   * split one story across two places and left the reader to interleave the two by
   * timestamp. Different source, same sequence of events.
   */
  decisions?: AcceptanceDecision[];
  emptyText?: string;
}): React.ReactElement {
  const timeline = useMemo<TimelineItem[]>(() => {
    const items: TimelineItem[] = comments.map((comment) => ({
      kind: "comment",
      id: `comment-${comment.id}`,
      time: comment.createdAt,
      comment,
    }));
    // comment.added rows are redundant with the actual comments above; the rest
    // are the feed-wide exclusions.
    for (const record of activity) {
      if (record.action === "comment.added") continue;
      if (HIDDEN_ACTIVITY_ACTIONS.has(record.action)) continue;
      // Only when a decision record is actually present to replace it — a reader who
      // cannot see decisions still needs to know the idea was approved.
      if (decisions.length > 0 && DECISION_ACTIONS.has(record.action)) continue;
      items.push({
        kind: "activity",
        id: `activity-${record.id}`,
        time: record.occurredAt,
        activity: record,
      });
    }

    for (const decision of decisions) {
      items.push({
        kind: "decision",
        id: `decision-${decision.id}`,
        time: decision.decidedAt,
        decision,
      });
    }

    /*
     * Oldest first, newest at the bottom.
     *
     * This is a conversation, and the composer sits underneath it — so a
     * newest-first order put the reply box furthest from the message being replied
     * to and made the thread read backwards. Reverse-chronological is right for a
     * FEED, where the reader wants the latest and never scrolls to the beginning;
     * it is wrong for a thread with a beginning, which this has.
     */
    return items.sort(
      (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime(),
    );
  }, [comments, activity, decisions]);

  return (
    <div className={styles.timeline}>
      {timeline.length === 0 ? (
        <Empty text={emptyText ?? "No comments or activity yet."} />
      ) : (
        timeline.map((item) =>
          item.kind === "comment" ? (
            <CommentRow key={item.id} comment={item.comment} />
          ) : item.kind === "decision" ? (
            <DecisionRow key={item.id} decision={item.decision} />
          ) : (
            <ActivityRow key={item.id} record={item.activity} />
          ),
        )
      )}
    </div>
  );
}

function CommentRow({ comment }: { comment: Comment }): React.ReactElement {
  const initials = initialsFromName(comment.authorId);
  const attachments = comment.attachments ?? [];
  return (
    <article className={styles.comment}>
      <div className={styles.commentAvatar}>{initials}</div>
      <div className={styles.commentBody}>
        <div className={styles.commentHeader}>
          <strong>{personName(comment.authorId)} says</strong>
          {comment.audience === "ApproversOnly" && (
            <span className={styles.privateBadge}>Private</span>
          )}
          <time className={styles.commentTime}>{timeAgo(comment.createdAt)}</time>
        </div>
        {comment.body && <p className={styles.chatBubble}>{comment.body}</p>}
        {attachments.length > 0 && (
          <ul className={styles.attachments}>
            {attachments.map((attachment) => (
              <li key={attachment.id}>
                <a
                  className={styles.attachment}
                  /* Where the host says the file is, and only otherwise the .NET
                     store's own route — see the note on Attachment in types.ts. */
                  href={attachment.url || `/api/attachments/${attachment.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <span aria-hidden="true">📎</span>
                  <span className={styles.attachmentName}>
                    {attachment.fileName}
                  </span>
                  <span className={styles.attachmentSize}>
                    {formatFileSize(attachment.length)}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </article>
  );
}

function ActivityRow({ record }: { record: ActivityRecord }): React.ReactElement {
  return (
    <div className={styles.activityRow}>
      <span className={styles.activityAvatar}>{actorInitials(record)}</span>
      <div className={styles.activityBody}>
        <div className={styles.commentHeader}>
          <span>{activityText(record)}</span>
          <time className={styles.commentTime}>{timeAgo(record.occurredAt)}</time>
        </div>
      </div>
    </div>
  );
}

/**
 * A decision, in the same shape as an activity row so the chronology reads as one
 * stream — with the rationale, which is the part only this record carries.
 */
function DecisionRow({
  decision,
}: {
  decision: AcceptanceDecision;
}): React.ReactElement {
  // The API returns the approver either bare or wrapped, depending on the route.
  const approver =
    typeof decision.approverId === "string"
      ? decision.approverId
      : (decision.approverId?.value ?? "");
  const accepted = decision.decision === 0 || decision.decision === "Accept";
  const verdict = accepted ? "approved" : "rejected";

  return (
    <div className={styles.activityRow}>
      <span className={styles.activityAvatar}>{initialsFromName(approver)}</span>
      <div className={styles.activityBody}>
        <div className={styles.commentHeader}>
          <span>
            {personName(approver)} {verdict} this
          </span>
          <time className={styles.commentTime}>{timeAgo(decision.decidedAt)}</time>
        </div>
        {decision.rationale && (
          <p className={styles.commentBody}>{decision.rationale}</p>
        )}
      </div>
    </div>
  );
}

function activityText(record: ActivityRecord): string {
  const actor = actorLabel(record);
  switch (record.action) {
    case "request.created":
      return `${actor} shared this idea`;
    case "solution.created":
      return `${actor} shared this solution`;
    case "request.accepted":
      return `${actor} approved this idea`;
    case "request.rejected":
      return `${actor} rejected this idea`;
    case "request.updated":
      return `${actor} edited this idea`;
    case "vote.added":
      return `${actor} upvoted this idea`;
    case "request.solutionLinked":
      return `${actor} added a solution to this idea`;
    case "request.canonicalSelected":
    case "request.canonicalReaffirmed":
      return `${actor} chose the answer for this idea`;
    case "item.visibilityChanged":
      return `${actor} changed who can see this`;
    /*
      Adoption had no case here at all, so it fell through to the generic phrase and
      read "started using" with nothing after it — no object, no context. On an item's
      own timeline the solution is already the subject, hence "this" rather than
      naming it again. The team comes from the shared helper so the timeline and the
      feed cannot phrase the same row differently.
    */
    case "solutionUse.started": {
      const team = adoptingTeam(record.summary);
      return team
        ? `${actor} started using this on behalf of the ${team} team`
        : `${actor} started using this`;
    }
    case "solutionUse.updated":
    case "solutionUse.statusChanged": {
      const team = adoptingTeam(record.summary);
      return team
        ? `${actor} updated how the ${team} team uses this`
        : `${actor} updated how their team uses this`;
    }
    case "solutionUse.completed": {
      const team = adoptingTeam(record.summary);
      return team
        ? `${actor} finished rolling this out for the ${team} team`
        : `${actor} finished rolling this out`;
    }
    default:
      // Audit summaries are written for the record, not the reader, so the
      // shared phrase table is the fallback rather than raw summary text.
      return `${actor} ${activityPhrase(record.action, record.summary)}`;
  }
}

function initialsFromName(value: string): string {
  return personName(value)
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function timeAgo(value: string): string {
  const date = new Date(value);
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
}
