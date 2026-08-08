namespace Momentum.Library.Domain.Tagging;

/// <summary>
/// Free-text labels on an idea or a solution. Tags are how people find work by
/// technology, team, or theme, so they are normalized on the way in — otherwise
/// "Power Automate", "power automate", and " Power Automate " become three tags
/// that never match each other.
/// </summary>
public static class TagList
{
    public const int MaxTags = 8;
    public const int MaxTagLength = 32;

    public static IReadOnlyList<string> Normalize(IEnumerable<string>? tags)
    {
        if (tags is null) return Array.Empty<string>();

        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var result = new List<string>();
        foreach (var raw in tags)
        {
            if (string.IsNullOrWhiteSpace(raw)) continue;

            var tag = CollapseWhitespace(raw.Trim());
            if (tag.Length > MaxTagLength) tag = tag[..MaxTagLength].TrimEnd();
            if (tag.Length == 0) continue;

            // First spelling wins, so the original casing is what people see.
            if (!seen.Add(tag)) continue;

            result.Add(tag);
            if (result.Count == MaxTags) break;
        }
        return result;
    }

    /// <summary>Whether any tag matches the query, for search.</summary>
    public static bool Matches(IEnumerable<string> tags, string query) =>
        !string.IsNullOrWhiteSpace(query)
        && tags.Any(tag => tag.Contains(query, StringComparison.OrdinalIgnoreCase));

    private static string CollapseWhitespace(string value) =>
        string.Join(' ', value.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries));
}
