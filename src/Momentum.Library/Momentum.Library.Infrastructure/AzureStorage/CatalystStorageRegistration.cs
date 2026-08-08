using Azure.Data.Tables;
using Azure.Storage.Blobs;
using Azure.Storage.Queues;
using Momentum.Library.Application.Ports;
using Microsoft.Extensions.DependencyInjection;

namespace Momentum.Library.Infrastructure.AzureStorage;

public static class CatalystStorageRegistration
{
    public static IServiceCollection AddCatalystStorage(this IServiceCollection services, string connectionString)
        => services.AddCatalystStorage(connectionString, connectionString, connectionString);

    public static IServiceCollection AddCatalystStorage(
        this IServiceCollection services,
        string tableConnectionString,
        string queueConnectionString)
        => services.AddCatalystStorage(tableConnectionString, queueConnectionString, tableConnectionString);

    public static IServiceCollection AddCatalystStorage(
        this IServiceCollection services,
        string tableConnectionString,
        string queueConnectionString,
        string blobConnectionString)
    {
        var tableOptions = new TableStorageOptions { ConnectionString = tableConnectionString };
        var queueOptions = new QueueStorageOptions { ConnectionString = queueConnectionString };
        var blobOptions = new BlobStorageOptions { ConnectionString = blobConnectionString };

        services.AddSingleton(tableOptions);
        services.AddSingleton(queueOptions);
        services.AddSingleton(blobOptions);
        services.AddScoped<IAttachmentStore, BlobAttachmentStore>();
        services.AddScoped<IRequestRepository, TableRequestRepository>();
        services.AddScoped<ISolutionRepository, TableSolutionRepository>();
        services.AddScoped<IRequestSolutionRepository, TableRequestSolutionRepository>();
        services.AddScoped<ISolutionUseRepository, TableSolutionUseRepository>();
        services.AddScoped<ICommentRepository, TableCommentRepository>();
        services.AddScoped<IAcceptanceDecisionRepository, TableAcceptanceDecisionRepository>();
        services.AddScoped<IAuditRepository, TableAuditRepository>();
        services.AddScoped<IAgentRunRepository, TableAgentRunRepository>();
        services.AddScoped<IEventProcessingRepository, TableEventProcessingRepository>();
        services.AddScoped<TableOutboxRepository>();
        services.AddScoped<IEventPublisher, AzureQueueEventPublisher>();
        services.AddScoped<IVoteRepository, TableVoteRepository>();
        services.AddScoped<IContributionRepository, TableContributionRepository>();
        services.AddScoped<ISolutionProjectionPublisher, SolutionReadmeProjectionPublisher>();
        services.AddSingleton<CatalystStorageInitializer>();

        return services;
    }
}

public sealed class CatalystStorageInitializer
{
    private readonly TableStorageOptions _tableOptions;
    private readonly QueueStorageOptions _queueOptions;
    private readonly BlobStorageOptions _blobOptions;

    public CatalystStorageInitializer(
        TableStorageOptions tableOptions,
        QueueStorageOptions queueOptions,
        BlobStorageOptions blobOptions)
    {
        _tableOptions = tableOptions;
        _queueOptions = queueOptions;
        _blobOptions = blobOptions;
    }

    public async Task InitializeAsync(CancellationToken cancellationToken = default)
    {
        var tableService = new TableServiceClient(_tableOptions.ConnectionString);
        foreach (var tableName in new[]
        {
            StorageTableNames.Requests,
            StorageTableNames.Solutions,
            StorageTableNames.RequestSolutions,
            StorageTableNames.SolutionUses,
            StorageTableNames.Comments,
            StorageTableNames.Decisions,
            StorageTableNames.AuditRecords,
            StorageTableNames.AgentRuns,
            StorageTableNames.ProcessedEvents,
            StorageTableNames.Outbox,
            StorageTableNames.ProjectionState,
            StorageTableNames.Votes,
            StorageTableNames.Contributions
        })
        {
            await tableService.CreateTableIfNotExistsAsync(tableName, cancellationToken);
        }

        var queue = new QueueClient(_queueOptions.ConnectionString, _queueOptions.QueueName);
        await queue.CreateIfNotExistsAsync(cancellationToken: cancellationToken);

        var blobService = new BlobServiceClient(_blobOptions.ConnectionString);
        await blobService
            .GetBlobContainerClient(_blobOptions.AttachmentsContainer)
            .CreateIfNotExistsAsync(cancellationToken: cancellationToken);
    }
}
