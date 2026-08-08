namespace Momentum.Library.Infrastructure.AzureStorage;

public sealed class AgentRunEntity : AzureTableEntityBase
{
    public string SubjectId { get; set; } = null!;
    public string AgentType { get; set; } = null!;
    public string ResultJson { get; set; } = "{}";
    public DateTimeOffset StartedAt { get; set; }
}
