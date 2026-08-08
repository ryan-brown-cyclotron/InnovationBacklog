namespace Momentum.Library.Domain.Identity;

public sealed record UserId(string Value)
{
    public static implicit operator string(UserId userId) => userId.Value;
}
