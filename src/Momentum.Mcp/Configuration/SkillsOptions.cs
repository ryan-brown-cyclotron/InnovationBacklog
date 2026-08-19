using Microsoft.Extensions.Options;

namespace Momentum.Mcp.Configuration;

/// <summary>Which git host the skills repository lives on.</summary>
public enum SkillsGitHost
{
    AzureDevOps,
    GitHub,
}

/// <summary>
/// How the app authenticates to the skills git host.
/// </summary>
public enum SkillsGitAuth
{
    /// <summary>
    /// Commit as the person who called the endpoint, by exchanging their inbound token
    /// (<see cref="McpAuthMode.Obo"/>) or borrowing the signed-in Azure CLI user's
    /// (<see cref="McpAuthMode.DevCli"/>). Azure DevOps only — there is no OBO exchange that
    /// produces a GitHub credential.
    /// <para>
    /// The stronger option where it applies: the host records who actually wrote the commit, and
    /// each approver needs Contribute in their own right.
    /// </para>
    /// </summary>
    Caller,

    /// <summary>
    /// Commit as a single service credential — an Azure DevOps personal access token, or a
    /// GitHub personal access token / installation token.
    /// <para>
    /// Every commit is then attributed to whoever owns the token, and repository permissions stop
    /// being a per-approver control. What survives is the audit trail in the commit message:
    /// <c>Approved-by</c> is written from the request body, which is exactly why that field exists
    /// and is not inferred from the credential.
    /// </para>
    /// </summary>
    Pat,
}

/// <summary>
/// The skills git repository: which host, which repository, and which credential.
/// </summary>
/// <remarks>
/// Its own section rather than more properties on <see cref="McpOptions"/>. The two were tangled
/// while the skills repository was assumed to sit beside the backlog in the same Azure DevOps
/// organization, reached with the same token. Neither assumption holds: the repository can be on
/// GitHub, and it can be reached with a PAT while the backlog tools still run on-behalf-of the
/// caller.
/// <para>
/// Bound from <c>Momentum:Skills</c>. In <c>local.settings.json</c> that is a colon-delimited key
/// under <c>Values</c>; as an Azure app setting it is <c>Momentum__Skills__…</c>, because a colon
/// is not legal in an environment variable name on Linux.
/// </para>
/// <para>
/// Validated at startup by <see cref="SkillsOptionsValidator"/>, so a half-filled section stops
/// the host instead of surfacing as a 404 or a sign-in redirect on the first adoption.
/// </para>
/// </remarks>
public sealed class SkillsOptions
{
    public const string SectionName = "Momentum:Skills";

    public SkillsGitHost Host { get; set; } = SkillsGitHost.AzureDevOps;

    public SkillsGitAuth Auth { get; set; } = SkillsGitAuth.Caller;

    /// <summary>
    /// The token used when <see cref="Auth"/> is <see cref="SkillsGitAuth.Pat"/>.
    /// </summary>
    /// <remarks>
    /// A secret, so in a deployed app this is a Key Vault reference rather than a literal —
    /// <c>@Microsoft.KeyVault(SecretUri=…)</c> as the value of <c>Momentum__Skills__Pat</c>. It is
    /// never logged and never returned by any endpoint.
    /// </remarks>
    public string? Pat { get; set; }

    /// <summary>Branch intake commits to when a request does not name one.</summary>
    public string Branch { get; set; } = "main";

    public AzureDevOpsSkillsTarget AzureDevOps { get; set; } = new();

    public GitHubSkillsTarget GitHub { get; set; } = new();

    /// <summary>
    /// Goes in a freshly seeded <c>marketplace.json</c>. Cosmetic to intake, but it is the name a
    /// person sees when they add the marketplace.
    /// </summary>
    public string MarketplaceName { get; set; } = "momentum";

    public string MarketplaceDescription { get; set; } = "Skills adopted from the Innovation Backlog.";

    /// <summary>
    /// Whether <c>POST skills/provision</c> may create the repository, as opposed to only seeding
    /// one that already exists.
    /// </summary>
    /// <remarks>
    /// On by default because removing repository bootstrap as a prerequisite is the point of the
    /// endpoint. Worth turning off where repository creation is governed elsewhere — the endpoint
    /// then reports the repository as missing rather than creating it, which is a clearer failure
    /// than a 403 from the host.
    /// </remarks>
    public bool AllowRepositoryCreate { get; set; } = true;
}

public sealed class AzureDevOpsSkillsTarget
{
    /// <summary>
    /// Organization name, not a URL. Falls back to <see cref="McpOptions.AdoOrganization"/> —
    /// the skills repository usually does sit in the same organization as the backlog.
    /// </summary>
    public string? Organization { get; set; }

    /// <summary>Project holding the repository. Falls back to <see cref="McpOptions.AdoProject"/>.</summary>
    public string? Project { get; set; }

    /// <summary>
    /// Repository name. A GUID also works for reads and commits, but not for
    /// <c>POST skills/provision</c> — a GUID names something that already exists.
    /// </summary>
    public string Repository { get; set; } = "skills";
}

public sealed class GitHubSkillsTarget
{
    /// <summary>Organization or user that owns the repository.</summary>
    public string Owner { get; set; } = string.Empty;

    public string Repository { get; set; } = "skills";

    /// <summary>
    /// API root. The default is github.com; GitHub Enterprise Server is
    /// <c>https://ghe.example.com/api/v3/</c> — note the path, and the trailing slash, which
    /// <see cref="HttpClient"/> needs in a base address or the last segment is discarded.
    /// </summary>
    public string ApiRoot { get; set; } = "https://api.github.com/";

    /// <summary>Visibility for a repository the provisioning endpoint creates.</summary>
    public bool CreatePrivate { get; set; } = true;
}

/// <summary>
/// Startup validation, written by hand because what is required depends on
/// <see cref="SkillsOptions.Host"/> and <see cref="SkillsOptions.Auth"/>.
/// </summary>
/// <remarks>
/// Data annotations cannot express "Owner is required, but only on GitHub", and marking every
/// field required would make a GitHub deployment carry an Azure DevOps project it never uses.
/// The messages name the setting key, because the person reading them is looking at a
/// configuration blade rather than at this file.
/// </remarks>
public sealed class SkillsOptionsValidator(IOptions<McpOptions> mcp) : IValidateOptions<SkillsOptions>
{
    public ValidateOptionsResult Validate(string? name, SkillsOptions options)
    {
        var failures = new List<string>();

        if (string.IsNullOrWhiteSpace(options.Branch))
        {
            failures.Add($"{SkillsOptions.SectionName}:Branch is required.");
        }

        switch (options.Host)
        {
            case SkillsGitHost.AzureDevOps:
                ValidateAzureDevOps(options, failures);
                break;

            case SkillsGitHost.GitHub:
                ValidateGitHub(options, failures);
                break;

            default:
                failures.Add($"{SkillsOptions.SectionName}:Host '{options.Host}' is not a known git host.");
                break;
        }

        if (options.Auth == SkillsGitAuth.Pat && string.IsNullOrWhiteSpace(options.Pat))
        {
            failures.Add(
                $"{SkillsOptions.SectionName}:Auth is Pat but {SkillsOptions.SectionName}:Pat is empty.");
        }

        return failures.Count == 0
            ? ValidateOptionsResult.Success
            : ValidateOptionsResult.Fail(failures);
    }

    private void ValidateAzureDevOps(SkillsOptions options, List<string> failures)
    {
        if (string.IsNullOrWhiteSpace(options.AzureDevOps.Organization) &&
            string.IsNullOrWhiteSpace(mcp.Value.AdoOrganization))
        {
            failures.Add(
                $"{SkillsOptions.SectionName}:AzureDevOps:Organization is required when no " +
                $"{McpOptions.SectionName}:AdoOrganization is configured to fall back to.");
        }

        if (string.IsNullOrWhiteSpace(options.AzureDevOps.Project) &&
            string.IsNullOrWhiteSpace(mcp.Value.AdoProject))
        {
            failures.Add(
                $"{SkillsOptions.SectionName}:AzureDevOps:Project is required when no " +
                $"{McpOptions.SectionName}:AdoProject is configured to fall back to.");
        }

        if (string.IsNullOrWhiteSpace(options.AzureDevOps.Repository))
        {
            failures.Add($"{SkillsOptions.SectionName}:AzureDevOps:Repository is required.");
        }
    }

    private static void ValidateGitHub(SkillsOptions options, List<string> failures)
    {
        /*
            Caller auth means exchanging the inbound Entra token for a downstream one, and there
            is no such exchange that yields a GitHub credential. Left as a startup failure rather
            than silently coerced to Pat, because a deployment that meant to attribute commits to
            each approver should find out here and not from the commit history.
        */
        if (options.Auth == SkillsGitAuth.Caller)
        {
            failures.Add(
                $"{SkillsOptions.SectionName}:Auth=Caller is not available for GitHub — on-behalf-of " +
                "exchange produces Entra tokens, which GitHub does not accept. Set Auth=Pat.");
        }

        if (string.IsNullOrWhiteSpace(options.GitHub.Owner))
        {
            failures.Add($"{SkillsOptions.SectionName}:GitHub:Owner is required.");
        }

        if (string.IsNullOrWhiteSpace(options.GitHub.Repository))
        {
            failures.Add($"{SkillsOptions.SectionName}:GitHub:Repository is required.");
        }

        if (!Uri.TryCreate(options.GitHub.ApiRoot, UriKind.Absolute, out var apiRoot))
        {
            failures.Add(
                $"{SkillsOptions.SectionName}:GitHub:ApiRoot '{options.GitHub.ApiRoot}' is not an absolute URL.");
        }
        else if (!apiRoot.AbsoluteUri.EndsWith('/'))
        {
            // HttpClient drops the last segment of a base address without one, which on GitHub
            // Enterprise Server silently strips /api/v3 and sends every call to the web app.
            failures.Add(
                $"{SkillsOptions.SectionName}:GitHub:ApiRoot must end with a slash " +
                $"(got '{options.GitHub.ApiRoot}').");
        }
    }
}
