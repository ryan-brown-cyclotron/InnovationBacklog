using System.Net;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Extensions.Mcp;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Momentum.Mcp.Auth;
using Momentum.Mcp.Backends;
using Momentum.Mcp.Configuration;

namespace Momentum.Mcp.Tools;

/// <summary>
/// Reports which backends the caller can actually reach.
/// </summary>
/// <remarks>
/// This is the partial-access probe, and it sets the precedent every later tool should
/// follow. Access to Dataverse and to Azure DevOps are independent: a user with a
/// Dataverse security role but no project membership in Azure DevOps succeeds against
/// one and gets a 403 from the other. Reporting both halves is the useful answer;
/// failing whole because one leg failed throws away data the caller is entitled to.
/// </remarks>
public sealed class DiagnosticsTool(
    [FromKeyedServices(DownstreamResource.Dataverse)] DownstreamHttpClient dataverse,
    [FromKeyedServices(DownstreamResource.AzureDevOps)] DownstreamHttpClient azureDevOps,
    IOptions<McpOptions> options,
    ILogger<DiagnosticsTool> logger)
{
    public const string ToolName = "whoami";

    private const string ToolDescription =
        "Reports the calling identity and which backends (Azure DevOps, Dataverse) are " +
        "reachable as that user. Use this to diagnose access problems before concluding " +
        "that data is missing.";

    [Function(nameof(WhoAmI))]
    public async Task<WhoAmIResult> WhoAmI(
        [McpToolTrigger(ToolName, ToolDescription)] ToolInvocationContext context,
        CancellationToken cancellationToken)
    {
        var caller = CallerContext.From(context);
        var settings = options.Value;

        logger.LogInformation(
            "whoami invoked for session {SessionId} (inbound token present: {HasToken}, auth mode: {AuthMode}).",
            caller.SessionId, caller.HasInboundToken, settings.AuthMode);

        // Started together and awaited separately: neither probe's failure may prevent
        // the other from reporting.
        var dataverseProbe = ProbeAsync(dataverse, "WhoAmI", DescribeDataverse, caller, cancellationToken);
        var adoProbe = ProbeAsync(azureDevOps, AdoProbeUrl, DescribeAzureDevOps, caller, cancellationToken);

        return new WhoAmIResult(
            AuthMode: settings.AuthMode.ToString(),
            Authenticated: caller.HasInboundToken,
            AzureDevOps: await adoProbe,
            Dataverse: await dataverseProbe);
    }

    private const string AdoProbeUrl = "_apis/projects?api-version=7.1&$top=1";

    /// <summary>Dataverse <c>WhoAmI</c> returns the caller's systemuserid — the id every
    /// Dataverse write in this domain is stamped with.</summary>
    private static string? DescribeDataverse(JsonElement root) =>
        root.TryGetProperty("UserId", out var userId) ? $"systemuserid {userId.GetString()}" : null;

    private static string? DescribeAzureDevOps(JsonElement root) =>
        root.TryGetProperty("count", out var count) ? $"{count.GetInt32()} project(s) visible" : null;

    /// <summary>
    /// Pulls the human-readable part out of an error body. Both backends use a
    /// <c>message</c> property; anything else is truncated rather than dumped, because
    /// this string ends up in a model's context.
    /// </summary>
    private static async Task<string> ReadErrorDetailAsync(
        HttpResponseMessage response,
        CancellationToken cancellationToken)
    {
        const int MaxDetailLength = 400;

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
                if (document.RootElement.TryGetProperty("message", out var message))
                {
                    return message.GetString() ?? string.Empty;
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

    private async Task<BackendStatus> ProbeAsync(
        DownstreamHttpClient client,
        string relativeUrl,
        Func<JsonElement, string?> describe,
        CallerContext caller,
        CancellationToken cancellationToken)
    {
        try
        {
            using var response = await client.GetAsync(relativeUrl, caller, cancellationToken);

            if (!response.IsSuccessStatusCode)
            {
                /*
                    Both backends put the useful diagnostic in the response body, not the
                    status line — Azure DevOps especially, which answers with things like
                    "VS403318: <user> has not accepted the invitation to the <org>
                    organization". Reporting only "401" would throw away the one sentence
                    that tells the caller what to actually do.
                */
                var detail = await ReadErrorDetailAsync(response, cancellationToken);

                return BackendStatus.Failed(client.Resource, response.StatusCode switch
                {
                    HttpStatusCode.Forbidden =>
                        $"403 — the token was accepted, but this user has no access here. {detail}".TrimEnd(),
                    HttpStatusCode.Unauthorized =>
                        $"401 — {detail}".TrimEnd(' ', '—'),
                    HttpStatusCode.Found or HttpStatusCode.Redirect or HttpStatusCode.MovedPermanently =>
                        $"{(int)response.StatusCode} redirect to a sign-in page — the request reached the " +
                        "service unauthenticated. Check the organization name and the token's audience.",
                    var status => $"{(int)status} {response.ReasonPhrase}. {detail}".TrimEnd(),
                });
            }

            var mediaType = response.Content.Headers.ContentType?.MediaType;
            if (mediaType is not null && !mediaType.Contains("json", StringComparison.OrdinalIgnoreCase))
            {
                // A 200 that is not JSON is almost always an HTML sign-in or error page.
                return BackendStatus.Failed(
                    client.Resource,
                    $"200 but the body is {mediaType}, not JSON — probably an interstitial sign-in page.");
            }

            var body = await response.Content.ReadAsStringAsync(cancellationToken);
            using var document = JsonDocument.Parse(body);

            return BackendStatus.Ok(client.Resource, describe(document.RootElement));
        }
        catch (DownstreamTokenException ex)
        {
            logger.LogWarning(ex, "Token acquisition failed for {Resource}.", client.Resource);
            return BackendStatus.Failed(client.Resource, ex.Message);
        }
        catch (Exception ex) when (ex is HttpRequestException or JsonException or TaskCanceledException)
        {
            logger.LogWarning(ex, "Probe of {Resource} failed.", client.Resource);
            return BackendStatus.Failed(client.Resource, ex.Message);
        }
    }

    public sealed record WhoAmIResult(
        [property: JsonPropertyName("authMode")] string AuthMode,
        [property: JsonPropertyName("authenticated")] bool Authenticated,
        [property: JsonPropertyName("azureDevOps")] BackendStatus AzureDevOps,
        [property: JsonPropertyName("dataverse")] BackendStatus Dataverse);

    public sealed record BackendStatus(
        [property: JsonPropertyName("backend")] string Backend,
        [property: JsonPropertyName("reachable")] bool Reachable,
        [property: JsonPropertyName("detail")] string? Detail)
    {
        public static BackendStatus Ok(DownstreamResource resource, string? detail) =>
            new(resource.ToString(), true, detail);

        public static BackendStatus Failed(DownstreamResource resource, string detail) =>
            new(resource.ToString(), false, detail);
    }
}
