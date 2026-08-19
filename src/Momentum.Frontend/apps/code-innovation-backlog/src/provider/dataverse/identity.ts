import type { CurrentUser, IdentityProvider, Role, UserRef } from "@innovation-backlog/logic";
import { SystemusersService } from "../../generated/services/SystemusersService.js";
import type { Systemusers } from "../../generated/models/SystemusersModel.js";
import { anyOf, fetchAll, guid, odataString } from "./paging.js";

/**
 * The signed-in user, resolved from the Power Apps host context and Dataverse.
 *
 * Role is deliberately NOT read from Dataverse. The design puts it in Azure DevOps
 * group membership — Project Administrators means Administrator, the project's
 * Approvers group means Approver, anyone else is a Submitter — because that is
 * where the approver gate is actually enforced (a process rule makes System.State
 * read-only outside the group). Resolving it here as well would be a second source
 * of truth that could disagree with the one doing the enforcing.
 *
 * Until the ADO project exists, `resolveRole` is injected and falls back to
 * Submitter. Failing closed is the right default: a Submitter view of an approver's
 * data is a missing button, the reverse is a disclosure.
 */

interface HostContext {
  user?: {
    objectId?: string;
    userPrincipalName?: string;
    fullName?: string;
    email?: string;
  };
}

export interface IdentityOptions {
  getContext: () => unknown;
  /** Resolves the caller's role, normally from ADO group membership. */
  resolveRole?: () => Promise<Role>;
}

export function createIdentityProvider(options: IdentityOptions): IdentityProvider & {
  /** The Dataverse systemuserid of the caller, for stamping ownership on writes. */
  currentSystemUserId: () => Promise<string | null>;
} {
  let cached: Promise<CurrentUser | null> | null = null;

  async function hostUser(): Promise<HostContext["user"] | undefined> {
    try {
      const context = await Promise.resolve(options.getContext());
      return (context as HostContext | null)?.user;
    } catch {
      return undefined;
    }
  }

  /**
   * Match the host identity to a Dataverse systemuser.
   *
   * azureactivedirectoryobjectid is the reliable join; UPN is a fallback because it
   * can differ in case and, in guest scenarios, in domain.
   */
  async function findSystemUser(user: HostContext["user"]): Promise<Systemusers | undefined> {
    if (!user) return undefined;

    const clauses: string[] = [];
    if (user.objectId) {
      clauses.push(`azureactivedirectoryobjectid eq '${guid(user.objectId)}'`);
    }
    if (user.userPrincipalName) {
      clauses.push(`domainname eq '${odataString(user.userPrincipalName)}'`);
    }
    if (clauses.length === 0) return undefined;

    const rows = await fetchAll<Systemusers>(
      (o) => SystemusersService.getAll(o),
      "resolve current user",
      {
        select: ["systemuserid", "fullname", "domainname", "internalemailaddress", "createdon"],
        filter: `(${clauses.join(" or ")}) and isdisabled eq false`,
        top: 1,
      },
    );
    return rows[0];
  }

  async function load(): Promise<CurrentUser | null> {
    const user = await hostUser();
    const row = await findSystemUser(user);
    if (!row && !user) return null;

    const role: Role = options.resolveRole
      ? await options.resolveRole().catch(() => "Submitter" as Role)
      : "Submitter";

    /*
      `id` is the Azure DevOps identity, NOT the Dataverse systemuserid.

      Every ownership comparison the UI makes is against a value that came off a
      work item — `submittedBy` from System.CreatedBy, `ownerId` from
      System.AssignedTo, a comment's author — and all of those are ADO identities
      (userPrincipalName). Putting the Dataverse GUID here means those comparisons
      can never match, which silently hides every "this is mine" affordance —
      editing your own idea being the obvious one.

      The Dataverse GUID is still needed to stamp ownership on votes and adoptions,
      so it stays available separately through `currentSystemUserId()`.
    */
    const adoIdentity = user?.userPrincipalName ?? row?.domainname ?? row?.systemuserid ?? "";

    return {
      id: adoIdentity,
      sub: user?.objectId ?? adoIdentity,
      email: row?.internalemailaddress ?? user?.email ?? user?.userPrincipalName ?? "",
      displayName: row?.fullname ?? user?.fullName ?? user?.userPrincipalName ?? "Unknown user",
      createdAt: row?.createdon ?? "",
      role,
    };
  }

  const current = () => (cached ??= load());

  // Resolved separately from getCurrentUser, because CurrentUser.id is the ADO
  // identity and Dataverse writes need the systemuserid.
  let cachedSystemUserId: Promise<string | null> | null = null;

  /**
   * Names already known, keyed by lowercased GUID. A `null` records an id that was
   * asked for and matched no row — remembered so the same empty answer is not bought
   * twice — while an id that is absent from the map has simply never been asked for.
   */
  const resolved = new Map<string, UserRef | null>();
  /** Lookups still in the air, so overlapping callers share one query per id. */
  const inflight = new Map<string, Promise<void>>();

  function lookup(ids: string[]): Promise<void> {
    const run = (async () => {
      const rows = await fetchAll<Systemusers>(
        (o) => SystemusersService.getAll(o),
        "resolve users",
        {
          select: ["systemuserid", "fullname", "internalemailaddress"],
          filter: anyOf("systemuserid", ids),
        },
      );

      for (const id of ids) resolved.set(id, null);
      for (const row of rows) {
        resolved.set(guid(row.systemuserid).toLowerCase(), {
          id: row.systemuserid,
          displayName: row.fullname,
          email: row.internalemailaddress,
        });
      }
    })().finally(() => {
      // Only the entries this call claimed, and only if a later call has not already
      // replaced them.
      for (const id of ids) if (inflight.get(id) === run) inflight.delete(id);
    });

    for (const id of ids) inflight.set(id, run);
    return run;
  }

  return {
    getCurrentUser: current,

    async currentSystemUserId() {
      cachedSystemUserId ??= (async () => {
        const row = await findSystemUser(await hostUser());
        return row?.systemuserid ?? null;
      })();
      return cachedSystemUserId;
    },

    /**
     * Best-effort by contract: an id that will not resolve is simply absent from the
     * result. Name resolution must never fail the list it decorates.
     *
     * Memoized per GUID, and per GUID rather than per query on purpose. Opening a
     * solution resolved the SAME systemuser twice, byte for byte — once for the
     * activity feed's actors, once for the adoption list's starters — because the two
     * callers cannot see each other. Caching the request would only have caught the
     * case where both ask for exactly the same set; caching the person means a lookup
     * asks only for the ids nobody has asked for yet, and an overlap of one still
     * saves that one.
     *
     * A display name is not engagement data, so unlike votes or adoptions it is safe
     * to hold for the session — the same reasoning that already caches the current
     * user above.
     */
    async resolveUsers(ids: string[]): Promise<UserRef[]> {
      const wanted = [...new Set(ids.map(guid).filter(Boolean).map((id) => id.toLowerCase()))];
      if (wanted.length === 0) return [];

      const missing = wanted.filter((id) => !resolved.has(id));
      if (missing.length > 0) {
        try {
          // Ids already being fetched by a call that has not returned yet are waited
          // on rather than asked for again — the activity feed and the adoption list
          // resolve their actors at the same moment, so without this the second one
          // would still issue a duplicate query.
          const fresh = missing.filter((id) => !inflight.has(id));
          if (fresh.length > 0) lookup(fresh);
          await Promise.all([...new Set(missing.map((id) => inflight.get(id)))]);
        } catch (error) {
          // Nothing is remembered on failure: an unreadable table is not a missing
          // person, and the next call should try again.
          console.warn("[code-app] user name resolution unavailable:", error);
          return [];
        }
      }

      return wanted
        .map((id) => resolved.get(id))
        .filter((user): user is UserRef => Boolean(user));
    },
  };
}
