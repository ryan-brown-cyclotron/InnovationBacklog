using Momentum.Library.Domain.Events;
using Momentum.Library.Domain.Identity;

namespace Momentum.Library.Domain.Reviews;

public sealed record Review
{
    public string Id { get; init; } = Guid.NewGuid().ToString("N");
    public string SubjectId { get; init; } = string.Empty;
    public Engagement.HubItemType SubjectType { get; init; } = Engagement.HubItemType.Request;
    public ReviewType ReviewType { get; init; }
    public UserId? ReviewerId { get; init; }
    public object Result { get; init; } = new object();
    public string Summary { get; init; } = string.Empty;
    public DateTimeOffset CreatedAt { get; init; } = DateTimeOffset.UtcNow;

    public Review() { }
}
