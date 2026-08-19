using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Momentum.Mcp.Auth;
using Momentum.Mcp.Backlog;

namespace Momentum.Mcp.Backends;

/// <summary>
/// One downstream call's outcome: the payload, or the reason there is not one.
/// </summary>
/// <remarks>
/// Failures are values here rather than exceptions because a tool that touches two
/// backends has to report both halves — see <see cref="BackendStatus"/>. Throwing would
/// make the first failure the only answer.
/// </remarks>
public sealed record BackendResult<T>(T? Value, string? Failure)
{
    /// <summary>True only when a payload actually arrived; an empty body is a failure.</summary>
    public bool Ok => Failure is null && Value is not null;

    public static BackendResult<T> Success(T value) => new(value, null);

    public static BackendResult<T> Failed(string failure) => new(default, failure);
}

/// <summary>
/// JSON over <see cref="DownstreamHttpClient"/>, with every failure reduced to a
/// sentence a model can act on.
/// </summary>
public static class BackendJson
{
    /// <summary>
    /// Web defaults: camelCase and case-insensitive matching. Both backends need the
    /// latter — Azure DevOps answers in camelCase, the Dataverse function endpoints in
    /// PascalCase (<c>WhoAmI</c> returns <c>UserId</c>).
    /// </summary>
    private static readonly JsonSerializerOptions Options = new(JsonSerializerDefaults.Web);

    /// <summary>Error bodies end up in a model's context, so they are truncated, not dumped.</summary>
    private const int MaxDetailLength = 400;

    public static Task<BackendResult<T>> GetJsonAsync<T>(
        this DownstreamHttpClient client,
        string relativeUrl,
        CallerContext caller,
        CancellationToken cancellationToken) =>
        SendAsync<T>(client, () => new HttpRequestMessage(HttpMethod.Get, relativeUrl), caller, cancellationToken);

    public static Task<BackendResult<T>> PostJsonAsync<T>(
        this DownstreamHttpClient client,
        string relativeUrl,
        object body,
        CallerContext caller,
        CancellationToken cancellationToken) =>
        SendAsync<T>(
            client,
            () => new HttpRequestMessage(HttpMethod.Post, relativeUrl)
            {
                Content = JsonContent.Create(body, options: Options),
            },
            caller,
            cancellationToken);

    /// <summary>
    /// Several GETs as one <c>$batch</c> POST, answered in the order they were asked
    /// for.
    /// </summary>
    /// <remarks>
    /// The outer POST succeeding says nothing about the reads inside it — a batch
    /// whose every part was refused is still a 200 — so each part is turned into its
    /// own <see cref="BackendResult{T}"/> using the same failure sentences a
    /// standalone call would have produced. A caller that could report "votes are
    /// readable, participation is not" before batching can still report it after.
    /// <para>
    /// Untyped on purpose: the reads in one batch rarely share a shape. Each part is
    /// handed back as a <see cref="JsonElement"/> and turned into a record by
    /// <see cref="As{T}"/>.
    /// </para>
    /// </remarks>
    public static async Task<IReadOnlyList<BackendResult<JsonElement>>> BatchGetAsync(
        this DownstreamHttpClient client,
        IReadOnlyList<string> relativeUrls,
        CallerContext caller,
        CancellationToken cancellationToken)
    {
        if (relativeUrls.Count == 0)
        {
            return [];
        }

        var baseAddress = client.BaseAddress;
        if (baseAddress is null)
        {
            return Repeat("The backend has no base address configured.", relativeUrls.Count);
        }

        var batchId = Guid.NewGuid().ToString("n");

        try
        {
            using var request = new HttpRequestMessage(HttpMethod.Post, "$batch")
            {
                Content = new StringContent(
                    DataverseBatch.Build(batchId, baseAddress, relativeUrls),
                    Encoding.UTF8),
            };

            // Set after construction: StringContent's constructor only takes a media
            // type, and multipart/mixed is meaningless without its boundary.
            request.Content.Headers.ContentType =
                MediaTypeHeaderValue.Parse($"multipart/mixed; boundary={DataverseBatch.Boundary(batchId)}");

            using var response = await client.SendAsync(request, caller, cancellationToken);
            var body = await response.Content.ReadAsStringAsync(cancellationToken);

            if (!response.IsSuccessStatusCode)
            {
                // The batch itself was refused — auth, throttling, a malformed body —
                // so every read in it failed for the same reason.
                var isJson = response.Content.Headers.ContentType?.MediaType
                    ?.Contains("json", StringComparison.OrdinalIgnoreCase) == true;
                return Repeat(
                    Describe((int)response.StatusCode, response.ReasonPhrase, ExtractDetail(body, isJson)),
                    relativeUrls.Count);
            }

            var parts = DataverseBatch.Parse(body);
            if (parts.Count != relativeUrls.Count)
            {
                // Positional mapping is the whole contract here; a short read would
                // silently attribute one query's rows to another.
                return Repeat(
                    $"The batch answered with {parts.Count} responses for {relativeUrls.Count} requests.",
                    relativeUrls.Count);
            }

            return [.. parts.Select(ToResult)];
        }
        catch (DownstreamTokenException ex)
        {
            return Repeat(ex.Message, relativeUrls.Count);
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException)
        {
            return Repeat(ex.Message, relativeUrls.Count);
        }
    }

    /// <summary>Turns one batch part into the record the caller expects.</summary>
    public static BackendResult<T> As<T>(this BackendResult<JsonElement> part)
    {
        if (!part.Ok)
        {
            return BackendResult<T>.Failed(part.Failure!);
        }

        try
        {
            var value = part.Value.Deserialize<T>(Options);
            return value is null
                ? BackendResult<T>.Failed("The response body was empty.")
                : BackendResult<T>.Success(value);
        }
        catch (JsonException ex)
        {
            return BackendResult<T>.Failed(ex.Message);
        }
    }

    private static BackendResult<JsonElement> ToResult(BatchPart part)
    {
        if (part.Status is < 200 or > 299)
        {
            return BackendResult<JsonElement>.Failed(
                Describe(part.Status, null, ExtractDetail(part.Body, isJson: true)));
        }

        try
        {
            using var document = JsonDocument.Parse(part.Body);
            // Cloned: the document is disposed on the way out of this scope and an
            // element still rooted in it would read as freed memory.
            return BackendResult<JsonElement>.Success(document.RootElement.Clone());
        }
        catch (JsonException ex)
        {
            return BackendResult<JsonElement>.Failed(ex.Message);
        }
    }

    private static IReadOnlyList<BackendResult<JsonElement>> Repeat(string failure, int count) =>
        [.. Enumerable.Repeat(BackendResult<JsonElement>.Failed(failure), count)];

    private static async Task<BackendResult<T>> SendAsync<T>(
        DownstreamHttpClient client,
        Func<HttpRequestMessage> createRequest,
        CallerContext caller,
        CancellationToken cancellationToken)
    {
        try
        {
            using var request = createRequest();
            using var response = await client.SendAsync(request, caller, cancellationToken);

            if (!response.IsSuccessStatusCode)
            {
                return BackendResult<T>.Failed(
                    await DescribeFailureAsync(response, cancellationToken));
            }

            var mediaType = response.Content.Headers.ContentType?.MediaType;
            if (mediaType is not null && !mediaType.Contains("json", StringComparison.OrdinalIgnoreCase))
            {
                // A 200 that is not JSON is almost always an HTML sign-in or error page.
                return BackendResult<T>.Failed(
                    $"200 but the body is {mediaType}, not JSON — probably an interstitial sign-in page.");
            }

            var value = await response.Content.ReadFromJsonAsync<T>(Options, cancellationToken);
            return value is null
                ? BackendResult<T>.Failed("The response body was empty.")
                : BackendResult<T>.Success(value);
        }
        catch (DownstreamTokenException ex)
        {
            return BackendResult<T>.Failed(ex.Message);
        }
        catch (Exception ex) when (ex is HttpRequestException or JsonException or TaskCanceledException)
        {
            return BackendResult<T>.Failed(ex.Message);
        }
    }

    /// <summary>
    /// Turns a failed response into the one sentence worth reading.
    /// </summary>
    /// <remarks>
    /// Both backends put the useful diagnostic in the response BODY, not the status line —
    /// Azure DevOps especially, which answers with things like "VS403318: &lt;user&gt; has
    /// not accepted the invitation to the &lt;org&gt; organization". Reporting only "401"
    /// throws away the one sentence that says what to do about it.
    /// </remarks>
    private static async Task<string> DescribeFailureAsync(
        HttpResponseMessage response,
        CancellationToken cancellationToken) =>
        Describe(
            (int)response.StatusCode,
            response.ReasonPhrase,
            await ReadErrorDetailAsync(response, cancellationToken));

    /// <summary>
    /// The sentence, from a status and whatever the body had to say.
    /// </summary>
    /// <remarks>
    /// Pure, and shared with the batch path — a read that failed inside a
    /// <c>$batch</c> has a status and a body and no <see cref="HttpResponseMessage"/>,
    /// and it should read exactly as it did when it was its own request.
    /// </remarks>
    internal static string Describe(int status, string? reasonPhrase, string detail) =>
        (HttpStatusCode)status switch
        {
            HttpStatusCode.Forbidden =>
                $"403 — the token was accepted, but this user has no access here. {detail}".TrimEnd(),
            HttpStatusCode.Unauthorized =>
                $"401 — {detail}".TrimEnd(' ', '—'),
            HttpStatusCode.Found or HttpStatusCode.Redirect or HttpStatusCode.MovedPermanently =>
                $"{status} redirect to a sign-in page — the request reached the " +
                "service unauthenticated. Check the organization name and the token's audience.",
            _ => $"{status}{(string.IsNullOrWhiteSpace(reasonPhrase) ? "" : $" {reasonPhrase}")}. {detail}"
                .TrimEnd(),
        };

    /// <summary>
    /// Pulls the human-readable part out of an error body. Both backends use a
    /// <c>message</c> property; anything else is truncated rather than dumped.
    /// </summary>
    private static async Task<string> ReadErrorDetailAsync(
        HttpResponseMessage response,
        CancellationToken cancellationToken)
    {
        try
        {
            return ExtractDetail(
                await response.Content.ReadAsStringAsync(cancellationToken),
                response.Content.Headers.ContentType?.MediaType
                    ?.Contains("json", StringComparison.OrdinalIgnoreCase) == true);
        }
        catch (Exception ex) when (ex is HttpRequestException or InvalidOperationException)
        {
            // A diagnostic we cannot read must not replace the diagnostic we do have.
            return string.Empty;
        }
    }

    /// <summary>Pure, and shared with the batch path — see <see cref="Describe"/>.</summary>
    internal static string ExtractDetail(string body, bool isJson)
    {
        if (string.IsNullOrWhiteSpace(body))
        {
            return string.Empty;
        }

        try
        {
            if (isJson)
            {
                using var document = JsonDocument.Parse(body);
                if (document.RootElement.ValueKind == JsonValueKind.Object)
                {
                    // Azure DevOps: { "message": … }. Dataverse: { "error": { "message": … } }.
                    if (document.RootElement.TryGetProperty("message", out var message))
                    {
                        return message.GetString() ?? string.Empty;
                    }

                    if (document.RootElement.TryGetProperty("error", out var error) &&
                        error.ValueKind == JsonValueKind.Object &&
                        error.TryGetProperty("message", out var nested))
                    {
                        return nested.GetString() ?? string.Empty;
                    }
                }
            }
        }
        catch (JsonException)
        {
            // Not JSON after all — fall through and report the body as text.
        }

        return body.Length > MaxDetailLength ? body[..MaxDetailLength] + "…" : body;
    }
}
