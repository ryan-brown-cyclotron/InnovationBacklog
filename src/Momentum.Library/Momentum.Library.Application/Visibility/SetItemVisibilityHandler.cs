using Momentum.Library.Application.Ports;
using Momentum.Library.Domain.Auditing;
using Momentum.Library.Domain.Engagement;
using Momentum.Library.Domain.Visibility;

namespace Momentum.Library.Application.Visibility;

/// <summary>
/// Changes who may see an idea or a solution. Administrators only — the check
/// lives here so every caller (HTTP, MCP, seeding) goes through it.
/// </summary>
public sealed class SetItemVisibilityHandler
{
    private readonly IRequestRepository _requests;
    private readonly ISolutionRepository _solutions;
    private readonly IAuditRepository _audit;

    public SetItemVisibilityHandler(
        IRequestRepository requests,
        ISolutionRepository solutions,
        IAuditRepository audit)
    {
        _requests = requests;
        _solutions = solutions;
        _audit = audit;
    }

    public async Task<ItemVisibility> Handle(SetItemVisibilityCommand command)
    {
        if (!ItemVisibilityRules.CanChange(command.ActorRole))
            throw new InvalidOperationException("Only an administrator can change visibility.");

        var previous = command.Target.ItemType switch
        {
            HubItemType.Request => await SetRequestVisibility(command),
            HubItemType.Solution => await SetSolutionVisibility(command),
            _ => throw new InvalidOperationException("Unsupported item type.")
        };

        await _audit.Append(new AuditRecord
        {
            Action = "item.visibilityChanged",
            ResourceType = command.Target.ItemType.ToString().ToLowerInvariant(),
            ResourceId = command.Target.ItemId,
            SubjectId = command.Target.ItemId,
            ActorType = AuditActorType.User,
            ActorId = command.ActorId.Value,
            Summary = $"Visibility changed from {previous} to {command.Visibility}.",
            // Who can see what is governance evidence, not a public update.
            Audience = AuditAudience.ApproversOnly,
            Details = new Dictionary<string, string>
            {
                ["from"] = previous.ToString(),
                ["to"] = command.Visibility.ToString()
            }
        });

        return command.Visibility;
    }

    private async Task<ItemVisibility> SetRequestVisibility(SetItemVisibilityCommand command)
    {
        var request = await _requests.GetById(command.Target.ItemId)
            ?? throw new InvalidOperationException("Idea not found.");
        var previous = request.Visibility;
        if (previous != command.Visibility)
        {
            await _requests.Update(request with
            {
                Visibility = command.Visibility,
                UpdatedAt = DateTimeOffset.UtcNow
            });
        }
        return previous;
    }

    private async Task<ItemVisibility> SetSolutionVisibility(SetItemVisibilityCommand command)
    {
        var solution = await _solutions.GetById(command.Target.ItemId)
            ?? throw new InvalidOperationException("Solution not found.");
        var previous = solution.Visibility;
        if (previous != command.Visibility)
        {
            await _solutions.Update(solution with
            {
                Visibility = command.Visibility,
                UpdatedAt = DateTimeOffset.UtcNow
            });
        }
        return previous;
    }
}
