using System.Text.Json;
using Azure.Storage.Queues;
using Momentum.Library.Application.Ports;
using Momentum.Library.Domain.Events;
using Momentum.Library.Runtime.Events;

namespace Momentum.Library.Infrastructure.AzureStorage;

public sealed class AzureQueueEventPublisher : IEventPublisher
{
    private readonly TableOutboxRepository _outbox;
    private readonly QueueClient _queue;
    private static readonly JsonSerializerOptions JsonOptions = new();

    public AzureQueueEventPublisher(TableOutboxRepository outbox, QueueStorageOptions queueOptions)
    {
        _outbox = outbox;
        _queue = new QueueClient(queueOptions.ConnectionString, queueOptions.QueueName);
    }

    public async Task Publish(DomainEvent domainEvent)
    {
        var eventId = domainEvent.EventId.ToString("N");
        var eventType = domainEvent.GetType().Name;
        var body = JsonSerializer.Serialize(domainEvent, domainEvent.GetType(), JsonOptions);
        var envelope = new DomainEventEnvelope(
            eventId,
            eventType,
            Guid.NewGuid().ToString("N"),
            string.Empty,
            DateTimeOffset.UtcNow,
            body);

        var envelopeJson = JsonSerializer.Serialize(envelope, JsonOptions);

        var pending = await _outbox.GetPendingAsync();
        if (pending.Any(e => e.RowKey == eventId))
            return;

        await _outbox.AddAsync(eventId, eventType, envelope.CorrelationId, envelope.CausationId, body);

        try
        {
            await _queue.SendMessageAsync(envelopeJson);
            await _outbox.MarkPublishedAsync(eventId);
        }
        catch (Exception)
        {
            // Leave the outbox entry unpublished so a retry can pick it up.
            throw;
        }
    }
}
