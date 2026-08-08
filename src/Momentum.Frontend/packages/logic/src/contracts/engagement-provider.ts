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

  // -------------------------------------------------------------------------
  // Participation
  // -------------------------------------------------------------------------

  requestParticipation(input: RequestParticipationInput): Promise<Participation>;
  listMyParticipation(): Promise<Participation[]>;
  withdrawParticipation(id: string): Promise<Participation>;
}
