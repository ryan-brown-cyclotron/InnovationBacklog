using Momentum.Library.Domain.Identity;
using Momentum.Library.Domain.Visibility;

namespace Momentum.Library.Domain.Requests;

public sealed record Request
{
    public string Id { get; init; } = Guid.NewGuid().ToString("N");
    public RequestType Type { get; init; } = RequestType.Backlog;
    public UserId SubmittedBy { get; init; } = null!;
    public RequestStatus Status { get; init; } = RequestStatus.Draft;
    public ItemVisibility Visibility { get; init; } = ItemVisibility.Everyone;
    public string Title { get; init; } = string.Empty;
    public string Description { get; init; } = string.Empty;
    public IReadOnlyList<string> Tags { get; init; } = Array.Empty<string>();
    public string? CanonicalSolutionId { get; init; }
    public DateTimeOffset CreatedAt { get; init; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; init; } = DateTimeOffset.UtcNow;

    public Request() { }
}
