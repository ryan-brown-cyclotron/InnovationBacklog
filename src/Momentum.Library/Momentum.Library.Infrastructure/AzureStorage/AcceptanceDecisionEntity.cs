namespace Momentum.Library.Infrastructure.AzureStorage;

public sealed class AcceptanceDecisionEntity : AzureTableEntityBase
{
    public string ApproverId { get; set; } = null!;
    public string Decision { get; set; } = null!;
    public string Rationale { get; set; } = string.Empty;
    public DateTimeOffset DecidedAt { get; set; }
}
