namespace Momentum.Library.Domain.Skills;

/// <summary>
/// One file destined for the skills repository.
/// </summary>
/// <remarks>
/// Content is held as bytes, not text, and <see cref="IsText"/> decides how it is
/// committed. An archived skill can carry icons and screenshots alongside its markdown,
/// and round-tripping those through a string silently corrupts them.
/// </remarks>
/// <param name="RelativePath">Path within the skill folder, forward-slashed, never rooted.</param>
public sealed record SkillFile(string RelativePath, byte[] Content, bool IsText)
{
    public int Size => Content.Length;
}

/// <summary>
/// An upload, normalised into files ready to be written to a branch.
/// </summary>
public sealed record SkillPackage(string SkillName, IReadOnlyList<SkillFile> Files)
{
    public int TotalSize => Files.Sum(file => file.Size);
}

/// <summary>
/// Maps directly onto the Azure DevOps push change types. Sending the wrong one fails
/// the whole push, so it is resolved before the commit is built, never guessed.
/// </summary>
public enum SkillChangeType
{
    Add,
    Edit,

    /// <summary>
    /// Removes a file. Used when a skill is renamed at approval and its previous folder
    /// has to go, so the same solution does not end up published twice.
    /// </summary>
    Delete,
}

public sealed record SkillFileChange(string Path, SkillChangeType Type, byte[] Content, bool IsText)
{
    public static SkillFileChange Write(string path, byte[] content, bool isText, bool exists) =>
        new(path, exists ? SkillChangeType.Edit : SkillChangeType.Add, content, isText);

    public static SkillFileChange Remove(string path) =>
        new(path, SkillChangeType.Delete, [], IsText: true);
}

/// <summary>
/// Everything needed to push one commit: where it lands, what changes, and why.
/// </summary>
public sealed record SkillCommit(string Branch, IReadOnlyList<SkillFileChange> Changes, string Message);

/// <summary>
/// Names the destination of an intake, and the audit trail behind it.
/// </summary>
/// <remarks>
/// <paramref name="ApprovedBy"/> is corroboration, not authority. The commit is made
/// under the calling user's own token, so Azure DevOps records who actually wrote it —
/// this field records who signed it off, which may be someone else.
/// </remarks>
/// <param name="SolutionId">
/// The solution this skill was adopted from. It becomes the skill's folder name, which is
/// the whole of the linkage — no sidecar, no second store. Finding the skill for a
/// solution is a path lookup, and finding the solution for a skill is reading the folder
/// name off the path.
/// </param>
/// <param name="SkillName">
/// Optional rename applied at approval. When set, the frontmatter <c>name</c> in the
/// committed SKILL.md is rewritten to this — the published name is the frontmatter name,
/// so correcting it anywhere else would leave the skill still calling itself the old
/// thing. Null keeps whatever the contributor wrote.
/// <para>
/// Independent of the folder name, which is always the solution id. The two were never
/// required to agree.
/// </para>
/// </param>
public sealed record SkillIntakeRequest(
    string? SkillName,
    string Segment,
    string Branch,
    string UploadFileName,
    byte[] UploadContent,
    string ApprovedBy,
    string SolutionId,
    string? PluginVersion);

public sealed record SkillIntakeResult(
    string CommitId,
    string Branch,
    string DestinationPath,
    bool IsNewSegment,
    IReadOnlyList<string> Paths);

/// <summary>
/// Raised when an upload cannot be turned into a commit. Carries a message meant to
/// reach the person who uploaded the file.
/// </summary>
public sealed class SkillIntakeException(string message, Exception? inner = null)
    : Exception(message, inner);
