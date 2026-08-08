using Momentum.Library.Application.Ports;
using Momentum.Library.Application.Requests;
using Momentum.Library.Domain.Auditing;
using Momentum.Library.Domain.Comments;
using Momentum.Library.Domain.Identity;
using Momentum.Library.Domain.Requests;

namespace Momentum.Library.Application.Triage;

public sealed class RunCreationTriageHandler
{
    private readonly IAgentTriageRuntime _agentRuntime;
    private readonly IAgentRunRepository _agentRuns;
    private readonly ICommentRepository _comments;
    private readonly IRequestRepository _requests;
    private readonly IAuditRepository _audit;

    public RunCreationTriageHandler(
        IAgentTriageRuntime agentRuntime,
        IAgentRunRepository agentRuns,
        ICommentRepository comments,
        IRequestRepository requests,
        IAuditRepository audit)
    {
        _agentRuntime = agentRuntime;
        _agentRuns = agentRuns;
        _comments = comments;
        _requests = requests;
        _audit = audit;
    }

    public async Task<CreationTriageResult> Handle(string requestId, string context)
    {
        var request = await _requests.GetById(requestId) ?? throw new InvalidOperationException("Request not found.");
        if (request.Status != RequestStatus.Created)
            throw new InvalidOperationException("Creation triage can only run on newly created requests.");

        var runId = Guid.NewGuid();
        await _agentRuns.RecordStart(runId, requestId, Domain.Reviews.ReviewType.CreationTriage.ToString());
        await _audit.Append(AgentAudit("agent.creationTriage.started", "Started creation triage.", runId, requestId));

        try
        {
            var input = new CreationTriageInput(request.Id, request.Title, request.Description, context);
            var result = await _agentRuntime.RunCreationTriage(input);
            await _agentRuns.RecordResult(runId, result);

            if (!result.IsValid)
                throw new InvalidOperationException("Creation triage did not produce a valid result.");

            if (!string.IsNullOrWhiteSpace(result.ApproverOnlyComment))
            {
                await _comments.Add(new Comment
                {
                    SubjectId = requestId,
                    SubjectType = Domain.Engagement.HubItemType.Request,
                    AuthorId = new UserId("creation-triage-agent"),
                    Audience = CommentAudience.ApproversOnly,
                    Body = result.ApproverOnlyComment
                });
            }

            if (!string.IsNullOrWhiteSpace(result.SubmitterVisibleContext))
            {
                await _comments.Add(new Comment
                {
                    SubjectId = requestId,
                    SubjectType = Domain.Engagement.HubItemType.Request,
                    AuthorId = new UserId("creation-triage-agent"),
                    Audience = request.Type == RequestType.Solution ? CommentAudience.SubmitterAndApprovers : CommentAudience.Authenticated,
                    Body = result.SubmitterVisibleContext
                });
            }

            await new PublishRequestHandler(_requests, _audit)
                .Handle(new PublishRequestCommand(requestId, result));

            var updated = request with { Status = RequestStatus.AwaitingApproval, UpdatedAt = DateTimeOffset.UtcNow };
            await _requests.Update(updated);
            await _audit.Append(AgentAudit("agent.creationTriage.completed", "Completed creation triage.", runId, requestId));

            return result;
        }
        catch
        {
            await _audit.Append(AgentAudit("agent.creationTriage.failed", "Creation triage failed.", runId, requestId));
            throw;
        }
    }

    private static AuditRecord AgentAudit(string action, string summary, Guid runId, string requestId) => new()
    {
        Action = action,
        ResourceType = "agentRun",
        ResourceId = runId.ToString("N"),
        SubjectId = requestId,
        ActorType = AuditActorType.Agent,
        ActorId = "creation-triage-agent",
        Summary = summary
    };
}
