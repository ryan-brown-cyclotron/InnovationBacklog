using System.Text.Json.Nodes;
using Momentum.Library.Application.Skills;
using Momentum.Library.Domain.Skills;
using Xunit;

namespace Momentum.Tests.Skills;

public class SkillProvisioningServiceTests
{
    private static SkillProvisioningRequest Request(params string[] segments) =>
        new(
            Branch: "main",
            Segments: segments,
            ManifestName: "momentum",
            ManifestOwner: "CyclotronInc",
            ManifestDescription: "Skills adopted from the Innovation Backlog.");

    [Fact]
    public async Task An_absent_repository_is_created_and_seeded()
    {
        var host = new FakeHost(repositoryExists: false, branchExists: false);

        var result = await new SkillProvisioningService(host, host).EnsureAsync(Request());

        Assert.True(result.RepositoryCreated);
        Assert.False(result.WasInitialised);
        Assert.Equal(1, host.CreateCalls);
        Assert.Equal("commit-1", result.CommitId);

        Assert.Contains(MarketplaceManifest.Path, result.SeededPaths);
        Assert.Contains(SkillRepositoryTemplate.ReadmePath, result.SeededPaths);
        Assert.Contains(SkillRepositoryTemplate.GitAttributesPath, result.SeededPaths);
    }

    /// <summary>
    /// The reason the endpoint exists at all: intake reads the manifest before every commit and
    /// refuses to invent one.
    /// </summary>
    [Fact]
    public async Task The_seeded_manifest_is_what_intake_will_accept()
    {
        var host = new FakeHost(repositoryExists: false, branchExists: false);

        await new SkillProvisioningService(host, host).EnsureAsync(Request());

        var manifest = MarketplaceManifest.Parse(host.Seeded[MarketplaceManifest.Path]);

        Assert.Equal("momentum", manifest["name"]?.GetValue<string>());
        Assert.Equal("CyclotronInc", manifest["owner"]?["name"]?.GetValue<string>());
        Assert.Empty((JsonArray)manifest["plugins"]!);
    }

    [Fact]
    public async Task Requested_segments_get_a_manifest_entry_and_a_placeholder()
    {
        var host = new FakeHost(repositoryExists: false, branchExists: false);

        await new SkillProvisioningService(host, host).EnsureAsync(Request("engineering", "operations"));

        var plugins = (JsonArray)MarketplaceManifest.Parse(host.Seeded[MarketplaceManifest.Path])["plugins"]!;

        Assert.Equal(
            ["engineering", "operations"],
            plugins.Select(plugin => plugin?["name"]?.GetValue<string>()));

        // Git stores no empty folders, so a segment with no skills yet is otherwise invisible.
        Assert.Contains("plugins/engineering/.gitkeep", host.Seeded.Keys);
        Assert.Contains("plugins/operations/.gitkeep", host.Seeded.Keys);
    }

    /// <summary>
    /// Called on every deployment, so the second call has to be free rather than merely harmless.
    /// </summary>
    [Fact]
    public async Task An_initialised_repository_produces_no_commit_at_all()
    {
        var host = new FakeHost(repositoryExists: true, branchExists: true)
        {
            Files =
            {
                [MarketplaceManifest.Path] = "{ \"name\": \"momentum\", \"plugins\": [] }",
                [SkillRepositoryTemplate.ReadmePath] = "# Skills",
                [SkillRepositoryTemplate.GitAttributesPath] = "* text=auto eol=lf",
            },
        };

        var result = await new SkillProvisioningService(host, host).EnsureAsync(Request());

        Assert.True(result.WasInitialised);
        Assert.False(result.RepositoryCreated);
        Assert.Null(result.CommitId);
        Assert.Empty(result.SeededPaths);
        Assert.Empty(host.Seeded);
    }

    [Fact]
    public async Task A_repository_that_exists_but_was_never_pushed_to_is_seeded_without_being_created()
    {
        var host = new FakeHost(repositoryExists: true, branchExists: false);

        var result = await new SkillProvisioningService(host, host).EnsureAsync(Request());

        Assert.False(result.RepositoryCreated);
        Assert.Equal(0, host.CreateCalls);
        Assert.False(result.WasInitialised);
        Assert.Equal("commit-1", result.CommitId);
    }

    /// <summary>
    /// Bootstrap fills gaps; it does not restyle a repository people have been using. Rewriting a
    /// manifest that already has plugins in it would be this endpoint deciding what segments
    /// should exist.
    /// </summary>
    [Fact]
    public async Task An_existing_manifest_is_left_alone_even_when_segments_are_requested()
    {
        const string Existing = """
            { "name": "hand-tuned", "plugins": [ { "name": "existing", "source": "./plugins/existing" } ] }
            """;

        var host = new FakeHost(repositoryExists: true, branchExists: true)
        {
            Files = { [MarketplaceManifest.Path] = Existing },
        };

        var result = await new SkillProvisioningService(host, host).EnsureAsync(Request("engineering"));

        Assert.True(result.WasInitialised);
        Assert.DoesNotContain(MarketplaceManifest.Path, host.Seeded.Keys);
        Assert.DoesNotContain("plugins/engineering/.gitkeep", host.Seeded.Keys);

        // The supporting files were still missing, so those alone are filled in.
        Assert.Contains(SkillRepositoryTemplate.ReadmePath, host.Seeded.Keys);
    }

    [Fact]
    public async Task A_segment_that_would_escape_the_plugins_folder_is_refused_before_any_write()
    {
        var host = new FakeHost(repositoryExists: false, branchExists: false);

        var exception = await Assert.ThrowsAsync<SkillIntakeException>(
            () => new SkillProvisioningService(host, host).EnsureAsync(Request("../../etc")));

        Assert.Contains("may contain only", exception.Message);
        Assert.Equal(0, host.CreateCalls);
        Assert.Empty(host.Seeded);
    }

    [Fact]
    public async Task A_missing_branch_is_refused()
    {
        var host = new FakeHost(repositoryExists: true, branchExists: true);

        await Assert.ThrowsAsync<SkillIntakeException>(
            () => new SkillProvisioningService(host, host).EnsureAsync(Request() with { Branch = " " }));

        Assert.Empty(host.Seeded);
    }

    /// <summary>
    /// One fake for both ports, because one adapter implements both and the interplay between them
    /// — create, then don't bother reading files that cannot exist — is what these tests are about.
    /// </summary>
    private sealed class FakeHost(bool repositoryExists, bool branchExists)
        : ISkillRepository, ISkillRepositoryProvisioner
    {
        public Dictionary<string, string> Files { get; } = new(StringComparer.Ordinal);

        public Dictionary<string, string> Seeded { get; } = new(StringComparer.Ordinal);

        public int CreateCalls { get; private set; }

        public int ReadCalls { get; private set; }

        private bool _repositoryExists = repositoryExists;

        public string Describe() => "Fake host/skills";

        public Task<SkillRepositoryState> InspectAsync(
            string branch, CancellationToken cancellationToken = default) =>
            Task.FromResult(new SkillRepositoryState(_repositoryExists, branchExists));

        public Task CreateRepositoryAsync(CancellationToken cancellationToken = default)
        {
            CreateCalls++;
            _repositoryExists = true;
            return Task.CompletedTask;
        }

        public Task<string> SeedAsync(
            string branch,
            IReadOnlyDictionary<string, string> files,
            string message,
            CancellationToken cancellationToken = default)
        {
            foreach (var (path, content) in files)
            {
                Seeded[path] = content;
            }

            return Task.FromResult("commit-1");
        }

        public Task<string?> TryReadTextAsync(
            string path, string branch, CancellationToken cancellationToken = default)
        {
            ReadCalls++;
            return Task.FromResult(Files.GetValueOrDefault(path));
        }

        public Task<IReadOnlyCollection<string>> ListPathsAsync(
            string branch, string scopePath, CancellationToken cancellationToken = default) =>
            throw new InvalidOperationException("Provisioning has no reason to enumerate skills.");

        public Task<string> CommitAsync(SkillCommit commit, CancellationToken cancellationToken = default) =>
            throw new InvalidOperationException("Provisioning seeds; it does not commit skills.");
    }
}
