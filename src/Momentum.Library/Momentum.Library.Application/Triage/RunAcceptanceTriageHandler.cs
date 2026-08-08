using Momentum.Library.Application.Ports;
using Momentum.Library.Application.Requests;
using Momentum.Library.Domain.Auditing;
using Momentum.Library.Domain.Identity;
using Momentum.Library.Domain.Requests;
using Momentum.Library.Domain.Reviews;

namespace Momentum.Library.Application.Triage;

public sealed class RunAcceptanceTriageHandler
{
    private readonly IAgentTriageRuntime _agentRuntime;
    private readonly IAgentRunRepository _agentRuns;
    private readonly IRepositoryReader _repositoryReader;
    private readonly PublishSolutionHandler _publishSolution;
    private readonly IRequestRepository _requests;
    private readonly IAuditRepository _audit;

    public RunAcceptanceTriageHandler(
        IAgentTriageRuntime agentRuntime,
        IAgentRunRepository agentRuns,
        IRepositoryReader repositoryReader,
        PublishSolutionHandler publishSolution,
        IRequestRepository requests,
        IAuditRepository audit)
    {
        _agentRuntime = agentRuntime;
        _agentRuns = agentRuns;
        _repositoryReader = repositoryReader;
        _publishSolution = publishSolution;
        _requests = requests;
        _audit = audit;
    }

    public async Task<AcceptanceTriageResult> Handle(string requestId, string context)
    {
        var request = await _requests.GetById(requestId) ?? throw new InvalidOperationException("Request not found.");
        if (request.Status != RequestStatus.Accepted)
            throw new InvalidOperationException("Acceptance triage can only run on accepted requests.");

        var runId = Guid.NewGuid();
        await _agentRuns.RecordStart(runId, requestId, ReviewType.AcceptanceTriage.ToString());
        await _audit.Append(AgentAudit("agent.acceptanceTriage.started", "Started acceptance triage.", runId, requestId));

        try
        {
            var repoContent = await _repositoryReader.ReadRepository(new Domain.Solutions.RepositoryReference(string.Empty, string.Empty, string.Empty));
            var input = new AcceptanceTriageInput(requestId, request.Title, request.Description, context, repoContent);
            var result = await _agentRuntime.RunAcceptanceTriage(input);
            await _agentRuns.RecordResult(runId, result);

            if (!result.IsValid)
                throw new InvalidOperationException("Acceptance triage did not produce a valid result.");

            if (request.Type == RequestType.Solution)
            {
                await _publishSolution.Handle(new PublishSolutionCommand(requestId, result));

                var updated = request with { Status = RequestStatus.Accepted, UpdatedAt = DateTimeOffset.UtcNow };
                await _requests.Update(updated);
            }

            await _audit.Append(AgentAudit("agent.acceptanceTriage.completed", "Completed acceptance triage.", runId, requestId));
            return result;
        }
        catch
        {
            await _audit.Append(AgentAudit("agent.acceptanceTriage.failed", "Acceptance triage failed.", runId, requestId));
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
        ActorId = "acceptance-triage-agent",
        Summary = summary
    };
}
