using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Momentum.Library.Application.Skills;
using Momentum.Library.Infrastructure.AzureDevOps;
using Momentum.Library.Infrastructure.GitHub;
using Momentum.Mcp.Auth;
using Momentum.Mcp.Backends;
using Momentum.Mcp.Backlog;
using Momentum.Mcp.Configuration;

namespace Momentum.Mcp;

public static class McpServiceCollectionExtensions
{
    public const string DataverseClientName = "dataverse";
    public const string AzureDevOpsClientName = "ado";
    public const string SkillsClientName = "skills-ado";

    /// <summary>
    /// Registers configuration, the downstream token provider, and one HTTP client per
    /// backend. Backends are resolved as keyed services on
    /// <see cref="DownstreamResource"/>.
    /// </summary>
    public static IServiceCollection AddMomentumMcp(
        this IServiceCollection services,
        IConfiguration configuration,
        IHostEnvironment environment)
    {
        services.AddOptions<McpOptions>()
            .Bind(configuration.GetSection(McpOptions.SectionName))
            .ValidateDataAnnotations()
            .ValidateOnStart();

        services.AddMemoryCache();

        AddTokenProvider(services, configuration, environment);

        services.AddHttpClient(DataverseClientName)
            .ConfigureHttpClient((provider, client) =>
            {
                var options = provider.GetRequiredService<IOptions<McpOptions>>().Value;
                client.BaseAddress = options.DataverseApiRoot;
                client.DefaultRequestHeaders.Add("Accept", "application/json");
                client.DefaultRequestHeaders.Add("OData-MaxVersion", "4.0");
                client.DefaultRequestHeaders.Add("OData-Version", "4.0");
            });

        services.AddHttpClient(AzureDevOpsClientName)
            .ConfigureHttpClient((provider, client) =>
            {
                var options = provider.GetRequiredService<IOptions<McpOptions>>().Value;
                client.BaseAddress = options.AdoApiRoot;
                client.DefaultRequestHeaders.Add("Accept", "application/json");
            })
            /*
                Given the Accept header above, Azure DevOps returns a JSON 401 carrying a
                real diagnostic. Drop that header and it redirects to an HTML sign-in page
                instead, which - if the redirect is followed - arrives as a 200 text/html
                body and surfaces as a JSON parse error pointing at '<'. Not following
                redirects is the belt to that Accept header's braces: an API client has no
                business chasing a login page under any circumstance.
            */
            .ConfigurePrimaryHttpMessageHandler(() => new HttpClientHandler { AllowAutoRedirect = false });

        services.AddKeyedSingleton(DownstreamResource.Dataverse, (provider, _) =>
            CreateClient(provider, DataverseClientName, DownstreamResource.Dataverse));

        services.AddKeyedSingleton(DownstreamResource.AzureDevOps, (provider, _) =>
            CreateClient(provider, AzureDevOpsClientName, DownstreamResource.AzureDevOps));

        AddBacklogTools(services);
        AddSkillIntake(services, configuration);

        return services;
    }

    /// <summary>
    /// The domain tool surface's readers.
    /// </summary>
    /// <remarks>
    /// Singletons: all three are stateless over the keyed HTTP clients, and the caller is
    /// threaded through every method rather than captured — which is what makes sharing one
    /// instance across sessions safe. The only state involved is
    /// <see cref="MetadataCatalog"/>'s cache, and what it holds is schema, not rows.
    /// </remarks>
    private static void AddBacklogTools(IServiceCollection services)
    {
        services.AddSingleton<BacklogRepository>();
        services.AddSingleton<EngagementReader>();
        services.AddSingleton<MetadataCatalog>();
    }

    /// <summary>
    /// Skill intake: the git adapter for whichever host is configured, its HTTP client, and the
    /// two services that drive it.
    /// </summary>
    /// <remarks>
    /// A separate named client from the MCP tools' Azure DevOps client even when both point at the
    /// same organization. The adapters take a plain <see cref="HttpClient"/> and get their
    /// authorization from a handler, because they are called from HTTP triggers where the caller
    /// is scoped rather than threaded — and because swapping that handler is the whole of the
    /// difference between committing as the caller and committing as a service credential.
    /// <para>
    /// Host and auth are read off configuration here rather than resolved per request: they decide
    /// which adapter and which handler get registered, so they have to be known before the
    /// container is built. Changing either is a restart.
    /// </para>
    /// </remarks>
    private static void AddSkillIntake(IServiceCollection services, IConfiguration configuration)
    {
        services.AddOptions<SkillsOptions>()
            .Bind(configuration.GetSection(SkillsOptions.SectionName))
            .ValidateOnStart();

        services.AddSingleton<IValidateOptions<SkillsOptions>, SkillsOptionsValidator>();

        services.AddScoped<CallerContextAccessor>();

        var skills = configuration.GetSection(SkillsOptions.SectionName).Get<SkillsOptions>()
            ?? new SkillsOptions();

        if (skills.Host == SkillsGitHost.GitHub)
        {
            AddGitHubSkillRepository(services, skills);
        }
        else
        {
            AddAzureDevOpsSkillRepository(services, skills);
        }

        services.AddScoped<SkillIntakeService>();
        services.AddScoped<SkillProvisioningService>();
    }

    private static void AddAzureDevOpsSkillRepository(IServiceCollection services, SkillsOptions skills)
    {
        if (skills.Auth == SkillsGitAuth.Pat)
        {
            /*
                Captured from the configuration snapshot rather than resolved from IOptions,
                because the handler is chosen at registration time and a handler that read the
                token per request would still not be able to change which handler is registered.
            */
            var pat = skills.Pat ?? string.Empty;
            services.AddTransient(_ => PersonalAccessTokenHandler.ForAzureDevOps(pat));
        }
        else
        {
            services.AddTransient(provider => new CallerTokenHandler(
                provider.GetRequiredService<IDownstreamTokenProvider>(),
                provider.GetRequiredService<CallerContextAccessor>(),
                DownstreamResource.AzureDevOps));
        }

        var builder = services.AddHttpClient(SkillsClientName)
            .ConfigureHttpClient((provider, client) =>
            {
                var options = provider.GetRequiredService<IOptions<McpOptions>>().Value;
                var current = provider.GetRequiredService<IOptions<SkillsOptions>>().Value;

                client.BaseAddress = new Uri(
                    $"https://dev.azure.com/{Organization(current, options)}/");
                client.DefaultRequestHeaders.Add("Accept", "application/json");
            })
            // Same reason as the tools' client: an API caller must never chase a sign-in page.
            .ConfigurePrimaryHttpMessageHandler(() => new HttpClientHandler { AllowAutoRedirect = false });

        if (skills.Auth == SkillsGitAuth.Pat)
        {
            builder.AddHttpMessageHandler<PersonalAccessTokenHandler>();
        }
        else
        {
            builder.AddHttpMessageHandler<CallerTokenHandler>();
        }

        services.AddScoped(provider =>
        {
            var mcp = provider.GetRequiredService<IOptions<McpOptions>>().Value;
            var current = provider.GetRequiredService<IOptions<SkillsOptions>>().Value;

            return new AdoGitSkillRepository(
                provider.GetRequiredService<IHttpClientFactory>().CreateClient(SkillsClientName),
                new AdoGitRepositoryOptions
                {
                    Organization = Organization(current, mcp),
                    Project = string.IsNullOrWhiteSpace(current.AzureDevOps.Project)
                        ? mcp.AdoProject
                        : current.AzureDevOps.Project,
                    RepositoryId = current.AzureDevOps.Repository,
                    DefaultBranch = current.Branch,
                },
                provider.GetRequiredService<ILogger<AdoGitSkillRepository>>());
        });

        services.AddScoped<ISkillRepository>(provider =>
            provider.GetRequiredService<AdoGitSkillRepository>());
        services.AddScoped<ISkillRepositoryProvisioner>(provider =>
            provider.GetRequiredService<AdoGitSkillRepository>());
    }

    private static void AddGitHubSkillRepository(IServiceCollection services, SkillsOptions skills)
    {
        // Validated at startup: GitHub has no Caller mode, because there is no on-behalf-of
        // exchange that produces a credential GitHub accepts.
        var pat = skills.Pat ?? string.Empty;

        services.AddTransient(_ => PersonalAccessTokenHandler.ForGitHub(pat));

        services.AddHttpClient(SkillsClientName)
            .ConfigureHttpClient((provider, client) =>
            {
                var current = provider.GetRequiredService<IOptions<SkillsOptions>>().Value;

                client.BaseAddress = new Uri(current.GitHub.ApiRoot);

                client.DefaultRequestHeaders.Add("Accept", "application/vnd.github+json");

                /*
                    Both of these are load-bearing. GitHub rejects a request with no User-Agent
                    outright — a 403 with "Request forbidden by administrative rules", which reads
                    like a permissions problem and is not one. The API version header pins the
                    response shape; without it a future default could change what this adapter
                    parses.
                */
                client.DefaultRequestHeaders.Add("User-Agent", "Momentum-SkillIntake");
                client.DefaultRequestHeaders.Add("X-GitHub-Api-Version", "2022-11-28");
            })
            .AddHttpMessageHandler<PersonalAccessTokenHandler>()
            // A GitHub redirect on an API call means the request landed on the web app, most
            // often a GHES ApiRoot missing its /api/v3 path. Failing is more useful than a 200
            // carrying HTML.
            .ConfigurePrimaryHttpMessageHandler(() => new HttpClientHandler { AllowAutoRedirect = false });

        services.AddScoped(provider =>
        {
            var current = provider.GetRequiredService<IOptions<SkillsOptions>>().Value;

            return new GitHubSkillRepository(
                provider.GetRequiredService<IHttpClientFactory>().CreateClient(SkillsClientName),
                new GitHubRepositoryOptions
                {
                    Owner = current.GitHub.Owner,
                    Repository = current.GitHub.Repository,
                    DefaultBranch = current.Branch,
                    CreatePrivate = current.GitHub.CreatePrivate,
                },
                provider.GetRequiredService<ILogger<GitHubSkillRepository>>());
        });

        services.AddScoped<ISkillRepository>(provider =>
            provider.GetRequiredService<GitHubSkillRepository>());
        services.AddScoped<ISkillRepositoryProvisioner>(provider =>
            provider.GetRequiredService<GitHubSkillRepository>());
    }

    /// <summary>
    /// The skills organization, falling back to the backlog's. The skills repository usually does
    /// sit beside the backlog, and making people repeat the organization to say so is a setting
    /// that only ever gets out of step.
    /// </summary>
    private static string Organization(SkillsOptions skills, McpOptions mcp) =>
        string.IsNullOrWhiteSpace(skills.AzureDevOps.Organization)
            ? mcp.AdoOrganization
            : skills.AzureDevOps.Organization;

    private static void AddTokenProvider(
        IServiceCollection services,
        IConfiguration configuration,
        IHostEnvironment environment)
    {
        /*
            Read AuthMode straight off configuration rather than from IOptions: the
            choice decides which type gets registered, so it has to be known before the
            container is built.
        */
        var authMode = configuration
            .GetSection(McpOptions.SectionName)
            .GetValue(nameof(McpOptions.AuthMode), McpAuthMode.Obo);

        if (authMode == McpAuthMode.DevCli)
        {
            if (!environment.IsDevelopment())
            {
                throw new InvalidOperationException(
                    $"{McpOptions.SectionName}:AuthMode=DevCli runs every request as the " +
                    $"signed-in Azure CLI user, not as the caller. It is refused outside " +
                    $"Development (current environment: {environment.EnvironmentName}).");
            }

            services.AddSingleton<AzureCliTokenProvider>();
            services.AddSingleton<IDownstreamTokenProvider>(provider => new CachingTokenProvider(
                provider.GetRequiredService<AzureCliTokenProvider>(),
                provider.GetRequiredService<IMemoryCache>()));
        }
        else
        {
            services.AddSingleton<OboTokenProvider>();
            services.AddSingleton<IDownstreamTokenProvider>(provider => new CachingTokenProvider(
                provider.GetRequiredService<OboTokenProvider>(),
                provider.GetRequiredService<IMemoryCache>()));
        }
    }

    private static DownstreamHttpClient CreateClient(
        IServiceProvider provider,
        string name,
        DownstreamResource resource) =>
        new(provider.GetRequiredService<IHttpClientFactory>().CreateClient(name),
            provider.GetRequiredService<IDownstreamTokenProvider>(),
            resource);
}
