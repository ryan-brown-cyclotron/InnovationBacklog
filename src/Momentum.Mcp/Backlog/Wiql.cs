using System.Text;

namespace Momentum.Mcp.Backlog;

/// <summary>
/// Builds the work item queries behind <c>search</c> and <c>list</c>.
/// </summary>
/// <remarks>
/// Separated from the client so the query text is testable without a backend. Every value
/// that reaches a query goes through <see cref="Literal"/> — a domain id or a tag is a
/// string that came from a model, and dropping one unquoted into WIQL is an injection
/// vector.
/// </remarks>
public static class Wiql
{
    /// <summary>
    /// WIQL string literals are single-quoted and escape by doubling the quote. Forgetting
    /// this breaks on any apostrophe, which in a free-text search is most of them.
    /// </summary>
    public static string Literal(string value) => value.Replace("'", "''", StringComparison.Ordinal);

    /// <summary>
    /// Keeps unreviewed and rejected work out of discovery.
    /// </summary>
    /// <remarks>
    /// Ideas and solutions are treated differently on purpose. An idea awaiting approval is
    /// a request for help, so it stays visible — that is the whole point of a backlog. A
    /// solution awaiting approval is an unchecked claim that something is reusable, so it
    /// stays private to its author.
    /// <para>
    /// The code app relaxes the solution rule for reviewers. This surface does not, and
    /// that is a decision rather than an omission: resolving the caller's role costs three
    /// extra Azure DevOps round trips on every call, and the direction of the error matters
    /// — a reviewer missing an unreviewed solution sees one row fewer, while the reverse is
    /// a disclosure. <c>@Me</c> keeps the author exception either way, because Azure DevOps
    /// resolves it against the caller rather than against this server.
    /// </para>
    /// </remarks>
    public static string CatalogClause(Facet facet)
    {
        var notRejected = $" AND [{WorkItems.State}] <> '{Literal(WorkItems.RejectedState)}'";

        return facet == Facet.Idea
            ? notRejected
            : notRejected +
              $" AND ([{WorkItems.State}] <> '{Literal(WorkItems.AwaitingApprovalState)}'" +
              $" OR [{WorkItems.CreatedBy}] = @Me)";
    }

    /// <summary>
    /// Free-text discovery over title and description.
    /// </summary>
    /// <remarks>
    /// <c>CONTAINS WORDS</c> rather than <c>CONTAINS</c>: it is the full-text operator, so
    /// it matches whole words and ranks nothing on an accidental substring — "ai" does not
    /// hit every "maintenance". Both fields are covered because a title alone is three
    /// words and the thing being searched for is usually in the body.
    /// </remarks>
    public static string SearchQuery(Facet facet, string query)
    {
        var needle = Literal(query.Trim());

        return new StringBuilder()
            .Append($"SELECT [{WorkItems.Id}] FROM WorkItems")
            .Append($" WHERE [{WorkItems.WorkItemType}] = '{Literal(facet.WorkItemType())}'")
            .Append(CatalogClause(facet))
            .Append($" AND ([{WorkItems.Title}] CONTAINS WORDS '{needle}'")
            .Append($" OR [{WorkItems.Description}] CONTAINS WORDS '{needle}')")
            .Append($" ORDER BY [{WorkItems.ChangedDate}] DESC")
            .ToString();
    }

    /// <summary>
    /// The browse query: everything of a facet, optionally narrowed by state or tag.
    /// </summary>
    /// <remarks>
    /// Tags ride inside WIQL — <c>[System.Tags] CONTAINS 'x'</c> — rather than through the
    /// tagging endpoint, which lists the tags that exist and cannot filter work items by
    /// them. One query, not a lookup followed by a query.
    /// </remarks>
    public static string ListQuery(Facet facet, string? status, string? tag)
    {
        var wiql = new StringBuilder()
            .Append($"SELECT [{WorkItems.Id}] FROM WorkItems")
            .Append($" WHERE [{WorkItems.WorkItemType}] = '{Literal(facet.WorkItemType())}'")
            .Append(CatalogClause(facet));

        if (!string.IsNullOrWhiteSpace(status))
        {
            wiql.Append($" AND [{WorkItems.State}] = '{Literal(status.Trim())}'");
        }

        if (!string.IsNullOrWhiteSpace(tag))
        {
            wiql.Append($" AND [{WorkItems.Tags}] CONTAINS '{Literal(tag.Trim())}'");
        }

        return wiql.Append($" ORDER BY [{WorkItems.ChangedDate}] DESC").ToString();
    }
}
