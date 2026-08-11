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

/** The embedded queue's own vocabulary. Only the shared list is used from here. */
type ApprovalTab = "ideas" | "solutions" | "links" | "all";
type Tab = "mine" | "approvals";

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

  const waiting = approvals
    ? approvals.ideas + approvals.solutions + approvals.links
    : 0;

  /*
   * Two tabs, and only two: what you shared, and what is waiting on you.
   *
   * This used to read "Yours / Ideas / Solutions", which named the tabs after record
   * TYPES rather than after what the reader came to do — and split one job, reviewing,
   * across two of them. A reviewer does not think "I will go and do the solutions";
   * they think "what needs a decision". The queue renders all three kinds in one
   * shared list behind the second tab.
   */
  const [tab, setTab] = React.useState<Tab>("mine");
  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: "mine", label: "My Work", count: requests.length },
    ...(approvals ? [{ id: "approvals" as const, label: "Approvals", count: waiting }] : []),
  ];

  // Reviewer status can arrive after first paint; a tab that disappears must not
  // leave the page rendering nothing.
  const active = tabs.some((item) => item.id === tab) ? tab : "mine";

  return (
    <section>
      <PageHeader
        title="My Work"
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

      {active === "approvals" && approvals?.render("all")}

      {active === "mine" &&
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
