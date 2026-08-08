using Azure;
using Azure.Data.Tables;
using Momentum.Library.Application.Ports;

namespace Momentum.Library.Infrastructure.AzureStorage;

public sealed class TableEventProcessingRepository : IEventProcessingRepository
{
    private readonly TableClient _table;

    public TableEventProcessingRepository(TableStorageOptions options)
    {
        var service = new TableServiceClient(options.ConnectionString);
        _table = service.GetTableClient(StorageTableNames.ProcessedEvents);
    }

    public async Task<bool> TryClaim(string eventId, string operationType)
    {
        var entity = new ProcessedEventEntity
        {
            PartitionKey = operationType,
            RowKey = eventId,
            ClaimedAt = DateTimeOffset.UtcNow
        };

        try
        {
            await _table.AddEntityAsync(entity);
            return true;
        }
        catch (RequestFailedException exception) when (exception.Status == 409)
        {
            return false;
        }
    }

    public async Task Complete(string eventId, string operationType)
    {
        var response = await _table.GetEntityAsync<ProcessedEventEntity>(operationType, eventId);
        var entity = response.Value;
        entity.Status = "Completed";
        entity.CompletedAt = DateTimeOffset.UtcNow;
        await _table.UpdateEntityAsync(entity, entity.ETag, TableUpdateMode.Replace);
    }

    public async Task Release(string eventId, string operationType)
    {
        try
        {
            await _table.DeleteEntityAsync(operationType, eventId, ETag.All);
        }
        catch (RequestFailedException exception) when (exception.Status == 404)
        {
        }
    }
}