using System.Net;
using System.Text;
using System.Text.Json.Nodes;
using Microsoft.Extensions.Logging.Abstractions;
using Momentum.Library.Application.Skills;
using Momentum.Library.Domain.Skills;
using Momentum.Library.Infrastructure.GitHub;
using Xunit;

namespace Momentum.Tests.Skills;

/// <summary>
/// The GitHub adapter's wire behaviour, against a recording handler.
/// </summary>
/// <remarks>
/// Worth testing where the Azure DevOps adapter is not: that one has a push endpoint that takes a
/// whole changeset, so a commit is one request whose shape is obvious. GitHub has no such endpoint,
/// so a commit here is a four-call sequence over the Git Data API — read the ref, read its tree,
/// build a tree on top, move the ref — and each of the ways to get it wrong (a binary sent as text,
/// a delete sent as an empty file, a base tree on a root commit, a forced ref update) succeeds
/// against the API and produces the wrong repository.
/// </remarks>
public class GitHubSkillRepositoryTests
{
    private const string ParentSha = "1111111111111111111111111111111111111111";
    private const string BaseTreeSha = "2222222222222222222222222222222222222222";
    private const string NewTreeSha = "3333333333333333333333333333333333333333";
    private const string NewCommitSha = "4444444444444444444444444444444444444444";
    private const string BlobSha = "5555555555555555555555555555555555555555";

    private static (GitHubSkillRepository Repository, FakeGitHub Github) Create(bool branchExists = true)
    {
        var github = new FakeGitHub { BranchExists = branchExists };

        var http = new HttpClient(github)
        {
            BaseAddress = new Uri("https://api.github.com/"),
        };

        var repository = new GitHubSkillRepository(
            http,
            new GitHubRepositoryOptions { Owner = "cyclotron", Repository = "skills" },
            NullLogger<GitHubSkillRepository>.Instance);

        return (repository, github);
    }

    [Fact]
    public async Task A_text_file_goes_inline_in_the_tree_so_a_markdown_skill_is_one_request()
    {
        var (repository, github) = Create();

        var commit = new SkillCommit(
            "main",
            [SkillFileChange.Write("plugins/eng/skills/x__y/SKILL.md", Encoding.UTF8.GetBytes("# hi"), isText: true, exists: false)],
            "Add skill");

        Assert.Equal(NewCommitSha, await repository.CommitAsync(commit));

        // No blob upload: the tree call created it.
        Assert.DoesNotContain(github.Requests, request => request.Path.EndsWith("/git/blobs"));

        var entry = (JsonArray)github.Tree!["tree"]!;
        Assert.Equal("# hi", entry[0]!["content"]!.GetValue<string>());
        Assert.Equal("100644", entry[0]!["mode"]!.GetValue<string>());
        Assert.Equal(BaseTreeSha, github.Tree["base_tree"]!.GetValue<string>());
    }

    /// <summary>
    /// A PNG sent as inline UTF-8 text does not fail. It succeeds and silently corrupts the file,
    /// which is far worse than an error — so binaries take the blob route and are referenced by sha.
    /// </summary>
    [Fact]
    public async Task A_binary_file_is_uploaded_as_a_blob_and_referenced_by_sha()
    {
        var (repository, github) = Create();

        byte[] png = [0x89, 0x50, 0x4E, 0x47, 0x00, 0xFF];

        var commit = new SkillCommit(
            "main",
            [SkillFileChange.Write("plugins/eng/skills/x__y/icon.png", png, isText: false, exists: false)],
            "Add skill");

        await repository.CommitAsync(commit);

        var blob = github.Requests.Single(request => request.Path.EndsWith("/git/blobs")).Body!;
        Assert.Equal("base64", blob["encoding"]!.GetValue<string>());
        Assert.Equal(Convert.ToBase64String(png), blob["content"]!.GetValue<string>());

        var entry = ((JsonArray)github.Tree!["tree"]!)[0]!;
        Assert.Equal(BlobSha, entry["sha"]!.GetValue<string>());
        Assert.Null(entry["content"]);
    }

    /// <summary>
    /// A rename at approval deletes the solution's previous folder in the same commit. Getting this
    /// wrong leaves the old folder behind and the marketplace publishes one solution twice.
    /// </summary>
    [Fact]
    public async Task A_delete_becomes_a_tree_entry_with_a_null_sha()
    {
        var (repository, github) = Create();

        var commit = new SkillCommit(
            "main",
            [SkillFileChange.Remove("plugins/eng/skills/x__old-name/SKILL.md")],
            "Rename skill");

        await repository.CommitAsync(commit);

        var entry = ((JsonArray)github.Tree!["tree"]!)[0]!;

        Assert.Equal("plugins/eng/skills/x__old-name/SKILL.md", entry["path"]!.GetValue<string>());
        Assert.Equal("blob", entry["type"]!.GetValue<string>());

        // Present and null, not absent: base_tree plus a null sha is how a tree drops a file.
        Assert.True(entry.AsObject().ContainsKey("sha"));
        Assert.Null(entry["sha"]);
    }

    [Fact]
    public async Task A_commit_parents_the_tip_that_was_read_and_moves_the_ref_without_forcing()
    {
        var (repository, github) = Create();

        await repository.CommitAsync(new SkillCommit(
            "main",
            [SkillFileChange.Write("a.md", Encoding.UTF8.GetBytes("a"), isText: true, exists: true)],
            "Edit"));

        Assert.Equal([ParentSha], ((JsonArray)github.Commit!["parents"]!).Select(p => p!.GetValue<string>()));
        Assert.Equal(NewTreeSha, github.Commit["tree"]!.GetValue<string>());

        /*
            force:false is the whole concurrency guarantee. The commit's parent is the tip read at
            the start, so a concurrent intake makes this a non-fast-forward and GitHub refuses it —
            the equivalent of Azure DevOps' oldObjectId check. Forcing would discard the other
            person's skill.
        */
        var refUpdate = github.Requests.Single(request => request.Method == HttpMethod.Patch);
        Assert.False(refUpdate.Body!["force"]!.GetValue<bool>());
        Assert.Equal(NewCommitSha, refUpdate.Body["sha"]!.GetValue<string>());
    }

    [Fact]
    public async Task A_ref_update_refused_as_a_non_fast_forward_is_a_conflict_the_caller_can_retry()
    {
        var (repository, github) = Create();
        github.RefUpdateStatus = HttpStatusCode.UnprocessableEntity;

        await Assert.ThrowsAsync<SkillRepositoryConflictException>(
            () => repository.CommitAsync(new SkillCommit(
                "main",
                [SkillFileChange.Write("a.md", Encoding.UTF8.GetBytes("a"), isText: true, exists: true)],
                "Edit")));
    }

    [Fact]
    public async Task Committing_to_a_branch_that_does_not_exist_says_so()
    {
        var (repository, _) = Create(branchExists: false);

        var exception = await Assert.ThrowsAsync<SkillIntakeException>(
            () => repository.CommitAsync(new SkillCommit(
                "main",
                [SkillFileChange.Write("a.md", Encoding.UTF8.GetBytes("a"), isText: true, exists: false)],
                "Add")));

        Assert.Contains("does not exist", exception.Message);
        Assert.Contains("cyclotron/skills", exception.Message);
    }

    /// <summary>
    /// Seeding an empty repository is the one commit with no parent. A root commit takes no
    /// base_tree and needs the ref created rather than updated — doing it the other way round gives
    /// a 422 that reads like a permissions problem.
    /// </summary>
    [Fact]
    public async Task Seeding_an_empty_repository_makes_a_root_commit_and_creates_the_ref()
    {
        var (repository, github) = Create(branchExists: false);

        var commitId = await repository.SeedAsync(
            "main",
            new Dictionary<string, string> { [MarketplaceManifest.Path] = "{}" },
            "Initialise skills repository");

        Assert.Equal(NewCommitSha, commitId);

        Assert.False(github.Tree!.ContainsKey("base_tree"));
        Assert.Empty((JsonArray)github.Commit!["parents"]!);

        var created = github.Requests.Single(request => request.Path.EndsWith("/git/refs"));
        Assert.Equal("refs/heads/main", created.Body!["ref"]!.GetValue<string>());

        Assert.DoesNotContain(github.Requests, request => request.Method == HttpMethod.Patch);
    }

    [Fact]
    public async Task Seeding_a_repository_that_already_has_the_branch_extends_it_rather_than_replacing_it()
    {
        var (repository, github) = Create(branchExists: true);

        await repository.SeedAsync(
            "main",
            new Dictionary<string, string> { [SkillRepositoryTemplate.ReadmePath] = "# Skills" },
            "Seed missing skills repository files");

        Assert.Equal(BaseTreeSha, github.Tree!["base_tree"]!.GetValue<string>());
        Assert.Equal([ParentSha], ((JsonArray)github.Commit!["parents"]!).Select(p => p!.GetValue<string>()));
        Assert.Contains(github.Requests, request => request.Method == HttpMethod.Patch);
    }

    [Fact]
    public async Task Listing_returns_only_blobs_under_the_scope_path_with_their_full_paths()
    {
        var (repository, github) = Create();

        github.TreeListing = """
            {
              "truncated": false,
              "tree": [
                { "path": "README.md", "type": "blob" },
                { "path": "plugins/eng/skills", "type": "tree" },
                { "path": "plugins/eng/skills/x__y/SKILL.md", "type": "blob" },
                { "path": "plugins/ops/skills/z__w/SKILL.md", "type": "blob" }
              ]
            }
            """;

        var paths = await repository.ListPathsAsync("main", "plugins/eng/skills/");

        Assert.Equal(["plugins/eng/skills/x__y/SKILL.md"], paths);
    }

    /// <summary>
    /// Intake decides what to DELETE from this listing, so a short list does not mean "fewer files".
    /// It means a stale folder survives a rename and the marketplace publishes one solution twice.
    /// </summary>
    [Fact]
    public async Task A_truncated_listing_is_a_failure_rather_than_a_partial_answer()
    {
        var (repository, github) = Create();
        github.TreeListing = """{ "truncated": true, "tree": [] }""";

        var exception = await Assert.ThrowsAsync<SkillIntakeException>(
            () => repository.ListPathsAsync("main", "plugins/eng/skills/"));

        Assert.Contains("truncated", exception.Message);
        Assert.Contains("published twice", exception.Message);
    }

    [Fact]
    public async Task A_missing_tree_is_the_normal_first_adoption_case_and_not_an_error()
    {
        var (repository, github) = Create();
        github.TreeListing = null;

        Assert.Empty(await repository.ListPathsAsync("main", "plugins/eng/skills/"));
    }

    [Fact]
    public async Task Reading_a_file_asks_for_the_raw_media_type_so_it_is_not_base64_or_size_capped()
    {
        var (repository, github) = Create();
        github.Contents = "{ \"plugins\": [] }";

        Assert.Equal("{ \"plugins\": [] }", await repository.TryReadTextAsync(MarketplaceManifest.Path, "main"));

        var read = github.Requests.Single(request => request.Path.Contains("/contents/"));
        Assert.Equal("application/vnd.github.raw", read.Accept);

        // The path keeps its slashes — the contents endpoint takes a greedy path, and escaping the
        // separators would break routing.
        Assert.Contains("contents/.claude-plugin/marketplace.json", read.Path);
    }

    [Fact]
    public async Task A_file_that_is_not_there_reads_as_null()
    {
        var (repository, github) = Create();
        github.Contents = null;

        Assert.Null(await repository.TryReadTextAsync(MarketplaceManifest.Path, "main"));
    }

    [Fact]
    public async Task An_absent_repository_inspects_as_absent_rather_than_throwing()
    {
        // The two states provisioning exists to fix are not errors on the way in.
        var (repository, github) = Create();
        github.RepositoryExists = false;

        var state = await repository.InspectAsync("main");

        Assert.False(state.RepositoryExists);
        Assert.False(state.BranchExists);
    }

    /// <summary>
    /// GitHub answers "you cannot see this" and "this is not there" with the same 404 on a private
    /// repository, so a 404 on a write is as likely to be a token scope problem as a wrong name.
    /// Saying so beats sending someone to check spelling.
    /// </summary>
    [Fact]
    public async Task A_404_on_a_write_names_token_scope_as_a_possible_cause()
    {
        var (repository, github) = Create();
        github.TreePostStatus = HttpStatusCode.NotFound;

        var exception = await Assert.ThrowsAsync<SkillIntakeException>(
            () => repository.CommitAsync(new SkillCommit(
                "main",
                [SkillFileChange.Write("a.md", Encoding.UTF8.GetBytes("a"), isText: true, exists: true)],
                "Edit")));

        Assert.Contains("Contents: read and write", exception.Message);
    }

    [Fact]
    public async Task A_403_points_at_scopes_rather_than_at_the_repository_name()
    {
        var (repository, github) = Create();
        github.TreePostStatus = HttpStatusCode.Forbidden;

        var exception = await Assert.ThrowsAsync<SkillIntakeException>(
            () => repository.CommitAsync(new SkillCommit(
                "main",
                [SkillFileChange.Write("a.md", Encoding.UTF8.GetBytes("a"), isText: true, exists: true)],
                "Edit")));

        Assert.Contains("scopes", exception.Message);
        Assert.Contains("403", exception.Message);
    }

    [Fact]
    public void Describe_names_the_target_so_a_wrong_one_can_be_spotted()
    {
        var (repository, _) = Create();

        Assert.Equal("GitHub cyclotron/skills", repository.Describe());
    }

    private sealed record Recorded(HttpMethod Method, string Path, JsonObject? Body, string? Accept);

    /// <summary>
    /// Answers the Git Data API with fixed shas, and records what it was asked.
    /// </summary>
    private sealed class FakeGitHub : HttpMessageHandler
    {
        public List<Recorded> Requests { get; } = [];

        public bool BranchExists { get; set; } = true;
        public bool RepositoryExists { get; set; } = true;
        public HttpStatusCode RefUpdateStatus { get; set; } = HttpStatusCode.OK;
        public HttpStatusCode TreePostStatus { get; set; } = HttpStatusCode.OK;
        public string? TreeListing { get; set; }
        public string? Contents { get; set; }

        /// <summary>The tree that was posted — what most of these tests assert on.</summary>
        public JsonObject? Tree { get; private set; }

        public JsonObject? Commit { get; private set; }

        protected override async Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request, CancellationToken cancellationToken)
        {
            var path = request.RequestUri!.AbsolutePath;

            JsonObject? body = null;
            if (request.Content is not null)
            {
                var text = await request.Content.ReadAsStringAsync(cancellationToken);
                body = JsonNode.Parse(text) as JsonObject;
            }

            Requests.Add(new Recorded(
                request.Method, path, body, request.Headers.Accept.FirstOrDefault()?.MediaType));

            // Reading the ref: GET /git/ref/heads/{branch}
            if (request.Method == HttpMethod.Get && path.Contains("/git/ref/heads/"))
            {
                return BranchExists
                    ? Json($"{{ \"object\": {{ \"sha\": \"{ParentSha}\" }} }}")
                    : new HttpResponseMessage(HttpStatusCode.NotFound);
            }

            if (request.Method == HttpMethod.Get && path.Contains("/git/commits/"))
            {
                return Json($"{{ \"tree\": {{ \"sha\": \"{BaseTreeSha}\" }} }}");
            }

            if (request.Method == HttpMethod.Get && path.Contains("/git/trees/"))
            {
                return TreeListing is null
                    ? new HttpResponseMessage(HttpStatusCode.NotFound)
                    : Json(TreeListing);
            }

            if (request.Method == HttpMethod.Get && path.Contains("/contents/"))
            {
                return Contents is null
                    ? new HttpResponseMessage(HttpStatusCode.NotFound)
                    : new HttpResponseMessage(HttpStatusCode.OK)
                    { Content = new StringContent(Contents) };
            }

            if (request.Method == HttpMethod.Get)
            {
                return RepositoryExists
                    ? Json("{ \"name\": \"skills\" }")
                    : new HttpResponseMessage(HttpStatusCode.NotFound);
            }

            if (request.Method == HttpMethod.Post && path.EndsWith("/git/blobs"))
            {
                return Json($"{{ \"sha\": \"{BlobSha}\" }}");
            }

            if (request.Method == HttpMethod.Post && path.EndsWith("/git/trees"))
            {
                Tree = body;

                if (TreePostStatus != HttpStatusCode.OK)
                {
                    return new HttpResponseMessage(TreePostStatus)
                    { Content = new StringContent("{ \"message\": \"Not Found\" }") };
                }

                return Json($"{{ \"sha\": \"{NewTreeSha}\" }}");
            }

            if (request.Method == HttpMethod.Post && path.EndsWith("/git/commits"))
            {
                Commit = body;
                return Json($"{{ \"sha\": \"{NewCommitSha}\" }}");
            }

            if (request.Method == HttpMethod.Post && path.EndsWith("/git/refs"))
            {
                return Json($"{{ \"object\": {{ \"sha\": \"{NewCommitSha}\" }} }}");
            }

            if (request.Method == HttpMethod.Patch)
            {
                return RefUpdateStatus == HttpStatusCode.OK
                    ? Json($"{{ \"object\": {{ \"sha\": \"{NewCommitSha}\" }} }}")
                    : new HttpResponseMessage(RefUpdateStatus)
                    { Content = new StringContent("{ \"message\": \"Update is not a fast forward\" }") };
            }

            throw new InvalidOperationException($"Unexpected {request.Method} {path}");
        }

        private static HttpResponseMessage Json(string body) =>
            new(HttpStatusCode.OK) { Content = new StringContent(body) };
    }
}
