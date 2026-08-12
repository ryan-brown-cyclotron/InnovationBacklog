using Azure.Core;
using Azure.Identity;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Microsoft.Identity.Client;
using Momentum.Mcp.Configuration;

namespace Momentum.Mcp.Auth;

/// <summary>
/// Exchanges the caller's inbound token for a downstream token, once per resource.
/// </summary>
/// <remarks>
/// Two exchanges, never one. An OBO token carries a single resource audience, so
/// Dataverse and Azure DevOps are separate round trips with separate lifetimes.
/// <para>
/// The Azure DevOps scope is requested on its own, with no OpenID scopes alongside it.
/// Bundling it with <c>openid</c>/<c>profile</c>/<c>offline_access</c>/<c>User.Read</c>
/// is a documented way to get a token back carrying the Microsoft Graph audience
/// instead of Azure DevOps'.
/// </para>
/// <para>
/// The client credential is the Function App's managed identity used as a federated
/// identity credential, so no secret is deployed. MSAL asks for the assertion on
/// demand and caches it itself.
/// </para>
/// </remarks>
public sealed class OboTokenProvider : IDownstreamTokenProvider
{
    /// <summary>
    /// The audience Entra expects on a federated credential assertion. Fixed string,
    /// not a tenant- or app-specific value.
    /// </summary>
    private static readonly TokenRequestContext FederatedAssertionRequest =
        new(["api://AzureADTokenExchange/.default"]);

    private readonly McpOptions _options;
    private readonly ILogger<OboTokenProvider> _logger;
    private readonly Lazy<IConfidentialClientApplication> _app;
    private readonly TokenCredential _assertionCredential;

    public OboTokenProvider(
        IOptions<McpOptions> options,
        ILogger<OboTokenProvider> logger,
        TokenCredential? assertionCredential = null)
    {
        _options = options.Value;
        _logger = logger;
        _assertionCredential = assertionCredential ?? new DefaultAzureCredential();
        _app = new Lazy<IConfidentialClientApplication>(BuildApplication);
    }

    public async Task<AccessToken> GetTokenAsync(
        DownstreamResource resource,
        CallerContext caller,
        CancellationToken cancellationToken = default)
    {
        if (!caller.HasInboundToken)
        {
            throw new DownstreamTokenException(
                resource,
                "No inbound bearer token on the request, so there is nothing to exchange. " +
                "Enable App Service Authentication on the function app, or set " +
                $"{McpOptions.SectionName}:AuthMode to DevCli for local development.");
        }

        var scope = ScopeFor(resource);

        try
        {
            var result = await _app.Value
                .AcquireTokenOnBehalfOf([scope], new UserAssertion(caller.InboundToken!))
                .ExecuteAsync(cancellationToken);

            _logger.LogDebug(
                "Acquired {Resource} token for session {SessionId} from {Source}.",
                resource, caller.SessionId, result.AuthenticationResultMetadata.TokenSource);

            return new AccessToken(result.AccessToken, result.ExpiresOn);
        }
        catch (MsalException ex)
        {
            /*
                The two failures worth telling apart in the message: consent not yet
                granted on the app registration (nothing the user can do), and the user
                genuinely lacking access (a 403 waiting to happen downstream).
            */
            throw new DownstreamTokenException(
                resource,
                $"On-behalf-of exchange for {resource} failed ({ex.ErrorCode}). " +
                "Check that the delegated permission is admin-consented on the MCP app " +
                "registration and that the caller has access to the resource.",
                ex);
        }
    }

    private string ScopeFor(DownstreamResource resource) => resource switch
    {
        DownstreamResource.Dataverse => _options.DataverseScope,
        DownstreamResource.AzureDevOps => DownstreamResources.AzureDevOpsScope,
        _ => throw new ArgumentOutOfRangeException(nameof(resource)),
    };

    private IConfidentialClientApplication BuildApplication()
    {
        if (string.IsNullOrWhiteSpace(_options.ClientId) || string.IsNullOrWhiteSpace(_options.TenantId))
        {
            throw new InvalidOperationException(
                $"{McpOptions.SectionName}:ClientId and :TenantId are required when AuthMode is Obo.");
        }

        return ConfidentialClientApplicationBuilder
            .Create(_options.ClientId)
            .WithAuthority(AzureCloudInstance.AzurePublic, _options.TenantId)
            .WithClientAssertion(async ct =>
            {
                var assertion = await _assertionCredential.GetTokenAsync(FederatedAssertionRequest, ct);
                return assertion.Token;
            })
            .Build();
    }
}
