import { useState, useEffect } from "react";
import type React from "react";
import { modalStyles as styles } from "../Modal/ModalShell";
import { ModalShell } from "../Modal/ModalShell";
import type {
  AcceptanceDecision,
  ActivityRecord,
  Comment,
  Request,
  RequestSummary,
  SearchItem,
  SearchResult,
  Solution,
  SolutionSummary,
  Visibility,
  VoteSummary,
} from "../../types";
import { useApi } from "../../Hooks/useApi";
import { DecisionForm } from "../DecisionForm/DecisionForm";
import { CommentComposer } from "../CommentComposer/CommentComposer";
import { OverlayPane } from "../OverlayPane/OverlayPane";
import { TagList } from "../TagList/TagList";
import {
  VisibilityBadge,
  VisibilityControl,
} from "../VisibilityControl/VisibilityControl";
import { TimelineItems } from "../TimelineItems/TimelineItems";
import {
  deriveNeedStatus,
  deriveSolutionStatus,
  personName,
  relativeTime,
  upvoteCountLabel,
} from "../../utils";

export function RequestPanel({
  request,
  comments,
  activity,
  linkedSolutions,
  requestSummary,
  solutionSummary,
  role,
  decisions = [],
  onClose,
  onOpenSolution,
  onRefresh,
}: {
  request: Request;
  comments: Comment[];
  activity: ActivityRecord[];
  linkedSolutions: Solution[];
  requestSummary: RequestSummary;
  solutionSummary: SolutionSummary;
  role: string;
  decisions?: AcceptanceDecision[];
  onClose: () => void;
  onOpenSolution: (solution: Solution) => void;
  onRefresh: () => Promise<void>;
}): React.ReactElement {
  const api = useApi();
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [linkQuery, setLinkQuery] = useState("");
  const [linkResults, setLinkResults] = useState<SearchItem[]>([]);
  const [linkBusy, setLinkBusy] = useState(false);
  const [vote, setVote] = useState<VoteSummary | null>(null);
  const [voteBusy, setVoteBusy] = useState(false);
  // One overlay pane at a time, layered over the modal.
  const [pane, setPane] = useState<"visibility" | "decision" | null>(null);

  const summary = requestSummary[request.id];
  const status = deriveNeedStatus(request, summary);
  const voteCount = vote?.count ?? summary?.votes ?? 0;
  const votedByMe = vote?.votedByMe ?? false;

  // Upvote state is per-user, so it comes from the server rather than the
  // shared workspace summary.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const next = await api<VoteSummary>(
          `/api/votes?itemType=Request&itemId=${encodeURIComponent(request.id)}`,
        );
        if (!cancelled) setVote(next);
      } catch {
        if (!cancelled) setVote(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [request.id]);

  async function addComment(draft: {
    body: string;
    audience: string;
    attachmentIds: string[];
  }) {
    await api(`/api/requests/${request.id}/comments`, {
      method: "POST",
      body: JSON.stringify({ ...draft, subjectType: "Request" }),
    });
    await onRefresh();
  }

  /** Upvote is a toggle: vote, or take the vote back. */
  async function toggleVote() {
    if (voteBusy) return;
    setVoteBusy(true);
    try {
      const body = JSON.stringify({ itemId: request.id, itemType: "Request" });
      await api(`/api/votes`, { method: votedByMe ? "DELETE" : "POST", body });
      setVote({
        itemType: "Request",
        itemId: request.id,
        count: Math.max(0, voteCount + (votedByMe ? -1 : 1)),
        votedByMe: !votedByMe,
      });
      await onRefresh();
    } finally {
      setVoteBusy(false);
    }
  }

  async function linkSolution(solutionId: string) {
    await api(`/api/requests/${request.id}/link`, {
      method: "POST",
      body: JSON.stringify({ solutionId }),
    });
    setLinkQuery("");
    setLinkResults([]);
    setSuggestOpen(false);
    await onRefresh();
  }

  async function unlinkSolution(solutionId: string) {
    await api(`/api/requests/${request.id}/unlink`, {
      method: "POST",
      body: JSON.stringify({ solutionId }),
    });
    await onRefresh();
  }

  useEffect(() => {
    if (!linkQuery.trim()) {
      setLinkResults([]);
      return;
    }
    const handle = setTimeout(async () => {
      setLinkBusy(true);
      try {
        const result = await api<SearchResult>(
          `/api/solutions?query=${encodeURIComponent(linkQuery)}&take=10`,
        );
        const linkedIds = new Set(linkedSolutions.map((s) => s.id));
        setLinkResults(
          result.items.filter((item) => !linkedIds.has(item.itemId)),
        );
      } catch {
        setLinkResults([]);
      } finally {
        setLinkBusy(false);
      }
    }, 250);
    return () => clearTimeout(handle);
  }, [linkQuery, linkedSolutions]);

  const canDecide =
    (role === "approver" || role === "administrator") &&
    request.status === "AwaitingApproval";

  const metaParts: string[] = [];
  if (request.submittedBy)
    metaParts.push(`Shared by ${personName(request.submittedBy)}`);
  if (voteCount > 0) metaParts.push(upvoteCountLabel(voteCount));
  metaParts.push(`Updated ${relativeTime(request.updatedAt)}`);

  const visibility = (request.visibility as Visibility) ?? "Everyone";

  return (
    <ModalShell
      eyebrow={`IDEA · ${status}`}
      badge={<VisibilityBadge visibility={visibility} />}
      tone="need"
      title={request.title}
      description={undefined}
      meta={metaParts.join(" · ")}
      onClose={onClose}
      primaryAction={
        <>
          {canDecide && (
            <button
              className={styles.primaryButton}
              onClick={() => setPane("decision")}
            >
              Review
            </button>
          )}
          <button
            className={`${styles.primaryButton} ${votedByMe ? styles.primaryButtonActive : ""}`}
            onClick={() => void toggleVote()}
            disabled={voteBusy}
            aria-pressed={votedByMe}
            title={votedByMe ? "Remove your upvote" : "Upvote this idea"}
          >
            {votedByMe ? "▲ Upvoted" : "▲ Upvote"}
            {voteCount > 0 ? ` · ${voteCount}` : ""}
          </button>
          {role === "administrator" && (
            <button
              className={styles.ghostButton}
              onClick={() => setPane("visibility")}
            >
              Who can see this
            </button>
          )}
        </>
      }
    >
      <OverlayPane
        title="Who can see this"
        detail="Administrators decide who this idea is visible to."
        open={pane === "visibility"}
        onClose={() => setPane(null)}
      >
        <VisibilityControl
          itemType="requests"
          itemId={request.id}
          visibility={visibility}
          onChanged={onRefresh}
        />
      </OverlayPane>

      <OverlayPane
        title="Review this idea"
        detail="Your rationale is recorded as audit evidence."
        open={pane === "decision"}
        onClose={() => setPane(null)}
      >
        <DecisionForm
          onDecide={async (decision, rationale) => {
            await api(`/api/requests/${request.id}/${decision}`, {
              method: "POST",
              body: JSON.stringify({ rationale }),
            });
            setPane(null);
            await onRefresh();
          }}
        />
      </OverlayPane>

      <div className={styles.columns}>
        <div className={styles.mainCol}>
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>About this idea</h3>
            <p className={styles.bodyText}>{request.description}</p>
            <TagList tags={request.tags} />
          </section>

          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Ways people are building on this</h3>
            <p className={styles.sectionHint}>
              See what people are already trying or add another approach.
            </p>
            {linkedSolutions.length > 0 && (
              <ul className={styles.rowList}>
                {linkedSolutions.map((solution) => {
                  const solSummary = solutionSummary[solution.id];
                  const stage = deriveSolutionStatus(
                    { id: solution.id },
                    solSummary,
                  );
                  const teams = solSummary?.teams ?? 0;
                  return (
                    <li key={solution.id}>
                      <div className={styles.rowItem}>
                        <button
                          className={styles.rowMain}
                          style={{
                            border: 0,
                            background: "transparent",
                            cursor: "pointer",
                            textAlign: "left",
                            padding: 0,
                          }}
                          onClick={() => onOpenSolution(solution)}
                        >
                          <span className={styles.rowTitle}>
                            {solution.title}
                          </span>
                          <span className={styles.rowMeta}>
                            {stage}
                            {teams > 0
                              ? ` · Used by ${teams} team${teams === 1 ? "" : "s"}`
                              : ""}
                          </span>
                        </button>
                        <button
                          className={styles.rowRemove}
                          onClick={() => void unlinkSolution(solution.id)}
                          aria-label={`Remove ${solution.title}`}
                          title="Remove"
                        >
                          ×
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            {!suggestOpen ? (
              <button
                className={styles.actionLink}
                onClick={() => setSuggestOpen(true)}
              >
                Add a solution →
              </button>
            ) : (
              <div className={styles.linkSearch}>
                <input
                  type="text"
                  value={linkQuery}
                  onChange={(e) => setLinkQuery(e.target.value)}
                  placeholder="Search solutions to suggest…"
                  className={styles.linkInput}
                  aria-label="Search solutions to add"
                  autoFocus
                />
                {linkBusy && (
                  <span className={styles.linkBusy}>Searching…</span>
                )}
                {linkResults.length > 0 && (
                  <ul className={styles.linkResults}>
                    {linkResults.map((item) => (
                      <li key={item.itemId}>
                        <button
                          className={styles.linkResultItem}
                          onClick={() => void linkSolution(item.itemId)}
                        >
                          {item.title}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {!linkBusy && linkQuery.trim() && linkResults.length === 0 && (
                  <span className={styles.linkBusy}>No solutions found.</span>
                )}
              </div>
            )}
          </section>
        </div>

        <div className={styles.sideCol}>
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Conversation and progress</h3>
            <div className={styles.timeline}>
              {/* Decisions used to be their own list up here. They are part of the
                  same story as the comments and activity beneath them, so they are
                  interleaved by time rather than split into a parallel history the
                  reader has to merge themselves. */}
              <TimelineItems
                comments={comments}
                activity={activity}
                decisions={
                  role === "approver" || role === "administrator" ? decisions : []
                }
                emptyText="No updates yet — add context, ask a question, or share an update."
              />
            </div>
            <CommentComposer
              placeholder="Add context, ask a question, or share an update"
              allowPrivate={role === "approver" || role === "administrator"}
              onSubmit={addComment}
            />
          </section>
        </div>
      </div>
    </ModalShell>
  );
}
