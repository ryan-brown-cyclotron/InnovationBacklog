using Momentum.Library.Domain.Engagement;
using Momentum.Library.Domain.Identity;

namespace Momentum.Library.Application.Requests;

public sealed record LinkSolutionToRequestCommand(
    string RequestId,
    string SolutionId,
    RequestSolutionRelationship Relationship,
    UserId AddedBy,
    /// <summary>A reviewer's own link needs no second opinion.</summary>
    Role AddedByRole = Role.Submitter);
