namespace Momentum.Library.Infrastructure.AzureStorage;

public sealed class OutboxEntity : AzureTableEntityBase
{
    public string EventType { get; set; } = null!;
    public string CorrelationId { get; set; } = null!;
    public string CausationId { get; set; } = null!;
    public string Body { get; set; } = null!;
    public bool Published { get; set; }
    public DateTimeOffset EnqueuedAt { get; set; }
}
