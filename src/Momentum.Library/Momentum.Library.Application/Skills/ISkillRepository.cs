using Momentum.Library.Domain.Skills;

namespace Momentum.Library.Application.Skills;

/// <summary>
/// The skills git repository, expressed as the four things intake actually needs.
/// </summary>
/// <remarks>
/// Deliberately not a general git port. Branch creation, history, merges and pull
/// requests are all absent because intake does none of them — the approval decision
/// happens outside this code and arrives already made.
/// </remarks>
public interface ISkillRepository
{
    /// <summary>
    /// Every file path already present under <paramref name="scopePath"/>.
    /// </summary>
    /// <remarks>
    /// One call, not one per file. Azure DevOps delays rather than rejects as a caller
    /// approaches its throughput budget, and probing a forty-file archive individually
    /// is a good way to find that ceiling.
    /// </remarks>
    Task<IReadOnlyCollection<string>> ListPathsAsync(
        string branch, string scopePath, CancellationToken cancellationToken = default);

    Task<string?> TryReadTextAsync(
        string path, string branch, CancellationToken cancellationToken = default);

    /// <summary>
    /// Pushes one commit. Throws <see cref="SkillRepositoryConflictException"/> when the
    /// branch moved underneath the caller, which is the caller's cue to re-read and retry.
    /// </summary>
    Task<string> CommitAsync(SkillCommit commit, CancellationToken cancellationToken = default);
}

/// <summary>
/// The branch tip moved between reading it and pushing to it — a concurrent intake.
/// Separate from a general failure because it is the one error that is worth retrying
/// unchanged.
/// </summary>
public sealed class SkillRepositoryConflictException(string message, Exception? inner = null)
    : Exception(message, inner);
