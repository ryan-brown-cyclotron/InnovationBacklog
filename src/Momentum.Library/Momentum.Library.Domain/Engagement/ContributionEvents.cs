using Momentum.Library.Domain.Events;
using Momentum.Library.Domain.Identity;

namespace Momentum.Library.Domain.Engagement;

public sealed record ContributionCreated(
    Guid EventId,
    string ContributionId,
    HubItemReference Target,
    UserId RequestedBy,
    DateTimeOffset OccurredAt) : DomainEvent(EventId, OccurredAt);

public sealed record ContributionAccepted(
    Guid EventId,
    string ContributionId,
    HubItemReference Target,
    UserId DecidedBy,
    DateTimeOffset OccurredAt) : DomainEvent(EventId, OccurredAt);

public sealed record ContributionRejected(
    Guid EventId,
    string ContributionId,
    HubItemReference Target,
    UserId DecidedBy,
    DateTimeOffset OccurredAt) : DomainEvent(EventId, OccurredAt);

public sealed record ContributionWithdrawn(
    Guid EventId,
    string ContributionId,
    HubItemReference Target,
    UserId RequestedBy,
    DateTimeOffset OccurredAt) : DomainEvent(EventId, OccurredAt);
