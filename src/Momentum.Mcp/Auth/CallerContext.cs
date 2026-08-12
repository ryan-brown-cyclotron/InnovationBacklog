using Microsoft.Azure.Functions.Worker.Extensions.Mcp;

namespace Momentum.Mcp.Auth;

/// <summary>
/// The caller, as far as this server can see them: the bearer token they presented, if
/// any.
/// </summary>
/// <remarks>
/// Serves both trigger types in this app, which reach the caller by different routes. An
/// MCP tool call never touches the ASP.NET Core pipeline, so its token comes off the
/// invocation context; an HTTP-triggered skill endpoint has an ordinary request and reads
/// the header directly. Same value either way.
/// <para>
/// For tools it is threaded explicitly rather than held in ambient state, which buys the
/// guarantee that nothing acquires a downstream token without a caller in hand.
/// </para>
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

    /// <summary>
    /// Reads the caller from an HTTP <c>Authorization</c> header, for the skill intake
    /// endpoints.
    /// </summary>
    public static CallerContext FromAuthorizationHeader(string? authorization, string? correlationId = null)
    {
        if (string.IsNullOrWhiteSpace(authorization) ||
            !authorization.StartsWith(BearerPrefix, StringComparison.OrdinalIgnoreCase))
        {
            return new CallerContext(null, correlationId);
        }

        return new CallerContext(authorization[BearerPrefix.Length..].Trim(), correlationId);
    }
}

/// <summary>
/// Per-invocation holder for the caller, so a <see cref="DelegatingHandler"/> can attach
/// the right token without every call site threading it.
/// </summary>
/// <remarks>
/// Scoped, and set once at the top of a request. Used only by the HTTP-triggered skill
/// endpoints — MCP tools pass <see cref="CallerContext"/> explicitly, because a tool
/// hands its own client to the code that needs it.
/// </remarks>
public sealed class CallerContextAccessor
{
    public CallerContext Current { get; private set; }

    public void Set(CallerContext caller) => Current = caller;
}
