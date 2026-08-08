using Momentum.Library.Domain.Engagement;

namespace Momentum.Library.Infrastructure.AzureStorage;

public sealed class SolutionUseEntity : AzureTableEntityBase
{
    public string SolutionUseId { get; set; } = null!;
    public string StartedBy { get; set; } = null!;
    public string ProjectName { get; set; } = null!;
    public string? Team { get; set; }
    public string Status { get; set; } = null!;
    public DateTimeOffset StartedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
    public DateTimeOffset? CompletedAt { get; set; }
}
