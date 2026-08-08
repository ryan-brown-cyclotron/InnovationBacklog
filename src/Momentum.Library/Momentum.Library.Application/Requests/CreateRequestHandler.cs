using Momentum.Library.Application.Ports;
using Momentum.Library.Domain.Auditing;
using Momentum.Library.Domain.Requests;
using Momentum.Library.Domain.Tagging;

namespace Momentum.Library.Application.Requests;

public sealed class CreateRequestHandler
{
    private readonly IRequestRepository _requests;
    private readonly IEventPublisher _events;
    private readonly IAuditRepository _audit;

    public CreateRequestHandler(IRequestRepository requests, IEventPublisher events, IAuditRepository audit)
    {
        _requests = requests;
        _events = events;
        _audit = audit;
    }

    public async Task<Request> Handle(CreateRequestCommand command)
    {
        if (string.IsNullOrWhiteSpace(command.Title))
            throw new InvalidOperationException("Title is required.");
        if (string.IsNullOrWhiteSpace(command.Description))
            throw new InvalidOperationException("Description is required.");

        var request = new Request
        {
            Type = command.Type,
            SubmittedBy = command.SubmittedBy,
            Title = command.Title.Trim(),
            Description = command.Description.Trim(),
            Tags = TagList.Normalize(command.Tags),
            Status = RequestStatus.Created
        };

        await _requests.Save(request);
        await _audit.Append(new AuditRecord
        {
            Action = "request.created",
            ResourceType = "request",
            ResourceId = request.Id,
            SubjectId = request.Id,
            ActorType = AuditActorType.User,
            ActorId = command.SubmittedBy.Value,
            Summary = $"Created a {command.Type.ToString().ToLowerInvariant()} request.",
            Details = new Dictionary<string, string> { ["requestType"] = command.Type.ToString() }
        });
        await _events.Publish(new RequestSubmitted(Guid.NewGuid(), request.Id, command.Type, DateTimeOffset.UtcNow));

        return request;
    }
}
