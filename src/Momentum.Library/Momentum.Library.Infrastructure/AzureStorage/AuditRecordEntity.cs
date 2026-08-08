namespace Momentum.Library.Infrastructure.AzureStorage;

public sealed class AuditRecordEntity : AzureTableEntityBase
{
    public string Action { get; set; } = null!;
    public string ResourceType { get; set; } = null!;
    public string ResourceId { get; set; } = null!;
    public string SubjectId { get; set; } = null!;
    public string ActorType { get; set; } = null!;
    public string ActorId { get; set; } = null!;
    public string Summary { get; set; } = null!;
    public string Audience { get; set; } = null!;
    public string DetailsJson { get; set; } = "{}";
    public DateTimeOffset OccurredAt { get; set; }
}
