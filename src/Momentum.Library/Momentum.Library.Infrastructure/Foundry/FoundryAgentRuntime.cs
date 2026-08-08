using Momentum.Library.Application.Ports;
using Momentum.Library.Application.Triage;
using Momentum.Library.Runtime;
using Microsoft.Extensions.AI;

namespace Momentum.Library.Infrastructure.Foundry;

public sealed class FoundryAgentRuntime : IAgentTriageRuntime
{
    private readonly IChatClient _chatClient;

    public FoundryAgentRuntime(IChatClient chatClient)
    {
        _chatClient = chatClient;
    }

    public Task<CreationTriageResult> RunCreationTriage(CreationTriageInput input)
    {
        return new AgentTriageRuntime(_chatClient).RunCreationTriage(input);
    }

    public Task<AcceptanceTriageResult> RunAcceptanceTriage(AcceptanceTriageInput input)
    {
        return new AgentTriageRuntime(_chatClient).RunAcceptanceTriage(input);
    }
}
