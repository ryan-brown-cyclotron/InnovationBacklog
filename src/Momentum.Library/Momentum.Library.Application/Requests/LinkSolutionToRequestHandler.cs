using Momentum.Library.Application.Ports;
using Momentum.Library.Domain.Auditing;
using Momentum.Library.Domain.Engagement;
using Momentum.Library.Domain.Visibility;

namespace Momentum.Library.Application.Requests;

public sealed class LinkSolutionToRequestHandler
{
    private readonly IRequestRepository _requests;
    private readonly ISolutionRepository _solutions;
    private readonly IRequestSolutionRepository _relationships;
    private readonly IEventPublisher _events;
    private readonly IAuditRepository _audit;

    public LinkSolutionToRequestHandler(
        IRequestRepository requests,
        ISolutionRepository solutions,
        IRequestSolutionRepository relationships,
        IEventPublisher events,
        IAuditRepository audit)
    {
        _requests = requests;
        _solutions = solutions;
        _relationships = relationships;
        _events = events;
        _audit = audit;
    }

    public async Task<RequestSolution> Handle(LinkSolutionToRequestCommand command)
    {
        if (string.IsNullOrWhiteSpace(command.RequestId))
            throw new InvalidOperationException("RequestId is required.");
        if (string.IsNullOrWhiteSpace(command.SolutionId))
            throw new InvalidOperationException("SolutionId is required.");

        var request = await _requests.GetById(command.RequestId)
            ?? throw new InvalidOperationException("Request not found.");
        var solution = await _solutions.GetById(command.SolutionId)
            ?? throw new InvalidOperationException("Solution not found.");

        var existing = await _relationships.Get(command.RequestId, command.SolutionId);
        if (existing is not null)
            return existing;

        var reviewer = ApprovalStates.CanReview(command.AddedByRole);
        var link = new RequestSolution
        {
            RequestId = command.RequestId,
            SolutionId = command.SolutionId,
            Relationship = command.Relationship,
            Approval = reviewer ? ApprovalState.Approved : ApprovalState.Pending,
            AddedBy = command.AddedBy,
            AddedAt = DateTimeOffset.UtcNow,
            DecidedBy = reviewer ? command.AddedBy : null,
            DecidedAt = reviewer ? DateTimeOffset.UtcNow : null
        };

        await _relationships.Save(link);
        await _events.Publish(new SolutionLinkedToRequest(
            Guid.NewGuid(), command.RequestId, command.SolutionId, command.Relationship, command.AddedBy, DateTimeOffset.UtcNow));
        await _audit.Append(new AuditRecord
        {
            Action = "request.solutionLinked",
            ResourceType = "requestSolution",
            ResourceId = $"{command.RequestId}:{command.SolutionId}",
            SubjectId = command.RequestId,
            ActorType = AuditActorType.User,
            ActorId = command.AddedBy.Value,
            Summary = $"Linked solution {solution.Title} to request {request.Title}.",
            Details = new Dictionary<string, string>
            {
                ["relationship"] = command.Relationship.ToString(),
                ["solutionId"] = command.SolutionId
            }
        });
        return link;
    }
}
