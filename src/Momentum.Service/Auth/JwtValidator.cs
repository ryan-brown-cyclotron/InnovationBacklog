using System.IdentityModel.Tokens.Jwt;
using Microsoft.IdentityModel.Tokens;
using Momentum.Contracts;

namespace Momentum.Service.Auth;

public sealed class ValidatedToken
{
    public JwtSecurityToken Jwt { get; }
    public string Sub { get; }
    public string Email { get; }
    public string? DisplayName { get; }

    public ValidatedToken(JwtSecurityToken jwt, string sub, string email, string? displayName)
    {
        Jwt = jwt;
        Sub = sub;
        Email = email;
        DisplayName = displayName;
    }
}

public sealed class JwtValidator
{
    private static readonly TimeSpan JwksCacheTtl = TimeSpan.FromHours(1);
    private static readonly HttpClient _discoveryHttpClient = new();
    private static readonly Dictionary<string, (OidcDiscovery Discovery, DateTimeOffset FetchedAt)> _discoveryCache = new();

    private readonly HttpClient _httpClient;
    private readonly Dictionary<string, (JsonWebKeySet Keys, DateTimeOffset FetchedAt)> _jwksCache = new();

    public JwtValidator(HttpClient httpClient)
    {
        _httpClient = httpClient;
    }

    public async Task<ValidatedToken> ValidateAsync(string token, AuthConfig config, CancellationToken cancellationToken = default)
    {
        var handler = new JwtSecurityTokenHandler();
        var jwt = handler.ReadJwtToken(token);

        SecurityKey issuerSigningKey;
        string expectedAudience;
        string expectedIssuer;
        string emailClaim;

        if (config.Entra is not null)
        {
            var entra = config.Entra;
            var metadataUrl = $"{entra.Instance.TrimEnd('/')}/{entra.TenantId}/v2.0/.well-known/openid-configuration";
            var discovery = await DiscoverOidcAsync(metadataUrl, _httpClient, cancellationToken);
            var jwks = await GetJwksAsync(discovery.JwksUri, cancellationToken);
            issuerSigningKey = ResolveKey(jwks, jwt.Header.Kid);
            expectedAudience = entra.Audience;
            expectedIssuer = discovery.Issuer;
            emailClaim = "email";
        }
        else if (config.OAuth is not null)
        {
            var oauth = config.OAuth;
            var discovery = await DiscoverOidcAsync($"{oauth.IssuerUrl.TrimEnd('/')}/.well-known/openid-configuration", _httpClient, cancellationToken);
            var jwks = await GetJwksAsync(discovery.JwksUri, cancellationToken);
            issuerSigningKey = ResolveKey(jwks, jwt.Header.Kid);
            expectedAudience = oauth.Audience;
            expectedIssuer = discovery.Issuer;
            emailClaim = oauth.EmailClaim;
        }
        else
        {
            throw new InvalidOperationException("No auth config provided for token validation.");
        }

        var validationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidIssuer = expectedIssuer,
            ValidateAudience = true,
            ValidAudience = expectedAudience,
            ValidateLifetime = true,
            ClockSkew = TimeSpan.FromMinutes(5),
            IssuerSigningKey = issuerSigningKey,
            ValidateIssuerSigningKey = true,
        };

        handler.ValidateToken(token, validationParameters, out _);

        var email = ExtractEmail(jwt, emailClaim);
        var displayName = ExtractDisplayName(jwt);

        return new ValidatedToken(jwt, jwt.Subject, email, displayName);
    }

    private static SecurityKey ResolveKey(JsonWebKeySet jwks, string kid)
    {
        var key = jwks.GetSigningKeys().FirstOrDefault(k => k.KeyId == kid)
            ?? throw new SecurityTokenException($"Signing key {kid} not found in JWKS.");
        return key;
    }

    public static async Task<OidcDiscovery> DiscoverOidcAsync(string metadataUrl, HttpClient? httpClient = null, CancellationToken cancellationToken = default)
    {
        var client = httpClient ?? _discoveryHttpClient;
        var now = DateTimeOffset.UtcNow;
        lock (_discoveryCache)
        {
            if (_discoveryCache.TryGetValue(metadataUrl, out var cached) && now - cached.FetchedAt < JwksCacheTtl)
            {
                return cached.Discovery;
            }
        }

        var response = await client.GetAsync(metadataUrl, cancellationToken);
        response.EnsureSuccessStatusCode();

        var discovery = await response.Content.ReadFromJsonAsync<OidcDiscovery>(cancellationToken)
            ?? throw new InvalidOperationException("Failed to parse OIDC discovery document.");

        lock (_discoveryCache)
        {
            _discoveryCache[metadataUrl] = (discovery, now);
        }
        return discovery;
    }

    private async Task<JsonWebKeySet> GetJwksAsync(string jwksUri, CancellationToken cancellationToken)
    {
        var now = DateTimeOffset.UtcNow;
        if (_jwksCache.TryGetValue(jwksUri, out var cached) && now - cached.FetchedAt < JwksCacheTtl)
        {
            return cached.Keys;
        }

        var response = await _httpClient.GetAsync(jwksUri, cancellationToken);
        response.EnsureSuccessStatusCode();
        var json = await response.Content.ReadAsStringAsync(cancellationToken);
        var jwks = new JsonWebKeySet(json);

        _jwksCache[jwksUri] = (jwks, now);
        return jwks;
    }

    private static string ExtractEmail(JwtSecurityToken jwt, string emailClaim)
    {
        var candidates = new[] { emailClaim, "email", "preferred_username", "upn" };
        foreach (var claim in candidates)
        {
            var value = jwt.Claims.FirstOrDefault(c => c.Type == claim)?.Value;
            if (!string.IsNullOrEmpty(value) && value.Contains('@'))
            {
                return value;
            }
        }

        var configuredValue = jwt.Claims.FirstOrDefault(c => c.Type == emailClaim)?.Value;
        if (!string.IsNullOrEmpty(configuredValue))
        {
            return configuredValue;
        }

        return jwt.Subject;
    }

    private static string? ExtractDisplayName(JwtSecurityToken jwt)
    {
        return jwt.Claims.FirstOrDefault(c => c.Type == "name")?.Value
            ?? jwt.Claims.FirstOrDefault(c => c.Type == "given_name")?.Value;
    }

    public sealed record OidcDiscovery(string Issuer, string AuthorizationEndpoint, string TokenEndpoint, string JwksUri);
}
