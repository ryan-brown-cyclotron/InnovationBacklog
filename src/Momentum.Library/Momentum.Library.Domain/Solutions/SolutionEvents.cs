using Momentum.Library.Domain.Events;
using Momentum.Library.Domain.Identity;

namespace Momentum.Library.Domain.Solutions;

public sealed record SolutionSubmitted(
    Guid EventId,
    string SolutionId,
    UserId SubmitterId,
    DateTimeOffset OccurredAt) : DomainEvent(EventId, OccurredAt);

public sealed record SolutionAccepted(
    Guid EventId,
    string SolutionId,
    DateTimeOffset OccurredAt) : DomainEvent(EventId, OccurredAt);

public sealed record SolutionPublished(
    Guid EventId,
    string SolutionId,
    DateTimeOffset OccurredAt) : DomainEvent(EventId, OccurredAt);
