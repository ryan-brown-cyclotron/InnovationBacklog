using Momentum.Library.Domain.Identity;
using Momentum.Library.Domain.Visibility;

namespace Momentum.Tests.Domain;

public class ItemVisibilityRulesTests
{
    [Theory]
    [InlineData(Role.Submitter)]
    [InlineData(Role.Approver)]
    [InlineData(Role.Administrator)]
    public void Everyone_IsVisibleToEveryRole(Role role)
    {
        Assert.True(ItemVisibilityRules.CanSee(ItemVisibility.Everyone, role, isOwner: false));
    }

    [Fact]
    public void Approvers_HidesFromOrdinarySubmitters()
    {
        Assert.False(ItemVisibilityRules.CanSee(ItemVisibility.Approvers, Role.Submitter, isOwner: false));
    }

    [Fact]
    public void Approvers_StaysVisibleToWhoeverSharedIt()
    {
        Assert.True(ItemVisibilityRules.CanSee(ItemVisibility.Approvers, Role.Submitter, isOwner: true));
    }

    [Theory]
    [InlineData(Role.Approver)]
    [InlineData(Role.Administrator)]
    public void Approvers_IsVisibleToGovernance(Role role)
    {
        Assert.True(ItemVisibilityRules.CanSee(ItemVisibility.Approvers, role, isOwner: false));
    }

    [Theory]
    [InlineData(Role.Submitter, false)]
    [InlineData(Role.Approver, false)]
    [InlineData(Role.Administrator, true)]
    public void Hidden_IsAdministratorsOnly(Role role, bool expected)
    {
        Assert.Equal(expected, ItemVisibilityRules.CanSee(ItemVisibility.Hidden, role, isOwner: false));
    }

    [Fact]
    public void Hidden_HidesEvenFromWhoeverSharedIt()
    {
        // Hiding is an administrative act; the author must not be able to see
        // around it just because it is theirs.
        Assert.False(ItemVisibilityRules.CanSee(ItemVisibility.Hidden, Role.Submitter, isOwner: true));
    }

    [Theory]
    [InlineData(Role.Submitter, false)]
    [InlineData(Role.Approver, false)]
    [InlineData(Role.Administrator, true)]
    public void OnlyAdministratorsCanChangeVisibility(Role role, bool expected)
    {
        Assert.Equal(expected, ItemVisibilityRules.CanChange(role));
    }
}
