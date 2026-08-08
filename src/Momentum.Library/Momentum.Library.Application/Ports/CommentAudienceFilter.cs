using Momentum.Library.Domain.Comments;
using Momentum.Library.Domain.Identity;

namespace Momentum.Library.Application.Ports;

public sealed record CommentAudienceFilter(CommentAudience MaximumAudience)
{
    public static CommentAudienceFilter ForRole(Role role)
    {
        var max = role switch
        {
            Role.Approver or Role.Administrator => CommentAudience.ApproversOnly,
            Role.Submitter => CommentAudience.SubmitterAndApprovers,
            _ => CommentAudience.Authenticated
        };
        return new CommentAudienceFilter(max);
    }

    public bool Includes(CommentAudience audience) => audience <= MaximumAudience;
}
