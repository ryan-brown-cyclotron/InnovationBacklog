using Momentum.Library.Domain.Comments;
using Momentum.Library.Domain.Engagement;
using Momentum.Library.Domain.Identity;

namespace Momentum.Library.Application.Comments;

public sealed record AddCommentCommand(
    string SubjectId,
    HubItemType SubjectType,
    UserId AuthorId,
    Role AuthorRole,
    CommentAudience Audience,
    string Body,
    IReadOnlyList<CommentAttachment>? Attachments = null);
