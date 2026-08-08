namespace Momentum.Library.Domain.Solutions;

public enum SolutionStatus
{
    /// <summary>Shared, waiting for a reviewer. Not visible to the hub at large.</summary>
    AwaitingApproval,
    Published,
    Rejected,
    Retired,
    ProjectionFailed
}

public enum SolutionType
{
    Library,
    Service,
    Template,
    Application,
    Pattern,
    Other
}
