using Microsoft.Azure.Functions.Worker.Extensions.Mcp;

namespace Momentum.Mcp.Auth;

/// <summary>
/// The caller, as far as a tool invocation can see them: the bearer token the MCP
/// client presented to this server, if any.
/// </summary>
/// <remarks>
/// Passed explicitly rather than held in ambient state. A tool already receives its
/// <see cref="ToolInvocationContext"/>, so threading the caller through costs one
/// argument and buys the guarantee that nothing acquires a downstream token without a
/// caller in hand.
/// </remarks>
/// <param name="InboundToken">
/// The raw bearer token from the inbound <c>Authorization</c> header. Null when the
/// server is running without the identity layer — local development, or a deployment
/// gated only by the <c>mcp_extension</c> system key.
/// <para>
/// This token is an assertion used to *request* downstream tokens. It is never sent to
/// Dataverse or Azure DevOps: its audience is this server, and forwarding it is a known
/// vulnerability pattern.
/// </para>
/// </param>
/// <param name="SessionId">MCP session id, for correlating logs across a conversation.</param>
public readonly record struct CallerContext(string? InboundToken, string? SessionId)
{
    private const string BearerPrefix = "Bearer ";

    public bool HasInboundToken => !string.IsNullOrEmpty(InboundToken);

    /// <summary>
    /// Reads the caller out of a tool invocation. The MCP extension surfaces the
    /// original request headers on the HTTP transport, which is the only place the
    /// inbound token is reachable — MCP tool calls do not pass through the worker's
    /// ASP.NET Core pipeline, so there is no HttpContext to ask.
    /// </summary>
    public static CallerContext From(ToolInvocationContext context)
    {
        string? token = null;

        // transport is not annotated [NotNullWhen(true)], hence the ?. rather than a bang.
        if (context.TryGetHttpTransport(out var transport) && transport?.Headers is { Count: > 0 } headers)
        {
            // Header casing is not guaranteed across transports and the dictionary is
            // built with the default (ordinal, case-sensitive) comparer.
            var authorization = headers
                .FirstOrDefault(h => string.Equals(h.Key, "Authorization", StringComparison.OrdinalIgnoreCase))
                .Value;

            if (!string.IsNullOrWhiteSpace(authorization) &&
                authorization.StartsWith(BearerPrefix, StringComparison.OrdinalIgnoreCase))
            {
                token = authorization[BearerPrefix.Length..].Trim();
            }
        }

        return new CallerContext(token, context.SessionId);
    }
}
