import { useMemo, useState, useEffect } from "react";
import type React from "react";
import { sameUser } from "@innovation-backlog/logic";
import { ModalShell } from "../Modal/ModalShell";
import styles from "./styles";
import type {
  AcceptanceDecision,
  ActivityRecord,
  Comment,
  PendingLink,
  Request,
  RequestSummary,
  Solution,
  SolutionSummary,
  Visibility,
  VoteSummary,
} from "../../types";
import { useApi } from "../../Hooks/useApi";
import { DecisionForm } from "../DecisionForm/DecisionForm";
import { OverlayPane } from "../OverlayPane/OverlayPane";
import {
  VisibilityBadge,
  VisibilityControl,
} from "../VisibilityControl/VisibilityControl";
import { ActivityTab } from "../DetailPanel/ActivityTab";
import { buildTimeline } from "../TimelineItems/TimelineItems";
import { Tabs, TabPanel, type TabSpec } from "../Tabs/Tabs";
import { IdeaOverviewTab } from "./OverviewTab";
import {
  deriveNeedStatus,
  personName,
  relativeTime,
  upvoteCountLabel,
} from "../../utils";

export type IdeaTab = "overview" | "activity";

/** Namespaces this strip's DOM ids. See `Tabs`. */
const GROUP = "idea";

/**
 * An idea, in two tabs.
 *
 * Structurally the solution modal, deliberately — same shell, same strip, same
 * overview grid, same editors — because two engagement surfaces that behave
 * differently for no reason are two things to learn instead of one.
 *
 * It is NOT a copy. This panel used to render the shared `.columns` grid, whose
 * 34/66 split put the description and the linked solutions in the narrow column and
 * the conversation in the wide one. Flipping that grid would have been the wrong fix
 * here: an idea IS mostly its conversation, so the answer is not to shrink the
 * thread into a 380px sidebar but to give it a tab of its own, where it gets the
 * modal's full width rather than two thirds of it. The tab carries the count so the
 * discussion still announces itself from Overview.
 *
 * Which is also why there are two tabs and not four. A solution accumulates issues
 * and adopters; an idea accumulates argument.
 */
export function RequestPanel({
  request,
  comments,
  activity,
  linkedSolutions,
  proposedLinks = [],
  requestSummary,
  solutionSummary,
  role,
  currentUserId = null,
  decisions = [],
  onClose,
  onOpenSolution,
  onRefresh,
}: {
  request: Request;
  comments: Comment[];
  activity: ActivityRecord[];
  /** APPROVED links. These are Azure DevOps relations, written only on approval. */
  linkedSolutions: Solution[];
  /**
   * Proposed and waiting on a reviewer, which exist only in Dataverse.
   *
   * Defaulted so a host that does not serve them renders as it always did, rather than
   * crashing on undefined — the same treatment `decisions` gets.
   */
  proposedLinks?: PendingLink[];
  requestSummary: RequestSummary;
  solutionSummary: SolutionSummary;
  role: string;
  /** For "is this mine" — a UPN on both sides. Null before identity resolves. */
  currentUserId?: string | null;
  decisions?: AcceptanceDecision[];
  onClose: () => void;
  onOpenSolution: (solution: Solution) => void;
  onRefresh: () => Promise<void>;
}): React.ReactElement {
  const api = useApi();
  const [vote, setVote] = useState<VoteSummary | null>(null);
  const [voteBusy, setVoteBusy] = useState(false);
  // One overlay pane at a time, layered over the modal.
  const [pane, setPane] = useState<"visibility" | "decision" | null>(null);
  /*
    Local, unlike the solution modal's tab, which App.tsx mirrors into `?tab=`.
    Nothing deep-links into an idea's conversation yet — the solution modal needed
    it because Share is reachable from inside the Issues table. When something does,
    this lifts to a prop the same way.
  */
  const [tab, setTab] = useState<IdeaTab>("overview");

  const summary = requestSummary[request.id];
  const status = deriveNeedStatus(request, summary);
  const voteCount = vote?.count ?? summary?.votes ?? 0;
  const votedByMe = vote?.votedByMe ?? false;

  const isReviewer = role === "approver" || role === "administrator";
  /*
    Not a security boundary — see the note in CHECKPOINT2 about `canEditSolution`.
    This gates the affordance; the provider makes its own check, and nothing beneath
    either enforces it, because no ADO process rule can express "the person named in
    System.CreatedBy".
  */
  const canEdit = isReviewer || sameUser(request.submittedBy, currentUserId);
  const canDecide = isReviewer && request.status === "AwaitingApproval";
  const visibility = (request.visibility as Visibility) ?? "Everyone";

  // Approvers see the rationale behind each decision; everyone else sees only that
  // the idea moved, which the activity feed already records.
  const visibleDecisions = isReviewer ? decisions : [];

  // Counted from the rows the feed will actually render, not from the raw arrays —
  // it drops comment.added, hidden actions and superseded decisions.
  const activityCount = useMemo(
    () => buildTimeline(comments, activity, visibleDecisions).length,
    [comments, activity, visibleDecisions],
  );

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

  // -------------------------------------------------------------------------
  // Mutations. Every one refreshes rather than patching local state, so the panel
  // cannot drift from what the next reader will load.
  // -------------------------------------------------------------------------

  const patchRequest = async (body: Record<string, unknown>) => {
    await api(`/api/requests/${request.id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
    await onRefresh();
  };

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
    await onRefresh();
  }

  async function unlinkSolution(solutionId: string) {
    await api(`/api/requests/${request.id}/unlink`, {
      method: "POST",
      body: JSON.stringify({ solutionId }),
    });
    await onRefresh();
  }

  // -------------------------------------------------------------------------
  // Tabs
  // -------------------------------------------------------------------------

  const tabs: TabSpec<IdeaTab>[] = [
    { id: "overview", label: "Overview" },
    { id: "activity", label: "Activity", count: activityCount, countLabel: "updates" },
  ];

  const metaParts: string[] = [];
  if (request.submittedBy)
    metaParts.push(`Shared by ${personName(request.submittedBy)}`);
  if (voteCount > 0) metaParts.push(upvoteCountLabel(voteCount));
  metaParts.push(`Updated ${relativeTime(request.updatedAt)}`);

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
              Manage access
            </button>
          )}
        </>
      }
      tabs={
        <Tabs
          group={GROUP}
          label="Idea detail"
          tabs={tabs}
          active={tab}
          onChange={setTab}
        />
      }
      overlays={
        <>
          <OverlayPane
            title="Manage access"
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
        </>
      }
    >
      {tab === "overview" && (
        <TabPanel group={GROUP} tab="overview">
          <IdeaOverviewTab
            request={request}
            linkedSolutions={linkedSolutions}
            proposedLinks={proposedLinks}
            solutionSummary={solutionSummary}
            canEdit={canEdit}
            canUnlink={isReviewer}
            stats={[
              { label: "upvotes", value: voteCount },
              { label: "comments", value: summary?.comments ?? comments.length },
              { label: "solutions", value: linkedSolutions.length },
            ]}
            onOpenSolution={onOpenSolution}
            onSaveDescription={(description) => patchRequest({ description })}
            onSaveTags={(tags) => patchRequest({ tags })}
            onLink={linkSolution}
            onUnlink={unlinkSolution}
          />
        </TabPanel>
      )}

      {tab === "activity" && (
        <TabPanel group={GROUP} tab="activity">
          {/* Decisions are interleaved by time rather than split into a parallel
              history the reader has to merge themselves — they are part of the same
              story as the comments around them. */}
          <ActivityTab
            comments={comments}
            activity={activity}
            decisions={visibleDecisions}
            note="Conversation and progress on this idea"
            placeholder="Add context, ask a question, or share an update"
            emptyText="No updates yet — add context, ask a question, or share an update."
            emptyComments="No comments yet — add context, ask a question, or share an update."
            emptyEvents="Nothing has happened to this idea yet."
            allowPrivate={isReviewer}
            onAddComment={addComment}
          />
        </TabPanel>
      )}
    </ModalShell>
  );
}
