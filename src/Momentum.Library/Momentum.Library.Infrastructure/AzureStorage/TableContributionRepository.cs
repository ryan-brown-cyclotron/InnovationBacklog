using Azure.Data.Tables;
using Momentum.Library.Application.Ports;
using Momentum.Library.Domain.Engagement;
using Momentum.Library.Domain.Identity;

namespace Momentum.Library.Infrastructure.AzureStorage;

public sealed class TableContributionRepository : IContributionRepository
{
    private readonly TableClient _table;

    public TableContributionRepository(TableStorageOptions options)
    {
        var service = new TableServiceClient(options.ConnectionString);
        _table = service.GetTableClient(StorageTableNames.Contributions);
    }

    public async Task<Contribution?> GetById(string id)
    {
        await foreach (var entity in _table.QueryAsync<ContributionEntity>(e => e.ContributionId == id))
            return ToDomain(entity);
        return null;
    }

    public async Task<Contribution?> GetOpen(HubItemReference target, UserId userId)
    {
        // "Open" is anything not taken back or turned down — participation is
        // accepted on the spot, so an accepted row still means "already joined".
        var rejected = ContributionStatus.Rejected.ToString();
        var withdrawn = ContributionStatus.Withdrawn.ToString();
        await foreach (var entity in _table.QueryAsync<ContributionEntity>(e =>
            e.PartitionKey == target.TargetKey
            && e.RequestedBy == userId.Value
            && e.Status != rejected
            && e.Status != withdrawn))
            return ToDomain(entity);
        return null;
    }

    public async Task<IReadOnlyList<Contribution>> GetByStatus(ContributionStatus status)
    {
        var statusName = status.ToString();
        var results = new List<Contribution>();
        await foreach (var entity in _table.QueryAsync<ContributionEntity>(e => e.Status == statusName))
            results.Add(ToDomain(entity));
        return results.OrderBy(c => c.CreatedAt).ToList();
    }

    public async Task<IReadOnlyList<Contribution>> GetByUser(UserId userId)
    {
        var results = new List<Contribution>();
        await foreach (var entity in _table.QueryAsync<ContributionEntity>(e => e.RequestedBy == userId.Value))
            results.Add(ToDomain(entity));
        return results.OrderByDescending(c => c.CreatedAt).ToList();
    }

    public Task Save(Contribution contribution) => _table.UpsertEntityAsync(ToEntity(contribution), TableUpdateMode.Replace);

    private static ContributionEntity ToEntity(Contribution contribution) => new()
    {
        PartitionKey = contribution.Target.TargetKey,
        RowKey = contribution.Id,
        ContributionId = contribution.Id,
        ItemType = contribution.Target.ItemType.ToString(),
        ItemId = contribution.Target.ItemId,
        RequestedBy = contribution.RequestedBy.Value,
        Message = contribution.Message,
        Status = contribution.Status.ToString(),
        DecidedBy = contribution.DecidedBy?.Value,
        Rationale = contribution.Rationale,
        CreatedAt = contribution.CreatedAt,
        UpdatedAt = contribution.UpdatedAt,
        DecidedAt = contribution.DecidedAt
    };

    private static Contribution ToDomain(ContributionEntity entity) => new()
    {
        Id = entity.ContributionId,
        Target = new HubItemReference(Enum.Parse<HubItemType>(entity.ItemType), entity.ItemId),
        RequestedBy = new UserId(entity.RequestedBy),
        Message = entity.Message,
        Status = Enum.Parse<ContributionStatus>(entity.Status),
        DecidedBy = entity.DecidedBy is null ? null : new UserId(entity.DecidedBy),
        Rationale = entity.Rationale,
        CreatedAt = entity.CreatedAt,
        UpdatedAt = entity.UpdatedAt,
        DecidedAt = entity.DecidedAt
    };
}
