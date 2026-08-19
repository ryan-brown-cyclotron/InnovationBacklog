using Momentum.Mcp.Backends;
using Momentum.Mcp.Backlog;

namespace Momentum.Tests.Mcp;

/// <summary>
/// The multipart wire format, without a tenant.
/// </summary>
/// <remarks>
/// Every failure this covers is silent. A missing blank line makes the whole batch a
/// 400 that reads as an auth problem; parts read back in the wrong order attribute one
/// query's rows to another and produce engagement numbers that are plausible and wrong;
/// and a per-part 403 swallowed as an empty page is the <c>cycai_momentum</c> mistake
/// again — an absence reported as a zero.
/// </remarks>
public class DataverseBatchTests
{
    private static readonly Uri Root = new("https://org.crm.dynamics.com/api/data/v9.2/");

    [Fact]
    public void Build_emits_one_part_per_read()
    {
        var body = DataverseBatch.Build("abc", Root, ["cycai_votes?$top=1", "cycai_adoptions"]);

        // Three delimiters: one opening each part, one closing the batch.
        Assert.Equal(3, body.Split("--batch_abc").Length - 1);
        Assert.EndsWith("--batch_abc--\r\n", body, StringComparison.Ordinal);
    }

    [Fact]
    public void Build_resolves_each_read_to_an_absolute_url()
    {
        var body = DataverseBatch.Build("abc", Root, ["cycai_votes?$top=1"]);

        // A part's request line takes the absolute URL — the relative one the
        // HttpClient would have expanded never reaches the service.
        Assert.Contains(
            "GET https://org.crm.dynamics.com/api/data/v9.2/cycai_votes?$top=1 HTTP/1.1",
            body,
            StringComparison.Ordinal);
    }

    [Fact]
    public void Build_separates_the_part_headers_from_the_request_line()
    {
        var body = DataverseBatch.Build("abc", Root, ["cycai_votes"]);

        // The blank line is not cosmetic: without it the batch is rejected outright.
        Assert.Contains("Content-ID: 1\r\n\r\nGET ", body, StringComparison.Ordinal);
    }

    [Fact]
    public void Build_uses_crlf_line_endings()
    {
        var body = DataverseBatch.Build("abc", Root, ["cycai_votes"]);

        // MIME says CRLF. This runs on Linux, where the platform separator would
        // produce a body the service refuses.
        Assert.DoesNotContain("\n", body.Replace("\r\n", string.Empty, StringComparison.Ordinal), StringComparison.Ordinal);
    }

    [Fact]
    public void Parse_returns_one_response_per_part_in_request_order()
    {
        var parts = DataverseBatch.Parse(Response(
            (200, "{\"value\":[{\"createdon\":\"2026-01-01\"}]}"),
            (200, "{\"value\":[]}")));

        Assert.Equal(2, parts.Count);
        Assert.Equal(200, parts[0].Status);
        Assert.Contains("createdon", parts[0].Body, StringComparison.Ordinal);
        Assert.Equal("{\"value\":[]}", parts[1].Body);
    }

    [Fact]
    public void Parse_orders_by_content_id_rather_than_by_arrival()
    {
        var body =
            "--batchresponse_x\r\n" +
            "Content-Type: application/http\r\n" +
            "Content-ID: 2\r\n" +
            "\r\n" +
            "HTTP/1.1 200 OK\r\n" +
            "Content-Type: application/json\r\n" +
            "\r\n" +
            "{\"n\":2}\r\n" +
            "--batchresponse_x\r\n" +
            "Content-Type: application/http\r\n" +
            "Content-ID: 1\r\n" +
            "\r\n" +
            "HTTP/1.1 200 OK\r\n" +
            "Content-Type: application/json\r\n" +
            "\r\n" +
            "{\"n\":1}\r\n" +
            "--batchresponse_x--\r\n";

        var parts = DataverseBatch.Parse(body);

        Assert.Equal("{\"n\":1}", parts[0].Body);
        Assert.Equal("{\"n\":2}", parts[1].Body);
    }

    [Fact]
    public void Parse_keeps_a_refused_part_as_its_own_status()
    {
        // The outer POST is a 200 even when a read inside it was refused, so the part
        // is the only place the 403 exists.
        var parts = DataverseBatch.Parse(Response(
            (200, "{\"value\":[]}"),
            (403, "{\"error\":{\"message\":\"Principal lacks prvReadcycai_adoption.\"}}")));

        Assert.Equal(200, parts[0].Status);
        Assert.Equal(403, parts[1].Status);
    }

    [Fact]
    public void Parse_of_a_body_with_no_parts_is_empty_rather_than_a_throw()
    {
        Assert.Empty(DataverseBatch.Parse(string.Empty));
        Assert.Empty(DataverseBatch.Parse("not a batch at all"));
    }

    [Fact]
    public void A_refused_part_reads_as_the_sentence_a_standalone_call_would_have_produced()
    {
        var detail = BackendJson.ExtractDetail(
            "{\"error\":{\"message\":\"The user is not a member of the organization.\"}}",
            isJson: true);

        var sentence = BackendJson.Describe(403, null, detail);

        Assert.Contains("403 —", sentence, StringComparison.Ordinal);
        Assert.Contains("The user is not a member of the organization.", sentence, StringComparison.Ordinal);
    }

    [Fact]
    public void An_error_body_that_is_not_json_is_reported_as_text_rather_than_lost()
    {
        Assert.Equal("<html>sign in</html>", BackendJson.ExtractDetail("<html>sign in</html>", isJson: true));
    }

    /// <summary>A response in the shape Dataverse actually answers with.</summary>
    private static string Response(params (int Status, string Body)[] parts)
    {
        var body = new System.Text.StringBuilder();

        for (var i = 0; i < parts.Length; i++)
        {
            body.Append("--batchresponse_x\r\n");
            body.Append("Content-Type: application/http\r\n");
            body.Append("Content-Transfer-Encoding: binary\r\n");
            body.Append("Content-ID: ").Append(i + 1).Append("\r\n");
            body.Append("\r\n");
            body.Append("HTTP/1.1 ").Append(parts[i].Status).Append(" \r\n");
            body.Append("Content-Type: application/json; odata.metadata=minimal\r\n");
            body.Append("OData-Version: 4.0\r\n");
            body.Append("\r\n");
            body.Append(parts[i].Body).Append("\r\n");
        }

        body.Append("--batchresponse_x--\r\n");
        return body.ToString();
    }
}
