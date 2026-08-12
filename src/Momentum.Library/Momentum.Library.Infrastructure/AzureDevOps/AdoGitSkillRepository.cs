using System.Net;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.Extensions.Logging;
using Momentum.Library.Application.Skills;
using Momentum.Library.Domain.Skills;

namespace Momentum.Library.Infrastructure.AzureDevOps;

/// <summary>
/// <see cref="ISkillRepository"/> over the Azure DevOps Git REST API.
/// </summary>
/// <remarks>
/// Raw REST rather than the client libraries: the surface is four calls, and the SDK is
/// historically awkward in an isolated Functions worker.
/// <para>
/// The <see cref="HttpClient"/> arrives already authenticated and already pointed at the
/// organization. This type never sees a token, which is what lets the same adapter serve
/// a user-delegated call and a service-identity call without knowing the difference.
/// </para>
/// </remarks>
public sealed class AdoGitSkillRepository(
    HttpClient http,
    AdoGitRepositoryOptions options,
    ILogger<AdoGitSkillRepository> logger) : ISkillRepository
{
    private const string ApiVersion = "7.1";

    private string Root => $"{Uri.EscapeDataString(options.Project)}/_apis/git/repositories/{Uri.EscapeDataString(options.RepositoryId)}";

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
        var oldObjectId = await GetBranchTipAsync(commit.Branch, cancellationToken);

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

        var payload = new
        {
            refUpdates = new[] { new { name = $"refs/heads/{commit.Branch}", oldObjectId } },
            commits = new[] { new { comment = commit.Message, changes } },
        };

        using var content = new StringContent(
            JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json");

        using var response = await http.PostAsync(
            $"{Root}/pushes?api-version={ApiVersion}", content, cancellationToken);

        if (response.StatusCode is HttpStatusCode.Conflict or HttpStatusCode.PreconditionFailed)
        {
            throw new SkillRepositoryConflictException(
                $"Branch '{commit.Branch}' moved while this commit was being prepared: " +
                await ReadErrorMessageAsync(response, cancellationToken));
        }

        var body = await ReadSuccessBodyAsync(response, "pushing the commit", cancellationToken);

        var commitId = JsonNode.Parse(body)?["commits"]?[0]?["commitId"]?.GetValue<string>();

        return commitId ?? throw new SkillIntakeException(
            "The push succeeded but Azure DevOps returned no commit id.");
    }

    private async Task<string> GetBranchTipAsync(string branch, CancellationToken cancellationToken)
    {
        var url = $"{Root}/refs?filter={Uri.EscapeDataString($"heads/{branch}")}&api-version={ApiVersion}";

        using var response = await http.GetAsync(url, cancellationToken);
        var body = await ReadSuccessBodyAsync(response, $"resolving branch '{branch}'", cancellationToken);

        // Indexing [0] blind gives an IndexOutOfRange that says nothing; a missing branch
        // is a routine typo and deserves to say so.
        var objectId = (JsonNode.Parse(body)?["value"] as JsonArray)?
            .OfType<JsonObject>()
            .FirstOrDefault()?["objectId"]?.GetValue<string>();

        return objectId ?? throw new SkillIntakeException(
            $"Branch '{branch}' does not exist in repository '{options.RepositoryId}'.");
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
        if (response.StatusCode is HttpStatusCode.Found
            or HttpStatusCode.Redirect
            or HttpStatusCode.MovedPermanently
            or HttpStatusCode.TemporaryRedirect)
        {
            throw new SkillIntakeException(
                $"Azure DevOps redirected {what} to a sign-in page, meaning the request was " +
                "not authenticated for this organization. Check the organization name and " +
                "that the calling user is a member of it.");
        }

        var detail = await ReadErrorMessageAsync(response, cancellationToken);
        throw new SkillIntakeException($"Azure DevOps refused {what} ({(int)response.StatusCode}): {detail}");
    }

    private static async Task<string> ReadErrorMessageAsync(
        HttpResponseMessage response, CancellationToken cancellationToken)
    {
        const int MaxDetail = 500;

        try
        {
            var body = await response.Content.ReadAsStringAsync(cancellationToken);
            if (string.IsNullOrWhiteSpace(body))
            {
                return response.ReasonPhrase ?? "no detail";
            }

            var message = JsonNode.Parse(body)?["message"]?.GetValue<string>();
            if (!string.IsNullOrWhiteSpace(message))
            {
                return message;
            }

            return body.Length > MaxDetail ? body[..MaxDetail] + "…" : body;
        }
        catch (Exception ex) when (ex is JsonException or HttpRequestException or InvalidOperationException)
        {
            return response.ReasonPhrase ?? "no detail";
        }
    }
}

/// <summary>Which repository intake writes to.</summary>
public sealed class AdoGitRepositoryOptions
{
    public string Project { get; set; } = string.Empty;

    /// <summary>Repository name or GUID.</summary>
    public string RepositoryId { get; set; } = string.Empty;

    /// <summary>Branch used when a request does not name one.</summary>
    public string DefaultBranch { get; set; } = "main";
}
