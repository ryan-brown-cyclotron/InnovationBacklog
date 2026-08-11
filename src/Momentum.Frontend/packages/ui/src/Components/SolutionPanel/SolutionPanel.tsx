import { useEffect, useState } from "react";
import type React from "react";
import { modalStyles as styles } from "../Modal/ModalShell";
import { ModalShell } from "../Modal/ModalShell";
import type {
  ActivityRecord,
  Comment,
  Request,
  RequestSummary,
  SearchItem,
  SearchResult,
  Solution,
  SolutionSummary,
  SolutionUse,
  Visibility,
} from "../../types";
import { useApi } from "../../Hooks/useApi";
import { CommentComposer } from "../CommentComposer/CommentComposer";
import { DecisionForm } from "../DecisionForm/DecisionForm";
import { OverlayPane } from "../OverlayPane/OverlayPane";
import { TagList } from "../TagList/TagList";
import {
  VisibilityBadge,
  VisibilityControl,
} from "../VisibilityControl/VisibilityControl";
import { TimelineItems } from "../TimelineItems/TimelineItems";
import {
  deriveSolutionStatus,
  isIdeaItem,
  personName,
  relativeTime,
  upvoteCountLabel,
} from "../../utils";

export function SolutionPanel({
  solution,
  linkedNeeds,
  comments,
  activity,
  adoptions = [],
  solutionSummary,
  requestSummary,
  role,
  openAdoption = false,
  onClose,
  onOpenRequest,
  onRefresh,
}: {
  solution: Solution;
  linkedNeeds: Request[];
  comments: Comment[];
  activity: ActivityRecord[];
  /** The adoption rows themselves. Empty when the host could not read them. */
  adoptions?: SolutionUse[];
  solutionSummary: SolutionSummary;
  requestSummary: RequestSummary;
  role: string;
  openAdoption?: boolean;
  onClose: () => void;
  onOpenRequest: (request: Request) => void;
  onRefresh: () => Promise<void>;
}): React.ReactElement {
  const api = useApi();
  const [connectOpen, setConnectOpen] = useState(false);
  const [linkQuery, setLinkQuery] = useState("");
  const [linkResults, setLinkResults] = useState<SearchItem[]>([]);
  const [linkBusy, setLinkBusy] = useState(false);
  const [adoptBusy, setAdoptBusy] = useState(false);
  // One overlay pane at a time, layered over the modal.
  const [pane, setPane] = useState<"adopt" | "visibility" | "decision" | null>(
    openAdoption ? "adopt" : null,
  );

  useEffect(() => {
    if (openAdoption) setPane("adopt");
  }, [openAdoption]);

  const summary = solutionSummary[solution.id];
  // The rows are the truth when they arrived; the rollup is the fallback, and the two
  // are computed from the same table so they cannot disagree about how many there are.
  const adoptionCount = adoptions.length || summary?.adoptions || solution.useCount || 0;
  const teams = summary?.teams ?? distinctTeams(adoptions);
  const stage = deriveSolutionStatus({ id: solution.id }, summary);

  async function addComment(draft: {
    body: string;
    audience: string;
    attachmentIds: string[];
  }) {
    await api(`/api/solutions/${solution.id}/comments`, {
      method: "POST",
      body: JSON.stringify({ ...draft, subjectType: "Solution" }),
    });
    await onRefresh();
  }

  async function linkNeed(requestId: string) {
    await api(`/api/requests/${requestId}/link`, {
      method: "POST",
      body: JSON.stringify({ solutionId: solution.id }),
    });
    setLinkQuery("");
    setLinkResults([]);
    setConnectOpen(false);
    await onRefresh();
  }

  async function unlinkNeed(requestId: string) {
    await api(`/api/requests/${requestId}/unlink`, {
      method: "POST",
      body: JSON.stringify({ solutionId: solution.id }),
    });
    await onRefresh();
  }

  async function recordAdoption(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setAdoptBusy(true);
    try {
      await api(`/api/solutions/${solution.id}/use`, {
        method: "POST",
        body: JSON.stringify({
          projectName: data.get("projectName"),
          team: data.get("team") || undefined,
          status: data.get("status") || "Exploring",
        }),
      });
      form.reset();
      setPane(null);
      await onRefresh();
    } finally {
      setAdoptBusy(false);
    }
  }

  useEffect(() => {
    if (!linkQuery.trim()) {
      setLinkResults([]);
      return;
    }
    const handle = setTimeout(async () => {
      setLinkBusy(true);
      try {
        // /api/search spans everyone's ideas; /api/requests is only your own.
        const result = await api<SearchResult>(
          `/api/search?query=${encodeURIComponent(linkQuery)}&take=10`,
        );
        const linkedIds = new Set(linkedNeeds.map((need) => need.id));
        setLinkResults(
          result.items.filter(
            (item) => isIdeaItem(item.itemType) && !linkedIds.has(item.itemId),
          ),
        );
      } catch {
        setLinkResults([]);
      } finally {
        setLinkBusy(false);
      }
    }, 250);
    return () => clearTimeout(handle);
  }, [linkQuery, linkedNeeds]);

  const metaParts: string[] = [];
  if (solution.ownerId) metaParts.push(`Shared by ${personName(solution.ownerId)}`);
  metaParts.push(solution.type);
  metaParts.push(`Updated ${relativeTime(solution.updatedAt)}`);

  const visibility = (solution.visibility as Visibility) ?? "Everyone";
  const canReview =
    (role === "approver" || role === "administrator") &&
    solution.status === "AwaitingApproval";

  return (
    <ModalShell
      eyebrow={`SOLUTION · ${stage}`}
      badge={<VisibilityBadge visibility={visibility} />}
      tone="solution"
      title={solution.title}
      meta={metaParts.join(" · ")}
      onClose={onClose}
      primaryAction={
        <>
          {canReview && (
            <button
              className={styles.primaryButton}
              onClick={() => setPane("decision")}
            >
              Review
            </button>
          )}
          <button className={styles.primaryButton} onClick={() => setPane("adopt")}>
            Start using this
          </button>
          {role === "administrator" && (
            <button
              className={styles.ghostButton}
              onClick={() => setPane("visibility")}
            >
              Who can see this
            </button>
          )}
        </>
      }
    >
      <OverlayPane
        title="Start using this"
        detail="Recording who uses a solution is how the hub knows what is working."
        open={pane === "adopt"}
        onClose={() => setPane(null)}
      >
        <form className={styles.adoptForm} onSubmit={recordAdoption}>
          <input
            name="projectName"
            required
            placeholder="Project or team name"
            className={styles.adoptInput}
            aria-label="Project name"
          />
          <input
            name="team"
            placeholder="Team (optional)"
            className={styles.adoptInput}
            aria-label="Team"
          />
          <select
            name="status"
            defaultValue="Exploring"
            className={styles.adoptInput}
            aria-label="Adoption status"
          >
            <option value="Exploring">Exploring</option>
            <option value="Implementing">Implementing</option>
            <option value="Using">Using</option>
          </select>
          <div className={styles.adoptActions}>
            <button
              type="button"
              className={styles.adoptCancel}
              onClick={() => setPane(null)}
            >
              Cancel
            </button>
            <button
              type="submit"
              className={styles.adoptSubmit}
              disabled={adoptBusy}
            >
              {adoptBusy ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </OverlayPane>

      <OverlayPane
        title="Who can see this"
        detail="Administrators decide who this solution is visible to."
        open={pane === "visibility"}
        onClose={() => setPane(null)}
      >
        <VisibilityControl
          itemType="solutions"
          itemId={solution.id}
          visibility={visibility}
          onChanged={onRefresh}
        />
      </OverlayPane>

      <OverlayPane
        title="Review this solution"
        detail="Until it is accepted, only reviewers and the person who shared it can see it."
        open={pane === "decision"}
        onClose={() => setPane(null)}
      >
        <DecisionForm
          onDecide={async (decision, rationale) => {
            await api(`/api/solutions/${solution.id}/${decision}`, {
              method: "POST",
              body: JSON.stringify({ rationale }),
            });
            setPane(null);
            await onRefresh();
          }}
        />
      </OverlayPane>

      <div className={styles.columns}>
        <div className={styles.mainCol}>
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>What it does</h3>
            <p className={styles.bodyText}>{solution.description}</p>
            <TagList tags={solution.tags} />
          </section>

          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Ideas this supports</h3>
            {linkedNeeds.length === 0 ? (
              <p className={styles.emptyText}>
                This solution is not connected to an idea yet.
              </p>
            ) : (
              <>
                <p className={styles.sectionHint}>
                  Connected to:
                </p>
                <ul className={styles.rowList}>
                  {linkedNeeds.map((need) => {
                    const upvotes = requestSummary[need.id]?.votes ?? 0;
                    return (
                      <li key={need.id}>
                        <div className={styles.rowItem}>
                          <button
                            className={styles.rowMain}
                            style={{
                              border: 0,
                              background: "transparent",
                              cursor: "pointer",
                              textAlign: "left",
                              padding: 0,
                            }}
                            onClick={() => onOpenRequest(need)}
                          >
                            <span className={styles.rowTitle}>{need.title}</span>
                            <span className={styles.rowMeta}>
                              {upvotes > 0 ? upvoteCountLabel(upvotes) : "No upvotes yet"}
                            </span>
                          </button>
                          <button
                            className={styles.rowRemove}
                            onClick={() => void unlinkNeed(need.id)}
                            aria-label={`Remove ${need.title}`}
                            title="Remove"
                          >
                            ×
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
            {!connectOpen ? (
              <button
                className={styles.actionLink}
                onClick={() => setConnectOpen(true)}
              >
                Connect another idea →
              </button>
            ) : (
              <div className={styles.linkSearch}>
                <input
                  type="text"
                  value={linkQuery}
                  onChange={(e) => setLinkQuery(e.target.value)}
                  placeholder="Search ideas to connect…"
                  className={styles.linkInput}
                  aria-label="Search ideas to connect"
                  autoFocus
                />
                {linkBusy && <span className={styles.linkBusy}>Searching…</span>}
                {linkResults.length > 0 && (
                  <ul className={styles.linkResults}>
                    {linkResults.map((item) => (
                      <li key={item.itemId}>
                        <button
                          className={styles.linkResultItem}
                          onClick={() => void linkNeed(item.itemId)}
                        >
                          {item.title}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {!linkBusy && linkQuery.trim() && linkResults.length === 0 && (
                  <span className={styles.linkBusy}>No ideas found.</span>
                )}
              </div>
            )}
          </section>

          {(solution.repositoryUrl || solution.demoUrl) && (
            <section className={styles.section}>
              <h3 className={styles.sectionTitle}>Resources</h3>
              <ul className={styles.resourceList}>
                {solution.demoUrl && (
                  <li>
                    <a
                      href={solution.demoUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <span className={styles.resourceName}>Demo</span>
                      <span className={styles.resourceValue}>
                        {demoLinkLabel(solution.demoUrl)} ↗
                      </span>
                    </a>
                  </li>
                )}
                {solution.repositoryUrl && (
                  <li>
                    <a
                      href={solution.repositoryUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <span className={styles.resourceName}>Repository</span>
                      <span className={styles.resourceValue}>
                        {solution.repositoryOwner}/{solution.repositoryName} ↗
                      </span>
                    </a>
                  </li>
                )}
              </ul>
            </section>
          )}
          {(adoptionCount > 0 || teams > 0 || adoptions.length > 0) && (
            <section className={styles.section}>
              <h3 className={styles.sectionTitle}>Who is using this</h3>
              <p className={styles.sectionHint}>{adoptionHeadline(adoptionCount, teams)}</p>
              {/*
                The rows, not the tally. Someone deciding whether to adopt this wants
                to see the other adopters — which team, on what, how far along, and
                whether anyone finished — and every one of those facts was already in
                the response that produced the number above it.
              */}
              {adoptions.length > 0 && (
                <ul className={styles.adoptionList}>
                  {adoptions.map((use) => (
                    <AdoptionRow key={use.id} use={use} />
                  ))}
                </ul>
              )}
            </section>
          )}
        </div>

        <div className={styles.sideCol}>
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Conversation and progress</h3>
            <div className={styles.timeline}>
              <TimelineItems
                comments={comments}
                activity={activity}
                emptyText="No updates yet — share feedback, ask a question, or tell others how your team is using it."
              />
            </div>
            <CommentComposer
              placeholder="Share feedback or an update"
              onSubmit={addComment}
            />
          </section>
        </div>
      </div>
    </ModalShell>
  );
}

/**
 * One adopter.
 *
 * The team leads, because "who else is doing this" is the question the list answers;
 * the project is what they are doing it on. An adoption with no team names the project
 * in the same position rather than reading "— · Northwind RFP response", which is the
 * same shape the rollup uses when it counts DISTINCT `team ?? projectName`.
 */
function AdoptionRow({ use }: { use: SolutionUse }): React.ReactElement {
  const who = use.startedByName?.trim() || personName(use.startedBy);
  const heading = use.team?.trim() || use.projectName || "A team";
  const detail = use.team?.trim() && use.projectName ? use.projectName : "";
  const settled = Boolean(use.completedAt);

  return (
    <li className={styles.adoptionRow}>
      <div className={styles.adoptionMain}>
        <span className={styles.adoptionWho}>
          {heading}
          {detail && <span className={styles.adoptionProject}> · {detail}</span>}
        </span>
        <span className={styles.adoptionMeta}>
          {settled
            ? `Rolled out ${relativeTime(use.completedAt)} · started by ${who}`
            : `Started ${relativeTime(use.startedAt)} by ${who}`}
        </span>
      </div>
      <span
        className={`${styles.adoptionStage} ${settled ? styles.adoptionStageDone : ""}`}
      >
        {settled ? "Rolled out" : use.status || "Exploring"}
      </span>
    </li>
  );
}

/** "Used by 3 teams · 4 adoptions", without repeating itself when they are equal. */
function adoptionHeadline(adoptions: number, teams: number): string {
  const uses = `${adoptions} adoption${adoptions === 1 ? "" : "s"}`;
  if (teams <= 0) return uses;
  const across = `${teams} team${teams === 1 ? "" : "s"}`;
  return teams === adoptions ? `Used by ${across}` : `Used by ${across} · ${uses}`;
}

/**
 * Distinct `team ?? projectName`, case-insensitively — the same rule the rollup uses,
 * so a panel that fell back to counting rows itself still says the same number.
 */
function distinctTeams(adoptions: SolutionUse[]): number {
  const seen = new Set<string>();
  for (const use of adoptions) {
    const label = (use.team || use.projectName || "").trim().toLowerCase();
    if (label) seen.add(label);
  }
  return seen.size;
}

/** Host and path of a demo link, so the row stays readable. */
function demoLinkLabel(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.host}${parsed.pathname === "/" ? "" : parsed.pathname}`;
  } catch {
    return url;
  }
}
