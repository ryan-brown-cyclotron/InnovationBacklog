using System.Text.Json;

namespace Momentum.Mcp.Backlog;

/*
    The Azure DevOps payloads these tools read, and nothing more.

    Deliberately partial shapes: a work item response carries dozens of properties and
    System.Text.Json ignores the ones no record names, so adding a field to the projection
    is an edit in one place rather than two.
*/

internal sealed record WiqlResponse(IReadOnlyList<WorkItemRef>? WorkItems);

internal sealed record WorkItemRef(long Id);

internal sealed record WorkItemBatch(IReadOnlyList<AdoWorkItem>? Value);

/// <summary>
/// One work item. <c>Fields</c> is a bag rather than a typed record because the projection
/// is chosen per call and the values are heterogeneous — a string, an identity object, a
/// date.
/// </summary>
public sealed record AdoWorkItem(
    long Id,
    Dictionary<string, JsonElement>? Fields,
    IReadOnlyList<AdoRelation>? Relations)
{
    public IReadOnlyDictionary<string, JsonElement> FieldBag =>
        Fields ?? new Dictionary<string, JsonElement>();
}

public sealed record AdoRelation(string? Rel, string? Url, AdoRelationAttributes? Attributes);

/// <summary>Hyperlinks carry no label but their comment, so that is how they are told apart.</summary>
public sealed record AdoRelationAttributes(string? Comment, string? Name);

internal sealed record StateListResponse(IReadOnlyList<AdoState>? Value);

public sealed record AdoState(string? Name, string? Category);

internal sealed record TypeFieldListResponse(IReadOnlyList<AdoTypeField>? Value);

public sealed record AdoTypeField(string? ReferenceName, string? Name);

internal sealed record TypeFieldDetail(
    string? ReferenceName,
    string? Name,
    IReadOnlyList<string>? AllowedValues);

internal sealed record TagListResponse(IReadOnlyList<AdoTag>? Value);

public sealed record AdoTag(string? Name);
