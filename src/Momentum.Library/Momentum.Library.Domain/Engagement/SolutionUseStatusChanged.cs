using Momentum.Library.Domain.Events;
using Momentum.Library.Domain.Identity;

namespace Momentum.Library.Domain.Engagement;

public sealed record SolutionUseStatusChanged(
    Guid EventId,
    string SolutionUseId,
    string SolutionId,
    UserId ActorId,
    SolutionUseStatus PreviousStatus,
    SolutionUseStatus Status,
    DateTimeOffset OccurredAt) : DomainEvent(EventId, OccurredAt);
