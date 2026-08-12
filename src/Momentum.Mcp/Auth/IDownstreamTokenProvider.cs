using Azure.Core;

namespace Momentum.Mcp.Auth;

/// <summary>
/// Supplies an access token for one backend, acting as the calling user.
/// </summary>
/// <remarks>
/// The caller's inbound token is never a valid return value here. It represents access
/// to this server and nothing else; forwarding it downstream is a known vulnerability
/// pattern. Every implementation must produce a <em>new</em> token whose audience is
/// the requested resource.
/// </remarks>
public interface IDownstreamTokenProvider
{
    Task<AccessToken> GetTokenAsync(
        DownstreamResource resource,
        CallerContext caller,
        CancellationToken cancellationToken = default);
}

/// <summary>
/// Thrown when a downstream token cannot be obtained. Distinct from a downstream 403:
/// this means we never got far enough to ask.
/// </summary>
public sealed class DownstreamTokenException(DownstreamResource resource, string message, Exception? inner = null)
    : Exception(message, inner)
{
    public DownstreamResource Resource { get; } = resource;
}
