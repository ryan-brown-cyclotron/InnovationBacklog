using Momentum.Library.Application.Ports;
using Momentum.Library.Domain.Auditing;
using Momentum.Library.Domain.Identity;
using Momentum.Library.Domain.Requests;
using Momentum.Library.Domain.Reviews;

namespace Momentum.Library.Application.Approvals;

public sealed class AcceptRequestHandler
{
    private readonly IRequestRepository _requests;
    private readonly IAcceptanceDecisionRepository _decisions;
    private readonly IEventPublisher _events;
    private readonly IIdentityProvider _identity;
    private readonly IAuditRepository _audit;

    public AcceptRequestHandler(
        IRequestRepository requests,
        IAcceptanceDecisionRepository decisions,
        IEventPublisher events,
        IIdentityProvider identity,
        IAuditRepository audit)
    {
        _requests = requests;
        _decisions = decisions;
        _events = events;
        _identity = identity;
        _audit = audit;
    }

    public async Task<AcceptanceDecision> Handle(AcceptRequestCommand command)
    {
        var role = await _identity.GetCurrentUserRole();
        if (role is not Role.Approver and not Role.Administrator)
            throw new InvalidOperationException("Only approvers may accept requests.");

        var request = await _requests.GetById(command.RequestId) ?? throw new InvalidOperationException("Request not found.");
        if (request.Status != RequestStatus.AwaitingApproval)
            throw new InvalidOperationException("Request is not awaiting approval.");

        var decision = new AcceptanceDecision
        {
            RequestId = command.RequestId,
            ApproverId = command.ApproverId,
            Decision = AcceptanceDecisionType.Accept,
            Rationale = command.Rationale
        };

        var updated = request with { Status = RequestStatus.Accepted, UpdatedAt = DateTimeOffset.UtcNow };
        await _decisions.Save(decision);
        await _requests.Update(updated);
        await _audit.Append(new AuditRecord
        {
            Action = "request.accepted",
            ResourceType = "decision",
            ResourceId = decision.Id,
            SubjectId = command.RequestId,
            ActorType = AuditActorType.User,
            ActorId = command.ApproverId.Value,
            Summary = "Accepted the request.",
            Details = new Dictionary<string, string> { ["decision"] = decision.Decision.ToString() }
        });
        await _events.Publish(new RequestAccepted(Guid.NewGuid(), command.RequestId, command.ApproverId, DateTimeOffset.UtcNow));

        return decision;
    }
}
