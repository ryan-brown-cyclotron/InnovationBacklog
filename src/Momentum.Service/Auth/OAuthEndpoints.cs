using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Http.Extensions;
using Microsoft.AspNetCore.WebUtilities;
using Momentum.Service.Auth;

namespace Momentum.Service.Auth;

public static class OAuthEndpoints
{
    private static readonly Dictionary<string, ClientRegistration> _clients = new();
    private static readonly Dictionary<string, AuthSession> _sessions = new();
    private static readonly Dictionary<string, AuthCodeEntry> _authCodes = new();
    private static readonly Dictionary<string, (ClientMetadataDocument Metadata, DateTimeOffset ExpiresAt)> _cimdCache = new();

    private static readonly HttpClient _httpClient = new();

    private const int CimdMaxBytes = 5 * 1024;
    private static readonly TimeSpan CimdMaxCache = TimeSpan.FromMinutes(10);
    private static readonly TimeSpan CimdFetchTimeout = TimeSpan.FromSeconds(5);

    public static IEndpointRouteBuilder MapOAuthEndpoints(this IEndpointRouteBuilder app, AuthConfig config)
    {
        var preRegisteredClients = config.PreRegisteredClients.ToDictionary(c => c.ClientId, c => c);

        // Protected Resource Metadata (RFC 9728)
        app.MapGet("/.well-known/oauth-protected-resource", (HttpRequest req) =>
        {
            var resourceUrl = BaseUrl(req);
            return Results.Ok(new { resource = resourceUrl, authorization_servers = new[] { resourceUrl }, bearer_methods_supported = new[] { "header" }, scopes_supported = new[] { "context-intake" } });
        });

        app.MapGet("/.well-known/oauth-protected-resource/{*path}", (HttpRequest req, string path) =>
        {
            var baseUrl = BaseUrl(req);
            var resourceUrl = $"{baseUrl}/{path.TrimStart('/')}";
            return Results.Ok(new { resource = resourceUrl, authorization_servers = new[] { baseUrl }, bearer_methods_supported = new[] { "header" }, scopes_supported = new[] { "context-intake" } });
        });

        // Authorization Server Metadata (RFC 8414)
        app.MapGet("/.well-known/oauth-authorization-server", (HttpRequest req) =>
        {
            var baseUrl = BaseUrl(req);
            return Results.Ok(new
            {
                issuer = baseUrl,
                authorization_endpoint = $"{baseUrl}/authorize",
                token_endpoint = $"{baseUrl}/token",
                registration_endpoint = $"{baseUrl}/register",
                client_id_metadata_document_supported = true,
                response_types_supported = new[] { "code" },
                grant_types_supported = new[] { "authorization_code", "refresh_token" },
                code_challenge_methods_supported = new[] { "S256" },
                scopes_supported = new[] { "context-intake" }
            });
        });

        // Dynamic Client Registration (RFC 7591)
        app.MapPost("/register", async (HttpRequest req) =>
        {
            using var document = await JsonDocument.ParseAsync(req.Body);
            var root = document.RootElement;

            if (!root.TryGetProperty("redirect_uris", out var redirectUrisProp) || redirectUrisProp.GetArrayLength() == 0)
            {
                return Results.BadRequest(new { error = "invalid_request", error_description = "redirect_uris required" });
            }

            var redirectUris = redirectUrisProp.EnumerateArray().Select(p => p.GetString()).OfType<string>().Where(s => !string.IsNullOrWhiteSpace(s)).ToList();
            if (redirectUris.Count == 0)
            {
                return Results.BadRequest(new { error = "invalid_request", error_description = "redirect_uris required" });
            }

            var clientName = root.TryGetProperty("client_name", out var nameProp) ? nameProp.GetString() : null;
            var clientId = RandomId("mcp");
            _clients[clientId] = new ClientRegistration(clientId, redirectUris, clientName, DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());

            return Results.Created($"/register/{clientId}", new { client_id = clientId, client_name = clientName, redirect_uris = redirectUris });
        });

        // Authorization Endpoint
        app.MapGet("/authorize", async (HttpRequest req) =>
        {
            var clientId = req.Query["client_id"].FirstOrDefault();
            var redirectUri = req.Query["redirect_uri"].FirstOrDefault();
            var responseType = req.Query["response_type"].FirstOrDefault();
            var codeChallenge = req.Query["code_challenge"].FirstOrDefault();
            var codeChallengeMethod = req.Query["code_challenge_method"].FirstOrDefault();
            var state = req.Query["state"].FirstOrDefault();

            if (responseType != "code")
            {
                return Results.BadRequest(new { error = "unsupported_response_type" });
            }

            if (string.IsNullOrEmpty(clientId))
            {
                return Results.BadRequest(new { error = "invalid_request", error_description = "client_id required" });
            }

            if (string.IsNullOrEmpty(redirectUri))
            {
                return Results.BadRequest(new { error = "invalid_request", error_description = "redirect_uri required" });
            }

            if (string.IsNullOrEmpty(codeChallenge) || codeChallengeMethod != "S256")
            {
                return Results.BadRequest(new { error = "invalid_request", error_description = "PKCE S256 required" });
            }

            OAuthClientMode authMode;
            if (preRegisteredClients.TryGetValue(clientId, out var preRegistered))
            {
                authMode = OAuthClientMode.PreRegistered;
                if (!preRegistered.RedirectUris.Contains(redirectUri))
                {
                    return Results.BadRequest(new { error = "invalid_redirect_uri", error_description = "redirect_uri is not allowed for this client" });
                }
            }
            else if (IsCimdClientId(clientId))
            {
                authMode = OAuthClientMode.Cimd;
                var metadata = await FetchCimdMetadataAsync(clientId);
                if (metadata is null)
                {
                    return Results.BadRequest(new { error = "invalid_client", error_description = "Unable to resolve client metadata" });
                }
                if (!metadata.RedirectUris.Contains(redirectUri))
                {
                    return Results.BadRequest(new { error = "invalid_redirect_uri", error_description = "redirect_uri is not listed in client metadata" });
                }
            }
            else
            {
                authMode = OAuthClientMode.Dcr;
                if (!_clients.TryGetValue(clientId, out var registration))
                {
                    return Results.BadRequest(new { error = "invalid_client", error_description = "Unknown client" });
                }
                if (!registration.RedirectUris.Contains(redirectUri))
                {
                    return Results.BadRequest(new { error = "invalid_redirect_uri", error_description = "redirect_uri does not match registration" });
                }
            }

            var upstreamState = RandomId("state");
            _sessions[upstreamState] = new AuthSession(clientId, redirectUri, state ?? "", authMode, codeChallenge, codeChallengeMethod, upstreamState, DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());

            var upstream = ResolveUpstream(config, req);
            var callbackUrl = ProxyCallbackUrl(req, upstream.RedirectUri);
            var query = new Dictionary<string, string?>
            {
                ["client_id"] = upstream.ClientId,
                ["response_type"] = "code",
                ["redirect_uri"] = callbackUrl,
                ["scope"] = upstream.Scope,
                ["state"] = upstreamState,
                ["response_mode"] = "query"
            };
            if (!string.IsNullOrEmpty(upstream.Audience))
            {
                query["audience"] = upstream.Audience;
            }

            var url = QueryHelpers.AddQueryString(upstream.AuthorizeUrl, query);
            return Results.Redirect(url);
        });

        // OAuth Callback
        app.MapGet("/oauth/callback", async (HttpRequest req) =>
        {
            var code = req.Query["code"].FirstOrDefault();
            var state = req.Query["state"].FirstOrDefault();
            var error = req.Query["error"].FirstOrDefault();
            var errorDescription = req.Query["error_description"].FirstOrDefault();

            if (!string.IsNullOrEmpty(error))
            {
                return Results.BadRequest(new { error, error_description = errorDescription });
            }

            if (string.IsNullOrEmpty(state) || !_sessions.TryGetValue(state, out var session))
            {
                return Results.BadRequest(new { error = "invalid_state", error_description = "Unknown or expired session" });
            }
            _sessions.Remove(state);

            var upstream = ResolveUpstream(config, req);
            var callbackUrl = ProxyCallbackUrl(req, upstream.RedirectUri);

            var tokenParams = new Dictionary<string, string?>
            {
                ["client_id"] = upstream.ClientId,
                ["client_secret"] = upstream.ClientSecret,
                ["grant_type"] = "authorization_code",
                ["code"] = code,
                ["redirect_uri"] = callbackUrl,
                ["scope"] = upstream.Scope
            };
            if (!string.IsNullOrEmpty(upstream.Audience))
            {
                tokenParams["audience"] = upstream.Audience;
            }

            try
            {
                var response = await _httpClient.PostAsync(upstream.TokenUrl, new FormUrlEncodedContent(tokenParams!), req.HttpContext.RequestAborted);
                if (!response.IsSuccessStatusCode)
                {
                    var body = await response.Content.ReadAsStringAsync(req.HttpContext.RequestAborted);
                    return Results.Json(new { error = "token_exchange_failed", details = body }, statusCode: (int)response.StatusCode);
                }

                var tokens = await response.Content.ReadFromJsonAsync<UpstreamTokenResponse>(req.HttpContext.RequestAborted);
                if (tokens?.AccessToken is null)
                {
                    return Results.BadRequest(new { error = "token_exchange_failed", error_description = "No access_token in response" });
                }

                var mcpCode = RandomId("code");
                _authCodes[mcpCode] = new AuthCodeEntry(tokens.AccessToken, tokens.RefreshToken, DateTimeOffset.UtcNow.AddSeconds(tokens.ExpiresIn).ToUnixTimeMilliseconds(), session.McpClientId, session.OAuthClientMode, session.CodeChallenge);

                var redirectUrl = new UriBuilder(session.McpRedirectUri);
                var qb = new QueryBuilder();
                qb.Add("code", mcpCode);
                if (!string.IsNullOrEmpty(session.McpState))
                {
                    qb.Add("state", session.McpState);
                }
                redirectUrl.Query = qb.ToQueryString().ToString().TrimStart('?');

                return Results.Redirect(redirectUrl.ToString());
            }
            catch (Exception ex)
            {
                return Results.BadRequest(new { error = "token_exchange_failed", description = ex.Message });
            }
        });

        // Token Endpoint
        app.MapPost("/token", (HttpRequest req) =>
        {
            var grantType = req.Form["grant_type"].FirstOrDefault();
            var code = req.Form["code"].FirstOrDefault();
            var codeVerifier = req.Form["code_verifier"].FirstOrDefault();
            var clientId = req.Form["client_id"].FirstOrDefault();
            var clientSecret = req.Form["client_secret"].FirstOrDefault();

            if (grantType != "authorization_code")
            {
                return Results.BadRequest(new { error = "unsupported_grant_type" });
            }

            if (string.IsNullOrEmpty(code) || string.IsNullOrEmpty(codeVerifier))
            {
                return Results.BadRequest(new { error = "invalid_request", error_description = "code and code_verifier required" });
            }

            if (!_authCodes.TryGetValue(code, out var entry))
            {
                return Results.BadRequest(new { error = "invalid_grant", error_description = "Unknown or expired code" });
            }
            _authCodes.Remove(code);

            if (!string.IsNullOrEmpty(clientId) && clientId != entry.McpClientId)
            {
                return Results.Unauthorized();
            }

            if (entry.OAuthClientMode == OAuthClientMode.PreRegistered && preRegisteredClients.TryGetValue(entry.McpClientId, out var preRegistered))
            {
                if (!string.IsNullOrEmpty(preRegistered.ClientSecret) && clientSecret != preRegistered.ClientSecret)
                {
                    return Results.Unauthorized();
                }
            }

            var computedChallenge = ComputeS256Challenge(codeVerifier);
            if (computedChallenge != entry.CodeChallenge)
            {
                return Results.BadRequest(new { error = "invalid_grant", error_description = "PKCE verification failed" });
            }

            var expiresIn = Math.Max(1, (int)((entry.ExpiresAt - DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()) / 1000));
            var response = new Dictionary<string, object>
            {
                ["access_token"] = entry.AccessToken,
                ["token_type"] = "Bearer",
                ["expires_in"] = expiresIn
            };
            if (!string.IsNullOrEmpty(entry.RefreshToken))
            {
                response["refresh_token"] = entry.RefreshToken;
            }

            return Results.Ok(response);
        });

        return app;
    }

    private static string BaseUrl(HttpRequest req)
    {
        var proto = req.Headers["X-Forwarded-Proto"].FirstOrDefault() ?? req.Scheme;
        var host = req.Headers["X-Forwarded-Host"].FirstOrDefault() ?? req.Host.ToString();
        return $"{proto}://{host}";
    }

    private static string RandomId(string prefix)
    {
        return $"{prefix}_{Convert.ToHexString(RandomNumberGenerator.GetBytes(16))}";
    }

    private static string ProxyCallbackUrl(HttpRequest req, string? configRedirectUri)
    {
        return configRedirectUri ?? $"{BaseUrl(req)}/oauth/callback";
    }

    private static bool IsCimdClientId(string clientId) => clientId.StartsWith("https://", StringComparison.OrdinalIgnoreCase);

    private static string ComputeS256Challenge(string verifier)
    {
        var hash = SHA256.HashData(Encoding.UTF8.GetBytes(verifier));
        return Base64UrlEncode(hash);
    }

    private static string Base64UrlEncode(byte[] input)
    {
        return Convert.ToBase64String(input).TrimEnd('=').Replace('+', '-').Replace('/', '_');
    }

    private static UpstreamEndpoints ResolveUpstream(AuthConfig config, HttpRequest req)
    {
        if (config.Entra is not null)
        {
            var e = config.Entra;
            var baseUrl = $"{e.Instance.TrimEnd('/')}/{e.TenantId}";
            var resource = $"api://{e.ClientId}";
            return new UpstreamEndpoints(
                $"{baseUrl}/oauth2/v2.0/authorize",
                $"{baseUrl}/oauth2/v2.0/token",
                e.ClientId,
                e.ClientSecret,
                $"{resource}/context-intake openid offline_access",
                e.Audience,
                e.RedirectUri);
        }

        if (config.OAuth is not null)
        {
            var o = config.OAuth;
            var discovery = DiscoverOidc(o.IssuerUrl).GetAwaiter().GetResult();
            return new UpstreamEndpoints(
                discovery.AuthorizationEndpoint,
                discovery.TokenEndpoint,
                o.ClientId,
                o.ClientSecret,
                o.Scopes,
                o.Audience,
                o.RedirectUri);
        }

        throw new InvalidOperationException("No auth config for OAuth proxy.");
    }

    private static async Task<OidcDiscovery> DiscoverOidc(string issuerUrl)
    {
        var url = $"{issuerUrl.TrimEnd('/')}/.well-known/openid-configuration";
        var response = await _httpClient.GetAsync(url);
        response.EnsureSuccessStatusCode();
        return await response.Content.ReadFromJsonAsync<OidcDiscovery>()
            ?? throw new InvalidOperationException("Failed to parse OIDC discovery document.");
    }

    private static async Task<ClientMetadataDocument?> FetchCimdMetadataAsync(string clientId)
    {
        var now = DateTimeOffset.UtcNow;
        if (_cimdCache.TryGetValue(clientId, out var cached) && cached.ExpiresAt > now)
        {
            return cached.Metadata;
        }

        if (!Uri.TryCreate(clientId, UriKind.Absolute, out var uri) || uri.Scheme != Uri.UriSchemeHttps)
        {
            return null;
        }

        try
        {
            using var cts = new CancellationTokenSource(CimdFetchTimeout);
            var response = await _httpClient.GetAsync(clientId, cts.Token);
            if (response.StatusCode != System.Net.HttpStatusCode.OK)
            {
                return null;
            }

            var body = await response.Content.ReadAsStringAsync(cts.Token);
            if (Encoding.UTF8.GetByteCount(body) > CimdMaxBytes)
            {
                return null;
            }

            var metadata = JsonSerializer.Deserialize<ClientMetadataDocument>(body);
            if (metadata is null || metadata.ClientId != clientId || metadata.RedirectUris.Count == 0)
            {
                return null;
            }

            var maxAge = response.Headers.CacheControl?.MaxAge ?? CimdMaxCache;
            _cimdCache[clientId] = (metadata, now.Add(maxAge));
            return metadata;
        }
        catch
        {
            return null;
        }
    }

    private sealed record UpstreamEndpoints(
        string AuthorizeUrl,
        string TokenUrl,
        string ClientId,
        string ClientSecret,
        string Scope,
        string? Audience,
        string? RedirectUri);

    private sealed record OidcDiscovery(string Issuer, string AuthorizationEndpoint, string TokenEndpoint, string JwksUri);

    private sealed record ClientMetadataDocument(
        string ClientId,
        string? ClientName,
        List<string> RedirectUris,
        string? TokenEndpointAuthMethod);

    private sealed record ClientRegistration(
        string ClientId,
        List<string> RedirectUris,
        string? ClientName,
        long RegisteredAt);

    private sealed record AuthSession(
        string McpClientId,
        string McpRedirectUri,
        string McpState,
        OAuthClientMode OAuthClientMode,
        string CodeChallenge,
        string CodeChallengeMethod,
        string UpstreamState,
        long CreatedAt);

    private sealed record AuthCodeEntry(
        string AccessToken,
        string? RefreshToken,
        long ExpiresAt,
        string McpClientId,
        OAuthClientMode OAuthClientMode,
        string CodeChallenge);

    private sealed record UpstreamTokenResponse
    {
        [System.Text.Json.Serialization.JsonPropertyName("access_token")]
        public string AccessToken { get; init; } = string.Empty;

        [System.Text.Json.Serialization.JsonPropertyName("refresh_token")]
        public string? RefreshToken { get; init; }

        [System.Text.Json.Serialization.JsonPropertyName("expires_in")]
        public int ExpiresIn { get; init; }
    }
}

public enum OAuthClientMode
{
    PreRegistered,
    Cimd,
    Dcr
}
