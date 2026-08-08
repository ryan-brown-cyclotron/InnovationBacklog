namespace Momentum.Library.Domain.Requests;

public enum RequestStatus
{
    Draft,
    Created,
    TriageRunning,
    AwaitingApproval,
    Accepted,
    Rejected,
    TriageFailed,
    PublicationFailed,
    ProjectionFailed
}

public enum RequestType
{
    Backlog,
    Solution
}
