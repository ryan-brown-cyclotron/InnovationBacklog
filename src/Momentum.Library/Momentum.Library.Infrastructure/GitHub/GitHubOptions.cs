namespace Momentum.Library.Infrastructure.GitHub;

public sealed class GitHubOptions
{
    public GitHubCredentials Credentials { get; set; } = new();
    public string HubRepositoryOwner { get; set; } = null!;
    public string HubRepositoryName { get; set; } = null!;
    public string ReadmeFilePath { get; set; } = "CATALOG.md";
    public string? DefaultBranch { get; set; } = "main";
}
