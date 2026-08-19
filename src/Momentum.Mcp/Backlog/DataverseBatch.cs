using System.Globalization;
using System.Text;

namespace Momentum.Mcp.Backlog;

/// <summary>
/// One response inside a batch: the status line's code and the body that followed it.
/// </summary>
/// <remarks>
/// A part carries its own status. The outer POST answers 200 even when every read
/// inside it was refused, so a batch has no single outcome — which is exactly the
/// property that lets <see cref="EngagementReader"/> keep reporting "votes are
/// readable, participation is not" after the four reads became one request.
/// </remarks>
internal readonly record struct BatchPart(int Status, string Body);

/// <summary>
/// The multipart/mixed wire format for a Dataverse <c>$batch</c> of GETs.
/// </summary>
/// <remarks>
/// Split out as pure string handling for two reasons. It is the only part of the batch
/// that can be got subtly wrong in a way no compiler notices — a missing blank line
/// between a part's headers and its request line makes the whole batch a 400 — and it
/// is the only part testable without a tenant, which matters while neither backend
/// authenticates.
/// <para>
/// GETs only, and deliberately: several reads in one request need no changeset, no
/// atomicity and no ordering guarantees beyond the one the format already gives.
/// Writes would need a changeset wrapper and are not offered here.
/// </para>
/// </remarks>
internal static class DataverseBatch
{
    /// <summary>
    /// CRLF, not <c>Environment.NewLine</c>. MIME says CRLF, and on Linux — which is
    /// where this runs — the platform separator would silently produce a body the
    /// service rejects.
    /// </summary>
    private const string Crlf = "\r\n";

    public static string Boundary(string batchId) => $"batch_{batchId}";

    /// <summary>
    /// The request body. Each URL is resolved against <paramref name="baseAddress"/>
    /// because a part's request line takes the absolute URL, not the relative one the
    /// <see cref="HttpClient"/> would have expanded.
    /// </summary>
    public static string Build(string batchId, Uri baseAddress, IReadOnlyList<string> relativeUrls)
    {
        var boundary = Boundary(batchId);
        var body = new StringBuilder();

        for (var i = 0; i < relativeUrls.Count; i++)
        {
            body.Append("--").Append(boundary).Append(Crlf);
            body.Append("Content-Type: application/http").Append(Crlf);
            body.Append("Content-Transfer-Encoding: binary").Append(Crlf);
            // 1-based, and echoed back on the response part. Optional for a batch of
            // GETs; sent so the parts can be matched by id rather than by position.
            body.Append("Content-ID: ").Append(i + 1).Append(Crlf);
            body.Append(Crlf);

            body.Append("GET ").Append(new Uri(baseAddress, relativeUrls[i]).AbsoluteUri)
                .Append(" HTTP/1.1").Append(Crlf);
            body.Append("Accept: application/json").Append(Crlf);
            body.Append(Crlf);
        }

        body.Append("--").Append(boundary).Append("--").Append(Crlf);
        return body.ToString();
    }

    /// <summary>
    /// The responses, in the order they were asked for.
    /// </summary>
    /// <remarks>
    /// The response boundary is not the request's — the service picks its own
    /// (<c>batchresponse_&lt;guid&gt;</c>) — so it is read off the first delimiter line
    /// rather than assumed. Parts are returned in <c>Content-ID</c> order when the
    /// service echoes one and in arrival order when it does not; for GETs the two are
    /// the same, and relying on only one of them would be relying on the wrong one
    /// somewhere.
    /// </remarks>
    public static IReadOnlyList<BatchPart> Parse(string body)
    {
        var lines = body.Replace("\r\n", "\n", StringComparison.Ordinal).Split('\n');

        var boundary = Array.Find(lines, line => line.StartsWith("--", StringComparison.Ordinal));
        if (boundary is null)
        {
            return [];
        }

        boundary = boundary.TrimEnd();
        var parts = new List<(int Order, BatchPart Part)>();

        var index = 0;
        while (index < lines.Length)
        {
            if (lines[index].TrimEnd() != boundary)
            {
                index++;
                continue;
            }

            index++;
            var part = ReadPart(lines, ref index, boundary, parts.Count + 1);
            if (part is not null)
            {
                parts.Add(part.Value);
            }
        }

        return [.. parts.OrderBy(entry => entry.Order).Select(entry => entry.Part)];
    }

    /// <summary>
    /// One part: MIME headers, then an HTTP status line, then that response's own
    /// headers, then its body — each group separated by a blank line.
    /// </summary>
    private static (int Order, BatchPart Part)? ReadPart(
        string[] lines,
        ref int index,
        string boundary,
        int fallbackOrder)
    {
        var order = fallbackOrder;

        // MIME headers, up to the blank line.
        while (index < lines.Length && lines[index].Trim().Length > 0)
        {
            var header = lines[index];
            if (header.StartsWith("Content-ID:", StringComparison.OrdinalIgnoreCase) &&
                int.TryParse(
                    header["Content-ID:".Length..].Trim(),
                    CultureInfo.InvariantCulture,
                    out var contentId))
            {
                order = contentId;
            }

            index++;
        }

        index++;

        // The status line: "HTTP/1.1 200 OK".
        if (index >= lines.Length)
        {
            return null;
        }

        var statusLine = lines[index].Split(' ', StringSplitOptions.RemoveEmptyEntries);
        if (statusLine.Length < 2 ||
            !int.TryParse(statusLine[1], CultureInfo.InvariantCulture, out var status))
        {
            return null;
        }

        index++;

        // The response's own headers, up to the blank line.
        while (index < lines.Length && lines[index].Trim().Length > 0)
        {
            index++;
        }

        index++;

        var content = new StringBuilder();
        while (index < lines.Length && !lines[index].TrimEnd().StartsWith(boundary, StringComparison.Ordinal))
        {
            if (content.Length > 0)
            {
                content.Append('\n');
            }

            content.Append(lines[index]);
            index++;
        }

        return (order, new BatchPart(status, content.ToString().Trim()));
    }
}
