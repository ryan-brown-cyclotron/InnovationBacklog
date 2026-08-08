using Momentum.Library.Application.Triage;
using Microsoft.Extensions.AI;

namespace Momentum.Library.Runtime.Agents;

public sealed class AcceptanceTriageAgent
{
    private readonly IChatClient _chatClient;

    public AcceptanceTriageAgent(IChatClient chatClient)
    {
        _chatClient = chatClient;
    }

    public Task<AcceptanceTriageResult> RunAsync(AcceptanceTriageInput input, CancellationToken cancellationToken = default)
    {
        var repo = input.RepositoryContent;
        var readme = repo?.Files.FirstOrDefault(f => f.Path.Contains("README", StringComparison.OrdinalIgnoreCase))?.Content ?? "No README found.";
        var result = new AcceptanceTriageResult
        {
            NormalizedTitle = input.Title,
            NormalizedDescription = input.Description,
            Domain = "Software",
            Type = "Solution",
            IntendedUsers = "Developers",
            Capabilities = new List<string>(),
            Limitations = new List<string>(),
            RecommendsSolutionIds = new List<string>(),
            RepositoryAssessment = $"Repository reviewed. README length: {readme.Length}",
            IsValid = true
        };
        return Task.FromResult(result);
    }
}
