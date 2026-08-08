using Momentum.Library.Application.Requests;
using Momentum.Library.Domain.Identity;
using Momentum.Library.Domain.Solutions;
using Momentum.Tests.Fakes;

namespace Momentum.Tests.Application;

public class CreateSolutionHandlerTests
{
    private static readonly UserId Submitter = new("dev@org");

    private readonly InMemorySolutionRepository _solutions = new();
    private readonly CapturingEventPublisher _events = new();
    private readonly InMemoryAuditRepository _audit = new();

    private CreateSolutionHandler CreateHandler() => new(_solutions, _events, _audit);

    private static CreateSolutionCommand Command(string? demoUrl = null) => new(
        Submitter,
        "Solution",
        "Description",
        SolutionType.Library,
        "owner",
        "repo",
        "https://example.com/repo",
        demoUrl);

    [Fact]
    public async Task Handle_PersistsSolutionAndPublishesSubmitted()
    {
        var solution = await CreateHandler().Handle(Command());

        Assert.NotNull(await _solutions.GetById(solution.Id));
        Assert.Contains(_events.Published.OfType<SolutionSubmitted>(), e => e.SolutionId == solution.Id);
        Assert.Contains(_audit.Records, r => r.Action == "solution.created");
    }

    [Fact]
    public async Task Handle_StoresTheDemoLink()
    {
        var solution = await CreateHandler().Handle(Command("https://demo.example.com/tour"));

        Assert.Equal("https://demo.example.com/tour", solution.DemoUrl);
        Assert.Equal("https://demo.example.com/tour", (await _solutions.GetById(solution.Id))!.DemoUrl);
    }

    [Fact]
    public async Task Handle_TrimsTheDemoLink()
    {
        var solution = await CreateHandler().Handle(Command("  https://demo.example.com/tour  "));

        Assert.Equal("https://demo.example.com/tour", solution.DemoUrl);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public async Task Handle_TreatsAMissingDemoLinkAsNone(string? demoUrl)
    {
        var solution = await CreateHandler().Handle(Command(demoUrl));

        Assert.Null(solution.DemoUrl);
    }

    [Theory]
    [InlineData("demo.example.com")]
    [InlineData("/demo")]
    [InlineData("javascript:alert(1)")]
    [InlineData("ftp://demo.example.com")]
    public async Task Handle_RejectsADemoLinkThatIsNotAnAbsoluteHttpUrl(string demoUrl)
    {
        await Assert.ThrowsAsync<InvalidOperationException>(() => CreateHandler().Handle(Command(demoUrl)));
    }

    [Fact]
    public async Task Handle_RejectsAMissingRepositoryReference()
    {
        var command = new CreateSolutionCommand(
            Submitter, "Solution", "Description", SolutionType.Library, "owner", "repo", "");

        await Assert.ThrowsAsync<InvalidOperationException>(() => CreateHandler().Handle(command));
    }
}
