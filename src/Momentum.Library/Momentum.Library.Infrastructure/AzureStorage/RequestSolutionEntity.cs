using Momentum.Library.Domain.Engagement;

namespace Momentum.Library.Infrastructure.AzureStorage;

public sealed class RequestSolutionEntity : AzureTableEntityBase
{
    public string Relationship { get; set; } = "Proposed";

    /// <summary>Absent on rows written before link review shipped; treated as Approved.</summary>
    public string? Approval { get; set; }

    public string AddedBy { get; set; } = null!;
    public DateTimeOffset AddedAt { get; set; }
    public string? DecidedBy { get; set; }
    public DateTimeOffset? DecidedAt { get; set; }
}
