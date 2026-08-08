using Momentum.Library.Domain.Identity;
using Momentum.Library.Domain.Requests;

namespace Momentum.Library.Infrastructure.AzureStorage;

public sealed class RequestEntity : AzureTableEntityBase
{
    public string SubmittedBy { get; set; } = null!;
    public string Status { get; set; } = null!;
    public string Title { get; set; } = null!;
    public string Description { get; set; } = null!;
    public string RequestType { get; set; } = "Backlog";

    /// <summary>Absent on rows written before visibility shipped; treated as Everyone.</summary>
    public string? Visibility { get; set; }

    /// <summary>Serialized <c>string[]</c>; absent on rows written before tags shipped.</summary>
    public string? TagsJson { get; set; }

    public string? CanonicalSolutionId { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}
