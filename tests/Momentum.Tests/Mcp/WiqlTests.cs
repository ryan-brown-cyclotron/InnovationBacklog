using Momentum.Mcp.Backlog;

namespace Momentum.Tests.Mcp;

/// <summary>
/// The query text, without a backend.
/// </summary>
/// <remarks>
/// Worth testing at this level because every one of these is a silent failure in
/// production: an unescaped apostrophe is a malformed query, a missing catalogue clause
/// publishes unreviewed work, and a facet mapped to the wrong work item type returns an
/// empty list that looks exactly like an empty catalogue.
/// </remarks>
public class WiqlTests
{
    [Fact]
    public void Literal_doubles_apostrophes()
    {
        // The single most likely thing to arrive in a free-text query from a person.
        Assert.Equal("Bob''s idea", Wiql.Literal("Bob's idea"));
    }

    [Fact]
    public void Search_quotes_the_query_and_covers_both_text_fields()
    {
        var wiql = Wiql.SearchQuery(Facet.Idea, "Bob's idea");

        Assert.Contains("[System.Title] CONTAINS WORDS 'Bob''s idea'", wiql, StringComparison.Ordinal);
        Assert.Contains("[System.Description] CONTAINS WORDS 'Bob''s idea'", wiql, StringComparison.Ordinal);
        Assert.DoesNotContain("'Bob's", wiql, StringComparison.Ordinal);
    }

    [Fact]
    public void Search_selects_the_facet_work_item_type()
    {
        Assert.Contains("[System.WorkItemType] = 'Idea'", Wiql.SearchQuery(Facet.Idea, "x"), StringComparison.Ordinal);
        Assert.Contains("[System.WorkItemType] = 'Solution'", Wiql.SearchQuery(Facet.Solution, "x"), StringComparison.Ordinal);
    }

    [Fact]
    public void Rejected_work_is_excluded_from_both_facets()
    {
        Assert.Contains("[System.State] <> 'Rejected'", Wiql.CatalogClause(Facet.Idea), StringComparison.Ordinal);
        Assert.Contains("[System.State] <> 'Rejected'", Wiql.CatalogClause(Facet.Solution), StringComparison.Ordinal);
    }

    /// <summary>
    /// An idea awaiting approval is a request for help and stays visible; a solution
    /// awaiting approval is an unchecked claim that something is reusable and does not. If
    /// this inverts, the approval gate becomes decorative — the thing it guards would be
    /// discoverable before anyone looked at it.
    /// </summary>
    [Fact]
    public void Only_solutions_hide_work_awaiting_approval()
    {
        Assert.DoesNotContain("Awaiting Approval", Wiql.CatalogClause(Facet.Idea), StringComparison.Ordinal);

        var solutions = Wiql.CatalogClause(Facet.Solution);
        Assert.Contains("[System.State] <> 'Awaiting Approval'", solutions, StringComparison.Ordinal);
        // The author keeps sight of their own submission, and @Me is resolved by Azure
        // DevOps against the caller rather than by this server.
        Assert.Contains("[System.CreatedBy] = @Me", solutions, StringComparison.Ordinal);
    }

    [Fact]
    public void List_without_filters_carries_no_state_or_tag_clause()
    {
        var wiql = Wiql.ListQuery(Facet.Solution, status: null, tag: null);

        Assert.DoesNotContain("[System.Tags]", wiql, StringComparison.Ordinal);
        Assert.Contains("ORDER BY [System.ChangedDate] DESC", wiql, StringComparison.Ordinal);
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public void Blank_filters_are_treated_as_absent(string blank)
    {
        // A model that "omits" an argument by passing an empty string must not get a query
        // filtered to items whose state is the empty string, which matches nothing.
        var wiql = Wiql.ListQuery(Facet.Idea, status: blank, tag: blank);

        Assert.DoesNotContain("[System.State] =", wiql, StringComparison.Ordinal);
        Assert.DoesNotContain("[System.Tags] CONTAINS", wiql, StringComparison.Ordinal);
    }

    [Fact]
    public void List_filters_are_trimmed_and_escaped()
    {
        var wiql = Wiql.ListQuery(Facet.Idea, status: " Accepted ", tag: " o'brien ");

        Assert.Contains("[System.State] = 'Accepted'", wiql, StringComparison.Ordinal);
        Assert.Contains("[System.Tags] CONTAINS 'o''brien'", wiql, StringComparison.Ordinal);
    }
}
