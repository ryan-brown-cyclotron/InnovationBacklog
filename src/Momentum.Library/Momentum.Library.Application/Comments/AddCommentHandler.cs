using Momentum.Library.Application.Ports;
using Momentum.Library.Domain.Auditing;
using Momentum.Library.Domain.Comments;
using Momentum.Library.Domain.Identity;

namespace Momentum.Library.Application.Comments;

public static class CommentAudiencePermissions
{
    public static bool IsAllowed(CommentAudience audience, Role role) => audience switch
    {
        CommentAudience.ApproversOnly => role is Role.Approver or Role.Administrator,
        _ => true
    };
}

public sealed class AddCommentHandler
{
    private readonly ICommentRepository _comments;
    private readonly IAuditRepository _audit;

    public AddCommentHandler(ICommentRepository comments, IAuditRepository audit)
    {
        _comments = comments;
        _audit = audit;
    }

    public async Task<Comment> Handle(AddCommentCommand command)
    {
        var attachments = command.Attachments ?? Array.Empty<CommentAttachment>();
        // A comment carrying files needs no prose; an empty comment with nothing
        // attached carries nothing at all.
        if (string.IsNullOrWhiteSpace(command.Body) && attachments.Count == 0)
            throw new InvalidOperationException("Comment body is required.");
        if (!CommentAudiencePermissions.IsAllowed(command.Audience, command.AuthorRole))
            throw new InvalidOperationException("Audience is not permitted for the author role.");

        var comment = new Comment
        {
            SubjectId = command.SubjectId,
            SubjectType = command.SubjectType,
            AuthorId = command.AuthorId,
            Audience = command.Audience,
            Body = command.Body?.Trim() ?? string.Empty,
            Attachments = attachments
        };

        await _comments.Add(comment);
        await _audit.Append(new AuditRecord
        {
            Action = "comment.added",
            ResourceType = "comment",
            ResourceId = comment.Id,
            SubjectId = command.SubjectId,
            ActorType = AuditActorType.User,
            ActorId = command.AuthorId.Value,
            Summary = "Added a comment to a subject.",
            Audience = command.Audience == CommentAudience.ApproversOnly
                ? AuditAudience.ApproversOnly
                : AuditAudience.SubmitterAndApprovers,
            Details = new Dictionary<string, string>
            {
                ["audience"] = command.Audience.ToString(),
                ["subjectType"] = command.SubjectType.ToString(),
                ["attachments"] = attachments.Count.ToString()
            }
        });
        return comment;
    }
}
