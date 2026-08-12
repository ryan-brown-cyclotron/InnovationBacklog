import { useEffect, useMemo, useState } from "react";
import type React from "react";
import {
  sameUser,
  type Milestone,
  type MilestoneStatus,
  type SolutionIssue,
  type SolutionIssueStatus,
} from "@innovation-backlog/logic";
import { modalStyles, ModalShell } from "../Modal/ModalShell";
import styles from "./SolutionPanel.module.scss";
import type {
  ActivityRecord,
  Comment,
  Request,
  RequestSummary,
  Solution,
  SolutionSummary,
  SolutionUse,
  Visibility,
} from "../../types";
import { useApi } from "../../Hooks/useApi";
import { DecisionForm } from "../DecisionForm/DecisionForm";
import { OverlayPane } from "../OverlayPane/OverlayPane";
import { PersonAvatar } from "../PersonAvatar/PersonAvatar";
import {
  VisibilityBadge,
  VisibilityControl,
} from "../VisibilityControl/VisibilityControl";
import { buildTimeline } from "../TimelineItems/TimelineItems";
import { AdoptionForm } from "./AdoptionForm";
import { AdoptionTab, distinctTeams, headline } from "./AdoptionTab";
import { ActivityTab } from "./ActivityTab";
import { IssuesTab } from "./IssuesTab";
import { OverviewTab } from "./OverviewTab";
import { SolutionTabs, TabPanel, type SolutionTab, type TabSpec } from "./SolutionTabs";
import { deriveSolutionStatus, personName, relativeTime } from "../../utils";

export type { SolutionTab } from "./SolutionTabs";

/**
 * A solution, in four tabs.
 *
 * Orchestration only: this file owns the props, the mutations, the overlay panes and
 * the header. Every tab body and every editable section is a sibling under this
 * folder, sharing one stylesheet.
 *
 * `issues` and `milestones` are CAPABILITIES. `undefined` means the host could not be
 * asked and the surface is not rendered; `[]` means it was asked and there is nothing
 * yet, which is a claim about this solution and gets an empty state. Collapsing the
 * two would tell every reader on the REST host that nobody has ever reported a bug.
 */
export function SolutionPanel({
  solution,
  linkedNeeds,
  comments,
  activity,
  adoptions = [],
  solutionSummary,
  requestSummary,
  role,
  currentUserId = null,
  issues,
  milestones,
  openAdoption = false,
  tab = "overview",
  onTabChange,
  onClose,
  onOpenRequest,
  onRefresh,
}: {
  solution: Solution;
  linkedNeeds: Request[];
  comments: Comment[];
  activity: ActivityRecord[];
  /** The adoption rows themselves. Empty when the host could not read them. */
  adoptions?: SolutionUse[];
  solutionSummary: SolutionSummary;
  requestSummary: RequestSummary;
  role: string;
  /** For "is this mine" — a UPN on both sides. Null before identity resolves. */
  currentUserId?: string | null;
  /** Undefined when the host cannot serve them: the Issues tab is not rendered. */
  issues?: SolutionIssue[];
  /** Undefined when the host cannot serve them: the Roadmap is not rendered. */
  milestones?: Milestone[];
  openAdoption?: boolean;
  tab?: SolutionTab;
  onTabChange?: (tab: SolutionTab) => void;
  onClose: () => void;
  onOpenRequest: (request: Request) => void;
  onRefresh: () => Promise<void>;
}): React.ReactElement {
  const api = useApi();
  // One overlay pane at a time, layered over the modal.
  const [pane, setPane] = useState<"adopt" | "visibility" | "decision" | null>(
    openAdoption ? "adopt" : null,
  );

  useEffect(() => {
    if (openAdoption) setPane("adopt");
  }, [openAdoption]);

  const summary = solutionSummary[solution.id];
  // The rows are the truth when they arrived; the rollup is the fallback, and the two
  // are computed from the same table so they cannot disagree about how many there are.
  const adoptionCount = adoptions.length || summary?.adoptions || solution.useCount || 0;
  const teams = summary?.teams ?? distinctTeams(adoptions);
  const stage = deriveSolutionStatus({ id: solution.id }, summary);

  const isOwner = sameUser(solution.ownerId, currentUserId);
  const isReviewer = role === "approver" || role === "administrator";
  const canEdit = isOwner || isReviewer;
  const canReview = isReviewer && solution.status === "AwaitingApproval";
  const visibility = (solution.visibility as Visibility) ?? "Everyone";

  // Counted from the rows the feed will actually render, not from the raw arrays —
  // the feed drops comment.added, hidden actions and superseded decisions.
  const activityCount = useMemo(
    () => buildTimeline(comments, activity).length,
    [comments, activity],
  );
  const openIssues = issues?.filter((issue) => issue.status !== "Done").length;

  // -------------------------------------------------------------------------
  // Mutations. Every one refreshes rather than patching local state, so the
  // panel cannot drift from what the next reader will load.
  // -------------------------------------------------------------------------

  const patchSolution = async (body: Record<string, unknown>) => {
    await api(`/api/solutions/${solution.id}`, {
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
    await api(`/api/solutions/${solution.id}/comments`, {
      method: "POST",
      body: JSON.stringify({ ...draft, subjectType: "Solution" }),
    });
    await onRefresh();
  }

  async function linkNeed(requestId: string) {
    await api(`/api/requests/${requestId}/link`, {
      method: "POST",
      body: JSON.stringify({ solutionId: solution.id }),
    });
    await onRefresh();
  }

  async function unlinkNeed(requestId: string) {
    await api(`/api/requests/${requestId}/unlink`, {
      method: "POST",
      body: JSON.stringify({ solutionId: solution.id }),
    });
    await onRefresh();
  }

  async function setAdoptionStatus(useId: string, status: string) {
    await api(`/api/solutions/${solution.id}/use/${useId}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
    await onRefresh();
  }

  async function reportIssue(input: { title: string; description: string }) {
    await api(`/api/solutions/${solution.id}/issues`, {
      method: "POST",
      body: JSON.stringify(input),
    });
    await onRefresh();
  }

  async function setIssueStatus(issueId: string, status: SolutionIssueStatus) {
    await api(`/api/solutions/${solution.id}/issues/${issueId}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
    await onRefresh();
  }

  async function createMilestone() {
    await api(`/api/solutions/${solution.id}/milestones`, {
      method: "POST",
      body: JSON.stringify({ title: "New milestone", status: "Planned" }),
    });
    await onRefresh();
  }

  async function updateMilestone(
    id: string,
    patch: { title?: string; status?: MilestoneStatus },
  ) {
    await api(`/api/solutions/${solution.id}/milestones/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
    await onRefresh();
  }

  async function deleteMilestone(id: string) {
    await api(`/api/solutions/${solution.id}/milestones/${id}`, { method: "DELETE" });
    await onRefresh();
  }

  // -------------------------------------------------------------------------
  // Tabs
  // -------------------------------------------------------------------------

  const tabs: TabSpec[] = [
    { id: "overview", label: "Overview" },
    { id: "activity", label: "Activity", count: activityCount, countLabel: "updates" },
    ...(issues
      ? [
          {
            id: "issues" as const,
            label: "Issues",
            count: openIssues,
            countLabel: "open",
          },
        ]
      : []),
    { id: "adoption", label: "Adoption", count: adoptionCount, countLabel: "adoptions" },
  ];

  // Issues can arrive after first paint, or never. A tab that disappears must not
  // leave the panel rendering nothing.
  const active = tabs.some((each) => each.id === tab) ? tab : "overview";

  return (
    <ModalShell
      eyebrow="SOLUTION"
      badge={
        <>
          <span className={styles.statusPill}>
            <span className={styles.statusDot} />
            {stage}
          </span>
          <VisibilityBadge visibility={visibility} />
          <span className={styles.updated}>
            Updated {relativeTime(solution.updatedAt)}
          </span>
        </>
      }
      tone="solution"
      title={solution.title}
      meta={
        <span className={styles.byline}>
          {solution.ownerId && (
            <>
              <PersonAvatar id={solution.ownerId} size="sm" />
              <span className={styles.bylineName}>{personName(solution.ownerId)}</span>
              <span className={styles.bylineSeparator}>·</span>
            </>
          )}
          <span>{solution.type}</span>
        </span>
      }
      onClose={onClose}
      primaryAction={
        <>
          {canReview && (
            <button
              className={modalStyles.primaryButton}
              onClick={() => setPane("decision")}
            >
              Review
            </button>
          )}
          {/*
            A chip, not a flipped primary button. Whether one of these adoptions is
            YOURS is a display-name match across two identity stores, so it is right
            often but not always — and a primary action that occasionally lies about
            what it will do is far worse than a badge that occasionally goes missing.
          */}
          {usesThis(adoptions, currentUserId) && (
            <span className={styles.usingChip}>✓ You are using this</span>
          )}
          <button className={modalStyles.primaryButton} onClick={() => setPane("adopt")}>
            Start using this
          </button>
          {role === "administrator" && (
            <button
              className={modalStyles.ghostButton}
              onClick={() => setPane("visibility")}
            >
              Who can see this
            </button>
          )}
        </>
      }
      tabs={<SolutionTabs tabs={tabs} active={active} onChange={(next) => onTabChange?.(next)} />}
      overlays={
        <>
          <OverlayPane
            title="Start using this"
            detail="Recording who uses a solution is how the hub knows what is working."
            open={pane === "adopt"}
            onClose={() => setPane(null)}
          >
            <AdoptionForm
              solutionId={solution.id}
              onDone={async () => {
                setPane(null);
                await onRefresh();
              }}
              onCancel={() => setPane(null)}
            />
          </OverlayPane>

          <OverlayPane
            title="Who can see this"
            detail="Administrators decide who this solution is visible to."
            open={pane === "visibility"}
            onClose={() => setPane(null)}
          >
            <VisibilityControl
              itemType="solutions"
              itemId={solution.id}
              visibility={visibility}
              onChanged={onRefresh}
            />
          </OverlayPane>

          <OverlayPane
            title="Review this solution"
            detail="Until it is accepted, only reviewers and the person who shared it can see it."
            open={pane === "decision"}
            onClose={() => setPane(null)}
          >
            <DecisionForm
              onDecide={async (decision, rationale) => {
                await api(`/api/solutions/${solution.id}/${decision}`, {
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
      {active === "overview" && (
        <TabPanel tab="overview">
          <OverviewTab
            solution={solution}
            linkedNeeds={linkedNeeds}
            requestSummary={requestSummary}
            milestones={milestones}
            canEdit={canEdit}
            stats={[
              { label: "teams using", value: teams },
              { label: "open issues", value: openIssues },
              { label: "comments", value: summary?.comments ?? comments.length },
              {
                label: "milestones shipped",
                value: milestones?.filter((m) => m.status === "Shipped").length,
              },
            ]}
            onOpenRequest={onOpenRequest}
            onSaveDescription={(description) => patchSolution({ description })}
            onSaveTags={(tags) => patchSolution({ tags })}
            onLinkIdea={linkNeed}
            onUnlinkIdea={unlinkNeed}
            onCreateMilestone={createMilestone}
            onUpdateMilestone={updateMilestone}
            onDeleteMilestone={deleteMilestone}
          />
        </TabPanel>
      )}

      {active === "activity" && (
        <TabPanel tab="activity">
          <ActivityTab
            comments={comments}
            activity={activity}
            onAddComment={addComment}
          />
        </TabPanel>
      )}

      {active === "issues" && issues && (
        <TabPanel tab="issues">
          <IssuesTab
            issues={issues}
            canTriage={canEdit}
            currentUserId={currentUserId}
            onCreate={reportIssue}
            onSetStatus={setIssueStatus}
          />
        </TabPanel>
      )}

      {active === "adoption" && (
        <TabPanel tab="adoption">
          <AdoptionTab
            adoptions={adoptions}
            adoptionCount={adoptionCount}
            teams={teams}
            onRecord={() => setPane("adopt")}
            onSetStatus={setAdoptionStatus}
          />
        </TabPanel>
      )}
    </ModalShell>
  );
}

export { headline as adoptionHeadline };

/**
 * Whether one of these adoptions looks like the reader's own.
 *
 * Best effort, deliberately. `Adoption.startedBy` is a Dataverse systemuser GUID
 * while `CurrentUser.id` is a UPN — two id spaces that cannot be joined client-side
 * (see CHECKPOINT.md) — so this falls back to the resolved display name. It is used
 * only to show a badge, never to gate an action.
 */
function usesThis(adoptions: SolutionUse[], currentUserId: string | null): boolean {
  if (!currentUserId) return false;
  const me = personName(currentUserId).trim().toLowerCase();
  if (!me) return false;
  return adoptions.some((use) => {
    if (sameUser(use.startedBy, currentUserId)) return true;
    return (use.startedByName ?? "").trim().toLowerCase() === me;
  });
}
