import type {
  Adoption,
  HubItemRef,
  Participation,
  RequestParticipationInput,
  StartAdoptionInput,
  UpdateAdoptionInput,
  VoteSummary,
} from "../domain/engagement.js";

export interface EngagementProvider {
  // -------------------------------------------------------------------------
  // Votes
  // -------------------------------------------------------------------------

  /** Count plus whether the calling user has voted — a toggle needs both. */
  getVoteSummary(target: HubItemRef): Promise<VoteSummary>;

  /**
   * Idempotent. Voting twice is a no-op, not an error and not a second vote.
   * Providers back this with a uniqueness constraint where one is available
   * rather than a read-then-write check, which double-votes under concurrency.
   */
  addVote(target: HubItemRef): Promise<VoteSummary>;

  removeVote(target: HubItemRef): Promise<VoteSummary>;

  // -------------------------------------------------------------------------
  // Adoption
  // -------------------------------------------------------------------------

  listAdoptions(solutionId: string): Promise<Adoption[]>;
  startAdoption(solutionId: string, input: StartAdoptionInput): Promise<Adoption>;
  updateAdoption(solutionId: string, adoptionId: string, patch: UpdateAdoptionInput): Promise<Adoption>;

  /** Settles an adoption: status becomes Using and `completedAt` is stamped. */
  completeAdoption(solutionId: string, adoptionId: string): Promise<Adoption>;

  /**
   * Takes an adoption back: status becomes Withdrawn and the row is retained.
   *
   * A withdrawal, not a delete — the same shape as `withdrawParticipation` below, and
   * the same shape as `deleteMilestone`, which writes a Cancelled tombstone the list
   * then filters out. The row stays because a real delete would silently change every
   * historical rollup that counted it.
   *
   * `completedAt` is NOT stamped. That timestamp is what the rollups read to mean
   * "rolled out", which is the opposite of the claim being made here.
   *
   * Withdrawn rows do not come back from `listAdoptions` and are not counted by the
   * rollups, so the adoption count falls. Permitted for the person who recorded it and
   * for reviewers — `canManageAdoption`, which notably does NOT include the solution's
   * owner.
   */
  withdrawAdoption(solutionId: string, adoptionId: string): Promise<Adoption>;

  // -------------------------------------------------------------------------
  // Participation
  // -------------------------------------------------------------------------

  requestParticipation(input: RequestParticipationInput): Promise<Participation>;
  listMyParticipation(): Promise<Participation[]>;
  withdrawParticipation(id: string): Promise<Participation>;
}
