using Momentum.Library.Domain.Events;
using Momentum.Library.Domain.Identity;

namespace Momentum.Library.Domain.Engagement;

public sealed record VoteRemoved(
    Guid EventId,
    string VoteId,
    HubItemReference Target,
    UserId UserId,
    DateTimeOffset OccurredAt) : DomainEvent(EventId, OccurredAt);
