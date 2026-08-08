using Momentum.Library.Application.Ports;
using Momentum.Library.Domain.Auditing;
using Momentum.Library.Domain.Engagement;

namespace Momentum.Library.Application.Engagement;

public sealed class RequestParticipationHandler
{
    private readonly IContributionRepository _contributions;
    private readonly IRequestRepository _requests;
    private readonly ISolutionRepository _solutions;
    private readonly IEventPublisher _events;
    private readonly IAuditRepository _audit;

    public RequestParticipationHandler(
        IContributionRepository contributions,
        IRequestRepository requests,
        ISolutionRepository solutions,
        IEventPublisher events,
        IAuditRepository audit)
    {
        _contributions = contributions;
        _requests = requests;
        _solutions = solutions;
        _events = events;
        _audit = audit;
    }

    public async Task<Contribution> Handle(RequestParticipationCommand command)
    {
        if (string.IsNullOrWhiteSpace(command.UserId.Value))
            throw new InvalidOperationException("A participation request requires an authenticated user.");
        if (string.IsNullOrWhiteSpace(command.Message))
            throw new InvalidOperationException("A participation request requires a message.");

        var targetExists = command.Target.ItemType == HubItemType.Request
            ? await _requests.GetById(command.Target.ItemId) is not null
            : await _solutions.GetById(command.Target.ItemId) is not null;
        if (!targetExists)
            throw new InvalidOperationException("Target item not found.");

        var existing = await _contributions.GetOpen(command.Target, command.UserId);
        if (existing is not null)
            return existing;

        // Offering to help needs no permission. Ideas and solutions are reviewed;
        // people joining in are not.
        var contribution = new Contribution
        {
            Target = command.Target,
            RequestedBy = command.UserId,
            Message = command.Message.Trim(),
            Status = ContributionStatus.Accepted
        };

        await _contributions.Save(contribution);
        await _events.Publish(new ContributionCreated(Guid.NewGuid(), contribution.Id, contribution.Target, contribution.RequestedBy, DateTimeOffset.UtcNow));
        await _audit.Append(new AuditRecord
        {
            Action = "contribution.created",
            ResourceType = "contribution",
            ResourceId = contribution.Id,
            SubjectId = contribution.Target.ItemId,
            ActorType = AuditActorType.User,
            ActorId = contribution.RequestedBy.Value,
            Summary = "Joined in on a hub item.",
            Details = new Dictionary<string, string> { ["target"] = contribution.Target.TargetKey }
        });
        return contribution;
    }
}
