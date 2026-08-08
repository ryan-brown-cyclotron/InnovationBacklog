using Momentum.Library.Application.Approvals;
using Momentum.Library.Application.Requests;
using Momentum.Library.Domain.Engagement;
using Momentum.Library.Domain.Identity;
using Momentum.Library.Domain.Requests;
using Momentum.Library.Domain.Reviews;
using Momentum.Library.Domain.Solutions;
using Momentum.Tests.Fakes;

namespace Momentum.Tests.Application;

public class CreateRequestHandlerTests
{
    private static readonly UserId Submitter = new("dev@org");

    private readonly InMemoryRequestRepository _requests = new();
    private readonly CapturingEventPublisher _events = new();
    private readonly InMemoryAuditRepository _audit = new();

    private CreateRequestHandler CreateHandler() => new(_requests, _events, _audit);

    [Fact]
    public async Task Handle_PersistsRequestAndPublishesSubmitted()
    {
        var result = await CreateHandler().Handle(new CreateRequestCommand(Submitter, RequestType.Backlog, "Need", "Description"));

        Assert.NotNull(await _requests.GetById(result.Id));
        Assert.IsType<RequestSubmitted>(_events.Published.Single());
        Assert.Contains(_audit.Records, r => r.Action == "request.created");
    }

    [Fact]
    public async Task Handle_RejectsEmptyTitle()
    {
        await Assert.ThrowsAsync<InvalidOperationException>(
            () => CreateHandler().Handle(new CreateRequestCommand(Submitter, RequestType.Backlog, "", "Description")));
    }

    [Fact]
    public async Task Handle_RejectsEmptyDescription()
    {
        await Assert.ThrowsAsync<InvalidOperationException>(
            () => CreateHandler().Handle(new CreateRequestCommand(Submitter, RequestType.Backlog, "Title", "")));
    }
}

public class AcceptRequestHandlerTests
{
    private static readonly UserId Submitter = new("dev@org");
    private static readonly UserId Approver = new("approver@org");

    private readonly InMemoryRequestRepository _requests = new();
    private readonly InMemoryAcceptanceDecisionRepository _decisions = new();
    private readonly CapturingEventPublisher _events = new();
    private readonly InMemoryAuditRepository _audit = new();

    private class FakeIdentity : Momentum.Library.Application.Ports.IIdentityProvider
    {
        public UserId UserId { get; set; } = new("dev@org");
        public Momentum.Library.Domain.Identity.Role Role { get; set; } = Momentum.Library.Domain.Identity.Role.Approver;
        public Task<UserId> GetCurrentUserId() => Task.FromResult(UserId);
        public Task<Momentum.Library.Domain.Identity.Role> GetCurrentUserRole() => Task.FromResult(Role);
    }

    private async Task<Request> SeedAwaitingApprovalAsync()
    {
        var creator = new CreateRequestHandler(_requests, _events, _audit);
        var request = await creator.Handle(new CreateRequestCommand(Submitter, RequestType.Backlog, "Need", "Description"));
        var awaiting = request with { Status = RequestStatus.AwaitingApproval };
        await _requests.Update(awaiting);
        return awaiting;
    }

    [Fact]
    public async Task Handle_ApprovesRequestAndStoresDecision()
    {
        var request = await SeedAwaitingApprovalAsync();
        var identity = new FakeIdentity { UserId = Approver, Role = Momentum.Library.Domain.Identity.Role.Approver };
        var handler = new AcceptRequestHandler(_requests, _decisions, _events, identity, _audit);

        var decision = await handler.Handle(new AcceptRequestCommand(request.Id, Approver, "Looks good"));

        Assert.Equal(AcceptanceDecisionType.Accept, decision.Decision);
        var updated = await _requests.GetById(request.Id);
        Assert.Equal(RequestStatus.Accepted, updated!.Status);
        Assert.Single(_decisions.Stored);
        Assert.Contains(_events.Published.OfType<RequestAccepted>(), e => e.RequestId == request.Id);
    }

    [Fact]
    public async Task Handle_RejectsWhenNotApprover()
    {
        var request = await SeedAwaitingApprovalAsync();
        var identity = new FakeIdentity { UserId = Submitter, Role = Momentum.Library.Domain.Identity.Role.Submitter };
        var handler = new AcceptRequestHandler(_requests, _decisions, _events, identity, _audit);

        await Assert.ThrowsAsync<InvalidOperationException>(
            () => handler.Handle(new AcceptRequestCommand(request.Id, Approver, "go")));
    }
}

public class LinkSolutionToRequestHandlerTests
{
    private static readonly UserId Submitter = new("dev@org");
    private static readonly UserId Actor = new("actor@org");

    private readonly InMemoryRequestRepository _requests = new();
    private readonly InMemorySolutionRepository _solutions = new();
    private readonly InMemoryRequestSolutionRepository _relationships = new();
    private readonly CapturingEventPublisher _events = new();
    private readonly InMemoryAuditRepository _audit = new();

    private async Task SeedAsync()
    {
        var creator = new CreateRequestHandler(_requests, _events, _audit);
        await creator.Handle(new CreateRequestCommand(Submitter, RequestType.Backlog, "Need", "Description"));
        var solutionCreator = new CreateSolutionHandler(_solutions, _events, _audit);
        await solutionCreator.Handle(new Momentum.Library.Application.Requests.CreateSolutionCommand(
            Submitter, "Solution", "Description",
            Momentum.Library.Domain.Solutions.SolutionType.Library,
            "owner", "repo", "https://example.com/repo"));
    }

    [Fact]
    public async Task Handle_LinksSolutionAndPublishesEvent()
    {
        await SeedAsync();
        var request = (await _requests.GetBySubmitter(Submitter)).Single();
        var solution = (await _solutions.Search("Solution", 0, 1)).Single();

        var handler = new LinkSolutionToRequestHandler(_requests, _solutions, _relationships, _events, _audit);
        var link = await handler.Handle(new LinkSolutionToRequestCommand(request.Id, solution.Id, RequestSolutionRelationship.Proposed, Actor));

        Assert.Equal(request.Id, link.RequestId);
        Assert.Equal(solution.Id, link.SolutionId);
        Assert.Contains(_events.Published.OfType<Momentum.Library.Domain.Engagement.SolutionLinkedToRequest>(),
            e => e.RequestId == request.Id && e.SolutionId == solution.Id);
    }

    [Fact]
    public async Task Handle_IsIdempotent()
    {
        await SeedAsync();
        var request = (await _requests.GetBySubmitter(Submitter)).Single();
        var solution = (await _solutions.Search("Solution", 0, 1)).Single();
        var handler = new LinkSolutionToRequestHandler(_requests, _solutions, _relationships, _events, _audit);

        await handler.Handle(new LinkSolutionToRequestCommand(request.Id, solution.Id, RequestSolutionRelationship.Proposed, Actor));
        await handler.Handle(new LinkSolutionToRequestCommand(request.Id, solution.Id, RequestSolutionRelationship.Relevant, Actor));

        var all = await _relationships.GetByRequest(request.Id);
        Assert.Single(all);
    }
}
