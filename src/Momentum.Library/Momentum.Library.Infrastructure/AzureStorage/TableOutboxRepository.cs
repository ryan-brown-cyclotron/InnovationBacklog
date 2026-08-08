using Azure.Data.Tables;
using System.Text.Json;

namespace Momentum.Library.Infrastructure.AzureStorage;

public sealed class TableOutboxRepository
{
    private readonly TableClient _table;
    private static readonly JsonSerializerOptions JsonOptions = new();

    public TableOutboxRepository(TableStorageOptions options)
    {
        var service = new TableServiceClient(options.ConnectionString);
        _table = service.GetTableClient(StorageTableNames.Outbox);
    }

    public async Task<OutboxEntity> AddAsync(string eventId, string eventType, string correlationId, string causationId, string body)
    {
        var entity = new OutboxEntity
        {
            PartitionKey = "outbox",
            RowKey = eventId,
            EventType = eventType,
            CorrelationId = correlationId,
            CausationId = causationId,
            Body = body,
            Published = false,
            EnqueuedAt = DateTimeOffset.UtcNow
        };
        await _table.AddEntityAsync(entity);
        return entity;
    }

    public async Task<IReadOnlyList<OutboxEntity>> GetPendingAsync()
    {
        var results = new List<OutboxEntity>();
        await foreach (var entity in _table.QueryAsync<OutboxEntity>(e => e.PartitionKey == "outbox" && !e.Published))
        {
            results.Add(entity);
        }
        return results;
    }

    public async Task MarkPublishedAsync(string eventId)
    {
        var entity = await _table.GetEntityAsync<OutboxEntity>("outbox", eventId);
        var updated = entity.Value;
        updated.Published = true;
        await _table.UpdateEntityAsync(updated, updated.ETag, TableUpdateMode.Merge);
    }
}
