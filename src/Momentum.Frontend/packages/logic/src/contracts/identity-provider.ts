import type { CurrentUser, UserRef } from "../domain/identity.js";

export interface IdentityProvider {
  /**
   * The signed-in user, or null when the session cannot be resolved.
   *
   * Providers memoize this for their lifetime. Resolving the role costs a
   * membership lookup, and nothing about the answer changes mid-session.
   */
  getCurrentUser(): Promise<CurrentUser | null>;

  /**
   * Display names for a set of user ids.
   *
   * Best-effort by contract: an id that cannot be resolved is simply absent from
   * the result. Name resolution failing must never fail the list it decorates —
   * unresolved names are a cosmetic degradation, a broken page is not.
   */
  resolveUsers?(ids: string[]): Promise<UserRef[]>;
}
