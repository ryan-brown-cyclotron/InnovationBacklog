using System.Text;
using Momentum.Library.Domain.Skills;

namespace Momentum.Library.Application.Skills;

/// <summary>
/// Structural checks on an uploaded package.
/// </summary>
/// <remarks>
/// Answers "is this shaped like a skill", not "is this a good skill". Judgement belongs
/// to the approver; this catches the things that would otherwise be discovered after the
/// commit, when they are expensive to undo.
/// </remarks>
public static class SkillValidator
{
    public const string EntryFile = "SKILL.md";

    public static SkillValidationReport Validate(byte[] upload, string uploadFileName)
    {
        SkillPackage package;
        try
        {
            // The name is irrelevant to validation; only the extension selects the unpacker.
            package = SkillPackageExtractor.Extract(upload, uploadFileName, "candidate");
        }
        catch (SkillIntakeException ex)
        {
            return SkillValidationReport.Unreadable("unreadable", ex.Message);
        }

        var issues = new List<SkillValidationIssue>();

        var entry = package.Files.FirstOrDefault(file =>
            string.Equals(file.RelativePath, EntryFile, StringComparison.OrdinalIgnoreCase));

        if (entry is null)
        {
            issues.Add(Error("missing-skill-md",
                $"No {EntryFile} at the root of the package. A skill is identified by that file."));

            return Report(package, null, null, issues);
        }

        // Anything not decodable as text would have been flagged binary by the extractor.
        var markdown = Encoding.UTF8.GetString(entry.Content);
        var frontmatter = SkillFrontmatter.Parse(markdown);

        if (frontmatter is null)
        {
            issues.Add(Error("missing-frontmatter",
                $"{EntryFile} has no YAML frontmatter. It must open with a --- delimited block " +
                "declaring at least name and description."));

            return Report(package, null, null, issues);
        }

        frontmatter.TryGetValue("name", out var name);
        frontmatter.TryGetValue("description", out var description);

        ValidateName(name, issues);
        ValidateDescription(description, issues);
        ValidateBody(markdown, issues);
        ValidateContents(package, issues);

        return Report(package, name, description, issues);
    }

    /*
        These rules mirror the published Agent Skills frontmatter spec, not our own
        preferences. A package that passes here and is then rejected by the skill loader
        is worse than no validation at all — it moves the failure from upload time, where
        the author can fix it, to load time, where nobody is watching.

        name:        <= 64 chars, lowercase letters/digits/hyphens only, no XML tags,
                     and not containing the reserved words "anthropic" or "claude".
        description: non-empty, <= 1024 chars, no XML tags.
    */
    private static readonly string[] ReservedNameWords = ["anthropic", "claude"];

    /// <summary>
    /// Checks a name on its own, for an approver-supplied rename that has no package
    /// around it yet. Returns errors only.
    /// </summary>
    public static IReadOnlyList<SkillValidationIssue> ValidateNameOnly(string? name)
    {
        var issues = new List<SkillValidationIssue>();
        ValidateName(name, issues);
        return issues.Where(issue => issue.Severity == SkillIssueSeverity.Error).ToList();
    }

    private static void ValidateName(string? name, List<SkillValidationIssue> issues)
    {
        if (string.IsNullOrWhiteSpace(name))
        {
            issues.Add(Error("missing-name", $"{EntryFile} frontmatter has no name."));
            return;
        }

        var usable = name.All(character =>
            char.IsAsciiDigit(character) || (char.IsAsciiLetterLower(character)) || character == '-');

        if (!usable)
        {
            issues.Add(Error("unusable-name",
                $"Skill name '{name}' may contain only lowercase letters, digits and hyphens."));
        }

        if (name.Length > 64)
        {
            issues.Add(Error("name-too-long",
                $"Skill name '{name}' is {name.Length} characters; the limit is 64."));
        }

        foreach (var reserved in ReservedNameWords)
        {
            if (name.Contains(reserved, StringComparison.OrdinalIgnoreCase))
            {
                issues.Add(Error("reserved-name",
                    $"Skill name '{name}' contains the reserved word '{reserved}'."));
            }
        }

        if (ContainsXmlTag(name))
        {
            issues.Add(Error("xml-in-name", $"Skill name '{name}' contains an XML tag."));
        }
    }

    private static void ValidateDescription(string? description, List<SkillValidationIssue> issues)
    {
        if (string.IsNullOrWhiteSpace(description))
        {
            issues.Add(Error("missing-description",
                $"{EntryFile} frontmatter has no description. It is what tells an agent when to " +
                "reach for this skill, so an empty one makes the skill undiscoverable."));
            return;
        }

        if (description.Length > 1024)
        {
            issues.Add(Error("description-too-long",
                $"The description is {description.Length} characters; the limit is 1024."));
        }

        if (ContainsXmlTag(description))
        {
            issues.Add(Error("xml-in-description", "The description contains an XML tag."));
        }

        if (description.Length < 20)
        {
            issues.Add(Warning("thin-description",
                "The description is very short. It is the only thing an agent sees when deciding " +
                "whether this skill applies."));
        }
    }

    /// <summary>
    /// Looks for an angle-bracketed tag. Deliberately crude: the frontmatter is injected
    /// into a system prompt, so anything tag-shaped is worth refusing rather than parsing.
    /// </summary>
    private static bool ContainsXmlTag(string value)
    {
        var open = value.IndexOf('<');
        return open >= 0 && value.IndexOf('>', open) > open;
    }

    private static void ValidateBody(string markdown, List<SkillValidationIssue> issues)
    {
        var body = SkillFrontmatter.StripFrontmatter(markdown);

        if (string.IsNullOrWhiteSpace(body))
        {
            issues.Add(Error("empty-body",
                $"{EntryFile} has frontmatter but no content beneath it."));
        }
        else if (body.Trim().Length < 200)
        {
            issues.Add(Warning("thin-body",
                $"{EntryFile} is very short. Skills that only restate their description rarely " +
                "change what a model does."));
        }
    }

    private static void ValidateContents(SkillPackage package, List<SkillValidationIssue> issues)
    {
        var executables = package.Files
            .Where(file => Path.GetExtension(file.RelativePath).ToLowerInvariant()
                is ".exe" or ".dll" or ".bat" or ".cmd" or ".ps1" or ".sh" or ".msi")
            .Select(file => file.RelativePath)
            .ToList();

        if (executables.Count > 0)
        {
            issues.Add(Warning("executable-content",
                "The package contains executable or script files, which a reviewer should read " +
                $"before adoption: {string.Join(", ", executables)}."));
        }

        var duplicates = package.Files
            .GroupBy(file => file.RelativePath, StringComparer.OrdinalIgnoreCase)
            .Where(group => group.Count() > 1)
            .Select(group => group.Key)
            .ToList();

        if (duplicates.Count > 0)
        {
            // Two entries differing only by case collide on commit, and one silently wins.
            issues.Add(Error("duplicate-paths",
                $"The package holds paths that differ only by case: {string.Join(", ", duplicates)}."));
        }
    }

    private static SkillValidationReport Report(
        SkillPackage package, string? name, string? description, List<SkillValidationIssue> issues) =>
        new(
            IsValid: !issues.Any(issue => issue.Severity == SkillIssueSeverity.Error),
            SkillName: name,
            Description: description,
            FileCount: package.Files.Count,
            TotalBytes: package.TotalSize,
            Paths: package.Files.Select(file => file.RelativePath).ToList(),
            Issues: issues);

    private static SkillValidationIssue Error(string code, string message) =>
        new(SkillIssueSeverity.Error, code, message);

    private static SkillValidationIssue Warning(string code, string message) =>
        new(SkillIssueSeverity.Warning, code, message);
}
