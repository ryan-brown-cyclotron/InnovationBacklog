using Momentum.Library.Application.Ports;
using Momentum.Library.Domain.Auditing;
using Momentum.Library.Domain.Engagement;
using Momentum.Library.Domain.Identity;
using Momentum.Library.Domain.Visibility;

namespace Momentum.Library.Application.Approvals;

public sealed record ReviewLinkCommand(
    string RequestId,
    string SolutionId,
    UserId ReviewerId,
    Role ReviewerRole,
    bool Accept,
    string Rationale);

/// <summary>
/// Accepts or rejects the claim that a solution answers an idea. A rejected link
/// is removed rather than kept as a tombstone — the claim simply was not true,
/// and anyone can propose it again.
/// </summary>
public sealed class ReviewLinkHandler
{
    private readonly IRequestSolutionRepository _relationships;
    private readonly IAuditRepository _audit;

    public ReviewLinkHandler(IRequestSolutionRepository relationships, IAuditRepository audit)
    {
        _relationships = relationships;
        _audit = audit;
    }

    public async Task Handle(ReviewLinkCommand command)
    {
        if (!ApprovalStates.CanReview(command.ReviewerRole))
            throw new InvalidOperationException("Only an approver can review a link.");
        if (string.IsNullOrWhiteSpace(command.Rationale))
            throw new InvalidOperationException("A decision needs a rationale — it is the audit evidence.");

        var link = await _relationships.Get(command.RequestId, command.SolutionId)
            ?? throw new InvalidOperationException("Link not found.");
        if (link.Approval != ApprovalState.Pending)
            throw new InvalidOperationException("That link has already been reviewed.");

        var now = DateTimeOffset.UtcNow;
        if (command.Accept)
        {
            await _relationships.Save(link with
            {
                Approval = ApprovalState.Approved,
                DecidedBy = command.ReviewerId,
                DecidedAt = now
            });
        }
        else
        {
            await _relationships.Remove(link);
        }

        await _audit.Append(new AuditRecord
        {
            Action = command.Accept ? "request.solutionLinkAccepted" : "request.solutionLinkRejected",
            ResourceType = "requestSolution",
            ResourceId = $"{command.RequestId}:{command.SolutionId}",
            SubjectId = command.RequestId,
            ActorType = AuditActorType.User,
            ActorId = command.ReviewerId.Value,
            Summary = command.Accept
                ? "Accepted a solution linked to an idea."
                : "Rejected a solution linked to an idea.",
            Details = new Dictionary<string, string>
            {
                ["solutionId"] = command.SolutionId,
                ["rationale"] = command.Rationale.Trim()
            }
        });
    }
}
