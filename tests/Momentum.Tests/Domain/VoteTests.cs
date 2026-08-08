using Momentum.Library.Domain.Engagement;
using Momentum.Library.Domain.Identity;

namespace Momentum.Tests.Domain;

public class VoteTests
{
    [Fact]
    public void Vote_GeneratesIdAndTimestamp_WhenDefaultConstructed()
    {
        var vote = new Vote
        {
            Target = HubItemReference.ForRequest("item1"),
            UserId = new UserId("user@org"),
        };

        Assert.False(string.IsNullOrEmpty(vote.Id));
        Assert.Equal("request:item1", vote.Target.TargetKey);
        Assert.Equal("user@org", vote.UserId.Value);
        Assert.True(vote.CreatedAt <= DateTimeOffset.UtcNow);
    }

    [Fact]
    public void Vote_WithSameUserAndTarget_AreDistinctRecords()
    {
        var target = HubItemReference.ForSolution("solution1");
        var userId = new UserId("dev@localhost");

        var vote1 = new Vote { Target = target, UserId = userId };
        var vote2 = new Vote { Target = target, UserId = userId };

        Assert.NotEqual(vote1.Id, vote2.Id);
    }
}
