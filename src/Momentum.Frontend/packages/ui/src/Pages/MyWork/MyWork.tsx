import React from "react";
import styles from "./MyWork.module.scss";
import type { ContributionKind, Request } from "../../types";
import { requestStatusName } from "../../utils";
import { Status } from "../../Components/Status/Status";
import { ContextualEmpty, Pending } from "../../Components/Empty/Empty";
import { PageHeader } from "../../Components/PageHeader/PageHeader";
import { WorkGroup } from "../../Components/WorkGroup/WorkGroup";

export interface MyWorkProps {
  requests: Request[];
  onOpen: (item: Request) => void;
  onContribute: (kind: ContributionKind) => void;
  onSearch: () => void;
  /**
   * The review queues, for anyone who can review. Absent for everyone else.
   *
   * Counts belong to this page because it draws the tab strip; `render` keeps the
   * queue itself a black box, so no decision callback has to be threaded through
   * here just to reach it.
   */
  approvals?: {
    ideas: number;
    solutions: number;
    links: number;
    render: (tab: ApprovalTab) => React.ReactNode;
  };
  /** Still fetching. "You have not shared anything yet" is a claim, not a placeholder. */
  loading?: boolean;
}

type ApprovalTab = "ideas" | "solutions" | "links";
type Tab = "yours" | ApprovalTab;

export function MyWork({
  requests,
  onOpen,
  onContribute,
  onSearch,
  approvals,
  loading,
}: MyWorkProps): React.ReactElement {
  const attention = requests.filter(
    (item) =>
      item.status === "TriageFailed" || item.status === "PublicationFailed",
  );
  const completed = requests.filter((item) =>
    ["Accepted", "Published", "Rejected"].includes(
      requestStatusName(item.status),
    ),
  );
  const progress = requests.filter(
    (item) => !attention.includes(item) && !completed.includes(item),
  );

  /*
   * One strip, yours first.
   *
   * The review queue used to render above the work groups with its own tab strip, so
   * the page stacked two unrelated lists and two rows of tabs with nothing saying
   * where one ended and the other began. These are peers — things that want your
   * attention — so they are peers in the navigation too.
   */
  const [tab, setTab] = React.useState<Tab>("yours");
  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: "yours", label: "Yours", count: requests.length },
    ...(approvals
      ? [
          { id: "ideas" as const, label: "Ideas", count: approvals.ideas },
          { id: "solutions" as const, label: "Solutions", count: approvals.solutions },
          /*
           * Only when something is actually pending.
           *
           * Ideas and solutions keep their tab while empty because "no ideas waiting"
           * is real news. A proposed link is not: on hosts where only a reviewer can
           * link a solution to an idea, the person creating it is the person who would
           * approve it, so nothing is ever pending and the tab was a permanent dead
           * end. Hosts that do queue links still get it the moment one arrives.
           */
          ...(approvals.links > 0
            ? [{ id: "links" as const, label: "Links", count: approvals.links }]
            : []),
        ]
      : []),
  ];

  // Reviewer status can arrive after first paint; a tab that disappears must not
  // leave the page rendering nothing.
  const active = tabs.some((item) => item.id === tab) ? tab : "yours";

  const waiting = approvals
    ? approvals.ideas + approvals.solutions + approvals.links
    : 0;

  return (
    <section>
      <PageHeader
        title="Your work"
        detail={
          waiting > 0
            ? `${requests.length} shared · ${waiting} awaiting your decision`
            : `${requests.length} item${requests.length === 1 ? "" : "s"} shared`
        }
      />

      {tabs.length > 1 && (
        <div className={styles.tabs} role="tablist">
          {tabs.map((item) => (
            <button
              key={item.id}
              role="tab"
              aria-selected={active === item.id}
              className={active === item.id ? styles.tabActive : styles.tab}
              onClick={() => setTab(item.id)}
            >
              {item.label}
              {item.count > 0 && <span className={styles.count}>{item.count}</span>}
            </button>
          ))}
        </div>
      )}

      {active !== "yours" && approvals?.render(active)}

      {active === "yours" &&
        (loading && requests.length === 0 ? (
        <Pending text="Loading your work…" />
      ) : requests.length === 0 ? (
        <div className={styles.workEmpty}>
          <ContextualEmpty
            title="You have not shared anything yet."
            text="Innovation Hub turns ideas and existing solutions into reusable capabilities."
          />
          <div className={styles.emptyActions}>
            <button
              className={styles.primaryButton}
              onClick={() => onContribute("request")}
            >
              Share an idea
            </button>
            <button
              className={styles.secondaryButton}
              onClick={() => onContribute("solution")}
            >
              Share a solution
            </button>
          </div>
          <div className={styles.textLinks}>
            <button onClick={onSearch}>Explore connected work →</button>
          </div>
        </div>
      ) : (
        <div className={styles.workGroups}>
          {attention.length > 0 && (
            <WorkGroup
              title="Needs your attention"
              items={attention}
              onOpen={onOpen}
            />
          )}
          {progress.length > 0 && (
            <WorkGroup title="In progress" items={progress} onOpen={onOpen} />
          )}
          {completed.length > 0 && (
            <WorkGroup
              title="Recently completed"
              items={completed}
              onOpen={onOpen}
            />
          )}
        </div>
        ))}
    </section>
  );
}
