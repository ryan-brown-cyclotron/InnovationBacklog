import type {
  ActivityResponseItem,
  AttachmentResponse,
  RequestResponse,
  RequestSummaryEntry,
  SolutionResponse,
  SolutionSummaryEntry,
  CommentResponse,
  SearchResponseItem,
  SolutionUseResponse,
  VoteSummaryResponse,
} from "@momentum/sdk";

export type View = "home" | "requests" | "solutions" | "search" | "approvals";

export type ContributionKind = "request" | "solution";

export type Request = RequestResponse;

export type Solution = SolutionResponse;

export type Attachment = AttachmentResponse;

export type VoteSummary = VoteSummaryResponse;

export type RequestSolution = {
  requestId: string;
  solutionId: string;
  relationship: "Proposed" | "Relevant" | "Existing";
  addedBy: string;
  addedAt: string;
};

export type SolutionUse = SolutionUseResponse;

export type Comment = CommentResponse;

export type SearchItem = SearchResponseItem;

export type SearchResult = { items: SearchItem[]; totalCount: number };

// `submittedBy` and `subtype` come from SearchItem; the rest are derived
// client-side from the workspace summaries.
export type DiscoveryItem = SearchItem & {
  kind: "Need" | "Solution";
  source: "request" | "solution";
  voteCount?: number;
  votes30d?: number;
  adoptionCount?: number;
  contributors?: number;
  linkedSolutions?: number;
  teams?: number;
  linkedNeeds?: number;
  derivedStatus?: string;
};

/** Engagement counts keyed by item id, from GET /api/requests|solutions/summary. */
export type RequestSummary = Record<string, RequestSummaryEntry>;

export type SolutionSummary = Record<string, SolutionSummaryEntry>;

/** Who may see an item. Only administrators can change it. */
export type Visibility = "Everyone" | "Approvers" | "Hidden";

export type DiscoveryScope = "all" | "needs" | "solutions";

// Raw domain record from GET /api/requests/{id}/decisions. ApproverId is a
// UserId value object and Decision an enum ordinal — normalize at render time.
export type AcceptanceDecision = {
  id: string;
  requestId: string;
  approverId: string | { value: string };
  decision: number | string;
  rationale: string;
  decidedAt: string;
};

/**
 * A proposed solution-to-idea link waiting on a reviewer.
 *
 * Declared here rather than imported: `PendingLinkResponse` exists in
 * `Momentum.Contracts/Models.cs` but TypeGen has never emitted it, so
 * `@momentum/contracts` has no such export and this package would not compile.
 * That gap is why the code-app stack derives its provider contract from generated
 * types with a compile-time field assertion — the same drift, caught rather than
 * discovered.
 *
 * Shape mirrors the C# record. Regenerating contracts should replace this.
 */
export type PendingLink = {
  requestId: string;
  requestTitle: string;
  solutionId: string;
  solutionTitle: string;
  relationship: string;
  addedBy: string;
  addedAt: string;
};

export type ParticipationRequest = {
  id: string;
  itemType: string;
  itemId: string;
  requestedBy: string;
  message: string;
  status: string;
  createdAt: string;
};

/**
 * An audit record as the API returns it. `summary` is stored evidence, not UI
 * copy — feeds phrase themselves from `action` and `resourceType`. See
 * docs/reference/glossary.md.
 */
/**
 * `actorName` is added by the adapter, not the wire.
 *
 * `actorId` is whatever the backing store keys on — a UPN on some hosts, a GUID on
 * Dataverse. Optional, so a host that only has the id omits it and callers fall back
 * to deriving a name from the key.
 */
export type ActivityRecord = ActivityResponseItem & { actorName?: string | null };

export type RequestProjection = {
  itemType: "request";
  itemId: string;
  title: string;
  state: string;
  voteCount: number;
  useCount: number;
  commentCount: number;
};

export type SolutionProjection = {
  itemType: "solution";
  itemId: string;
  title: string;
  state: string;
  voteCount: number;
  useCount: number;
  adoptedByProjects: string[];
};

export type MomentumItem = RequestProjection | SolutionProjection;

export type MomentumActivity = {
  eventId: string;
  itemType?: string;
  itemId?: string;
  actorId: string;
  actorType: string;
  kind: string;
  summary: string;
  relatedItemId?: string;
  occurredAt: string;
};

export type MomentumHome = {
  items: MomentumItem[];
  activity: MomentumActivity[];
};
