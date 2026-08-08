using Momentum.Library.Domain.Engagement;
using Momentum.Library.Domain.Identity;

namespace Momentum.Tests.Domain;

public class SolutionUseTests
{
    [Fact]
    public void SolutionUse_GeneratesIdAndTimestamps_WhenDefaultConstructed()
    {
        var use = new SolutionUse
        {
            SolutionId = "sol1",
            StartedBy = new UserId("dev@org"),
            ProjectName = "Portal refresh"
        };

        Assert.False(string.IsNullOrEmpty(use.Id));
        Assert.Equal(SolutionUseStatus.Exploring, use.Status);
        Assert.Equal("sol1", use.SolutionId);
        Assert.True(use.StartedAt <= DateTimeOffset.UtcNow);
        Assert.Null(use.CompletedAt);
        Assert.True(use.IsActive);
    }

    [Fact]
    public void SolutionUse_IsActive_True_Only_For_ActiveStatuses()
    {
        var active = new SolutionUse
        {
            SolutionId = "sol1",
            StartedBy = new UserId("dev@org"),
            ProjectName = "X",
            Status = SolutionUseStatus.Implementing
        };
        var using1 = active with { Status = SolutionUseStatus.Using, CompletedAt = DateTimeOffset.UtcNow };

        Assert.True(active.IsActive);
        Assert.False(using1.IsActive);
    }

    [Fact]
    public void SolutionUse_DefaultsProjectNameAndTeam()
    {
        var use = new SolutionUse { SolutionId = "s", StartedBy = new UserId("u") };
        Assert.Equal(string.Empty, use.ProjectName);
        Assert.Null(use.Team);
    }
}
