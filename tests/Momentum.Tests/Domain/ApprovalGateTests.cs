using Momentum.Library.Domain.Identity;
using Momentum.Library.Domain.Requests;
using Momentum.Library.Domain.Solutions;
using Momentum.Library.Domain.Visibility;

namespace Momentum.Tests.Domain;

public class ApprovalStateTests
{
    [Theory]
    [InlineData(RequestStatus.Draft, ApprovalState.Pending)]
    [InlineData(RequestStatus.Created, ApprovalState.Pending)]
    [InlineData(RequestStatus.TriageRunning, ApprovalState.Pending)]
    [InlineData(RequestStatus.AwaitingApproval, ApprovalState.Pending)]
    [InlineData(RequestStatus.Accepted, ApprovalState.Approved)]
    [InlineData(RequestStatus.Rejected, ApprovalState.Rejected)]
    public void IdeaApprovalFollowsItsStatus(RequestStatus status, ApprovalState expected)
    {
        Assert.Equal(expected, ApprovalStates.Of(status));
    }

    [Theory]
    [InlineData(SolutionStatus.AwaitingApproval, ApprovalState.Pending)]
    [InlineData(SolutionStatus.Published, ApprovalState.Approved)]
    [InlineData(SolutionStatus.Retired, ApprovalState.Approved)]
    [InlineData(SolutionStatus.Rejected, ApprovalState.Rejected)]
    public void SolutionApprovalFollowsItsStatus(SolutionStatus status, ApprovalState expected)
    {
        Assert.Equal(expected, ApprovalStates.Of(status));
    }

    [Theory]
    [InlineData(Role.Submitter, false)]
    [InlineData(Role.Approver, true)]
    [InlineData(Role.Administrator, true)]
    public void OnlyGovernanceRolesReview(Role role, bool expected)
    {
        Assert.Equal(expected, ApprovalStates.CanReview(role));
    }
}

public class ApprovalGateTests
{
    [Fact]
    public void PendingItemsAreHiddenFromOrdinaryUsers()
    {
        Assert.False(ItemVisibilityRules.CanSee(
            ItemVisibility.Everyone, ApprovalState.Pending, Role.Submitter, isOwner: false));
    }

    [Fact]
    public void PendingItemsStayVisibleToWhoeverSharedThem()
    {
        // Otherwise you could not track your own submission.
        Assert.True(ItemVisibilityRules.CanSee(
            ItemVisibility.Everyone, ApprovalState.Pending, Role.Submitter, isOwner: true));
    }

    [Theory]
    [InlineData(Role.Approver)]
    [InlineData(Role.Administrator)]
    public void PendingItemsAreVisibleToReviewers(Role role)
    {
        Assert.True(ItemVisibilityRules.CanSee(
            ItemVisibility.Everyone, ApprovalState.Pending, role, isOwner: false));
    }

    [Fact]
    public void RejectedItemsAreHiddenFromOrdinaryUsers()
    {
        Assert.False(ItemVisibilityRules.CanSee(
            ItemVisibility.Everyone, ApprovalState.Rejected, Role.Submitter, isOwner: false));
    }

    [Fact]
    public void ApprovedItemsFollowTheirVisibility()
    {
        Assert.True(ItemVisibilityRules.CanSee(
            ItemVisibility.Everyone, ApprovalState.Approved, Role.Submitter, isOwner: false));
        Assert.False(ItemVisibilityRules.CanSee(
            ItemVisibility.Approvers, ApprovalState.Approved, Role.Submitter, isOwner: false));
    }

    [Fact]
    public void HiddenBeatsApproval()
    {
        // Approving something does not un-hide it.
        Assert.False(ItemVisibilityRules.CanSee(
            ItemVisibility.Hidden, ApprovalState.Approved, Role.Approver, isOwner: false));
        Assert.True(ItemVisibilityRules.CanSee(
            ItemVisibility.Hidden, ApprovalState.Approved, Role.Administrator, isOwner: false));
    }
}
