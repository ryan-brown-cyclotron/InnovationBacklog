import type React from "react";
import styles from "./styles";
import type {
  Request,
  SearchResult,
  Solution,
  SolutionSummary,
} from "../../types";
import { DescriptionEditor } from "../DetailPanel/DescriptionEditor";
import { GlanceStats } from "../DetailPanel/GlanceStats";
import { LinkedItems } from "../DetailPanel/LinkedItems";
import { TagEditor } from "../TagEditor/TagEditor";
import { useApi } from "../../Hooks/useApi";
import { deriveSolutionStatus } from "../../utils";

/**
 * What the idea is, and what people are doing about it.
 *
 * Same `1fr 380px` grid as the solution modal's overview, and the same components
 * inside it. What differs is the nouns: an idea's linked records are the solutions
 * being tried against it, where a solution's are the ideas it answers.
 */
export function IdeaOverviewTab({
  request,
  linkedSolutions,
  solutionSummary,
  canEdit,
  stats,
  onOpenSolution,
  onSaveDescription,
  onSaveTags,
  onLink,
  onUnlink,
}: {
  request: Request;
  linkedSolutions: Solution[];
  solutionSummary: SolutionSummary;
  canEdit: boolean;
  stats: { label: string; value: number | undefined }[];
  onOpenSolution: (solution: Solution) => void;
  onSaveDescription: (description: string) => Promise<void>;
  onSaveTags: (tags: string[]) => Promise<void>;
  onLink: (solutionId: string) => Promise<void>;
  onUnlink: (solutionId: string) => Promise<void>;
}): React.ReactElement {
  const api = useApi();

  return (
    <div className={styles.overview}>
      <div className={styles.overviewMain}>
        {/* Keyed so a refresh onto another idea cannot leave a stale draft open. */}
        <DescriptionEditor
          key={request.id}
          title="About this idea"
          description={request.description}
          canEdit={canEdit}
          onSave={onSaveDescription}
        />

        <TagEditor tags={request.tags ?? []} canEdit={canEdit} onSave={onSaveTags} />

        <LinkedItems
          title="Ways people are building on this"
          addLabel="+ Add a solution"
          emptyText="Nobody has proposed a solution for this yet."
          searchLabel="Search solutions to suggest…"
          noResultsText="No solutions found."
          removeVerb="Remove"
          items={linkedSolutions.map((solution) => {
            const summary = solutionSummary[solution.id];
            const teams = summary?.teams ?? 0;
            const stage = deriveSolutionStatus({ id: solution.id }, summary);
            return {
              id: solution.id,
              title: solution.title,
              meta:
                teams > 0
                  ? `${stage} · Used by ${teams} team${teams === 1 ? "" : "s"}`
                  : stage,
            };
          })}
          search={async (query) => {
            const result = await api<SearchResult>(
              `/api/solutions?query=${encodeURIComponent(query)}&take=10`,
            );
            const linked = new Set(linkedSolutions.map((each) => each.id));
            return result.items.filter((item) => !linked.has(item.itemId));
          }}
          onOpen={(id) => {
            const solution = linkedSolutions.find((each) => each.id === id);
            if (solution) onOpenSolution(solution);
          }}
          onLink={onLink}
          onUnlink={onUnlink}
        />
      </div>

      <div className={styles.overviewSide}>
        <GlanceStats stats={stats} />
      </div>
    </div>
  );
}
