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
  MomentumItem,
  Request,
  RequestSummary,
  Solution,
  SolutionSummary,
  View,
} from "./types";
import { useApi } from "./Hooks/useApi";
import { discoveryStub, errorText, isSolutionItem } from "./utils";
import { useWorkspace } from "./Hooks/useWorkspace";
import { useApprovals } from "./Hooks/useApprovals";
import { useSearch } from "./Hooks/useSearch";
import { Topbar } from "./Components/Topbar/Topbar";
import { RequestPanel } from "./Components/RequestPanel/RequestPanel";
import { SolutionPanel } from "./Components/SolutionPanel/SolutionPanel";
import { Home } from "./Pages/Home/Home";
import { MyWork } from "./Pages/MyWork/MyWork";
import { Approvals } from "./Pages/Approvals/Approvals";
import { ContributeModal } from "./Components/ContributeModal/ContributeModal";
import { Discovery as DiscoveryView } from "./Pages/Discovery/Discovery";

type UserWithRole = AppUser & { role?: string };

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
  const [linkedNeeds, setLinkedNeeds] = useState<Request[]>([]);
  const [solutionComments, setSolutionComments] = useState<Comment[]>([]);
  const [solutionActivity, setSolutionActivity] = useState<ActivityRecord[]>([]);
  const [solutionAdoptionOpen, setSolutionAdoptionOpen] = useState(false);
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
      api<Solution>(`/api/solutions/${solutionId}`)
        .then((solution) => openSolution(solution))
        .catch((reason) => setError(errorText(reason)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  function syncModalUrl(kind: "need" | "solution", id: string | null) {
    const url = new URL(window.location.href);
    url.searchParams.delete("need");
    url.searchParams.delete("solution");
    if (id) url.searchParams.set(kind, id);
    window.history.replaceState(null, "", url.toString());
  }

  async function openRequest(request: Request) {
    syncModalUrl("need", request.id);
    // Only one engagement modal at a time.
    setSelectedSolution(null);
    setSolutionAdoptionOpen(false);
    setSelected(request);
    try {
      const [nextComments, nextActivity, nextLinkedSolutions, nextDecisions] = await Promise.allSettled([
        api<Comment[]>(`/api/requests/${request.id}/comments`),
        api<ActivityRecord[]>(`/api/requests/${request.id}/activity`),
        api<Solution[]>(`/api/requests/${request.id}/solutions`),
        canGovern
          ? api<AcceptanceDecision[]>(`/api/requests/${request.id}/decisions`)
          : Promise.resolve<AcceptanceDecision[]>([]),
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
    } catch (reason) {
      setError(errorText(reason));
    }
  }

  async function runSearch(scope: DiscoveryScope = "all") {
    setView("search");
    await search.search(query, scope);
  }

  async function openSolution(solution: Solution) {
    syncModalUrl("solution", solution.id);
    // Only one engagement modal at a time.
    setSelected(null);
    setSelectedSolution(solution);
    try {
      const [nextNeeds, nextComments, nextActivity] = await Promise.allSettled([
        api<Request[]>(`/api/solutions/${solution.id}/requests`),
        api<Comment[]>(`/api/solutions/${solution.id}/comments`),
        api<ActivityRecord[]>(`/api/solutions/${solution.id}/activity`),
      ]);
      if (nextNeeds.status === "fulfilled") setLinkedNeeds(nextNeeds.value);
      else setError(errorText(nextNeeds.reason));
      if (nextComments.status === "fulfilled") setSolutionComments(nextComments.value);
      else setError(errorText(nextComments.reason));
      if (nextActivity.status === "fulfilled") setSolutionActivity(nextActivity.value);
      else setError(errorText(nextActivity.reason));
    } catch (reason) {
      setError(errorText(reason));
    }
  }

  async function openDiscovery(item: DiscoveryItem) {
    // Every list row must carry an id; without one the fetch would ask for
    // /api/solutions/undefined.
    if (!item.itemId) {
      setError("That item is missing an id, so it could not be opened.");
      return;
    }
    try {
      const endpoint = item.source === "solution" ? "solutions" : "requests";
      if (item.source === "solution") {
        const solution = await api<Solution>(`/api/${endpoint}/${item.itemId}`);
        await openSolution(solution);
        return;
      }
      const detail = await api<Request>(`/api/${endpoint}/${item.itemId}`);
      await openRequest(detail);
    } catch (reason) {
      setError(errorText(reason));
    }
  }

  async function openMomentum(item: MomentumItem) {
    if (!item.itemId) {
      setError("That item is missing an id, so it could not be opened.");
      return;
    }
    const source = isSolutionItem(item.itemType) ? "solutions" : "requests";
    try {
      if (isSolutionItem(item.itemType)) {
        const solution = await api<Solution>(`/api/${source}/${item.itemId}`);
        await openSolution(solution);
        return;
      }
      const detail = await api<Request>(`/api/${source}/${item.itemId}`);
      await openRequest(detail);
    } catch (reason) {
      setError(errorText(reason));
      void runSearch();
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
        onHome={() => setView("home")}
        onContribute={() => beginContribution()}
        userName={userFirst}
        userInitials={userInitials}
        role={role}
        onMyWork={() => setView("requests")}
        canGovern={canGovern}
        approvalsCount={approvals.pendingCount || workspace.state.inbox.length}
        // Keeps the count badge as a signal, but the queue itself now lives on
        // "Your work" — there is no separate approvals destination to send them to.
        onApprovals={() => setView("requests")}
        onSignOut={() => {
          window.location.href = "/api/auth/logout";
        }}
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
            query={query}
            setQuery={setQuery}
            onExploreNeeds={() => void runSearch("needs")}
            onExploreSolutions={() => void runSearch("solutions")}
            busy={search.busy}
            loading={workspace.busy}
            onOpenDiscovery={(item) => void openDiscovery(item)}
            onOpenSolution={(solution) => void openSolution(solution)}
            onAdoptSolution={(item) => {
              setSolutionAdoptionOpen(true);
              void openDiscovery({ ...item, kind: "Solution", source: "solution" });
            }}
            momentum={workspace.state.momentum}
            onOpenMomentum={(item) => void openMomentum(item)}
            onOpenApprovals={canGovern ? () => setView("requests") : undefined}
          />
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
        {view === "search" && (
          <DiscoveryView
            query={query}
            results={search.results}
            onOpen={(item) => void openDiscovery(item)}
          />
        )}
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
          requestSummary={workspace.state.requestSummary}
          solutionSummary={workspace.state.solutionSummary}
          role={role}
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
          solutionSummary={workspace.state.solutionSummary}
          requestSummary={workspace.state.requestSummary}
          role={role}
          openAdoption={solutionAdoptionOpen}
          onClose={() => {
            syncModalUrl("solution", null);
            setSolutionAdoptionOpen(false);
            setSelectedSolution(null);
          }}
          onOpenRequest={openRequest}
          onRefresh={async () => {
            if (!selectedSolution) return;
            try {
              const refreshed = await api<Solution>(
                `/api/solutions/${selectedSolution.id}`,
              );
              await openSolution(refreshed);
              await workspace.load();
            } catch (reason) {
              setError(errorText(reason));
            }
          }}
        />
      )}
    </div>
  );
}
