using Momentum.Library.Application.Ports;
using Momentum.Library.Domain.Auditing;
using Momentum.Library.Domain.Engagement;

namespace Momentum.Library.Application.Engagement;

public sealed class StartSolutionUseHandler
{
    private readonly ISolutionUseRepository _uses;
    private readonly IEventPublisher _events;
    private readonly IAuditRepository _audit;

    public StartSolutionUseHandler(ISolutionUseRepository uses, IEventPublisher events, IAuditRepository audit)
    {
        _uses = uses;
        _events = events;
        _audit = audit;
    }

    public async Task<SolutionUse> Handle(StartSolutionUseCommand command)
    {
        if (string.IsNullOrWhiteSpace(command.StartedBy.Value))
            throw new InvalidOperationException("Starting a solution use requires an authenticated user.");
        if (string.IsNullOrWhiteSpace(command.SolutionId))
            throw new InvalidOperationException("A solution use requires a solution id.");
        if (string.IsNullOrWhiteSpace(command.ProjectName))
            throw new InvalidOperationException("A solution use requires a project or initiative name.");

        var now = DateTimeOffset.UtcNow;
        var use = new SolutionUse
        {
            SolutionId = command.SolutionId,
            StartedBy = command.StartedBy,
            ProjectName = command.ProjectName,
            Team = command.Team,
            Status = command.InitialStatus,
            StartedAt = now,
            UpdatedAt = now
        };

        await _uses.Save(use);
        await _events.Publish(new SolutionUseStarted(
            Guid.NewGuid(), use.Id, use.SolutionId, use.StartedBy,
            use.Status, use.ProjectName, use.Team, now));
        await _audit.Append(new AuditRecord
        {
            Action = "solutionUse.started",
            ResourceType = "solutionUse",
            ResourceId = use.Id,
            SubjectId = use.SolutionId,
            ActorType = AuditActorType.User,
            ActorId = use.StartedBy.Value,
            Summary = $"Started a solution use: {use.ProjectName}.",
            Details = new Dictionary<string, string>
            {
                ["solutionId"] = use.SolutionId,
                ["status"] = use.Status.ToString()
            }
        });
        return use;
    }
}
