using Momentum.Library.Domain.Engagement;
using Momentum.Library.Domain.Identity;

namespace Momentum.Library.Application.Comments;

public sealed record GetCommentsQuery(string SubjectId, HubItemType SubjectType, UserId RequestorId, Role RequestorRole);
