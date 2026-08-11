/**
 * Programme-level numbers for the dashboard.
 *
 * NO WIRE GUARD, DELIBERATELY. There is no `InsightsResponse` in
 * `Momentum.Contracts/Models.cs`, so TypeGen has emitted nothing to assert against —
 * the same situation `PendingLink` is in. `/api/insights` on the .NET side returns
 * this shape by hand. Add the assertion when the record and the regenerated barrel
 * exist; do not delete this note in the meantime.
 *
 * THE RULE THIS TYPE EXISTS TO ENFORCE
 *
 * Every number here has to survive the question "where did it come from". A confident
 * `0` is indistinguishable from a real one, and that is precisely how the rollup bug
 * lived so long — so anything a host cannot actually measure is `null` and carries a
 * `*Source` string saying how the ones it CAN measure were measured. Surfaces render
 * null as "no data", never as zero.
 */

/** One bar of the lifecycle funnel. */
export interface FunnelStage {
  label: string;
  value: number;
  /** What the stage counts, for the surface to show on hover or beneath. */
  detail?: string;
}

export interface IdeaFlowInsights {
  total: number;
  submitted30d: number;
  /** The 30 days before that, so the tile can say "+9 on prior 30d". */
  submittedPrior30d: number;
}

export interface ApprovalInsights {
  /** Days from submission to decision. Null when nothing has been decided. */
  medianDays: number | null;
  p90Days: number | null;
  /** How many decided ideas the two numbers above are computed from. */
  sampleSize: number;
  /** How the durations were measured. Rendered on the tile, not hidden in a log. */
  source: string;
  /** Ideas that have waited longer than `staleAfterDays` without a decision. */
  staleCount: number;
  staleAfterDays: number;
}

export interface VoterInsights {
  /** People who have cast at least one vote. */
  distinct: number;
  totalVotes: number;
  /**
   * People who COULD vote. Null where the host cannot count its own directory —
   * the .NET side has no user list at all, so it says so rather than inventing one.
   */
  population: number | null;
  /** Where `population` came from, e.g. "enabled Dataverse users". Null with it. */
  populationSource: string | null;
  /**
   * Share of all votes cast by the ten most active voters, 0..1. Null when nobody
   * has voted — zero would claim perfect breadth over no data at all.
   */
  topTenShare: number | null;
}

/**
 * Engagement volume over the last 30 days.
 *
 * `participation` is null rather than 0 on purpose: the routes and the table exist,
 * nothing in the UI creates a row, and reporting zero would describe an empty
 * feature as an unpopular one.
 */
export interface EngagementInsights {
  votes: number;
  comments: number;
  participation: number | null;
  adoptions: number;
}

export interface SolutionInsights {
  total: number;
  /** Solutions with at least one adoption event. */
  adopted: number;
}

/**
 * One person and what they have actually done.
 *
 * `name` is resolved by the adapter where the store keys on something that is not a
 * name — Dataverse actors are systemuser GUIDs, which render as "Someone". Hosts
 * whose key is already an identity omit it and the surface derives a name from the key.
 */
export interface ContributorInsight {
  id: string;
  name?: string | null;
  ideas: number;
  votes: number;
  comments: number;
  adoptions: number;
  /** The sum, which is what the ranking is on. */
  total: number;
}

export interface Insights {
  generatedAt: string;
  ideas: IdeaFlowInsights;
  approval: ApprovalInsights;
  voters: VoterInsights;
  engagement30d: EngagementInsights;
  solutions: SolutionInsights;
  funnel: FunnelStage[];
  /** Ranked by total, highest first, already truncated by the backend. */
  contributors: ContributorInsight[];
}

/** Stage labels, shared so both hosts build the same funnel in the same order. */
export const FUNNEL_STAGES = [
  "Submitted",
  "Awaiting approval",
  "Approved",
  "Solution linked",
  "Adopted",
] as const;
