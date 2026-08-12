using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;
using Momentum.Mcp.Auth;
using Momentum.Mcp.Backends;
using Momentum.Mcp.Configuration;

namespace Momentum.Mcp;

public static class McpServiceCollectionExtensions
{
    public const string DataverseClientName = "dataverse";
    public const string AzureDevOpsClientName = "ado";

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

        return services;
    }

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
