using Momentum.Library.Domain.Engagement;

namespace Momentum.Library.Domain.Comments;

public sealed record Comment
{
    public string Id { get; init; } = Guid.NewGuid().ToString("N");
    public string SubjectId { get; init; } = string.Empty;
    public HubItemType SubjectType { get; init; } = HubItemType.Request;
    public Identity.UserId AuthorId { get; init; } = null!;
    public CommentAudience Audience { get; init; } = CommentAudience.Authenticated;
    public string Body { get; init; } = string.Empty;
    public IReadOnlyList<CommentAttachment> Attachments { get; init; } = Array.Empty<CommentAttachment>();
    public DateTimeOffset CreatedAt { get; init; } = DateTimeOffset.UtcNow;

    public Comment() { }

    public Engagement.HubItemReference SubjectReference => new(SubjectType, SubjectId);
}
