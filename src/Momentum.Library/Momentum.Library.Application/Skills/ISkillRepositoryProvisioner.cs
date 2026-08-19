namespace Momentum.Library.Application.Skills;

/// <summary>
/// Bootstrap for the skills repository: does it exist, and can it be seeded.
/// </summary>
/// <remarks>
/// A second port rather than three more methods on <see cref="ISkillRepository"/>, because
/// the two have different lifetimes and different callers. Intake runs on every approval and
/// needs exactly four git operations; this runs once per repository, needs repository-admin
/// rights that intake does not, and touches an API surface (creating a repository) that is
/// not git at all.
/// <para>
/// Both are implemented by the same adapter per host — one place holds each host's REST
/// dialect — but they are asked for separately so that nothing on the intake path can reach
/// a create.
/// </para>
/// </remarks>
public interface ISkillRepositoryProvisioner
{
    /// <summary>
    /// What is already there. Neither a missing repository nor a missing branch is an error
    /// here — they are the two states provisioning exists to fix.
    /// </summary>
    Task<SkillRepositoryState> InspectAsync(
        string branch, CancellationToken cancellationToken = default);

    /// <summary>
    /// Creates the repository. Called only after <see cref="InspectAsync"/> reported it
    /// absent, so an "already exists" from the host is a race, not a normal outcome.
    /// </summary>
    Task CreateRepositoryAsync(CancellationToken cancellationToken = default);

    /// <summary>
    /// Writes the seed files as one commit, creating <paramref name="branch"/> if it does
    /// not exist yet.
    /// </summary>
    /// <remarks>
    /// Separate from <see cref="ISkillRepository.CommitAsync"/> because a first commit has
    /// no parent, and every host spells that differently — Azure DevOps takes an all-zeroes
    /// <c>oldObjectId</c>, GitHub takes a commit with an empty <c>parents</c> array followed
    /// by a ref create rather than a ref update. Intake never needs either.
    /// </remarks>
    /// <param name="files">Repository-relative path to text content. Seeds are always text.</param>
    Task<string> SeedAsync(
        string branch,
        IReadOnlyDictionary<string, string> files,
        string message,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Host and target, for logs and for the provisioning response — "GitHub octo/skills",
    /// "Azure DevOps CyclotronInc/Innovation Backlog/skills". The one thing most worth
    /// echoing back, because a misconfigured target is the failure that looks like a
    /// permissions problem.
    /// </summary>
    string Describe();
}

/// <param name="RepositoryExists">False on a first run, or when the name is wrong.</param>
/// <param name="BranchExists">
/// False for a repository that exists but has never been pushed to. Reported rather than
/// inferred from <paramref name="RepositoryExists"/> because an empty repository is a state
/// people reach by creating one in the web UI and stopping there.
/// </param>
public sealed record SkillRepositoryState(bool RepositoryExists, bool BranchExists);
