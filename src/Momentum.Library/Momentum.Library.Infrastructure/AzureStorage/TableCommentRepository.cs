using Azure.Data.Tables;
using Momentum.Library.Application.Ports;
using Momentum.Library.Domain.Comments;
using Momentum.Library.Domain.Engagement;
using Momentum.Library.Domain.Identity;
using System.Text.Json;

namespace Momentum.Library.Infrastructure.AzureStorage;

public sealed class TableCommentRepository : ICommentRepository
{
    private static readonly JsonSerializerOptions JsonOptions = new();
    private readonly TableClient _table;

    public TableCommentRepository(TableStorageOptions options)
    {
        var service = new TableServiceClient(options.ConnectionString);
        _table = service.GetTableClient(StorageTableNames.Comments);
    }

    public Task Add(Comment comment) => _table.AddEntityAsync(ToEntity(comment));

    public async Task<IReadOnlyList<Comment>> GetBySubject(string subjectId, HubItemType subjectType, CommentAudienceFilter filter)
    {
        var results = new List<Comment>();
        await foreach (var entity in _table.QueryAsync<CommentEntity>(e => e.PartitionKey == subjectId && e.SubjectType == subjectType.ToString()))
        {
            var audience = Enum.Parse<CommentAudience>(entity.Audience);
            if (filter.Includes(audience))
            {
                results.Add(ToDomain(entity));
            }
        }
        return results;
    }

    private static CommentEntity ToEntity(Comment comment) => new()
    {
        PartitionKey = comment.SubjectId,
        RowKey = comment.Id,
        SubjectId = comment.SubjectId,
        SubjectType = comment.SubjectType.ToString(),
        AuthorId = comment.AuthorId.Value,
        Audience = comment.Audience.ToString(),
        Body = comment.Body,
        AttachmentsJson = comment.Attachments.Count == 0
            ? null
            : JsonSerializer.Serialize(comment.Attachments, JsonOptions),
        CreatedAt = comment.CreatedAt
    };

    private static Comment ToDomain(CommentEntity entity) => new()
    {
        Id = entity.RowKey,
        SubjectId = entity.SubjectId,
        SubjectType = Enum.Parse<HubItemType>(entity.SubjectType),
        AuthorId = new UserId(entity.AuthorId),
        Audience = Enum.Parse<CommentAudience>(entity.Audience),
        Body = entity.Body,
        Attachments = ReadAttachments(entity.AttachmentsJson),
        CreatedAt = entity.CreatedAt
    };

    private static IReadOnlyList<CommentAttachment> ReadAttachments(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return Array.Empty<CommentAttachment>();
        return JsonSerializer.Deserialize<List<CommentAttachment>>(json, JsonOptions)
            ?? (IReadOnlyList<CommentAttachment>)Array.Empty<CommentAttachment>();
    }
}
