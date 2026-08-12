using System.Text;
using Momentum.Library.Domain.Skills;

namespace Momentum.Library.Application.Skills;

/// <summary>
/// Commits an approved skill into the skills repository.
/// </summary>
/// <remarks>
/// Mechanics only. Whether a skill should be adopted, and into which segment, is decided
/// by the approval process upstream and arrives here already settled — this type does not
/// second-guess it. What it does own is getting the write right: resolving add versus
/// edit, keeping the manifest consistent with the folders, and surviving a concurrent
/// intake.
/// </remarks>
public sealed class SkillIntakeService(ISkillRepository repository)
{
    /// <summary>
    /// Attempts past the first. Two people adopting skills at once is ordinary, and the
    /// loser of that race should not have to re-upload.
    /// </summary>
    private const int MaxConflictRetries = 3;

    public async Task<SkillIntakeResult> AdoptAsync(
        SkillIntakeRequest request,
        CancellationToken cancellationToken = default)
    {
        Validate(request);

        // The same validation the UI ran at attach time, re-run here. What was checked at
        // upload and what is committed on approval can be minutes or days apart.
        var report = SkillValidator.Validate(request.UploadContent, request.UploadFileName);
        if (!report.IsValid)
        {
            throw new SkillIntakeException(
                "The package is not a valid skill: " +
                string.Join(" ", report.Errors.Select(issue => issue.Message)));
        }

        var package = ApplyRename(
            SkillPackageExtractor.Extract(request.UploadContent, request.UploadFileName, "skill"),
            request.SkillName);

        // Validation guarantees a frontmatter name, so this only returns null if that
        // contract is broken.
        var name = request.SkillName ?? NameFromPackage(package)
            ?? throw new SkillIntakeException("The package has no skill name to publish under.");

        var destination = DestinationPrefix(request.Segment, request.SolutionId, name);

        /*
            Read tip, build commit, push. Between the read and the push another intake can
            land, and Azure DevOps rejects the push because oldObjectId no longer matches.
            Everything inside the loop is re-read, because what already exists and what the
            manifest holds may both have changed.
        */
        for (var attempt = 1; ; attempt++)
        {
            try
            {
                return await BuildAndCommitAsync(request, package, destination, cancellationToken);
            }
            catch (SkillRepositoryConflictException) when (attempt < MaxConflictRetries)
            {
                // Re-read and rebuild against the new tip.
            }
        }
    }

    private async Task<SkillIntakeResult> BuildAndCommitAsync(
        SkillIntakeRequest request,
        SkillPackage package,
        string destination,
        CancellationToken cancellationToken)
    {
        /*
            Listed at the segment's skills root rather than at this skill's folder — one
            call either way, and the wider scope is what makes a rename a move.

            With the name in the folder, re-adopting a solution under a corrected name
            writes to a *different* folder. Listing only the new one would leave the old
            folder in place, and the marketplace would then publish the same solution
            twice under two names. Every folder for this solution is found by prefix, and
            anything outside the current destination is deleted in the same commit.
        */
        var segmentPaths = await repository.ListPathsAsync(
            request.Branch, SegmentSkillsRoot(request.Segment), cancellationToken);

        var solutionPrefix = $"{SegmentSkillsRoot(request.Segment)}{request.SolutionId}{SolutionSeparator}";

        var existingPaths = segmentPaths
            .Where(path => path.StartsWith(destination, StringComparison.OrdinalIgnoreCase))
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        var stalePaths = segmentPaths
            .Where(path => path.StartsWith(solutionPrefix, StringComparison.OrdinalIgnoreCase)
                        && !path.StartsWith(destination, StringComparison.OrdinalIgnoreCase))
            .ToList();

        var changes = new List<SkillFileChange>(package.Files.Count + stalePaths.Count + 1);

        foreach (var file in package.Files)
        {
            var repoPath = destination + file.RelativePath;
            changes.Add(SkillFileChange.Write(
                repoPath, file.Content, file.IsText, existingPaths.Contains(repoPath)));
        }

        foreach (var stale in stalePaths)
        {
            changes.Add(SkillFileChange.Remove(stale));
        }

        var manifestContent = await repository.TryReadTextAsync(
            MarketplaceManifest.Path, request.Branch, cancellationToken)
            ?? throw new SkillIntakeException(
                $"{MarketplaceManifest.Path} was not found on branch '{request.Branch}'. " +
                "The skills repository is not initialised.");

        /*
            Both sides go through the same serializer before comparison. Comparing against
            the raw file text would call every intake a change, because the stored file's
            whitespace is whatever a human last left it as.
        */
        var before = MarketplaceManifest.Serialize(MarketplaceManifest.Parse(manifestContent));

        var manifest = MarketplaceManifest.Parse(manifestContent);
        var isNewSegment = MarketplaceManifest.UpsertPlugin(
            manifest, request.Segment, $"./plugins/{request.Segment}", request.PluginVersion);

        var serialized = MarketplaceManifest.Serialize(manifest);

        // Only touch the manifest when it actually changed: a no-op edit still produces a
        // commit, and a repository full of empty manifest commits hides the real history.
        if (!string.Equals(before, serialized, StringComparison.Ordinal))
        {
            changes.Add(SkillFileChange.Write(
                MarketplaceManifest.Path,
                Encoding.UTF8.GetBytes(serialized),
                isText: true,
                exists: true));
        }

        var commit = new SkillCommit(request.Branch, changes, BuildMessage(request, package, isNewSegment));
        var commitId = await repository.CommitAsync(commit, cancellationToken);

        return new SkillIntakeResult(
            commitId,
            request.Branch,
            destination,
            isNewSegment,
            changes.Select(change => change.Path).ToList());
    }

    /// <summary>
    /// Rewrites the frontmatter name in SKILL.md when the approver supplied a different one.
    /// </summary>
    private static SkillPackage ApplyRename(SkillPackage package, string? newName)
    {
        if (string.IsNullOrWhiteSpace(newName))
        {
            return package;
        }

        var entry = package.Files.FirstOrDefault(file =>
            string.Equals(file.RelativePath, SkillValidator.EntryFile, StringComparison.OrdinalIgnoreCase));

        // Validation has already established SKILL.md exists and is text.
        if (entry is null)
        {
            return package;
        }

        var rewritten = SkillFrontmatter.WithName(Encoding.UTF8.GetString(entry.Content), newName);

        var files = package.Files
            .Select(file => file == entry
                ? file with { Content = Encoding.UTF8.GetBytes(rewritten) }
                : file)
            .ToList();

        return package with { Files = files };
    }

    /// <summary>
    /// Where a skill lives: <c>{solutionId}__{name}</c>.
    /// </summary>
    /// <remarks>
    /// The solution id carries the linkage and the name keeps the repository browsable.
    /// Reading the solution back is a split on the separator; finding a solution's folder
    /// is a prefix match on <c>{solutionId}__</c>. Nothing else is stored or kept in step.
    /// <para>
    /// A double underscore because a single one is legal inside a skill name, and the
    /// separator has to be unambiguous when splitting the folder back apart. Skill names
    /// are lowercase, digits and hyphens only, so a double underscore cannot occur inside
    /// one.
    /// </para>
    /// </remarks>
    public const string SolutionSeparator = "__";

    private static string DestinationPrefix(string segment, string solutionId, string name) =>
        $"{SegmentSkillsRoot(segment)}{solutionId}{SolutionSeparator}{name}/";

    private static string SegmentSkillsRoot(string segment) => $"plugins/{segment}/skills/";

    private static string BuildMessage(SkillIntakeRequest request, SkillPackage package, bool isNewSegment)
    {
        var verb = isNewSegment ? "Add" : "Update";

        // The folder is a GUID, so the message is where anyone reading history finds out
        // what it actually holds.
        var name = request.SkillName ?? NameFromPackage(package) ?? "unnamed";

        var message = $"{verb} skill '{name}' in segment '{request.Segment}'\n\n" +
                      $"Solution-id: {request.SolutionId}\n" +
                      $"Approved-by: {request.ApprovedBy}";

        return request.SkillName is null
            ? message
            : message + $"\nRenamed-at-approval: {request.SkillName}";
    }

    private static string? NameFromPackage(SkillPackage package)
    {
        var entry = package.Files.FirstOrDefault(file =>
            string.Equals(file.RelativePath, SkillValidator.EntryFile, StringComparison.OrdinalIgnoreCase));

        if (entry is null)
        {
            return null;
        }

        var frontmatter = SkillFrontmatter.Parse(Encoding.UTF8.GetString(entry.Content));
        return frontmatter is not null && frontmatter.TryGetValue("name", out var name) ? name : null;
    }

    /// <summary>
    /// Names reach a git path and a ref name, so they are constrained here rather than
    /// trusted. A segment of "../.." would otherwise write wherever it liked.
    /// </summary>
    private static void Validate(SkillIntakeRequest request)
    {
        RequireSafeSegment(request.Segment, nameof(request.Segment));
        RequireSafeBranch(request.Branch);

        /*
            A rename is written into the frontmatter, so it is held to the published skill
            name rules rather than to our path rules — the folder is the solution id and
            does not care what the skill is called.
        */
        if (!string.IsNullOrWhiteSpace(request.SkillName))
        {
            var nameIssues = SkillValidator.ValidateNameOnly(request.SkillName);
            if (nameIssues.Count > 0)
            {
                throw new SkillIntakeException(
                    "The requested name cannot be published: " +
                    string.Join(" ", nameIssues.Select(issue => issue.Message)));
            }
        }

        // The solution id is the folder name, so it is held to the same rules — and to
        // being a GUID, since that is the only thing it is ever supposed to be.
        if (!Guid.TryParse(request.SolutionId, out _))
        {
            throw new SkillIntakeException(
                $"SolutionId '{request.SolutionId}' is not a GUID. It becomes the skill's folder name.");
        }

        if (string.IsNullOrWhiteSpace(request.ApprovedBy))
        {
            throw new SkillIntakeException("An approver must be recorded.");
        }
    }

    private static void RequireSafeSegment(string value, string field)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            throw new SkillIntakeException($"{field} is required.");
        }

        if (value.Length > 64)
        {
            throw new SkillIntakeException($"{field} is longer than 64 characters.");
        }

        foreach (var character in value)
        {
            var allowed = char.IsAsciiLetterOrDigit(character) || character is '-' or '_' or '.';
            if (!allowed)
            {
                throw new SkillIntakeException(
                    $"{field} '{value}' may contain only letters, digits, hyphen, underscore and dot.");
            }
        }

        if (value.StartsWith('.'))
        {
            throw new SkillIntakeException($"{field} may not start with a dot.");
        }
    }

    private static void RequireSafeBranch(string branch)
    {
        if (string.IsNullOrWhiteSpace(branch))
        {
            throw new SkillIntakeException("A branch is required.");
        }

        // Deliberately narrow. The branch is interpolated into refs/heads/<branch>, and
        // the intake surface has no reason to reach exotic ref names.
        foreach (var character in branch)
        {
            var allowed = char.IsAsciiLetterOrDigit(character) || character is '-' or '_' or '.' or '/';
            if (!allowed)
            {
                throw new SkillIntakeException($"Branch '{branch}' contains unsupported characters.");
            }
        }

        if (branch.Contains("..", StringComparison.Ordinal) || branch.StartsWith('/') || branch.EndsWith('/'))
        {
            throw new SkillIntakeException($"Branch '{branch}' is not a valid ref name.");
        }
    }
}
