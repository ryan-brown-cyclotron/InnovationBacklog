using Momentum.Library.Domain.Events;
using Momentum.Library.Domain.Identity;

namespace Momentum.Library.Domain.Engagement;

public sealed record SolutionUseStarted(
    Guid EventId,
    string SolutionUseId,
    string SolutionId,
    UserId StartedBy,
    SolutionUseStatus Status,
    string ProjectName,
    string? Team,
    DateTimeOffset OccurredAt) : DomainEvent(EventId, OccurredAt);
