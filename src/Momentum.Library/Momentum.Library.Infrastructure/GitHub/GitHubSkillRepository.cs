using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json.Nodes;
using Microsoft.Extensions.Logging;
using Momentum.Library.Application.Skills;
using Momentum.Library.Domain.Skills;
using Momentum.Library.Infrastructure.Git;

namespace Momentum.Library.Infrastructure.GitHub;

/// <summary>
/// <see cref="ISkillRepository"/> and <see cref="ISkillRepositoryProvisioner"/> over the GitHub
/// REST API.
/// </summary>
/// <remarks>
/// A second adapter rather than a second intake path. <see cref="ISkillRepository"/> is four
/// operations chosen because they are what intake needs, not because they mirror Azure DevOps —
/// which is what makes a different host a new implementation and nothing else. Every rule about
/// where a skill lands, what the folder name means, and what a rename at approval does lives in
/// <see cref="SkillIntakeService"/> and is shared.
/// <para>
/// <b>Committing here is four calls, not one.</b> Azure DevOps has a push endpoint that takes a
/// whole multi-file changeset; GitHub does not. The Contents API writes one file per commit,
/// which would turn a forty-file skill into forty commits, so this uses the low-level Git Data
/// API instead: build a tree on top of the current one, make a commit pointing at it, then move
/// the ref. That is also the only route that can express a delete, which a rename at approval
/// requires.
/// </para>
/// <para>
/// <see cref="SkillChangeType.Add"/> and <see cref="SkillChangeType.Edit"/> are the same thing
/// to a git tree — the distinction exists because Azure DevOps rejects the wrong one. It is
/// ignored here rather than being wrong here.
/// </para>
/// <para>
/// The <see cref="HttpClient"/> arrives already authenticated, already pointed at the API root,
/// and already carrying the <c>Accept</c>, API version and <c>User-Agent</c> headers GitHub
/// requires. This type never sees a token.
/// </para>
/// </remarks>
public sealed class GitHubSkillRepository(
    HttpClient http,
    GitHubRepositoryOptions options,
    ILogger<GitHubSkillRepository> logger) : ISkillRepository, ISkillRepositoryProvisioner
{
    /// <summary>
    /// Non-executable regular file. Skills are markdown, text and the occasional image; nothing
    /// intake writes needs the executable bit, and guessing at one would put a mode in git
    /// history that no upload format actually carried.
    /// </summary>
    private const string BlobMode = "100644";

    private string Root => $"repos/{Uri.EscapeDataString(options.Owner)}/{Uri.EscapeDataString(options.Repository)}";

    // ---------------------------------------------------------------------------
    // ISkillRepository
    // ---------------------------------------------------------------------------

    public async Task<IReadOnlyCollection<string>> ListPathsAsync(
        string branch, string scopePath, CancellationToken cancellationToken = default)
    {
        /*
            One recursive listing from the branch root, filtered here, rather than a listing
            rooted at scopePath. GitHub's tree endpoint takes a single path segment, so scoping
            it means percent-encoding a "branch:nested/path" tree-ish into that segment — which
            works against api.github.com and is a coin toss through anything sitting in front of
            a GitHub Enterprise Server. A skills repository is small enough that reading the
            whole tree is the cheaper mistake.
        */
        var tree = await GetJsonAsync(
            $"{Root}/git/trees/{Uri.EscapeDataString(branch)}?recursive=1",
            $"listing {scopePath}",
            cancellationToken);

        // A branch or folder that does not exist yet is the normal first-adoption case.
        if (tree is null)
        {
            logger.LogDebug("No tree at {Branch}; treating every file as new.", branch);
            return [];
        }

        /*
            Truncation is not a partial answer we can quietly accept. Intake decides what to
            DELETE from this listing — a rename at approval removes every folder for the
            solution that is not the new destination — so a short list does not mean "fewer
            files", it means a stale folder survives and the marketplace publishes the same
            solution twice under two names.
        */
        if (tree["truncated"]?.GetValue<bool>() == true)
        {
            throw new SkillIntakeException(
                $"GitHub truncated the tree listing for '{options.Owner}/{options.Repository}' on " +
                $"branch '{branch}'. The repository is too large to enumerate in one call, and a " +
                "partial listing would leave renamed skills published twice.");
        }

        var prefix = scopePath.TrimStart('/');

        var paths = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        foreach (var entry in (tree["tree"] as JsonArray)?.OfType<JsonObject>() ?? [])
        {
            if (entry["type"]?.GetValue<string>() != "blob")
            {
                continue;
            }

            var path = entry["path"]?.GetValue<string>();
            if (!string.IsNullOrEmpty(path) &&
                (prefix.Length == 0 || path.StartsWith(prefix, StringComparison.OrdinalIgnoreCase)))
            {
                paths.Add(path);
            }
        }

        return paths;
    }

    public async Task<string?> TryReadTextAsync(
        string path, string branch, CancellationToken cancellationToken = default)
    {
        using var request = new HttpRequestMessage(
            HttpMethod.Get,
            $"{Root}/contents/{EscapePath(path)}?ref={Uri.EscapeDataString(branch)}");

        /*
            The raw media type rather than the default JSON envelope. The envelope base64-encodes
            the content and gives up above 1 MB — returning an empty string and an encoding of
            "none", which reads as an empty file rather than as a failure. Raw sidesteps both.
        */
        request.Headers.Accept.Clear();
        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/vnd.github.raw"));

        using var response = await http.SendAsync(request, cancellationToken);

        if (response.StatusCode == HttpStatusCode.NotFound)
        {
            return null;
        }

        return await ReadSuccessBodyAsync(response, $"reading {path}", cancellationToken);
    }

    public async Task<string> CommitAsync(SkillCommit commit, CancellationToken cancellationToken = default)
    {
        var parentSha = await GetBranchTipAsync(commit.Branch, cancellationToken)
            ?? throw new SkillIntakeException(
                $"Branch '{commit.Branch}' does not exist in repository " +
                $"'{options.Owner}/{options.Repository}'.");

        var baseTreeSha = await GetCommitTreeAsync(parentSha, cancellationToken);

        var entries = new JsonArray();
        foreach (var change in commit.Changes)
        {
            entries.Add(await BuildTreeEntryAsync(change, cancellationToken));
        }

        var treeSha = await CreateTreeAsync(baseTreeSha, entries, cancellationToken);
        var commitSha = await CreateCommitAsync(commit.Message, treeSha, parentSha, cancellationToken);

        await UpdateRefAsync(commit.Branch, commitSha, cancellationToken);

        return commitSha;
    }

    // ---------------------------------------------------------------------------
    // ISkillRepositoryProvisioner
    // ---------------------------------------------------------------------------

    public string Describe() => $"GitHub {options.Owner}/{options.Repository}";

    public async Task<SkillRepositoryState> InspectAsync(
        string branch, CancellationToken cancellationToken = default)
    {
        var repository = await GetJsonAsync(
            Root, $"reading repository '{options.Owner}/{options.Repository}'", cancellationToken);

        if (repository is null)
        {
            return new SkillRepositoryState(RepositoryExists: false, BranchExists: false);
        }

        return new SkillRepositoryState(
            RepositoryExists: true,
            BranchExists: await GetBranchTipAsync(branch, cancellationToken) is not null);
    }

    public async Task CreateRepositoryAsync(CancellationToken cancellationToken = default)
    {
        /*
            GitHub has two create endpoints and which one applies depends on whether the owner
            is an organization or a user — there is no single "create under this owner" call.
            Organization first because that is what a shared skills repository is; the user
            fallback exists for a personal account, and is guarded by comparing logins so a
            typo in the owner cannot quietly create the repository somewhere else.
        */
        var payload = new JsonObject
        {
            ["name"] = options.Repository,
            ["private"] = options.CreatePrivate,
            ["description"] = "Skills adopted from the Innovation Backlog.",

            // No auto_init: seeding is the provisioning service's job, and an auto-initialised
            // README would be a file it then has to decide whether to overwrite.
            ["auto_init"] = false,
        };

        using var orgResponse = await PostJsonAsync(
            $"orgs/{Uri.EscapeDataString(options.Owner)}/repos", payload, cancellationToken);

        if (orgResponse.IsSuccessStatusCode)
        {
            logger.LogInformation(
                "Created repository {Owner}/{Repository}.", options.Owner, options.Repository);
            return;
        }

        if (orgResponse.StatusCode != HttpStatusCode.NotFound)
        {
            await ReadSuccessBodyAsync(
                orgResponse,
                $"creating repository '{options.Owner}/{options.Repository}'",
                cancellationToken);
        }

        var login = (await GetJsonAsync("user", "identifying the credential", cancellationToken))
            ?["login"]?.GetValue<string>();

        if (!string.Equals(login, options.Owner, StringComparison.OrdinalIgnoreCase))
        {
            throw new SkillIntakeException(
                $"'{options.Owner}' is not an organization this credential can create in, and it " +
                $"is not the authenticated account" +
                (login is null ? "." : $" ('{login}').") +
                " Create the repository in GitHub and re-run, or correct " +
                "Momentum:Skills:GitHub:Owner.");
        }

        using var userResponse = await PostJsonAsync("user/repos", payload, cancellationToken);

        await ReadSuccessBodyAsync(
            userResponse,
            $"creating repository '{options.Owner}/{options.Repository}'",
            cancellationToken);

        logger.LogInformation(
            "Created repository {Owner}/{Repository}.", options.Owner, options.Repository);
    }

    public async Task<string> SeedAsync(
        string branch,
        IReadOnlyDictionary<string, string> files,
        string message,
        CancellationToken cancellationToken = default)
    {
        var parentSha = await GetBranchTipAsync(branch, cancellationToken);

        var baseTreeSha = parentSha is null
            ? null
            : await GetCommitTreeAsync(parentSha, cancellationToken);

        var entries = new JsonArray();
        foreach (var (path, content) in files)
        {
            entries.Add(TextEntry(path, content));
        }

        var treeSha = await CreateTreeAsync(baseTreeSha, entries, cancellationToken);
        var commitSha = await CreateCommitAsync(message, treeSha, parentSha, cancellationToken);

        // A branch that does not exist is created, not updated. Doing it the other way round
        // gives a 422 that reads like a permissions problem.
        if (parentSha is null)
        {
            await CreateRefAsync(branch, commitSha, cancellationToken);
        }
        else
        {
            await UpdateRefAsync(branch, commitSha, cancellationToken);
        }

        return commitSha;
    }

    // ---------------------------------------------------------------------------
    // Git Data API
    // ---------------------------------------------------------------------------

    /// <summary>
    /// One tree entry for one change.
    /// </summary>
    /// <remarks>
    /// Text goes inline as <c>content</c> so the tree call creates the blob itself — which is
    /// what keeps an all-markdown skill to a single request instead of one POST per file.
    /// <c>content</c> is UTF-8 only, so anything binary has to be uploaded as a blob first and
    /// referenced by sha. Sending an image's bytes as <c>content</c> does not fail; it succeeds
    /// and silently corrupts the file, which is worse than an error.
    /// </remarks>
    private async Task<JsonObject> BuildTreeEntryAsync(
        SkillFileChange change, CancellationToken cancellationToken)
    {
        var path = change.Path.TrimStart('/');

        if (change.Type == SkillChangeType.Delete)
        {
            // A null sha against an existing path is how a tree built on base_tree drops a file.
            return new JsonObject
            {
                ["path"] = path,
                ["mode"] = BlobMode,
                ["type"] = "blob",
                ["sha"] = null,
            };
        }

        if (change.IsText)
        {
            return TextEntry(path, Encoding.UTF8.GetString(change.Content));
        }

        return new JsonObject
        {
            ["path"] = path,
            ["mode"] = BlobMode,
            ["type"] = "blob",
            ["sha"] = await CreateBlobAsync(change.Content, cancellationToken),
        };
    }

    private static JsonObject TextEntry(string path, string content) => new()
    {
        ["path"] = path.TrimStart('/'),
        ["mode"] = BlobMode,
        ["type"] = "blob",
        ["content"] = content,
    };

    private async Task<string> CreateBlobAsync(byte[] content, CancellationToken cancellationToken)
    {
        var payload = new JsonObject
        {
            ["content"] = Convert.ToBase64String(content),
            ["encoding"] = "base64",
        };

        using var response = await PostJsonAsync($"{Root}/git/blobs", payload, cancellationToken);
        var body = await ReadSuccessBodyAsync(response, "uploading a binary file", cancellationToken);

        return RequireSha(body, "blob");
    }

    private async Task<string> CreateTreeAsync(
        string? baseTreeSha, JsonArray entries, CancellationToken cancellationToken)
    {
        var payload = new JsonObject { ["tree"] = entries };

        // Omitted entirely for a first commit. Sending null is not the same as sending nothing:
        // GitHub reads a present base_tree as "extend that tree" and rejects a null one.
        if (baseTreeSha is not null)
        {
            payload["base_tree"] = baseTreeSha;
        }

        using var response = await PostJsonAsync($"{Root}/git/trees", payload, cancellationToken);
        var body = await ReadSuccessBodyAsync(response, "building the tree", cancellationToken);

        return RequireSha(body, "tree");
    }

    private async Task<string> CreateCommitAsync(
        string message, string treeSha, string? parentSha, CancellationToken cancellationToken)
    {
        var parents = new JsonArray();
        if (parentSha is not null)
        {
            parents.Add(parentSha);
        }

        var payload = new JsonObject
        {
            ["message"] = message,
            ["tree"] = treeSha,

            // Empty, not absent, for a first commit — a root commit has no parents.
            ["parents"] = parents,
        };

        using var response = await PostJsonAsync($"{Root}/git/commits", payload, cancellationToken);
        var body = await ReadSuccessBodyAsync(response, "creating the commit", cancellationToken);

        return RequireSha(body, "commit");
    }

    /// <summary>
    /// Moves the branch to <paramref name="commitSha"/>.
    /// </summary>
    /// <remarks>
    /// This is where a concurrent intake is caught. The commit's parent is the tip that was read
    /// at the start, so if another intake landed in between, this is no longer a fast-forward and
    /// <c>force: false</c> makes GitHub refuse it — the same guarantee Azure DevOps gives through
    /// <c>oldObjectId</c>, and the caller's cue to re-read and retry. Forcing here would silently
    /// discard the other person's skill.
    /// </remarks>
    private async Task UpdateRefAsync(string branch, string commitSha, CancellationToken cancellationToken)
    {
        var payload = new JsonObject
        {
            ["sha"] = commitSha,
            ["force"] = false,
        };

        using var content = JsonContent(payload);
        using var response = await http.PatchAsync(
            $"{Root}/git/refs/heads/{EscapePath(branch)}", content, cancellationToken);

        if (response.StatusCode is HttpStatusCode.UnprocessableEntity or HttpStatusCode.Conflict)
        {
            throw new SkillRepositoryConflictException(
                $"Branch '{branch}' moved while this commit was being prepared: " +
                await GitRest.ReadErrorMessageAsync(response, cancellationToken));
        }

        await ReadSuccessBodyAsync(response, $"moving branch '{branch}'", cancellationToken);
    }

    private async Task CreateRefAsync(string branch, string commitSha, CancellationToken cancellationToken)
    {
        var payload = new JsonObject
        {
            ["ref"] = $"refs/heads/{branch}",
            ["sha"] = commitSha,
        };

        using var response = await PostJsonAsync($"{Root}/git/refs", payload, cancellationToken);

        // Someone else pushed the first commit between the inspect and here. Retryable, same as
        // any other lost race for the tip.
        if (response.StatusCode is HttpStatusCode.UnprocessableEntity)
        {
            throw new SkillRepositoryConflictException(
                $"Branch '{branch}' was created while this commit was being prepared: " +
                await GitRest.ReadErrorMessageAsync(response, cancellationToken));
        }

        await ReadSuccessBodyAsync(response, $"creating branch '{branch}'", cancellationToken);
    }

    /// <summary>The branch tip, or null when the branch does not exist.</summary>
    private async Task<string?> GetBranchTipAsync(string branch, CancellationToken cancellationToken)
    {
        // Singular 'ref' to read one, plural 'refs' to create — GitHub's, not a typo. The
        // singular form 404s on a missing branch; the plural returns a prefix match, so a
        // branch named 'main-old' would answer for 'main'.
        var reference = await GetJsonAsync(
            $"{Root}/git/ref/heads/{EscapePath(branch)}",
            $"resolving branch '{branch}'",
            cancellationToken);

        return reference?["object"]?["sha"]?.GetValue<string>();
    }

    private async Task<string> GetCommitTreeAsync(string commitSha, CancellationToken cancellationToken)
    {
        var commit = await GetJsonAsync(
            $"{Root}/git/commits/{Uri.EscapeDataString(commitSha)}",
            $"reading commit {commitSha}",
            cancellationToken);

        return commit?["tree"]?["sha"]?.GetValue<string>()
            ?? throw new SkillIntakeException($"Commit {commitSha} carries no tree.");
    }

    // ---------------------------------------------------------------------------
    // Transport
    // ---------------------------------------------------------------------------

    /// <summary>GETs and parses, or returns null on 404.</summary>
    private async Task<JsonObject?> GetJsonAsync(
        string url, string what, CancellationToken cancellationToken)
    {
        using var response = await http.GetAsync(url, cancellationToken);

        if (response.StatusCode == HttpStatusCode.NotFound)
        {
            return null;
        }

        var body = await ReadSuccessBodyAsync(response, what, cancellationToken);

        return JsonNode.Parse(body) as JsonObject
            ?? throw new SkillIntakeException($"GitHub returned an unexpected shape {what}.");
    }

    private Task<HttpResponseMessage> PostJsonAsync(
        string url, JsonObject payload, CancellationToken cancellationToken)
    {
        var content = JsonContent(payload);
        return http.PostAsync(url, content, cancellationToken);
    }

    private static StringContent JsonContent(JsonObject payload) =>
        new(payload.ToJsonString(), Encoding.UTF8, "application/json");

    private static string RequireSha(string body, string what)
    {
        var sha = JsonNode.Parse(body)?["sha"]?.GetValue<string>();

        return sha ?? throw new SkillIntakeException(
            $"GitHub accepted the {what} but returned no sha.");
    }

    /// <summary>
    /// Escapes a value that occupies several path segments — a file path, a ref name.
    /// </summary>
    /// <remarks>
    /// <see cref="Uri.EscapeDataString(string)"/> would percent-encode the separators and break
    /// routing on endpoints that take a greedy path. Each segment is escaped on its own and the
    /// slashes are left alone.
    /// </remarks>
    private static string EscapePath(string path) =>
        string.Join('/', path.TrimStart('/').Split('/').Select(Uri.EscapeDataString));

    private static async Task<string> ReadSuccessBodyAsync(
        HttpResponseMessage response, string what, CancellationToken cancellationToken)
    {
        if (response.IsSuccessStatusCode)
        {
            return await response.Content.ReadAsStringAsync(cancellationToken);
        }

        if (GitRest.IsRedirect(response.StatusCode))
        {
            throw new SkillIntakeException(
                $"GitHub redirected {what}. Either the repository has moved, or the request " +
                "reached a web endpoint rather than the API — check Momentum:Skills:GitHub:ApiRoot.");
        }

        var detail = await GitRest.ReadErrorMessageAsync(response, cancellationToken);

        /*
            GitHub answers "you cannot see this" and "this is not there" with the same 404 for a
            private repository, so a 404 that reaches here is as likely to be a token scope
            problem as a wrong name. Saying so beats sending someone to check spelling.
        */
        if (response.StatusCode == HttpStatusCode.NotFound)
        {
            throw new SkillIntakeException(
                $"GitHub returned 404 {what}: {detail}. For a private repository this is also " +
                "what an insufficiently scoped token looks like — a classic PAT needs 'repo', a " +
                "fine-grained one needs Contents: read and write (plus Administration: write to " +
                "provision).");
        }

        if (response.StatusCode is HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden)
        {
            throw new SkillIntakeException(
                $"GitHub refused {what} ({(int)response.StatusCode}): {detail}. Check the token's " +
                "scopes and, for a fine-grained token, that this repository is in its scope.");
        }

        throw new SkillIntakeException($"GitHub refused {what} ({(int)response.StatusCode}): {detail}");
    }
}

/// <summary>Which GitHub repository intake writes to.</summary>
public sealed class GitHubRepositoryOptions
{
    /// <summary>Organization or user that owns the repository.</summary>
    public string Owner { get; set; } = string.Empty;

    /// <summary>Repository name. Not a node id — GitHub's git endpoints take the name.</summary>
    public string Repository { get; set; } = string.Empty;

    /// <summary>Branch used when a request does not name one.</summary>
    public string DefaultBranch { get; set; } = "main";

    /// <summary>
    /// Visibility for a repository this app creates. Private by default: a skills repository
    /// holds whatever contributors uploaded, and making it public is a decision, not a default.
    /// </summary>
    public bool CreatePrivate { get; set; } = true;
}
