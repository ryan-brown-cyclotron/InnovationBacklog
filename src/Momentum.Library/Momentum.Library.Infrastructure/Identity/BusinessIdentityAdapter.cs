using System.Security.Claims;
using Momentum.Library.Application.Ports;
using Momentum.Library.Domain.Identity;

namespace Momentum.Library.Infrastructure.Identity;

public sealed class BusinessIdentityAdapter : IIdentityProvider
{
    private readonly Func<ClaimsPrincipal> _principalFactory;

    public BusinessIdentityAdapter(Func<ClaimsPrincipal> principalFactory)
    {
        _principalFactory = principalFactory;
    }

    public Task<UserId> GetCurrentUserId()
    {
        var principal = _principalFactory();
        var id = principal.FindFirst(ClaimTypes.NameIdentifier)?.Value
            ?? principal.FindFirst("sub")?.Value
            ?? "anonymous";
        return Task.FromResult(new UserId(id));
    }

    public Task<Role> GetCurrentUserRole()
    {
        var principal = _principalFactory();
        var roleClaim = principal.FindFirst(ClaimTypes.Role)?.Value
            ?? principal.FindFirst("momentum-role")?.Value;
        var role = roleClaim?.ToLowerInvariant() switch
        {
            "approver" => Role.Approver,
            "administrator" or "admin" => Role.Administrator,
            _ => Role.Submitter
        };
        return Task.FromResult(role);
    }
}
