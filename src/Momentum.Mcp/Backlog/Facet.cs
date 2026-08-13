using Momentum.Library.Domain.Engagement;

namespace Momentum.Mcp.Backlog;

/// <summary>
/// The two things this domain has: a need somebody raised, and something reusable that
/// answers one.
/// </summary>
/// <remarks>
/// The facet is the whole of the tool surface's type vocabulary. An agent asks for an
/// idea or a solution; it never names a work item type, an entity set, or a choice value.
/// Everything below is the translation, kept in one place so the three stores' spellings
/// of the same concept cannot drift apart:
/// <list type="bullet">
///   <item>Azure DevOps spells an idea <c>Idea</c>.</item>
///   <item>Dataverse target keys spell it <c>request:</c>, because the domain type is
///   <see cref="HubItemType.Request"/> and <see cref="HubItemReference.TargetKey"/> is
///   the canonical form both hosts write.</item>
/// </list>
/// That mismatch — "idea" outside, "request" in the key — is exactly the kind of thing a
/// tool should absorb rather than expose.
/// </remarks>
public enum Facet
{
    Idea,
    Solution,
}

public static class Facets
{
    public const string Idea = "idea";
    public const string Solution = "solution";

    /// <summary>Spelled out in every tool description, so the model does not guess.</summary>
    public const string Allowed = $"\"{Idea}\" or \"{Solution}\"";

    /// <summary>
    /// Parses the facet argument, or explains what it should have been.
    /// </summary>
    /// <remarks>
    /// Returns the message rather than throwing: an unusable argument is a successful
    /// answer to a badly formed question, and a model can correct a sentence far more
    /// reliably than it can a stack trace.
    /// </remarks>
    public static bool TryParse(string? value, out Facet facet, out string error)
    {
        switch (value?.Trim().ToLowerInvariant())
        {
            case Idea:
                facet = Facet.Idea;
                error = string.Empty;
                return true;
            case Solution:
                facet = Facet.Solution;
                error = string.Empty;
                return true;
            default:
                facet = Facet.Idea;
                error = string.IsNullOrWhiteSpace(value)
                    ? $"A facet is required. Pass {Allowed}."
                    : $"Unknown facet '{value}'. Pass {Allowed}.";
                return false;
        }
    }

    public static string Name(this Facet facet) => facet == Facet.Idea ? Idea : Solution;

    /// <summary>The Azure DevOps work item type this facet is stored as.</summary>
    public static string WorkItemType(this Facet facet) =>
        facet == Facet.Idea ? WorkItems.IdeaType : WorkItems.SolutionType;

    /// <summary>
    /// The Dataverse engagement key: <c>request:123</c> or <c>solution:123</c>. Every
    /// engagement row — vote, participation, rollup — is filed under this string.
    /// </summary>
    public static string TargetKey(this Facet facet, string id) =>
        new HubItemReference(
            facet == Facet.Idea ? HubItemType.Request : HubItemType.Solution,
            id).TargetKey;
}
