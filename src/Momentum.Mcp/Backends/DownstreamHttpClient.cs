using System.Net.Http.Headers;
using Momentum.Mcp.Auth;

namespace Momentum.Mcp.Backends;

/// <summary>
/// An <see cref="HttpClient"/> for one backend that stamps the caller's downstream
/// token onto every request.
/// </summary>
/// <remarks>
/// The token is attached here rather than in a <see cref="DelegatingHandler"/> because
/// which token to use depends on the caller, and the caller is passed explicitly rather
/// than held in ambient state. A handler would have to reach for an
/// <c>AsyncLocal</c> to find it.
/// </remarks>
public sealed class DownstreamHttpClient(HttpClient http, IDownstreamTokenProvider tokens, DownstreamResource resource)
{
    public DownstreamResource Resource { get; } = resource;

    public Uri? BaseAddress => http.BaseAddress;

    public async Task<HttpResponseMessage> SendAsync(
        HttpRequestMessage request,
        CallerContext caller,
        CancellationToken cancellationToken = default)
    {
        var token = await tokens.GetTokenAsync(Resource, caller, cancellationToken);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token.Token);

        return await http.SendAsync(request, cancellationToken);
    }

    public Task<HttpResponseMessage> GetAsync(
        string relativeUrl,
        CallerContext caller,
        CancellationToken cancellationToken = default) =>
        SendAsync(new HttpRequestMessage(HttpMethod.Get, relativeUrl), caller, cancellationToken);
}
