using Momentum.Library.Application.Ports;
using Momentum.Library.Domain.Auditing;
using Momentum.Library.Domain.Engagement;

namespace Momentum.Library.Application.Requests;

public sealed class UnlinkSolutionFromRequestHandler
{
    private readonly IRequestSolutionRepository _relationships;
    private readonly IEventPublisher _events;
    private readonly IAuditRepository _audit;

    public UnlinkSolutionFromRequestHandler(
        IRequestSolutionRepository relationships,
        IEventPublisher events,
        IAuditRepository audit)
    {
        _relationships = relationships;
        _events = events;
        _audit = audit;
    }

    public async Task Handle(UnlinkSolutionFromRequestCommand command)
    {
        var existing = await _relationships.Get(command.RequestId, command.SolutionId)
            ?? throw new InvalidOperationException("No relationship exists between this request and solution.");

        await _relationships.Remove(existing);
        await _events.Publish(new SolutionUnlinkedFromRequest(
            Guid.NewGuid(), command.RequestId, command.SolutionId, DateTimeOffset.UtcNow));
        await _audit.Append(new AuditRecord
        {
            Action = "request.solutionUnlinked",
            ResourceType = "requestSolution",
            ResourceId = $"{command.RequestId}:{command.SolutionId}",
            SubjectId = command.RequestId,
            ActorType = AuditActorType.User,
            ActorId = command.RemovedBy.Value,
            Summary = "Unlinked solution from request.",
            Details = new Dictionary<string, string> { ["solutionId"] = command.SolutionId }
        });
    }
}
