using Momentum.Library.Domain.Identity;

namespace Momentum.Library.Domain.Engagement;

public enum SolutionUseStatus
{
    Exploring,
    Implementing,
    Using
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
