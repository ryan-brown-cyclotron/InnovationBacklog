using System.Text.Json;
using Momentum.Mcp.Backlog;

namespace Momentum.Tests.Mcp;

/// <summary>
/// Reading a work item: the field bag, the HTML descriptions, and the relations that carry
/// more of a solution's shape than its fields do.
/// </summary>
public class WorkItemMappingTests
{
    private const string Organization = "CyclotronInc";
    private const string Project = "Innovation Backlog";

    /// <summary>Builds the untyped field bag a hydrated work item actually arrives as.</summary>
    private static AdoWorkItem Item(string json, string relations = "[]") =>
        JsonSerializer.Deserialize<AdoWorkItem>(
            $$"""{"id": 42, "fields": {{json}}, "relations": {{relations}}}""",
            new JsonSerializerOptions(JsonSerializerDefaults.Web))!;

    // -----------------------------------------------------------------------
    // Descriptions
    // -----------------------------------------------------------------------

    [Fact]
    public void Description_html_becomes_readable_text()
    {
        var text = WorkItems.PlainText(
            "<div>We need a <b>faster</b> way to&nbsp;triage.</div><p>Second thought.</p>");

        Assert.Equal("We need a faster way to triage.\nSecond thought.", text);
    }

    [Fact]
    public void Description_line_breaks_survive_as_newlines()
    {
        Assert.Equal("one\ntwo", WorkItems.PlainText("one<br/>two"));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("<p></p>")]
    public void An_empty_description_is_an_empty_string(string? html) =>
        Assert.Equal(string.Empty, WorkItems.PlainText(html));

    [Fact]
    public void A_list_summary_is_truncated_with_an_ellipsis()
    {
        var text = WorkItems.PlainText($"<p>{new string('x', 500)}</p>", maxLength: 100);

        Assert.Equal(101, text.Length);
        Assert.EndsWith("…", text, StringComparison.Ordinal);
    }

    // -----------------------------------------------------------------------
    // Fields
    // -----------------------------------------------------------------------

    /// <summary>
    /// The display name arrives on the same identity object as the UPN, so capturing both
    /// costs nothing. Discarding it is what leaves a person list showing email addresses
    /// and nothing else, because there is no directory on either backend to name them from.
    /// </summary>
    [Fact]
    public void An_identity_keeps_both_its_UPN_and_its_display_name()
    {
        var item = Item("""
            {"System.CreatedBy": {"displayName": "Ada Lovelace", "uniqueName": "ada@example.com"}}
            """);

        var person = item.FieldBag.Identity(WorkItems.CreatedBy);

        Assert.Equal("ada@example.com", person!.Id);
        Assert.Equal("Ada Lovelace", person.DisplayName);
    }

    [Fact]
    public void An_unassigned_field_is_null_rather_than_an_empty_person()
    {
        // AssignedTo is absent until somebody is explicitly assigned, and "nobody owns
        // this" is a different statement from "somebody with no name owns this".
        Assert.Null(Item("""{"System.Title": "x"}""").FieldBag.Identity(WorkItems.AssignedTo));
    }

    [Fact]
    public void Tags_split_on_semicolons_and_drop_the_pipeline_namespace()
    {
        var item = Item("""{"System.Tags": "accessibility; pipeline:TriageFailed; power-platform"}""");

        // pipeline: is machine state — it drives an idea's derived status and is not
        // something a person tagged or would browse by.
        Assert.Equal(["accessibility", "power-platform"], item.FieldBag.TopicTags());
    }

    [Fact]
    public void No_tags_is_an_empty_list()
    {
        Assert.Empty(Item("""{"System.Tags": ""}""").FieldBag.TopicTags());
        Assert.Empty(Item("""{"System.Title": "x"}""").FieldBag.TopicTags());
    }

    /// <summary>
    /// Visibility is the leaf of the area path, and the area path also enforces it. The
    /// project root — no leaf of its own — is the Everyone case.
    /// </summary>
    [Theory]
    [InlineData(@"Innovation Backlog", "Everyone")]
    [InlineData(@"Innovation Backlog\Approvers", "Approvers")]
    [InlineData(@"Innovation Backlog\Hidden", "Hidden")]
    [InlineData(@"Innovation Backlog\Team A", "Everyone")]
    public void Visibility_is_the_area_path_leaf(string areaPath, string expected)
    {
        var item = Item($$"""{"System.AreaPath": "{{areaPath.Replace(@"\", @"\\")}}"}""");

        Assert.Equal(expected, item.FieldBag.Visibility());
    }

    // -----------------------------------------------------------------------
    // Relations
    // -----------------------------------------------------------------------

    /// <summary>
    /// Repository and demo are both plain hyperlinks; their comment is the only thing that
    /// tells them apart. Swapping them would send a reader to a demo expecting source.
    /// </summary>
    [Fact]
    public void Hyperlinks_are_told_apart_by_their_comment()
    {
        var item = Item("""{"System.Title": "Batch triage"}""", """
            [
              {"rel": "Hyperlink", "url": "https://git/repo", "attributes": {"comment": "Repository"}},
              {"rel": "Hyperlink", "url": "https://demo", "attributes": {"comment": "Demo"}}
            ]
            """);

        var detail = BacklogMapper.ToDetail(item, [], Organization, Project);

        Assert.Equal("https://git/repo", detail.RepositoryUrl);
        Assert.Equal("https://demo", detail.DemoUrl);
    }

    [Fact]
    public void A_solution_with_no_repository_reports_null_rather_than_an_empty_url()
    {
        // A Strategy has no repository, so the relation is simply absent.
        var detail = BacklogMapper.ToDetail(
            Item("""{"System.Title": "Adopt a review rota"}"""), [], Organization, Project);

        Assert.Null(detail.RepositoryUrl);
        Assert.Null(detail.DemoUrl);
    }

    /// <summary>
    /// Which solution answers an idea is a property of the LINK, carried in its comment,
    /// not a field on either item.
    /// </summary>
    [Fact]
    public void The_canonical_link_is_marked_by_its_comment()
    {
        var item = Item("""{"System.Title": "x"}""", """
            [
              {"rel": "System.LinkTypes.Related", "url": "https://dev.azure.com/o/_apis/wit/workItems/201"},
              {"rel": "System.LinkTypes.Related", "url": "https://dev.azure.com/o/_apis/wit/workItems/202",
               "attributes": {"comment": "canonical"}},
              {"rel": "Hyperlink", "url": "https://git/repo", "attributes": {"comment": "Repository"}}
            ]
            """);

        var refs = BacklogMapper.RelatedRefs(item);

        Assert.Equal([201L, 202L], refs.Select(reference => reference.Id));
        Assert.False(refs[0].Canonical);
        Assert.True(refs[1].Canonical);
    }

    [Fact]
    public void A_relation_url_that_is_not_a_work_item_is_skipped()
    {
        // A Related link should always end in a numeric id; anything else is not something
        // to guess at.
        var item = Item("""{"System.Title": "x"}""", """
            [{"rel": "System.LinkTypes.Related", "url": "https://dev.azure.com/o/_apis/wit/workItems/not-an-id"}]
            """);

        Assert.Empty(BacklogMapper.RelatedRefs(item));
    }

    // -----------------------------------------------------------------------
    // Projections
    // -----------------------------------------------------------------------

    /// <summary>
    /// A linked item is the OTHER side of the hub, so its facet has to be read off its own
    /// work item type. Inheriting the caller's facet would label every solution linked to an
    /// idea as an idea.
    /// </summary>
    [Fact]
    public void A_linked_items_facet_comes_from_its_own_work_item_type()
    {
        var solution = Item("""
            {"System.Title": "Triage bot", "System.State": "Published", "System.WorkItemType": "Solution"}
            """);

        var linked = BacklogMapper.ToLinked(solution, canonical: true, Organization, Project);

        Assert.Equal("solution", linked.Facet);
        Assert.True(linked.Canonical);
    }

    /// <summary>
    /// Status is the store's own state name. <c>describe</c> reports these strings and
    /// <c>list(status:)</c> filters on them, so prettifying it here would break the round
    /// trip in a way that looks like an empty result set.
    /// </summary>
    [Fact]
    public void Status_is_the_raw_state_name()
    {
        var item = Item("""
            {"System.State": "Awaiting Approval", "System.WorkItemType": "Solution"}
            """);

        Assert.Equal("Awaiting Approval", BacklogMapper.ToSummary(item, Organization, Project).Status);
    }

    [Fact]
    public void A_summary_carries_a_citable_url()
    {
        var summary = BacklogMapper.ToSummary(
            Item("""{"System.Title": "x", "System.WorkItemType": "Idea"}"""), Organization, Project);

        Assert.Equal(
            "https://dev.azure.com/CyclotronInc/Innovation%20Backlog/_workitems/edit/42",
            summary.Url);
    }

    [Fact]
    public void Kind_is_null_on_an_item_that_carries_no_solution_type()
    {
        var summary = BacklogMapper.ToSummary(
            Item("""{"System.WorkItemType": "Idea"}"""), Organization, Project);

        Assert.Null(summary.Kind);
    }
}
