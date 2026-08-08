using Momentum.Library.Domain.Identity;

namespace Momentum.Library.Domain.Engagement;

public enum ContributionStatus
{
    Proposed,
    Accepted,
    Rejected,
    Withdrawn
}

public sealed record Contribution
{
    public string Id { get; init; } = Guid.NewGuid().ToString("N");
    public HubItemReference Target { get; init; } = null!;
    public UserId RequestedBy { get; init; } = null!;
    public string Message { get; init; } = string.Empty;
    public ContributionStatus Status { get; init; } = ContributionStatus.Proposed;
    public UserId? DecidedBy { get; init; }
    public string? Rationale { get; init; }
    public DateTimeOffset CreatedAt { get; init; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; init; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? DecidedAt { get; init; }

    public Contribution() { }
}
