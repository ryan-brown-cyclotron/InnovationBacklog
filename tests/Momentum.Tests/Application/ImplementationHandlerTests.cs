using Momentum.Library.Application.Engagement;
using Momentum.Library.Domain.Engagement;
using Momentum.Library.Domain.Identity;
using Momentum.Tests.Fakes;

namespace Momentum.Tests.Application;

public class StartSolutionUseHandlerTests
{
    private static readonly UserId Builder = new("dev@org");

    private readonly InMemorySolutionUseRepository _uses = new();
    private readonly CapturingEventPublisher _events = new();
    private readonly InMemoryAuditRepository _audit = new();

    private StartSolutionUseHandler CreateHandler() => new(_uses, _events, _audit);

    [Fact]
    public async Task Handle_PersistsUseAndPublishesStarted()
    {
        var result = await CreateHandler().Handle(
            new StartSolutionUseCommand("sol-1", Builder, "Portal refresh", "Web Team"));

        Assert.False(string.IsNullOrEmpty(result.Id));
        var stored = await _uses.GetById(result.Id);
        Assert.NotNull(stored);
        Assert.Equal(SolutionUseStatus.Exploring, stored!.Status);

        var started = Assert.Single(_events.Published.OfType<SolutionUseStarted>());
        Assert.Equal(result.Id, started.SolutionUseId);
        Assert.Equal("sol-1", started.SolutionId);
        Assert.Equal("Portal refresh", started.ProjectName);

        Assert.Contains(_audit.Records, r => r.Action == "solutionUse.started");
    }

    [Fact]
    public async Task Handle_RejectsEmptyUserId()
    {
        await Assert.ThrowsAsync<InvalidOperationException>(
            () => CreateHandler().Handle(new StartSolutionUseCommand("sol-1", new UserId(""), "Project", null)));
    }

    [Fact]
    public async Task Handle_RejectsEmptySolutionId()
    {
        await Assert.ThrowsAsync<InvalidOperationException>(
            () => CreateHandler().Handle(new StartSolutionUseCommand("", Builder, "Project", null)));
    }

    [Fact]
    public async Task Handle_RejectsEmptyProjectName()
    {
        await Assert.ThrowsAsync<InvalidOperationException>(
            () => CreateHandler().Handle(new StartSolutionUseCommand("sol-1", Builder, "  ", null)));
    }
}

public class UpdateSolutionUseHandlerTests
{
    private static readonly UserId Builder = new("dev@org");

    private readonly InMemorySolutionUseRepository _uses = new();
    private readonly CapturingEventPublisher _events = new();
    private readonly InMemoryAuditRepository _audit = new();

    private async Task<SolutionUse> SeedAsync(SolutionUseStatus status = SolutionUseStatus.Exploring)
    {
        var starter = new StartSolutionUseHandler(_uses, _events, _audit);
        return await starter.Handle(new StartSolutionUseCommand("sol-1", Builder, "Project", null, status));
    }

    [Fact]
    public async Task Handle_ChangesStatusAndPublishesStatusChanged()
    {
        var seeded = await SeedAsync();
        var updater = new UpdateSolutionUseHandler(_uses, _events, _audit);

        var result = await updater.Handle(
            new UpdateSolutionUseCommand(seeded.Id, Builder, SolutionUseStatus.Implementing, null, null));

        Assert.Equal(SolutionUseStatus.Implementing, result.Status);
        var changed = Assert.Single(_events.Published.OfType<SolutionUseStatusChanged>());
        Assert.Equal(SolutionUseStatus.Exploring, changed.PreviousStatus);
        Assert.Equal(SolutionUseStatus.Implementing, changed.Status);
        Assert.Contains(_audit.Records, r => r.Action == "solutionUse.statusChanged");
    }

    [Fact]
    public async Task Handle_ThrowsWhenUseMissing()
    {
        var updater = new UpdateSolutionUseHandler(_uses, _events, _audit);

        await Assert.ThrowsAsync<InvalidOperationException>(
            () => updater.Handle(new UpdateSolutionUseCommand("missing", Builder, SolutionUseStatus.Implementing, null, null)));
    }
}

public class CompleteSolutionUseHandlerTests
{
    private static readonly UserId Builder = new("dev@org");

    private readonly InMemorySolutionUseRepository _uses = new();
    private readonly CapturingEventPublisher _events = new();
    private readonly InMemoryAuditRepository _audit = new();

    [Fact]
    public async Task Handle_MarksUsingAndPublishesCompletedEvent()
    {
        var seeded = await new StartSolutionUseHandler(_uses, _events, _audit)
            .Handle(new StartSolutionUseCommand("sol-1", Builder, "Project", null, SolutionUseStatus.Implementing));

        var result = await new CompleteSolutionUseHandler(_uses, _events, _audit)
            .Handle(new CompleteSolutionUseCommand(seeded.Id, Builder));

        Assert.Equal(SolutionUseStatus.Using, result.Status);
        Assert.NotNull(result.CompletedAt);
        Assert.False(result.IsActive);

        var completed = Assert.Single(_events.Published.OfType<SolutionUseCompleted>());
        Assert.Equal(seeded.Id, completed.SolutionUseId);
        Assert.Contains(_audit.Records, r => r.Action == "solutionUse.completed");
    }

    [Fact]
    public async Task Handle_ThrowsWhenAlreadyCompleted()
    {
        var seeded = await new StartSolutionUseHandler(_uses, _events, _audit)
            .Handle(new StartSolutionUseCommand("sol-1", Builder, "Project", null));
        var completer = new CompleteSolutionUseHandler(_uses, _events, _audit);
        await completer.Handle(new CompleteSolutionUseCommand(seeded.Id, Builder));

        await Assert.ThrowsAsync<InvalidOperationException>(
            () => completer.Handle(new CompleteSolutionUseCommand(seeded.Id, Builder)));
    }

    [Fact]
    public async Task Handle_ThrowsWhenUseMissing()
    {
        var completer = new CompleteSolutionUseHandler(_uses, _events, _audit);
        await Assert.ThrowsAsync<InvalidOperationException>(
            () => completer.Handle(new CompleteSolutionUseCommand("missing", Builder)));
    }
}
