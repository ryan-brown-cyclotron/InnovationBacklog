using System.Net;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.Extensions.Logging;
using Momentum.Library.Application.Skills;
using Momentum.Library.Domain.Skills;
using Momentum.Library.Infrastructure.Git;

namespace Momentum.Library.Infrastructure.AzureDevOps;

/// <summary>
/// <see cref="ISkillRepository"/> and <see cref="ISkillRepositoryProvisioner"/> over the Azure
/// DevOps Git REST API.
/// </summary>
/// <remarks>
/// Raw REST rather than the client libraries: the surface is a handful of calls, and the SDK is
/// historically awkward in an isolated Functions worker.
/// <para>
/// The <see cref="HttpClient"/> arrives already authenticated and already pointed at the
/// organization. This type never sees a token or a PAT, which is what lets the same adapter
/// serve a user-delegated call, a service-identity call and a PAT call without knowing the
/// difference.
/// </para>
/// <para>
/// Both ports live on one type because the ADO REST dialect is what is being encapsulated, and
/// splitting it would put the same URL shapes and the same error handling in two files. The
/// ports stay separate so nothing on the intake path can reach a repository create.
/// </para>
/// </remarks>
public sealed class AdoGitSkillRepository(
    HttpClient http,
    AdoGitRepositoryOptions options,
    ILogger<AdoGitSkillRepository> logger) : ISkillRepository, ISkillRepositoryProvisioner
{
    private const string ApiVersion = "7.1";

    /// <summary>
    /// Azure DevOps takes all-zeroes as "this ref does not exist yet; create it" on a push.
    /// The only way to make a first commit into an empty repository.
    /// </summary>
    private const string EmptyObjectId = "0000000000000000000000000000000000000000";

    private string Root => $"{Uri.EscapeDataString(options.Project)}/_apis/git/repositories/{Uri.EscapeDataString(options.RepositoryId)}";

    private string ProjectRoot => $"{Uri.EscapeDataString(options.Project)}/_apis/git/repositories";

    public async Task<IReadOnlyCollection<string>> ListPathsAsync(
        string branch, string scopePath, CancellationToken cancellationToken = default)
    {
        /*
            One recursive listing instead of a HEAD per file. Azure DevOps delays rather
            than rejects as a caller nears its throughput budget, and a forty-file archive
            probed individually is a reliable way to find that ceiling.

            A missing folder is the normal first-adoption case, not an error.
        */
        var url = $"{Root}/items" +
                  $"?scopePath={Uri.EscapeDataString("/" + scopePath.TrimStart('/'))}" +
                  $"&recursionLevel=Full" +
                  $"&versionDescriptor.versionType=branch" +
                  $"&versionDescriptor.version={Uri.EscapeDataString(branch)}" +
                  $"&api-version={ApiVersion}";

        using var response = await http.GetAsync(url, cancellationToken);

        if (response.StatusCode == HttpStatusCode.NotFound)
        {
            logger.LogDebug("No existing folder at {ScopePath} on {Branch}; treating every file as new.",
                scopePath, branch);
            return [];
        }

        var body = await ReadSuccessBodyAsync(response, $"listing {scopePath}", cancellationToken);

        var paths = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var document = JsonNode.Parse(body)?["value"] as JsonArray;

        foreach (var item in document?.OfType<JsonObject>() ?? [])
        {
            if (item["isFolder"]?.GetValue<bool>() == true)
            {
                continue;
            }

            var path = item["path"]?.GetValue<string>();
            if (!string.IsNullOrEmpty(path))
            {
                paths.Add(path.TrimStart('/'));
            }
        }

        return paths;
    }

    public async Task<string?> TryReadTextAsync(
        string path, string branch, CancellationToken cancellationToken = default)
    {
        var url = $"{Root}/items" +
                  $"?path={Uri.EscapeDataString("/" + path.TrimStart('/'))}" +
                  $"&versionDescriptor.versionType=branch" +
                  $"&versionDescriptor.version={Uri.EscapeDataString(branch)}" +
                  $"&includeContent=true" +
                  $"&$format=text" +
                  $"&api-version={ApiVersion}";

        using var response = await http.GetAsync(url, cancellationToken);

        if (response.StatusCode == HttpStatusCode.NotFound)
        {
            return null;
        }

        return await ReadSuccessBodyAsync(response, $"reading {path}", cancellationToken);
    }

    public async Task<string> CommitAsync(SkillCommit commit, CancellationToken cancellationToken = default)
    {
        var oldObjectId = await GetBranchTipAsync(commit.Branch, cancellationToken)
            ?? throw new SkillIntakeException(
                $"Branch '{commit.Branch}' does not exist in repository '{options.RepositoryId}'.");

        var changes = commit.Changes.Select(object (change) =>
        {
            var path = "/" + change.Path.TrimStart('/');

            // A delete carries no newContent at all; sending an empty one is rejected.
            if (change.Type == SkillChangeType.Delete)
            {
                return new { changeType = "delete", item = new { path } };
            }

            return new
            {
                changeType = change.Type == SkillChangeType.Edit ? "edit" : "add",
                item = new { path },
                newContent = new
                {
                    /*
                        Text goes as rawtext; anything else as base64. Committing a PNG as
                        rawtext does not fail — it succeeds and silently corrupts the file,
                        which is far worse than an error.
                    */
                    content = change.IsText
                        ? Encoding.UTF8.GetString(change.Content)
                        : Convert.ToBase64String(change.Content),
                    contentType = change.IsText ? "rawtext" : "base64encoded",
                },
            };
        });

        return await PushAsync(commit.Branch, oldObjectId, changes, commit.Message, cancellationToken);
    }

    // ---------------------------------------------------------------------------
    // ISkillRepositoryProvisioner
    // ---------------------------------------------------------------------------

    public string Describe() =>
        $"Azure DevOps {options.Organization}/{options.Project}/{options.RepositoryId}";

    public async Task<SkillRepositoryState> InspectAsync(
        string branch, CancellationToken cancellationToken = default)
    {
        using var response = await http.GetAsync($"{Root}?api-version={ApiVersion}", cancellationToken);

        if (response.StatusCode == HttpStatusCode.NotFound)
        {
            return new SkillRepositoryState(RepositoryExists: false, BranchExists: false);
        }

        await ReadSuccessBodyAsync(response, $"reading repository '{options.RepositoryId}'", cancellationToken);

        return new SkillRepositoryState(
            RepositoryExists: true,
            BranchExists: await GetBranchTipAsync(branch, cancellationToken) is not null);
    }

    public async Task CreateRepositoryAsync(CancellationToken cancellationToken = default)
    {
        /*
            The configured RepositoryId doubles as a name everywhere else, because the git
            endpoints accept either. Create is the one call that cannot: a GUID names a
            repository that by definition does not exist yet.
        */
        if (Guid.TryParse(options.RepositoryId, out _))
        {
            throw new SkillIntakeException(
                $"Repository '{options.RepositoryId}' does not exist and cannot be created from a GUID. " +
                "Configure Momentum:Skills:AzureDevOps:Repository as a name, or create the repository first.");
        }

        using var content = new StringContent(
            JsonSerializer.Serialize(new { name = options.RepositoryId }),
            Encoding.UTF8,
            "application/json");

        using var response = await http.PostAsync(
            $"{ProjectRoot}?api-version={ApiVersion}", content, cancellationToken);

        await ReadSuccessBodyAsync(
            response, $"creating repository '{options.RepositoryId}'", cancellationToken);

        logger.LogInformation(
            "Created repository {Repository} in {Project}.", options.RepositoryId, options.Project);
    }

    public async Task<string> SeedAsync(
        string branch,
        IReadOnlyDictionary<string, string> files,
        string message,
        CancellationToken cancellationToken = default)
    {
        // Null, not a throw: a repository with no branch is the whole reason to seed, and
        // all-zeroes is how Azure DevOps is told to create the ref on this push.
        var oldObjectId = await GetBranchTipAsync(branch, cancellationToken) ?? EmptyObjectId;

        var changes = files.Select(object (file) => new
        {
            changeType = "add",
            item = new { path = "/" + file.Key.TrimStart('/') },
            newContent = new { content = file.Value, contentType = "rawtext" },
        });

        return await PushAsync(branch, oldObjectId, changes, message, cancellationToken);
    }

    // ---------------------------------------------------------------------------

    private async Task<string> PushAsync(
        string branch,
        string oldObjectId,
        IEnumerable<object> changes,
        string message,
        CancellationToken cancellationToken)
    {
        var payload = new
        {
            refUpdates = new[] { new { name = $"refs/heads/{branch}", oldObjectId } },
            commits = new[] { new { comment = message, changes } },
        };

        using var content = new StringContent(
            JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json");

        using var response = await http.PostAsync(
            $"{Root}/pushes?api-version={ApiVersion}", content, cancellationToken);

        if (response.StatusCode is HttpStatusCode.Conflict or HttpStatusCode.PreconditionFailed)
        {
            throw new SkillRepositoryConflictException(
                $"Branch '{branch}' moved while this commit was being prepared: " +
                await GitRest.ReadErrorMessageAsync(response, cancellationToken));
        }

        var body = await ReadSuccessBodyAsync(response, "pushing the commit", cancellationToken);

        var commitId = JsonNode.Parse(body)?["commits"]?[0]?["commitId"]?.GetValue<string>();

        return commitId ?? throw new SkillIntakeException(
            "The push succeeded but Azure DevOps returned no commit id.");
    }

    /// <summary>
    /// The branch tip, or null when the branch does not exist.
    /// </summary>
    /// <remarks>
    /// Null rather than a throw, because the two callers disagree about what a missing branch
    /// means: intake cannot proceed without one, provisioning is there precisely to create it.
    /// Indexing <c>[0]</c> blind would give an IndexOutOfRange that says nothing.
    /// </remarks>
    private async Task<string?> GetBranchTipAsync(string branch, CancellationToken cancellationToken)
    {
        var url = $"{Root}/refs?filter={Uri.EscapeDataString($"heads/{branch}")}&api-version={ApiVersion}";

        using var response = await http.GetAsync(url, cancellationToken);
        var body = await ReadSuccessBodyAsync(response, $"resolving branch '{branch}'", cancellationToken);

        return (JsonNode.Parse(body)?["value"] as JsonArray)?
            .OfType<JsonObject>()
            .FirstOrDefault()?["objectId"]?.GetValue<string>();
    }

    /// <summary>
    /// Reads a successful body, or throws carrying Azure DevOps' own diagnostic.
    /// </summary>
    /// <remarks>
    /// <c>EnsureSuccessStatusCode</c> would discard the response body, and the body is
    /// where Azure DevOps puts the sentence worth reading — "TF401019: the repository
    /// does not exist", "VS403318: has not accepted the invitation". The status line
    /// alone sends people hunting in the wrong place.
    /// </remarks>
    private static async Task<string> ReadSuccessBodyAsync(
        HttpResponseMessage response, string what, CancellationToken cancellationToken)
    {
        if (response.IsSuccessStatusCode)
        {
            return await response.Content.ReadAsStringAsync(cancellationToken);
        }

        /*
            A redirect means the request arrived unauthenticated: Azure DevOps answers with
            a sign-in page rather than a 401 when it cannot place the caller against the
            organization at all. "Found" as a diagnostic sends people looking in entirely
            the wrong place.
        */
        if (GitRest.IsRedirect(response.StatusCode))
        {
            throw new SkillIntakeException(
                $"Azure DevOps redirected {what} to a sign-in page, meaning the request was " +
                "not authenticated for this organization. Check the organization name and " +
                "that the credential (PAT scope 'Code: read, write & manage', or the calling " +
                "user) is valid for it.");
        }

        var detail = await GitRest.ReadErrorMessageAsync(response, cancellationToken);
        throw new SkillIntakeException($"Azure DevOps refused {what} ({(int)response.StatusCode}): {detail}");
    }
}

/// <summary>Which repository intake writes to.</summary>
public sealed class AdoGitRepositoryOptions
{
    /// <summary>
    /// Organization name. Diagnostics only — the authenticated <see cref="HttpClient"/>'s base
    /// address is what actually decides which organization is reached. Carried so a wrong
    /// target can be named in an error rather than left to be inferred from a 404.
    /// </summary>
    public string Organization { get; set; } = string.Empty;

    public string Project { get; set; } = string.Empty;

    /// <summary>
    /// Repository name or GUID. A name for anything that might need provisioning — a GUID
    /// cannot be created.
    /// </summary>
    public string RepositoryId { get; set; } = string.Empty;

    /// <summary>Branch used when a request does not name one.</summary>
    public string DefaultBranch { get; set; } = "main";
}
