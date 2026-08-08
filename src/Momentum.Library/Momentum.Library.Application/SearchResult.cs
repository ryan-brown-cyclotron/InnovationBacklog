namespace Momentum.Library.Application;

public sealed record SearchResult<T>(IReadOnlyList<T> Items, int TotalCount, int Skip, int Take)
{
    public static SearchResult<T> Empty(int skip, int take) => new(Array.Empty<T>(), 0, skip, take);
}
