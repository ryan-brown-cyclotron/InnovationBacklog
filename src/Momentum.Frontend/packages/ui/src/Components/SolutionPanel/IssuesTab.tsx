import { useState } from "react";
import type React from "react";
import {
  SOLUTION_ISSUE_STATUSES,
  isOpenIssue,
  type SolutionIssue,
  type SolutionIssueStatus,
} from "@innovation-backlog/logic";
import styles from "./SolutionPanel.module.scss";
import { Empty } from "../Empty/Empty";
import { PersonAvatar } from "../PersonAvatar/PersonAvatar";
import { errorText, personName, relativeTime } from "../../utils";
import { issueStatusLabel, issueTone } from "./solutionTone";

type Filter = "open" | "all";

/**
 * Problems people hit while using this solution.
 *
 * Inbound: anyone who can see the solution can file one, which is why "Report an
 * issue" is not gated on a role. Triage is — the status control is disabled for
 * anyone who is neither the owner nor the reporter.
 */
export function IssuesTab({
  issues,
  canTriage,
  currentUserId,
  onCreate,
  onSetStatus,
}: {
  issues: SolutionIssue[];
  /** Owner or reviewer: may move any issue between states. */
  canTriage: boolean;
  currentUserId: string | null;
  onCreate: (input: { title: string; description: string }) => Promise<void>;
  onSetStatus: (issueId: string, status: SolutionIssueStatus) => Promise<void>;
}): React.ReactElement {
  const [filter, setFilter] = useState<Filter>("open");
  const [composing, setComposing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const shown = filter === "all" ? issues : issues.filter((i) => isOpenIssue(i.status));
  const open = issues.filter((i) => isOpenIssue(i.status)).length;

  async function report(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setError(null);
    try {
      await onCreate({
        title: String(data.get("title") ?? "").trim(),
        description: String(data.get("description") ?? "").trim(),
      });
      form.reset();
      setComposing(false);
      // A new issue is Open, so it must be visible wherever the filter was.
      setFilter("open");
    } catch (cause) {
      setError(errorText(cause));
    }
  }

  return (
    <>
      <div className={styles.toolbar}>
        <span className={styles.toolbarNote}>
          {open === 0
            ? "Nothing outstanding — report anything you hit while using this."
            : `${open} open of ${issues.length}. Reported by the people using this solution.`}
        </span>
        <div className={styles.segmented} role="group" aria-label="Filter issues">
          {(["open", "all"] as Filter[]).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={filter === option}
              className={`${styles.segment} ${filter === option ? styles.segmentActive : ""}`.trim()}
              onClick={() => setFilter(option)}
            >
              {option === "open" ? "Open" : "All"}
            </button>
          ))}
        </div>
        {!composing && (
          <button
            type="button"
            className={styles.saveButton}
            onClick={() => setComposing(true)}
          >
            Report an issue
          </button>
        )}
      </div>

      <div className={styles.scroller}>
        {composing && (
          <form className={styles.issueForm} onSubmit={report}>
            <input
              name="title"
              required
              maxLength={255}
              autoFocus
              className={styles.formInput}
              placeholder="What went wrong?"
              aria-label="Issue title"
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.stopPropagation();
                  setComposing(false);
                }
              }}
            />
            <textarea
              name="description"
              rows={3}
              className={styles.formInput}
              placeholder="What did you expect, and what happened instead? (optional)"
              aria-label="Issue detail"
            />
            <div className={styles.formActions}>
              {error && (
                <span className={styles.editError} role="alert">
                  {error}
                </span>
              )}
              <button
                type="button"
                className={styles.cancelButton}
                onClick={() => setComposing(false)}
              >
                Cancel
              </button>
              <button type="submit" className={styles.saveButton}>
                Report it
              </button>
            </div>
          </form>
        )}

        {shown.length === 0 ? (
          <Empty
            text={
              filter === "open"
                ? "No open issues. Nobody has reported a problem with this."
                : "No issues have been reported against this solution."
            }
          />
        ) : (
          /*
            A real table. The mock laid this out as a grid of divs with a header row
            of bare spans, which gives assistive technology no row or column
            relationships at all. `display: block` on the table parts lets the rows
            keep their grid tracks while thead/th/td keep the semantics.
          */
          <table className={styles.issueTable}>
            <thead className={styles.issueHead}>
              <tr className={`${styles.issueRow} ${styles.issueHeadRow}`}>
                <th scope="col" className={styles.issueHeadCell}>
                  ID
                </th>
                <th scope="col" className={styles.issueHeadCell}>
                  Title
                </th>
                <th scope="col" className={styles.issueHeadCell}>
                  State
                </th>
                <th scope="col" className={`${styles.issueHeadCell} ${styles.issueAssignee}`}>
                  Assigned to
                </th>
                <th scope="col" className={`${styles.issueHeadCell} ${styles.issueUpdated}`}>
                  Updated
                </th>
              </tr>
            </thead>
            <tbody className={styles.issueBody}>
              {shown.map((issue) => (
                <IssueRow
                  key={issue.id}
                  issue={issue}
                  canTriage={canTriage}
                  currentUserId={currentUserId}
                  onSetStatus={onSetStatus}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

function IssueRow({
  issue,
  canTriage,
  currentUserId,
  onSetStatus,
}: {
  issue: SolutionIssue;
  canTriage: boolean;
  currentUserId: string | null;
  onSetStatus: (issueId: string, status: SolutionIssueStatus) => Promise<void>;
}): React.ReactElement {
  const tone = issueTone(issue.status);
  const mine =
    Boolean(currentUserId) &&
    issue.reportedBy.trim().toLowerCase() === currentUserId!.trim().toLowerCase();
  // The reporter may withdraw or reopen their own report; only triage sets "Doing".
  const editable = canTriage || mine;
  const assignee = issue.assignedToName?.trim() || issue.assignedTo;

  return (
    <tr className={`${styles.issueRow} ${styles.issueBodyRow}`}>
      <td className={`${styles.issueCell} ${styles.issueId}`}>#{issue.id}</td>
      <td className={`${styles.issueCell} ${styles.issueTitle}`} title={issue.title}>
        {issue.title}
      </td>
      <td className={styles.issueCell}>
        {editable ? (
          <select
            className={`${styles.pill} ${styles.pillSelect} ${styles[`tone${cap(tone)}`] ?? ""}`.trim()}
            value={issue.status}
            aria-label={`State for issue ${issue.id}: ${issue.title}`}
            onChange={(event) =>
              void onSetStatus(issue.id, event.target.value as SolutionIssueStatus)
            }
          >
            {SOLUTION_ISSUE_STATUSES.filter(
              (status) => canTriage || status !== "Doing",
            ).map((status) => (
              <option key={status} value={status}>
                {issueStatusLabel(status)}
              </option>
            ))}
          </select>
        ) : (
          <span className={`${styles.pill} ${styles[`tone${cap(tone)}`] ?? ""}`.trim()}>
            {issueStatusLabel(issue.status)}
          </span>
        )}
      </td>
      <td className={`${styles.issueCell} ${styles.issueAssignee}`}>
        {assignee ? (
          <>
            <PersonAvatar id={assignee} size="sm" />
            <span>{personName(assignee)}</span>
          </>
        ) : (
          <span className={styles.unassigned}>Unassigned</span>
        )}
      </td>
      <td className={`${styles.issueCell} ${styles.issueUpdated}`}>
        {relativeTime(issue.updatedAt)}
      </td>
    </tr>
  );
}

const cap = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);
