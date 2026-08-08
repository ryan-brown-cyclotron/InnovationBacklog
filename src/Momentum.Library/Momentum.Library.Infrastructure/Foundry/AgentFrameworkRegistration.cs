using Momentum.Library.Application.Ports;
using Microsoft.Extensions.AI;
using Microsoft.Extensions.DependencyInjection;

namespace Momentum.Library.Infrastructure.Foundry;

public static class AgentFrameworkRegistration
{
    public static IServiceCollection AddCatalystAgentRuntime(this IServiceCollection services, FoundryOptions options)
    {
        services.AddSingleton(options);
        services.AddSingleton<IAgentTriageRuntime, FoundryAgentRuntime>();
        return services;
    }

    public static IServiceCollection AddCatalystAgentRuntime<TChatClient>(this IServiceCollection services, FoundryOptions options)
        where TChatClient : class, IChatClient
    {
        services.AddSingleton(options);
        services.AddSingleton<IChatClient, TChatClient>();
        services.AddSingleton<IAgentTriageRuntime, FoundryAgentRuntime>();
        return services;
    }
}
