using Momentum.Mcp.Backlog;

namespace Momentum.Tests.Mcp;

public class FacetTests
{
    [Theory]
    [InlineData("idea", Facet.Idea)]
    [InlineData("Idea", Facet.Idea)]
    [InlineData("  SOLUTION  ", Facet.Solution)]
    public void Facet_names_are_case_and_whitespace_tolerant(string input, Facet expected)
    {
        Assert.True(Facets.TryParse(input, out var facet, out _));
        Assert.Equal(expected, facet);
    }

    /// <summary>
    /// A bad argument has to come back as a sentence naming the valid values. A model can
    /// correct a sentence; it cannot correct a stack trace, and it will retry the same
    /// wrong call if the failure says nothing about what was wrong.
    /// </summary>
    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("ideas")]
    [InlineData("workitem")]
    public void An_unusable_facet_explains_itself(string? input)
    {
        Assert.False(Facets.TryParse(input, out _, out var error));
        Assert.Contains("\"idea\"", error, StringComparison.Ordinal);
        Assert.Contains("\"solution\"", error, StringComparison.Ordinal);
    }

    /// <summary>
    /// The mismatch this type exists to absorb: the tool surface says "idea", Azure DevOps
    /// says "Idea", and the Dataverse engagement key says "request". Getting the last one
    /// wrong returns zero votes for every idea — a plausible answer that is always wrong.
    /// </summary>
    [Fact]
    public void An_idea_is_keyed_as_a_request_in_Dataverse()
    {
        Assert.Equal("idea", Facet.Idea.Name());
        Assert.Equal("Idea", Facet.Idea.WorkItemType());
        Assert.Equal("request:123", Facet.Idea.TargetKey("123"));
    }

    [Fact]
    public void A_solution_is_spelled_the_same_everywhere()
    {
        Assert.Equal("solution", Facet.Solution.Name());
        Assert.Equal("Solution", Facet.Solution.WorkItemType());
        Assert.Equal("solution:456", Facet.Solution.TargetKey("456"));
    }
}
