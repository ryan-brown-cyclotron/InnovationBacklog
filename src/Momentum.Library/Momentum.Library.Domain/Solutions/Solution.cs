using Momentum.Library.Domain.Identity;
using Momentum.Library.Domain.Visibility;

namespace Momentum.Library.Domain.Solutions;

public sealed record Solution
{
    public string Id { get; init; } = Guid.NewGuid().ToString("N");
    public string Title { get; init; } = string.Empty;
    public string Description { get; init; } = string.Empty;
    public IReadOnlyList<string> Tags { get; init; } = Array.Empty<string>();
    public SolutionType Type { get; init; } = SolutionType.Library;
    public RepositoryReference RepositoryReference { get; init; } = null!;

    /// <summary>Optional link to a working demo or worked example.</summary>
    public string? DemoUrl { get; init; }

    public UserId SubmittedBy { get; init; } = null!;
    public UserId? Owner { get; init; }
    /// <summary>Pending review by default — nothing publishes itself.</summary>
    public SolutionStatus Status { get; init; } = SolutionStatus.AwaitingApproval;
    public ItemVisibility Visibility { get; init; } = ItemVisibility.Everyone;
    public int UseCount { get; init; }
    public IReadOnlyList<string> AdoptedByProjects { get; init; } = Array.Empty<string>();
    public DateTimeOffset CreatedAt { get; init; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; init; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? PublishedAt { get; init; } = DateTimeOffset.UtcNow;

    public Solution() { }
}
