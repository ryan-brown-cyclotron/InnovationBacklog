using Azure.Data.Tables;
using Momentum.Library.Application.Ports;
using Momentum.Library.Domain.Identity;
using Momentum.Library.Domain.Reviews;

namespace Momentum.Library.Infrastructure.AzureStorage;

public sealed class TableAcceptanceDecisionRepository : IAcceptanceDecisionRepository
{
    private readonly TableClient _table;

    public TableAcceptanceDecisionRepository(TableStorageOptions options)
    {
        var service = new TableServiceClient(options.ConnectionString);
        _table = service.GetTableClient(StorageTableNames.Decisions);
    }

    public Task Save(AcceptanceDecision decision) => _table.AddEntityAsync(new AcceptanceDecisionEntity
    {
        PartitionKey = decision.RequestId,
        RowKey = decision.Id,
        ApproverId = decision.ApproverId.Value,
        Decision = decision.Decision.ToString(),
        Rationale = decision.Rationale,
        DecidedAt = decision.DecidedAt
    });

    public async Task<IReadOnlyList<AcceptanceDecision>> GetByRequest(string requestId)
    {
        var results = new List<AcceptanceDecision>();
        await foreach (var entity in _table.QueryAsync<AcceptanceDecisionEntity>(item => item.PartitionKey == requestId))
        {
            results.Add(new AcceptanceDecision
            {
                Id = entity.RowKey,
                RequestId = entity.PartitionKey,
                ApproverId = new UserId(entity.ApproverId),
                Decision = Enum.Parse<AcceptanceDecisionType>(entity.Decision),
                Rationale = entity.Rationale,
                DecidedAt = entity.DecidedAt
            });
        }

        return results.OrderBy(item => item.DecidedAt).ToList();
    }
}
