using Microsoft.Extensions.Options;
using Momentum.Mcp.Configuration;
using Xunit;

namespace Momentum.Tests.Skills;

/// <summary>
/// The configuration section is validated on start, so these are the failures a deployment gets
/// instead of a 404, a sign-in redirect, or a commit attributed to the wrong identity.
/// </summary>
public class SkillsOptionsValidatorTests
{
    private static SkillsOptionsValidator Validator(
        string organization = "CyclotronInc", string project = "Innovation Backlog") =>
        new(Options.Create(new McpOptions
        {
            DataverseEnvironmentUrl = "https://example.crm.dynamics.com",
            AdoOrganization = organization,
            AdoProject = project,
        }));

    private static ValidateOptionsResult Validate(
        SkillsOptions options, string organization = "CyclotronInc", string project = "Innovation Backlog") =>
        Validator(organization, project).Validate(name: null, options);

    [Fact]
    public void The_defaults_plus_a_backlog_organization_are_enough()
    {
        // The common case: skills sit beside the backlog, committed as the caller. Nothing in the
        // Momentum:Skills section is set at all.
        Assert.True(Validate(new SkillsOptions()).Succeeded);
    }

    [Fact]
    public void An_azure_devops_target_with_nothing_to_fall_back_to_is_refused()
    {
        var result = Validate(new SkillsOptions(), organization: "", project: "");

        Assert.False(result.Succeeded);
        Assert.Contains(result.Failures!, failure => failure.Contains("AzureDevOps:Organization"));
        Assert.Contains(result.Failures!, failure => failure.Contains("AzureDevOps:Project"));
    }

    [Fact]
    public void Pat_auth_without_a_pat_is_refused()
    {
        var result = Validate(new SkillsOptions { Auth = SkillsGitAuth.Pat });

        Assert.False(result.Succeeded);
        Assert.Contains(result.Failures!, failure => failure.Contains("Momentum:Skills:Pat is empty"));
    }

    [Fact]
    public void Pat_auth_against_azure_devops_needs_no_caller_identity()
    {
        var options = new SkillsOptions
        {
            Auth = SkillsGitAuth.Pat,
            Pat = "a-token",
        };

        Assert.True(Validate(options).Succeeded);
    }

    /// <summary>
    /// Not coerced to Pat: a deployment that meant to attribute each commit to its approver should
    /// find that out here, not from the commit history.
    /// </summary>
    [Fact]
    public void GitHub_with_caller_auth_is_refused_because_no_obo_exchange_yields_a_github_credential()
    {
        var options = new SkillsOptions
        {
            Host = SkillsGitHost.GitHub,
            Auth = SkillsGitAuth.Caller,
            GitHub = { Owner = "cyclotron" },
        };

        var result = Validate(options);

        Assert.False(result.Succeeded);
        Assert.Contains(result.Failures!, failure => failure.Contains("Auth=Caller is not available for GitHub"));
    }

    [Fact]
    public void GitHub_needs_an_owner()
    {
        var options = new SkillsOptions
        {
            Host = SkillsGitHost.GitHub,
            Auth = SkillsGitAuth.Pat,
            Pat = "a-token",
        };

        var result = Validate(options);

        Assert.False(result.Succeeded);
        Assert.Contains(result.Failures!, failure => failure.Contains("GitHub:Owner"));
    }

    [Fact]
    public void A_fully_configured_github_target_passes_and_does_not_require_azure_devops_settings()
    {
        var options = new SkillsOptions
        {
            Host = SkillsGitHost.GitHub,
            Auth = SkillsGitAuth.Pat,
            Pat = "a-token",
            GitHub = { Owner = "cyclotron", Repository = "skills" },
        };

        // No AdoOrganization, no AdoProject: a GitHub deployment should not have to carry them.
        Assert.True(Validate(options, organization: "", project: "").Succeeded);
    }

    /// <summary>
    /// HttpClient drops the last segment of a base address that does not end in a slash, which on
    /// GitHub Enterprise Server silently strips /api/v3 and sends every call to the web app — where
    /// it is answered with HTML rather than an error.
    /// </summary>
    [Theory]
    [InlineData("https://ghe.example.com/api/v3", "must end with a slash")]
    [InlineData("api.github.com", "is not an absolute URL")]
    public void A_github_api_root_that_would_silently_misroute_is_refused(string apiRoot, string expected)
    {
        var options = new SkillsOptions
        {
            Host = SkillsGitHost.GitHub,
            Auth = SkillsGitAuth.Pat,
            Pat = "a-token",
            GitHub = { Owner = "cyclotron", ApiRoot = apiRoot },
        };

        var result = Validate(options);

        Assert.False(result.Succeeded);
        Assert.Contains(result.Failures!, failure => failure.Contains(expected));
    }

    [Fact]
    public void An_enterprise_server_api_root_with_its_trailing_slash_passes()
    {
        var options = new SkillsOptions
        {
            Host = SkillsGitHost.GitHub,
            Auth = SkillsGitAuth.Pat,
            Pat = "a-token",
            GitHub = { Owner = "cyclotron", ApiRoot = "https://ghe.example.com/api/v3/" },
        };

        Assert.True(Validate(options).Succeeded);
    }

    [Fact]
    public void An_empty_branch_is_refused()
    {
        var result = Validate(new SkillsOptions { Branch = "" });

        Assert.False(result.Succeeded);
        Assert.Contains(result.Failures!, failure => failure.Contains("Momentum:Skills:Branch"));
    }
}
