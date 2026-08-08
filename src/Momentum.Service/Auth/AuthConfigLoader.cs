using System.Text.Json;

namespace Momentum.Service.Auth;

public static class AuthConfigLoader
{
    public static AuthConfig Load(bool devMode = false)
    {
        if (devMode)
        {
            return new AuthConfig(AuthMode.None, null, null, []);
        }

        const string prefix = "MOMENTUM_AUTH";
        var mode = ParseMode(Environment.GetEnvironmentVariable($"{prefix}_MODE") ?? "entra");
        var preRegisteredClients = LoadPreRegisteredClients(prefix);

        return mode switch
        {
            AuthMode.None => new AuthConfig(AuthMode.None, null, null, preRegisteredClients),
            AuthMode.Entra => LoadEntra(prefix, preRegisteredClients),
            AuthMode.OAuth => LoadOAuth(prefix, preRegisteredClients),
            _ => throw new NotSupportedException($"Auth mode {mode} is not supported.")
        };
    }

    private static AuthMode ParseMode(string value) => value.ToLowerInvariant() switch
    {
        "none" => AuthMode.None,
        "entra" => AuthMode.Entra,
        "oauth" => AuthMode.OAuth,
        _ => throw new ArgumentException($"Invalid auth mode: {value}")
    };

    private static AuthConfig LoadEntra(string prefix, IReadOnlyList<PreRegisteredClient> preRegisteredClients)
    {
        var instance = Environment.GetEnvironmentVariable($"{prefix}_ENTRA_INSTANCE") ?? "https://login.microsoftonline.com/";
        var tenantId = Environment.GetEnvironmentVariable($"{prefix}_ENTRA_TENANT_ID") ?? "";
        var clientId = Environment.GetEnvironmentVariable($"{prefix}_ENTRA_CLIENT_ID") ?? "";
        var clientSecret = Environment.GetEnvironmentVariable($"{prefix}_ENTRA_CLIENT_SECRET") ?? "";
        var audience = Environment.GetEnvironmentVariable($"{prefix}_ENTRA_AUDIENCE");
        var redirectUri = Environment.GetEnvironmentVariable($"{prefix}_ENTRA_REDIRECT_URI");

        if (string.IsNullOrEmpty(tenantId) || string.IsNullOrEmpty(clientId) || string.IsNullOrEmpty(clientSecret))
        {
            throw new InvalidOperationException(
                $"Auth mode 'entra' requires {prefix}_ENTRA_TENANT_ID, {prefix}_ENTRA_CLIENT_ID, and {prefix}_ENTRA_CLIENT_SECRET.");
        }

        audience ??= $"api://{clientId}";

        return new AuthConfig(
            AuthMode.Entra,
            new EntraConfig(instance, tenantId, clientId, clientSecret, audience, redirectUri),
            null,
            preRegisteredClients);
    }

    private static AuthConfig LoadOAuth(string prefix, IReadOnlyList<PreRegisteredClient> preRegisteredClients)
    {
        var issuerUrl = Environment.GetEnvironmentVariable($"{prefix}_OAUTH_ISSUER") ?? "";
        var clientId = Environment.GetEnvironmentVariable($"{prefix}_OAUTH_CLIENT_ID") ?? "";
        var clientSecret = Environment.GetEnvironmentVariable($"{prefix}_OAUTH_CLIENT_SECRET") ?? "";
        var audience = Environment.GetEnvironmentVariable($"{prefix}_OAUTH_AUDIENCE") ?? "";
        var scopes = Environment.GetEnvironmentVariable($"{prefix}_OAUTH_SCOPES") ?? "openid email profile";
        var emailClaim = Environment.GetEnvironmentVariable($"{prefix}_OAUTH_EMAIL_CLAIM") ?? "email";
        var redirectUri = Environment.GetEnvironmentVariable($"{prefix}_OAUTH_REDIRECT_URI");

        if (string.IsNullOrEmpty(issuerUrl) || string.IsNullOrEmpty(clientId) || string.IsNullOrEmpty(clientSecret))
        {
            throw new InvalidOperationException(
                $"Auth mode 'oauth' requires {prefix}_OAUTH_ISSUER, {prefix}_OAUTH_CLIENT_ID, and {prefix}_OAUTH_CLIENT_SECRET.");
        }

        return new AuthConfig(
            AuthMode.OAuth,
            null,
            new OAuthConfig(issuerUrl, clientId, clientSecret, audience, scopes, emailClaim, redirectUri),
            preRegisteredClients);
    }

    private static IReadOnlyList<PreRegisteredClient> LoadPreRegisteredClients(string prefix)
    {
        var raw = Environment.GetEnvironmentVariable($"{prefix}_PRE_REGISTERED_CLIENTS");
        if (string.IsNullOrWhiteSpace(raw)) return [];

        using var document = JsonDocument.Parse(raw);
        var result = new List<PreRegisteredClient>();

        foreach (var element in document.RootElement.EnumerateArray())
        {
            var clientId = element.GetProperty("clientId").GetString() ?? "";
            var clientSecret = element.TryGetProperty("clientSecret", out var secretProp) ? secretProp.GetString() : null;
            var clientName = element.TryGetProperty("clientName", out var nameProp) ? nameProp.GetString() : null;
            var redirectUris = element.GetProperty("redirect_uris").EnumerateArray()
                .Select(p => p.GetString())
                .OfType<string>()
                .Where(s => !string.IsNullOrWhiteSpace(s))
                .ToList();

            if (string.IsNullOrEmpty(clientId) || redirectUris.Count == 0)
            {
                throw new InvalidOperationException(
                    "Pre-registered clients must include non-empty clientId and redirect_uris.");
            }

            result.Add(new PreRegisteredClient(clientId, clientSecret, redirectUris, clientName));
        }

        return result;
    }
}
