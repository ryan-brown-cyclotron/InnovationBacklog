using Momentum.Library.Application.Ports;
using Momentum.Library.Domain.Auditing;
using Momentum.Library.Domain.Engagement;

namespace Momentum.Library.Application.Engagement;

public sealed class WithdrawContributionHandler
{
    private readonly IContributionRepository _contributions;
    private readonly IEventPublisher _events;
    private readonly IAuditRepository _audit;

    public WithdrawContributionHandler(
        IContributionRepository contributions,
        IEventPublisher events,
        IAuditRepository audit)
    {
        _contributions = contributions;
        _events = events;
        _audit = audit;
    }

    public async Task<Contribution> Handle(WithdrawContributionCommand command)
    {
        var contribution = await _contributions.GetById(command.ContributionId)
            ?? throw new InvalidOperationException("Participation request not found.");
        if (contribution.RequestedBy.Value != command.UserId.Value)
            throw new InvalidOperationException("Only the person who joined may step back out.");
        // Participation is accepted on the spot, so withdrawing means leaving
        // something you already joined — not taking back a pending request.
        if (contribution.Status is ContributionStatus.Withdrawn or ContributionStatus.Rejected)
            throw new InvalidOperationException("You are not currently participating in that.");

        var now = DateTimeOffset.UtcNow;
        var updated = contribution with
        {
            Status = ContributionStatus.Withdrawn,
            UpdatedAt = now
        };

        await _contributions.Save(updated);
        await _events.Publish(new ContributionWithdrawn(Guid.NewGuid(), updated.Id, updated.Target, updated.RequestedBy, now));
        await _audit.Append(new AuditRecord
        {
            Action = "contribution.withdrawn",
            ResourceType = "contribution",
            ResourceId = updated.Id,
            SubjectId = updated.Target.ItemId,
            ActorType = AuditActorType.User,
            ActorId = updated.RequestedBy.Value,
            Summary = "Stepped back from a hub item.",
            Details = new Dictionary<string, string> { ["target"] = updated.Target.TargetKey }
        });
        return updated;
    }
}
