namespace Momentum.Library.Domain.Engagement;

using Momentum.Library.Domain.Identity;

public enum HubItemType
{
    Request,
    Solution
}

public sealed record HubItemReference(HubItemType ItemType, string ItemId)
{
    public string TargetKey =>
        $"{(ItemType == HubItemType.Request ? "request" : "solution")}:{ItemId}";

    public static HubItemReference ForRequest(string itemId) => new(HubItemType.Request, itemId);
    public static HubItemReference ForSolution(string itemId) => new(HubItemType.Solution, itemId);

    public static HubItemReference Parse(string targetKey)
    {
        var separator = targetKey.IndexOf(':');
        if (separator <= 0 || separator == targetKey.Length - 1)
            throw new ArgumentException("Target key must be of the form 'request:{id}' or 'solution:{id}'.", nameof(targetKey));
        var prefix = targetKey[..separator];
        var itemId = targetKey[(separator + 1)..];
        var type = prefix switch
        {
            "request" => HubItemType.Request,
            "solution" => HubItemType.Solution,
            _ => throw new ArgumentException("Target key prefix must be 'request' or 'solution'.", nameof(targetKey)),
        };
        return new HubItemReference(type, itemId);
    }
}
