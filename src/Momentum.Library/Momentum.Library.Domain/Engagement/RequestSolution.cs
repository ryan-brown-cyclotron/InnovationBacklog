using Momentum.Library.Domain.Visibility;

namespace Momentum.Library.Domain.Engagement;

public sealed record RequestSolution
{
    public string RequestId { get; init; } = string.Empty;
    public string SolutionId { get; init; } = string.Empty;
    public RequestSolutionRelationship Relationship { get; init; } = RequestSolutionRelationship.Proposed;

    /// <summary>
    /// Claiming that a solution answers an idea is a claim about the hub, so it
    /// is reviewed like anything else. A reviewer's own link is approved on the
    /// spot.
    /// </summary>
    public ApprovalState Approval { get; init; } = ApprovalState.Pending;

    public Domain.Identity.UserId AddedBy { get; init; } = null!;
    public DateTimeOffset AddedAt { get; init; } = DateTimeOffset.UtcNow;
    public Domain.Identity.UserId? DecidedBy { get; init; }
    public DateTimeOffset? DecidedAt { get; init; }

    public RequestSolution() { }
}

public enum RequestSolutionRelationship
{
    Proposed,
    Relevant,
    Existing
}
