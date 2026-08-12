using System.Security.Cryptography;
using System.Text;
using Azure.Core;
using Microsoft.Extensions.Caching.Memory;

namespace Momentum.Mcp.Auth;

/// <summary>
/// Caches downstream tokens per caller, per resource — two entries per user, with
/// independent expiry.
/// </summary>
/// <remarks>
/// Keyed on a hash of the inbound token rather than on a parsed user id, because the
/// key must change whenever the caller's own token is reissued: a token minted for a
/// different set of claims must not be answered from a previous exchange's cache.
/// Only tokens are cached here. Tool <em>results</em> reflect row-level access and are
/// never cached across users.
/// </remarks>
public sealed class CachingTokenProvider(IDownstreamTokenProvider inner, IMemoryCache cache)
    : IDownstreamTokenProvider
{
    /// <summary>
    /// Evict early so a token cannot expire between the cache hit and the downstream
    /// call it is about to authorize.
    /// </summary>
    private static readonly TimeSpan ExpiryMargin = TimeSpan.FromMinutes(1);

    public async Task<AccessToken> GetTokenAsync(
        DownstreamResource resource,
        CallerContext caller,
        CancellationToken cancellationToken = default)
    {
        var key = (Kind: nameof(CachingTokenProvider), Resource: resource, Caller: CallerKey(caller));

        if (cache.TryGetValue(key, out AccessToken cached))
        {
            return cached;
        }

        var token = await inner.GetTokenAsync(resource, caller, cancellationToken);

        var lifetime = token.ExpiresOn - DateTimeOffset.UtcNow - ExpiryMargin;
        if (lifetime > TimeSpan.Zero)
        {
            cache.Set(key, token, lifetime);
        }

        return token;
    }

    private static string CallerKey(CallerContext caller)
    {
        if (!caller.HasInboundToken)
        {
            // Development (AzureCliTokenProvider) — one developer, one cache slot.
            return "anonymous";
        }

        var hash = SHA256.HashData(Encoding.UTF8.GetBytes(caller.InboundToken!));
        return Convert.ToHexStringLower(hash);
    }
}
