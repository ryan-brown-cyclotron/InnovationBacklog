namespace Momentum.Library.Infrastructure.AzureStorage;

public sealed class ContributionEntity : AzureTableEntityBase
{
    public string ContributionId { get; set; } = null!;
    public string ItemType { get; set; } = null!;
    public string ItemId { get; set; } = null!;
    public string RequestedBy { get; set; } = null!;
    public string Message { get; set; } = string.Empty;
    public string Status { get; set; } = null!;
    public string? DecidedBy { get; set; }
    public string? Rationale { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
    public DateTimeOffset? DecidedAt { get; set; }
}
