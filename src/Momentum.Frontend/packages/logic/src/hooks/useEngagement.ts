import { useCallback, useState } from "react";
import { useInvalidate, useProvider } from "../components/LogicProvider.js";
import type { Adoption, HubItemRef, VoteSummary } from "../domain/engagement.js";
import { targetKey } from "../domain/engagement.js";
import type { AsyncResource } from "./useAsyncResource.js";
import { useAsyncResource } from "./useAsyncResource.js";
import { toAppError } from "../errors/errors.js";
import type { AppError } from "../errors/errors.js";

export function useVoteSummary(target: HubItemRef | null): AsyncResource<VoteSummary | null> {
  const provider = useProvider();
  return useAsyncResource(
    target ? targetKey(target) : "",
    () => (target ? provider.engagement.getVoteSummary(target) : Promise.resolve(null)),
    { enabled: Boolean(target), invalidatedBy: ["engagement"] },
  );
}

export interface VoteToggle {
  summary: VoteSummary | null;
  loading: boolean;
  toggling: boolean;
  error: AppError | null;
  toggle: () => Promise<void>;
}

/**
 * Read plus toggle for one target.
 *
 * Applies the change optimistically and rolls back on failure. A vote is the most
 * frequent interaction in the app and the round trip is visible, so waiting for the
 * server before moving the number makes the whole surface feel unresponsive — but a
 * failure that silently leaves the wrong count on screen is worse, hence the
 * rollback and the surfaced error.
 */
export function useVoteToggle(target: HubItemRef | null): VoteToggle {
  const provider = useProvider();
  const invalidate = useInvalidate();
  const { data, loading, error, refresh } = useVoteSummary(target);

  const [optimistic, setOptimistic] = useState<VoteSummary | null>(null);
  const [toggling, setToggling] = useState(false);
  const [toggleError, setToggleError] = useState<AppError | null>(null);

  const summary = optimistic ?? data;

  const toggle = useCallback(async () => {
    if (!target || !summary || toggling) return;

    const next: VoteSummary = summary.votedByMe
      ? { ...summary, votedByMe: false, count: Math.max(0, summary.count - 1) }
      : { ...summary, votedByMe: true, count: summary.count + 1 };

    setOptimistic(next);
    setToggling(true);
    setToggleError(null);

    try {
      const confirmed = summary.votedByMe
        ? await provider.engagement.removeVote(target)
        : await provider.engagement.addVote(target);
      setOptimistic(confirmed);
      invalidate("engagement");
    } catch (caught) {
      setOptimistic(null); // fall back to the last server-confirmed value
      setToggleError(toAppError(caught));
      void refresh();
    } finally {
      setToggling(false);
    }
  }, [provider, target, summary, toggling, invalidate, refresh]);

  return { summary, loading, toggling, error: toggleError ?? error, toggle };
}

export function useAdoptions(solutionId: string | null): AsyncResource<Adoption[]> {
  const provider = useProvider();
  return useAsyncResource(
    solutionId ?? "",
    () => (solutionId ? provider.engagement.listAdoptions(solutionId) : Promise.resolve([])),
    { enabled: Boolean(solutionId), invalidatedBy: ["engagement"] },
  );
}
