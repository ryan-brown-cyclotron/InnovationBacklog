using Azure.Data.Tables;
using Momentum.Library.Application.Ports;
using Momentum.Library.Domain.Engagement;
using Momentum.Library.Domain.Identity;

namespace Momentum.Library.Infrastructure.AzureStorage;

public sealed class TableSolutionUseRepository : ISolutionUseRepository
{
    private readonly TableClient _table;

    public TableSolutionUseRepository(TableStorageOptions options)
    {
        var service = new TableServiceClient(options.ConnectionString);
        _table = service.GetTableClient(StorageTableNames.SolutionUses);
    }

    public async Task<SolutionUse?> GetById(string id)
    {
        await foreach (var entity in _table.QueryAsync<SolutionUseEntity>(e => e.SolutionUseId == id))
            return ToDomain(entity);
        return null;
    }

    public async Task<IReadOnlyList<SolutionUse>> GetBySolution(string solutionId)
    {
        var results = new List<SolutionUse>();
        await foreach (var entity in _table.QueryAsync<SolutionUseEntity>(e => e.PartitionKey == solutionId))
            results.Add(ToDomain(entity));
        return results;
    }

    public async Task<IReadOnlyList<SolutionUse>> GetByUser(UserId userId)
    {
        var results = new List<SolutionUse>();
        await foreach (var entity in _table.QueryAsync<SolutionUseEntity>(e => e.StartedBy == userId.Value))
            results.Add(ToDomain(entity));
        return results;
    }

    public Task Save(SolutionUse use) =>
        _table.UpsertEntityAsync(ToEntity(use), TableUpdateMode.Replace);

    private static SolutionUseEntity ToEntity(SolutionUse use) => new()
    {
        PartitionKey = use.SolutionId,
        RowKey = use.Id,
        SolutionUseId = use.Id,
        StartedBy = use.StartedBy.Value,
        ProjectName = use.ProjectName,
        Team = use.Team,
        Status = use.Status.ToString(),
        StartedAt = use.StartedAt,
        UpdatedAt = use.UpdatedAt,
        CompletedAt = use.CompletedAt
    };

    private static SolutionUse ToDomain(SolutionUseEntity entity) => new()
    {
        Id = entity.SolutionUseId,
        SolutionId = entity.PartitionKey,
        StartedBy = new UserId(entity.StartedBy),
        ProjectName = entity.ProjectName,
        Team = entity.Team,
        Status = Enum.Parse<SolutionUseStatus>(entity.Status),
        StartedAt = entity.StartedAt,
        UpdatedAt = entity.UpdatedAt,
        CompletedAt = entity.CompletedAt
    };
}
