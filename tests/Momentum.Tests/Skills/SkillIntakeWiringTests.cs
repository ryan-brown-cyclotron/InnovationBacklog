using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;
using Momentum.Library.Application.Skills;
using Momentum.Library.Infrastructure.AzureDevOps;
using Momentum.Library.Infrastructure.GitHub;
using Momentum.Mcp;
using Momentum.Mcp.Configuration;
using Xunit;

namespace Momentum.Tests.Skills;

/// <summary>
/// Host and auth are read off configuration at registration time, because they decide which adapter
/// and which HTTP handler get registered rather than being consulted per request. That makes the
/// container the only place the choice is expressed, and these are the tests of it.
/// </summary>
public class SkillIntakeWiringTests
{
    private static readonly Dictionary<string, string?> Baseline = new()
    {
        ["Momentum:Mcp:DataverseEnvironmentUrl"] = "https://example.crm.dynamics.com",
        ["Momentum:Mcp:AdoOrganization"] = "CyclotronInc",
        ["Momentum:Mcp:AdoProject"] = "Innovation Backlog",
        ["Momentum:Mcp:AuthMode"] = "Obo",
    };

    private static ServiceProvider Build(params (string Key, string Value)[] settings)
    {
        var values = new Dictionary<string, string?>(Baseline);
        foreach (var (key, value) in settings)
        {
            values[key] = value;
        }

        var configuration = new ConfigurationBuilder().AddInMemoryCollection(values).Build();

        var services = new ServiceCollection();
        services.AddLogging();
        services.AddMomentumMcp(configuration, new FakeEnvironment());

        return services.BuildServiceProvider();
    }

    [Fact]
    public void The_default_configuration_wires_azure_devops()
    {
        using var provider = Build();
        using var scope = provider.CreateScope();

        Assert.IsType<AdoGitSkillRepository>(scope.ServiceProvider.GetRequiredService<ISkillRepository>());

        // Both ports resolve to the same instance: one adapter holds one host's REST dialect, and a
        // second instance would mean a second HttpClient for no reason.
        Assert.Same(
            scope.ServiceProvider.GetRequiredService<ISkillRepository>(),
            scope.ServiceProvider.GetRequiredService<ISkillRepositoryProvisioner>());
    }

    [Fact]
    public void GitHub_wires_the_github_adapter_and_both_services()
    {
        using var provider = Build(
            ("Momentum:Skills:Host", "GitHub"),
            ("Momentum:Skills:Auth", "Pat"),
            ("Momentum:Skills:Pat", "a-token"),
            ("Momentum:Skills:GitHub:Owner", "cyclotron"));

        using var scope = provider.CreateScope();

        Assert.IsType<GitHubSkillRepository>(scope.ServiceProvider.GetRequiredService<ISkillRepository>());
        Assert.NotNull(scope.ServiceProvider.GetRequiredService<SkillIntakeService>());
        Assert.NotNull(scope.ServiceProvider.GetRequiredService<SkillProvisioningService>());
    }

    [Fact]
    public void Pat_auth_against_azure_devops_resolves_without_a_token_provider_being_reachable()
    {
        using var provider = Build(
            ("Momentum:Skills:Auth", "Pat"),
            ("Momentum:Skills:Pat", "a-token"));

        using var scope = provider.CreateScope();

        Assert.NotNull(scope.ServiceProvider.GetRequiredService<ISkillRepository>());
        Assert.NotNull(scope.ServiceProvider.GetRequiredService<SkillProvisioningService>());
    }

    /// <summary>
    /// The validator is registered, not just written — a section that only fails at first use is the
    /// thing this replaces.
    /// </summary>
    [Fact]
    public void A_github_target_with_no_owner_fails_when_the_options_are_read()
    {
        using var provider = Build(
            ("Momentum:Skills:Host", "GitHub"),
            ("Momentum:Skills:Auth", "Pat"),
            ("Momentum:Skills:Pat", "a-token"));

        var exception = Assert.Throws<OptionsValidationException>(
            () => provider.GetRequiredService<IOptions<SkillsOptions>>().Value);

        Assert.Contains("GitHub:Owner", string.Join(" ", exception.Failures));
    }

    [Fact]
    public void The_skills_organization_falls_back_to_the_backlog_organization()
    {
        using var provider = Build(("Momentum:Skills:Auth", "Pat"), ("Momentum:Skills:Pat", "a-token"));
        using var scope = provider.CreateScope();

        var repository = scope.ServiceProvider.GetRequiredService<AdoGitSkillRepository>();

        Assert.Equal(
            "Azure DevOps CyclotronInc/Innovation Backlog/skills", repository.Describe());
    }

    [Fact]
    public void An_explicit_skills_organization_and_project_win()
    {
        using var provider = Build(
            ("Momentum:Skills:Auth", "Pat"),
            ("Momentum:Skills:Pat", "a-token"),
            ("Momentum:Skills:AzureDevOps:Organization", "OtherOrg"),
            ("Momentum:Skills:AzureDevOps:Project", "Platform"),
            ("Momentum:Skills:AzureDevOps:Repository", "agent-skills"));

        using var scope = provider.CreateScope();

        Assert.Equal(
            "Azure DevOps OtherOrg/Platform/agent-skills",
            scope.ServiceProvider.GetRequiredService<AdoGitSkillRepository>().Describe());
    }

    private sealed class FakeEnvironment : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = Environments.Production;
        public string ApplicationName { get; set; } = "Momentum.Tests";
        public string ContentRootPath { get; set; } = AppContext.BaseDirectory;
        public Microsoft.Extensions.FileProviders.IFileProvider ContentRootFileProvider { get; set; } =
            new Microsoft.Extensions.FileProviders.NullFileProvider();
    }
}
