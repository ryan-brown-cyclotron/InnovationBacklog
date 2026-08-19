using Momentum.Library.Domain.Identity;

namespace Momentum.Library.Domain.Engagement;

/// <summary>
/// Exploring and Implementing are active; Using is the settled end state; Withdrawn is the
/// tombstone.
/// </summary>
/// <remarks>
/// Withdrawn is a status rather than a delete because a real delete would silently change
/// every historical rollup that counted the row. It mirrors
/// <see cref="ContributionStatus"/>.Withdrawn, which is the same act on the same kind of
/// record, and the code app's <c>AdoptionStatus</c> is kept in step with this enum.
/// <para>
/// A withdrawn use is NOT active, and is also not merely inactive: callers that count
/// adoptions exclude it entirely rather than filing it with the completed ones.
/// </para>
/// </remarks>
public enum SolutionUseStatus
{
    Exploring,
    Implementing,
    Using,
    Withdrawn
}

public sealed record SolutionUse
{
    public string Id { get; init; } = Guid.NewGuid().ToString("N");
    public string SolutionId { get; init; } = string.Empty;
    public UserId StartedBy { get; init; } = null!;
    public string ProjectName { get; init; } = string.Empty;
    public string? Team { get; init; }
    public SolutionUseStatus Status { get; init; } = SolutionUseStatus.Exploring;
    public DateTimeOffset StartedAt { get; init; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; init; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? CompletedAt { get; init; }

    public SolutionUse() { }

    public bool IsActive => Status is SolutionUseStatus.Exploring or SolutionUseStatus.Implementing;
}
