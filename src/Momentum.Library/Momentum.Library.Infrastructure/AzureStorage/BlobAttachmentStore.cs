using Azure.Storage.Blobs;
using Azure.Storage.Blobs.Models;
using Momentum.Library.Application.Ports;
using Momentum.Library.Domain.Comments;

namespace Momentum.Library.Infrastructure.AzureStorage;

/// <summary>
/// Stores comment attachments as blobs in a single container, one blob per
/// attachment id. The original file name and content type travel as blob
/// metadata/headers so <see cref="Describe"/> can rebuild a trustworthy
/// descriptor without consulting the client.
/// </summary>
public sealed class BlobAttachmentStore : IAttachmentStore
{
    private const string FileNameMetadataKey = "fileName";
    private const string DefaultContentType = "application/octet-stream";

    private readonly BlobContainerClient _container;

    public BlobAttachmentStore(BlobStorageOptions options)
    {
        var service = new BlobServiceClient(options.ConnectionString);
        _container = service.GetBlobContainerClient(options.AttachmentsContainer);
    }

    public async Task<CommentAttachment> Save(
        string fileName,
        string? contentType,
        byte[] content,
        CancellationToken cancellationToken = default)
    {
        if (content.Length == 0)
            throw new InvalidOperationException("Attachment content is empty.");

        var safeName = SanitizeFileName(fileName);
        var resolvedContentType = string.IsNullOrWhiteSpace(contentType) ? DefaultContentType : contentType;
        var id = Guid.NewGuid().ToString("N");
        var blob = _container.GetBlobClient(id);

        using var stream = new MemoryStream(content, writable: false);
        await blob.UploadAsync(
            stream,
            new BlobUploadOptions
            {
                HttpHeaders = new BlobHttpHeaders { ContentType = resolvedContentType },
                Metadata = new Dictionary<string, string> { [FileNameMetadataKey] = safeName }
            },
            cancellationToken);

        return new CommentAttachment(id, safeName, resolvedContentType, content.Length);
    }

    public async Task<CommentAttachment?> Describe(string id, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(id)) return null;
        var blob = _container.GetBlobClient(id);
        try
        {
            var properties = await blob.GetPropertiesAsync(cancellationToken: cancellationToken);
            return ToDescriptor(id, properties.Value);
        }
        catch (Azure.RequestFailedException)
        {
            return null;
        }
    }

    public async Task<AttachmentContent?> Open(string id, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(id)) return null;
        var blob = _container.GetBlobClient(id);
        try
        {
            var properties = await blob.GetPropertiesAsync(cancellationToken: cancellationToken);
            var download = await blob.OpenReadAsync(cancellationToken: cancellationToken);
            return new AttachmentContent(ToDescriptor(id, properties.Value), download);
        }
        catch (Azure.RequestFailedException)
        {
            return null;
        }
    }

    private static CommentAttachment ToDescriptor(string id, BlobProperties properties)
    {
        properties.Metadata.TryGetValue(FileNameMetadataKey, out var fileName);
        return new CommentAttachment(
            id,
            string.IsNullOrWhiteSpace(fileName) ? id : fileName,
            string.IsNullOrWhiteSpace(properties.ContentType) ? DefaultContentType : properties.ContentType,
            properties.ContentLength);
    }

    /// <summary>
    /// Keeps the leaf name only. The uploaded name is echoed back in a download
    /// header, so path separators and control characters must not survive.
    /// </summary>
    private static string SanitizeFileName(string fileName)
    {
        if (string.IsNullOrWhiteSpace(fileName))
            throw new InvalidOperationException("Attachment file name is required.");

        var leaf = fileName.Replace('\\', '/').Split('/').Last().Trim();
        var cleaned = new string(leaf.Where(c => !char.IsControl(c) && c != '"').ToArray());
        if (cleaned.Length == 0 || cleaned is "." or "..")
            throw new InvalidOperationException("Attachment file name is not valid.");
        return cleaned.Length > 200 ? cleaned[^200..] : cleaned;
    }
}
