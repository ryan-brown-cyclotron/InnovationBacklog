using Momentum.Library.Application.Ports;
using Momentum.Library.Domain.Solutions;

namespace Momentum.Library.Infrastructure.GitHub;

public sealed class GitHubMcpClient : IRepositoryReader
{
    public Task<RepositoryContent> ReadRepository(RepositoryReference reference)
    {
        // Placeholder for an external GitHub MCP server reader.
        return Task.FromResult(new RepositoryContent());
    }
}
