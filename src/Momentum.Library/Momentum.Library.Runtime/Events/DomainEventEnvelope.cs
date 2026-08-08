namespace Momentum.Library.Runtime.Events;

public sealed record DomainEventEnvelope(
    string EventId,
    string EventType,
    string CorrelationId,
    string CausationId,
    DateTimeOffset Timestamp,
    string Body);
