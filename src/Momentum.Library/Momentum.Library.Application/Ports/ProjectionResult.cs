namespace Momentum.Library.Application.Ports;

public enum ProjectionOutcome
{
    Success,
    RetryScheduled,
    Failed
}

public sealed record ProjectionResult(ProjectionOutcome Outcome, string Message = "");
