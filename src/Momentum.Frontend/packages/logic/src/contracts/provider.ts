import type { SearchQuery, SearchResult } from "../domain/search.js";
import type { ApprovalsProvider } from "./approvals-provider.js";
import type { CollaborationProvider } from "./collaboration-provider.js";
import type { EngagementProvider } from "./engagement-provider.js";
import type { EnvironmentProvider } from "./environment-provider.js";
import type { IdentityProvider } from "./identity-provider.js";
import type { InsightsProvider } from "./insights-provider.js";
import type { IdeasProvider } from "./ideas-provider.js";
import type { SolutionsProvider } from "./solutions-provider.js";

/**
 * Everything a surface can ask a backend for.
 *
 * This is the seam. `apps/web` and `apps/mcp-board` reach their backend through
 * `IService.callTool("GET:requests/123")`, which returns `unknown` and is cast
 * blind by the caller. A since-deleted SharePoint provider written against that
 * seam silently dropped comment-audience filtering and item visibility entirely,
 * and nothing failed to build. Every member here is typed end to end so the same
 * class of omission is a compile error.
 *
 * Optional members are capabilities, not conveniences. Absent means "this backend
 * has no such capability" and surfaces hide the feature; present-but-unauthorized
 * resolves degraded rather than throwing.
 */
export interface InnovationBacklogProvider {
  identity: IdentityProvider;
  ideas: IdeasProvider;
  solutions: SolutionsProvider;
  engagement: EngagementProvider;
  collaboration: CollaborationProvider;
  approvals: ApprovalsProvider;

  /** Unified search across ideas and solutions, already visibility-filtered. */
  search(query: SearchQuery): Promise<SearchResult>;

  /** Absent in providers with no per-environment configuration. */
  environment?: EnvironmentProvider;

  /**
   * Programme-level numbers for the dashboard.
   *
   * Optional because a backend that cannot compute them honestly should not: the
   * dashboard's whole premise is that every figure on it can be traced to rows.
   */
  insights?: InsightsProvider;
}
