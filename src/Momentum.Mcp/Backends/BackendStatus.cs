using System.Text.Json.Serialization;
using Momentum.Mcp.Auth;

namespace Momentum.Mcp.Backends;

/// <summary>
/// Whether one backend answered, and if not, why.
/// </summary>
/// <remarks>
/// Every tool carries one of these per backend it touched rather than failing whole.
/// The two grants are independent — a caller with a Dataverse security role but no
/// Azure DevOps project membership succeeds against one and gets a 403 from the other —
/// so a tool that throws on the first failure discards data the caller is entitled to.
/// <para>
/// <see cref="Detail"/> is written for a model to read and act on, which is why the
/// failure text carries the backend's own error body: "VS403318: … has not accepted the
/// invitation" tells the caller what to do, and "401" does not.
/// </para>
/// </remarks>
public sealed record BackendStatus(
    [property: JsonPropertyName("backend")] string Backend,
    [property: JsonPropertyName("reachable")] bool Reachable,
    [property: JsonPropertyName("detail")] string? Detail)
{
    public static BackendStatus Ok(DownstreamResource resource, string? detail = null) =>
        new(resource.ToString(), true, detail);

    public static BackendStatus Failed(DownstreamResource resource, string detail) =>
        new(resource.ToString(), false, detail);

    /// <summary>Not consulted at all — the facet does not reach this backend.</summary>
    public static BackendStatus NotQueried(DownstreamResource resource, string why) =>
        new(resource.ToString(), false, why);
}
