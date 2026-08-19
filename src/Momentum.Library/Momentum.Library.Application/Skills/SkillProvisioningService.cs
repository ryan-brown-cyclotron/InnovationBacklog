using Momentum.Library.Domain.Skills;

namespace Momentum.Library.Application.Skills;

/// <summary>
/// Brings a skills repository up to the state intake requires: it exists, the branch exists,
/// and <c>.claude-plugin/marketplace.json</c> is on it.
/// </summary>
/// <remarks>
/// <see cref="SkillIntakeService"/> reads the manifest before every commit and refuses to
/// invent one — "the skills repository is not initialised" — which made repository bootstrap
/// a prerequisite anyone could forget, and one that lived only in a PowerShell script run out
/// of band. This is that script's job, reachable over HTTP with the credentials the app
/// already has.
/// <para>
/// Idempotent by construction: every file is read before it is written, and an already-seeded
/// repository produces no commit at all. Re-running after a partial failure is the intended
/// recovery path.
/// </para>
/// <para>
/// Seeds only what is <em>absent</em>. An existing manifest is left exactly as it is, even if
/// the request names segments it does not contain — registering a segment is intake's job on
/// first use, and silently rewriting a file someone may have hand-tuned is not bootstrap.
/// </para>
/// </remarks>
public sealed class SkillProvisioningService(
    ISkillRepository repository,
    ISkillRepositoryProvisioner provisioner)
{
    public async Task<SkillProvisioningResult> EnsureAsync(
        SkillProvisioningRequest request,
        CancellationToken cancellationToken = default)
    {
        Validate(request);

        var state = await provisioner.InspectAsync(request.Branch, cancellationToken);

        var repositoryCreated = false;
        if (!state.RepositoryExists)
        {
            await provisioner.CreateRepositoryAsync(cancellationToken);
            repositoryCreated = true;

            // A repository created here is empty by design (no auto-init): nothing to read,
            // so skip the reads rather than paying three 404s to learn that.
            state = new SkillRepositoryState(RepositoryExists: true, BranchExists: false);
        }

        var seed = new Dictionary<string, string>(StringComparer.Ordinal);

        var manifest = state.BranchExists
            ? await repository.TryReadTextAsync(MarketplaceManifest.Path, request.Branch, cancellationToken)
            : null;

        var wasInitialised = manifest is not null;

        if (!wasInitialised)
        {
            seed[MarketplaceManifest.Path] = MarketplaceManifest.Serialize(
                MarketplaceManifest.Create(
                    request.ManifestName,
                    request.ManifestOwner,
                    request.ManifestDescription,
                    request.Segments));
        }

        foreach (var (path, content) in SkillRepositoryTemplate.SupportingFiles)
        {
            if (!state.BranchExists ||
                await repository.TryReadTextAsync(path, request.Branch, cancellationToken) is null)
            {
                seed[path] = content;
            }
        }

        /*
            Git stores no empty folders, so a segment asked for at bootstrap needs a
            placeholder to be visible before its first skill lands. Only for a manifest we
            are writing ourselves — adding .gitkeep files to a repository that is already
            initialised would be this method deciding what segments should exist.
        */
        if (!wasInitialised)
        {
            foreach (var segment in request.Segments)
            {
                seed[$"plugins/{segment}/.gitkeep"] = string.Empty;
            }
        }

        string? commitId = null;
        if (seed.Count > 0)
        {
            commitId = await provisioner.SeedAsync(
                request.Branch,
                seed,
                repositoryCreated ? "Initialise skills repository" : "Seed missing skills repository files",
                cancellationToken);
        }

        return new SkillProvisioningResult(
            provisioner.Describe(),
            request.Branch,
            repositoryCreated,
            wasInitialised,
            commitId,
            seed.Keys.Order(StringComparer.Ordinal).ToList());
    }

    /// <summary>
    /// Segments reach a git path, so they are held to the same rules intake holds them to —
    /// a segment of "../.." would otherwise seed a placeholder wherever it liked.
    /// </summary>
    private static void Validate(SkillProvisioningRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Branch))
        {
            throw new SkillIntakeException("A branch is required.");
        }

        foreach (var segment in request.Segments)
        {
            if (string.IsNullOrWhiteSpace(segment) ||
                segment.StartsWith('.') ||
                segment.Any(character =>
                    !char.IsAsciiLetterOrDigit(character) && character is not ('-' or '_' or '.')))
            {
                throw new SkillIntakeException(
                    $"Segment '{segment}' may contain only letters, digits, hyphen, underscore and dot, " +
                    "and may not start with a dot.");
            }
        }
    }
}

/// <param name="Segments">
/// Plugin segments to scaffold. Optional — intake creates a segment on first use, so this
/// only decides what is visible in the repository before any skill has been adopted.
/// </param>
/// <param name="ManifestOwner">
/// Goes in the manifest's <c>owner.name</c>. Cosmetic to us, but it is what a person sees
/// when they add the marketplace.
/// </param>
public sealed record SkillProvisioningRequest(
    string Branch,
    IReadOnlyList<string> Segments,
    string ManifestName,
    string ManifestOwner,
    string ManifestDescription);

/// <param name="Target">Host and repository, echoed back — see <see cref="ISkillRepositoryProvisioner.Describe"/>.</param>
/// <param name="WasInitialised">
/// True when the manifest was already present, i.e. this call changed nothing that mattered.
/// The distinction worth reporting: a 200 with no commit means "already fine", not "did
/// something".
/// </param>
public sealed record SkillProvisioningResult(
    string Target,
    string Branch,
    bool RepositoryCreated,
    bool WasInitialised,
    string? CommitId,
    IReadOnlyList<string> SeededPaths);
