import React, { useEffect, useState } from "react";
import styles from "./Home.module.scss";
import type {
  ActivityRecord,
  ContributionKind,
  DiscoveryItem,
  MomentumHome,
  MomentumItem,
  Request,
  RequestSummary,
  SearchResult,
  Solution,
  SolutionSummary,
} from "../../types";
import {
  auditActorName,
  deriveNeedStatus,
  deriveSolutionStatus,
  discoveryStub,
  isIdeaItem,
  requestStatusName,
} from "../../utils";
import { useReveal } from "../../Hooks/useReveal";
import { CommandSearch } from "../../Components/CommandSearch/CommandSearch";
import { ActivitySplit } from "../../Components/ActivitySplit/ActivitySplit";
import { SpotlightCard } from "../../Components/SpotlightCard/SpotlightCard";
import { SectionHeading } from "../../Components/SectionHeading/SectionHeading";
import { NeedGroups } from "../../Components/NeedGroups/NeedGroups";
import { ActivityPane } from "../../Components/ActivityPane/ActivityPane";
import { ContextualEmpty, Pending } from "../../Components/Empty/Empty";

export interface HomeProps {
  userName: string;
  requests: Request[];
  inbox: Request[];
  opportunities: SearchResult;
  solutions: SearchResult;
  activity: ActivityRecord[];
  requestSummary: RequestSummary;
  solutionSummary: SolutionSummary;
  canGovern: boolean;
  onContribute: (kind: ContributionKind | null) => void;
  query: string;
  setQuery: (value: string) => void;
  onExploreNeeds: () => void;
  onExploreSolutions: () => void;
  busy: boolean;
  /**
   * The workspace fetch, which is not the same thing as `busy`.
   *
   * `busy` tracks the search box. Every empty state on this page is derived from
   * array length, so with nothing tracking the initial load the page confidently
   * announced "Nothing happening yet" while Azure DevOps and Dataverse were still
   * answering.
   */
  loading?: boolean;
  onOpenDiscovery: (item: DiscoveryItem) => void;
  onOpenSolution: (solution: Solution) => void;
  onAdoptSolution: (item: DiscoveryItem) => void;
  momentum: MomentumHome;
  onOpenMomentum: (item: MomentumItem) => void;
  onOpenApprovals?: () => void;
}

export function Home({
  userName,
  requests,
  inbox,
  opportunities,
  solutions,
  activity,
  requestSummary,
  solutionSummary,
  canGovern,
  onContribute,
  query,
  setQuery,
  onExploreNeeds,
  onExploreSolutions,
  busy,
  loading,
  onOpenDiscovery,
  onOpenSolution,
  onAdoptSolution,
  momentum,
  onOpenMomentum,
  onOpenApprovals,
}: HomeProps): React.ReactElement {
  const hour = new Date().getHours();
  const [paneOpen, setPaneOpen] = useState(false);

  const onOpenActivity = (record: ActivityRecord) => {
    const source = record.resourceType === "solution" ? "solution" : "request";
    onOpenDiscovery(
      discoveryStub(source, record.subjectId || record.resourceId, {
        title: record.summary,
        createdAt: record.occurredAt,
        updatedAt: record.occurredAt,
      }),
    );
  };

  const attention = canGovern
    ? inbox
    : requests
        .filter(
          (item) =>
            requestStatusName(item.status) === "TriageFailed" ||
            requestStatusName(item.status) === "PublicationFailed",
        )
        .slice(0, 3);
  const connectedCount = opportunities.totalCount + solutions.totalCount;
  const contributors = Array.from(
    new Set(
      activity
        .filter((item) => auditActorName(item.actorType) === "user")
        .map((item) => item.actorId),
    ),
  );
  const publishedSignals = activity.filter((item) =>
    item.action.endsWith(".published"),
  );

  const noData =
    connectedCount === 0 && requests.length === 0 && activity.length === 0;

  // Nothing has arrived AND nothing is still coming. Until the fetch settles the
  // page has no basis for claiming the organization has done nothing.
  const settling = Boolean(loading) && noData;
  const isEmpty = noData && !settling;

  useReveal([isEmpty, activity.length, connectedCount]);

  const contributorEvidence = contributors.slice(0, 5).map((id) => ({
    id,
    // Carried from the feed: the id alone is a Dataverse GUID on this host, and
    // rendering it produced "Someone" for every contributor.
    name: activity.find((record) => record.actorId === id)?.actorName ?? null,
    evidence: `${activity.filter((record) => record.actorId === id && auditActorName(record.actorType) === "user").length} updates`,
  }));

  // /api/search returns both requests and solutions; only requests are needs.
  // Solutions render separately below, so mapping them here duplicated them.
  const risingNeeds: DiscoveryItem[] = opportunities.items
    .filter((item) => isIdeaItem(item.itemType))
    .map((item) => {
    const summary = requestSummary[item.itemId];
    return {
      ...item,
      kind: "Need",
      source: "request",
      derivedStatus: deriveNeedStatus(
        { status: item.status, canonicalSolutionId: item.canonicalSolutionId },
        summary,
      ),
      voteCount: summary?.votes ?? 0,
      votes30d: summary?.votes30d ?? 0,
      contributors: summary?.contributors ?? 0,
      linkedSolutions: summary?.linkedSolutions ?? 0,
    };
  });
  const solutionItems: DiscoveryItem[] = solutions.items.map((item) => {
    const summary = solutionSummary[item.itemId];
    return {
      ...item,
      kind: "Solution",
      source: "solution",
      derivedStatus: deriveSolutionStatus({ id: item.itemId }, summary),
      adoptionCount: summary?.adoptions ?? 0,
      teams: summary?.teams ?? 0,
      linkedNeeds: summary?.linkedNeeds ?? 0,
    };
  });
  // Solutions not linked to any idea are spotlighted as top-level rows; the
  // rest appear nested under the idea they support.
  const standaloneSolutions = solutionItems.filter(
    (item) => (item.linkedNeeds ?? 0) === 0,
  );

  /*
   * "Could use your input" is a claim, so the section filters rather than relabelling
   * a recent-items list — which is all it did, making the heading untrue.
   *
   * The test is whether anyone has answered the idea yet, which is a property of the
   * data and not of the status chip. Awaiting approval does NOT disqualify an idea:
   * it has no solution attached, so proposing one, commenting, or upvoting are all
   * still useful. Gating on the chip hid exactly the unanswered ideas this section
   * exists to show.
   *
   * Ordered by demand rather than recency for the same reason — a recency sort is
   * what made this indistinguishable from the rest of the page.
   */
  const needsInput = risingNeeds
    .filter((item) => {
      if (item.status === "Rejected") return false;
      if (item.canonicalSolutionId) return false; // already answered
      return (item.linkedSolutions ?? 0) === 0; // someone is already on it
    })
    .sort((a, b) => (b.voteCount ?? 0) - (a.voteCount ?? 0));

  const hasContributions = needsInput.length > 0 || standaloneSolutions.length > 0;

  return (
    <section className={styles.homeView}>
      <header className={styles.homeIntro}>
        <div>
          <p className={styles.greeting}>
            Good {hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening"},{" "}
            {userName.split(" ")[0]}.
          </p>
          <h1>Turn good ideas into work others can use.</h1>
          <p className={styles.homeSub}>
            See what people are working on, share what you know, and help
            promising ideas move forward.
          </p>
        </div>
        {!isEmpty && (
          <div>
            <div className={styles.searchWrap}>
              <CommandSearch
                query={query}
                setQuery={setQuery}
                // The dropdown is the result: it previews matches and opens
                // them directly, and the list below stays as it is.
                onSearch={() => {}}
                onOpenItem={onOpenDiscovery}
                busy={busy}
              />
            </div>
          </div>
        )}
        {!isEmpty && (
          <div className={styles.heroMetrics}>
            <div className={styles.metric}>
              <strong>{opportunities.totalCount}</strong>
              <span>Where we need help</span>
            </div>
            <div className={styles.metric}>
              <strong>{publishedSignals.length}</strong>
              <span>Shared this week</span>
            </div>
            {canGovern && onOpenApprovals ? (
              <button className={styles.metricButton} onClick={onOpenApprovals}>
                <strong>{attention.length}</strong>
                <span>Ready for review →</span>
              </button>
            ) : (
              <div className={styles.metric}>
                <strong>{attention.length}</strong>
                <span>{canGovern ? "Ready for review" : "Waiting for input"}</span>
              </div>
            )}
            <div className={styles.metric}>
              <strong>{contributors.length}</strong>
              <span>
                {contributors.length === 1
                  ? "Person contributing"
                  : "People contributing"}
              </span>
            </div>
          </div>
        )}
      </header>

      {settling ? (
        // The first-use pitch is a strong claim — "nobody has done anything here" —
        // and showing it mid-fetch greets a populated hub as an empty one.
        <Pending text="Loading the hub…" />
      ) : isEmpty ? (
        <section className={styles.firstUse}>
          <h2>Start the Innovation Hub</h2>
          <p className={styles.firstUseSub}>
            Share an idea for others to build on or a solution the organization
            can reuse.
          </p>
          <div className={styles.firstUseActions}>
            <button
              className={styles.firstUsePrimary}
              onClick={() => onContribute("request")}
            >
              Share an idea
            </button>
            <button
              className={styles.firstUseGhost}
              onClick={() => onContribute("solution")}
            >
              Share a solution
            </button>
          </div>
          <div className={styles.firstUseExamples}>
            <h3>Good things to share</h3>
            <div className={styles.exampleGrid}>
              <div>
                <strong>An idea</strong>
                <p>
                  A problem, opportunity, or improvement others could help
                  develop.
                </p>
              </div>
              <div>
                <strong>A solution</strong>
                <p>
                  A tool, process, template, or resource that already works.
                </p>
              </div>
              <div>
                <strong>What you know</strong>
                <p>
                  Useful context or expertise that could strengthen someone
                  else’s work.
                </p>
              </div>
            </div>
          </div>
          <p className={styles.firstUseNote}>
            As people contribute, this page will show ideas gaining upvotes,
            solutions being used, and the latest progress.
          </p>
        </section>
      ) : (
        <>
          <ActivitySplit
            loading={loading}
            activity={activity}
            items={[...risingNeeds, ...solutionItems]}
            solutionSummary={solutionSummary}
            onOpenItem={onOpenDiscovery}
            onSeeAll={() => setPaneOpen(true)}
            onSearchTag={setQuery}
          />

          {momentum.items.length > 0 && (
            <div data-reveal>
              <SpotlightCard items={momentum.items} onOpen={onOpenMomentum} />
            </div>
          )}

          <div data-reveal>
            <SectionHeading
              title="Where you can contribute"
              meta="Ideas nobody has solved yet, and solutions not yet linked to one"
            />
            {loading && !hasContributions ? (
              <Pending text="Looking for work you can pick up…" />
            ) : hasContributions ? (
              <NeedGroups
                needs={needsInput}
                standaloneSolutions={standaloneSolutions}
                solutionSummary={solutionSummary}
                onOpenNeed={onOpenDiscovery}
                onOpenSolution={onOpenSolution}
                onOpenSolutionItem={onOpenDiscovery}
              />
            ) : (
              // Without this the heading stands over nothing, which reads as a
              // failed load rather than an answered backlog.
              <ContextualEmpty
                title="Every idea has an answer so far."
                text="Ideas show up here until someone proposes a solution for them."
              />
            )}
          </div>
        </>
      )}
      <ActivityPane
        open={paneOpen}
        onClose={() => setPaneOpen(false)}
        activity={activity}
        onOpenItem={onOpenActivity}
        contributors={contributorEvidence}
      />
    </section>
  );
}