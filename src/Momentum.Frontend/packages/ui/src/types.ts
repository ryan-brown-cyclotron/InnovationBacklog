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

export type View =
  | "home"
  | "requests"
  | "ideas"
  | "solutions"
  | "people"
  | "search"
  | "approvals"
  | "dashboard";

export type ContributionKind = "request" | "solution";

export type Request = RequestResponse;

export type Solution = SolutionResponse;

/**
 * `url` is added by the adapter, not the wire.
 *
 * The .NET host keeps attachments in its own store and serves them from
 * `/api/attachments/{id}`, so it has no url to give. The code app's are native Azure
 * DevOps work item attachments living on `dev.azure.com`, which that route cannot
 * reach — so a host that knows where the file is says so, and the rest fall back.
 */
export type Attachment = AttachmentResponse & { url?: string | null };

export type VoteSummary = VoteSummaryResponse;

export type RequestSolution = {
  requestId: string;
  solutionId: string;
  relationship: "Proposed" | "Relevant" | "Existing";
  addedBy: string;
  addedAt: string;
};

/**
 * `startedByName` is added by the adapter, not the wire — see `ActivityRecord`.
 *
 * `startedBy` is whatever the store keys on: a UserId on the .NET side, a Dataverse
 * systemuser GUID in the code app. A GUID has no name in it, so the host that can
 * resolve one says so and the rest fall back to deriving it from the key.
 */
/**
 * `startedByName` and `startedByMe` are added by the adapter, not the wire.
 *
 * `startedByMe` is the only way this package can know whose adoption a row is: the id on
 * the row and `currentUserId` come from two different stores and never match. Optional,
 * so a host that does not answer it leaves every row read-only rather than editable —
 * the safe direction for a permission flag.
 */
export type SolutionUse = SolutionUseResponse & {
  startedByName?: string | null;
  startedByMe?: boolean;
};

/** Same as the wire, except its attachments may know where they live. */
export type Comment = Omit<CommentResponse, "attachments"> & {
  attachments: Attachment[];
};

export type SearchItem = SearchResponseItem;

export type SearchResult = { items: SearchItem[]; totalCount: number };

// `submittedBy` and `subtype` come from SearchItem; the rest are derived
// client-side from the workspace summaries.
export type DiscoveryItem = SearchItem & {
  kind: "Need" | "Solution" | "Person";
  source: "request" | "solution" | "person";
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

/**
 * Programme-level figures from GET /api/insights.
 *
 * Declared here rather than imported, for the same reason `PendingLink` is:
 * `InsightsResponse` exists in `Momentum.Contracts/Models.cs` and is marked for
 * export, but TypeGen has not been re-run, so `@momentum/contracts` has no such
 * type yet and this package would not compile. Shape mirrors the C# record.
 * Regenerating contracts should replace this block with an import.
 *
 * THE NULLS ARE LOAD-BEARING. A figure a backend cannot measure is null, and the
 * page renders that as "no data" rather than as zero — a confident zero is
 * indistinguishable from a real one.
 */
export type Insights = {
  generatedAt: string;
  ideas: { total: number; submitted30d: number; submittedPrior30d: number };
  approval: {
    medianDays: number | null;
    p90Days: number | null;
    sampleSize: number;
    source: string;
    staleCount: number;
    staleAfterDays: number;
  };
  voters: {
    distinct: number;
    totalVotes: number;
    population: number | null;
    populationSource: string | null;
    topTenShare: number | null;
  };
  engagement30d: {
    votes: number;
    comments: number;
    participation: number | null;
    adoptions: number;
  };
  solutions: { total: number; adopted: number };
  funnel: { label: string; value: number; detail?: string }[];
  /** Ranked highest-first, already truncated by the backend. */
  contributors: {
    id: string;
    name?: string | null;
    ideas: number;
    votes: number;
    comments: number;
    adoptions: number;
    total: number;
  }[];
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

/*
  MomentumItem / MomentumHome / the two projections used to live here, feeding
  SpotlightCard on Home.

  They are gone because nothing ever produced them: there is no /momentum endpoint in
  the .NET API, no momentum route in the code app's callTool, and useWorkspace never
  fetched one — so `momentum.items` was permanently empty and the card had never
  rendered in either host. Its styling now lives in ActivitySplit's featured carousel,
  which shows real solutions ranked by real engagement.
*/
