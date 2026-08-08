using Momentum.Library.Domain.Engagement;

namespace Momentum.Tests.Domain;

public class HubItemReferenceTests
{
    [Fact]
    public void TargetKey_ForRequest_IsRequestPrefixed()
    {
        var reference = HubItemReference.ForRequest("abc123");
        Assert.Equal("request:abc123", reference.TargetKey);
        Assert.Equal(HubItemType.Request, reference.ItemType);
    }

    [Fact]
    public void TargetKey_ForSolution_IsSolutionPrefixed()
    {
        var reference = HubItemReference.ForSolution("xyz789");
        Assert.Equal("solution:xyz789", reference.TargetKey);
        Assert.Equal(HubItemType.Solution, reference.ItemType);
    }

    [Theory]
    [InlineData("request:abc123", HubItemType.Request, "abc123")]
    [InlineData("solution:xyz789", HubItemType.Solution, "xyz789")]
    public void Parse_RoundTripsTargetKey(string key, HubItemType expectedType, string expectedId)
    {
        var reference = HubItemReference.Parse(key);
        Assert.Equal(expectedType, reference.ItemType);
        Assert.Equal(expectedId, reference.ItemId);
        Assert.Equal(key, reference.TargetKey);
    }

    [Theory]
    [InlineData("")]
    [InlineData("request")]
    [InlineData("request:")]
    [InlineData(":itemid")]
    [InlineData("unknown:itemid")]
    public void Parse_RejectsMalformedKeys(string key)
    {
        Assert.Throws<ArgumentException>(() => HubItemReference.Parse(key));
    }
}
