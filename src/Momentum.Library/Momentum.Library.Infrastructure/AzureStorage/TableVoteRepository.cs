using Azure.Data.Tables;
using Momentum.Library.Application.Ports;
using Momentum.Library.Domain.Engagement;
using Momentum.Library.Domain.Identity;

namespace Momentum.Library.Infrastructure.AzureStorage;

public sealed class TableVoteRepository : IVoteRepository
{
    private readonly TableClient _table;

    public TableVoteRepository(TableStorageOptions options)
    {
        var service = new TableServiceClient(options.ConnectionString);
        _table = service.GetTableClient(StorageTableNames.Votes);
    }

    public async Task<Vote?> Get(HubItemReference target, UserId userId)
    {
        try
        {
            var entity = await _table.GetEntityAsync<VoteEntity>(target.TargetKey, userId.Value);
            return ToDomain(entity.Value);
        }
        catch (Azure.RequestFailedException ex) when (ex.Status == 404)
        {
            return null;
        }
    }

    public async Task<IReadOnlyList<Vote>> GetByTarget(HubItemReference target)
    {
        var results = new List<Vote>();
        await foreach (var entity in _table.QueryAsync<VoteEntity>(e => e.PartitionKey == target.TargetKey))
            results.Add(ToDomain(entity));
        return results;
    }

    public async Task<IReadOnlyList<Vote>> GetByUser(UserId userId)
    {
        var results = new List<Vote>();
        await foreach (var entity in _table.QueryAsync<VoteEntity>(e => e.UserId == userId.Value))
            results.Add(ToDomain(entity));
        return results;
    }

    public Task Save(Vote vote) => _table.UpsertEntityAsync(ToEntity(vote), TableUpdateMode.Replace);

    public async Task Remove(Vote vote)
    {
        try
        {
            await _table.DeleteEntityAsync(vote.Target.TargetKey, vote.UserId.Value);
        }
        catch (Azure.RequestFailedException ex) when (ex.Status == 404)
        {
        }
    }

    private static VoteEntity ToEntity(Vote vote) => new()
    {
        PartitionKey = vote.Target.TargetKey,
        RowKey = vote.UserId.Value,
        VoteId = vote.Id,
        ItemType = vote.Target.ItemType.ToString(),
        ItemId = vote.Target.ItemId,
        UserId = vote.UserId.Value,
        CreatedAt = vote.CreatedAt
    };

    private static Vote ToDomain(VoteEntity entity)
    {
        var itemType = Enum.Parse<HubItemType>(entity.ItemType);
        return new Vote
        {
            Id = entity.VoteId,
            Target = new HubItemReference(itemType, entity.ItemId),
            UserId = new UserId(entity.UserId),
            CreatedAt = entity.CreatedAt
        };
    }
}
