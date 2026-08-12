using System.Net.Http.Headers;

namespace Momentum.Mcp.Auth;

/// <summary>
/// Attaches the calling user's downstream token to every request on the client it is
/// registered against.
/// </summary>
/// <remarks>
/// Used by the skill intake clients, whose adapter takes a plain <see cref="HttpClient"/>
/// so the same adapter can serve a user-delegated call or a service-identity one without
/// knowing which it is. The caller comes from the scoped accessor, set once at the top of
/// the request.
/// </remarks>
public sealed class CallerTokenHandler(
    IDownstreamTokenProvider tokens,
    CallerContextAccessor callers,
    DownstreamResource resource) : DelegatingHandler
{
    protected override async Task<HttpResponseMessage> SendAsync(
        HttpRequestMessage request, CancellationToken cancellationToken)
    {
        var token = await tokens.GetTokenAsync(resource, callers.Current, cancellationToken);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token.Token);

        return await base.SendAsync(request, cancellationToken);
    }
}
