using Momentum.Library.Application.Ports;
using Momentum.Library.Domain.Auditing;
using Momentum.Library.Domain.Engagement;

namespace Momentum.Library.Application.Engagement;

public sealed class RemoveVoteHandler
{
    private readonly IVoteRepository _votes;
    private readonly IEventPublisher _events;
    private readonly IAuditRepository _audit;

    public RemoveVoteHandler(IVoteRepository votes, IEventPublisher events, IAuditRepository audit)
    {
        _votes = votes;
        _events = events;
        _audit = audit;
    }

    public async Task Handle(RemoveVoteCommand command)
    {
        var vote = await _votes.Get(command.Target, command.UserId)
            ?? throw new InvalidOperationException("No active vote exists for this target and user.");

        await _votes.Remove(vote);
        await _events.Publish(new VoteRemoved(Guid.NewGuid(), vote.Id, vote.Target, vote.UserId, DateTimeOffset.UtcNow));
        await _audit.Append(new AuditRecord
        {
            Action = "vote.removed",
            ResourceType = "vote",
            ResourceId = vote.Id,
            SubjectId = vote.Target.ItemId,
            ActorType = AuditActorType.User,
            ActorId = vote.UserId.Value,
            Summary = "Removed a vote from a hub item.",
            Details = new Dictionary<string, string> { ["target"] = vote.Target.TargetKey }
        });
    }
}
