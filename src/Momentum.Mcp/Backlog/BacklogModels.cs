using System.Text.Json.Serialization;
using Momentum.Mcp.Backends;

namespace Momentum.Mcp.Backlog;

/*
    What the tools return.

    Two rules run through every shape below.

    Status strings are the store's own state names — "Awaiting Approval", not
    "AwaitingApproval". The domain has prettier spellings, but `list(status:)` filters on
    this value and `describe` reports the values that exist, so the vocabulary going out has
    to be the vocabulary that comes back in. A translation layer here would make the round
    trip silently match nothing.

    Absence is stated, never implied. A null with a note beside it says "this could not be
    read"; a zero says "there are none of these". Conflating the two is how a tool reports
    an access problem as an empty catalogue.
*/

/// <summary>One row of a search or a list — enough to decide whether to ask for the detail.</summary>
public sealed record BacklogItemSummary(
    [property: JsonPropertyName("id")] string Id,
    [property: JsonPropertyName("facet")] string Facet,
    [property: JsonPropertyName("title")] string Title,
    [property: JsonPropertyName("summary")] string Summary,
    [property: JsonPropertyName("status")] string Status,
    [property: JsonPropertyName("kind")] string? Kind,
    [property: JsonPropertyName("tags")] IReadOnlyList<string> Tags,
    [property: JsonPropertyName("submittedBy")] Person? SubmittedBy,
    [property: JsonPropertyName("owner")] Person? Owner,
    [property: JsonPropertyName("visibility")] string Visibility,
    [property: JsonPropertyName("createdAt")] string CreatedAt,
    [property: JsonPropertyName("updatedAt")] string UpdatedAt,
    [property: JsonPropertyName("url")] string Url);

/// <summary>
/// The full item. Adds what only a relation-expanded read can answer — where the code
/// lives, and what is linked to the other side of the hub.
/// </summary>
public sealed record BacklogItemDetail(
    [property: JsonPropertyName("id")] string Id,
    [property: JsonPropertyName("facet")] string Facet,
    [property: JsonPropertyName("title")] string Title,
    [property: JsonPropertyName("description")] string Description,
    [property: JsonPropertyName("status")] string Status,
    [property: JsonPropertyName("kind")] string? Kind,
    [property: JsonPropertyName("tags")] IReadOnlyList<string> Tags,
    [property: JsonPropertyName("submittedBy")] Person? SubmittedBy,
    [property: JsonPropertyName("owner")] Person? Owner,
    [property: JsonPropertyName("visibility")] string Visibility,
    [property: JsonPropertyName("repositoryUrl")] string? RepositoryUrl,
    [property: JsonPropertyName("demoUrl")] string? DemoUrl,
    [property: JsonPropertyName("linked")] IReadOnlyList<LinkedItem> Linked,
    [property: JsonPropertyName("createdAt")] string CreatedAt,
    [property: JsonPropertyName("updatedAt")] string UpdatedAt,
    [property: JsonPropertyName("url")] string Url);

/// <summary>
/// The other side of the hub. <c>Canonical</c> marks the solution a reviewer chose as the
/// answer to an idea — a property of the LINK, carried in its comment, not a field on
/// either item.
/// </summary>
public sealed record LinkedItem(
    [property: JsonPropertyName("id")] string Id,
    [property: JsonPropertyName("facet")] string Facet,
    [property: JsonPropertyName("title")] string Title,
    [property: JsonPropertyName("status")] string Status,
    [property: JsonPropertyName("canonical")] bool Canonical,
    [property: JsonPropertyName("url")] string Url);

// ---------------------------------------------------------------------------
// Engagement
// ---------------------------------------------------------------------------

public sealed record Engagement(
    [property: JsonPropertyName("votes")] int Votes,
    [property: JsonPropertyName("votesLast30Days")] int VotesLast30Days,
    [property: JsonPropertyName("participation")] ParticipationTally? Participation,
    [property: JsonPropertyName("adoption")] AdoptionTally? Adoption,
    [property: JsonPropertyName("demandRank")] int? DemandRank,
    [property: JsonPropertyName("momentumScore")] double? MomentumScore,
    [property: JsonPropertyName("rollupCalculatedOn")] string? RollupCalculatedOn,
    [property: JsonPropertyName("notes")] IReadOnlyList<string> Notes);

/// <summary>Offers to help, by stage. Keyed by <c>systemuserid</c> in the store.</summary>
public sealed record ParticipationTally(
    [property: JsonPropertyName("proposed")] int Proposed,
    [property: JsonPropertyName("accepted")] int Accepted,
    [property: JsonPropertyName("rejected")] int Rejected,
    [property: JsonPropertyName("withdrawn")] int Withdrawn);

public sealed record AdoptionTally(
    [property: JsonPropertyName("adoptions")] int Adoptions,
    [property: JsonPropertyName("teams")] int Teams,
    [property: JsonPropertyName("activeUses")] int ActiveUses,
    [property: JsonPropertyName("completedUses")] int CompletedUses);

// ---------------------------------------------------------------------------
// Tool results
// ---------------------------------------------------------------------------

/// <param name="Matched">
/// How many items the query found. Larger than <c>items.length</c> means the answer was
/// cut short — say so rather than implying the catalogue is small.
/// </param>
public sealed record SearchToolResult(
    [property: JsonPropertyName("facet")] string? Facet,
    [property: JsonPropertyName("query")] string? Query,
    [property: JsonPropertyName("matched")] int Matched,
    [property: JsonPropertyName("truncated")] bool Truncated,
    [property: JsonPropertyName("items")] IReadOnlyList<BacklogItemSummary> Items,
    [property: JsonPropertyName("azureDevOps")] BackendStatus AzureDevOps,
    [property: JsonPropertyName("error")] string? Error = null);

public sealed record ListToolResult(
    [property: JsonPropertyName("facet")] string? Facet,
    [property: JsonPropertyName("status")] string? Status,
    [property: JsonPropertyName("tag")] string? Tag,
    [property: JsonPropertyName("matched")] int Matched,
    [property: JsonPropertyName("truncated")] bool Truncated,
    [property: JsonPropertyName("items")] IReadOnlyList<BacklogItemSummary> Items,
    [property: JsonPropertyName("azureDevOps")] BackendStatus AzureDevOps,
    [property: JsonPropertyName("error")] string? Error = null);

/// <summary>
/// The one place the two stores meet. Either half can be absent while the other answers —
/// the grants are independent, so read both statuses before concluding anything is missing.
/// </summary>
public sealed record GetToolResult(
    [property: JsonPropertyName("facet")] string? Facet,
    [property: JsonPropertyName("id")] string? Id,
    [property: JsonPropertyName("item")] BacklogItemDetail? Item,
    [property: JsonPropertyName("engagement")] Engagement? Engagement,
    [property: JsonPropertyName("azureDevOps")] BackendStatus AzureDevOps,
    [property: JsonPropertyName("dataverse")] BackendStatus Dataverse,
    [property: JsonPropertyName("error")] string? Error = null);

/// <param name="HiddenStatuses">
/// States that exist but that discovery never returns, so a filter naming one comes back
/// empty for a reason that has nothing to do with the data.
/// </param>
public sealed record DescribeToolResult(
    [property: JsonPropertyName("facet")] string? Facet,
    [property: JsonPropertyName("workItemType")] string? WorkItemType,
    [property: JsonPropertyName("statuses")] IReadOnlyList<string> Statuses,
    [property: JsonPropertyName("hiddenStatuses")] IReadOnlyList<string> HiddenStatuses,
    [property: JsonPropertyName("tags")] IReadOnlyList<string> Tags,
    [property: JsonPropertyName("fields")] IReadOnlyList<DescribedField> Fields,
    [property: JsonPropertyName("kinds")] IReadOnlyList<string> Kinds,
    [property: JsonPropertyName("notes")] IReadOnlyList<string> Notes,
    [property: JsonPropertyName("azureDevOps")] BackendStatus AzureDevOps,
    [property: JsonPropertyName("error")] string? Error = null);

/// <param name="Present">
/// Whether the work item type actually carries the field. False means the process was never
/// provisioned with it, and anything derived from it will be empty on every item.
/// </param>
public sealed record DescribedField(
    [property: JsonPropertyName("name")] string Name,
    [property: JsonPropertyName("referenceName")] string ReferenceName,
    [property: JsonPropertyName("present")] bool Present,
    [property: JsonPropertyName("meaning")] string Meaning);
