using System.IO.Compression;
using System.Text;
using System.Text.Json.Nodes;
using Momentum.Library.Application.Skills;
using Momentum.Library.Domain.Skills;
using Xunit;

namespace Momentum.Tests.Skills;

public class SkillPackageExtractorTests
{
    private static byte[] Zip(params (string Path, byte[] Content)[] entries)
    {
        using var buffer = new MemoryStream();
        using (var archive = new ZipArchive(buffer, ZipArchiveMode.Create, leaveOpen: true))
        {
            foreach (var (path, content) in entries)
            {
                var entry = archive.CreateEntry(path);
                using var stream = entry.Open();
                stream.Write(content);
            }
        }

        return buffer.ToArray();
    }

    private static byte[] Text(string value) => Encoding.UTF8.GetBytes(value);

    [Fact]
    public void Bare_markdown_is_scaffolded_into_a_skill_file()
    {
        var package = SkillPackageExtractor.Extract(Text("# Hello"), "anything.md", "my-skill");

        var file = Assert.Single(package.Files);
        Assert.Equal("SKILL.md", file.RelativePath);
        Assert.True(file.IsText);
    }

    [Fact]
    public void Archive_with_a_single_root_folder_has_it_stripped()
    {
        var zip = Zip(
            ("my-skill/SKILL.md", Text("# Skill")),
            ("my-skill/reference/api.md", Text("# API")));

        var package = SkillPackageExtractor.Extract(zip, "my-skill.zip", "my-skill");

        Assert.Equal(
            ["SKILL.md", "reference/api.md"],
            package.Files.Select(file => file.RelativePath).Order(StringComparer.Ordinal));
    }

    [Fact]
    public void Archive_with_files_at_the_root_is_left_alone()
    {
        var zip = Zip(("SKILL.md", Text("# Skill")), ("notes.md", Text("notes")));

        var package = SkillPackageExtractor.Extract(zip, "s.skill", "my-skill");

        Assert.Equal(
            ["SKILL.md", "notes.md"],
            package.Files.Select(file => file.RelativePath).Order(StringComparer.Ordinal));
    }

    [Fact]
    public void Two_top_level_folders_are_not_mistaken_for_one_root()
    {
        // Only a *common* prefix may be stripped. Stripping "a/" here would collide
        // b/SKILL.md onto the same path.
        var zip = Zip(("a/SKILL.md", Text("a")), ("b/SKILL.md", Text("b")));

        var package = SkillPackageExtractor.Extract(zip, "s.zip", "my-skill");

        Assert.Equal(
            ["a/SKILL.md", "b/SKILL.md"],
            package.Files.Select(file => file.RelativePath).Order());
    }

    [Theory]
    [InlineData("../escape.md")]
    [InlineData("skill/../../escape.md")]
    [InlineData("/etc/passwd")]
    public void Paths_that_escape_the_skill_folder_are_refused(string path)
    {
        var zip = Zip((path, Text("payload")));

        // The message differs by reason — escaping versus absolute — so assert on the
        // refusal, not on its wording.
        Assert.Throws<SkillIntakeException>(
            () => SkillPackageExtractor.Extract(zip, "s.zip", "my-skill"));
    }

    [Fact]
    public void A_traversal_entry_cannot_disguise_itself_as_a_root_folder()
    {
        // "../" looks exactly like a common root folder. Stripping it before validating
        // would turn this into a harmless-looking "escape.md" that had already escaped.
        var zip = Zip(("../escape.md", Text("payload")), ("../evil.md", Text("payload")));

        Assert.Throws<SkillIntakeException>(
            () => SkillPackageExtractor.Extract(zip, "s.zip", "my-skill"));
    }

    [Fact]
    public void Binary_content_is_flagged_so_it_commits_as_base64()
    {
        // A PNG header: committing this as rawtext would corrupt it without failing.
        byte[] png = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x01];
        var zip = Zip(("SKILL.md", Text("# Skill")), ("icon.png", png));

        var package = SkillPackageExtractor.Extract(zip, "s.zip", "my-skill");

        Assert.True(package.Files.Single(file => file.RelativePath == "SKILL.md").IsText);
        Assert.False(package.Files.Single(file => file.RelativePath == "icon.png").IsText);
    }

    [Fact]
    public void Utf8_content_beyond_ascii_is_still_text()
    {
        var zip = Zip(("SKILL.md", Text("# Café — naïve éè")));

        var package = SkillPackageExtractor.Extract(zip, "s.zip", "my-skill");

        Assert.True(Assert.Single(package.Files).IsText);
    }

    [Fact]
    public void Unsupported_extensions_are_refused()
    {
        var exception = Assert.Throws<SkillIntakeException>(
            () => SkillPackageExtractor.Extract(Text("x"), "skill.exe", "my-skill"));

        Assert.Contains(".exe", exception.Message);
    }

    [Fact]
    public void A_file_that_is_not_a_zip_fails_with_a_readable_message()
    {
        var exception = Assert.Throws<SkillIntakeException>(
            () => SkillPackageExtractor.Extract(Text("not a zip"), "s.zip", "my-skill"));

        Assert.Contains("readable zip", exception.Message);
    }

    [Fact]
    public void Directory_entries_are_skipped()
    {
        using var buffer = new MemoryStream();
        using (var archive = new ZipArchive(buffer, ZipArchiveMode.Create, leaveOpen: true))
        {
            archive.CreateEntry("my-skill/reference/");
            var entry = archive.CreateEntry("my-skill/SKILL.md");
            using var stream = entry.Open();
            stream.Write(Text("# Skill"));
        }

        var package = SkillPackageExtractor.Extract(buffer.ToArray(), "s.zip", "my-skill");

        Assert.Equal("SKILL.md", Assert.Single(package.Files).RelativePath);
    }
}

public class MarketplaceManifestTests
{
    private const string Manifest = """
        {
          "name": "momentum",
          "owner": { "name": "Cyclotron" },
          "plugins": [
            { "name": "existing", "source": "./plugins/existing", "version": "1.2.0" }
          ]
        }
        """;

    [Fact]
    public void A_new_segment_is_added_and_reported_as_new()
    {
        var manifest = MarketplaceManifest.Parse(Manifest);

        var isNew = MarketplaceManifest.UpsertPlugin(manifest, "fresh", "./plugins/fresh", null);

        Assert.True(isNew);
        var plugins = manifest["plugins"]!.AsArray();
        Assert.Equal(2, plugins.Count);
        var added = plugins.OfType<JsonObject>().Single(p => p["name"]!.GetValue<string>() == "fresh");
        Assert.Equal("1.0.0", added["version"]!.GetValue<string>());
    }

    [Fact]
    public void An_existing_segment_has_its_version_bumped_and_is_not_duplicated()
    {
        var manifest = MarketplaceManifest.Parse(Manifest);

        var isNew = MarketplaceManifest.UpsertPlugin(manifest, "existing", "./plugins/existing", "2.0.0");

        Assert.False(isNew);
        Assert.Single(manifest["plugins"]!.AsArray());
        Assert.Equal("2.0.0", manifest["plugins"]![0]!["version"]!.GetValue<string>());
    }

    [Fact]
    public void Omitting_a_version_leaves_an_existing_one_untouched()
    {
        var manifest = MarketplaceManifest.Parse(Manifest);

        MarketplaceManifest.UpsertPlugin(manifest, "existing", "./plugins/existing", null);

        Assert.Equal("1.2.0", manifest["plugins"]![0]!["version"]!.GetValue<string>());
    }

    [Fact]
    public void Properties_the_plugin_format_owns_survive_the_round_trip()
    {
        // The manifest is not ours; a typed model would quietly drop "owner".
        var manifest = MarketplaceManifest.Parse(Manifest);

        MarketplaceManifest.UpsertPlugin(manifest, "fresh", "./plugins/fresh", null);

        Assert.Contains("\"owner\"", MarketplaceManifest.Serialize(manifest));
    }

    [Fact]
    public void A_manifest_with_no_plugins_array_gains_one()
    {
        var manifest = MarketplaceManifest.Parse("""{ "name": "momentum" }""");

        var isNew = MarketplaceManifest.UpsertPlugin(manifest, "fresh", "./plugins/fresh", null);

        Assert.True(isNew);
        Assert.Single(manifest["plugins"]!.AsArray());
    }

    [Fact]
    public void Invalid_json_is_reported_as_such()
    {
        Assert.Throws<SkillIntakeException>(() => MarketplaceManifest.Parse("{ not json"));
    }
}
