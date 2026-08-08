using Momentum.Library.Domain.Events;
using Momentum.Library.Domain.Identity;

namespace Momentum.Library.Domain.Engagement;

public sealed record SolutionLinkedToRequest(
    Guid EventId,
    string RequestId,
    string SolutionId,
    RequestSolutionRelationship Relationship,
    UserId AddedBy,
    DateTimeOffset OccurredAt) : DomainEvent(EventId, OccurredAt);

public sealed record SolutionUnlinkedFromRequest(
    Guid EventId,
    string RequestId,
    string SolutionId,
    DateTimeOffset OccurredAt) : DomainEvent(EventId, OccurredAt);

public sealed record CanonicalSolutionSelected(
    Guid EventId,
    string RequestId,
    string SolutionId,
    DateTimeOffset OccurredAt) : DomainEvent(EventId, OccurredAt);

public sealed record CanonicalSolutionCleared(
    Guid EventId,
    string RequestId,
    DateTimeOffset OccurredAt) : DomainEvent(EventId, OccurredAt);
