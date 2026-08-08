using Momentum.Library.Domain.Identity;
using Momentum.Library.Domain.Requests;
using Momentum.Library.Domain.Solutions;

namespace Momentum.Library.Domain.Visibility;

/// <summary>
/// Whether something has cleared review. Nothing reaches the hub at large until
/// it is <see cref="Approved"/>.
/// </summary>
public enum ApprovalState
{
    Pending,
    Approved,
    Rejected
}

public static class ApprovalStates
{
    /// <summary>
    /// Ideas carry their approval in <see cref="RequestStatus"/>. Everything
    /// before a decision — including the triage states — is pending.
    /// </summary>
    public static ApprovalState Of(RequestStatus status) => status switch
    {
        RequestStatus.Accepted => ApprovalState.Approved,
        RequestStatus.Rejected => ApprovalState.Rejected,
        _ => ApprovalState.Pending
    };

    /// <summary>
    /// Solutions carry theirs in <see cref="SolutionStatus"/>. Retired solutions
    /// were approved once and stay visible, so people can see what a team moved
    /// off and why.
    /// </summary>
    public static ApprovalState Of(SolutionStatus status) => status switch
    {
        SolutionStatus.Published or SolutionStatus.Retired => ApprovalState.Approved,
        SolutionStatus.Rejected => ApprovalState.Rejected,
        _ => ApprovalState.Pending
    };

    /// <summary>Approvers and administrators review; both must see what is waiting.</summary>
    public static bool CanReview(Role role) => role is Role.Approver or Role.Administrator;
}
