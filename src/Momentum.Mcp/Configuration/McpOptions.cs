using System.ComponentModel.DataAnnotations;

namespace Momentum.Mcp.Configuration;

/// <summary>
/// How the server obtains downstream tokens.
/// </summary>
public enum McpAuthMode
{
    /// <summary>
    /// Production. Exchange the caller's inbound token for a downstream token per
    /// resource. The inbound token is never forwarded.
    /// </summary>
    Obo,

    /// <summary>
    /// Development only. Borrow the signed-in Azure CLI user's tokens, so tools can be
    /// written and exercised before the Entra app registration exists.
    /// </summary>
    DevCli,
}

/// <summary>
/// Everything the server needs to reach its two backends. Bound from the
/// <c>Momentum:Mcp</c> configuration section and validated at startup — a missing
/// environment URL should stop the host, not surface as a confusing 404 on the first
/// tool call.
/// </summary>
public sealed class McpOptions
{
    public const string SectionName = "Momentum:Mcp";

    /// <summary>
    /// Dataverse environment URL, e.g. <c>https://org9ceb01a6.crm.dynamics.com</c>.
    /// The OBO audience is this URL, so each environment is a distinct downstream target.
    /// </summary>
    [Required(AllowEmptyStrings = false)]
    [Url]
    public string DataverseEnvironmentUrl { get; set; } = string.Empty;

    /// <summary>Azure DevOps organization name (not a URL), e.g. <c>CyclotronInc</c>.</summary>
    [Required(AllowEmptyStrings = false)]
    public string AdoOrganization { get; set; } = string.Empty;

    /// <summary>Default Azure DevOps project for work item queries.</summary>
    [Required(AllowEmptyStrings = false)]
    public string AdoProject { get; set; } = string.Empty;

    public McpAuthMode AuthMode { get; set; } = McpAuthMode.Obo;

    /// <summary>
    /// Client id of the MCP server's own app registration — the one whose audience the
    /// inbound token carries. Required when <see cref="AuthMode"/> is
    /// <see cref="McpAuthMode.Obo"/>; unused under <see cref="McpAuthMode.DevCli"/>.
    /// </summary>
    public string? ClientId { get; set; }

    /// <summary>Entra tenant id hosting the registration above.</summary>
    public string? TenantId { get; set; }

    /// <summary>
    /// Dataverse Web API root, derived rather than configured so a trailing slash in
    /// <see cref="DataverseEnvironmentUrl"/> cannot produce a double slash.
    /// </summary>
    public Uri DataverseApiRoot =>
        new($"{DataverseEnvironmentUrl.TrimEnd('/')}/api/data/v9.2/");

    public Uri AdoApiRoot => new($"https://dev.azure.com/{AdoOrganization}/");

    /// <summary>
    /// OBO scope for Dataverse. Per-environment, because the audience is the org URL.
    /// </summary>
    public string DataverseScope => $"{DataverseEnvironmentUrl.TrimEnd('/')}/.default";
}
