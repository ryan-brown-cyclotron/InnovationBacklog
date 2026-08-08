using Momentum.Library.Application.Ports;
using Momentum.Library.Domain.Auditing;
using Momentum.Library.Domain.Requests;

namespace Momentum.Library.Application.Requests;

public sealed class PublishRequestHandler
{
    private readonly IRequestRepository _requests;
    private readonly IAuditRepository _audit;

    public PublishRequestHandler(IRequestRepository requests, IAuditRepository audit)
    {
        _requests = requests;
        _audit = audit;
    }

    public async Task<Request> Handle(PublishRequestCommand command)
    {
        var request = await _requests.GetById(command.RequestId)
            ?? throw new InvalidOperationException("Request not found.");
        if (request.Status != RequestStatus.Accepted)
            throw new InvalidOperationException("Request must be accepted before publication.");
        if (string.IsNullOrWhiteSpace(command.Result.Title) || string.IsNullOrWhiteSpace(command.Result.Description))
            throw new InvalidOperationException("Publication content is invalid.");

        var updated = request with
        {
            Title = command.Result.Title.Trim(),
            Description = command.Result.Description.Trim(),
            Status = RequestStatus.Accepted,
            UpdatedAt = DateTimeOffset.UtcNow
        };

        await _requests.Update(updated);
        await _audit.Append(new AuditRecord
        {
            Action = "request.published",
            ResourceType = "request",
            ResourceId = updated.Id,
            SubjectId = updated.Id,
            ActorType = AuditActorType.System,
            ActorId = "momentum-worker",
            Summary = "Published the accepted request."
        });
        return updated;
    }
}
