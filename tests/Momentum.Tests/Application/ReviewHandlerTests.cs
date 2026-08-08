using Momentum.Library.Application.Approvals;
using Momentum.Library.Application.Requests;
using Momentum.Library.Domain.Engagement;
using Momentum.Library.Domain.Identity;
using Momentum.Library.Domain.Requests;
using Momentum.Library.Domain.Solutions;
using Momentum.Library.Domain.Visibility;
using Momentum.Tests.Fakes;

namespace Momentum.Tests.Application;

public class ReviewSolutionHandlerTests
{
    private static readonly UserId Submitter = new("dev@org");
    private static readonly UserId Approver = new("approver@org");

    private readonly InMemorySolutionRepository _solutions = new();
    private readonly CapturingEventPublisher _events = new();
    private readonly InMemoryAuditRepository _audit = new();

    private ReviewSolutionHandler CreateHandler() => new(_solutions, _events, _audit);

    private Task<Solution> SeedAsync() =>
        new CreateSolutionHandler(_solutions, _events, _audit).Handle(new CreateSolutionCommand(
            Submitter, "Solution", "Description", SolutionType.Library, "owner", "repo", "https://example.com/repo"));

    [Fact]
    public async Task NewSolutionsWaitForApproval()
    {
        var solution = await SeedAsync();

        Assert.Equal(SolutionStatus.AwaitingApproval, solution.Status);
        Assert.Null(solution.PublishedAt);
        Assert.Equal(ApprovalState.Pending, ApprovalStates.Of(solution.Status));
    }

    [Fact]
    public async Task Accept_PublishesTheSolution()
    {
        var solution = await SeedAsync();

        var reviewed = await CreateHandler().Handle(
            new ReviewSolutionCommand(solution.Id, Approver, Role.Approver, true, "Reusable and documented."));

        Assert.Equal(SolutionStatus.Published, reviewed.Status);
        Assert.NotNull(reviewed.PublishedAt);
        Assert.Equal(ApprovalState.Approved, ApprovalStates.Of(reviewed.Status));
        Assert.Contains(_audit.Records, r => r.Action == "solution.accepted");
        Assert.Single(_events.Published.OfType<SolutionPublished>());
    }

    [Fact]
    public async Task Reject_MarksItRejectedAndPublishesNothing()
    {
        var solution = await SeedAsync();

        var reviewed = await CreateHandler().Handle(
            new ReviewSolutionCommand(solution.Id, Approver, Role.Approver, false, "Duplicate of an existing tool."));

        Assert.Equal(SolutionStatus.Rejected, reviewed.Status);
        Assert.Null(reviewed.PublishedAt);
        Assert.Equal(ApprovalState.Rejected, ApprovalStates.Of(reviewed.Status));
        Assert.Empty(_events.Published.OfType<SolutionPublished>());
        Assert.Contains(_audit.Records, r => r.Action == "solution.rejected");
    }

    [Fact]
    public async Task Review_RefusesASubmitter()
    {
        var solution = await SeedAsync();

        await Assert.ThrowsAsync<InvalidOperationException>(() => CreateHandler().Handle(
            new ReviewSolutionCommand(solution.Id, Submitter, Role.Submitter, true, "Looks fine")));

        Assert.Equal(SolutionStatus.AwaitingApproval, (await _solutions.GetById(solution.Id))!.Status);
    }

    [Fact]
    public async Task Review_RequiresARationale()
    {
        var solution = await SeedAsync();

        await Assert.ThrowsAsync<InvalidOperationException>(() => CreateHandler().Handle(
            new ReviewSolutionCommand(solution.Id, Approver, Role.Approver, true, "   ")));
    }

    [Fact]
    public async Task Review_RefusesASecondDecision()
    {
        var solution = await SeedAsync();
        var handler = CreateHandler();
        await handler.Handle(new ReviewSolutionCommand(solution.Id, Approver, Role.Approver, true, "Good"));

        await Assert.ThrowsAsync<InvalidOperationException>(() => handler.Handle(
            new ReviewSolutionCommand(solution.Id, Approver, Role.Approver, false, "Changed my mind")));
    }
}

public class ReviewLinkHandlerTests
{
    private static readonly UserId Submitter = new("dev@org");
    private static readonly UserId Approver = new("approver@org");

    private readonly InMemoryRequestRepository _requests = new();
    private readonly InMemorySolutionRepository _solutions = new();
    private readonly InMemoryRequestSolutionRepository _relationships = new();
    private readonly CapturingEventPublisher _events = new();
    private readonly InMemoryAuditRepository _audit = new();

    private async Task<(Request Request, Solution Solution)> SeedAsync()
    {
        var request = await new CreateRequestHandler(_requests, _events, _audit)
            .Handle(new CreateRequestCommand(Submitter, RequestType.Backlog, "Idea", "Description"));
        var solution = await new CreateSolutionHandler(_solutions, _events, _audit).Handle(new CreateSolutionCommand(
            Submitter, "Solution", "Description", SolutionType.Library, "owner", "repo", "https://example.com/repo"));
        return (request, solution);
    }

    private Task<RequestSolution> Link(Request request, Solution solution, Role role) =>
        new LinkSolutionToRequestHandler(_requests, _solutions, _relationships, _events, _audit)
            .Handle(new LinkSolutionToRequestCommand(
                request.Id, solution.Id, RequestSolutionRelationship.Proposed, Submitter, role));

    [Fact]
    public async Task ALinkFromASubmitterWaitsForApproval()
    {
        var (request, solution) = await SeedAsync();

        var link = await Link(request, solution, Role.Submitter);

        Assert.Equal(ApprovalState.Pending, link.Approval);
        Assert.Null(link.DecidedBy);
    }

    [Fact]
    public async Task ALinkFromAReviewerIsApprovedOnTheSpot()
    {
        var (request, solution) = await SeedAsync();

        var link = await Link(request, solution, Role.Approver);

        Assert.Equal(ApprovalState.Approved, link.Approval);
        Assert.NotNull(link.DecidedAt);
    }

    [Fact]
    public async Task Accept_ApprovesTheLink()
    {
        var (request, solution) = await SeedAsync();
        await Link(request, solution, Role.Submitter);

        await new ReviewLinkHandler(_relationships, _audit).Handle(new ReviewLinkCommand(
            request.Id, solution.Id, Approver, Role.Approver, true, "It does answer this."));

        var stored = await _relationships.Get(request.Id, solution.Id);
        Assert.Equal(ApprovalState.Approved, stored!.Approval);
        Assert.Equal(Approver.Value, stored.DecidedBy?.Value);
        Assert.Contains(_audit.Records, r => r.Action == "request.solutionLinkAccepted");
    }

    [Fact]
    public async Task Reject_RemovesTheLinkSoItCanBeProposedAgain()
    {
        var (request, solution) = await SeedAsync();
        await Link(request, solution, Role.Submitter);

        await new ReviewLinkHandler(_relationships, _audit).Handle(new ReviewLinkCommand(
            request.Id, solution.Id, Approver, Role.Approver, false, "Different problem."));

        Assert.Null(await _relationships.Get(request.Id, solution.Id));
        Assert.Contains(_audit.Records, r => r.Action == "request.solutionLinkRejected");
    }

    [Fact]
    public async Task Review_RefusesASubmitter()
    {
        var (request, solution) = await SeedAsync();
        await Link(request, solution, Role.Submitter);

        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            new ReviewLinkHandler(_relationships, _audit).Handle(new ReviewLinkCommand(
                request.Id, solution.Id, Submitter, Role.Submitter, true, "Mine is fine")));
    }
}
