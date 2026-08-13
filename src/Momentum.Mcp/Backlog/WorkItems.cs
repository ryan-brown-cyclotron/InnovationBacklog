using System.Net;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace Momentum.Mcp.Backlog;

/// <summary>
/// The Azure DevOps side of the vocabulary: field reference names, type names, and the
/// readers that turn a work item's untyped field bag into domain values.
/// </summary>
/// <remarks>
/// A deliberate mirror of <c>provider/ado/workitems.ts</c>, which the code app reads the
/// same rows through. Two hosts reading one store have to agree on the spelling of every
/// field, and the field names are the part that cannot be inferred — so they are stated
/// once here rather than interpolated at each call site.
/// </remarks>
public static partial class WorkItems
{
    public const string Id = "System.Id";
    public const string Title = "System.Title";
    public const string Description = "System.Description";
    public const string State = "System.State";
    public const string Tags = "System.Tags";
    public const string AssignedTo = "System.AssignedTo";
    public const string CreatedBy = "System.CreatedBy";
    public const string CreatedDate = "System.CreatedDate";
    public const string ChangedDate = "System.ChangedDate";
    public const string AreaPath = "System.AreaPath";
    public const string WorkItemType = "System.WorkItemType";

    /// <summary>The one constrained picklist on a Solution: what kind of thing it is.</summary>
    public const string SolutionKind = "Custom.InnovationBacklogSolutionType";

    public const string IdeaType = "Idea";
    public const string SolutionType = "Solution";

    /// <summary>
    /// States the catalogue never returns. Rejected work stays out of discovery for both
    /// facets; a solution awaiting approval is an unreviewed claim that something is
    /// reusable, so it stays private to its author until a reviewer agrees.
    /// </summary>
    public const string RejectedState = "Rejected";

    public const string AwaitingApprovalState = "Awaiting Approval";

    /// <summary>Tag namespace carrying pipeline health, stripped from anything a person reads.</summary>
    public const string PipelineTagPrefix = "pipeline:";

    /// <summary>
    /// The list projection.
    /// </summary>
    /// <remarks>
    /// <c>workitemsbatch</c> accepts a field projection OR <c>$expand</c>, never both, so
    /// a list asks for fields and gets no relations. <c>get</c> expands instead and takes
    /// every field with it — a heavier payload that only the detail read pays for.
    /// </remarks>
    public static readonly string[] ListFields =
    [
        Id, Title, Description, State, Tags, AssignedTo, CreatedBy,
        CreatedDate, ChangedDate, AreaPath, WorkItemType, SolutionKind,
    ];

    /// <summary>The human-facing link, so an agent can cite an item rather than an id.</summary>
    public static string WebUrl(string organization, string project, long id) =>
        $"https://dev.azure.com/{Uri.EscapeDataString(organization)}/{Uri.EscapeDataString(project)}/_workitems/edit/{id}";

    // -----------------------------------------------------------------------
    // Field readers
    // -----------------------------------------------------------------------

    public static string Text(this IReadOnlyDictionary<string, JsonElement> fields, string field) =>
        fields.TryGetValue(field, out var value) && value.ValueKind == JsonValueKind.String
            ? value.GetString() ?? string.Empty
            : string.Empty;

    /// <summary>
    /// An identity field arrives as an object; <c>uniqueName</c> is the UPN and the stable
    /// handle. The display name is captured alongside it rather than discarded — it is the
    /// cheapest source of a friendly name there is, and throwing it away is what leaves an
    /// Azure DevOps-derived person list showing nothing but email addresses.
    /// </summary>
    public static Person? Identity(this IReadOnlyDictionary<string, JsonElement> fields, string field)
    {
        if (!fields.TryGetValue(field, out var value))
        {
            return null;
        }

        if (value.ValueKind == JsonValueKind.String)
        {
            var raw = value.GetString();
            return string.IsNullOrWhiteSpace(raw) ? null : new Person(raw, raw);
        }

        if (value.ValueKind != JsonValueKind.Object)
        {
            return null;
        }

        var unique = value.TryGetProperty("uniqueName", out var u) ? u.GetString() : null;
        var display = value.TryGetProperty("displayName", out var d) ? d.GetString() : null;

        if (string.IsNullOrWhiteSpace(unique) && string.IsNullOrWhiteSpace(display))
        {
            return null;
        }

        return new Person(unique ?? display!, display ?? unique!);
    }

    /// <summary><c>System.Tags</c> is one semicolon-delimited string, not an array.</summary>
    public static string[] ReadTags(this IReadOnlyDictionary<string, JsonElement> fields) =>
        fields.Text(Tags)
            .Split(';', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

    /// <summary>Tags with no known namespace — the ones a person actually typed.</summary>
    public static string[] TopicTags(this IReadOnlyDictionary<string, JsonElement> fields) =>
        [.. fields.ReadTags().Where(IsTopicTag)];

    public static bool IsTopicTag(string tag) =>
        !tag.StartsWith(PipelineTagPrefix, StringComparison.OrdinalIgnoreCase);

    /// <summary>
    /// Visibility is the leaf of the area path: <c>Project\Approvers</c> means Approvers.
    /// Anything else, including the project root, is Everyone. The area path also ENFORCES
    /// it, which is why nothing here filters on the value — a restricted item never
    /// reaches an unauthorized caller at all.
    /// </summary>
    public static string Visibility(this IReadOnlyDictionary<string, JsonElement> fields)
    {
        var leaf = fields.Text(AreaPath).Split('\\').LastOrDefault();
        return leaf is "Approvers" or "Hidden" ? leaf : "Everyone";
    }

    // -----------------------------------------------------------------------
    // Description text
    // -----------------------------------------------------------------------

    /// <summary>
    /// Descriptions are stored as HTML. A model reads the words, not the markup, and every
    /// tag it is handed is context spent on nothing — so tags come out, entities are
    /// decoded, and block boundaries survive as newlines.
    /// </summary>
    /// <param name="maxLength">
    /// Zero for the whole thing. A list of thirty rows carrying full descriptions is the
    /// single largest thing these tools can return, so list projections truncate and the
    /// detail read does not.
    /// </param>
    public static string PlainText(string? html, int maxLength = 0)
    {
        if (string.IsNullOrWhiteSpace(html))
        {
            return string.Empty;
        }

        var text = BlockBoundary().Replace(html, "\n");
        text = MarkupTag().Replace(text, string.Empty);
        text = WebUtility.HtmlDecode(text);
        text = HorizontalWhitespace().Replace(text, " ");
        text = ExcessNewlines().Replace(text, "\n").Trim();

        return maxLength > 0 && text.Length > maxLength ? text[..maxLength].TrimEnd() + "…" : text;
    }

    [GeneratedRegex(@"</(p|div|li|tr|h[1-6])\s*>|<br\s*/?>", RegexOptions.IgnoreCase)]
    private static partial Regex BlockBoundary();

    [GeneratedRegex("<[^>]+>")]
    private static partial Regex MarkupTag();

    [GeneratedRegex(@"[^\S\n]+")]
    private static partial Regex HorizontalWhitespace();

    [GeneratedRegex(@"\s*\n\s*")]
    private static partial Regex ExcessNewlines();
}

/// <summary>
/// A person as Azure DevOps holds them.
/// </summary>
/// <remarks>
/// The UPN is the identity — every "is this mine?" comparison in this domain is against a
/// value that came off a work item, and the Dataverse <c>systemuserid</c> is a different
/// id space with no join back to this one. The display name rides along because it costs
/// nothing: it is on the same object.
/// </remarks>
public sealed record Person(string Id, string DisplayName);
