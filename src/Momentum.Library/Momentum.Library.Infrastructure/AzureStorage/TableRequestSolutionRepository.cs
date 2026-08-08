using Azure;
using Azure.Data.Tables;
using Momentum.Library.Application.Ports;
using Momentum.Library.Domain.Engagement;
using Momentum.Library.Domain.Identity;
using Momentum.Library.Domain.Visibility;

namespace Momentum.Library.Infrastructure.AzureStorage;

public sealed class TableRequestSolutionRepository : IRequestSolutionRepository
{
    private readonly TableClient _table;

    public TableRequestSolutionRepository(TableStorageOptions options)
    {
        var service = new TableServiceClient(options.ConnectionString);
        _table = service.GetTableClient(StorageTableNames.RequestSolutions);
    }

    public async Task<RequestSolution?> Get(string requestId, string solutionId)
    {
        try
        {
            var entity = await _table.GetEntityAsync<RequestSolutionEntity>(requestId, solutionId);
            return ToDomain(requestId, solutionId, entity.Value);
        }
        catch (RequestFailedException ex) when (ex.Status == 404)
        {
            return null;
        }
    }

    public async Task<IReadOnlyList<RequestSolution>> GetByRequest(string requestId)
    {
        var results = new List<RequestSolution>();
        await foreach (var entity in _table.QueryAsync<RequestSolutionEntity>(e => e.PartitionKey == requestId))
            results.Add(ToDomain(requestId, entity.RowKey, entity));
        return results;
    }

    public async Task<IReadOnlyList<RequestSolution>> GetBySolution(string solutionId)
    {
        var results = new List<RequestSolution>();
        await foreach (var entity in _table.QueryAsync<RequestSolutionEntity>(e => e.RowKey == solutionId))
            results.Add(ToDomain(entity.PartitionKey, solutionId, entity));
        return results;
    }

    public Task Save(RequestSolution relationship) =>
        _table.UpsertEntityAsync(ToEntity(relationship), TableUpdateMode.Replace);

    public async Task Remove(RequestSolution relationship)
    {
        try
        {
            await _table.DeleteEntityAsync(relationship.RequestId, relationship.SolutionId);
        }
        catch (RequestFailedException ex) when (ex.Status == 404)
        {
        }
    }

    private static RequestSolutionEntity ToEntity(RequestSolution rel) => new()
    {
        PartitionKey = rel.RequestId,
        RowKey = rel.SolutionId,
        Relationship = rel.Relationship.ToString(),
        Approval = rel.Approval.ToString(),
        AddedBy = rel.AddedBy.Value,
        AddedAt = rel.AddedAt,
        DecidedBy = rel.DecidedBy?.Value,
        DecidedAt = rel.DecidedAt
    };

    private static RequestSolution ToDomain(string requestId, string solutionId, RequestSolutionEntity entity) => new()
    {
        RequestId = requestId,
        SolutionId = solutionId,
        Relationship = Enum.Parse<RequestSolutionRelationship>(entity.Relationship),
        // Links written before review existed were live, so they stay live.
        Approval = Enum.TryParse<ApprovalState>(entity.Approval, out var approval)
            ? approval
            : ApprovalState.Approved,
        AddedBy = new UserId(entity.AddedBy),
        AddedAt = entity.AddedAt,
        DecidedBy = string.IsNullOrEmpty(entity.DecidedBy) ? null : new UserId(entity.DecidedBy),
        DecidedAt = entity.DecidedAt
    };
}
