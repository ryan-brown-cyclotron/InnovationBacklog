using System.Security.Claims;

namespace Momentum.Service.Auth;

public sealed class McpAuthMiddleware
{
    private readonly RequestDelegate _next;
    private readonly JwtValidator _jwtValidator;
    private readonly AuthConfig _authConfig;
    private readonly ILogger<McpAuthMiddleware> _logger;

    public McpAuthMiddleware(
        RequestDelegate next,
        JwtValidator jwtValidator,
        AuthConfig authConfig,
        ILogger<McpAuthMiddleware> logger)
    {
        _next = next;
        _jwtValidator = jwtValidator;
        _authConfig = authConfig;
        _logger = logger;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        if (_authConfig.Mode == AuthMode.None)
        {
            SetUser(context, "dev@localhost", "dev@localhost", "Dev User", "administrator");
            await _next(context);
            return;
        }

        var authHeader = context.Request.Headers.Authorization.FirstOrDefault();
        var token = authHeader?.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase) == true
            ? authHeader[7..]
            : null;

        if (string.IsNullOrEmpty(token))
        {
            SendChallenge(context);
            return;
        }

        try
        {
            var validated = await _jwtValidator.ValidateAsync(token, _authConfig, context.RequestAborted);
            SetUser(context, validated.Sub, validated.Email, validated.DisplayName, ResolveRole(validated));
            _logger.LogInformation("Bearer -> sub={Sub} email={Email} display={DisplayName}", validated.Sub, validated.Email, validated.DisplayName);
            await _next(context);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Token validation failed.");
            SendChallenge(context);
        }
    }

    private static string ResolveRole(ValidatedToken token)
    {
        return token.Jwt.Claims.FirstOrDefault(claim =>
                claim.Type is "momentum-role" or "roles" || claim.Type == ClaimTypes.Role)?.Value
            ?? "submitter";
    }

    private static void SetUser(HttpContext context, string subject, string email, string? displayName, string role)
    {
        var claims = new[]
        {
            new Claim(ClaimTypes.NameIdentifier, subject),
            new Claim(ClaimTypes.Email, email),
            new Claim("displayName", displayName ?? email),
            new Claim(ClaimTypes.Role, role),
            new Claim("momentum-role", role),
        };

        context.User = new ClaimsPrincipal(new ClaimsIdentity(claims, "Bearer"));
    }

    private static void SendChallenge(HttpContext context)
    {
        var proto = context.Request.Headers["X-Forwarded-Proto"].FirstOrDefault() ?? context.Request.Scheme;
        var host = context.Request.Headers["X-Forwarded-Host"].FirstOrDefault() ?? context.Request.Host.ToString();
        var path = context.Request.Path.ToString().TrimStart('/');
        var metadataUrl = string.IsNullOrEmpty(path)
            ? $"{proto}://{host}/.well-known/oauth-protected-resource"
            : $"{proto}://{host}/.well-known/oauth-protected-resource/{path}";

        context.Response.StatusCode = StatusCodes.Status401Unauthorized;
        context.Response.Headers.WWWAuthenticate = $"Bearer resource_metadata=\"{metadataUrl}\"";
        context.Response.WriteAsJsonAsync(new { error = "unauthorized" });
    }
}

public static class McpAuthMiddlewareExtensions
{
    public static IApplicationBuilder UseMcpAuth(this IApplicationBuilder app)
    {
        return app.UseMiddleware<McpAuthMiddleware>();
    }
}
