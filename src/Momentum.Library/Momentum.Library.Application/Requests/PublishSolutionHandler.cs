using Momentum.Library.Application.Ports;
using Momentum.Library.Domain.Auditing;
using Momentum.Library.Domain.Engagement;
using Momentum.Library.Domain.Requests;
using Momentum.Library.Domain.Solutions;

namespace Momentum.Library.Application.Requests;

public sealed class PublishSolutionHandler
{
    private readonly IRequestRepository _requests;
    private readonly ISolutionRepository _solutions;
    private readonly ISolutionProjectionPublisher _publisher;
    private readonly IAuditRepository _audit;

    public PublishSolutionHandler(
        IRequestRepository requests,
        ISolutionRepository solutions,
        ISolutionProjectionPublisher publisher,
        IAuditRepository audit)
    {
        _requests = requests;
        _solutions = solutions;
        _publisher = publisher;
        _audit = audit;
    }

    public async Task<Solution> Handle(PublishSolutionCommand command)
    {
        var request = await _requests.GetById(command.RequestId)
            ?? throw new InvalidOperationException("Request not found.");
        if (request.Status != RequestStatus.Accepted)
            throw new InvalidOperationException("Request must be accepted before publication.");

        var result = command.Result;
        if (string.IsNullOrWhiteSpace(result.NormalizedTitle) || string.IsNullOrWhiteSpace(result.NormalizedDescription))
            throw new InvalidOperationException("Publication content is invalid.");

        var existing = await _solutions.Search(result.NormalizedTitle, 0, 1);

        if (existing.FirstOrDefault(s => string.Equals(s.RepositoryReference.Url, result.RepositoryReferenceUrl, StringComparison.OrdinalIgnoreCase)) is { } alreadyPublished)
        {
            return alreadyPublished;
        }

        var now = DateTimeOffset.UtcNow;
        var repository = new RepositoryReference(
            string.IsNullOrWhiteSpace(result.RepositoryReferenceOwner) ? "unknown" : result.RepositoryReferenceOwner,
            string.IsNullOrWhiteSpace(result.RepositoryReferenceName) ? "unknown" : result.RepositoryReferenceName,
            string.IsNullOrWhiteSpace(result.RepositoryReferenceUrl) ? string.Empty : result.RepositoryReferenceUrl);

        var solution = new Solution
        {
            Title = result.NormalizedTitle.Trim(),
            Description = result.NormalizedDescription.Trim(),
            Type = SolutionType.Library,
            SubmittedBy = request.SubmittedBy,
            RepositoryReference = repository,
            Status = SolutionStatus.Published,
            PublishedAt = now
        };

        await _solutions.Save(solution);

        if (request.CanonicalSolutionId is null)
        {
            var updated = request with { CanonicalSolutionId = solution.Id, UpdatedAt = now };
            await _requests.Update(updated);
        }

        await _audit.Append(new AuditRecord
        {
            Action = "solution.published",
            ResourceType = "solution",
            ResourceId = solution.Id,
            SubjectId = solution.Id,
            ActorType = AuditActorType.System,
            ActorId = "momentum-worker",
            Summary = "Published the solution."
        });

        try
        {
            await _publisher.PublishSolutionReadme(solution, string.Empty);
        }
        catch
        {
            // Projection failure does not block the solution publication.
        }

        return solution;
    }
}
