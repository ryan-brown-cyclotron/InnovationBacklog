using Azure.Data.Tables;
using Momentum.Library.Application.Ports;
using Momentum.Library.Domain.Identity;
using Momentum.Library.Domain.Requests;
using Momentum.Library.Domain.Visibility;
using System.Text.Json;

namespace Momentum.Library.Infrastructure.AzureStorage;

public sealed class TableRequestRepository : IRequestRepository
{
    private static readonly JsonSerializerOptions JsonOptions = new();

    private static ItemVisibility ParseVisibility(string? value)
        => Enum.TryParse<ItemVisibility>(value, out var parsed) ? parsed : ItemVisibility.Everyone;

    private static IReadOnlyList<string> ReadTags(string? json)
        => string.IsNullOrWhiteSpace(json)
            ? Array.Empty<string>()
            : JsonSerializer.Deserialize<List<string>>(json, JsonOptions) ?? (IReadOnlyList<string>)Array.Empty<string>();

    private readonly TableClient _table;

    public TableRequestRepository(TableStorageOptions options)
    {
        var service = new TableServiceClient(options.ConnectionString);
        _table = service.GetTableClient(StorageTableNames.Requests);
    }

    public async Task<Request?> GetById(string id)
    {
        await foreach (var entity in _table.QueryAsync<RequestEntity>(e => e.RowKey == id))
            return ToDomain(entity);
        return null;
    }

    public async Task<IReadOnlyList<Request>> GetBySubmitter(UserId submitterId)
    {
        var results = new List<Request>();
        await foreach (var entity in _table.QueryAsync<RequestEntity>(e => e.PartitionKey == submitterId.Value))
            results.Add(ToDomain(entity));
        return results;
    }

    public async Task<IReadOnlyList<Request>> GetByStatus(RequestStatus status)
    {
        var results = new List<Request>();
        var value = status.ToString();
        await foreach (var entity in _table.QueryAsync<RequestEntity>(item => item.Status == value))
            results.Add(ToDomain(entity));
        return results;
    }

    public Task Save(Request request) => _table.AddEntityAsync(ToEntity(request));

    public async Task Update(Request request)
    {
        var existing = await _table.GetEntityAsync<RequestEntity>(request.SubmittedBy.Value, request.Id);
        var entity = ToEntity(request);
        entity.ETag = existing.Value.ETag;
        await _table.UpdateEntityAsync(entity, entity.ETag, TableUpdateMode.Replace);
    }

    private static RequestEntity ToEntity(Request request) => new()
    {
        PartitionKey = request.SubmittedBy.Value,
        RowKey = request.Id,
        SubmittedBy = request.SubmittedBy.Value,
        Status = request.Status.ToString(),
        Title = request.Title,
        Description = request.Description,
        RequestType = request.Type.ToString(),
        Visibility = request.Visibility.ToString(),
        TagsJson = request.Tags.Count == 0 ? null : JsonSerializer.Serialize(request.Tags, JsonOptions),
        CanonicalSolutionId = request.CanonicalSolutionId,
        CreatedAt = request.CreatedAt,
        UpdatedAt = request.UpdatedAt
    };

    private static Request ToDomain(RequestEntity entity) => new()
    {
        Id = entity.RowKey,
        SubmittedBy = new UserId(entity.SubmittedBy),
        Status = Enum.Parse<RequestStatus>(entity.Status),
        Type = Enum.Parse<RequestType>(entity.RequestType),
        Visibility = ParseVisibility(entity.Visibility),
        Tags = ReadTags(entity.TagsJson),
        Title = entity.Title,
        Description = entity.Description,
        CanonicalSolutionId = entity.CanonicalSolutionId,
        CreatedAt = entity.CreatedAt,
        UpdatedAt = entity.UpdatedAt
    };
}
