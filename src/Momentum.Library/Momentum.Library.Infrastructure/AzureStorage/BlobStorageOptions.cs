namespace Momentum.Library.Infrastructure.AzureStorage;

public sealed class BlobStorageOptions
{
    public string ConnectionString { get; set; } = null!;
    public string AttachmentsContainer { get; set; } = "comment-attachments";
}
