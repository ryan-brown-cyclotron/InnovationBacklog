namespace Momentum.Mcp.Auth;

/// <summary>
/// The two backends this server talks to. They are separate values rather than a
/// single "downstream" because OBO issues a token per resource audience — Dataverse
/// and Azure DevOps are two exchanges with two lifetimes and two cache entries, never
/// one token used twice.
/// </summary>
public enum DownstreamResource
{
    Dataverse,
    AzureDevOps,
}

public static class DownstreamResources
{
    /// <summary>
    /// Azure DevOps' resource id. Permanent and identical in every tenant.
    /// </summary>
    public const string AzureDevOpsResourceId = "499b84ac-1321-427f-aa17-267ca6975798";

    /// <summary>
    /// Azure DevOps scope, requested on its own. Bundling it with the default OpenID
    /// scopes (openid/profile/offline_access/User.Read) is a documented way to get a
    /// token back carrying the Microsoft Graph audience instead of ADO's.
    /// </summary>
    public const string AzureDevOpsScope = $"{AzureDevOpsResourceId}/.default";
}
