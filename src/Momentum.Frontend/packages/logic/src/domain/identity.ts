import type { AppUser } from "@momentum/contracts";
import type { Assert, FieldsExistOn } from "./common.js";
import type { Role } from "./enums.js";

/**
 * The signed-in user.
 *
 * `role` is not part of `AppUser` on the wire — the HTTP provider derives it from
 * the session, and the Azure DevOps provider derives it from project group
 * membership (Project Administrators -> Administrator, the Approvers group ->
 * Approver, anyone else -> Submitter). Resolving it costs a Graph call, so
 * providers are expected to resolve it once per load and memoize.
 */
export interface CurrentUser {
  id: string;
  sub: string;
  email: string;
  displayName: string;
  createdAt: string;
  role: Role;
}

/** Guards the fields that do come from the wire. `role` is provider-derived. */
export type CurrentUserMatchesWire = Assert<FieldsExistOn<Omit<CurrentUser, "role">, AppUser>>;

/** A person referenced from an engagement record, for avatars and "shared by". */
export interface UserRef {
  id: string;
  displayName?: string;
  email?: string;
}
