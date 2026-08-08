using Momentum.Library.Application.Ports;
using Momentum.Library.Domain.Comments;

namespace Momentum.Library.Application.Comments;

public sealed class GetCommentsHandler
{
    private readonly ICommentRepository _comments;

    public GetCommentsHandler(ICommentRepository comments)
    {
        _comments = comments;
    }

    public Task<IReadOnlyList<Comment>> Handle(GetCommentsQuery query)
    {
        var filter = CommentAudienceFilter.ForRole(query.RequestorRole);
        return _comments.GetBySubject(query.SubjectId, query.SubjectType, filter);
    }
}
