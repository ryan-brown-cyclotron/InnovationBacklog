using Momentum.Library.Application.Engagement;
using Momentum.Library.Application.Requests;
using Momentum.Library.Domain.Engagement;
using Momentum.Library.Domain.Identity;
using Momentum.Library.Domain.Requests;
using Momentum.Tests.Fakes;

namespace Momentum.Tests.Application;

/// <summary>
/// Participation is not reviewed — ideas and solutions are. Offering to help
/// takes effect immediately, and withdrawing is the only state change left.
/// </summary>
public class ContributionHandlerTests
{
    private static readonly UserId Requester = new("dev@org");
    private static readonly UserId Someone = new("alex@org");

    private readonly InMemoryContributionRepository _contributions = new();
    private readonly InMemoryRequestRepository _requests = new();
    private readonly InMemorySolutionRepository _solutions = new();
    private readonly CapturingEventPublisher _events = new();
    private readonly InMemoryAuditRepository _audit = new();

    private async Task<HubItemReference> SeedRequestTargetAsync()
    {
        var request = await new CreateRequestHandler(_requests, _events, _audit)
            .Handle(new CreateRequestCommand(Requester, RequestType.Backlog, "Idea", "Description"));
        return HubItemReference.ForRequest(request.Id);
    }

    private RequestParticipationHandler CreateRequestHandler()
        => new(_contributions, _requests, _solutions, _events, _audit);

    [Fact]
    public async Task Handle_AcceptsParticipationImmediately()
    {
        var target = await SeedRequestTargetAsync();

        var contribution = await CreateRequestHandler()
            .Handle(new RequestParticipationCommand(target, Requester, "I want to help"));

        Assert.Equal(ContributionStatus.Accepted, contribution.Status);
        Assert.NotNull(await _contributions.GetById(contribution.Id));
        var created = Assert.Single(_events.Published.OfType<ContributionCreated>());
        Assert.Equal(contribution.Id, created.ContributionId);
        Assert.Contains(_audit.Records, r => r.Action == "contribution.created");
    }

    [Fact]
    public async Task Handle_DoesNotLeaveAnythingAwaitingReview()
    {
        var target = await SeedRequestTargetAsync();

        await CreateRequestHandler().Handle(new RequestParticipationCommand(target, Requester, "I want to help"));

        Assert.Empty(await _contributions.GetByStatus(ContributionStatus.Proposed));
    }

    [Fact]
    public async Task Handle_IsIdempotent_WhenAlreadyJoined()
    {
        var target = await SeedRequestTargetAsync();

        var first = await CreateRequestHandler()
            .Handle(new RequestParticipationCommand(target, Requester, "First ask"));
        var second = await CreateRequestHandler()
            .Handle(new RequestParticipationCommand(target, Requester, "Second ask"));

        Assert.Equal(first.Id, second.Id);
        Assert.Single(_events.Published.OfType<ContributionCreated>());
    }

    [Fact]
    public async Task Handle_LetsSomeoneRejoinAfterWithdrawing()
    {
        var target = await SeedRequestTargetAsync();
        var first = await CreateRequestHandler()
            .Handle(new RequestParticipationCommand(target, Requester, "I want to help"));
        await new WithdrawContributionHandler(_contributions, _events, _audit)
            .Handle(new WithdrawContributionCommand(first.Id, Requester));

        var second = await CreateRequestHandler()
            .Handle(new RequestParticipationCommand(target, Requester, "Back again"));

        Assert.NotEqual(first.Id, second.Id);
        Assert.Equal(ContributionStatus.Accepted, second.Status);
    }

    [Fact]
    public async Task Handle_ThrowsWhenTargetMissing()
    {
        await Assert.ThrowsAsync<InvalidOperationException>(
            () => CreateRequestHandler().Handle(
                new RequestParticipationCommand(HubItemReference.ForRequest("missing"), Requester, "Help")));
    }

    [Fact]
    public async Task Handle_ThrowsWhenMessageBlank()
    {
        var target = await SeedRequestTargetAsync();
        await Assert.ThrowsAsync<InvalidOperationException>(
            () => CreateRequestHandler().Handle(new RequestParticipationCommand(target, Requester, "  ")));
    }

    [Fact]
    public async Task Withdraw_OnlyByTheirOwn()
    {
        var target = await SeedRequestTargetAsync();
        var contribution = await CreateRequestHandler()
            .Handle(new RequestParticipationCommand(target, Requester, "I want to help"));
        var handler = new WithdrawContributionHandler(_contributions, _events, _audit);

        await Assert.ThrowsAsync<InvalidOperationException>(
            () => handler.Handle(new WithdrawContributionCommand(contribution.Id, Someone)));

        var updated = await handler.Handle(new WithdrawContributionCommand(contribution.Id, Requester));
        Assert.Equal(ContributionStatus.Withdrawn, updated.Status);
        Assert.Single(_events.Published.OfType<ContributionWithdrawn>());
    }
}
