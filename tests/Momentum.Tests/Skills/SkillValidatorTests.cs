using System.IO.Compression;
using System.Text;
using Momentum.Library.Application.Skills;
using Momentum.Library.Domain.Skills;
using Xunit;

namespace Momentum.Tests.Skills;

public class SkillValidatorTests
{
    private const string GoodBody = """
        # PDF Table Extraction

        Use this when someone hands you a scanned PDF and wants the tables out of it as
        data rather than as an image. It handles rotated pages, multi-page tables that
        continue across a page break, and merged header cells.

        Do not use it for born-digital PDFs; those have a text layer already.
        """;

    private static string SkillMd(
        string name = "pdf-tables",
        string description = "Extracts structured tables from scanned PDF documents and returns them as CSV.",
        string body = GoodBody) =>
        $"---\nname: {name}\ndescription: {description}\n---\n\n{body}";

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

    private static SkillValidationReport Validate(string skillMd) =>
        SkillValidator.Validate(Zip(("SKILL.md", skillMd)), "s.zip");

    [Fact]
    public void A_well_formed_skill_passes_and_reports_its_own_metadata()
    {
        var report = Validate(SkillMd());

        Assert.True(report.IsValid);
        Assert.Equal("pdf-tables", report.SkillName);
        Assert.StartsWith("Extracts structured tables", report.Description);
        Assert.Equal(1, report.FileCount);
        Assert.Empty(report.Errors);
    }

    [Fact]
    public void A_bare_markdown_upload_is_accepted()
    {
        var report = SkillValidator.Validate(Encoding.UTF8.GetBytes(SkillMd()), "anything.md");

        Assert.True(report.IsValid);
        Assert.Equal("pdf-tables", report.SkillName);
    }

    [Fact]
    public void A_package_with_no_skill_md_is_refused()
    {
        var report = SkillValidator.Validate(Zip(("readme.md", "# Nope")), "s.zip");

        Assert.False(report.IsValid);
        Assert.Contains(report.Errors, issue => issue.Code == "missing-skill-md");
    }

    [Fact]
    public void Markdown_without_frontmatter_is_refused()
    {
        var report = Validate("# Just a heading\n\nNo frontmatter at all.");

        Assert.False(report.IsValid);
        Assert.Contains(report.Errors, issue => issue.Code == "missing-frontmatter");
    }

    [Fact]
    public void An_unterminated_frontmatter_block_is_refused()
    {
        var report = Validate("---\nname: x\ndescription: y\n\n# Body with no closing delimiter");

        Assert.False(report.IsValid);
        Assert.Contains(report.Errors, issue => issue.Code == "missing-frontmatter");
    }

    [Fact]
    public void A_missing_description_is_an_error_not_a_warning()
    {
        // The description is the only thing an agent reads when deciding whether the skill
        // applies, so an absent one makes the skill unreachable rather than merely thin.
        var report = Validate($"---\nname: pdf-tables\n---\n\n{GoodBody}");

        Assert.False(report.IsValid);
        Assert.Contains(report.Errors, issue => issue.Code == "missing-description");
    }

    [Fact]
    public void A_name_that_could_not_be_a_folder_is_refused()
    {
        var report = Validate(SkillMd(name: "../escape"));

        Assert.False(report.IsValid);
        Assert.Contains(report.Errors, issue => issue.Code == "unusable-name");
    }

    [Fact]
    public void Quoted_frontmatter_values_are_unquoted()
    {
        var report = Validate("---\nname: \"pdf-tables\"\ndescription: 'Extracts tables from scanned PDFs into CSV.'\n---\n\n" + GoodBody);

        Assert.Equal("pdf-tables", report.SkillName);
        Assert.StartsWith("Extracts tables", report.Description);
    }

    [Fact]
    public void An_empty_body_is_an_error_and_a_thin_one_is_only_a_warning()
    {
        var empty = Validate(SkillMd(body: "   "));
        Assert.False(empty.IsValid);
        Assert.Contains(empty.Errors, issue => issue.Code == "empty-body");

        var thin = Validate(SkillMd(body: "# Short\n\nDoes a thing."));
        Assert.True(thin.IsValid);
        Assert.Contains(thin.Issues, issue => issue.Code == "thin-body");
    }

    [Fact]
    public void Scripts_are_flagged_for_a_reviewer_but_do_not_block()
    {
        var report = SkillValidator.Validate(
            Zip(("SKILL.md", SkillMd()), ("scripts/run.ps1", "Write-Host hi")), "s.zip");

        Assert.True(report.IsValid);
        Assert.Contains(report.Issues, issue =>
            issue.Code == "executable-content" && issue.Severity == SkillIssueSeverity.Warning);
    }

    [Fact]
    public void Paths_differing_only_by_case_are_refused()
    {
        // They collide on commit and one silently wins.
        var report = SkillValidator.Validate(
            Zip(("SKILL.md", SkillMd()), ("notes.md", "a"), ("NOTES.md", "b")), "s.zip");

        Assert.False(report.IsValid);
        Assert.Contains(report.Errors, issue => issue.Code == "duplicate-paths");
    }

    [Fact]
    public void An_unreadable_upload_reports_why_rather_than_throwing()
    {
        var report = SkillValidator.Validate(Encoding.UTF8.GetBytes("not a zip"), "s.zip");

        Assert.False(report.IsValid);
        Assert.Contains(report.Errors, issue => issue.Code == "unreadable");
    }

    /*
        The published Agent Skills spec is stricter than "usable as a folder": lowercase
        letters, digits and hyphens only, no reserved words, no XML tags. Accepting more
        than the loader does would move the failure from upload, where the author can fix
        it, to load, where nobody is watching.
    */
    [Theory]
    [InlineData("PDF-Tables")]
    [InlineData("pdf_tables")]
    [InlineData("pdf.tables")]
    [InlineData("pdf tables")]
    public void Names_outside_the_published_charset_are_refused(string name)
    {
        var report = Validate(SkillMd(name: name));

        Assert.False(report.IsValid);
        Assert.Contains(report.Errors, issue => issue.Code == "unusable-name");
    }

    [Theory]
    [InlineData("claude-helper")]
    [InlineData("anthropic-tools")]
    public void Reserved_words_in_a_name_are_refused(string name)
    {
        var report = Validate(SkillMd(name: name));

        Assert.False(report.IsValid);
        Assert.Contains(report.Errors, issue => issue.Code == "reserved-name");
    }

    [Fact]
    public void An_xml_tag_in_the_description_is_refused()
    {
        // Frontmatter is injected into a system prompt; anything tag-shaped is refused
        // rather than parsed.
        var report = Validate(SkillMd(description: "Extracts tables <script>alert(1)</script> from PDFs."));

        Assert.False(report.IsValid);
        Assert.Contains(report.Errors, issue => issue.Code == "xml-in-description");
    }

    [Fact]
    public void A_description_over_the_published_limit_is_an_error_not_a_warning()
    {
        var report = Validate(SkillMd(description: new string('x', 1025)));

        Assert.False(report.IsValid);
        Assert.Contains(report.Errors, issue => issue.Code == "description-too-long");
    }

    [Fact]
    public void ValidateNameOnly_reports_errors_for_an_approver_supplied_rename()
    {
        Assert.Empty(SkillValidator.ValidateNameOnly("pdf-tables"));
        Assert.NotEmpty(SkillValidator.ValidateNameOnly("PDF Tables"));
        Assert.NotEmpty(SkillValidator.ValidateNameOnly(""));
    }
}

public class SkillFrontmatterRenameTests
{
    private const string Original = """
        ---
        name: contributor-chosen-name
        description: Extracts structured tables from scanned PDF documents and returns them as CSV.
        allowed-tools: Read, Bash
        ---

        # Body

        Unchanged.
        """;

    [Fact]
    public void Renaming_replaces_only_the_name_line()
    {
        var renamed = SkillFrontmatter.WithName(Original, "pdf-tables");

        Assert.Contains("name: pdf-tables", renamed);
        Assert.DoesNotContain("contributor-chosen-name", renamed);
        // An approver renaming a skill is not licence to edit its content.
        Assert.Contains("allowed-tools: Read, Bash", renamed);
        Assert.Contains("Unchanged.", renamed);
        Assert.Contains("Extracts structured tables", renamed);
    }

    [Fact]
    public void Renaming_a_document_without_frontmatter_leaves_it_alone()
    {
        const string plain = "# Just a heading\n\nNo frontmatter.";

        Assert.Equal(plain, SkillFrontmatter.WithName(plain, "pdf-tables"));
    }

    [Fact]
    public void A_frontmatter_block_with_no_name_line_gains_one()
    {
        var renamed = SkillFrontmatter.WithName("---\ndescription: Does a thing.\n---\n\n# Body", "pdf-tables");

        Assert.Contains("name: pdf-tables", renamed);
        Assert.Contains("description: Does a thing.", renamed);
        Assert.Equal("pdf-tables", SkillFrontmatter.Parse(renamed)!["name"]);
    }
}
