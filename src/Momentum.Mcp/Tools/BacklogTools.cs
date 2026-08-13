using System.Globalization;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Extensions.Mcp;
using Microsoft.Extensions.Logging;
using Momentum.Mcp.Auth;
using Momentum.Mcp.Backends;
using Momentum.Mcp.Backlog;

namespace Momentum.Mcp.Tools;

/// <summary>
/// The domain's tool surface: search, list, get, describe.
/// </summary>
/// <remarks>
/// These tools speak the domain's vocabulary, not the stores'. An agent asks for an idea or
/// a solution; it never names a work item type, a WIQL clause, an OData filter or an entity
/// set. Each tool fans out internally to whichever backend holds the answer, and how many
/// round trips that costs is not part of the contract.
/// <para>
/// Four tools rather than four classes: they take identical dependencies and share the
/// argument handling, and splitting them would be four copies of the same constructor.
/// </para>
/// <para>
/// Read-only, all four. Write tools stay out of scope and, when they arrive, arrive
/// separately and gated — deciding to adopt or approve something is not an agent's call.
/// </para>
/// </remarks>
public sealed class BacklogTools(
    BacklogRepository repository,
    EngagementReader engagement,
    MetadataCatalog metadata,
    ILogger<BacklogTools> logger)
{
    /// <summary>
    /// How many rows a discovery call hydrates.
    /// </summary>
    /// <remarks>
    /// Not a parameter, deliberately: the contract is one call and one shape, and a model
    /// given a limit will tune it instead of narrowing its query. The match count travels
    /// with every result, so a truncated answer says so rather than looking like a small
    /// catalogue.
    /// </remarks>
    private const int PageSize = 50;

    /*
        `McpToolProperty`'s second argument is the DESCRIPTION, not the type — the JSON type
        is derived from the parameter's CLR type and emitted as `dataType`. The attribute
        also exposes a `Description` property, and setting both writes `description` twice
        into functions.metadata. Worth knowing because the mistake compiles, deploys, and
        only shows up as a tool whose schema says its argument is called "string".

        Every argument here is a `string` for the same reason: the generator emits no
        `dataType` at all for an `int?`, so a numeric parameter reaches the model untyped.
        Ids are parsed and validated in the body instead.
    */

    private const string FacetDescription =
        "Which side of the backlog to look at: \"idea\" for a need somebody raised, " +
        "\"solution\" for something reusable that answers one.";

    // -----------------------------------------------------------------------
    // search
    // -----------------------------------------------------------------------

    private const string SearchDescription =
        "Finds ideas or solutions by free text. This is the primary discovery tool: one " +
        "call, one facet, whole words matched against both title and description, most " +
        "recently changed first. Returns a summary per match plus the total number matched, " +
        "so a truncated answer is distinguishable from a small catalogue. Engagement counts " +
        "are not included — use get() for those.";

    [Function(nameof(Search))]
    public async Task<SearchToolResult> Search(
        [McpToolTrigger("search", SearchDescription)] ToolInvocationContext context,
        [McpToolProperty("facet", FacetDescription, true)] string facetName,
        [McpToolProperty("query",
            "Free text. Whole words are matched, so 'ai' does not hit 'maintenance'; " +
            "there is no wildcard and no field syntax.", true)] string query,
        CancellationToken cancellationToken)
    {
        var caller = CallerContext.From(context);

        if (!Facets.TryParse(facetName, out var facet, out var error))
        {
            return new SearchToolResult(
                facetName, query, 0, false, [],
                BackendStatus.NotQueried(DownstreamResource.AzureDevOps, "The facet was not understood."),
                error);
        }

        if (string.IsNullOrWhiteSpace(query))
        {
            return new SearchToolResult(
                facet.Name(), query, 0, false, [],
                BackendStatus.NotQueried(DownstreamResource.AzureDevOps, "No query was run."),
                $"A query is required. To browse without one, call list(facet: \"{facet.Name()}\").");
        }

        logger.LogInformation(
            "search({Facet}) for session {SessionId}.", facet.Name(), caller.SessionId);

        var page = await repository.QueryAsync(
            Wiql.SearchQuery(facet, query), PageSize, caller, cancellationToken);

        if (!page.Ok)
        {
            logger.LogWarning("search({Facet}) failed: {Failure}", facet.Name(), page.Failure);

            return new SearchToolResult(
                facet.Name(), query, 0, false, [],
                BackendStatus.Failed(DownstreamResource.AzureDevOps, page.Failure!));
        }

        return new SearchToolResult(
            Facet: facet.Name(),
            Query: query,
            Matched: page.Value!.Matched,
            Truncated: page.Value.Matched > page.Value.Items.Count,
            Items: Summaries(page.Value.Items),
            AzureDevOps: BackendStatus.Ok(DownstreamResource.AzureDevOps));
    }

    // -----------------------------------------------------------------------
    // list
    // -----------------------------------------------------------------------

    private const string ListDescription =
        "Browses ideas or solutions without a search term, optionally narrowed to one status " +
        "or one tag. Call describe(facet) first to learn which statuses and tags exist — a " +
        "filter naming a value that does not exist returns nothing, which is indistinguishable " +
        "from an empty catalogue.";

    [Function(nameof(List))]
    public async Task<ListToolResult> List(
        [McpToolTrigger("list", ListDescription)] ToolInvocationContext context,
        [McpToolProperty("facet", FacetDescription, true)] string facetName,
        [McpToolProperty("status",
            "One state name, exactly as describe() reports it, e.g. \"Published\". " +
            "Omit for every status.", false)] string? status,
        [McpToolProperty("tag", "One tag. Omit for every tag.", false)] string? tag,
        CancellationToken cancellationToken)
    {
        var caller = CallerContext.From(context);

        if (!Facets.TryParse(facetName, out var facet, out var error))
        {
            return new ListToolResult(
                facetName, status, tag, 0, false, [],
                BackendStatus.NotQueried(DownstreamResource.AzureDevOps, "The facet was not understood."),
                error);
        }

        logger.LogInformation(
            "list({Facet}, status: {Status}, tag: {Tag}) for session {SessionId}.",
            facet.Name(), status, tag, caller.SessionId);

        var page = await repository.QueryAsync(
            Wiql.ListQuery(facet, status, tag), PageSize, caller, cancellationToken);

        if (!page.Ok)
        {
            logger.LogWarning("list({Facet}) failed: {Failure}", facet.Name(), page.Failure);

            return new ListToolResult(
                facet.Name(), status, tag, 0, false, [],
                BackendStatus.Failed(DownstreamResource.AzureDevOps, page.Failure!));
        }

        return new ListToolResult(
            Facet: facet.Name(),
            Status: status,
            Tag: tag,
            Matched: page.Value!.Matched,
            Truncated: page.Value.Matched > page.Value.Items.Count,
            Items: Summaries(page.Value.Items),
            AzureDevOps: BackendStatus.Ok(DownstreamResource.AzureDevOps));
    }

    // -----------------------------------------------------------------------
    // get
    // -----------------------------------------------------------------------

    private const string GetDescription =
        "Reads one idea or solution in full, together with its engagement — votes, offers to " +
        "help, and for a solution, who is using it. This is the only tool that reaches both " +
        "backends, so it is the only one that reports two statuses: a caller with access to " +
        "one and not the other gets the half they are entitled to rather than an error.";

    [Function(nameof(Get))]
    public async Task<GetToolResult> Get(
        [McpToolTrigger("get", GetDescription)] ToolInvocationContext context,
        [McpToolProperty("facet", FacetDescription, true)] string facetName,
        [McpToolProperty("id", "The item's id, as returned by search() or list().", true)] string id,
        CancellationToken cancellationToken)
    {
        var caller = CallerContext.From(context);

        if (!Facets.TryParse(facetName, out var facet, out var error))
        {
            return new GetToolResult(
                facetName, id, null, null,
                BackendStatus.NotQueried(DownstreamResource.AzureDevOps, "The facet was not understood."),
                BackendStatus.NotQueried(DownstreamResource.Dataverse, "The facet was not understood."),
                error);
        }

        if (!long.TryParse(id?.Trim(), CultureInfo.InvariantCulture, out var numericId) || numericId <= 0)
        {
            return new GetToolResult(
                facet.Name(), id, null, null,
                BackendStatus.NotQueried(DownstreamResource.AzureDevOps, "No id to look up."),
                BackendStatus.NotQueried(DownstreamResource.Dataverse, "No id to look up."),
                $"'{id}' is not an item id. Ids are the numbers search() and list() return.");
        }

        var canonicalId = numericId.ToString(CultureInfo.InvariantCulture);

        logger.LogInformation(
            "get({Facet}, {Id}) for session {SessionId}.", facet.Name(), canonicalId, caller.SessionId);

        /*
            Both legs are started before either is awaited. Neither backend's failure may
            prevent the other from reporting: the grants are independent, and a caller with
            a Dataverse security role but no Azure DevOps project membership is entitled to
            the engagement numbers even though the work item is invisible to them.
        */
        var itemCall = repository.GetAsync(numericId, caller, cancellationToken);
        var engagementCall = engagement.ReadAsync(facet, canonicalId, caller, cancellationToken);

        var item = await itemCall;
        var counts = await engagementCall;

        var detail = item.Ok
            ? await Detail(item.Value!, caller, cancellationToken)
            : null;

        if (!item.Ok)
        {
            logger.LogWarning("get({Id}) could not read the work item: {Failure}", canonicalId, item.Failure);
        }

        return new GetToolResult(
            Facet: facet.Name(),
            Id: canonicalId,
            Item: detail,
            Engagement: counts.Value,
            AzureDevOps: item.Ok
                ? BackendStatus.Ok(DownstreamResource.AzureDevOps)
                : BackendStatus.Failed(DownstreamResource.AzureDevOps, item.Failure!),
            Dataverse: counts.Ok
                ? BackendStatus.Ok(DownstreamResource.Dataverse)
                : BackendStatus.Failed(DownstreamResource.Dataverse, counts.Failure!),
            Error: item.Ok || counts.Ok
                ? null
                : "Neither backend answered. Call whoami to tell an access problem from a " +
                  "missing item — no other tool can distinguish the two.");
    }

    /// <summary>
    /// The detail record, with its links to the other side of the hub named rather than
    /// numbered. One extra hydration, and only when there are links to hydrate.
    /// </summary>
    private async Task<BacklogItemDetail> Detail(
        AdoWorkItem item,
        CallerContext caller,
        CancellationToken cancellationToken)
    {
        var refs = BacklogMapper.RelatedRefs(item);
        var linked = new List<LinkedItem>();

        if (refs.Count > 0)
        {
            var hydrated = await repository.HydrateAsync(
                [.. refs.Select(reference => reference.Id)], caller, cancellationToken);

            if (hydrated.Ok)
            {
                var canonical = refs.Where(reference => reference.Canonical)
                    .Select(reference => reference.Id)
                    .ToHashSet();

                linked.AddRange(hydrated.Value!.Select(linkedItem => BacklogMapper.ToLinked(
                    linkedItem,
                    canonical.Contains(linkedItem.Id),
                    repository.Organization,
                    repository.ProjectName)));
            }
            else
            {
                // The item itself was readable, so a link that is not is a narrower failure
                // than the read — most often a linked item under an area path this caller
                // cannot see. Reporting the item without its links beats reporting neither.
                logger.LogWarning(
                    "get({Id}) could not hydrate {Count} linked item(s): {Failure}",
                    item.Id, refs.Count, hydrated.Failure);
            }
        }

        return BacklogMapper.ToDetail(item, linked, repository.Organization, repository.ProjectName);
    }

    // -----------------------------------------------------------------------
    // describe
    // -----------------------------------------------------------------------

    private const string DescribeDescription =
        "Reports the statuses, tags and fields that exist for a facet, so filters can be " +
        "built from real values instead of guessed. Call this before using list()'s status " +
        "or tag arguments. Schema-level and safe to call once per conversation.";

    [Function(nameof(Describe))]
    public async Task<DescribeToolResult> Describe(
        [McpToolTrigger("describe", DescribeDescription)] ToolInvocationContext context,
        [McpToolProperty("facet", FacetDescription, true)] string facetName,
        CancellationToken cancellationToken)
    {
        var caller = CallerContext.From(context);

        if (!Facets.TryParse(facetName, out var facet, out var error))
        {
            return new DescribeToolResult(
                facetName, null, [], [], [], [], [], [],
                BackendStatus.NotQueried(DownstreamResource.AzureDevOps, "The facet was not understood."),
                error);
        }

        logger.LogInformation(
            "describe({Facet}) for session {SessionId}.", facet.Name(), caller.SessionId);

        return await metadata.DescribeAsync(facet, caller, cancellationToken);
    }

    // -----------------------------------------------------------------------

    private IReadOnlyList<BacklogItemSummary> Summaries(IReadOnlyList<AdoWorkItem> items) =>
        [.. items.Select(item => BacklogMapper.ToSummary(item, repository.Organization, repository.ProjectName))];
}
