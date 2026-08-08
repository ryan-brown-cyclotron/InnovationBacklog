import { useEffect, useMemo, useState } from "react";
import type React from "react";
import styles from "./NeedGroups.module.scss";
import type {
  DiscoveryItem,
  Solution,
  SolutionSummary,
  Visibility,
} from "../../types";
import { useApi } from "../../Hooks/useApi";
import { TagList } from "../TagList/TagList";
import { VisibilityBadge } from "../VisibilityControl/VisibilityControl";
import {
  deriveSolutionStatus,
  personName,
  relativeTime,
  statusDisplayName,
  upvoteCountLabel,
} from "../../utils";

type Filter = "all" | "open" | "with" | "without";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All ideas" },
  { id: "open", label: "Open" },
  { id: "with", label: "With solutions" },
  { id: "without", label: "Without solutions" },
];

const STAGE_VARIANT: Record<string, string> = {
  "In pilot": "stagePilot",
  Scaling: "stagePilot",
  Available: "stageAvailable",
};

type Entry =
  | { entryType: "need"; item: DiscoveryItem; momentum: number }
  | { entryType: "solution"; item: DiscoveryItem; momentum: number };

export function NeedGroups({
  needs,
  standaloneSolutions,
  solutionSummary,
  onOpenNeed,
  onOpenSolution,
  onOpenSolutionItem,
}: {
  needs: DiscoveryItem[];
  standaloneSolutions: DiscoveryItem[];
  solutionSummary: SolutionSummary;
  onOpenNeed: (item: DiscoveryItem) => void;
  onOpenSolution: (solution: Solution) => void;
  onOpenSolutionItem: (item: DiscoveryItem) => void;
}): React.ReactElement | null {
  const api = useApi();
  const [filter, setFilter] = useState<Filter>("all");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [solutionsByNeed, setSolutionsByNeed] = useState<
    Record<string, Solution[]>
  >({});

  const visibleNeeds = useMemo(
    () =>
      needs.filter((need) => {
        const linked = need.linkedSolutions ?? 0;
        switch (filter) {
          case "open":
            return (
              need.derivedStatus !== "Addressed" &&
              need.derivedStatus !== "Rejected"
            );
          case "with":
            return linked > 0;
          case "without":
            return linked === 0;
          default:
            return true;
        }
      }),
    [needs, filter],
  );

  const entries = useMemo<Entry[]>(() => {
    const merged: Entry[] = [
      ...visibleNeeds.map((item) => ({
        entryType: "need" as const,
        item,
        momentum: (item.votes30d ?? 0) * 10 + (item.voteCount ?? 0),
      })),
      ...standaloneSolutions.map((item) => ({
        entryType: "solution" as const,
        item,
        momentum: (item.adoptionCount ?? 0) * 10 + (item.teams ?? 0),
      })),
    ];
    return merged.sort((a, b) => b.momentum - a.momentum);
  }, [visibleNeeds, standaloneSolutions]);

  // Only fetch linked solutions for needs that actually have them.
  const linkedNeedIds = visibleNeeds
    .filter((need) => (need.linkedSolutions ?? 0) > 0)
    .map((need) => need.itemId)
    .join(",");

  useEffect(() => {
    if (!linkedNeedIds) return;
    let cancelled = false;
    void (async () => {
      const entries = await Promise.allSettled(
        linkedNeedIds.split(",").map(async (needId) => {
          const solutions = await api<Solution[]>(
            `/api/requests/${needId}/solutions`,
          );
          return [needId, solutions] as const;
        }),
      );
      if (cancelled) return;
      setSolutionsByNeed((prev) => {
        const next = { ...prev };
        for (const entry of entries) {
          if (entry.status === "fulfilled") next[entry.value[0]] = entry.value[1];
        }
        return next;
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [linkedNeedIds]);

  if (needs.length === 0 && standaloneSolutions.length === 0) return null;

  return (
    <div className={styles.wrap}>
      <div className={styles.toolbar}>
        <div className={styles.filters} aria-label="List filters">
          {FILTERS.map((item) => (
            <button
              key={item.id}
              className={`${styles.filter} ${filter === item.id ? styles.filterActive : ""}`}
              onClick={() => setFilter(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className={styles.sort}>Sorted by momentum</div>
      </div>

      <section className={styles.list} aria-label="Ideas and solutions">
        <div className={styles.listHead}>
          <div>Idea and linked solutions</div>
          <div>Momentum / usage</div>
          <div>Shared by</div>
          <div>Updated</div>
          <div />
        </div>

        {entries.length === 0 && (
          <div className={styles.noMatches}>Nothing matches this filter.</div>
        )}

        {entries.map((entry) =>
          entry.entryType === "need" ? (
            <NeedGroup
              key={`need-${entry.item.itemId}`}
              need={entry.item}
              solutions={solutionsByNeed[entry.item.itemId]}
              solutionSummary={solutionSummary}
              collapsed={collapsed[entry.item.itemId]}
              onToggle={(next) =>
                setCollapsed((prev) => ({ ...prev, [entry.item.itemId]: next }))
              }
              onOpenNeed={onOpenNeed}
              onOpenSolution={onOpenSolution}
            />
          ) : (
            <StandaloneSolutionRow
              key={`solution-${entry.item.itemId}`}
              item={entry.item}
              solutionSummary={solutionSummary}
              onOpen={onOpenSolutionItem}
            />
          ),
        )}
      </section>
    </div>
  );
}

function NeedGroup({
  need,
  solutions,
  solutionSummary,
  collapsed,
  onToggle,
  onOpenNeed,
  onOpenSolution,
}: {
  need: DiscoveryItem;
  solutions: Solution[] | undefined;
  solutionSummary: SolutionSummary;
  collapsed: boolean | undefined;
  onToggle: (collapsed: boolean) => void;
  onOpenNeed: (item: DiscoveryItem) => void;
  onOpenSolution: (solution: Solution) => void;
}): React.ReactElement {
  const linkedCount = need.linkedSolutions ?? 0;
  // Groups without linked solutions stay collapsed until opened.
  const isCollapsed = collapsed ?? linkedCount === 0;
  const votes = need.voteCount ?? 0;

  return (
    <article
      className={`${styles.group} ${isCollapsed ? styles.groupCollapsed : ""}`}
    >
      <div
        className={styles.needRow}
        role="button"
        tabIndex={0}
        aria-expanded={!isCollapsed}
        onClick={(event) => {
          if ((event.target as HTMLElement).closest("button, a")) return;
          onToggle(!isCollapsed);
        }}
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          if ((event.target as HTMLElement).closest("button, a")) return;
          event.preventDefault();
          onToggle(!isCollapsed);
        }}
      >
        <div className={styles.main}>
          <div className={`${styles.eyebrow} ${styles.eyebrowNeed}`}>
            <span className={styles.dot} />
            IDEA · {statusDisplayName(need.status)}
            <VisibilityBadge visibility={(need.visibility as Visibility) ?? "Everyone"} />
          </div>
          <button className={styles.needTitle} onClick={() => onOpenNeed(need)}>
            {need.title}
          </button>
          {need.description && (
            <div className={styles.desc}>{need.description}</div>
          )}
          <TagList tags={need.tags} max={4} />
        </div>
        <div className={styles.cell}>
          {votes > 0 && <strong>{upvoteCountLabel(votes)}</strong>}
          <span className={styles.linkedCount}>
            {linkedCount > 0
              ? `${linkedCount} linked solution${linkedCount === 1 ? "" : "s"}`
              : "No solutions yet"}
          </span>
        </div>
        <div className={styles.cell}>
          {need.submittedBy ? (
            <>
              <strong>{personName(need.submittedBy)}</strong>
              <span>shared this idea</span>
            </>
          ) : (
            <span>—</span>
          )}
        </div>
        <div className={styles.cell}>
          <strong>{relativeTime(need.updatedAt || need.createdAt)}</strong>
          <span>Last updated</span>
        </div>
        <button
          className={styles.chevron}
          aria-label={isCollapsed ? "Expand group" : "Collapse group"}
          onClick={() => onToggle(!isCollapsed)}
        >
          ›
        </button>
      </div>

      {!isCollapsed && (
        <div className={styles.solutions}>
          {(solutions ?? []).map((solution) => (
            <SolutionRow
              key={solution.id}
              solution={solution}
              solutionSummary={solutionSummary}
              onOpen={onOpenSolution}
            />
          ))}
          {solutions !== undefined && solutions.length === 0 && (
            <div className={styles.emptyRow}>
              <div className={styles.emptyCopy}>
                <strong>No solution has been added yet</strong>
                This idea is open for approaches, existing tools, or someone
                willing to explore it.
              </div>
              <div />
              <div>
                <button
                  className={styles.emptyAction}
                  onClick={() => onOpenNeed(need)}
                >
                  Propose a solution →
                </button>
              </div>
              <div />
              <div />
            </div>
          )}
        </div>
      )}
    </article>
  );
}

function SolutionRow({
  solution,
  solutionSummary,
  onOpen,
}: {
  solution: Solution;
  solutionSummary: SolutionSummary;
  onOpen: (solution: Solution) => void;
}): React.ReactElement {
  const summary = solutionSummary[solution.id];
  const teams = summary?.teams ?? 0;
  const adoptions = summary?.adoptions ?? solution.useCount ?? 0;
  const stage = deriveSolutionStatus({ id: solution.id }, summary);
  return (
    <div className={styles.solutionRow}>
      <div className={styles.main}>
        <div className={`${styles.eyebrow} ${styles.eyebrowSolution}`}>
          <span className={styles.dot} />
          SOLUTION · {solution.type}
          <VisibilityBadge visibility={(solution.visibility as Visibility) ?? "Everyone"} />
        </div>
        <button
          className={styles.solutionTitle}
          onClick={() => onOpen(solution)}
        >
          {solution.title}
        </button>
        {solution.description && (
          <div className={styles.desc}>{solution.description}</div>
        )}
        <TagList tags={solution.tags} max={4} />
      </div>
      <UsageCell teams={teams} adoptions={adoptions} />
      <div>
        <StageChip stage={stage} />
      </div>
      <div className={styles.cell}>
        <strong>{relativeTime(solution.updatedAt)}</strong>
        <span>Last updated</span>
      </div>
      <button
        className={styles.openLink}
        aria-label={`Open ${solution.title}`}
        onClick={() => onOpen(solution)}
      >
        →
      </button>
    </div>
  );
}

function StandaloneSolutionRow({
  item,
  solutionSummary,
  onOpen,
}: {
  item: DiscoveryItem;
  solutionSummary: SolutionSummary;
  onOpen: (item: DiscoveryItem) => void;
}): React.ReactElement {
  const summary = solutionSummary[item.itemId];
  const teams = summary?.teams ?? item.teams ?? 0;
  const adoptions = summary?.adoptions ?? item.adoptionCount ?? 0;
  const stage = deriveSolutionStatus({ id: item.itemId }, summary);
  return (
    <article className={styles.group}>
      <div
        className={`${styles.needRow} ${styles.solutionTopRow}`}
        role="button"
        tabIndex={0}
        onClick={() => onOpen(item)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onOpen(item);
          }
        }}
      >
        <div className={styles.main}>
          <div className={`${styles.eyebrow} ${styles.eyebrowSolution}`}>
            <span className={styles.dot} />
            SOLUTION · {item.subtype || item.derivedStatus || "Available"}
            <VisibilityBadge visibility={(item.visibility as Visibility) ?? "Everyone"} />
          </div>
          <button
            className={styles.needTitle}
            onClick={(event) => {
              event.stopPropagation();
              onOpen(item);
            }}
          >
            {item.title}
          </button>
          {item.description && (
            <div className={styles.desc}>{item.description}</div>
          )}
          <TagList tags={item.tags} max={4} />
        </div>
        <UsageCell teams={teams} adoptions={adoptions} />
        <div>
          <StageChip stage={stage} />
        </div>
        <div className={styles.cell}>
          <strong>{relativeTime(item.updatedAt || item.createdAt)}</strong>
          <span>Last updated</span>
        </div>
        <button
          className={styles.openLink}
          aria-label={`Open ${item.title}`}
          onClick={(event) => {
            event.stopPropagation();
            onOpen(item);
          }}
        >
          →
        </button>
      </div>
    </article>
  );
}

function UsageCell({
  teams,
  adoptions,
}: {
  teams: number;
  adoptions: number;
}): React.ReactElement {
  return (
    <div className={styles.cell}>
      {teams > 0 ? (
        <>
          <strong>
            {teams} team{teams === 1 ? "" : "s"}
          </strong>
          <span>Using now</span>
        </>
      ) : adoptions > 0 ? (
        <>
          <strong>
            {adoptions} adoption{adoptions === 1 ? "" : "s"}
          </strong>
          <span>So far</span>
        </>
      ) : (
        <span>Not adopted yet</span>
      )}
    </div>
  );
}

function StageChip({ stage }: { stage: string }): React.ReactElement {
  return (
    <span
      className={`${styles.stage} ${styles[STAGE_VARIANT[stage] ?? "stageAvailable"]}`}
    >
      {stage}
    </span>
  );
}
