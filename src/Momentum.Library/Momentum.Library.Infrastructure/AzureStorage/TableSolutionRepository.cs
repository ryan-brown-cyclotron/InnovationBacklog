using Azure.Data.Tables;
using Momentum.Library.Application.Ports;
using Momentum.Library.Domain.Identity;
using Momentum.Library.Domain.Solutions;
using Momentum.Library.Domain.Tagging;
using Momentum.Library.Domain.Visibility;
using System.Text.Json;

namespace Momentum.Library.Infrastructure.AzureStorage;

public sealed class TableSolutionRepository : ISolutionRepository
{
    private readonly TableClient _table;
    private static readonly JsonSerializerOptions JsonOptions = new();

    private static ItemVisibility ParseVisibility(string? value)
        => Enum.TryParse<ItemVisibility>(value, out var parsed) ? parsed : ItemVisibility.Everyone;

    private static IReadOnlyList<string> ReadTags(string? json)
        => string.IsNullOrWhiteSpace(json)
            ? Array.Empty<string>()
            : JsonSerializer.Deserialize<List<string>>(json, JsonOptions) ?? (IReadOnlyList<string>)Array.Empty<string>();

    public TableSolutionRepository(TableStorageOptions options)
    {
        var service = new TableServiceClient(options.ConnectionString);
        _table = service.GetTableClient(StorageTableNames.Solutions);
    }

    public async Task<Solution?> GetById(string id)
    {
        try
        {
            var entity = await _table.GetEntityAsync<SolutionEntity>(id, id);
            return ToDomain(entity.Value);
        }
        catch (Azure.RequestFailedException)
        {
            return null;
        }
    }

    public async Task<IReadOnlyList<Solution>> Search(string query, int skip, int take)
    {
        var results = new List<Solution>();
        await foreach (var entity in _table.QueryAsync<SolutionEntity>())
        {
            var solution = ToDomain(entity);
            if (string.IsNullOrEmpty(query) ||
                entity.Title.Contains(query, StringComparison.OrdinalIgnoreCase) ||
                entity.Description.Contains(query, StringComparison.OrdinalIgnoreCase) ||
                entity.RepositoryOwner.Contains(query, StringComparison.OrdinalIgnoreCase) ||
                entity.RepositoryName.Contains(query, StringComparison.OrdinalIgnoreCase) ||
                TagList.Matches(solution.Tags, query))
            {
                results.Add(solution);
            }
        }
        return results.Skip(skip).Take(take).ToList();
    }

    public Task Save(Solution solution) => _table.AddEntityAsync(ToEntity(solution));

    public async Task Update(Solution solution)
    {
        var existing = await _table.GetEntityAsync<SolutionEntity>(solution.Id, solution.Id);
        var entity = ToEntity(solution);
        entity.ETag = existing.Value.ETag;
        await _table.UpdateEntityAsync(entity, entity.ETag, TableUpdateMode.Replace);
    }

    private static SolutionEntity ToEntity(Solution solution) => new()
    {
        PartitionKey = solution.Id,
        RowKey = solution.Id,
        SubmitterId = solution.SubmittedBy.Value,
        OwnerId = solution.Owner?.Value,
        Title = solution.Title,
        Description = solution.Description,
        Type = solution.Type.ToString(),
        Status = solution.Status.ToString(),
        Visibility = solution.Visibility.ToString(),
        TagsJson = solution.Tags.Count == 0 ? null : JsonSerializer.Serialize(solution.Tags, JsonOptions),
        RepositoryOwner = solution.RepositoryReference.Owner,
        RepositoryName = solution.RepositoryReference.Name,
        RepositoryUrl = solution.RepositoryReference.Url,
        DemoUrl = solution.DemoUrl,
        UseCount = solution.UseCount,
        AdoptedByProjectsJson = JsonSerializer.Serialize(solution.AdoptedByProjects, JsonOptions),
        CreatedAt = solution.CreatedAt,
        UpdatedAt = solution.UpdatedAt,
        PublishedAt = solution.PublishedAt
    };

    private static Solution ToDomain(SolutionEntity entity) => new()
    {
        Id = entity.RowKey,
        SubmittedBy = new UserId(entity.SubmitterId),
        Owner = string.IsNullOrEmpty(entity.OwnerId) ? null : new UserId(entity.OwnerId),
        Title = entity.Title,
        Description = entity.Description,
        Type = Enum.Parse<SolutionType>(entity.Type),
        Status = Enum.Parse<SolutionStatus>(entity.Status),
        Visibility = ParseVisibility(entity.Visibility),
        Tags = ReadTags(entity.TagsJson),
        RepositoryReference = new RepositoryReference(entity.RepositoryOwner, entity.RepositoryName, entity.RepositoryUrl),
        DemoUrl = string.IsNullOrWhiteSpace(entity.DemoUrl) ? null : entity.DemoUrl,
        UseCount = entity.UseCount,
        AdoptedByProjects = JsonSerializer.Deserialize<List<string>>(entity.AdoptedByProjectsJson, JsonOptions) ?? new List<string>(),
        CreatedAt = entity.CreatedAt,
        UpdatedAt = entity.UpdatedAt,
        PublishedAt = entity.PublishedAt
    };
}
