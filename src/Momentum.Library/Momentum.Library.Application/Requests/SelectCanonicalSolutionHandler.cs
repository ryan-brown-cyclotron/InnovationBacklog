using Momentum.Library.Application.Ports;
using Momentum.Library.Domain.Auditing;
using Momentum.Library.Domain.Engagement;

namespace Momentum.Library.Application.Requests;

public sealed class SelectCanonicalSolutionHandler
{
    private readonly IRequestRepository _requests;
    private readonly ISolutionRepository _solutions;
    private readonly IRequestSolutionRepository _relationships;
    private readonly IEventPublisher _events;
    private readonly IAuditRepository _audit;

    public SelectCanonicalSolutionHandler(
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

    public async Task Handle(SelectCanonicalSolutionCommand command)
    {
        var request = await _requests.GetById(command.RequestId)
            ?? throw new InvalidOperationException("Request not found.");
        var solution = await _solutions.GetById(command.SolutionId)
            ?? throw new InvalidOperationException("Solution not found.");

        var relationship = await _relationships.Get(command.RequestId, command.SolutionId);
        if (relationship is null)
        {
            var created = new RequestSolution
            {
                RequestId = command.RequestId,
                SolutionId = command.SolutionId,
                Relationship = RequestSolutionRelationship.Existing,
                AddedBy = command.SelectorId,
                AddedAt = DateTimeOffset.UtcNow
            };
            await _relationships.Save(created);
        }

        if (request.CanonicalSolutionId == command.SolutionId)
        {
            await _audit.Append(new AuditRecord
            {
                Action = "request.canonicalReaffirmed",
                ResourceType = "request",
                ResourceId = request.Id,
                SubjectId = request.Id,
                ActorType = AuditActorType.User,
                ActorId = command.SelectorId.Value,
                Summary = $"Canonical solution already {solution.Title}.",
                Details = new Dictionary<string, string> { ["solutionId"] = command.SolutionId }
            });
            return;
        }

        var updated = request with { CanonicalSolutionId = command.SolutionId, UpdatedAt = DateTimeOffset.UtcNow };
        await _requests.Update(updated);

        var previous = request.CanonicalSolutionId;
        if (!string.IsNullOrEmpty(previous))
        {
            await _events.Publish(new CanonicalSolutionCleared(Guid.NewGuid(), command.RequestId, DateTimeOffset.UtcNow));
        }

        await _events.Publish(new CanonicalSolutionSelected(
            Guid.NewGuid(), command.RequestId, command.SolutionId, DateTimeOffset.UtcNow));
        await _audit.Append(new AuditRecord
        {
            Action = "request.canonicalSelected",
            ResourceType = "request",
            ResourceId = request.Id,
            SubjectId = request.Id,
            ActorType = AuditActorType.User,
            ActorId = command.SelectorId.Value,
            Summary = $"Selected {solution.Title} as canonical solution.",
            Details = new Dictionary<string, string>
            {
                ["solutionId"] = command.SolutionId,
                ["previousSolutionId"] = previous ?? string.Empty
            }
        });
    }
}
