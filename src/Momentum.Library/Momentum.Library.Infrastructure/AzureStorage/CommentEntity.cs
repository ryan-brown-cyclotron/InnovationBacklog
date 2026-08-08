using Momentum.Library.Domain.Comments;
using Momentum.Library.Domain.Engagement;

namespace Momentum.Library.Infrastructure.AzureStorage;

public sealed class CommentEntity : AzureTableEntityBase
{
    public string SubjectId { get; set; } = null!;
    public string SubjectType { get; set; } = "Request";
    public string AuthorId { get; set; } = null!;
    public string Audience { get; set; } = null!;
    public string Body { get; set; } = null!;

    /// <summary>Serialized <c>CommentAttachment[]</c>; absent on rows written before attachments shipped.</summary>
    public string? AttachmentsJson { get; set; }

    public DateTimeOffset CreatedAt { get; set; }
}
