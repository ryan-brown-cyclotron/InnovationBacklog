using Azure.Core;
using Azure.Identity;
using Microsoft.Extensions.Options;
using Momentum.Mcp.Configuration;

namespace Momentum.Mcp.Auth;

/// <summary>
/// Development-only. Borrows the tokens of whoever is signed in to the Azure CLI,
/// ignoring the caller entirely.
/// </summary>
/// <remarks>
/// This exists so tools can be written and exercised before the Entra app registration
/// and its admin consent land. It is not an auth mode — every request runs as the
/// developer, not as the caller — so <c>AddMomentumMcp</c> refuses to register it
/// outside a Development host.
/// </remarks>
public sealed class AzureCliTokenProvider(IOptions<McpOptions> options) : IDownstreamTokenProvider
{
    private readonly McpOptions _options = options.Value;
    private readonly AzureCliCredential _credential = new();

    public async Task<AccessToken> GetTokenAsync(
        DownstreamResource resource,
        CallerContext caller,
        CancellationToken cancellationToken = default)
    {
        var scope = resource switch
        {
            DownstreamResource.Dataverse => _options.DataverseScope,
            DownstreamResource.AzureDevOps => DownstreamResources.AzureDevOpsScope,
            _ => throw new ArgumentOutOfRangeException(nameof(resource)),
        };

        try
        {
            return await _credential.GetTokenAsync(new TokenRequestContext([scope]), cancellationToken);
        }
        catch (CredentialUnavailableException ex)
        {
            throw new DownstreamTokenException(
                resource,
                $"Azure CLI has no token for {resource}. Run `az login` and try again.",
                ex);
        }
    }
}
