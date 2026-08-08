using Momentum.Library.Application.Ports;
using Momentum.Library.Domain.Auditing;
using Momentum.Library.Domain.Engagement;

namespace Momentum.Library.Application.Engagement;

public sealed class CompleteSolutionUseHandler
{
    private readonly ISolutionUseRepository _uses;
    private readonly IEventPublisher _events;
    private readonly IAuditRepository _audit;

    public CompleteSolutionUseHandler(ISolutionUseRepository uses, IEventPublisher events, IAuditRepository audit)
    {
        _uses = uses;
        _events = events;
        _audit = audit;
    }

    public async Task<SolutionUse> Handle(CompleteSolutionUseCommand command)
    {
        var use = await _uses.GetById(command.SolutionUseId)
            ?? throw new InvalidOperationException("No solution use exists with that id.");

        if (use.Status == SolutionUseStatus.Using && use.CompletedAt is not null)
            throw new InvalidOperationException("The solution use is already completed.");

        var now = DateTimeOffset.UtcNow;
        var updated = use with
        {
            Status = SolutionUseStatus.Using,
            UpdatedAt = now,
            CompletedAt = now
        };

        await _uses.Save(updated);
        await _events.Publish(new SolutionUseCompleted(
            Guid.NewGuid(), updated.Id, updated.SolutionId, command.ActorId, now, now));
        await _audit.Append(new AuditRecord
        {
            Action = "solutionUse.completed",
            ResourceType = "solutionUse",
            ResourceId = updated.Id,
            SubjectId = updated.SolutionId,
            ActorType = AuditActorType.User,
            ActorId = command.ActorId.Value,
            Summary = $"Completed a solution use: {updated.ProjectName}.",
            Details = new Dictionary<string, string> { ["solutionId"] = updated.SolutionId }
        });
        return updated;
    }
}
