using Momentum.Library.Domain.Events;
using Momentum.Library.Domain.Identity;

namespace Momentum.Library.Domain.Engagement;

public sealed record SolutionUseCompleted(
    Guid EventId,
    string SolutionUseId,
    string SolutionId,
    UserId ActorId,
    DateTimeOffset CompletedAt,
    DateTimeOffset OccurredAt) : DomainEvent(EventId, OccurredAt);
