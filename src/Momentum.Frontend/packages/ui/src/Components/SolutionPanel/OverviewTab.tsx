import type React from "react";
import type { Milestone, MilestoneStatus } from "@innovation-backlog/logic";
import styles from "./styles";
import type { Request, RequestSummary, SearchResult, Solution } from "../../types";
import { DescriptionEditor } from "../DetailPanel/DescriptionEditor";
import { GlanceStats } from "../DetailPanel/GlanceStats";
import { LinkedItems } from "../DetailPanel/LinkedItems";
import { ResourceLinks } from "./ResourceLinks";
import { RoadmapTimeline } from "./RoadmapTimeline";
import { TagEditor } from "../TagEditor/TagEditor";
import { useApi } from "../../Hooks/useApi";
import { isIdeaItem, upvoteCountLabel } from "../../utils";

/**
 * What the solution is, laid out so substance leads.
 *
 * The grid is `1fr 380px` with the main column FIRST. The shared `.columns` this
 * replaces was `34% / 66%` — also main-first, which put the description, the linked
 * ideas and the adopters in the narrow column and the comment thread in the wide one.
 */
export function OverviewTab({
  solution,
  linkedNeeds,
  requestSummary,
  milestones,
  canEdit,
  stats,
  onOpenRequest,
  onSaveDescription,
  onSaveTags,
  onLinkIdea,
  onUnlinkIdea,
  onCreateMilestone,
  onUpdateMilestone,
  onDeleteMilestone,
}: {
  solution: Solution;
  linkedNeeds: Request[];
  requestSummary: RequestSummary;
  milestones: Milestone[] | undefined;
  canEdit: boolean;
  stats: { label: string; value: number | undefined }[];
  onOpenRequest: (request: Request) => void;
  onSaveDescription: (description: string) => Promise<void>;
  onSaveTags: (tags: string[]) => Promise<void>;
  onLinkIdea: (requestId: string) => Promise<void>;
  onUnlinkIdea: (requestId: string) => Promise<void>;
  onCreateMilestone: () => Promise<void>;
  onUpdateMilestone: (
    id: string,
    patch: { title?: string; status?: MilestoneStatus },
  ) => Promise<void>;
  onDeleteMilestone: (id: string) => Promise<void>;
}): React.ReactElement {
  const api = useApi();

  return (
    <div className={styles.overview}>
      <div className={styles.overviewMain}>
        {/* Keyed so a refresh onto another solution cannot leave a stale draft open. */}
        <DescriptionEditor
          key={solution.id}
          description={solution.description}
          canEdit={canEdit}
          onSave={onSaveDescription}
        />

        <TagEditor tags={solution.tags ?? []} canEdit={canEdit} onSave={onSaveTags} />

        <RoadmapTimeline
          milestones={milestones}
          canEdit={canEdit}
          onCreate={onCreateMilestone}
          onUpdate={onUpdateMilestone}
          onDelete={onDeleteMilestone}
        />
      </div>

      <div className={styles.overviewSide}>
        <ResourceLinks solution={solution} />

        <LinkedItems
          title="Ideas this supports"
          addLabel="+ Connect"
          emptyText="This solution is not connected to an idea yet."
          searchLabel="Search ideas to connect…"
          noResultsText="No ideas found."
          removeVerb="Disconnect"
          // Connecting is open; disconnecting is the owner's or a reviewer's.
          canUnlink={canEdit}
          items={linkedNeeds.map((need) => ({
            id: need.id,
            title: need.title,
            meta: requestSummary[need.id]?.votes
              ? upvoteCountLabel(requestSummary[need.id]!.votes)
              : "No upvotes yet",
          }))}
          // /api/search spans everyone's ideas; /api/requests is only your own.
          search={async (query) => {
            const result = await api<SearchResult>(
              `/api/search?query=${encodeURIComponent(query)}&take=10`,
            );
            const linked = new Set(linkedNeeds.map((need) => need.id));
            return result.items.filter(
              (item) => isIdeaItem(item.itemType) && !linked.has(item.itemId),
            );
          }}
          onOpen={(id) => {
            const need = linkedNeeds.find((each) => each.id === id);
            if (need) onOpenRequest(need);
          }}
          onLink={onLinkIdea}
          onUnlink={onUnlinkIdea}
        />

        <GlanceStats stats={stats} />
      </div>
    </div>
  );
}
