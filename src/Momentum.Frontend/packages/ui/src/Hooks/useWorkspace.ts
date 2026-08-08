import { useCallback, useState } from "react";
import { useApi } from "./useApi";
import type { Request, Solution, SearchResult, ActivityRecord, MomentumHome, RequestSummary, SolutionSummary } from "../types";
import { errorText } from "../utils";

export interface WorkspaceState {
  requests: Request[];
  opportunities: SearchResult;
  solutions: SearchResult;
  inbox: Request[];
  activity: ActivityRecord[];
  momentum: MomentumHome;
  requestSummary: RequestSummary;
  solutionSummary: SolutionSummary;
}

const emptyState: WorkspaceState = {
  requests: [],
  opportunities: { items: [], totalCount: 0 },
  solutions: { items: [], totalCount: 0 },
  inbox: [],
  activity: [],
  momentum: { items: [], activity: [] },
  requestSummary: {},
  solutionSummary: {},
};

export function useWorkspace(canGovern: boolean) {
  const [state, setState] = useState<WorkspaceState>(emptyState);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const api = useApi();

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const [
        requestsResult,
        opportunitiesResult,
        solutionsResult,
        inboxResult,
        activityResult,
        requestSummaryResult,
        solutionSummaryResult,
      ] = await Promise.allSettled([
        api<Request[]>("/api/requests"),
        api<SearchResult>("/api/search?query=&take=50"),
        api<SearchResult>("/api/solutions?query=&take=50"),
        canGovern ? api<Request[]>("/api/approvals/inbox") : Promise.resolve([]),
        api<ActivityRecord[]>("/api/activity?take=50"),
        api<RequestSummary>("/api/requests/summary"),
        api<SolutionSummary>("/api/solutions/summary"),
      ]);

      const nextState: WorkspaceState = {
        ...emptyState,
      };
      const errors: string[] = [];

      if (requestsResult.status === "fulfilled") {
        nextState.requests = requestsResult.value;
      } else {
        errors.push(String(requestsResult.reason));
      }

      if (opportunitiesResult.status === "fulfilled") {
        nextState.opportunities = opportunitiesResult.value;
      } else {
        errors.push(String(opportunitiesResult.reason));
      }

      if (solutionsResult.status === "fulfilled") {
        nextState.solutions = solutionsResult.value;
      } else {
        errors.push(String(solutionsResult.reason));
      }

      if (inboxResult.status === "fulfilled") {
        nextState.inbox = inboxResult.value;
      } else {
        errors.push(String(inboxResult.reason));
      }

      // The feed and the engagement counts are decoration: a failure here should
      // not put a banner over a workspace that otherwise loaded.
      if (activityResult.status === "fulfilled") {
        nextState.activity = activityResult.value;
      }
      if (requestSummaryResult.status === "fulfilled") {
        nextState.requestSummary = requestSummaryResult.value;
      }
      if (solutionSummaryResult.status === "fulfilled") {
        nextState.solutionSummary = solutionSummaryResult.value;
      }

      setState(nextState);
      if (errors.length > 0) {
        setError(errors.join("; "));
      }
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      setBusy(false);
    }
  }, [canGovern]);

  const loadRequests = useCallback(async () => {
    const requests = await api<Request[]>("/api/requests");
    setState((prev) => ({ ...prev, requests }));
  }, []);

  return { state, busy, error, setError, load, loadRequests };
}
