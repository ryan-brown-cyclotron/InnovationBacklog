namespace Momentum.Library.Domain.Skills;

public enum SkillIssueSeverity
{
    /// <summary>Blocks a commit. The upload is not a usable skill.</summary>
    Error,

    /// <summary>Worth a reviewer's attention, but commits fine.</summary>
    Warning,
}

/// <summary>
/// One finding about an uploaded package.
/// </summary>
/// <param name="Code">
/// Stable identifier, so the UI can react to a specific finding without matching on
/// prose. Messages are for people and will be reworded; codes are not.
/// </param>
public sealed record SkillValidationIssue(SkillIssueSeverity Severity, string Code, string Message);

/// <summary>
/// What an upload is, and whether it could be committed as a skill.
/// </summary>
/// <remarks>
/// Produced without touching the repository, so the UI can check an attachment the moment
/// someone picks it and hold the result — alongside the file — until an approver decides.
/// Nothing here proves the skill is *good*; it proves the package is well-formed and
/// names itself consistently.
/// </remarks>
public sealed record SkillValidationReport(
    bool IsValid,
    string? SkillName,
    string? Description,
    int FileCount,
    int TotalBytes,
    IReadOnlyList<string> Paths,
    IReadOnlyList<SkillValidationIssue> Issues)
{
    public IEnumerable<SkillValidationIssue> Errors =>
        Issues.Where(issue => issue.Severity == SkillIssueSeverity.Error);

    /// <summary>A report for an upload that could not even be unpacked.</summary>
    public static SkillValidationReport Unreadable(string code, string message) =>
        new(false, null, null, 0, 0, [], [new SkillValidationIssue(SkillIssueSeverity.Error, code, message)]);
}
