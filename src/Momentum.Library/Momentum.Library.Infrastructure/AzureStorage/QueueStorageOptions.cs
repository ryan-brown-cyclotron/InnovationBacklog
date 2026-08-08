namespace Momentum.Library.Infrastructure.AzureStorage;

public sealed class QueueStorageOptions
{
    public string ConnectionString { get; set; } = null!;
    public string QueueName { get; set; } = "momentum-events";
}
