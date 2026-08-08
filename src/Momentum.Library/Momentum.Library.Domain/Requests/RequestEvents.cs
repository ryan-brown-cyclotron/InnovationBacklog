using Momentum.Library.Domain.Events;
using Momentum.Library.Domain.Identity;

namespace Momentum.Library.Domain.Requests;

public sealed record RequestSubmitted(
    Guid EventId,
    string RequestId,
    RequestType RequestType,
    DateTimeOffset OccurredAt) : DomainEvent(EventId, OccurredAt);

public sealed record RequestAccepted(
    Guid EventId,
    string RequestId,
    UserId ApproverId,
    DateTimeOffset OccurredAt) : DomainEvent(EventId, OccurredAt);

public sealed record RequestPublished(
    Guid EventId,
    string RequestId,
    DateTimeOffset OccurredAt) : DomainEvent(EventId, OccurredAt);
