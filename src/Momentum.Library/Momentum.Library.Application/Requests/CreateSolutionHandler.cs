using Momentum.Library.Application.Ports;
using Momentum.Library.Domain.Auditing;
using Momentum.Library.Domain.Solutions;
using Momentum.Library.Domain.Tagging;

namespace Momentum.Library.Application.Requests;

public sealed class CreateSolutionHandler
{
    private readonly ISolutionRepository _solutions;
    private readonly IEventPublisher _events;
    private readonly IAuditRepository _audit;

    public CreateSolutionHandler(ISolutionRepository solutions, IEventPublisher events, IAuditRepository audit)
    {
        _solutions = solutions;
        _events = events;
        _audit = audit;
    }

    public async Task<Solution> Handle(CreateSolutionCommand command)
    {
        if (string.IsNullOrWhiteSpace(command.Title))
            throw new InvalidOperationException("Title is required.");
        if (string.IsNullOrWhiteSpace(command.Description))
            throw new InvalidOperationException("Description is required.");
        if (string.IsNullOrWhiteSpace(command.RepositoryOwner) || string.IsNullOrWhiteSpace(command.RepositoryName) || string.IsNullOrWhiteSpace(command.RepositoryUrl))
            throw new InvalidOperationException("Repository reference is required.");

        var demoUrl = NormalizeDemoUrl(command.DemoUrl);

        var solution = new Solution
        {
            Title = command.Title.Trim(),
            Description = command.Description.Trim(),
            Type = command.Type,
            RepositoryReference = new RepositoryReference(command.RepositoryOwner, command.RepositoryName, command.RepositoryUrl),
            DemoUrl = demoUrl,
            Tags = TagList.Normalize(command.Tags),
            SubmittedBy = command.SubmittedBy,
            // Solutions are reviewed like ideas; nothing reaches the catalog
            // until an approver accepts it.
            Status = SolutionStatus.AwaitingApproval,
            PublishedAt = null
        };

        await _solutions.Save(solution);
        await _audit.Append(new AuditRecord
        {
            Action = "solution.created",
            ResourceType = "solution",
            ResourceId = solution.Id,
            SubjectId = solution.Id,
            ActorType = AuditActorType.User,
            ActorId = command.SubmittedBy.Value,
            Summary = "Created a solution.",
            Details = new Dictionary<string, string> { ["solutionType"] = command.Type.ToString() }
        });
        await _events.Publish(new SolutionSubmitted(Guid.NewGuid(), solution.Id, command.SubmittedBy, DateTimeOffset.UtcNow));

        return solution;
    }

    /// <summary>
    /// The demo link is optional, but a stored value must be a real absolute
    /// http(s) URL — the UI renders it as an anchor.
    /// </summary>
    private static string? NormalizeDemoUrl(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        var trimmed = value.Trim();
        if (!Uri.TryCreate(trimmed, UriKind.Absolute, out var uri)
            || (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps))
            throw new InvalidOperationException("Demo link must be an absolute http or https URL.");
        return trimmed;
    }
}
