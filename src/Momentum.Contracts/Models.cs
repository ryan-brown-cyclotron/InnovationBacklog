using TypeGen.Core.TypeAnnotations;

namespace Momentum.Contracts;

[ExportTsInterface]
public sealed record AppUser(
    string Id,
    string Sub,
    string Email,
    string DisplayName,
    string CreatedAt);

[ExportTsInterface]
public sealed record CreateRequestRequest(
    string Title,
    string Description,
    string Type,
    IReadOnlyList<string>? Tags = null);

[ExportTsInterface]
public sealed record CreateSolutionRequest(
    string Title,
    string Description,
    string SolutionType,
    string RepositoryOwner,
    string RepositoryName,
    string RepositoryUrl,
    string? DemoUrl,
    IReadOnlyList<string>? Tags = null);

[ExportTsInterface]
public sealed record UpdateRequestRequest(string Title, string Description);

[ExportTsInterface]
public sealed record AddCommentRequest(
    string Body,
    string Audience,
    string SubjectType,
    IReadOnlyList<string>? AttachmentIds);

/// <summary>
/// Attachment upload. Content arrives base64-encoded in JSON so uploads travel
/// the same tool-call bridge as every other client request.
/// </summary>
[ExportTsInterface]
public sealed record UploadAttachmentRequest(
    string FileName,
    string? ContentType,
    string ContentBase64);

[ExportTsInterface]
public sealed record AttachmentResponse(
    string Id,
    string FileName,
    string ContentType,
    long Length);

[ExportTsInterface]
public sealed record AcceptanceDecisionRequest(string Rationale);

[ExportTsInterface]
public sealed record AddVoteRequest(string ItemType, string ItemId);

[ExportTsInterface]
public sealed record RemoveVoteRequest(string ItemType, string ItemId);

/// <summary>Upvote state for one item, for the calling user.</summary>
[ExportTsInterface]
public sealed record VoteSummaryResponse(
    string ItemType,
    string ItemId,
    int Count,
    bool VotedByMe);

[ExportTsInterface]
public sealed record StartSolutionUseRequest(
    string ProjectName,
    string? Team,
    string? Status);

[ExportTsInterface]
public sealed record UpdateSolutionUseRequest(
    string? Status,
    string? ProjectName,
    string? Team);

[ExportTsInterface]
public sealed record SolutionUseResponse(
    string Id,
    string SolutionId,
    string StartedBy,
    string ProjectName,
    string? Team,
    string Status,
    string StartedAt,
    string UpdatedAt,
    string? CompletedAt);

/// <summary>
/// Relationship is optional; callers that only know "this solution addresses
/// this idea" get <c>Proposed</c>.
/// </summary>
[ExportTsInterface]
public sealed record LinkSolutionRequestBody(
    string SolutionId,
    string? Relationship);

[ExportTsInterface]
public sealed record SelectCanonicalSolutionRequestBody(string SolutionId);

/// <summary>Administrator-only. One of Everyone, Approvers, Hidden.</summary>
[ExportTsInterface]
public sealed record SetVisibilityRequest(string Visibility);

/// <summary>A proposed solution-to-idea link waiting on a reviewer.</summary>
[ExportTsInterface]
public sealed record PendingLinkResponse(
    string RequestId,
    string RequestTitle,
    string SolutionId,
    string SolutionTitle,
    string Relationship,
    string AddedBy,
    string AddedAt);

[ExportTsInterface]
public sealed record RequestSummaryEntry(
    int Votes,
    int Votes30d,
    bool VotedByMe,
    int LinkedSolutions,
    int Contributors,
    int Comments);

[ExportTsInterface]
public sealed record SolutionSummaryEntry(
    int Adoptions,
    int Teams,
    int LinkedNeeds,
    int ActiveUses,
    int CompletedUses,
    int Votes,
    bool VotedByMe,
    int Comments);

// ---------------------------------------------------------------------------
// Insights — the dashboard
// ---------------------------------------------------------------------------

/// <summary>
/// Programme-level numbers, computed live from the rows that hold them.
///
/// EVERY FIGURE HERE MUST SURVIVE THE QUESTION "WHERE DID IT COME FROM". Anything a
/// host cannot actually measure is null, never zero, and the tiles that can be
/// measured more than one way carry a string saying which way was used. A confident
/// zero is indistinguishable from a real one, which is exactly how a rollup table
/// nothing had ever written to went unnoticed.
/// </summary>
[ExportTsInterface]
public sealed record InsightsResponse(
    string GeneratedAt,
    IdeaFlowInsightsResponse Ideas,
    ApprovalInsightsResponse Approval,
    VoterInsightsResponse Voters,
    EngagementInsightsResponse Engagement30d,
    SolutionInsightsResponse Solutions,
    IReadOnlyList<FunnelStageResponse> Funnel,
    IReadOnlyList<ContributorInsightResponse> Contributors);

/// <summary>
/// One person and what they have done, ranked by the total. <c>Name</c> is null where the
/// store already keys on an identity a reader can be shown — this host's actor id is a
/// UserId, so the surface derives the name from it.
/// </summary>
[ExportTsInterface]
public sealed record ContributorInsightResponse(
    string Id,
    string? Name,
    int Ideas,
    int Votes,
    int Comments,
    int Adoptions,
    int Total);

[ExportTsInterface]
public sealed record FunnelStageResponse(string Label, int Value, string? Detail);

[ExportTsInterface]
public sealed record IdeaFlowInsightsResponse(int Total, int Submitted30d, int SubmittedPrior30d);

/// <summary>Time from submission to decision, and what is still waiting.</summary>
[ExportTsInterface]
public sealed record ApprovalInsightsResponse(
    double? MedianDays,
    double? P90Days,
    int SampleSize,
    string Source,
    int StaleCount,
    int StaleAfterDays);

/// <summary>
/// Vote breadth and concentration. <c>Population</c> is null here because this host
/// has no user directory to count — saying so is the point.
/// </summary>
[ExportTsInterface]
public sealed record VoterInsightsResponse(
    int Distinct,
    int TotalVotes,
    int? Population,
    string? PopulationSource,
    double? TopTenShare);

/// <summary>Volume over the last 30 days. Null means "no way to create one yet".</summary>
[ExportTsInterface]
public sealed record EngagementInsightsResponse(
    int Votes,
    int Comments,
    int? Participation,
    int Adoptions);

[ExportTsInterface]
public sealed record SolutionInsightsResponse(int Total, int Adopted);

[ExportTsInterface]
public sealed record ActivityResponseItem(
    string Id,
    string Action,
    string ResourceType,
    string ResourceId,
    string SubjectId,
    string ActorType,
    string ActorId,
    string Summary,
    string Audience,
    string OccurredAt);

[ExportTsInterface]
public sealed record SearchResponse(
    IReadOnlyList<SearchResponseItem> Items,
    int TotalCount);

[ExportTsInterface]
public sealed record SearchResponseItem(
    string ItemType,
    string ItemId,
    string Title,
    string Description,
    string Status,
    string? CanonicalSolutionId,
    string? RepositoryUrl,
    string? Team,
    string CreatedAt,
    string UpdatedAt,
    /// <summary>Idea type or solution type — the second half of the "IDEA · …" eyebrow.</summary>
    string? Subtype = null,
    /// <summary>Who shared the item, for the "Shared by" column.</summary>
    string? SubmittedBy = null,
    /// <summary>Everyone, Approvers, or Hidden — so restricted items can be badged.</summary>
    string? Visibility = null,
    IReadOnlyList<string>? Tags = null);

[ExportTsInterface]
public sealed record RequestResponse(
    string Id,
    string Type,
    string Status,
    string Title,
    string Description,
    string SubmittedBy,
    string? CanonicalSolutionId,
    string CreatedAt,
    string UpdatedAt,
    string Visibility,
    IReadOnlyList<string> Tags);

[ExportTsInterface]
public sealed record SolutionResponse(
    string Id,
    string Title,
    string Description,
    string Type,
    string Status,
    string RepositoryOwner,
    string RepositoryName,
    string RepositoryUrl,
    string? DemoUrl,
    string? OwnerId,
    int UseCount,
    IReadOnlyList<string> AdoptedByProjects,
    string CreatedAt,
    string UpdatedAt,
    string? PublishedAt,
    string Visibility,
    IReadOnlyList<string> Tags);

[ExportTsInterface]
public sealed record RequestParticipationRequest(string ItemType, string ItemId, string Message);

[ExportTsInterface]
public sealed record ParticipationResponse(
    string Id,
    string ItemType,
    string ItemId,
    string RequestedBy,
    string Message,
    string Status,
    string? DecidedBy,
    string? Rationale,
    string CreatedAt,
    string UpdatedAt,
    string? DecidedAt);

[ExportTsInterface]
public sealed record CommentResponse(
    string Id,
    string SubjectId,
    string SubjectType,
    string AuthorId,
    string Audience,
    string Body,
    IReadOnlyList<AttachmentResponse> Attachments,
    string CreatedAt);
