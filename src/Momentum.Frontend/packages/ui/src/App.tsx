import { useState, useEffect } from "react";
import type React from "react";
import { useMomentumContext } from "@momentum/sdk";
import type { AppUser } from "@momentum/contracts";
import "./Styles/index.scss";
import type {
  AcceptanceDecision,
  ActivityRecord,
  Comment,
  ContributionKind,
  DiscoveryItem,
  DiscoveryScope,
  PendingLink,
  Request,
  RequestSummary,
  Solution,
  SolutionSummary,
  SolutionUse,
  View,
} from "./types";
import type { Milestone, SolutionIssue } from "@innovation-backlog/logic";
import { useApi } from "./Hooks/useApi";
import { discoveryStub, errorText, isSolutionItem } from "./utils";
import { useWorkspace } from "./Hooks/useWorkspace";
import { useApprovals } from "./Hooks/useApprovals";
import { useSearch } from "./Hooks/useSearch";
import { Topbar } from "./Components/Topbar/Topbar";
import { RequestPanel } from "./Components/RequestPanel/RequestPanel";
import {
  SolutionPanel,
  type SolutionRefresh,
  type SolutionTab,
} from "./Components/SolutionPanel/SolutionPanel";
import { Home } from "./Pages/Home/Home";
import { MyWork } from "./Pages/MyWork/MyWork";
import { Approvals } from "./Pages/Approvals/Approvals";
import { Dashboard } from "./Pages/Dashboard/Dashboard";
import { ContributeModal } from "./Components/ContributeModal/ContributeModal";
import { Discovery as DiscoveryView } from "./Pages/Discovery/Discovery";

type UserWithRole = AppUser & { role?: string };

const SOLUTION_TABS = ["overview", "activity", "issues", "adoption"] as const;

/** A ?tab= param is user input, so it is validated rather than cast. */
/** The solution panel's independently-loadable lists. */
type SolutionSlice = "requests" | "comments" | "activity" | "use" | "issues" | "milestones";

/**
 * What a mutation changed -> what has to be read again.
 *
 * Activity is in every entry because every mutation writes an activity row. The rest
 * is deliberately narrow: adding a milestone cannot change the comment thread, and
 * reloading it anyway is what made a one-row edit cost a whole panel open.
 */
const REFRESHED_BY: Record<SolutionRefresh, readonly SolutionSlice[] | undefined> = {
  // The record itself changed — state, visibility, a field. Everything is suspect.
  solution: undefined,
  requests: ["requests", "activity"],
  comments: ["comments", "activity"],
  use: ["use", "activity"],
  issues: ["issues", "activity"],
  milestones: ["milestones", "activity"],
};

/**
 * Whether a change can alter what the list behind the panel shows.
 *
 * Rollups count Related links and `System.CommentCount`. Issues and milestones hang
 * off a Parent link and are counted by neither, so reloading the workspace after one
 * is a page of requests for numbers that cannot have moved.
 */
const CHANGES_THE_LIST: ReadonlySet<SolutionRefresh> = new Set<SolutionRefresh>([
  "solution",
  "requests",
  "comments",
  "use",
]);

function isSolutionTab(value: string | null): value is SolutionTab {
  return Boolean(value) && (SOLUTION_TABS as readonly string[]).includes(value!);
}

export function App(): React.ReactElement {
  const { user } = useMomentumContext();
  const role = (user as UserWithRole | null)?.role ?? "submitter";
  const canGovern = role === "approver" || role === "administrator";

  const [view, setView] = useState<View>("home");
  const [contributionKind, setContributionKind] =
    useState<ContributionKind | null>(null);
  const [contributeOpen, setContributeOpen] = useState(false);
  const [selected, setSelected] = useState<Request | null>(null);
  const [selectedSolution, setSelectedSolution] = useState<Solution | null>(null);
  const [requestComments, setRequestComments] = useState<Comment[]>([]);
  const [requestActivity, setRequestActivity] = useState<ActivityRecord[]>([]);
  const [requestDecisions, setRequestDecisions] = useState<AcceptanceDecision[]>([]);
  const [linkedSolutions, setLinkedSolutions] = useState<Solution[]>([]);
  // Proposed and undecided. Separate from `linkedSolutions` because those are approved
  // ADO relations and these exist only in Dataverse until somebody decides.
  const [proposedLinks, setProposedLinks] = useState<PendingLink[]>([]);
  const [linkedNeeds, setLinkedNeeds] = useState<Request[]>([]);
  const [solutionComments, setSolutionComments] = useState<Comment[]>([]);
  const [solutionActivity, setSolutionActivity] = useState<ActivityRecord[]>([]);
  const [solutionAdoptions, setSolutionAdoptions] = useState<SolutionUse[]>([]);
  const [solutionAdoptionOpen, setSolutionAdoptionOpen] = useState(false);
  /*
   * `undefined` means this host cannot serve them at all, and the surface hides.
   * `[]` means it answered and there is nothing yet, which is a claim about the
   * solution and gets an empty state. The distinction is load-bearing — collapsing
   * it to `[]` would tell every reader on the REST host that nobody has ever
   * reported a bug against anything.
   */
  const [solutionIssues, setSolutionIssues] = useState<SolutionIssue[] | undefined>();
  const [solutionMilestones, setSolutionMilestones] = useState<Milestone[] | undefined>();
  const [solutionTab, setSolutionTab] = useState<SolutionTab>("overview");
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const api = useApi();
  const workspace = useWorkspace(canGovern);
  const approvals = useApprovals(canGovern);
  const search = useSearch();

  useEffect(() => {
    if (user) {
      workspace.load().catch((reason) => setLoadError(errorText(reason)));
    }
  }, [user, canGovern]);

  // Loads for approvers on either view that shows the queue. "Your work" surfaces
  // items awaiting your decision, so waiting for the Approvals tab would leave that
  // section permanently empty for the people it exists for.
  useEffect(() => {
    if (canGovern && view === "requests") {
      approvals.load().catch((reason) => setError(errorText(reason)));
    }
  }, [view, canGovern]);

  // Deep links: open the engagement modal for ?need= / ?solution= params.
  useEffect(() => {
    if (!user) return;
    const params = new URLSearchParams(window.location.search);
    const needId = params.get("need");
    const solutionId = params.get("solution");
    if (needId) {
      api<Request>(`/api/requests/${needId}`)
        .then((request) => openRequest(request))
        .catch((reason) => setError(errorText(reason)));
    } else if (solutionId) {
      const tab = params.get("tab");
      const deepTab: SolutionTab = isSolutionTab(tab) ? tab : "overview";
      api<Solution>(`/api/solutions/${solutionId}`)
        .then((solution) => openSolution(solution, deepTab))
        .catch((reason) => setError(errorText(reason)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  /**
   * Keeps the address bar in step with the modal.
   *
   * `replaceState`, not `pushState`: Back should close the modal, not walk back
   * through the tabs someone clicked while it was open. The tab is part of the URL
   * because Share copies `window.location.href` verbatim — without it, sharing from
   * the Issues table sends a link that opens on Overview.
   */
  function syncModalUrl(
    kind: "need" | "solution",
    id: string | null,
    tab?: SolutionTab,
  ) {
    const url = new URL(window.location.href);
    url.searchParams.delete("need");
    url.searchParams.delete("solution");
    url.searchParams.delete("tab");
    if (id) url.searchParams.set(kind, id);
    if (id && tab && tab !== "overview") url.searchParams.set("tab", tab);
    window.history.replaceState(null, "", url.toString());
  }

  function changeSolutionTab(tab: SolutionTab) {
    setSolutionTab(tab);
    if (selectedSolution) syncModalUrl("solution", selectedSolution.id, tab);
  }

  /**
   * The idea panel's own reads, which need the id and nothing else.
   *
   * Split out of `openRequest` so `openDiscovery` can start them at the same moment
   * it asks for the record itself instead of afterwards — the two were sequential
   * only because the code was, not because either needed the other's answer.
   * Rejections are handled here, so the returned promise is always safe to await.
   */
  async function loadRequestDetail(requestId: string) {
    try {
      const [nextComments, nextActivity, nextLinkedSolutions, nextDecisions, nextProposed] =
        await Promise.allSettled([
        api<Comment[]>(`/api/requests/${requestId}/comments`),
        api<ActivityRecord[]>(`/api/requests/${requestId}/activity`),
        // Approved links only: these are ADO relations, and nothing reaches ADO before
        // a reviewer approves it. Proposals come from `/proposed` below.
        api<Solution[]>(`/api/requests/${requestId}/solutions`),
        canGovern
          ? api<AcceptanceDecision[]>(`/api/requests/${requestId}/decisions`)
          : Promise.resolve<AcceptanceDecision[]>([]),
        api<PendingLink[]>(`/api/requests/${requestId}/proposed`),
      ]);
      if (nextComments.status === "fulfilled") setRequestComments(nextComments.value);
      else setError(errorText(nextComments.reason));
      if (nextActivity.status === "fulfilled") setRequestActivity(nextActivity.value);
      else setError(errorText(nextActivity.reason));
      // Decision history is approver-only and linked solutions may 403 for a
      // reader; degrade to empty rather than surfacing the global banner.
      setLinkedSolutions(
        nextLinkedSolutions.status === "fulfilled" ? nextLinkedSolutions.value : [],
      );
      setRequestDecisions(nextDecisions.status === "fulfilled" ? nextDecisions.value : []);
      // Same degrade-to-empty as the two above: a proposal that cannot be read should
      // cost the pending row, not the panel.
      setProposedLinks(nextProposed.status === "fulfilled" ? nextProposed.value : []);
    } catch (reason) {
      setError(errorText(reason));
    }
  }

  /**
   * `loading` is the fan-out `openDiscovery` already started for this id. Passed
   * rather than remembered in a ref: the promise cannot get out of step with the
   * panel the way a flag can, and every other caller simply omits it.
   */
  async function openRequest(request: Request, loading?: Promise<void>) {
    syncModalUrl("need", request.id);
    // Only one engagement modal at a time.
    setSelectedSolution(null);
    setSolutionAdoptionOpen(false);
    setSelected(request);
    await (loading ?? loadRequestDetail(request.id));
  }

  async function runSearch(scope: DiscoveryScope = "all") {
    setView("search");
    await search.search(query, scope);
  }

  function onNavigate(next: View) {
    setView(next);
    // Auto-fetch when navigating to Ideas or Solutions views
    if (next === "ideas") {
      void search.search(query, "needs");
    } else if (next === "solutions") {
      void search.search(query, "solutions");
    }
  }

  /**
   * The solution panel's own reads. Same split as `loadRequestDetail`, and the
   * "not asked yet" reset belongs HERE rather than in `openSolution`: when the
   * fan-out is started early, a reset left behind in the opener would run after
   * these have already answered and blank the tabs they just filled.
   *
   * `fresh` says a DIFFERENT solution is arriving, which is the only time blanking
   * is right. A refresh after a mutation is looking at the same solution, and
   * blanking there removes the Issues tab from under the reader — see
   * `SolutionRefresh`.
   *
   * `only` narrows the fan-out to the lists a mutation actually changed. Activity is
   * always included: every mutation writes an activity row.
   */
  async function loadSolutionDetail(
    solutionId: string,
    options: { fresh?: boolean; only?: readonly SolutionSlice[] } = {},
  ) {
    const { fresh = false, only } = options;
    const wanted = (slice: SolutionSlice) => !only || only.includes(slice);

    if (fresh) {
      // So the previous solution's tabs cannot linger.
      setSolutionIssues(undefined);
      setSolutionMilestones(undefined);
    }
    try {
      const [
        nextNeeds,
        nextComments,
        nextActivity,
        nextAdoptions,
        nextIssues,
        nextMilestones,
      ] = await Promise.allSettled([
        // A slice nobody asked for is `null` rather than a request. Settled either
        // way, so the positions below still line up.
        wanted("requests") ? api<Request[]>(`/api/solutions/${solutionId}/requests`) : null,
        wanted("comments") ? api<Comment[]>(`/api/solutions/${solutionId}/comments`) : null,
        wanted("activity")
          ? api<ActivityRecord[]>(`/api/solutions/${solutionId}/activity`)
          : null,
        // Who is using it, not how many. The rows carry project, team, stage and
        // dates; the summary reduced all of that to a count before it was ever shown.
        wanted("use") ? api<SolutionUse[]>(`/api/solutions/${solutionId}/use`) : null,
        wanted("issues") ? api<SolutionIssue[]>(`/api/solutions/${solutionId}/issues`) : null,
        wanted("milestones")
          ? api<Milestone[]>(`/api/solutions/${solutionId}/milestones`)
          : null,
      ]);
      if (nextNeeds.status === "fulfilled") {
        if (nextNeeds.value) setLinkedNeeds(nextNeeds.value);
      } else setError(errorText(nextNeeds.reason));
      if (nextComments.status === "fulfilled") {
        if (nextComments.value) setSolutionComments(nextComments.value);
      } else setError(errorText(nextComments.reason));
      if (nextActivity.status === "fulfilled") {
        if (nextActivity.value) setSolutionActivity(nextActivity.value);
      } else setError(errorText(nextActivity.reason));
      // Degrades to the counts alone rather than banner-ing the panel.
      if (wanted("use")) {
        setSolutionAdoptions(
          nextAdoptions.status === "fulfilled" ? (nextAdoptions.value ?? []) : [],
        );
      }
      /*
       * Rejected maps to `undefined`, NOT `[]`, and deliberately never reaches
       * setError. A host that cannot serve these rejects every time — the REST host
       * 404s and the code app throws "Unsupported route" — and an absent capability
       * is not a failure. This is the same reasoning the insights branch already
       * uses; the tab simply is not offered.
       *
       * Guarded on `wanted`, and it must stay guarded: writing `undefined` for a
       * slice that was never asked for would take the Issues tab away from a reader
       * who is standing on it.
       */
      if (wanted("issues")) {
        setSolutionIssues(nextIssues.status === "fulfilled" ? (nextIssues.value ?? undefined) : undefined);
      }
      if (wanted("milestones")) {
        setSolutionMilestones(
          nextMilestones.status === "fulfilled" ? (nextMilestones.value ?? undefined) : undefined,
        );
      }
    } catch (reason) {
      setError(errorText(reason));
    }
  }

  async function openSolution(
    solution: Solution,
    tab: SolutionTab = "overview",
    loading?: Promise<void>,
  ) {
    syncModalUrl("solution", solution.id, tab);
    // Only one engagement modal at a time.
    setSelected(null);
    setSelectedSolution(solution);
    setSolutionTab(tab);
    await (loading ?? loadSolutionDetail(solution.id, { fresh: true }));
  }

  async function openDiscovery(item: DiscoveryItem) {
    // Every list row must carry an id; without one the fetch would ask for
    // /api/solutions/undefined.
    if (!item.itemId) {
      setError("That item is missing an id, so it could not be opened.");
      return;
    }
    try {
      // Person profile branch (Phase C) — placeholder for now, pending People view implementation
      if (item.source === "person") {
        // TODO: open Person profile view
        return;
      }
      /*
        The panel's reads are started HERE, alongside the record's own read, rather
        than after it returns. They only ever needed the id, which is already in
        hand — waiting for the record first made the whole panel one round trip
        deeper than it had to be for no gain.
      */
      const endpoint = item.source === "solution" ? "solutions" : "requests";
      if (item.source === "solution") {
        const loading = loadSolutionDetail(item.itemId, { fresh: true });
        const solution = await api<Solution>(`/api/${endpoint}/${item.itemId}`);
        await openSolution(solution, "overview", loading);
        return;
      }
      const loading = loadRequestDetail(item.itemId);
      const detail = await api<Request>(`/api/${endpoint}/${item.itemId}`);
      await openRequest(detail, loading);
    } catch (reason) {
      setError(errorText(reason));
    }
  }

  function beginContribution(kind: ContributionKind | null = null) {
    setContributionKind(kind);
    setContributeOpen(true);
  }

  if (!user) {
    return (
      <main className="auth-screen">
        <div className="brand-mark">C</div>
        <span className="eyebrow">Organizational capability workspace</span>
        <h1>Innovation Hub</h1>
        <p>
          Turn ideas and proven work into reusable organizational capability.
        </p>
        <a className="primary-button" href="/api/auth/login?returnTo=/">
          Sign in
        </a>
      </main>
    );
  }

  const userDisplay = user.displayName;
  const userFirst = userDisplay.split(" ")[0];
  const userInitials = userDisplay
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="workspace">
      <Topbar
        view={view}
        onNavigate={onNavigate}
        onContribute={() => beginContribution()}
        userName={userFirst}
        userInitials={userInitials}
        role={role}
        showDashboard={canGovern}
        // Only a reviewer has a queue, so for everyone else this is zero and the
        // badge and its pip are simply absent.
        pendingCount={
          canGovern ? approvals.pendingCount || workspace.state.inbox.length : 0
        }
        onSignOut={() => {
          window.location.href = "/api/auth/logout";
        }}
        query={query}
        setQuery={setQuery}
        onSearch={() => void runSearch()}
        onOpenItem={(item) => void openDiscovery(item)}
        searchBusy={search.busy}
      />
      <main
        className={
          view === "home" ? "main-content home-content" : "main-content"
        }
      >
        {(error || loadError || workspace.error || approvals.error || search.error) && (
          <div className="error-banner" role="alert">
            {error || loadError || workspace.error || approvals.error || search.error}
            <button
              onClick={() => {
                setError(null);
                setLoadError(null);
                workspace.setError(null);
                approvals.setError(null);
                search.setError(null);
              }}
              aria-label="Dismiss"
            >
              ×
            </button>
          </div>
        )}
        {view === "home" && (
          <Home
            userName={userDisplay}
            requests={workspace.state.requests}
            inbox={workspace.state.inbox}
            opportunities={workspace.state.opportunities}
            solutions={workspace.state.solutions}
            activity={workspace.state.activity}
            requestSummary={workspace.state.requestSummary}
            solutionSummary={workspace.state.solutionSummary}
            canGovern={canGovern}
            onContribute={beginContribution}
            setQuery={setQuery}
            loading={workspace.busy}
            onOpenDiscovery={(item) => void openDiscovery(item)}
            onOpenSolution={(solution) => void openSolution(solution)}
            onAdoptSolution={(item) => {
              setSolutionAdoptionOpen(true);
              void openDiscovery({ ...item, kind: "Solution", source: "solution" });
            }}
            onOpenApprovals={canGovern ? () => setView("requests") : undefined}
          />
        )}
        {view === "search" && (
          <DiscoveryView
            query={query}
            results={search.results}
            onOpen={(item) => void openDiscovery(item)}
          />
        )}
        {view === "people" && (
          <div style={{ padding: "40px", textAlign: "center" }}>
            <h2>People</h2>
            <p>Coming soon</p>
          </div>
        )}
        {view === "requests" && (
          <MyWork
            requests={workspace.state.requests}
            onOpen={openRequest}
            onContribute={beginContribution}
            onSearch={() => void runSearch()}
            loading={workspace.busy}
            // The queue lives here rather than behind its own tab: approving is work
            // you owe someone, and a separate destination is one you have to remember
            // to visit.
            approvals={
              canGovern
                ? {
                    ideas: approvals.state.ideas.length,
                    solutions: approvals.state.solutions.length,
                    links: approvals.state.links.length,
                    render: (tab) => (
                      <Approvals
                        embedded
                        activeTab={tab}
                        ideas={approvals.state.ideas}
                        solutions={approvals.state.solutions}
                        links={approvals.state.links}
                        busy={approvals.busy}
                        onOpenIdea={(item) => void openRequest(item)}
                        onOpenSolution={(item) => void openSolution(item)}
                        onDecideIdea={approvals.decideIdea}
                        onDecideSolution={approvals.decideSolution}
                        onDecideLink={approvals.decideLink}
                      />
                    ),
                  }
                : undefined
            }
          />
        )}
        {view === "dashboard" && <Dashboard />}
      </main>
      {contributeOpen && (
        <ContributeModal
          initialKind={contributionKind}
          onClose={() => {
            setContributeOpen(false);
            setContributionKind(null);
          }}
          onCreated={async () => {
            setContributeOpen(false);
            setContributionKind(null);
            await workspace.load();
          }}
        />
      )}
      {selected && (
        <RequestPanel
          request={selected}
          comments={requestComments}
          activity={requestActivity}
          linkedSolutions={linkedSolutions}
          proposedLinks={proposedLinks}
          requestSummary={workspace.state.requestSummary}
          solutionSummary={workspace.state.solutionSummary}
          role={role}
          currentUserId={user?.id ?? null}
          decisions={requestDecisions}
          onClose={() => {
            syncModalUrl("need", null);
            setSelected(null);
          }}
          onOpenSolution={openSolution}
          onRefresh={async () => {
            if (!selected) return;
            try {
              const refreshed = await api<Request>(
                `/api/requests/${selected.id}`,
              );
              await openRequest(refreshed);
              await workspace.load();
              // Keep the approvals queue and hero count in step with the decision.
              if (canGovern) void approvals.load();
            } catch (reason) {
              setError(errorText(reason));
            }
          }}
        />
      )}
      {selectedSolution && (
        <SolutionPanel
          solution={selectedSolution}
          linkedNeeds={linkedNeeds}
          comments={solutionComments}
          activity={solutionActivity}
          adoptions={solutionAdoptions}
          solutionSummary={workspace.state.solutionSummary}
          requestSummary={workspace.state.requestSummary}
          role={role}
          currentUserId={user?.id ?? null}
          issues={solutionIssues}
          milestones={solutionMilestones}
          openAdoption={solutionAdoptionOpen}
          tab={solutionTab}
          onTabChange={changeSolutionTab}
          onClose={() => {
            syncModalUrl("solution", null);
            setSolutionAdoptionOpen(false);
            setSelectedSolution(null);
          }}
          onOpenRequest={openRequest}
          onRefresh={async (changed = "solution") => {
            if (!selectedSolution) return;
            const id = selectedSolution.id;
            try {
              // The record is re-read only when it can have changed. `setSelectedSolution`
              // rather than `openSolution`: this is the same solution the reader is
              // already looking at, and re-opening it would re-sync the URL and take
              // the panel back through its arrival path for no reason.
              if (changed === "solution") {
                setSelectedSolution(await api<Solution>(`/api/solutions/${id}`));
              }
              await loadSolutionDetail(id, { only: REFRESHED_BY[changed] });
              if (CHANGES_THE_LIST.has(changed)) await workspace.load();
            } catch (reason) {
              setError(errorText(reason));
            }
          }}
        />
      )}
    </div>
  );
}
