using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.WebUtilities;
using Momentum.Contracts;

namespace Momentum.Service.Auth;

public static class WebAuthEndpoints
{
    internal const string SessionCookie = "momentum_session";
    private const string EnvPrefix = "MOMENTUM";
    private static readonly TimeSpan PkceLifetime = TimeSpan.FromMinutes(10);
    private static readonly Dictionary<string, PkceState> _pkceStore = new();
    private static readonly JsonSerializerOptions CaseInsensitiveJsonOptions = new() { PropertyNameCaseInsensitive = true };

    public static IEndpointRouteBuilder MapWebAuthEndpoints(this IEndpointRouteBuilder app, AuthConfig authConfig)
    {
        var sessionSecret = Environment.GetEnvironmentVariable($"{EnvPrefix}_SESSION_SECRET") ?? "dev-secret-change-me";

        // GET /api/auth/me
        app.MapGet("/api/auth/me", (HttpRequest req, HttpResponse res) =>
        {
            var token = req.Cookies[SessionCookie];
            if (string.IsNullOrEmpty(token)) return Results.Json(new { error = "no_session_cookie" }, statusCode: 401);
            var identity = VerifySessionToken(token, sessionSecret);
            return identity is null
                ? Results.Json(new { error = "invalid_or_expired_session" }, statusCode: 401)
                : Results.Ok(new { identity.User.Id, identity.User.Sub, identity.User.Email, identity.User.DisplayName, identity.Role });
        });

        if (authConfig.Mode == AuthMode.None)
        {
            // Dev mode: instant fake session. ?role= switches the signed-in role so
            // role-gated behaviour can be seen from both sides without a real IdP.
            // Dev mode only — the production flow below takes roles from the token.
            app.MapGet("/api/auth/login", (HttpResponse res, string? returnTo = null, string? role = null) =>
            {
                var devRole = role?.Trim().ToLowerInvariant() switch
                {
                    "submitter" => "submitter",
                    "approver" => "approver",
                    _ => "administrator"
                };
                var displayName = devRole switch
                {
                    "submitter" => "Dev Submitter",
                    "approver" => "Dev Approver",
                    _ => "Dev User"
                };
                SetSessionCookie(res, sessionSecret, "dev@localhost", "dev@localhost", displayName, devRole, isDev: true);
                return Results.Redirect(SafeReturnTo(returnTo));
            });

            app.MapPost("/api/auth/logout", (HttpResponse res) =>
            {
                res.Cookies.Delete(SessionCookie, new CookieOptions { Path = "/" });
                return Results.Ok(new { ok = true });
            });

            return app;
        }

        // Prod mode: PKCE flow
        app.MapGet("/api/auth/login", async (HttpRequest req, HttpResponse res) =>
        {
            var returnTo = SafeReturnTo(req.Query["returnTo"].FirstOrDefault());
            var cfg = authConfig.OAuth ?? (object?)authConfig.Entra;
            if (cfg is null) return Results.Problem("Auth not configured.");

            var issuer = authConfig.Mode == AuthMode.OAuth
                ? authConfig.OAuth!.IssuerUrl
                : $"{authConfig.Entra!.Instance.TrimEnd('/')}/{authConfig.Entra.TenantId}/v2.0";

            var discovery = await JwtValidator.DiscoverOidcAsync(issuer);

            var verifier = Base64UrlEncode(RandomNumberGenerator.GetBytes(32));
            var challenge = Base64UrlEncode(SHA256.HashData(Encoding.UTF8.GetBytes(verifier)));
            var state = Base64UrlEncode(RandomNumberGenerator.GetBytes(16));

            lock (_pkceStore)
            {
                PrunePkce();
                _pkceStore[state] = new PkceState(verifier, returnTo, DateTimeOffset.UtcNow.Add(PkceLifetime));
            }

            var clientId = authConfig.Mode == AuthMode.OAuth ? authConfig.OAuth!.ClientId : authConfig.Entra!.ClientId;
            var scopes = authConfig.Mode == AuthMode.OAuth ? authConfig.OAuth!.Scopes : "openid profile email";

            var redirectUri = $"{BaseUrl(req)}/api/auth/callback";

            var url = QueryHelpers.AddQueryString(discovery.AuthorizationEndpoint, new Dictionary<string, string?>
            {
                ["response_type"] = "code",
                ["client_id"] = clientId,
                ["redirect_uri"] = redirectUri,
                ["scope"] = scopes,
                ["state"] = state,
                ["code_challenge"] = challenge,
                ["code_challenge_method"] = "S256"
            });

            return Results.Redirect(url);
        });

        app.MapGet("/api/auth/callback", async (HttpRequest req, HttpResponse res) =>
        {
            var state = req.Query["state"].FirstOrDefault();
            var code = req.Query["code"].FirstOrDefault();

            if (string.IsNullOrEmpty(state) || string.IsNullOrEmpty(code))
            {
                return Results.BadRequest(new { error = "Missing state or code" });
            }

            PkceState? pkce;
            lock (_pkceStore)
            {
                if (!_pkceStore.TryGetValue(state!, out pkce) || pkce?.ExpiresAt < DateTimeOffset.UtcNow)
                {
                    _pkceStore.Remove(state!);
                    return Results.BadRequest(new { error = "Invalid or expired state" });
                }
                _pkceStore.Remove(state!);
            }

            if (pkce is null)
            {
                return Results.BadRequest(new { error = "Invalid or expired state" });
            }

            var issuer = authConfig.Mode == AuthMode.OAuth
                ? authConfig.OAuth!.IssuerUrl
                : $"{authConfig.Entra!.Instance.TrimEnd('/')}/{authConfig.Entra.TenantId}/v2.0";

            var discovery = await JwtValidator.DiscoverOidcAsync(issuer);

            var clientId = authConfig.Mode == AuthMode.OAuth ? authConfig.OAuth!.ClientId : authConfig.Entra!.ClientId;
            var clientSecret = authConfig.Mode == AuthMode.OAuth ? authConfig.OAuth!.ClientSecret : authConfig.Entra!.ClientSecret;
            var redirectUri = $"{BaseUrl(req)}/api/auth/callback";

            var response = await new HttpClient().PostAsync(discovery.TokenEndpoint, new FormUrlEncodedContent(new Dictionary<string, string?>
            {
                ["grant_type"] = "authorization_code",
                ["code"] = code,
                ["redirect_uri"] = redirectUri,
                ["client_id"] = clientId,
                ["client_secret"] = clientSecret,
                ["code_verifier"] = pkce.CodeVerifier
            }), req.HttpContext.RequestAborted);

            if (!response.IsSuccessStatusCode)
            {
                var body = await response.Content.ReadAsStringAsync(req.HttpContext.RequestAborted);
                return Results.Problem($"Token exchange failed: {body}");
            }

            var tokens = await response.Content.ReadFromJsonAsync<TokenResponse>(req.HttpContext.RequestAborted);
            if (string.IsNullOrEmpty(tokens?.IdToken))
            {
                return Results.Problem("No id_token in response.");
            }

            var claims = DecodeIdTokenClaims(tokens.IdToken);
            if (claims is null)
            {
                return Results.Problem("Invalid id_token.");
            }

            var emailClaim = authConfig.Mode == AuthMode.OAuth ? authConfig.OAuth!.EmailClaim : "email";
            var email = ExtractEmail(claims, emailClaim);
            if (string.IsNullOrEmpty(email))
            {
                return Results.Problem("No email in token claims.");
            }

            var sub = claims.TryGetValue("sub", out var subValue) && subValue is string s ? s : email;
            var displayName = claims.TryGetValue("name", out var nameValue) && nameValue is string n ? n : email;
            var role = ExtractRole(claims);

            SetSessionCookie(res, sessionSecret, sub, email, displayName, role, isDev: false);
            return Results.Redirect(pkce.ReturnTo);
        });

        app.MapPost("/api/auth/logout", (HttpResponse res) =>
        {
            res.Cookies.Delete(SessionCookie, new CookieOptions { Path = "/" });
            return Results.Ok(new { ok = true });
        });

        return app;
    }

    private static string BaseUrl(HttpRequest req)
    {
        var proto = req.Headers["X-Forwarded-Proto"].FirstOrDefault() ?? req.Scheme;
        var host = req.Headers["X-Forwarded-Host"].FirstOrDefault() ?? req.Host.ToString();
        return $"{proto}://{host}";
    }

    private static string SafeReturnTo(string? raw)
    {
        if (!string.IsNullOrEmpty(raw) && raw.StartsWith('/')) return raw;
        return "/";
    }

    private static void SetSessionCookie(HttpResponse res, string secret, string sub, string email, string displayName, string role, bool isDev)
    {
        var exp = DateTimeOffset.UtcNow.AddDays(7).ToUnixTimeSeconds();
        var payload = JsonSerializer.Serialize(new { sub, email, displayName, role, exp });
        var body = Base64UrlEncode(Encoding.UTF8.GetBytes(payload));
        var sig = HmacSha256(secret, body);
        var token = $"{body}.{sig}";

        res.Cookies.Append(SessionCookie, token, new CookieOptions
        {
            HttpOnly = true,
            Secure = !isDev,
            SameSite = isDev ? SameSiteMode.Lax : SameSiteMode.Strict,
            MaxAge = TimeSpan.FromDays(7),
            Path = "/"
        });
    }

    internal static SessionIdentity? VerifySessionToken(string token, string secret)
    {
        var dot = token.LastIndexOf('.');
        if (dot == -1) return null;

        var body = token[..dot];
        var sig = token[(dot + 1)..];
        var expected = HmacSha256(secret, body);

        if (!CryptographicOperations.FixedTimeEquals(Encoding.UTF8.GetBytes(sig), Encoding.UTF8.GetBytes(expected)))
        {
            return null;
        }

        try
        {
            var json = Encoding.UTF8.GetString(Base64UrlDecode(body));
            var payload = JsonSerializer.Deserialize<SessionPayload>(json, CaseInsensitiveJsonOptions);
            if (payload is null || payload.Exp < DateTimeOffset.UtcNow.ToUnixTimeSeconds()) return null;
            if (string.IsNullOrEmpty(payload.Email)) return null;

            var user = new AppUser(
                Id: payload.Sub ?? payload.Email,
                Sub: payload.Sub ?? payload.Email,
                Email: payload.Email,
                DisplayName: payload.DisplayName ?? payload.Email,
                CreatedAt: DateTimeOffset.UtcNow.ToString("O"));
            return new SessionIdentity(user, payload.Role ?? "submitter");
        }
        catch
        {
            return null;
        }
    }

    private static string HmacSha256(string key, string input)
    {
        using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(key));
        return Base64UrlEncode(hmac.ComputeHash(Encoding.UTF8.GetBytes(input)));
    }

    private static string Base64UrlEncode(byte[] input) => Convert.ToBase64String(input).TrimEnd('=').Replace('+', '-').Replace('/', '_');
    private static byte[] Base64UrlDecode(string input)
    {
        var padded = input.Replace('-', '+').Replace('_', '/');
        switch (padded.Length % 4)
        {
            case 2: padded += "=="; break;
            case 3: padded += "="; break;
        }
        return Convert.FromBase64String(padded);
    }

    private static Dictionary<string, object>? DecodeIdTokenClaims(string idToken)
    {
        var parts = idToken.Split('.');
        if (parts.Length != 3) return null;

        try
        {
            var json = Encoding.UTF8.GetString(Base64UrlDecode(parts[1]));
            return JsonSerializer.Deserialize<Dictionary<string, object>>(json);
        }
        catch
        {
            return null;
        }
    }

    private static string? ExtractEmail(Dictionary<string, object> claims, string emailClaim)
    {
        var candidates = new[] { emailClaim, "email", "preferred_username", "upn" };
        foreach (var candidate in candidates)
        {
            if (claims.TryGetValue(candidate, out var value) && value is string s && s.Contains('@'))
            {
                return s;
            }
        }
        return null;
    }

    private static string ExtractRole(Dictionary<string, object> claims)
    {
        foreach (var key in new[] { "momentum-role", "role", "roles" })
        {
            if (claims.TryGetValue(key, out var value) && value is string role && !string.IsNullOrWhiteSpace(role))
            {
                return role;
            }
        }

        return "submitter";
    }

    private static void PrunePkce()
    {
        var now = DateTimeOffset.UtcNow;
        foreach (var key in _pkceStore.Keys.ToList())
        {
            if (_pkceStore[key].ExpiresAt < now)
            {
                _pkceStore.Remove(key);
            }
        }
    }

    private sealed record PkceState(string CodeVerifier, string ReturnTo, DateTimeOffset ExpiresAt);
    internal sealed record SessionIdentity(AppUser User, string Role);
    private sealed record SessionPayload(string? Sub, string Email, string? DisplayName, string? Role, long Exp);
    private sealed record TokenResponse
    {
        [System.Text.Json.Serialization.JsonPropertyName("id_token")]
        public string IdToken { get; init; } = string.Empty;
    }
}
