using Momentum.Library.Application.Ports;
using Momentum.Library.Domain.Auditing;
using Momentum.Library.Domain.Requests;

namespace Momentum.Library.Application.Requests;

public static class RequestStatusExtensions
{
    public static bool IsEditable(this RequestStatus status) => status is not RequestStatus.Accepted and not RequestStatus.PublicationFailed and not RequestStatus.ProjectionFailed;
}

public sealed class UpdateRequestHandler
{
    private readonly IRequestRepository _requests;
    private readonly IAuditRepository _audit;

    public UpdateRequestHandler(IRequestRepository requests, IAuditRepository audit)
    {
        _requests = requests;
        _audit = audit;
    }

    public async Task<Request> Handle(UpdateRequestCommand command)
    {
        var request = await _requests.GetById(command.RequestId) ?? throw new InvalidOperationException("Request not found.");
        if (request.SubmittedBy != command.EditorId)
            throw new InvalidOperationException("Only the submitter may edit the request.");
        if (!request.Status.IsEditable())
            throw new InvalidOperationException("Request is no longer editable.");

        var updated = request with
        {
            Title = command.Title.Trim(),
            Description = command.Description.Trim(),
            UpdatedAt = DateTimeOffset.UtcNow
        };

        await _requests.Update(updated);
        await _audit.Append(new AuditRecord
        {
            Action = "request.updated",
            ResourceType = "request",
            ResourceId = updated.Id,
            SubjectId = updated.Id,
            ActorType = AuditActorType.User,
            ActorId = command.EditorId.Value,
            Summary = "Updated the request title or description."
        });
        return updated;
    }
}
