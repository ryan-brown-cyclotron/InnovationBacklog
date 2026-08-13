using System.Globalization;

namespace Momentum.Mcp.Backlog;

/// <summary>
/// Work items in, domain records out.
/// </summary>
/// <remarks>
/// The relation reading is the part worth knowing: almost nothing about a solution's shape
/// is stored in a field. The repository and demo links are native hyperlinks told apart by
/// their comment, and which solution answers an idea is the Related link's own comment.
/// Native first — an earlier draft of the process carried fifteen custom fields and
/// fourteen were restating a system field or re-implementing a link as a number.
/// </remarks>
public static class BacklogMapper
{
    private const string Hyperlink = "Hyperlink";
    private const string Related = "System.LinkTypes.Related";

    private const string RepositoryLabel = "Repository";
    private const string DemoLabel = "Demo";
    private const string CanonicalLabel = "canonical";

    /// <summary>How much description a list row carries. A model reads titles to triage.</summary>
    private const int SummaryLength = 320;

    public static BacklogItemSummary ToSummary(AdoWorkItem item, string organization, string project)
    {
        var fields = item.FieldBag;

        return new BacklogItemSummary(
            Id: item.Id.ToString(CultureInfo.InvariantCulture),
            Facet: FacetOf(fields).Name(),
            Title: fields.Text(WorkItems.Title),
            Summary: WorkItems.PlainText(fields.Text(WorkItems.Description), SummaryLength),
            Status: fields.Text(WorkItems.State),
            Kind: Kind(fields),
            Tags: fields.TopicTags(),
            SubmittedBy: fields.Identity(WorkItems.CreatedBy),
            Owner: fields.Identity(WorkItems.AssignedTo),
            Visibility: fields.Visibility(),
            CreatedAt: fields.Text(WorkItems.CreatedDate),
            UpdatedAt: fields.Text(WorkItems.ChangedDate),
            Url: WorkItems.WebUrl(organization, project, item.Id));
    }

    public static BacklogItemDetail ToDetail(
        AdoWorkItem item,
        IReadOnlyList<LinkedItem> linked,
        string organization,
        string project)
    {
        var fields = item.FieldBag;

        return new BacklogItemDetail(
            Id: item.Id.ToString(CultureInfo.InvariantCulture),
            Facet: FacetOf(fields).Name(),
            Title: fields.Text(WorkItems.Title),
            // Not truncated: the detail read is where somebody wants the whole thing.
            Description: WorkItems.PlainText(fields.Text(WorkItems.Description)),
            Status: fields.Text(WorkItems.State),
            Kind: Kind(fields),
            Tags: fields.TopicTags(),
            SubmittedBy: fields.Identity(WorkItems.CreatedBy),
            Owner: fields.Identity(WorkItems.AssignedTo),
            Visibility: fields.Visibility(),
            RepositoryUrl: Hyperlinked(item, RepositoryLabel),
            DemoUrl: Hyperlinked(item, DemoLabel),
            Linked: linked,
            CreatedAt: fields.Text(WorkItems.CreatedDate),
            UpdatedAt: fields.Text(WorkItems.ChangedDate),
            Url: WorkItems.WebUrl(organization, project, item.Id));
    }

    public static LinkedItem ToLinked(
        AdoWorkItem item,
        bool canonical,
        string organization,
        string project)
    {
        var fields = item.FieldBag;

        return new LinkedItem(
            Id: item.Id.ToString(CultureInfo.InvariantCulture),
            Facet: FacetOf(fields).Name(),
            Title: fields.Text(WorkItems.Title),
            Status: fields.Text(WorkItems.State),
            Canonical: canonical,
            Url: WorkItems.WebUrl(organization, project, item.Id));
    }

    /// <summary>
    /// The facet a hydrated row belongs to, read off the work item type rather than assumed
    /// from the query — a link points at the other side of the hub, so the caller's facet is
    /// exactly the wrong guess there.
    /// </summary>
    public static Facet FacetOf(IReadOnlyDictionary<string, System.Text.Json.JsonElement> fields) =>
        string.Equals(fields.Text(WorkItems.WorkItemType), WorkItems.SolutionType, StringComparison.OrdinalIgnoreCase)
            ? Facet.Solution
            : Facet.Idea;

    private static string? Kind(IReadOnlyDictionary<string, System.Text.Json.JsonElement> fields)
    {
        var kind = fields.Text(WorkItems.SolutionKind);
        return string.IsNullOrWhiteSpace(kind) ? null : kind;
    }

    /// <summary>A hyperlink's comment is the only label it carries.</summary>
    private static string? Hyperlinked(AdoWorkItem item, string label) =>
        (item.Relations ?? [])
            .FirstOrDefault(relation =>
                string.Equals(relation.Rel, Hyperlink, StringComparison.OrdinalIgnoreCase) &&
                string.Equals(relation.Attributes?.Comment, label, StringComparison.OrdinalIgnoreCase))
            ?.Url;

    /// <summary>
    /// Related work item ids, with the canonical one called out by its link comment.
    /// </summary>
    /// <remarks>
    /// Every Related link this domain creates joins an idea to a solution — the delivery
    /// hierarchy uses Parent, and repository and demo are Hyperlinks — so a Related link is
    /// always a link to the other facet.
    /// </remarks>
    public static IReadOnlyList<RelatedRef> RelatedRefs(AdoWorkItem item)
    {
        var refs = new List<RelatedRef>();

        foreach (var relation in item.Relations ?? [])
        {
            if (!string.Equals(relation.Rel, Related, StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            var id = IdFromUrl(relation.Url);
            if (id is null)
            {
                continue;
            }

            refs.Add(new RelatedRef(
                id.Value,
                string.Equals(relation.Attributes?.Comment, CanonicalLabel, StringComparison.OrdinalIgnoreCase)));
        }

        return refs;
    }

    private static long? IdFromUrl(string? url)
    {
        var last = url?.Split('/').LastOrDefault();
        return long.TryParse(last, CultureInfo.InvariantCulture, out var id) ? id : null;
    }
}

public sealed record RelatedRef(long Id, bool Canonical);
