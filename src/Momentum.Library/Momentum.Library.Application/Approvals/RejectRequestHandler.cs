using Momentum.Library.Application.Ports;
using Momentum.Library.Domain.Auditing;
using Momentum.Library.Domain.Identity;
using Momentum.Library.Domain.Requests;
using Momentum.Library.Domain.Reviews;

namespace Momentum.Library.Application.Approvals;

public sealed class RejectRequestHandler
{
    private readonly IRequestRepository _requests;
    private readonly IAcceptanceDecisionRepository _decisions;
    private readonly IIdentityProvider _identity;
    private readonly IAuditRepository _audit;

    public RejectRequestHandler(
        IRequestRepository requests,
        IAcceptanceDecisionRepository decisions,
        IIdentityProvider identity,
        IAuditRepository audit)
    {
        _requests = requests;
        _decisions = decisions;
        _identity = identity;
        _audit = audit;
    }

    public async Task<AcceptanceDecision> Handle(RejectRequestCommand command)
    {
        var role = await _identity.GetCurrentUserRole();
        if (role is not Role.Approver and not Role.Administrator)
            throw new InvalidOperationException("Only approvers may reject requests.");
        if (string.IsNullOrWhiteSpace(command.Rationale))
            throw new InvalidOperationException("A rejection rationale is required.");

        var request = await _requests.GetById(command.RequestId)
            ?? throw new InvalidOperationException("Request not found.");
        if (request.Status != RequestStatus.AwaitingApproval)
            throw new InvalidOperationException("Request is not awaiting approval.");

        var decision = new AcceptanceDecision
        {
            RequestId = command.RequestId,
            ApproverId = command.ApproverId,
            Decision = AcceptanceDecisionType.Reject,
            Rationale = command.Rationale.Trim()
        };

        await _decisions.Save(decision);
        await _requests.Update(request with
        {
            Status = RequestStatus.Rejected,
            UpdatedAt = DateTimeOffset.UtcNow
        });
        await _audit.Append(new AuditRecord
        {
            Action = "request.rejected",
            ResourceType = "decision",
            ResourceId = decision.Id,
            SubjectId = command.RequestId,
            ActorType = AuditActorType.User,
            ActorId = command.ApproverId.Value,
            Summary = "Rejected the request.",
            Details = new Dictionary<string, string> { ["decision"] = decision.Decision.ToString() }
        });

        return decision;
    }
}
