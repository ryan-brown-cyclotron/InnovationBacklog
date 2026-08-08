using Momentum.Library.Application.Engagement;
using Momentum.Library.Domain.Engagement;
using Momentum.Library.Domain.Identity;
using Momentum.Tests.Fakes;

namespace Momentum.Tests.Application;

public class AddVoteHandlerTests
{
    private static readonly UserId Voter = new("dev@localhost");
    private static readonly HubItemReference Target = HubItemReference.ForRequest("item1");

    private readonly InMemoryVoteRepository _votes = new();
    private readonly CapturingEventPublisher _events = new();
    private readonly InMemoryAuditRepository _audit = new();

    private AddVoteHandler CreateHandler() => new(_votes, _events, _audit);

    [Fact]
    public async Task Handle_PersistsVoteAndPublishesVoteAdded()
    {
        var vote = await CreateHandler().Handle(new AddVoteCommand(Target, Voter));

        Assert.False(string.IsNullOrEmpty(vote.Id));
        var stored = await _votes.Get(Target, Voter);
        Assert.NotNull(stored);

        var added = Assert.Single(_events.Published.OfType<VoteAdded>());
        Assert.Equal(vote.Id, added.VoteId);
        Assert.Equal(Target.TargetKey, added.Target.TargetKey);
        Assert.Equal(Voter, added.UserId);

        Assert.Contains(_audit.Records, r => r.Action == "vote.added");
    }

    [Fact]
    public async Task Handle_IsIdempotent_WhenVoteAlreadyExists()
    {
        await CreateHandler().Handle(new AddVoteCommand(Target, Voter));
        var second = await CreateHandler().Handle(new AddVoteCommand(Target, Voter));

        var votes = await _votes.GetByTarget(Target);
        Assert.Single(votes);
        Assert.Single(_events.Published.OfType<VoteAdded>());
        Assert.NotNull(second);
    }

    [Fact]
    public async Task Handle_RejectsEmptyUserId()
    {
        await Assert.ThrowsAsync<InvalidOperationException>(
            () => CreateHandler().Handle(new AddVoteCommand(Target, new UserId(""))));
    }

    [Fact]
    public async Task Handle_RejectsEmptyItemId()
    {
        await Assert.ThrowsAsync<InvalidOperationException>(
            () => CreateHandler().Handle(new AddVoteCommand(HubItemReference.ForRequest(""), Voter)));
    }

    [Fact]
    public async Task Handle_AllowsDifferentUsersOnSameTarget()
    {
        await CreateHandler().Handle(new AddVoteCommand(Target, Voter));
        await CreateHandler().Handle(new AddVoteCommand(Target, new UserId("alex@org")));

        var votes = await _votes.GetByTarget(Target);
        Assert.Equal(2, votes.Count);
    }

    [Fact]
    public async Task Handle_AllowsSameUserOnDifferentTargets()
    {
        await CreateHandler().Handle(new AddVoteCommand(Target, Voter));
        await CreateHandler().Handle(new AddVoteCommand(HubItemReference.ForRequest("item2"), Voter));

        var votes = await _votes.GetByUser(Voter);
        Assert.Equal(2, votes.Count);
    }
}

public class RemoveVoteHandlerTests
{
    private static readonly UserId Voter = new("dev@localhost");
    private static readonly HubItemReference Target = HubItemReference.ForRequest("item1");

    private readonly InMemoryVoteRepository _votes = new();
    private readonly CapturingEventPublisher _events = new();
    private readonly InMemoryAuditRepository _audit = new();

    [Fact]
    public async Task Handle_RemovesVoteAndPublishesVoteRemoved()
    {
        var addHandler = new AddVoteHandler(_votes, _events, _audit);
        await addHandler.Handle(new AddVoteCommand(Target, Voter));

        var removeHandler = new RemoveVoteHandler(_votes, _events, _audit);
        await removeHandler.Handle(new RemoveVoteCommand(Target, Voter));

        var remaining = await _votes.Get(Target, Voter);
        Assert.Null(remaining);

        var removed = Assert.Single(_events.Published.OfType<VoteRemoved>());
        Assert.Equal(Target.TargetKey, removed.Target.TargetKey);

        Assert.Contains(_audit.Records, r => r.Action == "vote.removed");
    }

    [Fact]
    public async Task Handle_ThrowsWhenNoVoteExists()
    {
        var removeHandler = new RemoveVoteHandler(_votes, _events, _audit);
        await Assert.ThrowsAsync<InvalidOperationException>(
            () => removeHandler.Handle(new RemoveVoteCommand(Target, Voter)));
    }
}
