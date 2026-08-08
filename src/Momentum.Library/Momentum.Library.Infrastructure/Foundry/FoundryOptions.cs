namespace Momentum.Library.Infrastructure.Foundry;

public sealed class FoundryOptions
{
    public string ProjectEndpoint { get; set; } = null!;
    public string ModelDeploymentName { get; set; } = null!;
    public string AgentIdentity { get; set; } = null!;
}
