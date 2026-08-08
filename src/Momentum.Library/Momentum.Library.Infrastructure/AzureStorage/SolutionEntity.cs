using Momentum.Library.Domain.Identity;
using Momentum.Library.Domain.Solutions;

namespace Momentum.Library.Infrastructure.AzureStorage;

public sealed class SolutionEntity : AzureTableEntityBase
{
    public string SubmitterId { get; set; } = null!;
    public string? OwnerId { get; set; }
    public string Title { get; set; } = null!;
    public string Description { get; set; } = null!;
    public string Type { get; set; } = "Library";
    public string Status { get; set; } = "Published";

    /// <summary>Absent on rows written before visibility shipped; treated as Everyone.</summary>
    public string? Visibility { get; set; }

    /// <summary>Serialized <c>string[]</c>; absent on rows written before tags shipped.</summary>
    public string? TagsJson { get; set; }

    public string RepositoryOwner { get; set; } = string.Empty;
    public string RepositoryName { get; set; } = string.Empty;
    public string RepositoryUrl { get; set; } = string.Empty;
    public string? DemoUrl { get; set; }
    public int UseCount { get; set; }
    public string AdoptedByProjectsJson { get; set; } = "[]";
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
    public DateTimeOffset? PublishedAt { get; set; }
}
