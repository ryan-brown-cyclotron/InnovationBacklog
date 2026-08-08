using Momentum.Library.Application.Engagement;
using Momentum.Library.Domain.Auditing;
using Momentum.Library.Domain.Comments;
using Momentum.Library.Domain.Engagement;
using Momentum.Library.Domain.Events;
using Momentum.Library.Domain.Identity;
using Momentum.Library.Domain.Requests;
using Momentum.Library.Domain.Reviews;
using Momentum.Library.Domain.Solutions;

namespace Momentum.Library.Application.Ports;

public interface IRequestRepository
{
    Task<Request?> GetById(string id);
    Task<IReadOnlyList<Request>> GetBySubmitter(UserId submitterId);
    Task<IReadOnlyList<Request>> GetByStatus(RequestStatus status);
    Task Save(Request request);
    Task Update(Request request);
}

public interface ISolutionRepository
{
    Task<Solution?> GetById(string id);
    Task<IReadOnlyList<Solution>> Search(string query, int skip, int take);
    Task Save(Solution solution);
    Task Update(Solution solution);
}

public interface IRequestSolutionRepository
{
    Task<RequestSolution?> Get(string requestId, string solutionId);
    Task<IReadOnlyList<RequestSolution>> GetByRequest(string requestId);
    Task<IReadOnlyList<RequestSolution>> GetBySolution(string solutionId);
    Task Save(RequestSolution relationship);
    Task Remove(RequestSolution relationship);
}

public interface ISolutionUseRepository
{
    Task<SolutionUse?> GetById(string id);
    Task<IReadOnlyList<SolutionUse>> GetBySolution(string solutionId);
    Task<IReadOnlyList<SolutionUse>> GetByUser(UserId userId);
    Task Save(SolutionUse use);
}

public interface ICommentRepository
{
    Task Add(Comment comment);
    Task<IReadOnlyList<Comment>> GetBySubject(string subjectId, HubItemType subjectType, CommentAudienceFilter filter);
}

/// <summary>
/// Binary content store for comment attachments. Metadata is the authority for
/// what a stored blob is; callers never trust a client-supplied descriptor.
/// </summary>
public interface IAttachmentStore
{
    Task<CommentAttachment> Save(string fileName, string? contentType, byte[] content, CancellationToken cancellationToken = default);
    Task<CommentAttachment?> Describe(string id, CancellationToken cancellationToken = default);
    Task<AttachmentContent?> Open(string id, CancellationToken cancellationToken = default);
}

public sealed record AttachmentContent(CommentAttachment Descriptor, Stream Content);

public interface IAcceptanceDecisionRepository
{
    Task Save(AcceptanceDecision decision);
    Task<IReadOnlyList<AcceptanceDecision>> GetByRequest(string requestId);
}

public interface IAuditRepository
{
    Task Append(AuditRecord record);
    Task<IReadOnlyList<AuditRecord>> GetBySubject(string subjectId);
    Task<IReadOnlyList<AuditRecord>> GetRecent(int take);
}

public interface IAgentRunRepository
{
    Task RecordStart(Guid runId, string subjectId, string agentType);
    Task RecordResult(Guid runId, object result);
    Task<bool> WasAlreadyProcessed(string eventId, string operationType);
}

public interface IEventPublisher
{
    Task Publish(DomainEvent domainEvent);
}

public interface IEventProcessingRepository
{
    Task<bool> TryClaim(string eventId, string operationType);
    Task Complete(string eventId, string operationType);
    Task Release(string eventId, string operationType);
}

public interface IAgentTriageRuntime
{
    Task<Triage.CreationTriageResult> RunCreationTriage(Triage.CreationTriageInput input);
    Task<Triage.AcceptanceTriageResult> RunAcceptanceTriage(Triage.AcceptanceTriageInput input);
}

public interface IRepositoryReader
{
    Task<RepositoryContent> ReadRepository(RepositoryReference reference);
}

public interface ISolutionProjectionPublisher
{
    Task<ProjectionResult> PublishSolutionReadme(Solution solution, string lastContentHash);
}

public interface IIdentityProvider
{
    Task<UserId> GetCurrentUserId();
    Task<Role> GetCurrentUserRole();
}

public interface IVoteRepository
{
    Task<Vote?> Get(HubItemReference target, UserId userId);
    Task<IReadOnlyList<Vote>> GetByTarget(HubItemReference target);
    Task<IReadOnlyList<Vote>> GetByUser(UserId userId);
    Task Save(Vote vote);
    Task Remove(Vote vote);
}

public interface IContributionRepository
{
    Task<Contribution?> GetById(string id);
    Task<Contribution?> GetOpen(HubItemReference target, UserId userId);
    Task<IReadOnlyList<Contribution>> GetByStatus(ContributionStatus status);
    Task<IReadOnlyList<Contribution>> GetByUser(UserId userId);
    Task Save(Contribution contribution);
}
