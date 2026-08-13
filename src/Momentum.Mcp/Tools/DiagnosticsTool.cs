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
/// This is the partial-access probe, and it sets the precedent every other tool follows.
/// Access to Dataverse and to Azure DevOps are independent: a user with a Dataverse security
/// role but no project membership in Azure DevOps succeeds against one and gets a 403 from
/// the other. Reporting both halves is the useful answer; failing whole because one leg
/// failed throws away data the caller is entitled to.
/// <para>
/// It is also the only tool that can tell "you have no access" from "there is nothing
/// there", which is why every other tool's failure text points here.
/// </para>
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

    private const string AdoProbeUrl = "_apis/projects?api-version=7.1&$top=1";

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

        // Started together and awaited separately: neither probe's failure may prevent the
        // other from reporting.
        var dataverseProbe = dataverse.GetJsonAsync<DataverseWhoAmI>("WhoAmI", caller, cancellationToken);
        var adoProbe = azureDevOps.GetJsonAsync<AdoProjectList>(AdoProbeUrl, caller, cancellationToken);

        return new WhoAmIResult(
            AuthMode: settings.AuthMode.ToString(),
            Authenticated: caller.HasInboundToken,
            AzureDevOps: Report(
                DownstreamResource.AzureDevOps,
                await adoProbe,
                projects => $"{projects.Count} project(s) visible"),
            Dataverse: Report(
                DownstreamResource.Dataverse,
                await dataverseProbe,
                // The systemuserid is the id every Dataverse write in this domain is
                // stamped with, and the only id space the engagement rows use.
                who => $"systemuserid {who.UserId}"));
    }

    private BackendStatus Report<T>(
        DownstreamResource resource,
        BackendResult<T> result,
        Func<T, string> describe)
    {
        if (result.Ok)
        {
            return BackendStatus.Ok(resource, describe(result.Value!));
        }

        logger.LogWarning("Probe of {Resource} failed: {Failure}", resource, result.Failure);
        return BackendStatus.Failed(resource, result.Failure!);
    }

    private sealed record DataverseWhoAmI(string? UserId);

    private sealed record AdoProjectList(int Count);

    public sealed record WhoAmIResult(
        [property: JsonPropertyName("authMode")] string AuthMode,
        [property: JsonPropertyName("authenticated")] bool Authenticated,
        [property: JsonPropertyName("azureDevOps")] BackendStatus AzureDevOps,
        [property: JsonPropertyName("dataverse")] BackendStatus Dataverse);
}
