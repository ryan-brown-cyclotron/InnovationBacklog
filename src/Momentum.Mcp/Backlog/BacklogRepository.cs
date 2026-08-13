using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using Momentum.Mcp.Auth;
using Momentum.Mcp.Backends;
using Momentum.Mcp.Configuration;

namespace Momentum.Mcp.Backlog;

/// <summary>
/// Every Azure DevOps read behind the tool surface.
/// </summary>
/// <remarks>
/// The two-hop is baked in here and nowhere else. Azure DevOps querying is WIQL → <em>ids
/// only</em> → batch-hydrate by id, whatever the SELECT list says; asking for more columns
/// in the WIQL changes nothing about what comes back. That asymmetry against Dataverse's
/// single OData request is plumbing, and no tool above this line should be able to see it.
/// </remarks>
public sealed class BacklogRepository(
    [FromKeyedServices(DownstreamResource.AzureDevOps)] DownstreamHttpClient ado,
    IOptions<McpOptions> options)
{
    private const string ApiVersion = "api-version=7.1";

    /// <summary>Tagging is still preview-versioned and rejects a plain 7.1.</summary>
    private const string TagApiVersion = "api-version=7.1-preview.1";

    /// <summary><c>workitemsbatch</c> refuses more than 200 ids in one call.</summary>
    private const int BatchSize = 200;

    private string Project => Uri.EscapeDataString(options.Value.AdoProject);

    public string ProjectName => options.Value.AdoProject;

    public string Organization => options.Value.AdoOrganization;

    /// <summary>
    /// Runs a WIQL query and hydrates the rows it matched.
    /// </summary>
    /// <param name="limit">
    /// How many rows to hydrate. The match count is reported separately, so a caller can
    /// tell "there are twelve" from "there are twelve hundred and you are seeing fifty".
    /// </param>
    public async Task<BackendResult<WorkItemPage>> QueryAsync(
        string wiql,
        int limit,
        CallerContext caller,
        CancellationToken cancellationToken)
    {
        var query = await ado.PostJsonAsync<WiqlResponse>(
            $"{Project}/_apis/wit/wiql?{ApiVersion}",
            new { query = wiql },
            caller,
            cancellationToken);

        if (!query.Ok)
        {
            return BackendResult<WorkItemPage>.Failed(query.Failure!);
        }

        var matched = query.Value!.WorkItems ?? [];
        var ids = matched.Take(limit).Select(item => item.Id).ToArray();

        if (ids.Length == 0)
        {
            return BackendResult<WorkItemPage>.Success(new WorkItemPage(matched.Count, []));
        }

        var hydrated = await HydrateAsync(ids, caller, cancellationToken);

        return hydrated.Ok
            ? BackendResult<WorkItemPage>.Success(new WorkItemPage(matched.Count, hydrated.Value!))
            : BackendResult<WorkItemPage>.Failed(hydrated.Failure!);
    }

    /// <summary>
    /// Fetches work items by id, in the order asked for.
    /// </summary>
    /// <remarks>
    /// The batch call does not preserve the query's ordering, so it is restored from the id
    /// list — otherwise "most recently changed first" silently becomes "whatever order the
    /// server chose".
    /// </remarks>
    public async Task<BackendResult<IReadOnlyList<AdoWorkItem>>> HydrateAsync(
        IReadOnlyList<long> ids,
        CallerContext caller,
        CancellationToken cancellationToken)
    {
        var byId = new Dictionary<long, AdoWorkItem>();

        for (var offset = 0; offset < ids.Count; offset += BatchSize)
        {
            var chunk = ids.Skip(offset).Take(BatchSize).ToArray();

            var batch = await ado.PostJsonAsync<WorkItemBatch>(
                $"{Project}/_apis/wit/workitemsbatch?{ApiVersion}",
                new { ids = chunk, fields = WorkItems.ListFields },
                caller,
                cancellationToken);

            if (!batch.Ok)
            {
                return BackendResult<IReadOnlyList<AdoWorkItem>>.Failed(batch.Failure!);
            }

            foreach (var item in batch.Value!.Value ?? [])
            {
                byId[item.Id] = item;
            }
        }

        IReadOnlyList<AdoWorkItem> ordered =
            [.. ids.Select(id => byId.GetValueOrDefault(id)).OfType<AdoWorkItem>()];

        return BackendResult<IReadOnlyList<AdoWorkItem>>.Success(ordered);
    }

    /// <summary>
    /// One work item with its relations — the repository and demo hyperlinks and the links
    /// to the other side of the hub live there, not in any field.
    /// </summary>
    public Task<BackendResult<AdoWorkItem>> GetAsync(
        long id,
        CallerContext caller,
        CancellationToken cancellationToken) =>
        ado.GetJsonAsync<AdoWorkItem>(
            $"{Project}/_apis/wit/workitems/{id}?$expand=relations&{ApiVersion}",
            caller,
            cancellationToken);

    // -----------------------------------------------------------------------
    // Metadata — the describe surface
    // -----------------------------------------------------------------------

    public async Task<BackendResult<IReadOnlyList<string>>> StatesAsync(
        Facet facet,
        CallerContext caller,
        CancellationToken cancellationToken)
    {
        var type = Uri.EscapeDataString(facet.WorkItemType());

        var response = await ado.GetJsonAsync<StateListResponse>(
            $"{Project}/_apis/wit/workitemtypes/{type}/states?{ApiVersion}",
            caller,
            cancellationToken);

        if (!response.Ok)
        {
            return BackendResult<IReadOnlyList<string>>.Failed(response.Failure!);
        }

        IReadOnlyList<string> names =
            [.. (response.Value!.Value ?? []).Select(state => state.Name).OfType<string>()];

        return BackendResult<IReadOnlyList<string>>.Success(names);
    }

    /// <summary>
    /// The reference names the work item type actually carries.
    /// </summary>
    /// <remarks>
    /// Asked live rather than assumed, because the point of <c>describe</c> is to replace
    /// guessing. <c>Custom.InnovationBacklogSolutionType</c> in particular exists only if
    /// the process was provisioned, and a tool that claims a field that is not there sends
    /// the model to build a filter that cannot match.
    /// </remarks>
    public async Task<BackendResult<IReadOnlyList<AdoTypeField>>> FieldsAsync(
        Facet facet,
        CallerContext caller,
        CancellationToken cancellationToken)
    {
        var type = Uri.EscapeDataString(facet.WorkItemType());

        var response = await ado.GetJsonAsync<TypeFieldListResponse>(
            $"{Project}/_apis/wit/workitemtypes/{type}/fields?{ApiVersion}",
            caller,
            cancellationToken);

        return response.Ok
            ? BackendResult<IReadOnlyList<AdoTypeField>>.Success(response.Value!.Value ?? [])
            : BackendResult<IReadOnlyList<AdoTypeField>>.Failed(response.Failure!);
    }

    /// <summary>The picklist behind a constrained field, so a filter can name a real value.</summary>
    public async Task<IReadOnlyList<string>> AllowedValuesAsync(
        Facet facet,
        string fieldReferenceName,
        CallerContext caller,
        CancellationToken cancellationToken)
    {
        var type = Uri.EscapeDataString(facet.WorkItemType());
        var field = Uri.EscapeDataString(fieldReferenceName);

        var response = await ado.GetJsonAsync<TypeFieldDetail>(
            $"{Project}/_apis/wit/workitemtypes/{type}/fields/{field}?{ApiVersion}",
            caller,
            cancellationToken);

        // Best-effort: a field with no picklist and a field this caller cannot read are
        // both "no values to offer", and neither is worth failing describe over.
        return response.Ok ? response.Value!.AllowedValues ?? [] : [];
    }

    /// <summary>
    /// Tags that exist in the project, minus the namespaced ones.
    /// </summary>
    /// <remarks>
    /// <c>pipeline:</c> tags are machine state, not topics — offering them as filter values
    /// would invite a query for something nobody would ever want to browse by.
    /// </remarks>
    public async Task<BackendResult<IReadOnlyList<string>>> TagsAsync(
        CallerContext caller,
        CancellationToken cancellationToken)
    {
        var response = await ado.GetJsonAsync<TagListResponse>(
            $"{Project}/_apis/wit/tags?{TagApiVersion}",
            caller,
            cancellationToken);

        if (!response.Ok)
        {
            return BackendResult<IReadOnlyList<string>>.Failed(response.Failure!);
        }

        IReadOnlyList<string> names =
        [
            .. (response.Value!.Value ?? [])
                .Select(tag => tag.Name)
                .OfType<string>()
                .Where(WorkItems.IsTopicTag)
                .OrderBy(name => name, StringComparer.OrdinalIgnoreCase),
        ];

        return BackendResult<IReadOnlyList<string>>.Success(names);
    }
}

/// <param name="Matched">How many rows the query found, before the hydration limit.</param>
public sealed record WorkItemPage(int Matched, IReadOnlyList<AdoWorkItem> Items);
