using Momentum.Library.Domain.Engagement;
using Momentum.Library.Domain.Identity;

namespace Momentum.Library.Infrastructure.AzureStorage;

public sealed class VoteEntity : AzureTableEntityBase
{
    public string VoteId { get; set; } = null!;
    public string ItemType { get; set; } = null!;
    public string ItemId { get; set; } = null!;
    public string UserId { get; set; } = null!;
    public DateTimeOffset CreatedAt { get; set; }
}
