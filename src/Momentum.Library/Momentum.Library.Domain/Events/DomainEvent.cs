namespace Momentum.Library.Domain.Events;

public abstract record DomainEvent(Guid EventId, DateTimeOffset OccurredAt);
