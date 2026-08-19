using System.Net.Http.Headers;
using System.Text;

namespace Momentum.Mcp.Auth;

/// <summary>
/// Attaches a fixed personal access token to every request on the client it is registered
/// against.
/// </summary>
/// <remarks>
/// The counterpart to <see cref="CallerTokenHandler"/>, and the reason the git adapters take a
/// plain <see cref="HttpClient"/> and never a token: swapping which handler is registered is the
/// whole of the difference between committing as the calling user and committing as a service
/// credential. Neither adapter knows which it got.
/// <para>
/// No caching and no expiry tracking, unlike the OBO path — a PAT is a static string with a
/// lifetime measured in months. When it expires, every call fails at once, which the adapters
/// surface as an authentication error naming the scopes to check.
/// </para>
/// <para>
/// The token is read once at construction and never logged. It reaches the wire only in the
/// <c>Authorization</c> header this handler sets.
/// </para>
/// </remarks>
public sealed class PersonalAccessTokenHandler : DelegatingHandler
{
    private readonly AuthenticationHeaderValue _header;

    private PersonalAccessTokenHandler(AuthenticationHeaderValue header) => _header = header;

    /// <summary>
    /// Azure DevOps takes a PAT as HTTP basic auth with an empty username — the token goes in
    /// the password half.
    /// </summary>
    /// <remarks>
    /// Not a bearer token, which is the usual mistake: Azure DevOps answers
    /// <c>Authorization: Bearer &lt;pat&gt;</c> with a redirect to a sign-in page rather than a
    /// 401, so the failure arrives looking like a configuration problem somewhere else entirely.
    /// </remarks>
    public static PersonalAccessTokenHandler ForAzureDevOps(string pat) =>
        new(new AuthenticationHeaderValue(
            "Basic",
            Convert.ToBase64String(Encoding.ASCII.GetBytes($":{pat}"))));

    /// <summary>
    /// GitHub takes a PAT as a bearer token. Both classic (<c>ghp_</c>) and fine-grained
    /// (<c>github_pat_</c>) tokens work this way, as does a GitHub App installation token — which
    /// is why nothing here inspects the string.
    /// </summary>
    public static PersonalAccessTokenHandler ForGitHub(string pat) =>
        new(new AuthenticationHeaderValue("Bearer", pat));

    protected override Task<HttpResponseMessage> SendAsync(
        HttpRequestMessage request, CancellationToken cancellationToken)
    {
        request.Headers.Authorization = _header;

        return base.SendAsync(request, cancellationToken);
    }
}
