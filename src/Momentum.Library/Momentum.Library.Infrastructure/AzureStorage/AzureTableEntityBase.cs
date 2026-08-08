using Azure;
using Azure.Data.Tables;

namespace Momentum.Library.Infrastructure.AzureStorage;

public abstract class AzureTableEntityBase : ITableEntity
{
    public string PartitionKey { get; set; } = null!;
    public string RowKey { get; set; } = null!;
    public DateTimeOffset? Timestamp { get; set; }
    public ETag ETag { get; set; }
}
