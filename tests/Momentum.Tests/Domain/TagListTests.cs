using Momentum.Library.Domain.Tagging;

namespace Momentum.Tests.Domain;

public class TagListTests
{
    [Fact]
    public void Normalize_TreatsNullAsEmpty()
    {
        Assert.Empty(TagList.Normalize(null));
    }

    [Fact]
    public void Normalize_TrimsAndDropsBlanks()
    {
        var tags = TagList.Normalize(new[] { "  Azure  ", "", "   ", "FinOps" });

        Assert.Equal(new[] { "Azure", "FinOps" }, tags);
    }

    [Fact]
    public void Normalize_CollapsesInnerWhitespace()
    {
        var tags = TagList.Normalize(new[] { "Power   Automate" });

        Assert.Equal(new[] { "Power Automate" }, tags);
    }

    [Fact]
    public void Normalize_DedupesCaseInsensitivelyKeepingTheFirstSpelling()
    {
        var tags = TagList.Normalize(new[] { "Power Automate", "power automate", "POWER AUTOMATE" });

        Assert.Equal(new[] { "Power Automate" }, tags);
    }

    [Fact]
    public void Normalize_CapsTheNumberOfTags()
    {
        var many = Enumerable.Range(1, TagList.MaxTags + 5).Select(i => $"tag{i}");

        Assert.Equal(TagList.MaxTags, TagList.Normalize(many).Count);
    }

    [Fact]
    public void Normalize_TruncatesAnOverlongTag()
    {
        var tag = TagList.Normalize(new[] { new string('x', TagList.MaxTagLength + 20) }).Single();

        Assert.Equal(TagList.MaxTagLength, tag.Length);
    }

    [Fact]
    public void Matches_FindsATagCaseInsensitively()
    {
        var tags = new[] { "Developer Experience", "CI/CD" };

        Assert.True(TagList.Matches(tags, "developer"));
        Assert.True(TagList.Matches(tags, "ci/cd"));
        Assert.False(TagList.Matches(tags, "mobile"));
    }

    [Fact]
    public void Matches_IsFalseForAnEmptyQuery()
    {
        // An empty query means "everything"; the caller decides that, not the tags.
        Assert.False(TagList.Matches(new[] { "Azure" }, ""));
    }
}
