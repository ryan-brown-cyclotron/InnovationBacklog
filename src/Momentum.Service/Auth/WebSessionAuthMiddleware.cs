using System.Security.Claims;

namespace Momentum.Service.Auth;

public sealed class WebSessionAuthMiddleware
{
    private readonly RequestDelegate _next;

    public WebSessionAuthMiddleware(RequestDelegate next)
    {
        _next = next;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        if (context.User.Identity?.IsAuthenticated != true)
        {
            var token = context.Request.Cookies[WebAuthEndpoints.SessionCookie];
            if (!string.IsNullOrWhiteSpace(token))
            {
                var secret = Environment.GetEnvironmentVariable("MOMENTUM_SESSION_SECRET") ?? "dev-secret-change-me";
                var session = WebAuthEndpoints.VerifySessionToken(token, secret);
                if (session is not null)
                {
                    var claims = new[]
                    {
                        new Claim(ClaimTypes.NameIdentifier, session.User.Sub),
                        new Claim(ClaimTypes.Email, session.User.Email),
                        new Claim("displayName", session.User.DisplayName),
                        new Claim(ClaimTypes.Role, session.Role),
                        new Claim("momentum-role", session.Role)
                    };
                    context.User = new ClaimsPrincipal(new ClaimsIdentity(claims, "Momentum.Session"));
                }
            }
        }

        await _next(context);
    }
}

public static class WebSessionAuthMiddlewareExtensions
{
    public static IApplicationBuilder UseWebSessionAuth(this IApplicationBuilder app)
    {
        return app.UseMiddleware<WebSessionAuthMiddleware>();
    }
}