import { useCallback, useState } from "react";
import { useApi } from "./useApi";
import type { PendingLink, Request, Solution } from "../types";

export interface ApprovalsState {
  ideas: Request[];
  solutions: Solution[];
  links: PendingLink[];
}

const emptyState: ApprovalsState = { ideas: [], solutions: [], links: [] };

/**
 * The review queue: ideas, solutions, and proposed links between them.
 * Participation is not reviewed — people offering to help just join.
 */
export function useApprovals(canGovern: boolean) {
  const [state, setState] = useState<ApprovalsState>(emptyState);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const api = useApi();

  const load = useCallback(async () => {
    if (!canGovern) return;
    setBusy(true);
    setError(null);
    try {
      const [ideas, solutions, links] = await Promise.allSettled([
        api<Request[]>("/api/approvals/inbox"),
        api<Solution[]>("/api/approvals/solutions"),
        api<PendingLink[]>("/api/approvals/links"),
      ]);
      setState({
        ideas: ideas.status === "fulfilled" ? ideas.value : [],
        solutions: solutions.status === "fulfilled" ? solutions.value : [],
        links: links.status === "fulfilled" ? links.value : [],
      });
      const failures = [ideas, solutions, links]
        .filter((result) => result.status === "rejected")
        .map((result) => String((result as PromiseRejectedResult).reason));
      if (failures.length > 0) setError(failures.join("; "));
    } finally {
      setBusy(false);
    }
  }, [canGovern]);

  const decideIdea = useCallback(
    async (id: string, decision: "accept" | "reject", rationale: string) => {
      await api(`/api/requests/${id}/${decision}`, {
        method: "POST",
        body: JSON.stringify({ rationale }),
      });
      setState((prev) => ({ ...prev, ideas: prev.ideas.filter((item) => item.id !== id) }));
      void load();
    },
    [load],
  );

  const decideSolution = useCallback(
    async (id: string, decision: "accept" | "reject", rationale: string) => {
      await api(`/api/solutions/${id}/${decision}`, {
        method: "POST",
        body: JSON.stringify({ rationale }),
      });
      setState((prev) => ({
        ...prev,
        solutions: prev.solutions.filter((item) => item.id !== id),
      }));
      void load();
    },
    [load],
  );

  const decideLink = useCallback(
    async (
      requestId: string,
      solutionId: string,
      decision: "accept" | "reject",
      rationale: string,
    ) => {
      await api(`/api/requests/${requestId}/links/${solutionId}/${decision}`, {
        method: "POST",
        body: JSON.stringify({ rationale }),
      });
      setState((prev) => ({
        ...prev,
        links: prev.links.filter(
          (item) => !(item.requestId === requestId && item.solutionId === solutionId),
        ),
      }));
      void load();
    },
    [load],
  );

  const pendingCount =
    state.ideas.length + state.solutions.length + state.links.length;

  return {
    state,
    busy,
    error,
    setError,
    load,
    pendingCount,
    decideIdea,
    decideSolution,
    decideLink,
  };
}
