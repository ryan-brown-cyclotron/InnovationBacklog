import React, { useState } from "react";
import styles from "./Approvals.module.scss";
import type { PendingLink, Request, Solution } from "../../types";
import { personName, relativeTime } from "../../utils";
import { Status } from "../../Components/Status/Status";
import { ContextualEmpty } from "../../Components/Empty/Empty";
import { PageHeader } from "../../Components/PageHeader/PageHeader";
import { DecisionForm } from "../../Components/DecisionForm/DecisionForm";
import { TagList } from "../../Components/TagList/TagList";

export interface ApprovalsProps {
  ideas: Request[];
  solutions: Solution[];
  links: PendingLink[];
  busy: boolean;
  onOpenIdea: (item: Request) => void;
  onOpenSolution: (item: Solution) => void;
  onDecideIdea: (id: string, decision: "accept" | "reject", rationale: string) => Promise<void>;
  onDecideSolution: (id: string, decision: "accept" | "reject", rationale: string) => Promise<void>;
  onDecideLink: (
    requestId: string,
    solutionId: string,
    decision: "accept" | "reject",
    rationale: string,
  ) => Promise<void>;
  /**
   * Rendered inside another page, so it drops its own page header.
   *
   * The queue lives in "Your work" rather than behind its own tab — approving is
   * work you owe someone, and a separate destination is one an approver has to
   * remember to visit. The component is embedded rather than reimplemented so the
   * decision forms, the solution and link tabs, and the empty states stay in one
   * place instead of existing twice.
   */
  embedded?: boolean;
  /**
   * Which queue to show, when the host owns the tab strip.
   *
   * Inside "My Work" there is one strip covering your submissions and the review
   * queue together; a second strip nested under the first is the sloppiness this
   * removes. Uncontrolled and self-tabbed when omitted.
   *
   * `"all"` is the shared list: ideas, solutions and links in one queue under a
   * single "Approvals" tab. Splitting them into a tab each made the reviewer click
   * through three destinations to find out that two were empty — the thing they want
   * to know is "what is waiting on me", and that is one question.
   */
  activeTab?: Tab;
}

type Tab = "ideas" | "solutions" | "links" | "all";

/**
 * Everything waiting on a reviewer. Until an idea or solution is accepted it is
 * visible only to reviewers and whoever shared it, so this queue is the only way
 * it reaches the hub.
 */
export function Approvals({
  ideas,
  solutions,
  links,
  busy,
  onOpenIdea,
  onOpenSolution,
  onDecideIdea,
  onDecideSolution,
  onDecideLink,
  embedded,
  activeTab,
}: ApprovalsProps): React.ReactElement {
  const [ownTab, setOwnTab] = useState<Tab>("ideas");
  const tab = activeTab ?? ownTab;
  const total = ideas.length + solutions.length + links.length;

  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: "ideas", label: "Ideas", count: ideas.length },
    { id: "solutions", label: "Solutions", count: solutions.length },
    { id: "links", label: "Links", count: links.length },
  ];

  /*
   * In the shared list an empty queue is simply absent — three "nothing waiting"
   * panels stacked under one heading says the page failed to load, not that there is
   * no work. The single empty state below covers the genuinely-empty case.
   */
  const combined = tab === "all";
  const showIdeas = combined ? ideas.length > 0 : tab === "ideas";
  const showSolutions = combined ? solutions.length > 0 : tab === "solutions";
  const showLinks = combined ? links.length > 0 : tab === "links";

  return (
    <section>
      {!embedded && (
        <PageHeader
          title="Approvals"
          detail={`${total} item${total === 1 ? "" : "s"} awaiting a decision`}
        />
      )}
      {!activeTab && (
      <div className={styles.tabs} role="tablist">
        {tabs.map((item) => (
          <button
            key={item.id}
            role="tab"
            aria-selected={tab === item.id}
            className={tab === item.id ? styles.tabActive : styles.tab}
            onClick={() => setOwnTab(item.id)}
          >
            {item.label}
            {item.count > 0 && <span className={styles.count}>{item.count}</span>}
          </button>
        ))}
      </div>
      )}

      {combined && busy && total === 0 && <p className={styles.loading}>Loading queue…</p>}
      {combined && !busy && total === 0 && (
        <ContextualEmpty
          title="Nothing waiting on you"
          text="Ideas, solutions and proposed links appear here until a reviewer decides on them."
        />
      )}

      {showIdeas &&
        (busy && ideas.length === 0 ? (
          <p className={styles.loading}>Loading queue…</p>
        ) : ideas.length === 0 ? (
          <ContextualEmpty
            title="No ideas waiting"
            text="Newly shared ideas appear here until a reviewer accepts them."
          />
        ) : (
          <div className={styles.cards}>
            {combined && <h3 className={styles.groupLabel}>Ideas</h3>}
            {ideas.map((item) => (
              <article key={item.id} className={styles.card}>
                <header className={styles.cardHeader}>
                  <button className={styles.cardTitle} onClick={() => onOpenIdea(item)}>
                    {item.title}
                  </button>
                  <Status value={item.status} />
                </header>
                <span className={styles.cardMeta}>
                  Shared by {personName(item.submittedBy)} · {relativeTime(item.createdAt)}
                </span>
                <p className={styles.cardMessage}>{item.description}</p>
                <TagList tags={item.tags} max={5} />
                <DecisionForm
                  compact
                  onDecide={(decision, rationale) => onDecideIdea(item.id, decision, rationale)}
                />
              </article>
            ))}
          </div>
        ))}

      {showSolutions &&
        (busy && solutions.length === 0 ? (
          <p className={styles.loading}>Loading queue…</p>
        ) : solutions.length === 0 ? (
          <ContextualEmpty
            title="No solutions waiting"
            text="Shared solutions stay out of the catalog until a reviewer accepts them."
          />
        ) : (
          <div className={styles.cards}>
            {combined && <h3 className={styles.groupLabel}>Solutions</h3>}
            {solutions.map((item) => (
              <article key={item.id} className={styles.card}>
                <header className={styles.cardHeader}>
                  <button className={styles.cardTitle} onClick={() => onOpenSolution(item)}>
                    {item.title}
                  </button>
                  <span className={styles.cardType}>{item.type}</span>
                </header>
                <span className={styles.cardMeta}>
                  Shared by {personName(item.ownerId || item.repositoryOwner)} ·{" "}
                  {relativeTime(item.createdAt)}
                </span>
                <p className={styles.cardMessage}>{item.description}</p>
                <TagList tags={item.tags} max={5} />
                <div className={styles.cardLinks}>
                  {item.repositoryUrl && (
                    <a href={item.repositoryUrl} target="_blank" rel="noopener noreferrer">
                      Repository ↗
                    </a>
                  )}
                  {item.demoUrl && (
                    <a href={item.demoUrl} target="_blank" rel="noopener noreferrer">
                      Demo ↗
                    </a>
                  )}
                </div>
                <DecisionForm
                  compact
                  onDecide={(decision, rationale) => onDecideSolution(item.id, decision, rationale)}
                />
              </article>
            ))}
          </div>
        ))}

      {showLinks &&
        (busy && links.length === 0 ? (
          <p className={styles.loading}>Loading queue…</p>
        ) : links.length === 0 ? (
          <ContextualEmpty
            title="No links waiting"
            text="When someone proposes that a solution answers an idea, it appears here."
          />
        ) : (
          <div className={styles.cards}>
            {combined && <h3 className={styles.groupLabel}>Proposed links</h3>}
            {links.map((item) => (
              <article key={`${item.requestId}-${item.solutionId}`} className={styles.card}>
                <header className={styles.cardHeader}>
                  <strong className={styles.linkClaim}>
                    <span className={styles.linkSolution}>{item.solutionTitle}</span>
                    <span className={styles.linkArrow}>answers</span>
                    <span className={styles.linkIdea}>{item.requestTitle}</span>
                  </strong>
                </header>
                <span className={styles.cardMeta}>
                  Proposed as {item.relationship.toLowerCase()} by {personName(item.addedBy)} ·{" "}
                  {relativeTime(item.addedAt)}
                </span>
                <DecisionForm
                  compact
                  onDecide={(decision, rationale) =>
                    onDecideLink(item.requestId, item.solutionId, decision, rationale)
                  }
                />
              </article>
            ))}
          </div>
        ))}
    </section>
  );
}
