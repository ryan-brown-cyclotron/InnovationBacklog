using Azure.Data.Tables;
using Momentum.Library.Application.Ports;
using System.Text.Json;

namespace Momentum.Library.Infrastructure.AzureStorage;

public sealed class TableAgentRunRepository : IAgentRunRepository
{
    private readonly TableClient _table;
    private static readonly JsonSerializerOptions JsonOptions = new();

    public TableAgentRunRepository(TableStorageOptions options)
    {
        var service = new TableServiceClient(options.ConnectionString);
        _table = service.GetTableClient(StorageTableNames.AgentRuns);
    }

    public Task RecordStart(Guid runId, string subjectId, string agentType)
    {
        var entity = new AgentRunEntity
        {
            PartitionKey = subjectId,
            RowKey = runId.ToString("N"),
            SubjectId = subjectId,
            AgentType = agentType,
            StartedAt = DateTimeOffset.UtcNow
        };
        return _table.AddEntityAsync(entity);
    }

    public async Task RecordResult(Guid runId, object result)
    {
        await foreach (var entity in _table.QueryAsync<AgentRunEntity>(e => e.RowKey == runId.ToString("N")))
        {
            entity.ResultJson = JsonSerializer.Serialize(result, JsonOptions);
            await _table.UpdateEntityAsync(entity, entity.ETag, TableUpdateMode.Merge);
            return;
        }
    }

    public Task<bool> WasAlreadyProcessed(string eventId, string operationType)
        => Task.FromResult(false);
}
