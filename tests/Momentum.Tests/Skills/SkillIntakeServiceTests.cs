using System.IO.Compression;
using System.Text;
using Momentum.Library.Application.Skills;
using Momentum.Library.Domain.Skills;
using Xunit;

namespace Momentum.Tests.Skills;

public class SkillIntakeServiceTests
{
    private const string Manifest = """
        {
          "name": "momentum",
          "plugins": [
            { "name": "existing", "source": "./plugins/existing", "version": "1.0.0" }
          ]
        }
        """;

    private static byte[] Zip(params (string Path, string Content)[] entries)
    {
        using var buffer = new MemoryStream();
        using (var archive = new ZipArchive(buffer, ZipArchiveMode.Create, leaveOpen: true))
        {
            foreach (var (path, content) in entries)
            {
                var entry = archive.CreateEntry(path);
                using var stream = entry.Open();
                stream.Write(Encoding.UTF8.GetBytes(content));
            }
        }

        return buffer.ToArray();
    }

    private const string SolutionId = "6f9619ff-8b86-d011-b42d-00c04fc964ff";

    /// <summary>A SKILL.md that passes validation, so intake tests exercise intake.</summary>
    private const string ValidSkillMd = """
        ---
        name: my-skill
        description: Extracts structured tables from scanned PDF documents and returns them as CSV.
        ---

        # My Skill

        Use this when someone hands you a scanned PDF and wants the tables out of it as
        data rather than as an image. It handles rotated pages, multi-page tables that
        continue across a page break, and merged header cells.

        Do not use it for born-digital PDFs; those have a text layer already and a plain
        text extraction is both faster and more accurate.
        """;

    private static SkillIntakeRequest Request(
        byte[]? upload = null,
        string segment = "fresh",
        string solutionId = SolutionId,
        string? skillName = null) =>
        new(
            SkillName: skillName,
            Segment: segment,
            Branch: "main",
            UploadFileName: "my-skill.zip",
            UploadContent: upload ?? Zip(("SKILL.md", ValidSkillMd)),
            ApprovedBy: "approver@example.com",
            SolutionId: solutionId,
            PluginVersion: null);

    [Fact]
    public async Task The_skill_folder_is_the_solution_id_and_the_name()
    {
        // The id carries the link back to the catalogue; the name keeps the repository
        // browsable. Neither needs a sidecar or a second store.
        var repository = new FakeSkillRepository(Manifest);
        var service = new SkillIntakeService(repository);

        var result = await service.AdoptAsync(Request(Zip(
            ("SKILL.md", ValidSkillMd),
            ("reference/api.md", "# API"))));

        Assert.Equal($"plugins/fresh/skills/{SolutionId}__my-skill/", result.DestinationPath);
        Assert.Contains($"plugins/fresh/skills/{SolutionId}__my-skill/SKILL.md", result.Paths);
        Assert.Contains($"plugins/fresh/skills/{SolutionId}__my-skill/reference/api.md", result.Paths);
    }

    [Fact]
    public async Task The_folder_takes_the_approver_s_rename_not_the_contributor_s_name()
    {
        var repository = new FakeSkillRepository(Manifest);

        var result = await new SkillIntakeService(repository)
            .AdoptAsync(Request(skillName: "pdf-tables"));

        Assert.Equal($"plugins/fresh/skills/{SolutionId}__pdf-tables/", result.DestinationPath);
    }

    [Fact]
    public async Task Renaming_on_re_adoption_moves_the_folder_rather_than_duplicating_it()
    {
        /*
            With the name in the path, a corrected name means a different folder. Left
            alone, the old folder would survive and the marketplace would publish the same
            solution twice under two names — so the previous folder is deleted in the same
            commit.
        */
        var repository = new FakeSkillRepository(Manifest);
        repository.ExistingPaths.Add($"plugins/fresh/skills/{SolutionId}__my-skill/SKILL.md");
        repository.ExistingPaths.Add($"plugins/fresh/skills/{SolutionId}__my-skill/reference/api.md");

        await new SkillIntakeService(repository).AdoptAsync(Request(skillName: "pdf-tables"));

        var changes = Assert.Single(repository.Commits).Changes;

        var deletes = changes
            .Where(c => c.Type == SkillChangeType.Delete)
            .Select(c => c.Path)
            .Order(StringComparer.Ordinal);

        Assert.Equal(
            new[]
            {
                $"plugins/fresh/skills/{SolutionId}__my-skill/SKILL.md",
                $"plugins/fresh/skills/{SolutionId}__my-skill/reference/api.md",
            }.Order(StringComparer.Ordinal),
            deletes);

        Assert.Contains(changes, c =>
            c.Type == SkillChangeType.Add && c.Path == $"plugins/fresh/skills/{SolutionId}__pdf-tables/SKILL.md");
    }

    [Fact]
    public async Task Another_solutions_folder_in_the_same_segment_is_left_alone()
    {
        // The prefix match must be on this solution's id, not on the segment.
        var repository = new FakeSkillRepository(Manifest);
        var other = "11111111-2222-3333-4444-555555555555";
        repository.ExistingPaths.Add($"plugins/fresh/skills/{other}__someone-elses/SKILL.md");

        await new SkillIntakeService(repository).AdoptAsync(Request());

        Assert.DoesNotContain(
            Assert.Single(repository.Commits).Changes,
            c => c.Type == SkillChangeType.Delete);
    }

    [Theory]
    [InlineData("not-a-guid")]
    [InlineData("")]
    public async Task A_solution_id_that_is_not_a_guid_is_refused(string solutionId)
    {
        var repository = new FakeSkillRepository(Manifest);

        await Assert.ThrowsAsync<SkillIntakeException>(
            () => new SkillIntakeService(repository).AdoptAsync(Request(solutionId: solutionId)));

        Assert.Empty(repository.Commits);
    }

    [Fact]
    public async Task A_package_that_fails_validation_never_reaches_the_repository()
    {
        // Validation runs again at commit time: approval can land days after the upload
        // was checked.
        var repository = new FakeSkillRepository(Manifest);

        var exception = await Assert.ThrowsAsync<SkillIntakeException>(
            () => new SkillIntakeService(repository).AdoptAsync(
                Request(Zip(("SKILL.md", "# No frontmatter here")))));

        Assert.Contains("not a valid skill", exception.Message);
        Assert.Empty(repository.Commits);
    }

    [Fact]
    public async Task Existing_files_are_edits_and_absent_ones_are_adds()
    {
        // Getting this backwards fails the whole push, so it is resolved, never guessed.
        var repository = new FakeSkillRepository(Manifest);
        repository.ExistingPaths.Add($"plugins/fresh/skills/{SolutionId}__my-skill/SKILL.md");

        await new SkillIntakeService(repository).AdoptAsync(Request(Zip(
            ("SKILL.md", ValidSkillMd),
            ("new.md", "# New"))));

        var commit = Assert.Single(repository.Commits);
        Assert.Equal(SkillChangeType.Edit, commit.Changes.Single(c => c.Path.EndsWith("SKILL.md")).Type);
        Assert.Equal(SkillChangeType.Add, commit.Changes.Single(c => c.Path.EndsWith("new.md")).Type);
    }

    [Fact]
    public async Task The_folder_is_listed_once_rather_than_probed_per_file()
    {
        var repository = new FakeSkillRepository(Manifest);

        await new SkillIntakeService(repository).AdoptAsync(Request(Zip(
            ("SKILL.md", ValidSkillMd), ("b.md", "b"), ("c.md", "c"), ("d/e.md", "e"))));

        Assert.Equal(1, repository.ListCallCount);
    }

    [Fact]
    public async Task A_new_segment_is_registered_in_the_manifest()
    {
        var repository = new FakeSkillRepository(Manifest);

        var result = await new SkillIntakeService(repository).AdoptAsync(Request(segment: "fresh"));

        Assert.True(result.IsNewSegment);
        Assert.Contains(MarketplaceManifest.Path, result.Paths);
    }

    [Fact]
    public async Task An_unchanged_manifest_is_not_committed()
    {
        // A no-op edit still produces a commit; a history full of those hides the real one.
        var repository = new FakeSkillRepository(Manifest);

        var result = await new SkillIntakeService(repository)
            .AdoptAsync(Request(segment: "existing"));

        Assert.False(result.IsNewSegment);
        Assert.DoesNotContain(MarketplaceManifest.Path, result.Paths);
    }

    [Fact]
    public async Task A_conflicting_push_is_retried_against_the_new_tip()
    {
        var repository = new FakeSkillRepository(Manifest) { ConflictsBeforeSuccess = 2 };

        var result = await new SkillIntakeService(repository).AdoptAsync(Request());

        Assert.Equal("commit-3", result.CommitId);
        Assert.Equal(3, repository.ListCallCount);
    }

    [Fact]
    public async Task A_branch_that_keeps_moving_eventually_surfaces_the_conflict()
    {
        var repository = new FakeSkillRepository(Manifest) { ConflictsBeforeSuccess = 99 };

        await Assert.ThrowsAsync<SkillRepositoryConflictException>(
            () => new SkillIntakeService(repository).AdoptAsync(Request()));
    }

    [Fact]
    public async Task A_missing_manifest_says_the_repository_is_not_initialised()
    {
        var repository = new FakeSkillRepository(manifest: null);

        var exception = await Assert.ThrowsAsync<SkillIntakeException>(
            () => new SkillIntakeService(repository).AdoptAsync(Request()));

        Assert.Contains("not initialised", exception.Message);
    }

    [Theory]
    [InlineData("../evil")]
    [InlineData("with space")]
    [InlineData(".hidden")]
    [InlineData("")]
    public async Task Segment_names_that_could_reach_outside_the_folder_are_refused(string segment)
    {
        var repository = new FakeSkillRepository(Manifest);

        await Assert.ThrowsAsync<SkillIntakeException>(
            () => new SkillIntakeService(repository).AdoptAsync(Request(segment: segment)));

        Assert.Empty(repository.Commits);
    }

    [Fact]
    public async Task The_approver_is_recorded_in_the_commit_message()
    {
        var repository = new FakeSkillRepository(Manifest);

        await new SkillIntakeService(repository).AdoptAsync(Request());

        var message = Assert.Single(repository.Commits).Message;
        Assert.Contains("Approved-by: approver@example.com", message);
        Assert.Contains($"Solution-id: {SolutionId}", message);
        // The folder is a GUID, so history is where the name lives. Read back from the
        // package's own frontmatter, not from the request.
        Assert.Contains("my-skill", message);
    }

    [Fact]
    public async Task An_approver_rename_rewrites_the_frontmatter_in_the_committed_file()
    {
        // The published name is the frontmatter name, so a rename that did not reach the
        // file would leave the skill still calling itself the old thing.
        var repository = new FakeSkillRepository(Manifest);

        await new SkillIntakeService(repository).AdoptAsync(Request(skillName: "pdf-tables"));

        var change = Assert.Single(repository.Commits).Changes
            .Single(c => c.Path.EndsWith("SKILL.md"));
        var committed = Encoding.UTF8.GetString(change.Content);

        Assert.Contains("name: pdf-tables", committed);
        Assert.DoesNotContain("name: my-skill", committed);
        // Only the name line moves.
        Assert.Contains("Extracts structured tables", committed);
        Assert.Contains("rotated pages", committed);
    }

    [Fact]
    public async Task Without_a_rename_the_contributor_s_frontmatter_is_committed_untouched()
    {
        var repository = new FakeSkillRepository(Manifest);

        await new SkillIntakeService(repository).AdoptAsync(Request());

        var change = Assert.Single(repository.Commits).Changes
            .Single(c => c.Path.EndsWith("SKILL.md"));

        Assert.Equal(ValidSkillMd, Encoding.UTF8.GetString(change.Content));
    }

    [Fact]
    public async Task A_rename_that_could_not_be_published_is_refused_before_any_write()
    {
        var repository = new FakeSkillRepository(Manifest);

        var exception = await Assert.ThrowsAsync<SkillIntakeException>(
            () => new SkillIntakeService(repository).AdoptAsync(Request(skillName: "PDF Tables")));

        Assert.Contains("cannot be published", exception.Message);
        Assert.Empty(repository.Commits);
    }

    private sealed class FakeSkillRepository(string? manifest) : ISkillRepository
    {
        public HashSet<string> ExistingPaths { get; } = new(StringComparer.OrdinalIgnoreCase);
        public List<SkillCommit> Commits { get; } = [];
        public int ListCallCount { get; private set; }
        public int ConflictsBeforeSuccess { get; init; }

        private int _attempts;

        public Task<IReadOnlyCollection<string>> ListPathsAsync(
            string branch, string scopePath, CancellationToken cancellationToken = default)
        {
            ListCallCount++;
            IReadOnlyCollection<string> paths = ExistingPaths
                .Where(path => path.StartsWith(scopePath, StringComparison.OrdinalIgnoreCase))
                .ToList();
            return Task.FromResult(paths);
        }

        public Task<string?> TryReadTextAsync(
            string path, string branch, CancellationToken cancellationToken = default) =>
            Task.FromResult(path == MarketplaceManifest.Path ? manifest : null);

        public Task<string> CommitAsync(SkillCommit commit, CancellationToken cancellationToken = default)
        {
            _attempts++;
            if (_attempts <= ConflictsBeforeSuccess)
            {
                throw new SkillRepositoryConflictException($"attempt {_attempts} lost the race");
            }

            Commits.Add(commit);
            return Task.FromResult($"commit-{_attempts}");
        }
    }
}
