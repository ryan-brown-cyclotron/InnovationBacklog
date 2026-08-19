using System.Net;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace Momentum.Library.Infrastructure.Git;

/// <summary>
/// The bits of failure handling that Azure DevOps and GitHub happen to share.
/// </summary>
/// <remarks>
/// Both put the sentence worth reading in a <c>message</c> property of the response body, and
/// <c>EnsureSuccessStatusCode</c> throws away the body — so neither adapter can use it. The
/// per-host wording around a failure differs and stays in the adapters; only the extraction is
/// common.
/// </remarks>
internal static class GitRest
{
    private const int MaxDetail = 500;

    /// <summary>
    /// A redirect means the request arrived unauthenticated. Both hosts answer an
    /// unauthenticated browser-shaped request with a sign-in page rather than a 401, and
    /// "Found" as a diagnostic sends people looking in entirely the wrong place — so every
    /// client here is configured not to follow redirects, and this is how one is recognised.
    /// </summary>
    public static bool IsRedirect(HttpStatusCode status) =>
        status is HttpStatusCode.Found
            or HttpStatusCode.Redirect
            or HttpStatusCode.MovedPermanently
            or HttpStatusCode.TemporaryRedirect;

    public static async Task<string> ReadErrorMessageAsync(
        HttpResponseMessage response, CancellationToken cancellationToken)
    {
        try
        {
            var body = await response.Content.ReadAsStringAsync(cancellationToken);
            if (string.IsNullOrWhiteSpace(body))
            {
                return response.ReasonPhrase ?? "no detail";
            }

            var node = JsonNode.Parse(body);
            var message = node?["message"]?.GetValue<string>();

            /*
                GitHub's 422 puts the actual cause in errors[] and leaves message as
                "Validation Failed", which on its own is useless — the reason a tree or a ref
                update was rejected is the whole point of reading the body.
            */
            if (node?["errors"] is JsonArray errors && errors.Count > 0)
            {
                var details = errors
                    .Select(error => error?["message"]?.GetValue<string>() ?? error?.ToJsonString())
                    .Where(detail => !string.IsNullOrWhiteSpace(detail));

                var joined = string.Join("; ", details);
                if (!string.IsNullOrWhiteSpace(joined))
                {
                    return string.IsNullOrWhiteSpace(message) ? joined : $"{message}: {joined}";
                }
            }

            if (!string.IsNullOrWhiteSpace(message))
            {
                return message;
            }

            return body.Length > MaxDetail ? body[..MaxDetail] + "…" : body;
        }
        catch (Exception ex) when (ex is JsonException or HttpRequestException or InvalidOperationException)
        {
            return response.ReasonPhrase ?? "no detail";
        }
    }
}
