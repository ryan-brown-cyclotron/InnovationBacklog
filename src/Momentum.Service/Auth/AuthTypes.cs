namespace Momentum.Service.Auth;

public enum AuthMode
{
    None,
    Entra,
    OAuth,
}

public sealed record EntraConfig(
    string Instance,
    string TenantId,
    string ClientId,
    string ClientSecret,
    string Audience,
    string? RedirectUri);

public sealed record OAuthConfig(
    string IssuerUrl,
    string ClientId,
    string ClientSecret,
    string Audience,
    string Scopes,
    string EmailClaim,
    string? RedirectUri);

public sealed record PreRegisteredClient(
    string ClientId,
    string? ClientSecret,
    IReadOnlyList<string> RedirectUris,
    string? ClientName);

public sealed record AuthConfig(
    AuthMode Mode,
    EntraConfig? Entra,
    OAuthConfig? OAuth,
    IReadOnlyList<PreRegisteredClient> PreRegisteredClients);
