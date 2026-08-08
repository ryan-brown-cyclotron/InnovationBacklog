namespace Momentum.Library.Infrastructure.AzureStorage;

public sealed class ProcessedEventEntity : AzureTableEntityBase
{
    public string Status { get; set; } = "Processing";
    public DateTimeOffset ClaimedAt { get; set; }
    public DateTimeOffset? CompletedAt { get; set; }
}