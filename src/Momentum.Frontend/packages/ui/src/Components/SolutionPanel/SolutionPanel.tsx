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
import styles from "./styles";
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
import { ActivityTab } from "../DetailPanel/ActivityTab";
import { IssuesTab } from "./IssuesTab";
import { OverviewTab } from "./OverviewTab";
import { Tabs, TabPanel, type TabSpec } from "../Tabs/Tabs";
import { asRole, deriveSolutionStatus, personName, relativeTime } from "../../utils";

export type SolutionTab = "overview" | "activity" | "issues" | "adoption";

/**
 * What a mutation changed, so the refresh that follows it reloads that and not the
 * whole panel.
 *
 * Every mutation used to refresh everything, which cost the full open — six routes —
 * and reset `issues` and `milestones` to "not asked yet" on the way. That is not a
 * flicker: an undefined `issues` REMOVES the Issues tab, and a removed active tab
 * falls back to Overview, so reporting an issue from the Issues tab threw the reader
 * out of it and back. Naming what changed fixes both at once.
 *
 * `"solution"` means the record itself — a field, a link, anything the header or the
 * catalogue behind the panel shows — and still reloads everything.
 */
export type SolutionRefresh =
  | "solution"
  | "requests"
  | "comments"
  | "use"
  | "issues"
  | "milestones";

/** Namespaces this strip's DOM ids. See `Tabs`. */
const GROUP = "solution";

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
  onRefresh: (changed?: SolutionRefresh) => Promise<void>;
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
  // panel cannot drift from what the next reader will load — but each one names
  // what it changed, so the refresh is that list and not all six. See
  // SolutionRefresh.
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
    await onRefresh("comments");
  }

  async function linkNeed(requestId: string) {
    await api(`/api/requests/${requestId}/link`, {
      method: "POST",
      body: JSON.stringify({ solutionId: solution.id }),
    });
    await onRefresh("requests");
  }

  async function unlinkNeed(requestId: string) {
    await api(`/api/requests/${requestId}/unlink`, {
      method: "POST",
      body: JSON.stringify({ solutionId: solution.id }),
    });
    await onRefresh("requests");
  }

  async function setAdoptionStatus(useId: string, status: string) {
    await api(`/api/solutions/${solution.id}/use/${useId}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
    await onRefresh("use");
  }

  /*
    POST .../withdraw, not DELETE: the row is retained with a Withdrawn status and drops
    out of the list and the counts. `"use"` reloads the adoptions and the activity feed,
    which is the only place the withdrawal remains visible.
  */
  async function withdrawAdoption(useId: string) {
    await api(`/api/solutions/${solution.id}/use/${useId}/withdraw`, { method: "POST" });
    await onRefresh("use");
  }

  async function reportIssue(input: { title: string; description: string }) {
    await api(`/api/solutions/${solution.id}/issues`, {
      method: "POST",
      body: JSON.stringify(input),
    });
    await onRefresh("issues");
  }

  async function setIssueStatus(issueId: string, status: SolutionIssueStatus) {
    await api(`/api/solutions/${solution.id}/issues/${issueId}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
    await onRefresh("issues");
  }

  async function createMilestone() {
    await api(`/api/solutions/${solution.id}/milestones`, {
      method: "POST",
      body: JSON.stringify({ title: "New milestone", status: "Planned" }),
    });
    await onRefresh("milestones");
  }

  async function updateMilestone(
    id: string,
    patch: { title?: string; status?: MilestoneStatus },
  ) {
    await api(`/api/solutions/${solution.id}/milestones/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
    await onRefresh("milestones");
  }

  async function deleteMilestone(id: string) {
    await api(`/api/solutions/${solution.id}/milestones/${id}`, { method: "DELETE" });
    await onRefresh("milestones");
  }

  // -------------------------------------------------------------------------
  // Tabs
  // -------------------------------------------------------------------------

  const tabs: TabSpec<SolutionTab>[] = [
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
            A chip rather than a flipped primary button. It used to be hedged this way
            because "is one of these yours" was a display-name match across two identity
            stores; `startedByMe` makes it exact, so the chip is now simply a statement
            of fact. Left as a chip because the header keeps only actions no tab owns,
            and Adoption owns the verb.
          */}
          {usesThis(adoptions) && (
            <span className={styles.usingChip}>✓ You are using this</span>
          )}
          {/*
            "Start using this" is deliberately NOT here.

            It was a leftover from the pre-tab design: two triggers for one
            `pane === "adopt"` overlay, both on screen at once on Overview. Adoption
            owns the verb now, through its own "+ Record an adoption" — which is
            where someone is already looking at the list of adopters and thinking "I
            should add mine". The header keeps only the actions no tab owns.

            The overlay itself stays reachable from `openAdoption`, so a deep link
            still opens straight into the form.
          */}
          {role === "administrator" && (
            <button
              className={modalStyles.ghostButton}
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
          label="Solution detail"
          tabs={tabs}
          active={active}
          onChange={(next) => onTabChange?.(next)}
        />
      }
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
                await onRefresh("use");
              }}
              onCancel={() => setPane(null)}
            />
          </OverlayPane>

          <OverlayPane
            title="Manage access"
            detail="Administrators decide who this solution is visible to."
            open={pane === "visibility"}
            onClose={() => setPane(null)}
          >
            <VisibilityControl
              itemType="solutions"
              itemId={solution.id}
              visibility={visibility}
              // Wrapped, not passed: visibility is a field on the record, and a
              // bare reference would hand this whatever argument the control emits.
              onChanged={() => onRefresh("solution")}
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
        <TabPanel group={GROUP} tab="overview">
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
        <TabPanel group={GROUP} tab="activity">
          <ActivityTab
            comments={comments}
            activity={activity}
            note="Comments and progress on this solution"
            emptyText="No updates yet — share feedback, ask a question, or tell others how your team is using it."
            emptyComments="No comments yet — share feedback, ask a question, or tell others how your team is using it."
            emptyEvents="Nothing has happened to this solution yet."
            onAddComment={addComment}
          />
        </TabPanel>
      )}

      {active === "issues" && issues && (
        <TabPanel group={GROUP} tab="issues">
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
        <TabPanel group={GROUP} tab="adoption">
          <AdoptionTab
            adoptions={adoptions}
            adoptionCount={adoptionCount}
            teams={teams}
            role={asRole(role)}
            onRecord={() => setPane("adopt")}
            onSetStatus={setAdoptionStatus}
            onWithdraw={withdrawAdoption}
          />
        </TabPanel>
      )}
    </ModalShell>
  );
}

export { headline as adoptionHeadline };

/**
 * Whether one of these adoptions is the reader's own.
 *
 * Now exact, and no longer a guess. This used to compare `Adoption.startedBy` — a
 * Dataverse systemuser GUID — against `CurrentUser.id`, a UPN, and fall back to matching
 * resolved display names when that failed, because the two id spaces cannot be joined
 * client-side. `startedByMe` is resolved by the provider, where both ids are GUIDs, so
 * the join happens in the one place it can be correct.
 *
 * The display-name fallback is gone rather than kept as a backstop: it was wrong in both
 * directions — two people sharing a name matched, and a name that failed to resolve did
 * not — and the same flag now gates the row's controls, where being right often is not
 * good enough.
 */
function usesThis(adoptions: SolutionUse[]): boolean {
  return adoptions.some((use) => use.startedByMe === true);
}
