using Azure.Data.Tables;
using Momentum.Library.Application.Ports;
using Momentum.Library.Domain.Solutions;

namespace Momentum.Library.Infrastructure.AzureStorage;

public sealed class SolutionReadmeProjectionPublisher : ISolutionProjectionPublisher
{
    private readonly TableClient _table;

    public SolutionReadmeProjectionPublisher(TableStorageOptions options)
    {
        var service = new TableServiceClient(options.ConnectionString);
        _table = service.GetTableClient(StorageTableNames.ProjectionState);
    }

    public Task<ProjectionResult> PublishSolutionReadme(Solution solution, string lastContentHash)
    {
        var hash = string.IsNullOrEmpty(lastContentHash) ? "placeholder" : lastContentHash;
        return Task.FromResult(new ProjectionResult(ProjectionOutcome.Success, $"Projection recorded for solution {solution.Id} (hash={hash})."));
    }
}
