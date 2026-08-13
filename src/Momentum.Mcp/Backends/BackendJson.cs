using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Momentum.Mcp.Auth;

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
        CancellationToken cancellationToken)
    {
        var detail = await ReadErrorDetailAsync(response, cancellationToken);

        return response.StatusCode switch
        {
            HttpStatusCode.Forbidden =>
                $"403 — the token was accepted, but this user has no access here. {detail}".TrimEnd(),
            HttpStatusCode.Unauthorized =>
                $"401 — {detail}".TrimEnd(' ', '—'),
            HttpStatusCode.Found or HttpStatusCode.Redirect or HttpStatusCode.MovedPermanently =>
                $"{(int)response.StatusCode} redirect to a sign-in page — the request reached the " +
                "service unauthenticated. Check the organization name and the token's audience.",
            var status => $"{(int)status} {response.ReasonPhrase}. {detail}".TrimEnd(),
        };
    }

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
            var body = await response.Content.ReadAsStringAsync(cancellationToken);
            if (string.IsNullOrWhiteSpace(body))
            {
                return string.Empty;
            }

            if (response.Content.Headers.ContentType?.MediaType?.Contains("json", StringComparison.OrdinalIgnoreCase) == true)
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

            return body.Length > MaxDetailLength ? body[..MaxDetailLength] + "…" : body;
        }
        catch (Exception ex) when (ex is JsonException or HttpRequestException or InvalidOperationException)
        {
            // A diagnostic we cannot read must not replace the diagnostic we do have.
            return string.Empty;
        }
    }
}
