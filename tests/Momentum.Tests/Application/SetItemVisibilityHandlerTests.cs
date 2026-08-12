using Momentum.Library.Application.Requests;
using Momentum.Library.Application.Visibility;
using Momentum.Library.Domain.Engagement;
using Momentum.Library.Domain.Identity;
using Momentum.Library.Domain.Requests;
using Momentum.Library.Domain.Solutions;
using Momentum.Library.Domain.Visibility;
using Momentum.Tests.Fakes;

namespace Momentum.Tests.Application;

public class SetItemVisibilityHandlerTests
{
    private static readonly UserId Submitter = new("dev@org");
    private static readonly UserId Admin = new("admin@org");

    private readonly InMemoryRequestRepository _requests = new();
    private readonly InMemorySolutionRepository _solutions = new();
    private readonly CapturingEventPublisher _events = new();
    private readonly InMemoryAuditRepository _audit = new();

    private SetItemVisibilityHandler CreateHandler() => new(_requests, _solutions, _audit);

    private async Task<Request> SeedRequest()
    {
        var creator = new CreateRequestHandler(_requests, _events, _audit);
        return await creator.Handle(new CreateRequestCommand(Submitter, RequestType.Backlog, "Idea", "Description"));
    }

    private async Task<Solution> SeedSolution()
    {
        var creator = new CreateSolutionHandler(_solutions, _events, _audit);
        return await creator.Handle(new CreateSolutionCommand(
            Submitter, "Solution", "Description", SolutionType.CustomSolution, "owner", "repo", "https://example.com/repo"));
    }

    [Fact]
    public async Task NewItemsAreVisibleToEveryoneByDefault()
    {
        var request = await SeedRequest();
        var solution = await SeedSolution();

        Assert.Equal(ItemVisibility.Everyone, request.Visibility);
        Assert.Equal(ItemVisibility.Everyone, solution.Visibility);
    }

    [Fact]
    public async Task Handle_RestrictsAnIdea()
    {
        var request = await SeedRequest();

        await CreateHandler().Handle(new SetItemVisibilityCommand(
            HubItemReference.ForRequest(request.Id), ItemVisibility.Approvers, Admin, Role.Administrator));

        var stored = await _requests.GetById(request.Id);
        Assert.Equal(ItemVisibility.Approvers, stored!.Visibility);
    }

    [Fact]
    public async Task Handle_HidesASolution()
    {
        var solution = await SeedSolution();

        await CreateHandler().Handle(new SetItemVisibilityCommand(
            HubItemReference.ForSolution(solution.Id), ItemVisibility.Hidden, Admin, Role.Administrator));

        var stored = await _solutions.GetById(solution.Id);
        Assert.Equal(ItemVisibility.Hidden, stored!.Visibility);
    }

    [Fact]
    public async Task Handle_RecordsApproverOnlyAuditEvidence()
    {
        var request = await SeedRequest();

        await CreateHandler().Handle(new SetItemVisibilityCommand(
            HubItemReference.ForRequest(request.Id), ItemVisibility.Hidden, Admin, Role.Administrator));

        var record = Assert.Single(_audit.Records, r => r.Action == "item.visibilityChanged");
        Assert.Equal(Momentum.Library.Domain.Auditing.AuditAudience.ApproversOnly, record.Audience);
        Assert.Equal("Everyone", record.Details["from"]);
        Assert.Equal("Hidden", record.Details["to"]);
        Assert.Equal(Admin.Value, record.ActorId);
    }

    [Theory]
    [InlineData(Role.Submitter)]
    [InlineData(Role.Approver)]
    public async Task Handle_RefusesAnyoneButAnAdministrator(Role role)
    {
        var request = await SeedRequest();

        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            CreateHandler().Handle(new SetItemVisibilityCommand(
                HubItemReference.ForRequest(request.Id), ItemVisibility.Hidden, Submitter, role)));

        var stored = await _requests.GetById(request.Id);
        Assert.Equal(ItemVisibility.Everyone, stored!.Visibility);
        Assert.DoesNotContain(_audit.Records, r => r.Action == "item.visibilityChanged");
    }

    [Fact]
    public async Task Handle_ThrowsForAnUnknownItem()
    {
        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            CreateHandler().Handle(new SetItemVisibilityCommand(
                HubItemReference.ForRequest("missing"), ItemVisibility.Hidden, Admin, Role.Administrator)));
    }
}
