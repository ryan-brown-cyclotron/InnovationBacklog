using Momentum.Library.Application.Ports;
using Momentum.Library.Domain.Auditing;
using Momentum.Library.Domain.Engagement;

namespace Momentum.Library.Application.Engagement;

public sealed class AddVoteHandler
{
    private readonly IVoteRepository _votes;
    private readonly IEventPublisher _events;
    private readonly IAuditRepository _audit;

    public AddVoteHandler(IVoteRepository votes, IEventPublisher events, IAuditRepository audit)
    {
        _votes = votes;
        _events = events;
        _audit = audit;
    }

    public async Task<Vote> Handle(AddVoteCommand command)
    {
        if (string.IsNullOrWhiteSpace(command.UserId.Value))
            throw new InvalidOperationException("A vote requires an authenticated user.");
        if (string.IsNullOrWhiteSpace(command.Target.ItemId))
            throw new InvalidOperationException("A vote requires a target item.");

        var existing = await _votes.Get(command.Target, command.UserId);
        if (existing is not null)
            return existing;

        var vote = new Vote
        {
            Target = command.Target,
            UserId = command.UserId,
        };

        await _votes.Save(vote);
        await _events.Publish(new VoteAdded(Guid.NewGuid(), vote.Id, vote.Target, vote.UserId, DateTimeOffset.UtcNow));
        await _audit.Append(new AuditRecord
        {
            Action = "vote.added",
            ResourceType = "vote",
            ResourceId = vote.Id,
            SubjectId = vote.Target.ItemId,
            ActorType = AuditActorType.User,
            ActorId = vote.UserId.Value,
            Summary = "Voted for a hub item.",
            Details = new Dictionary<string, string> { ["target"] = vote.Target.TargetKey }
        });
        return vote;
    }
}
