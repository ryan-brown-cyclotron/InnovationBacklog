import { getContext } from "@microsoft/power-apps/app";
import { getClient } from "@microsoft/power-apps/data";
import { AppError, createMemoryProvider } from "@innovation-backlog/logic";
import type { InnovationBacklogProvider, Role } from "@innovation-backlog/logic";

// Seed the registry with the generated set. Generated service classes call
// getClient(dataSourcesInfo) at class-static scope, so whichever runs first fixes
// the global registry for the whole app — passing the same object here means the
// two can never disagree, whatever the import order turns out to be.
import { dataSourcesInfo } from "../../.power/schemas/appschemas/dataSourcesInfo.js";

import { withActivity } from "./activity-recorder.js";
import { createActivityWriter } from "./dataverse/activity-writer.js";
import { createEnvironmentReader } from "./environment.js";
import { createIdentityProvider } from "./dataverse/identity.js";
import { createEngagementProvider } from "./dataverse/engagement.js";
import { createCollaborationProvider } from "./dataverse/collaboration.js";
import { createRollupReader } from "./dataverse/rollups.js";
import { createAdoClient } from "./ado/client.js";
import { createCommentsApi } from "./ado/comments.js";
import { createRoleResolver } from "./ado/role.js";
import {
  createApprovalsProvider,
  createIdeasProvider,
  createSearch,
  createSolutionsProvider,
} from "./ado/items.js";

/**
 * The code app adapter.
 *
 * One adapter, not two. Dataverse tables and the Azure DevOps connector are both
 * reached through the same `getClient` registry, so splitting them into separate
 * adapters would fight the SDK rather than follow it — and the interesting
 * operations need both at once (an idea is an ADO work item joined to a Dataverse
 * engagement rollup). They are separate folders inside one adapter instead.
 *
 * Built at module scope, once per app load: the SDK caches one global data-sources
 * context from the FIRST getClient() call, and every later call returns a client
 * bound to it.
 */

export interface CodeAppProviderOptions {
  /**
   * Override role resolution. Omit it and the role is derived from effective
   * area-path permissions — see `ado/role.ts`.
   */
  resolveRole?: () => Promise<Role>;
}

export function createCodeAppProvider(
  options: CodeAppProviderOptions = {},
): InnovationBacklogProvider {
  let client;
  try {
    client = getClient(dataSourcesInfo as unknown as Parameters<typeof getClient>[0]);
  } catch (cause) {
    // A pre-data failure should be a classified error the boundary can render, not
    // an opaque crash on a blank page.
    throw new AppError("The app could not reach Power Platform data services.", {
      category: "init",
      cause,
    });
  }

  const environment = createEnvironmentReader(
    client as unknown as Parameters<typeof createEnvironmentReader>[0],
  );

  // The ADO client is needed by the role resolver, and the role resolver is needed
  // by identity — so the client is built first and shared by both halves.
  const ado = createAdoClient(environment.read);

  const identity = createIdentityProvider({
    getContext,
    // Derived from effective area-path permissions rather than group membership:
    // Graph is on the vssps host and unreachable from a code app, and the ACLs are
    // what actually enforce this anyway.
    resolveRole: options.resolveRole ?? createRoleResolver(ado),
  });

  const role = async (): Promise<Role> => (await identity.getCurrentUser())?.role ?? "Submitter";

  const engagement = createEngagementProvider({
    currentUserId: identity.currentSystemUserId,
  });

  const rollups = createRollupReader({ currentUserId: identity.currentSystemUserId });

  // One client for both halves: an idea is an ADO work item joined to a Dataverse
  // engagement rollup, and neither side can answer alone.
  const items = { client: ado, rollups, role };

  const collaboration = createCollaborationProvider({
    // Comments are native ADO work item comments, injected so the Dataverse module
    // stays free of the connector.
    comments: createCommentsApi(ado),
    // Activity stores actors as Dataverse lookups, so the feed needs names for GUIDs.
    // Optional on the contract: without it the feed keeps the id and the UI falls back.
    resolveUsers: identity.resolveUsers ?? (async () => []),
  });

  const provider: InnovationBacklogProvider = {
    identity,
    engagement,
    collaboration,
    environment: environment.provider,

    ideas: createIdeasProvider(items),
    solutions: createSolutionsProvider(items),
    approvals: createApprovalsProvider(items),
    search: createSearch(ado, role),
  };

  // Outermost, so it observes the finished operation: nothing is recorded for a
  // mutation that threw, and the record cannot be written before the thing it
  // describes actually happened.
  return withActivity(
    provider,
    createActivityWriter({ currentUserId: identity.currentSystemUserId }),
  );
}

/**
 * The same contract, served entirely from memory.
 *
 * For local work before Azure DevOps is provisioned, and for anywhere a tenant is
 * not available. Kept here rather than in a story file so there is exactly one
 * place that decides what "the app with no backend" means.
 */
export function createOfflineProvider(role: Role = "Administrator"): InnovationBacklogProvider {
  return createMemoryProvider({ role });
}

export { requireAdoContext } from "./environment.js";
