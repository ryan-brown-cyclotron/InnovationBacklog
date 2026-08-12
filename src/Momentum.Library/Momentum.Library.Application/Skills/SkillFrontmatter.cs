namespace Momentum.Library.Application.Skills;

/// <summary>
/// Reads the YAML frontmatter block at the top of a SKILL.md.
/// </summary>
/// <remarks>
/// Hand-rolled rather than a YAML dependency. Skill frontmatter is a flat block of
/// <c>key: value</c> lines, and every real parser would bring a package plus the risk of
/// accepting constructs the actual skill loader would not.
/// </remarks>
public static class SkillFrontmatter
{
    private const string Delimiter = "---";

    /// <summary>
    /// Returns the frontmatter keys, or null when the document does not open with a
    /// frontmatter block at all.
    /// </summary>
    public static Dictionary<string, string>? Parse(string markdown)
    {
        var lines = Split(markdown);

        if (lines.Length == 0 || lines[0].Trim() != Delimiter)
        {
            return null;
        }

        var closing = Array.FindIndex(lines, 1, line => line.Trim() == Delimiter);
        if (closing < 0)
        {
            return null;
        }

        var values = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

        for (var index = 1; index < closing; index++)
        {
            var line = lines[index];

            // Continuation lines and list items belong to the previous key; the checks
            // that matter here only read scalars, so they are skipped rather than parsed.
            if (line.Length == 0 || char.IsWhiteSpace(line[0]) || line.TrimStart().StartsWith('#'))
            {
                continue;
            }

            var separator = line.IndexOf(':');
            if (separator <= 0)
            {
                continue;
            }

            var key = line[..separator].Trim();
            var value = Unquote(line[(separator + 1)..].Trim());

            if (key.Length > 0)
            {
                values[key] = value;
            }
        }

        return values;
    }

    /// <summary>
    /// Rewrites the frontmatter <c>name</c>, leaving everything else byte-for-byte.
    /// </summary>
    /// <remarks>
    /// The name a contributor picks is not always the name the catalogue should publish,
    /// and the discrepancy is usually spotted at approval rather than at upload. Rewriting
    /// the file is the only fix that sticks: the frontmatter name is what an agent sees
    /// and matches against, so correcting it anywhere else would leave the published skill
    /// still calling itself the old thing.
    /// <para>
    /// Only the name line is touched. Description, body and file layout are the
    /// contributor's, and an approver renaming a skill is not licence to edit its content.
    /// </para>
    /// </remarks>
    public static string WithName(string markdown, string name)
    {
        var lines = Split(markdown);

        if (lines.Length == 0 || lines[0].Trim() != Delimiter)
        {
            return markdown;
        }

        var closing = Array.FindIndex(lines, 1, line => line.Trim() == Delimiter);
        if (closing < 0)
        {
            return markdown;
        }

        for (var index = 1; index < closing; index++)
        {
            var separator = lines[index].IndexOf(':');
            if (separator <= 0)
            {
                continue;
            }

            if (lines[index][..separator].Trim().Equals("name", StringComparison.OrdinalIgnoreCase))
            {
                lines[index] = $"name: {name}";
                return string.Join('\n', lines);
            }
        }

        // No name line to replace: insert one rather than silently committing without it.
        return string.Join('\n', lines[..1].Append($"name: {name}").Concat(lines[1..]));
    }

    /// <summary>Everything after the frontmatter block.</summary>
    public static string StripFrontmatter(string markdown)
    {
        var lines = Split(markdown);

        if (lines.Length == 0 || lines[0].Trim() != Delimiter)
        {
            return markdown;
        }

        var closing = Array.FindIndex(lines, 1, line => line.Trim() == Delimiter);

        return closing < 0 ? markdown : string.Join('\n', lines[(closing + 1)..]);
    }

    private static string[] Split(string markdown) =>
        markdown.TrimStart('﻿').ReplaceLineEndings("\n").Split('\n');

    private static string Unquote(string value)
    {
        if (value.Length >= 2 &&
            ((value[0] == '"' && value[^1] == '"') || (value[0] == '\'' && value[^1] == '\'')))
        {
            return value[1..^1];
        }

        return value;
    }
}
