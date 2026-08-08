using Momentum.Library.Application.Triage;
using Microsoft.Extensions.AI;

namespace Momentum.Library.Runtime.Agents;

public sealed class CreationTriageAgent
{
    private readonly IChatClient _chatClient;

    public CreationTriageAgent(IChatClient chatClient)
    {
        _chatClient = chatClient;
    }

    public Task<CreationTriageResult> RunAsync(CreationTriageInput input, CancellationToken cancellationToken = default)
    {
        var result = new CreationTriageResult
        {
            Title = input.Title,
            Description = input.Description,
            ApproverOnlyComment = "Triaged the new request.",
            SubmitterVisibleContext = "Your request is being reviewed.",
            IsValid = true
        };
        return Task.FromResult(result);
    }
}
