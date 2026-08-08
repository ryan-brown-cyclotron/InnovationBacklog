using Momentum.Library.Application.Comments;
using Momentum.Library.Application.Ports;
using Momentum.Library.Domain.Comments;
using Momentum.Library.Domain.Engagement;
using Momentum.Library.Domain.Identity;
using Momentum.Tests.Fakes;

namespace Momentum.Tests.Application;

public class AddCommentHandlerTests
{
    private static readonly UserId Author = new("dev@org");

    private readonly InMemoryCommentRepository _comments = new();
    private readonly InMemoryAuditRepository _audit = new();
    private readonly InMemoryAttachmentStore _attachments = new();

    private AddCommentHandler CreateHandler() => new(_comments, _audit);

    private AddCommentCommand Command(
        string body = "Some context",
        IReadOnlyList<CommentAttachment>? attachments = null) =>
        new("subject1", HubItemType.Request, Author, Role.Submitter, CommentAudience.Authenticated, body, attachments);

    [Fact]
    public async Task Handle_PersistsCommentAndAudit()
    {
        var comment = await CreateHandler().Handle(Command());

        Assert.Equal("Some context", comment.Body);
        Assert.Empty(comment.Attachments);
        Assert.Single(_comments.Stored);
        Assert.Contains(_audit.Records, r => r.Action == "comment.added");
    }

    [Fact]
    public async Task Handle_StoresAttachmentsWithTheComment()
    {
        var stored = await _attachments.Save("diagram.png", "image/png", new byte[] { 1, 2, 3 });

        var comment = await CreateHandler().Handle(Command(attachments: new[] { stored }));

        var attachment = Assert.Single(comment.Attachments);
        Assert.Equal(stored.Id, attachment.Id);
        Assert.Equal("diagram.png", attachment.FileName);
        Assert.Equal("image/png", attachment.ContentType);
        Assert.Equal(3, attachment.Length);
        Assert.Contains(_audit.Records, r => r.Action == "comment.added" && r.Details["attachments"] == "1");
    }

    [Fact]
    public async Task Handle_AllowsAnEmptyBodyWhenSomethingIsAttached()
    {
        var stored = await _attachments.Save("notes.txt", "text/plain", new byte[] { 9 });

        var comment = await CreateHandler().Handle(Command(body: "   ", attachments: new[] { stored }));

        Assert.Equal(string.Empty, comment.Body);
        Assert.Single(comment.Attachments);
    }

    [Fact]
    public async Task Handle_RejectsAnEmptyBodyWithNoAttachments()
    {
        await Assert.ThrowsAsync<InvalidOperationException>(() => CreateHandler().Handle(Command(body: "   ")));
    }

    [Fact]
    public async Task Handle_RejectsApproversOnlyAudienceForSubmitters()
    {
        var command = new AddCommentCommand(
            "subject1", HubItemType.Request, Author, Role.Submitter, CommentAudience.ApproversOnly, "Private");

        await Assert.ThrowsAsync<InvalidOperationException>(() => CreateHandler().Handle(command));
    }

    [Fact]
    public async Task Handle_KeepsSolutionCommentsOnTheSolutionSubject()
    {
        var command = new AddCommentCommand(
            "solution1", HubItemType.Solution, Author, Role.Submitter, CommentAudience.Authenticated, "Nice work");

        await CreateHandler().Handle(command);

        var onSolution = await _comments.GetBySubject("solution1", HubItemType.Solution, CommentAudienceFilter.ForRole(Role.Submitter));
        var onRequest = await _comments.GetBySubject("solution1", HubItemType.Request, CommentAudienceFilter.ForRole(Role.Submitter));
        Assert.Single(onSolution);
        Assert.Empty(onRequest);
    }
}

public class AttachmentStoreTests
{
    private readonly InMemoryAttachmentStore _attachments = new();

    [Fact]
    public async Task Describe_ReturnsNullForAnUnknownId()
    {
        Assert.Null(await _attachments.Describe("missing"));
    }

    [Fact]
    public async Task Open_ReturnsTheStoredBytes()
    {
        var stored = await _attachments.Save("data.bin", null, new byte[] { 4, 5, 6, 7 });

        var opened = await _attachments.Open(stored.Id);

        Assert.NotNull(opened);
        Assert.Equal("application/octet-stream", opened!.Descriptor.ContentType);
        using var buffer = new MemoryStream();
        await opened.Content.CopyToAsync(buffer);
        Assert.Equal(new byte[] { 4, 5, 6, 7 }, buffer.ToArray());
    }
}
