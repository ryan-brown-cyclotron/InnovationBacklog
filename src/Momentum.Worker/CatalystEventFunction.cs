using System.Text.Json;
using Momentum.Library.Application.Engagement;
using Momentum.Library.Application.Ports;
using Momentum.Library.Application.Requests;
using Momentum.Library.Application.Triage;
using Momentum.Library.Domain.Engagement;
using Momentum.Library.Domain.Requests;
using Momentum.Library.Domain.Solutions;
using Momentum.Library.Runtime.Events;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace Momentum.Worker;

public sealed class CatalystEventFunction
{
    private static readonly JsonSerializerOptions JsonOptions = new() { PropertyNameCaseInsensitive = true };
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<CatalystEventFunction> _logger;

    public CatalystEventFunction(IServiceScopeFactory scopeFactory, ILogger<CatalystEventFunction> logger)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    [Function(nameof(CatalystEventFunction))]
    public async Task Run(
        [QueueTrigger("momentum-events", Connection = "ConnectionStrings:queues")] string message,
        CancellationToken cancellationToken)
    {
        var envelope = JsonSerializer.Deserialize<DomainEventEnvelope>(message, JsonOptions)
            ?? throw new InvalidOperationException("The queue message is not a Momentum event envelope.");

        await using var scope = _scopeFactory.CreateAsyncScope();
        var processing = scope.ServiceProvider.GetRequiredService<IEventProcessingRepository>();
        if (!await processing.TryClaim(envelope.EventId, envelope.EventType))
        {
            _logger.LogInformation("Skipping duplicate event {EventId} ({EventType}).", envelope.EventId, envelope.EventType);
            return;
        }

        try
        {
            await DispatchAsync(envelope, scope.ServiceProvider);
            await processing.Complete(envelope.EventId, envelope.EventType);
        }
        catch
        {
            await processing.Release(envelope.EventId, envelope.EventType);
            throw;
        }
    }

    private async Task DispatchAsync(DomainEventEnvelope envelope, IServiceProvider services)
    {
        switch (envelope.EventType)
        {
            case nameof(RequestSubmitted):
            {
                var domainEvent = JsonSerializer.Deserialize<RequestSubmitted>(envelope.Body, JsonOptions)
                    ?? throw new InvalidOperationException("RequestSubmitted payload is invalid.");
                var handler = services.GetRequiredService<RunCreationTriageHandler>();
                await handler.Handle(domainEvent.RequestId, "Automated Momentum creation triage.");
                break;
            }
            case nameof(RequestAccepted):
            {
                var domainEvent = JsonSerializer.Deserialize<RequestAccepted>(envelope.Body, JsonOptions)
                    ?? throw new InvalidOperationException("RequestAccepted payload is invalid.");
                var handler = services.GetRequiredService<RunAcceptanceTriageHandler>();
                await handler.Handle(domainEvent.RequestId, "Automated Momentum acceptance triage.");
                break;
            }
            case nameof(VoteAdded):
                _logger.LogInformation("VoteAdded received for {EventId}.", envelope.EventId);
                break;
            case nameof(VoteRemoved):
                _logger.LogInformation("VoteRemoved received for {EventId}.", envelope.EventId);
                break;
            case nameof(SolutionUseStarted):
                _logger.LogInformation("SolutionUseStarted received for {EventId}.", envelope.EventId);
                break;
            case nameof(SolutionUseCompleted):
                _logger.LogInformation("SolutionUseCompleted received for {EventId}.", envelope.EventId);
                break;
            case nameof(SolutionUseStatusChanged):
                _logger.LogInformation("SolutionUseStatusChanged received for {EventId}.", envelope.EventId);
                break;
            case nameof(SolutionSubmitted):
            case nameof(SolutionAccepted):
            case nameof(SolutionPublished):
                _logger.LogInformation("Lifecycle event {EventType} received for {EventId}.", envelope.EventType, envelope.EventId);
                break;
            case nameof(SolutionLinkedToRequest):
            case nameof(SolutionUnlinkedFromRequest):
            case nameof(CanonicalSolutionSelected):
            case nameof(CanonicalSolutionCleared):
                _logger.LogInformation("Relationship event {EventType} received for {EventId}.", envelope.EventType, envelope.EventId);
                break;
            case nameof(ContributionCreated):
            case nameof(ContributionAccepted):
            case nameof(ContributionRejected):
            case nameof(ContributionWithdrawn):
                _logger.LogInformation("Contribution event {EventType} received for {EventId}.", envelope.EventType, envelope.EventId);
                break;
            default:
                throw new InvalidOperationException($"Unsupported Momentum event type '{envelope.EventType}'.");
        }
    }
}
