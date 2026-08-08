using Momentum.Library.Application.Ports;
using Momentum.Library.Domain.Auditing;
using Momentum.Library.Domain.Identity;
using Momentum.Library.Domain.Solutions;
using Momentum.Library.Domain.Visibility;

namespace Momentum.Library.Application.Approvals;

public sealed record ReviewSolutionCommand(
    string SolutionId,
    UserId ReviewerId,
    Role ReviewerRole,
    bool Accept,
    string Rationale);

/// <summary>
/// Accepts or rejects a shared solution. Until a reviewer accepts it, a solution
/// is visible only to reviewers and the person who shared it.
/// </summary>
public sealed class ReviewSolutionHandler
{
    private readonly ISolutionRepository _solutions;
    private readonly IEventPublisher _events;
    private readonly IAuditRepository _audit;

    public ReviewSolutionHandler(
        ISolutionRepository solutions,
        IEventPublisher events,
        IAuditRepository audit)
    {
        _solutions = solutions;
        _events = events;
        _audit = audit;
    }

    public async Task<Solution> Handle(ReviewSolutionCommand command)
    {
        if (!ApprovalStates.CanReview(command.ReviewerRole))
            throw new InvalidOperationException("Only an approver can review a solution.");
        if (string.IsNullOrWhiteSpace(command.Rationale))
            throw new InvalidOperationException("A decision needs a rationale — it is the audit evidence.");

        var solution = await _solutions.GetById(command.SolutionId)
            ?? throw new InvalidOperationException("Solution not found.");
        if (ApprovalStates.Of(solution.Status) != ApprovalState.Pending)
            throw new InvalidOperationException("That solution has already been reviewed.");

        var now = DateTimeOffset.UtcNow;
        var reviewed = solution with
        {
            Status = command.Accept ? SolutionStatus.Published : SolutionStatus.Rejected,
            PublishedAt = command.Accept ? now : null,
            UpdatedAt = now
        };
        await _solutions.Update(reviewed);

        await _audit.Append(new AuditRecord
        {
            Action = command.Accept ? "solution.accepted" : "solution.rejected",
            ResourceType = "solution",
            ResourceId = solution.Id,
            SubjectId = solution.Id,
            ActorType = AuditActorType.User,
            ActorId = command.ReviewerId.Value,
            Summary = command.Accept ? "Accepted a solution." : "Rejected a solution.",
            Details = new Dictionary<string, string> { ["rationale"] = command.Rationale.Trim() }
        });

        if (command.Accept)
        {
            await _events.Publish(new SolutionAccepted(Guid.NewGuid(), solution.Id, now));
            await _events.Publish(new SolutionPublished(Guid.NewGuid(), solution.Id, now));
        }

        return reviewed;
    }
}
