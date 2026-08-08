namespace Momentum.Library.Domain.Comments;

/// <summary>
/// A file attached to a comment. The bytes live in blob storage under
/// <see cref="Id"/>; this record is the metadata stored with the comment.
/// </summary>
public sealed record CommentAttachment(
    string Id,
    string FileName,
    string ContentType,
    long Length);
