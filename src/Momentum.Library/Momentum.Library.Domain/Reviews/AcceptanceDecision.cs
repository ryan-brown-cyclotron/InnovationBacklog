using Momentum.Library.Domain.Identity;

namespace Momentum.Library.Domain.Reviews;

public sealed record AcceptanceDecision
{
    public string Id { get; init; } = Guid.NewGuid().ToString("N");
    public string RequestId { get; init; } = string.Empty;
    public UserId ApproverId { get; init; } = null!;
    public AcceptanceDecisionType Decision { get; init; }
    public string Rationale { get; init; } = string.Empty;
    public DateTimeOffset DecidedAt { get; init; } = DateTimeOffset.UtcNow;

    public AcceptanceDecision() { }
}

public enum AcceptanceDecisionType
{
    Accept,
    Reject
}
