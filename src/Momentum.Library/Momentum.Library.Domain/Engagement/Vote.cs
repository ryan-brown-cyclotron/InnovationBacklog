using Momentum.Library.Domain.Identity;

namespace Momentum.Library.Domain.Engagement;

public sealed record Vote
{
    public string Id { get; init; } = Guid.NewGuid().ToString("N");
    public HubItemReference Target { get; init; } = null!;
    public UserId UserId { get; init; } = null!;
    public DateTimeOffset CreatedAt { get; init; } = DateTimeOffset.UtcNow;

    public Vote() { }
}
