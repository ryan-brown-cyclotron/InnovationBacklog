using Momentum.Library.Domain.Identity;

namespace Momentum.Library.Domain.Auditing;

public enum AuditActorType
{
    User,
    Agent,
    System
}

public enum AuditAudience
{
    SubmitterAndApprovers,
    ApproversOnly
}

public sealed record AuditRecord
{
    public string Id { get; init; } = Guid.NewGuid().ToString("N");
    public required string Action { get; init; }
    public required string ResourceType { get; init; }
    public required string ResourceId { get; init; }
    public required string SubjectId { get; init; }
    public required AuditActorType ActorType { get; init; }
    public required string ActorId { get; init; }
    public required string Summary { get; init; }
    public AuditAudience Audience { get; init; } = AuditAudience.SubmitterAndApprovers;
    public IReadOnlyDictionary<string, string> Details { get; init; } = new Dictionary<string, string>();
    public DateTimeOffset OccurredAt { get; init; } = DateTimeOffset.UtcNow;
}
