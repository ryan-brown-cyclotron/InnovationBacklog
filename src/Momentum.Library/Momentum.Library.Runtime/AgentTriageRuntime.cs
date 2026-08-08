using Momentum.Library.Application.Ports;
using Momentum.Library.Application.Triage;
using Momentum.Library.Runtime.Agents;
using Microsoft.Extensions.AI;

namespace Momentum.Library.Runtime;

public sealed class AgentTriageRuntime : IAgentTriageRuntime
{
    private readonly IChatClient? _chatClient;

    public AgentTriageRuntime(IChatClient? chatClient = null)
    {
        _chatClient = chatClient;
    }

    public Task<CreationTriageResult> RunCreationTriage(CreationTriageInput input)
    {
        return new CreationTriageAgent(_chatClient!).RunAsync(input);
    }

    public Task<AcceptanceTriageResult> RunAcceptanceTriage(AcceptanceTriageInput input)
    {
        return new AcceptanceTriageAgent(_chatClient!).RunAsync(input);
    }
}
