import type { Role } from "@innovation-backlog/logic";
import type { ActivityRecord, DiscoveryItem, Request, Solution } from "./types";

/**
 * The lowercase role string this package passes around, as the domain `Role`.
 *
 * Two vocabularies for one idea: components receive `"approver"` (App.tsx lowercases it
 * and defaults to `"submitter"`), while the rules in `@innovation-backlog/logic` are
 * keyed on `"Approver"`. Every component that needed a rule has so far re-implemented it
 * as `role === "approver" || role === "administrator"` — five copies of `canReview` with
 * nothing keeping them in step.
 *
 * Anything unrecognised becomes `"Submitter"`, which is the least-privileged answer and
 * therefore the safe way to be wrong.
 */
export function asRole(role: string): Role {
  switch (role.trim().toLowerCase()) {
    case "approver":
      return "Approver";
    case "administrator":
      return "Administrator";
    default:
      return "Submitter";
  }
}

/**
 * A DiscoveryItem when all we know is which item was clicked. Openers fetch the
 * real record by id, so the rest is filler — this keeps that fact in one place
 * instead of spelling the whole contract out at every call site.
 */
export function discoveryStub(
  source: "request" | "solution",
  itemId: string,
  overrides: Partial<DiscoveryItem> = {},
): DiscoveryItem {
  return {
    itemType: source === "solution" ? "Solution" : "Request",
    itemId,
    title: "",
    description: "",
    status: "",
    canonicalSolutionId: "",
    repositoryUrl: "",
    team: "",
    createdAt: "",
    updatedAt: "",
    subtype: "",
    submittedBy: "",
    visibility: "Everyone",
    tags: [],
    kind: source === "solution" ? "Solution" : "Need",
    source,
    ...overrides,
  };
}

/**
 * Display names for stored status values. Stored values are unchanged; this is
 * presentation-only so copy can be adjusted without touching logic.
 */
export function statusDisplayName(status: string): string {
  switch (status) {
    case "Created":
      return "New";
    case "AwaitingApproval":
      return "In review";
    case "Approved":
      return "Approved";
    case "Rejected":
      return "Rejected";
    case "Published":
      return "Published";
    default:
      return status || "New";
  }
}

/**
 * Derived need status chip. Precedence is fixed:
 * Rejected > In review > Addressed > In progress > Seeking input > New.
 */
export function deriveNeedStatus(
  request: Pick<Request, "status" | "canonicalSolutionId">,
  summary?: { linkedSolutions?: number; votes?: number },
): string {
  if (request.status === "Rejected") return "Rejected";
  if (request.status === "AwaitingApproval") return "In review";
  if (request.canonicalSolutionId) return "Addressed";
  if ((summary?.linkedSolutions ?? 0) > 0) return "In progress";
  if ((summary?.votes ?? 0) > 0) return "Seeking input";
  return "New";
}

/**
 * Derived solution status chip. Precedence:
 * Scaling (3+ completed uses) > In pilot (any active use) > Available.
 */
export function deriveSolutionStatus(
  _solution: Pick<Solution, "id">,
  summary?: { activeUses?: number; completedUses?: number },
): string {
  if ((summary?.completedUses ?? 0) >= 3) return "Scaling";
  if ((summary?.activeUses ?? 0) > 0) return "In pilot";
  return "Available";
}

export function auditActorName(actorType: ActivityRecord["actorType"]): string {
  if (typeof actorType === "number")
    return ["user", "agent", "system"][actorType] ?? "system";
  return actorType.toLowerCase();
}

export function requestStatusName(status: Request["status"] | string): string {
  if (typeof status === "number")
    return [
      "Draft",
      "Created",
      "TriageRunning",
      "AwaitingApproval",
      "Accepted",
      "Rejected",
      "TriageFailed",
      "PublicationFailed",
      "ProjectionFailed",
    ][status] ?? "Unknown";
  return status;
}

/**
 * A raw record key, which is never something to show a person.
 *
 * Dataverse lookups key on GUIDs, so an unresolved actor rendered as
 * "8f3c1a2b 4d5e 6f70 …" once title-casing had run over it.
 */
const GUID =
  /^\{?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\}?$/i;

export function personName(id: string): string {
  if (!id) return "Someone";
  if (id === "dev@localhost") return "Dev";
  if (id === "anonymous") return "A contributor";
  if (id === "momentum") return "Innovation Hub";
  if (GUID.test(id)) return "Someone";
  return id
    .split("@")[0]
    .split(/[._-]/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}

export function initials(id: string): string {
  const name = personName(id);
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

/** An activity actor, named by the store when it can and derived from the key when not. */
type Actor = { actorId: string; actorName?: string | null };

export function actorLabel(record: Actor): string {
  return record.actorName?.trim() || personName(record.actorId);
}

export function actorInitials(record: Actor): string {
  const name = record.actorName?.trim();
  if (!name) return initials(record.actorId);
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

/**
 * Canonical UI label for a hub item. Code and storage say "request"; people
 * reading the screen see "Idea". See docs/reference/glossary.md.
 */
export function itemKindLabel(itemType: string | undefined): string {
  return (itemType ?? "").toLowerCase() === "solution" ? "Solution" : "Idea";
}

export function upvoteCountLabel(count: number): string {
  return `${count} upvote${count === 1 ? "" : "s"}`;
}

/**
 * Complete phrase for an audit action, in the vocabulary of
 * docs/reference/glossary.md — it follows the actor's name, as in
 * "Priya Raman upvoted an idea".
 *
 * Keyed on `Action` alone. `ResourceType` names the record that changed
 * (a "vote", a "requestSolution"), not the thing a reader cares about, so
 * pairing the two produced phrases like "linked a solution to a link".
 *
 * Audit summaries are stored evidence written for the record — including rows
 * written before this vocabulary existed — so feeds phrase themselves from the
 * stable action key rather than echoing them.
 *
 * `context` is the one narrow exception. For the solutionUse.* actions the summary
 * holds the adopting TEAM and nothing else, which is the only way the phrase can say
 * who a rollout was for. It is read through {@link adoptingTeam}, which rejects
 * anything that does not look like a team name, so a row written before adoption
 * recorded a team degrades to today's wording rather than to a dangling
 * "on behalf of ".
 */
export function activityPhrase(action: string, context?: string): string {
  const team = adoptingTeam(context);
  switch (action) {
    case "request.created":
      return "shared an idea";
    case "solution.created":
      return "shared a solution";
    case "request.accepted":
      return "approved an idea";
    case "request.rejected":
      return "rejected an idea";
    case "request.updated":
      return "edited an idea";
    case "request.canonicalSelected":
    case "request.canonicalReaffirmed":
      return "chose the answer for an idea";
    case "item.visibilityChanged":
      return "changed who can see an item";
    case "comment.added":
      return "left a comment";
    case "vote.added":
      return "upvoted an idea";
    case "vote.removed":
      return "removed an upvote";
    case "request.solutionLinked":
      return "linked a solution to an idea";
    case "request.solutionUnlinked":
      return "unlinked a solution";
    case "solutionUse.started":
      return team
        ? `started using a solution on behalf of the ${team} team`
        : "started using a solution";
    case "solutionUse.updated":
    case "solutionUse.statusChanged":
      return team
        ? `updated how the ${team} team uses a solution`
        : "updated how their team uses a solution";
    case "solutionUse.completed":
      return team ? `finished a rollout for the ${team} team` : "finished a rollout";
    // "stopped using", not "removed an adoption": the row is a tombstone, and the fact
    // worth reporting is that a team stopped, not that a record changed shape.
    case "solutionUse.withdrawn":
      return team ? `stopped using a solution for the ${team} team` : "stopped using a solution";
    case "contribution.created":
      return "asked to help";
    case "contribution.accepted":
      return "accepted a participation request";
    case "contribution.rejected":
      return "declined a participation request";
    case "contribution.withdrawn":
      return "withdrew a participation request";
    case "request.published":
      return "published an idea";
    case "solution.published":
      return "published a solution";
    case "solution.rejected":
      return "rejected a solution";
    default:
      return "made an update";
  }
}

/**
 * The adopting team carried in an adoption's audit summary, or undefined.
 *
 * Deliberately suspicious of what it is given. Every other action stores something
 * that is not a team in `summary` — a title, a rationale, a whole comment body — and
 * rows predate the convention entirely, so anything long or multi-line is treated as
 * "no team" rather than pasted into a sentence. Adoption records the team only when
 * one was supplied; a project-only adoption has no team and reads as it always did.
 */
export function adoptingTeam(summary: string | undefined | null): string | undefined {
  const value = (summary ?? "").trim();
  if (!value || value.length > 60 || /[\r\n]/.test(value)) return undefined;
  return value;
}

/**
 * Trailing clause for a row that names the item after the verb, so the team lands
 * after the title: "Ryan Brown started using <b>RFP Agent</b> on behalf of the Data
 * Platform team". Empty for every action that is not an adoption, and for adoption
 * rows with no team — see {@link adoptingTeam}.
 */
export function activitySuffixForItem(action: string, context?: string): string {
  const team = adoptingTeam(context);
  if (!team) return "";
  switch (action) {
    case "solutionUse.started":
    case "solutionUse.updated":
    case "solutionUse.statusChanged":
      return ` on behalf of the ${team} team`;
    case "solutionUse.completed":
    case "solutionUse.withdrawn":
      return ` for the ${team} team`;
    default:
      return "";
  }
}

/**
 * Transitive form of {@link activityPhrase}, for rows that name the item after
 * the verb — "Rose Nakamura upvoted <b>Stop flaky tests</b>". Use
 * activityPhrase where no title follows.
 *
 * The team is NOT folded in here: it belongs after the title, so callers append
 * {@link activitySuffixForItem} once they have rendered it.
 */
export function activityVerbForItem(action: string): string {
  switch (action) {
    case "request.created":
    case "solution.created":
      return "shared";
    case "request.accepted":
      return "approved";
    case "request.rejected":
      return "rejected";
    case "request.updated":
      return "edited";
    case "request.canonicalSelected":
    case "request.canonicalReaffirmed":
      return "chose the answer for";
    case "item.visibilityChanged":
      return "changed who can see";
    case "comment.added":
      return "commented on";
    case "vote.added":
      return "upvoted";
    case "vote.removed":
      return "removed an upvote from";
    case "request.solutionLinked":
      return "linked a solution to";
    case "request.solutionUnlinked":
      return "unlinked a solution from";
    case "solutionUse.started":
      return "started using";
    case "solutionUse.updated":
    case "solutionUse.statusChanged":
      return "updated their team's use of";
    case "solutionUse.completed":
      return "finished rolling out";
    case "solutionUse.withdrawn":
      return "stopped using";
    case "contribution.created":
      return "asked to help with";
    case "contribution.accepted":
      return "accepted a participation request on";
    case "contribution.rejected":
      return "declined a participation request on";
    case "contribution.withdrawn":
      return "withdrew a participation request on";
    default:
      return action.endsWith(".published") ? "published" : "updated";
  }
}

/**
 * Audit actions that are noise in a public feed: taking something back is not
 * progress worth announcing.
 */
export const HIDDEN_ACTIVITY_ACTIONS = new Set([
  "vote.removed",
  "request.solutionUnlinked",
  "contribution.withdrawn",
]);

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

/*
 * Two vocabularies name the same two things.
 *
 * `SearchItem.itemType` is a HubItemType — "Idea" or "Solution". Parts of this UI
 * predate that and compare against "request"/"solution", and inconsistently about
 * case. An exact comparison therefore silently drops every idea a search returns,
 * which is what emptied "Where you can contribute" while the count above it said 2.
 *
 * These accept either spelling so neither host has to lie about its own vocabulary.
 */
export function isSolutionItem(itemType?: string | null): boolean {
  return (itemType ?? "").toLowerCase().startsWith("sol");
}

/** True for an idea, under either name. Not simply the negation — blank is neither. */
export function isIdeaItem(itemType?: string | null): boolean {
  const value = (itemType ?? "").toLowerCase();
  return value === "idea" || value === "request" || value === "requests";
}

/**
 * What to actually show a person when something fails.
 *
 * `String(reason)` on an AppError yields "AppError: " plus the technical message,
 * which for a connector failure is an entire nested JSON envelope. Adapters already
 * put a human sentence on `userMessage`; this prefers it.
 *
 * Duck-typed rather than importing AppError so this stays usable for anything thrown.
 */
export function errorText(reason: unknown): string {
  if (reason && typeof reason === "object" && "userMessage" in reason) {
    const message = (reason as { userMessage?: unknown }).userMessage;
    if (typeof message === "string" && message.trim()) return message;
  }
  if (reason instanceof Error && reason.message.trim()) return reason.message;
  return String(reason);
}

export function relativeTime(value: string): string {
  const elapsedMinutes = Math.max(
    0,
    Math.floor((Date.now() - new Date(value).getTime()) / 60_000),
  );
  if (elapsedMinutes < 1) return "just now";
  if (elapsedMinutes < 60) return `${elapsedMinutes}m ago`;
  const hours = Math.floor(elapsedMinutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
