using Microsoft.Extensions.Caching.Memory;
using Momentum.Mcp.Auth;
using Momentum.Mcp.Backends;

namespace Momentum.Mcp.Backlog;

/// <summary>
/// What a facet's vocabulary actually is, asked of the store rather than assumed.
/// </summary>
/// <remarks>
/// Cached server-wide, and that is the one thing on this surface that may be. Everything
/// <c>search</c>, <c>list</c> and <c>get</c> return reflects row-level access — area-path
/// ACLs mean two callers legitimately get different rows — so caching a result across
/// callers would hand one person another person's read. States, fields and project tags are
/// org- and schema-level: the same answer for everyone who can see the project at all.
/// <para>
/// Failures are deliberately NOT cached. A 403 belongs to a caller, not to the schema, and
/// storing one would make the first unlucky request the answer everybody gets.
/// </para>
/// </remarks>
public sealed class MetadataCatalog(BacklogRepository repository, IMemoryCache cache)
{
    private static readonly TimeSpan CacheLifetime = TimeSpan.FromMinutes(30);

    public async Task<DescribeToolResult> DescribeAsync(
        Facet facet,
        CallerContext caller,
        CancellationToken cancellationToken)
    {
        var cacheKey = $"describe:{facet.Name()}";
        if (cache.TryGetValue(cacheKey, out DescribeToolResult? cached) && cached is not null)
        {
            return cached;
        }

        var statesCall = repository.StatesAsync(facet, caller, cancellationToken);
        var fieldsCall = repository.FieldsAsync(facet, caller, cancellationToken);
        var tagsCall = repository.TagsAsync(caller, cancellationToken);

        var states = await statesCall;
        var fields = await fieldsCall;
        var tags = await tagsCall;

        if (!states.Ok)
        {
            // The states are the point of describe — without them a model cannot build a
            // status filter at all, so there is nothing worth returning half of.
            return new DescribeToolResult(
                facet.Name(), facet.WorkItemType(), [], [], [], [], [], [],
                BackendStatus.Failed(DownstreamResource.AzureDevOps, states.Failure!));
        }

        var present = (fields.Value ?? [])
            .Select(field => field.ReferenceName)
            .OfType<string>()
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        // An unreadable field list must not be reported as "none of these fields exist".
        var described = Describe(facet, fields.Ok ? present : null);

        var kinds = facet == Facet.Solution && (!fields.Ok || present.Contains(WorkItems.SolutionKind))
            ? await repository.AllowedValuesAsync(facet, WorkItems.SolutionKind, caller, cancellationToken)
            : [];

        var result = new DescribeToolResult(
            Facet: facet.Name(),
            WorkItemType: facet.WorkItemType(),
            Statuses: [.. states.Value!.Where(state => !Hidden(facet).Contains(state, StringComparer.OrdinalIgnoreCase))],
            HiddenStatuses: Hidden(facet),
            Tags: tags.Value ?? [],
            Fields: described,
            Kinds: kinds,
            Notes: [.. Notes(facet, fields, tags, described, kinds)],
            AzureDevOps: BackendStatus.Ok(
                DownstreamResource.AzureDevOps,
                $"{repository.Organization}/{repository.ProjectName}"));

        cache.Set(cacheKey, result, CacheLifetime);
        return result;
    }

    /// <summary>
    /// States that exist in the process but that discovery never returns.
    /// </summary>
    /// <remarks>
    /// Reported rather than silently dropped: a filter on one of these comes back empty, and
    /// without this list that reads as "there is nothing there" instead of "that state is
    /// not browsable".
    /// </remarks>
    private static IReadOnlyList<string> Hidden(Facet facet) =>
        facet == Facet.Idea
            ? [WorkItems.RejectedState]
            : [WorkItems.RejectedState, WorkItems.AwaitingApprovalState];

    /// <summary>
    /// The fields these tools actually read, checked against the ones the type carries.
    /// </summary>
    /// <param name="present">
    /// Null when the live field list could not be read, in which case presence is reported
    /// as true rather than false — claiming a field is missing on the strength of a failed
    /// query is worse than saying nothing.
    /// </param>
    private static IReadOnlyList<DescribedField> Describe(Facet facet, HashSet<string>? present)
    {
        var curated = new List<DescribedField>
        {
            new("title", WorkItems.Title, true, "Free text. Searched by search()."),
            new("description", WorkItems.Description, true,
                "HTML in the store; returned as plain text. Also searched by search()."),
            new("status", WorkItems.State, true,
                "The state name. This is the exact string list(status:) expects."),
            new("tags", WorkItems.Tags, true,
                "Semicolon-delimited in the store. list(tag:) matches one tag; namespaced " +
                "tags such as 'pipeline:' are machine state and are stripped from results."),
            new("submittedBy", WorkItems.CreatedBy, true, "The author, as a UPN and display name."),
            new("owner", WorkItems.AssignedTo, true,
                "The assignee, or null when nobody has been assigned. Not a fallback to the author."),
            new("visibility", WorkItems.AreaPath, true,
                "Derived from the area path leaf, which also ENFORCES it — a restricted item " +
                "is absent from results rather than filtered out of them."),
        };

        if (facet == Facet.Solution)
        {
            curated.Add(new DescribedField("kind", WorkItems.SolutionKind, true,
                "What kind of solution it is. Constrained; see kinds[] for the values."));
        }

        return present is null
            ? curated
            : [.. curated.Select(field => field with { Present = present.Contains(field.ReferenceName) })];
    }

    private static IEnumerable<string> Notes(
        Facet facet,
        BackendResult<IReadOnlyList<AdoTypeField>> fields,
        BackendResult<IReadOnlyList<string>> tags,
        IReadOnlyList<DescribedField> described,
        IReadOnlyList<string> kinds)
    {
        yield return facet == Facet.Idea
            ? "Rejected ideas are never returned by search() or list()."
            : "Rejected solutions are never returned, and a solution awaiting approval is " +
              "returned only to its own author — an unreviewed solution is an unchecked " +
              "claim that something is reusable.";

        if (!fields.Ok)
        {
            yield return
                $"The work item type's field list could not be read ({fields.Failure}), so " +
                "every field below is reported as present without being verified.";
        }

        if (!tags.Ok)
        {
            yield return $"The project's tag list is unavailable: {tags.Failure}";
        }

        foreach (var missing in described.Where(field => !field.Present))
        {
            yield return
                $"'{missing.Name}' ({missing.ReferenceName}) is not on the {facet.WorkItemType()} " +
                "work item type in this project, so it is empty on every item.";
        }

        if (facet == Facet.Solution && kinds.Count == 0 &&
            described.Any(field => field.Name == "kind" && field.Present))
        {
            yield return
                "The kind field exists but offers no picklist values, so treat kind as free text.";
        }
    }
}
