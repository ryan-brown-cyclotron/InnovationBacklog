using System.Text.Json;
using Azure.Data.Tables;
using Momentum.Library.Application.Ports;
using Momentum.Library.Domain.Auditing;

namespace Momentum.Library.Infrastructure.AzureStorage;

public sealed class TableAuditRepository : IAuditRepository
{
    private const string Partition = "audit";
    private readonly TableClient _table;

    public TableAuditRepository(TableStorageOptions options)
    {
        var service = new TableServiceClient(options.ConnectionString);
        _table = service.GetTableClient(StorageTableNames.AuditRecords);
    }

    public Task Append(AuditRecord record) => _table.AddEntityAsync(new AuditRecordEntity
    {
        PartitionKey = Partition,
        RowKey = $"{DateTimeOffset.MaxValue.Ticks - record.OccurredAt.Ticks:D19}-{record.Id}",
        Action = record.Action,
        ResourceType = record.ResourceType,
        ResourceId = record.ResourceId,
        SubjectId = record.SubjectId,
        ActorType = record.ActorType.ToString(),
        ActorId = record.ActorId,
        Summary = record.Summary,
        Audience = record.Audience.ToString(),
        DetailsJson = JsonSerializer.Serialize(record.Details),
        OccurredAt = record.OccurredAt
    });

    public async Task<IReadOnlyList<AuditRecord>> GetBySubject(string subjectId)
    {
        var records = new List<AuditRecord>();
        await foreach (var entity in _table.QueryAsync<AuditRecordEntity>(item =>
            item.PartitionKey == Partition && item.SubjectId == subjectId))
        {
            records.Add(Map(entity));
        }

        return records.OrderByDescending(record => record.OccurredAt).ToList();
    }

    public async Task<IReadOnlyList<AuditRecord>> GetRecent(int take)
    {
        var records = new List<AuditRecord>();
        await foreach (var entity in _table.QueryAsync<AuditRecordEntity>(
            item => item.PartitionKey == Partition,
            maxPerPage: Math.Clamp(take, 1, 200)))
        {
            records.Add(Map(entity));
            if (records.Count >= take) break;
        }

        return records.OrderByDescending(record => record.OccurredAt).Take(take).ToList();
    }

    private static AuditRecord Map(AuditRecordEntity entity) => new()
    {
        Id = entity.RowKey[(entity.RowKey.IndexOf('-', StringComparison.Ordinal) + 1)..],
        Action = entity.Action,
        ResourceType = entity.ResourceType,
        ResourceId = entity.ResourceId,
        SubjectId = entity.SubjectId,
        ActorType = Enum.Parse<AuditActorType>(entity.ActorType),
        ActorId = entity.ActorId,
        Summary = entity.Summary,
        Audience = Enum.Parse<AuditAudience>(entity.Audience),
        Details = JsonSerializer.Deserialize<Dictionary<string, string>>(entity.DetailsJson) ?? [],
        OccurredAt = entity.OccurredAt
    };
}
