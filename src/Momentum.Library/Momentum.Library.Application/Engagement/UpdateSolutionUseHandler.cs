using Momentum.Library.Application.Ports;
using Momentum.Library.Domain.Auditing;
using Momentum.Library.Domain.Engagement;

namespace Momentum.Library.Application.Engagement;

public sealed class UpdateSolutionUseHandler
{
    private readonly ISolutionUseRepository _uses;
    private readonly IEventPublisher _events;
    private readonly IAuditRepository _audit;

    public UpdateSolutionUseHandler(ISolutionUseRepository uses, IEventPublisher events, IAuditRepository audit)
    {
        _uses = uses;
        _events = events;
        _audit = audit;
    }

    public async Task<SolutionUse> Handle(UpdateSolutionUseCommand command)
    {
        var use = await _uses.GetById(command.SolutionUseId)
            ?? throw new InvalidOperationException("No solution use exists with that id.");

        var previousStatus = use.Status;
        var statusChanged = command.Status is not null && command.Status != previousStatus;
        if (statusChanged && command.Status == SolutionUseStatus.Using && use.CompletedAt is not null)
            throw new InvalidOperationException("This solution use is already completed.");

        var updated = use with
        {
            Status = command.Status ?? use.Status,
            ProjectName = string.IsNullOrWhiteSpace(command.ProjectName) ? use.ProjectName : command.ProjectName,
            Team = command.Team ?? use.Team,
            UpdatedAt = DateTimeOffset.UtcNow
        };

        await _uses.Save(updated);

        if (statusChanged)
        {
            await _events.Publish(new SolutionUseStatusChanged(
                Guid.NewGuid(), updated.Id, updated.SolutionId, command.ActorId,
                previousStatus, updated.Status, DateTimeOffset.UtcNow));
            await _audit.Append(new AuditRecord
            {
                Action = "solutionUse.statusChanged",
                ResourceType = "solutionUse",
                ResourceId = updated.Id,
                SubjectId = updated.SolutionId,
                ActorType = AuditActorType.User,
                ActorId = command.ActorId.Value,
                Summary = $"Solution use status moved from {previousStatus} to {updated.Status}.",
                Details = new Dictionary<string, string>
                {
                    ["solutionId"] = updated.SolutionId,
                    ["previousStatus"] = previousStatus.ToString(),
                    ["status"] = updated.Status.ToString()
                }
            });
        }
        else
        {
            await _audit.Append(new AuditRecord
            {
                Action = "solutionUse.updated",
                ResourceType = "solutionUse",
                ResourceId = updated.Id,
                SubjectId = updated.SolutionId,
                ActorType = AuditActorType.User,
                ActorId = command.ActorId.Value,
                Summary = "Solution use details were updated.",
                Details = new Dictionary<string, string> { ["solutionId"] = updated.SolutionId }
            });
        }

        return updated;
    }
}
