using Momentum.Library.Application.Ports;

namespace Momentum.Tests.Fakes;

public sealed class CapturingEventPublisher : IEventPublisher
{
    public List<Momentum.Library.Domain.Events.DomainEvent> Published { get; } = new();

    public Task Publish(Momentum.Library.Domain.Events.DomainEvent domainEvent)
    {
        Published.Add(domainEvent);
        return Task.CompletedTask;
    }
}

public sealed class InMemoryAuditRepository : IAuditRepository
{
    public List<Momentum.Library.Domain.Auditing.AuditRecord> Records { get; } = new();

    public Task Append(Momentum.Library.Domain.Auditing.AuditRecord record)
    {
        Records.Add(record);
        return Task.CompletedTask;
    }

    public Task<IReadOnlyList<Momentum.Library.Domain.Auditing.AuditRecord>> GetBySubject(string subjectId)
        => Task.FromResult<IReadOnlyList<Momentum.Library.Domain.Auditing.AuditRecord>>(Records.Where(r => r.SubjectId == subjectId).ToList());

    public Task<IReadOnlyList<Momentum.Library.Domain.Auditing.AuditRecord>> GetRecent(int take)
        => Task.FromResult<IReadOnlyList<Momentum.Library.Domain.Auditing.AuditRecord>>(Records.Take(take).ToList());
}

public sealed class InMemoryRequestRepository : IRequestRepository
{
    private readonly Dictionary<string, Momentum.Library.Domain.Requests.Request> _store = new();

    public Task<Momentum.Library.Domain.Requests.Request?> GetById(string id)
    {
        _store.TryGetValue(id, out var request);
        return Task.FromResult(request);
    }

    public Task<IReadOnlyList<Momentum.Library.Domain.Requests.Request>> GetBySubmitter(Momentum.Library.Domain.Identity.UserId submitterId)
    {
        var results = _store.Values.Where(r => r.SubmittedBy.Value == submitterId.Value).ToList();
        return Task.FromResult<IReadOnlyList<Momentum.Library.Domain.Requests.Request>>(results);
    }

    public async Task<IReadOnlyList<Momentum.Library.Domain.Requests.Request>> GetByStatus(Momentum.Library.Domain.Requests.RequestStatus status)
    {
        await Task.Yield();
        return _store.Values.Where(r => r.Status == status).ToList();
    }

    public Task Save(Momentum.Library.Domain.Requests.Request request)
    {
        _store[request.Id] = request;
        return Task.CompletedTask;
    }

    public Task Update(Momentum.Library.Domain.Requests.Request request)
    {
        _store[request.Id] = request;
        return Task.CompletedTask;
    }
}

public sealed class InMemorySolutionRepository : ISolutionRepository
{
    private readonly Dictionary<string, Momentum.Library.Domain.Solutions.Solution> _store = new();

    public Task<Momentum.Library.Domain.Solutions.Solution?> GetById(string id)
    {
        _store.TryGetValue(id, out var solution);
        return Task.FromResult(solution);
    }

    public Task<IReadOnlyList<Momentum.Library.Domain.Solutions.Solution>> Search(string query, int skip, int take)
    {
        IEnumerable<Momentum.Library.Domain.Solutions.Solution> matched = _store.Values;
        if (!string.IsNullOrWhiteSpace(query))
            matched = matched.Where(s => s.Title.Contains(query, StringComparison.OrdinalIgnoreCase)
                || s.Description.Contains(query, StringComparison.OrdinalIgnoreCase));
        var page = matched.Skip(skip).Take(take).ToList();
        return Task.FromResult<IReadOnlyList<Momentum.Library.Domain.Solutions.Solution>>(page);
    }

    public Task Save(Momentum.Library.Domain.Solutions.Solution solution)
    {
        _store[solution.Id] = solution;
        return Task.CompletedTask;
    }

    public Task Update(Momentum.Library.Domain.Solutions.Solution solution)
    {
        _store[solution.Id] = solution;
        return Task.CompletedTask;
    }
}

public sealed class InMemoryRequestSolutionRepository : IRequestSolutionRepository
{
    private readonly Dictionary<(string RequestId, string SolutionId), Momentum.Library.Domain.Engagement.RequestSolution> _store = new();

    public Task<Momentum.Library.Domain.Engagement.RequestSolution?> Get(string requestId, string solutionId)
    {
        _store.TryGetValue((requestId, solutionId), out var rel);
        return Task.FromResult(rel);
    }

    public Task<IReadOnlyList<Momentum.Library.Domain.Engagement.RequestSolution>> GetByRequest(string requestId)
    {
        var results = _store.Values.Where(r => r.RequestId == requestId).ToList();
        return Task.FromResult<IReadOnlyList<Momentum.Library.Domain.Engagement.RequestSolution>>(results);
    }

    public Task<IReadOnlyList<Momentum.Library.Domain.Engagement.RequestSolution>> GetBySolution(string solutionId)
    {
        var results = _store.Values.Where(r => r.SolutionId == solutionId).ToList();
        return Task.FromResult<IReadOnlyList<Momentum.Library.Domain.Engagement.RequestSolution>>(results);
    }

    public Task Save(Momentum.Library.Domain.Engagement.RequestSolution relationship)
    {
        _store[(relationship.RequestId, relationship.SolutionId)] = relationship;
        return Task.CompletedTask;
    }

    public Task Remove(Momentum.Library.Domain.Engagement.RequestSolution relationship)
    {
        _store.Remove((relationship.RequestId, relationship.SolutionId));
        return Task.CompletedTask;
    }
}

public sealed class InMemorySolutionUseRepository : ISolutionUseRepository
{
    private readonly Dictionary<string, Momentum.Library.Domain.Engagement.SolutionUse> _store = new();

    public Task<Momentum.Library.Domain.Engagement.SolutionUse?> GetById(string id)
    {
        _store.TryGetValue(id, out var use);
        return Task.FromResult(use);
    }

    public Task<IReadOnlyList<Momentum.Library.Domain.Engagement.SolutionUse>> GetBySolution(string solutionId)
    {
        var results = _store.Values.Where(u => u.SolutionId == solutionId).ToList();
        return Task.FromResult<IReadOnlyList<Momentum.Library.Domain.Engagement.SolutionUse>>(results);
    }

    public Task<IReadOnlyList<Momentum.Library.Domain.Engagement.SolutionUse>> GetByUser(Momentum.Library.Domain.Identity.UserId userId)
    {
        var results = _store.Values.Where(u => u.StartedBy.Value == userId.Value).ToList();
        return Task.FromResult<IReadOnlyList<Momentum.Library.Domain.Engagement.SolutionUse>>(results);
    }

    public Task Save(Momentum.Library.Domain.Engagement.SolutionUse use)
    {
        _store[use.Id] = use;
        return Task.CompletedTask;
    }
}

public sealed class InMemoryVoteRepository : IVoteRepository
{
    private readonly Dictionary<(string TargetKey, string UserId), Momentum.Library.Domain.Engagement.Vote> _store = new();

    public Task<Momentum.Library.Domain.Engagement.Vote?> Get(Momentum.Library.Domain.Engagement.HubItemReference target, Momentum.Library.Domain.Identity.UserId userId)
    {
        _store.TryGetValue((target.TargetKey, userId.Value), out var vote);
        return Task.FromResult(vote);
    }

    public Task<IReadOnlyList<Momentum.Library.Domain.Engagement.Vote>> GetByTarget(Momentum.Library.Domain.Engagement.HubItemReference target)
    {
        var results = _store.Values.Where(v => v.Target.TargetKey == target.TargetKey).ToList();
        return Task.FromResult<IReadOnlyList<Momentum.Library.Domain.Engagement.Vote>>(results);
    }

    public Task<IReadOnlyList<Momentum.Library.Domain.Engagement.Vote>> GetByUser(Momentum.Library.Domain.Identity.UserId userId)
    {
        var results = _store.Values.Where(v => v.UserId.Value == userId.Value).ToList();
        return Task.FromResult<IReadOnlyList<Momentum.Library.Domain.Engagement.Vote>>(results);
    }

    public Task Save(Momentum.Library.Domain.Engagement.Vote vote)
    {
        _store[(vote.Target.TargetKey, vote.UserId.Value)] = vote;
        return Task.CompletedTask;
    }

    public Task Remove(Momentum.Library.Domain.Engagement.Vote vote)
    {
        _store.Remove((vote.Target.TargetKey, vote.UserId.Value));
        return Task.CompletedTask;
    }
}

public sealed class InMemoryContributionRepository : IContributionRepository
{
    private readonly Dictionary<string, Momentum.Library.Domain.Engagement.Contribution> _store = new();

    public Task<Momentum.Library.Domain.Engagement.Contribution?> GetById(string id)
    {
        _store.TryGetValue(id, out var contribution);
        return Task.FromResult(contribution);
    }

    public Task<Momentum.Library.Domain.Engagement.Contribution?> GetOpen(Momentum.Library.Domain.Engagement.HubItemReference target, Momentum.Library.Domain.Identity.UserId userId)
    {
        var open = _store.Values.FirstOrDefault(c =>
            c.Target.TargetKey == target.TargetKey
            && c.RequestedBy.Value == userId.Value
            && c.Status is not Momentum.Library.Domain.Engagement.ContributionStatus.Rejected
                and not Momentum.Library.Domain.Engagement.ContributionStatus.Withdrawn);
        return Task.FromResult(open);
    }

    public Task<IReadOnlyList<Momentum.Library.Domain.Engagement.Contribution>> GetByStatus(Momentum.Library.Domain.Engagement.ContributionStatus status)
    {
        var results = _store.Values.Where(c => c.Status == status).OrderBy(c => c.CreatedAt).ToList();
        return Task.FromResult<IReadOnlyList<Momentum.Library.Domain.Engagement.Contribution>>(results);
    }

    public Task<IReadOnlyList<Momentum.Library.Domain.Engagement.Contribution>> GetByUser(Momentum.Library.Domain.Identity.UserId userId)
    {
        var results = _store.Values.Where(c => c.RequestedBy.Value == userId.Value).ToList();
        return Task.FromResult<IReadOnlyList<Momentum.Library.Domain.Engagement.Contribution>>(results);
    }

    public Task Save(Momentum.Library.Domain.Engagement.Contribution contribution)
    {
        _store[contribution.Id] = contribution;
        return Task.CompletedTask;
    }
}

public sealed class InMemoryCommentRepository : ICommentRepository
{
    public List<Momentum.Library.Domain.Comments.Comment> Stored { get; } = new();

    public Task Add(Momentum.Library.Domain.Comments.Comment comment)
    {
        Stored.Add(comment);
        return Task.CompletedTask;
    }

    public Task<IReadOnlyList<Momentum.Library.Domain.Comments.Comment>> GetBySubject(string subjectId, Momentum.Library.Domain.Engagement.HubItemType subjectType, CommentAudienceFilter filter)
    {
        var results = Stored.Where(c => c.SubjectId == subjectId && c.SubjectType == subjectType && filter.Includes(c.Audience)).ToList();
        return Task.FromResult<IReadOnlyList<Momentum.Library.Domain.Comments.Comment>>(results);
    }
}

public sealed class InMemoryAttachmentStore : IAttachmentStore
{
    private readonly Dictionary<string, (Momentum.Library.Domain.Comments.CommentAttachment Descriptor, byte[] Content)> _store = new();

    public Task<Momentum.Library.Domain.Comments.CommentAttachment> Save(
        string fileName,
        string? contentType,
        byte[] content,
        CancellationToken cancellationToken = default)
    {
        var id = Guid.NewGuid().ToString("N");
        var descriptor = new Momentum.Library.Domain.Comments.CommentAttachment(
            id,
            fileName,
            string.IsNullOrWhiteSpace(contentType) ? "application/octet-stream" : contentType,
            content.Length);
        _store[id] = (descriptor, content);
        return Task.FromResult(descriptor);
    }

    public Task<Momentum.Library.Domain.Comments.CommentAttachment?> Describe(string id, CancellationToken cancellationToken = default)
        => Task.FromResult(_store.TryGetValue(id, out var entry) ? entry.Descriptor : null);

    public Task<AttachmentContent?> Open(string id, CancellationToken cancellationToken = default)
        => Task.FromResult(_store.TryGetValue(id, out var entry)
            ? new AttachmentContent(entry.Descriptor, new MemoryStream(entry.Content, writable: false))
            : null);
}

public sealed class InMemoryAcceptanceDecisionRepository : IAcceptanceDecisionRepository
{
    public List<Momentum.Library.Domain.Reviews.AcceptanceDecision> Stored { get; } = new();

    public Task Save(Momentum.Library.Domain.Reviews.AcceptanceDecision decision)
    {
        Stored.Add(decision);
        return Task.CompletedTask;
    }

    public Task<IReadOnlyList<Momentum.Library.Domain.Reviews.AcceptanceDecision>> GetByRequest(string requestId)
    {
        var results = Stored.Where(d => d.RequestId == requestId).OrderBy(d => d.DecidedAt).ToList();
        return Task.FromResult<IReadOnlyList<Momentum.Library.Domain.Reviews.AcceptanceDecision>>(results);
    }
}
